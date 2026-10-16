import { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useAlarms } from '@/hooks/use-alarms';
import { useWakeLock } from '@/hooks/use-wake-lock';
import { AlarmSession, TaskType, DEFAULT_CONFIG, formatClock } from '@/types/alarm';
import { TASK_LABELS, TASK_ICONS } from '@/types/alarm';
import { getAlarmSound } from '@/lib/alarm-sound';
import { endRing, getActiveRing } from '@/lib/active-ring';
import { SNOOZE_MINUTES, boostMultiplier, scheduleSnooze } from '@/lib/snooze';
import {
  enterTaskFullscreen,
  exitTaskFullscreen,
  lockPortrait,
  unlockOrientation,
} from '@/lib/fullscreen';
import { toast } from 'sonner';
import {
  accelerationDelta,
  isDeviceMotionSupported,
  readAcceleration,
  requestMotionAccess,
  thresholdForSensitivity,
  vibrate,
} from '@/lib/motion';
import { STEP_THRESHOLDS, StepCounter, magnitude } from '@/lib/step-counter';
import {
  effectiveInterruptTolerance,
  effectiveShakeThreshold,
  effectiveStepThreshold,
} from '@/lib/difficulty';

type Phase = 'ringing' | 'task' | 'interrupted' | 'completed';

/**
 * How long to wait for a real accelerometer sample before falling back to
 * tap-to-simulate. Desktop browsers never fire `devicemotion`, so without this
 * the demo would be untestable there — but on a phone the fallback stays off,
 * which is what stops "tap the screen" from replacing "shake the phone".
 */
const MOTION_PROBE_MS = 1500;

/**
 * How long one above-threshold sample keeps the task counted as "moving".
 *
 * Without this the accelerometer's own jitter decides the pace: samples arrive
 * every ~16 ms but only some of them differ enough to cross the threshold, so
 * a moderate shake would advance the bar far slower than the duration the user
 * configured. The hold makes sustained motion mean what it says, while still
 * going inactive quickly enough for the interrupt timer to fire.
 */
const MOTION_HOLD_MS = 400;

