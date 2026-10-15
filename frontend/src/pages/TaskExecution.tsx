import { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useAlarms } from '@/hooks/use-alarms';
import { AlarmSession, TaskType } from '@/types/alarm';
import { TASK_LABELS, TASK_ICONS } from '@/types/alarm';

type Phase = 'ringing' | 'task' | 'interrupted' | 'completed';

const SHAKE_THRESHOLD = 15; // m/s² delta

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

  const startTimeRef = useRef<number>(Date.now());
  const progressRef = useRef(0);
  const interruptTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const progressTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const elapsedTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const lastAccelRef = useRef<{ x: number; y: number; z: number } | null>(null);
  const motionActiveRef = useRef(false);
  const phaseRef = useRef<Phase>('ringing');

  const taskType: TaskType = alarm?.config.taskType ?? 'shake';
  const targetDuration = alarm?.config.duration ?? 30;
  const interruptTolerance = alarm?.config.interruptTolerance ?? 3;

  // Sync refs
  useEffect(() => { phaseRef.current = phase; }, [phase]);
  useEffect(() => { motionActiveRef.current = motionActive; }, [motionActive]);

  const completeTask = useCallback(() => {
    if (progressTimerRef.current) clearInterval(progressTimerRef.current);
    if (elapsedTimerRef.current) clearInterval(elapsedTimerRef.current);
    if (interruptTimerRef.current) clearTimeout(interruptTimerRef.current);
    setPhase('completed');
    phaseRef.current = 'completed';
    const session: AlarmSession = {
      alarmId: id ?? '',
      startedAt: startTimeRef.current,
      completedAt: Date.now(),
      interruptCount,
      taskType,
      difficulty: alarm?.config.difficulty ?? 'easy',
      success: true,
    };
    addSession(session);
  }, [id, interruptCount, taskType, alarm, addSession]);

  // Store startProgressTimer in a ref so it can be called before its useCallback declaration
  const startProgressTimerRef = useRef<() => void>(() => {});

  const triggerInterrupt = useCallback(() => {
    if (phaseRef.current !== 'task') return;
    setPhase('interrupted');
    phaseRef.current = 'interrupted';
    setInterruptCount(c => c + 1);
    setVolumeLevel(v => Math.min(v + 0.2, 2));
    progressRef.current = 0;
    setProgress(0);
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

  const startProgressTimer = useCallback(() => {
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

  // Motion detection via DeviceMotion
  useEffect(() => {
    if (phase !== 'task') return;

    const handleMotion = (e: DeviceMotionEvent) => {
      if (phaseRef.current !== 'task') return;
      const acc = e.accelerationIncludingGravity;
      if (!acc) return;
      const { x = 0, y = 0, z = 0 } = acc;
      const last = lastAccelRef.current;
      if (last) {
        const delta = Math.sqrt(
          Math.pow((x ?? 0) - last.x, 2) +
          Math.pow((y ?? 0) - last.y, 2) +
          Math.pow((z ?? 0) - last.z, 2)
        );
        const isActive = delta > SHAKE_THRESHOLD;
        setMotionActive(isActive);
        motionActiveRef.current = isActive;
        if (isActive) {
          if (interruptTimerRef.current) clearTimeout(interruptTimerRef.current);
          startInterruptTimer();
        }
      }
      lastAccelRef.current = { x: x ?? 0, y: y ?? 0, z: z ?? 0 };
    };

    window.addEventListener('devicemotion', handleMotion);
    startInterruptTimer();
    return () => window.removeEventListener('devicemotion', handleMotion);
  }, [phase, startInterruptTimer]);

  // Simulate motion for desktop (no DeviceMotion)
  useEffect(() => {
    if (phase !== 'task') return;
    const handleClick = () => {
      if (phaseRef.current !== 'task') return;
      setMotionActive(true);
      motionActiveRef.current = true;
      if (interruptTimerRef.current) clearTimeout(interruptTimerRef.current);
      startInterruptTimer();
      setTimeout(() => {
        setMotionActive(false);
        motionActiveRef.current = false;
      }, 300);
    };
    window.addEventListener('click', handleClick);
    window.addEventListener('touchstart', handleClick);
    return () => {
      window.removeEventListener('click', handleClick);
      window.removeEventListener('touchstart', handleClick);
    };
  }, [phase, startInterruptTimer]);

  // Start task
  const startTask = () => {
    setPhase('task');
    phaseRef.current = 'task';
    startTimeRef.current = Date.now();
    startProgressTimer();
    elapsedTimerRef.current = setInterval(() => {
      setElapsedSec(s => s + 1);
    }, 1000);
    startInterruptTimer();
  };

  // Cleanup
  useEffect(() => {
    return () => {
      if (progressTimerRef.current) clearInterval(progressTimerRef.current);
      if (elapsedTimerRef.current) clearInterval(elapsedTimerRef.current);
      if (interruptTimerRef.current) clearTimeout(interruptTimerRef.current);
    };
  }, []);

  if (!alarm) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center">
          <p className="text-muted-foreground">闹钟不存在</p>
          <button onClick={() => navigate('/')} className="mt-4 text-primary underline">返回</button>
        </div>
      </div>
    );
  }

  const timeStr = `${String(alarm.hour).padStart(2, '0')}:${String(alarm.minute).padStart(2, '0')}`;

  // COMPLETED
  if (phase === 'completed') {
    const totalSec = Math.round((Date.now() - startTimeRef.current) / 1000);
    return (
      <div className="min-h-screen bg-background flex flex-col items-center justify-center px-6 text-center gap-6">
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
      <div className="min-h-screen bg-background flex flex-col items-center justify-center px-6 text-center gap-8">
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
          <p className="text-xs text-muted-foreground mt-1">持续 {targetDuration} 秒</p>
        </div>
        <button
          onClick={startTask}
          className="w-full max-w-xs py-4 rounded-2xl bg-primary text-primary-foreground font-bold text-lg shadow-lg active:scale-95 transition-transform"
        >
          开始任务
        </button>
      </div>
    );
  }

  // INTERRUPTED
  if (phase === 'interrupted') {
    return (
      <div className="min-h-screen bg-red-950 flex flex-col items-center justify-center px-6 text-center gap-6">
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

  return (
    <div className="min-h-screen bg-background flex flex-col items-center justify-between px-6 py-10">
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
          </p>
        </div>
      </div>

      {/* Progress */}
      <div className="w-full max-w-xs space-y-2">
        <div className="flex justify-between text-xs text-muted-foreground">
          <span>进度</span>
          <span>{Math.round(progress)}%</span>
        </div>
        <div className="w-full h-4 bg-muted rounded-full overflow-hidden">
          <div
            className={`h-full rounded-full transition-all duration-100 ${progressColor}`}
            style={{ width: `${progress}%` }}
          />
        </div>
        <p className="text-center text-xs text-muted-foreground">
          {taskType === 'shake' ? '持续摇晃手机（或点击屏幕模拟）' : '保持动作不要停止'}
        </p>
      </div>
    </div>
  );
}