export default function TaskExecution() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { alarms, addSession } = useAlarms();
  const alarm = alarms.find(a => a.id === id);

  const [phase, setPhase] = useState<Phase>('ringing');
  const [progress, setProgress] = useState(0); // 0-100
  const [interruptCount, setInterruptCount] = useState(0);
  const [volumeLevel, setVolumeLevel] = useState(1); // multiplier
  const [elapsedSec, setElapsedSec] = useState(0);
  const [motionActive, setMotionActive] = useState(false);
  const [sirenOn, setSirenOn] = useState(false);
  /** Difficulty carried over from a snooze, shown to the user. */
  const [boostPercent, setBoostPercent] = useState(0);
  /** Steps counted so far, for the `steps` task. */
  const [stepCount, setStepCount] = useState(0);
  /** 'probing' until we know whether a real accelerometer is reporting. */
  const [motionSource, setMotionSource] = useState<'probing' | 'sensor' | 'touch'>('probing');

  const startTimeRef = useRef<number>(Date.now());
  const progressRef = useRef(0);
  const interruptTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const progressTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const elapsedTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const lastAccelRef = useRef<{ x: number; y: number; z: number } | null>(null);
  const motionActiveRef = useRef(false);
  /** Decay timer that keeps motion "active" briefly after the last sample. */
  const motionHoldTimerRef = useRef<number | null>(null);
  const phaseRef = useRef<Phase>('ringing');
  /** Set once a genuine accelerometer sample arrives; disables tap fallback. */
  const sensorLiveRef = useRef(false);
  const thresholdRef = useRef(15);
  const probeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  /** Mirror of `volumeLevel` for callbacks that must not re-create on change. */
  const volumeRef = useRef(1);
  /** Stable handle for the interrupt timer, attached by the one-shot listener. */
  const startInterruptTimerRef = useRef<() => void>(() => {});
  /** Step detector + running total for the `steps` task. */
  const stepCounterRef = useRef(new StepCounter());
  const stepsRef = useRef(0);
  /** Stable handles for callbacks the once-attached motion listener needs. */
  const completeTaskRef = useRef<() => void>(() => {});
  const handleStepRef = useRef<() => void>(() => {});
  const markMotionRef = useRef<() => void>(() => {});
  const stepModeRef = useRef(false);
  const stepTargetRef = useRef(10);

  const soundRef = useRef(getAlarmSound());

  // Every fallback comes from DEFAULT_CONFIG rather than a literal: repeating
  // the numbers here is how the defaults drifted apart in the first place.
  const taskType: TaskType = alarm?.config.taskType ?? DEFAULT_CONFIG.taskType;
  const targetDuration = alarm?.config.duration ?? DEFAULT_CONFIG.duration;
  const isStepTask = taskType === 'steps';
  const stepTarget = alarm?.config.count ?? DEFAULT_CONFIG.count;
  const difficulty = alarm?.config.difficulty ?? DEFAULT_CONFIG.difficulty;
  // The difficulty setting scales how demanding detection is; the slider the
  // user set is the base value, so the two never fight each other.
  const interruptTolerance = effectiveInterruptTolerance(
    alarm?.config.interruptTolerance ?? DEFAULT_CONFIG.interruptTolerance,
    difficulty
  );

  // Sync refs
  useEffect(() => { phaseRef.current = phase; }, [phase]);
  useEffect(() => { motionActiveRef.current = motionActive; }, [motionActive]);
  useEffect(() => {
    const sensitivity = alarm?.config.sensitivity ?? DEFAULT_CONFIG.sensitivity;
    // A snoozed alarm comes back harder: fold the carried boost into both
    // thresholds so the second attempt genuinely costs more.
    const boost = boostMultiplier(getActiveRing()?.boostPercent ?? 0);
    thresholdRef.current =
      effectiveShakeThreshold(
        thresholdForSensitivity(sensitivity),
        alarm?.config.difficulty
      ) * boost;
    // Marching swings the accelerometer by a few m/s², an order of magnitude
    // less than a deliberate shake, so the step detector scales more gently.
    stepCounterRef.current.setThreshold(
      effectiveStepThreshold(
        STEP_THRESHOLDS[sensitivity] ?? STEP_THRESHOLDS.medium,
        alarm?.config.difficulty
      ) * boost
    );
  }, [alarm?.config.sensitivity, alarm?.config.difficulty]);

  useEffect(() => {
    stepModeRef.current = isStepTask;
  }, [isStepTask]);

  useEffect(() => {
    stepTargetRef.current = stepTarget;
  }, [stepTarget]);

  /**
   * Record that the user moved just now. Shared by the shake and the march
   * paths so both advance at the rate the configured duration implies.
   */
  useEffect(() => {
    markMotionRef.current = () => {
      if (!motionActiveRef.current) {
        motionActiveRef.current = true;
        setMotionActive(true);
      }
      if (motionHoldTimerRef.current) window.clearTimeout(motionHoldTimerRef.current);
      motionHoldTimerRef.current = window.setTimeout(() => {
        motionActiveRef.current = false;
        setMotionActive(false);
      }, MOTION_HOLD_MS);

      // Any confirmed motion pushes the interruption deadline back.
      if (interruptTimerRef.current) clearTimeout(interruptTimerRef.current);
      startInterruptTimerRef.current();
    };
  }, []);

  // A snooze boost is fixed for the life of this screen; read it once.
  useEffect(() => {
    setBoostPercent(getActiveRing()?.boostPercent ?? 0);
  }, []);

  // Keep the phone screen on for the whole wake-up flow: an Android device
  // lying on a bed otherwise blanks its screen and throttles our timers.
  useWakeLock(phase !== 'completed' && !!alarm);

  // Suppress scrolling, pinch-zoom, text selection and the long-press menu
  // while the task is in progress — a stray swipe from a half-asleep hand must
  // not scroll the progress bar out of view.
  //
  // Released once the task is finished: `.task-locked` sets `overflow: hidden`
  // on the body, and the completion screen is taller than a small phone's
  // viewport, so keeping it locked would clip the buttons out of reach.
  const taskLocked = phase !== 'completed';
  useEffect(() => {
    if (taskLocked) document.body.classList.add('task-locked');
    else document.body.classList.remove('task-locked');
    return () => document.body.classList.remove('task-locked');
  }, [taskLocked]);

  // --- audio -------------------------------------------------------------
  // The siren must keep sounding until the task is finished, so it lives here
  // rather than inside a single phase.
  const startSiren = useCallback(async () => {
    const sound = soundRef.current;
    const ok = await sound.unlock();
    if (!ok) {
      setSirenOn(false);
      return false;
    }
    sound.setBoost(volumeRef.current);
    sound.start();
    setSirenOn(sound.isRunning);
    return sound.isRunning;
  }, []);

  useEffect(() => {
    // Try immediately: navigating here required a tap, so the browser may
    // already consider the page user-activated.
    void startSiren();
    return () => {
      // While an alarm ring is in force the scheduler owns the siren. Leaving
      // this screen — the Android back gesture, most likely — must not
      // silence the alarm, so only a manual test run stops it here.
      if (!getActiveRing()) soundRef.current.stop();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // --- device motion -----------------------------------------------------
  useEffect(() => {
    if (!isDeviceMotionSupported()) {
      setMotionSource('touch');
      return;
    }

    const handleMotion = (e: DeviceMotionEvent) => {
      const sample = readAcceleration(e);
      if (!sample) return;

      if (!sensorLiveRef.current) {
        sensorLiveRef.current = true;
        setMotionSource('sensor');
        if (probeTimerRef.current) {
          clearTimeout(probeTimerRef.current);
          probeTimerRef.current = null;
        }
      }

      if (phaseRef.current !== 'task') {
        lastAccelRef.current = sample;
        return;
      }

      if (stepModeRef.current) {
        // Marching: advance on each detected step instead of on elapsed time.
        const stamp =
          typeof e.timeStamp === 'number' && e.timeStamp > 0
            ? e.timeStamp
            : performance.now();
        const counted = stepCounterRef.current.push(
          magnitude(sample.x, sample.y, sample.z),
          stamp
        );
        lastAccelRef.current = sample;
        if (counted) handleStepRef.current();
        return;
      }

      const last = lastAccelRef.current;
      lastAccelRef.current = sample;
      if (!last) return;

      if (accelerationDelta(sample, last) > thresholdRef.current) {
        markMotionRef.current();
      }
    };

    window.addEventListener('devicemotion', handleMotion);
    return () => window.removeEventListener('devicemotion', handleMotion);
  }, []);

  const completeTask = useCallback(() => {
    if (progressTimerRef.current) clearInterval(progressTimerRef.current);
    if (elapsedTimerRef.current) clearInterval(elapsedTimerRef.current);
    if (interruptTimerRef.current) clearTimeout(interruptTimerRef.current);
    // Finishing the task is the one legitimate way to end the alarm.
    endRing();
    soundRef.current.stop();
    setSirenOn(false);
    // Hand the browser chrome back: the task is over, the user may want to
    // leave the page.
    unlockOrientation();
    void exitTaskFullscreen();
    vibrate(400);
    setPhase('completed');
    phaseRef.current = 'completed';
    const session: AlarmSession = {
      alarmId: id ?? '',
      startedAt: startTimeRef.current,
      completedAt: Date.now(),
      interruptCount,
      taskType,
      difficulty: alarm?.config.difficulty ?? DEFAULT_CONFIG.difficulty,
      success: true,
    };
    addSession(session);
  }, [id, interruptCount, taskType, alarm, addSession]);

  // The motion listener is attached once, so it would otherwise close over the
  // first render's callbacks. Route them through refs instead.
  useEffect(() => {
    completeTaskRef.current = completeTask;
  }, [completeTask]);

  /**
   * One counted step: refresh progress, treat the step as motion so the
   * interrupt timer stays disarmed, and finish when the target is reached.
   */
  const registerStep = useCallback(() => {
    stepsRef.current += 1;
    setStepCount(stepsRef.current);

    // One shared notion of "moving" for both tasks: a counted step holds the
    // motion window open, which keeps the interrupt timer at bay and lets the
    // progress keep ticking between steps.
    markMotionRef.current();

    const pct = Math.min(
      100,
      (stepsRef.current / Math.max(1, stepTargetRef.current)) * 100
    );
    progressRef.current = pct;
    setProgress(pct);
    if (pct >= 100) completeTaskRef.current();
  }, []);

  useEffect(() => {
    handleStepRef.current = registerStep;
  }, [registerStep]);

  // Store startProgressTimer in a ref so it can be called before its useCallback declaration
  const startProgressTimerRef = useRef<() => void>(() => {});

  const triggerInterrupt = useCallback(() => {
    if (phaseRef.current !== 'task') return;
    setPhase('interrupted');
    phaseRef.current = 'interrupted';
    setInterruptCount(c => c + 1);
    // Computed outside the state updater so the side effect cannot run twice
    // under StrictMode's double-invoked reducers.
    const nextBoost = Math.min(volumeRef.current + 0.2, 2);
    volumeRef.current = nextBoost;
    soundRef.current.setBoost(nextBoost);
    setVolumeLevel(nextBoost);
    // Haptic penalty: felt even with the phone under a pillow.
    vibrate([200, 100, 200]);
    progressRef.current = 0;
    setProgress(0);
    // Interrupting wipes the work done so far, whichever task is running.
    if (stepModeRef.current) {
      stepsRef.current = 0;
      setStepCount(0);
      stepCounterRef.current.reset();
    }
    if (progressTimerRef.current) clearInterval(progressTimerRef.current);
    setTimeout(() => {
      if (phaseRef.current === 'interrupted') {
        setPhase('task');
        phaseRef.current = 'task';
        startProgressTimerRef.current();
      }
    }, 1500);
  }, []);

  const startInterruptTimer = useCallback(() => {
    if (interruptTimerRef.current) clearTimeout(interruptTimerRef.current);
    interruptTimerRef.current = setTimeout(() => {
      if (!motionActiveRef.current && phaseRef.current === 'task') {
        triggerInterrupt();
      }
    }, interruptTolerance * 1000);
  }, [interruptTolerance, triggerInterrupt]);

  // Keep a stable handle for the motion listener, which is attached once.
  useEffect(() => {
    startInterruptTimerRef.current = startInterruptTimer;
  }, [startInterruptTimer]);

  const startProgressTimer = useCallback(() => {
    // Marching advances per detected step, not per tick of the clock.
    if (stepModeRef.current) return;
    if (progressTimerRef.current) clearInterval(progressTimerRef.current);
    progressTimerRef.current = setInterval(() => {
      if (phaseRef.current !== 'task') return;
      if (!motionActiveRef.current) return;
      progressRef.current = Math.min(progressRef.current + (100 / (targetDuration * 10)), 100);
      setProgress(progressRef.current);
      if (progressRef.current >= 100) {
        completeTask();
      }
    }, 100);
  }, [targetDuration, completeTask]);

  // Keep the ref in sync with the latest callback
  useEffect(() => {
    startProgressTimerRef.current = startProgressTimer;
  }, [startProgressTimer]);

  // Tap-to-simulate while the task runs; only reachable when no accelerometer
  // reported during the probe window (i.e. desktop, or a device that denies
  // motion access).
  useEffect(() => {
    if (phase !== 'task' || motionSource !== 'touch') return;
    const handleTap = () => {
      if (phaseRef.current !== 'task') return;
      if (sensorLiveRef.current) return;
      // On a device with no accelerometer one tap stands in for one step.
      if (stepModeRef.current) {
        handleStepRef.current();
        return;
      }
      motionActiveRef.current = true;
      setMotionActive(true);
      if (interruptTimerRef.current) clearTimeout(interruptTimerRef.current);
      startInterruptTimerRef.current();
      setTimeout(() => {
        motionActiveRef.current = false;
        setMotionActive(false);
      }, 300);
    };
    window.addEventListener('click', handleTap);
    window.addEventListener('touchstart', handleTap);
    return () => {
      window.removeEventListener('click', handleTap);
      window.removeEventListener('touchstart', handleTap);
    };
  }, [phase, motionSource]);

  // Start task
  const startTask = useCallback(async () => {
    // Ask for motion access inside the gesture (required on iOS, no-op on
    // Android) and make sure the siren is actually audible.
    const availability = await requestMotionAccess();
    if (availability === 'unsupported' || availability === 'denied') {
      sensorLiveRef.current = false;
      setMotionSource('touch');
    } else {
      setMotionSource('probing');
      if (probeTimerRef.current) clearTimeout(probeTimerRef.current);
      probeTimerRef.current = setTimeout(() => {
        if (!sensorLiveRef.current) setMotionSource('touch');
      }, MOTION_PROBE_MS);
    }

    await startSiren();

    // "全屏锁定" in a browser means hiding the URL bar. This must happen inside
    // the tap gesture — the browser refuses otherwise — and may still be
    // rejected inside an embedded iframe, which is why it is best-effort.
    void enterTaskFullscreen().then(entered => {
      if (entered) void lockPortrait();
    });

    setPhase('task');
    phaseRef.current = 'task';
    startTimeRef.current = Date.now();
    startProgressTimer();
    elapsedTimerRef.current = setInterval(() => {
      setElapsedSec(s => s + 1);
    }, 1000);
    startInterruptTimer();
  }, [startProgressTimer, startInterruptTimer, startSiren]);

  /**
   * Postpone the alarm. Only offered when the alarm opts in, so the default
   * promise — the siren does not stop until the task is done — still holds.
   * The next ring is harder by the configured percentage.
   */
  const handleSnooze = useCallback(() => {
    if (!alarm) return;
    const boost = alarm.config.snoozeDifficultyBoost;
    scheduleSnooze(alarm.id, boost);
    endRing();
    soundRef.current.stop();
    setSirenOn(false);
    toast.success(`已推迟 ${SNOOZE_MINUTES} 分钟，下次难度 +${boost}%`);
    navigate('/');
  }, [alarm, navigate]);

  // Cleanup
  useEffect(() => {
    return () => {
      if (progressTimerRef.current) clearInterval(progressTimerRef.current);
      if (elapsedTimerRef.current) clearInterval(elapsedTimerRef.current);
      if (interruptTimerRef.current) clearTimeout(interruptTimerRef.current);
      if (probeTimerRef.current) clearTimeout(probeTimerRef.current);
      if (motionHoldTimerRef.current) window.clearTimeout(motionHoldTimerRef.current);
      // Never leave the browser stuck in fullscreen after this screen goes.
      unlockOrientation();
      void exitTaskFullscreen();
    };
  }, []);

  if (!alarm) {
    return (
      <div className="min-h-dvh bg-background flex items-center justify-center">
        <div className="text-center">
          <p className="text-muted-foreground">闹钟不存在</p>
          <button onClick={() => navigate('/')} className="mt-4 text-primary underline">返回</button>
        </div>
      </div>
    );
  }

  const timeStr = formatClock(alarm.hour, alarm.minute);

  // COMPLETED
  if (phase === 'completed') {
    const totalSec = Math.round((Date.now() - startTimeRef.current) / 1000);
    return (
      <div className="min-h-dvh bg-background flex flex-col items-center justify-center px-6 text-center gap-6">
        <div className="w-24 h-24 rounded-full bg-green-500/20 flex items-center justify-center animate-bounce">
          <span className="text-5xl">🎉</span>
        </div>
        <div>
          <h1 className="text-3xl font-bold text-green-500">起床成功！</h1>
          <p className="text-muted-foreground mt-2">今天也是元气满满的一天 ☀️</p>
        </div>
        <div className="grid grid-cols-2 gap-4 w-full max-w-xs">
          <div className="bg-card rounded-2xl border border-border p-4">
            <p className="text-xs text-muted-foreground">用时</p>
            <p className="text-2xl font-bold text-foreground mt-1">{totalSec}秒</p>
          </div>
          <div className="bg-card rounded-2xl border border-border p-4">
            <p className="text-xs text-muted-foreground">中断次数</p>
            <p className="text-2xl font-bold text-foreground mt-1">{interruptCount}次</p>
          </div>
        </div>
        <button
          onClick={() => navigate('/stats')}
          className="text-sm text-primary underline"
        >
          查看起床统计
        </button>
        <button
          onClick={() => navigate('/')}
          className="w-full max-w-xs py-3 rounded-2xl bg-primary text-primary-foreground font-semibold text-base"
        >
          返回首页
        </button>
      </div>
    );
  }

  // RINGING
  if (phase === 'ringing') {
    return (
      <div className="min-h-dvh bg-background flex flex-col items-center justify-center px-6 text-center gap-8">
        <div className="relative">
          <div className="w-32 h-32 rounded-full bg-primary/20 flex items-center justify-center animate-pulse">
            <span className="text-6xl">🔔</span>
          </div>
          <div className="absolute inset-0 rounded-full border-4 border-primary/30 animate-ping" />
        </div>
        <div>
          <p className="text-6xl font-bold tabular-nums text-foreground">{timeStr}</p>
          {alarm.label && <p className="text-muted-foreground mt-2">{alarm.label}</p>}
        </div>
        <div className="bg-card rounded-2xl border border-border p-4 w-full max-w-xs">
          <p className="text-xs text-muted-foreground">解锁任务</p>
          <p className="text-lg font-semibold mt-1">
            {TASK_ICONS[taskType]} {TASK_LABELS[taskType]}
          </p>
          <p className="text-xs text-muted-foreground mt-1">
            {isStepTask ? `目标 ${stepTarget} 步` : `持续 ${targetDuration} 秒`}
          </p>
          {boostPercent > 0 && (
            <p className="text-xs text-orange-500 font-semibold mt-2">
              本次难度 +{boostPercent}%（贪睡代价）
            </p>
          )}
        </div>
        {!sirenOn && (
          <button
            onClick={() => void startSiren()}
            className="w-full max-w-xs py-3 rounded-2xl border border-primary text-primary text-sm font-semibold"
          >
            🔊 点击开启铃声
          </button>
        )}
        <button
          onClick={() => void startTask()}
          className="w-full max-w-xs py-4 rounded-2xl bg-primary text-primary-foreground font-bold text-lg shadow-lg active:scale-95 transition-transform"
        >
          开始任务
        </button>
        {alarm.config.snoozeEnabled && (
          <button
            onClick={handleSnooze}
            className="w-full max-w-xs py-3 rounded-2xl border border-border text-muted-foreground text-sm font-medium"
          >
            再睡 {SNOOZE_MINUTES} 分钟（下次难度 +{alarm.config.snoozeDifficultyBoost}%）
          </button>
        )}
      </div>
    );
  }

  // INTERRUPTED
  if (phase === 'interrupted') {
    return (
      <div className="min-h-dvh bg-red-950 flex flex-col items-center justify-center px-6 text-center gap-6">
        <div className="w-24 h-24 rounded-full bg-red-500/30 flex items-center justify-center">
          <span className="text-5xl animate-bounce">⚠️</span>
        </div>
        <h1 className="text-3xl font-bold text-red-400">动作中断！</h1>
        <p className="text-red-300">进度已清零，音量已提升</p>
        <div className="flex items-center gap-2 bg-red-900/50 rounded-xl px-4 py-2">
          <span className="text-red-400">🔊</span>
          <span className="text-red-300 text-sm">音量 +{Math.round((volumeLevel - 1) * 100)}%</span>
        </div>
        <p className="text-red-400/70 text-sm">即将自动恢复...</p>
      </div>
    );
  }

  // TASK
  const progressColor = motionActive ? 'bg-primary' : 'bg-muted-foreground/30';
  const ringColor = motionActive ? 'border-primary' : 'border-muted-foreground/30';
  const taskHint = motionSource === 'touch'
    ? isStepTask
      ? '未检测到传感器，点击屏幕模拟踏步'
      : '未检测到传感器，点击屏幕模拟摇晃'
    : isStepTask
    ? '手持手机原地踏步，一步步累加'
    : '持续摇晃手机，不要停下';

  return (
    <div className="min-h-dvh bg-background flex flex-col items-center justify-between px-6 py-10">
      {/* Top info */}
      <div className="text-center">
        <p className="text-4xl font-bold tabular-nums text-foreground">{timeStr}</p>
        <p className="text-muted-foreground text-sm mt-1">已用时 {elapsedSec}秒</p>
      </div>

      {/* Center animation */}
      <div className="flex flex-col items-center gap-6">
        <div className={`relative w-40 h-40 rounded-full border-4 ${ringColor} flex items-center justify-center transition-all duration-300`}>
          <span className={`text-6xl transition-transform duration-150 ${motionActive ? 'scale-110' : 'scale-100'}`}>
            {TASK_ICONS[taskType]}
          </span>
          {motionActive && (
            <div className="absolute inset-0 rounded-full border-4 border-primary/40 animate-ping" />
          )}
        </div>

        <div className="text-center">
          <h2 className="text-xl font-bold text-foreground">{TASK_LABELS[taskType]}</h2>
          <p className="text-sm text-muted-foreground mt-1">
            {motionActive ? '动作检测中...' : '请保持动作'}
          </p>
          <p className="text-xs text-muted-foreground mt-1">
            中断 {interruptCount} 次 | 音量 +{Math.round((volumeLevel - 1) * 100)}%
            {boostPercent > 0 ? ` | 难度 +${boostPercent}%` : ''}
          </p>
        </div>
      </div>

      {/* Progress */}
      <div className="w-full max-w-xs space-y-2">
        <div className="flex justify-between text-xs text-muted-foreground">
          <span>{isStepTask ? `已踏步 ${stepCount} / ${stepTarget} 步` : '进度'}</span>
          <span>{Math.round(progress)}%</span>
        </div>
        <div className="w-full h-4 bg-muted rounded-full overflow-hidden">
          <div
            className={`h-full rounded-full transition-all duration-100 ${progressColor}`}
            style={{ width: `${progress}%` }}
          />
        </div>
        <p className="text-center text-xs text-muted-foreground">
          {taskHint}
        </p>
      </div>
    </div>
  );
}
