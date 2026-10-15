import { useEffect, useReducer } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  BellRing, ArrowLeft, Play, RotateCcw, Volume2, AlertTriangle,
  CheckCircle2, Smartphone, Lock, Plus, BarChart2,
} from 'lucide-react';
import OmniflowBadge from '@/components/custom/OmniflowBadge';

const TICK_MS = 100;
const TARGET_TICKS = 100; // 演示任务：持续摇晃 10 秒
const TOLERANCE_TICKS = 30; // 中断容忍 3 秒
const WARNING_TICKS = 20; // 警告页停留 2 秒
const START_VOLUME = 60;

type Phase = 'ready' | 'running' | 'warning' | 'done';

interface DemoState {
  phase: Phase;
  progress: number;
  idle: number;
  warn: number;
  elapsed: number;
  holding: boolean;
  interrupts: number;
  volume: number;
}

type DemoAction =
  | { type: 'start' }
  | { type: 'hold'; value: boolean }
  | { type: 'tick' };

const INITIAL_STATE: DemoState = {
  phase: 'ready',
  progress: 0,
  idle: 0,
  warn: 0,
  elapsed: 0,
  holding: false,
  interrupts: 0,
  volume: START_VOLUME,
};

function reducer(state: DemoState, action: DemoAction): DemoState {
  switch (action.type) {
    case 'start':
      return { ...INITIAL_STATE, phase: 'running' };
    case 'hold':
      if (state.phase !== 'running') return { ...state, holding: false };
      return { ...state, holding: action.value, idle: action.value ? 0 : state.idle };
    case 'tick': {
      if (state.phase === 'warning') {
        const warn = state.warn + 1;
        const elapsed = state.elapsed + 1;
        if (warn >= WARNING_TICKS) {
          return { ...state, phase: 'running', warn: 0, idle: 0, elapsed };
        }
        return { ...state, warn, elapsed };
      }
      if (state.phase !== 'running') return state;
      const elapsed = state.elapsed + 1;
      if (state.holding) {
        const progress = state.progress + 1;
        if (progress >= TARGET_TICKS) {
          return { ...state, progress: TARGET_TICKS, idle: 0, elapsed, phase: 'done', holding: false };
        }
        return { ...state, progress, idle: 0, elapsed };
      }
      const idle = state.idle + 1;
      if (idle >= TOLERANCE_TICKS) {
        return {
          ...state,
          phase: 'warning',
          progress: 0,
          idle: 0,
          warn: 0,
          elapsed,
          holding: false,
          interrupts: state.interrupts + 1,
          volume: Math.min(100, state.volume + 20),
        };
      }
      return { ...state, idle, elapsed };
    }
    default:
      return state;
  }
}

const RULES = [
  { code: 'R-01', title: '无关闭按钮', desc: '响铃后界面只展示任务提示与进度，没有关闭或跳过入口。' },
  { code: 'R-03', title: '中断清零', desc: '动作停止超过容忍时限（默认 3 秒），进度立即归零并显示中断警告。' },
  { code: 'R-04', title: '音量惩罚', desc: '每次中断清零，铃声音量自动增大 20%，上限为系统最大音量。' },
  { code: 'R-05', title: '永久响铃', desc: '任务未完成时铃声持续播放，不会自动停止。' },
];

const SCAN_CSS = `
@keyframes demo-scan { 0% { top: -100px; } 100% { top: 100%; } }
.demo-scan-line {
  position: absolute; left: 0; width: 100%; height: 100px;
  background: linear-gradient(to bottom, transparent, oklch(0.64 0.24 27), transparent);
  opacity: 0.25; pointer-events: none;
  animation: demo-scan 2s linear infinite;
}
.demo-glow { box-shadow: 0 0 20px oklch(0.64 0.24 27 / 0.7); }
`;

export default function TaskDemoPreview() {
  const navigate = useNavigate();
  const [state, dispatch] = useReducer(reducer, INITIAL_STATE);
  const { phase, progress, idle, elapsed, holding, interrupts, volume } = state;

  const active = phase === 'running' || phase === 'warning';

  useEffect(() => {
    if (!active) return;
    const timer = window.setInterval(() => dispatch({ type: 'tick' }), TICK_MS);
    return () => window.clearInterval(timer);
  }, [active]);

  const percent = Math.round((progress / TARGET_TICKS) * 100);
  const secondsDone = (progress / 10).toFixed(1);
  const idleLeft = Math.max(0, (TOLERANCE_TICKS - idle) / 10).toFixed(1);
  const elapsedSeconds = (elapsed / 10).toFixed(1);

  let statusLabel = '检测中';
  let statusDot = 'bg-yellow-400';
  if (holding) {
    statusLabel = '动作有效';
    statusDot = 'bg-green-400';
  } else if (phase === 'running' && idle > 0) {
    statusLabel = '动作中断';
    statusDot = 'bg-red-500';
  }

  const handleDown = () => dispatch({ type: 'hold', value: true });
  const handleUp = () => dispatch({ type: 'hold', value: false });

  return (
    <div className="min-h-screen bg-black text-white flex flex-col">
      <style>{SCAN_CSS}</style>
      <header className="sticky top-0 z-20 bg-black/95 backdrop-blur border-b-2 border-zinc-800 px-4 py-3">
        <div className="max-w-4xl mx-auto flex items-center justify-between gap-3">
          <div className="flex items-center gap-2.5 min-w-0">
            <button
              type="button"
              onClick={() => navigate('/')}
              className="cursor-pointer shrink-0 w-11 h-11 flex items-center justify-center border-2 border-zinc-700 hover:border-red-500 hover:text-red-500 transition-colors"
              aria-label="返回首页"
            >
              <ArrowLeft className="w-5 h-5" />
            </button>
            <div className="min-w-0">
              <h1 className="font-black text-white text-base uppercase tracking-tight leading-tight">任务体验预览</h1>
              <p className="text-[11px] text-zinc-400 uppercase tracking-widest leading-tight">模拟全屏锁定与中断惩罚</p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => navigate('/edit/new')}
            className="cursor-pointer shrink-0 min-h-[44px] px-4 inline-flex items-center gap-1.5 bg-red-500 text-black font-black text-sm uppercase tracking-wider hover:bg-red-400 transition-colors"
          >
            <Plus className="w-4 h-4" /> 新增闹钟
          </button>
        </div>
      </header>

      <main className="flex-1 w-full max-w-4xl mx-auto px-4 py-6 grid grid-cols-1 md:grid-cols-2 gap-8 items-start">
        {/* Phone simulator */}
        <section className="flex flex-col items-center gap-3">
          <div className="w-full max-w-[340px] border-4 border-zinc-800 bg-black p-2">
            <div className="relative bg-black text-white overflow-hidden min-h-[560px] flex flex-col border border-zinc-800">
              {(phase === 'ready' || phase === 'running') && <div className="demo-scan-line" />}

              <div className="relative flex items-center justify-between px-5 pt-4 text-[11px] font-bold uppercase tracking-widest text-zinc-400">
                <span className="flex items-center gap-1"><Lock className="w-3 h-3" /> 已锁定</span>
                <span className="flex items-center gap-1"><Volume2 className="w-3 h-3" /> {volume}%</span>
              </div>

              {phase === 'ready' && (
                <div className="relative flex-1 flex flex-col items-center justify-center text-center gap-5 px-6 py-8">
                  <p className="text-[10px] font-bold tracking-[0.3em] text-red-500 uppercase">强制清醒任务待命</p>
                  <p className="text-7xl font-extrabold tracking-tighter">07:00</p>
                  <div className="w-28 h-28 border-4 border-red-500 flex items-center justify-center relative">
                    <BellRing className="w-12 h-12 text-red-500 animate-bounce" />
                    <span className="absolute -top-2 -left-2 w-5 h-5 border-t-4 border-l-4 border-white" />
                    <span className="absolute -bottom-2 -right-2 w-5 h-5 border-b-4 border-r-4 border-white" />
                  </div>
                  <p className="text-xs text-zinc-400 leading-relaxed">
                    持续摇晃 10 秒。按住下方按钮模拟摇晃，松开超过 3 秒即视为动作中断。
                  </p>
                  <button
                    type="button"
                    onClick={() => dispatch({ type: 'start' })}
                    className="cursor-pointer w-full min-h-[52px] inline-flex items-center justify-center gap-2 bg-red-500 text-black font-black uppercase tracking-wider hover:bg-red-400 transition-colors"
                  >
                    <Play className="w-4 h-4" /> 开始体验
                  </button>
                </div>
              )}

              {phase === 'running' && (
                <div className="relative flex-1 flex flex-col px-6 py-5 gap-5">
                  <div className="flex flex-col items-center gap-2">
                    <p className="text-[10px] font-bold tracking-[0.3em] text-red-500 uppercase">正在执行强制清醒任务</p>
                    <p className="text-6xl font-extrabold tracking-tighter">07:00</p>
                    <div className="flex items-center gap-2 px-3 py-1 bg-zinc-900 border border-zinc-800">
                      <span className={`w-2 h-2 rounded-full animate-pulse ${statusDot}`} />
                      <span className="text-[10px] font-bold uppercase tracking-widest">{statusLabel}</span>
                    </div>
                  </div>

                  <div className="flex-1 flex items-center justify-center">
                    <div className={`w-32 h-32 border-4 flex items-center justify-center relative transition-colors ${holding ? 'border-green-400' : 'border-red-500'}`}>
                      <Smartphone className={`w-14 h-14 ${holding ? 'text-green-400 animate-bounce' : 'text-red-500'}`} />
                      <span className="absolute -top-2 -left-2 w-5 h-5 border-t-4 border-l-4 border-white" />
                      <span className="absolute -bottom-2 -right-2 w-5 h-5 border-b-4 border-r-4 border-white" />
                    </div>
                  </div>

                  <div className="space-y-3">
                    <div className="flex justify-between items-end">
                      <div>
                        <h2 className="text-xl font-black uppercase tracking-tighter leading-tight">持续摇晃手机</h2>
                        <p className="text-[10px] text-zinc-400 uppercase tracking-widest leading-relaxed">
                          {holding || idle === 0 ? `中断 ${interrupts} 次 · 请勿停止` : `${idleLeft}s 后清零`}
                        </p>
                      </div>
                      <div className="text-right">
                        <div className="text-3xl font-black text-red-500 leading-none">{percent}%</div>
                        <div className="text-[10px] font-bold text-zinc-400 uppercase">{secondsDone} / 10 秒</div>
                      </div>
                    </div>
                    <div className="h-4 bg-zinc-900 border border-zinc-800">
                      <div className="h-full bg-red-500 demo-glow transition-[width] duration-100" style={{ width: `${percent}%` }} />
                    </div>
                    <button
                      type="button"
                      onPointerDown={handleDown}
                      onPointerUp={handleUp}
                      onPointerLeave={handleUp}
                      onPointerCancel={handleUp}
                      onKeyDown={(e) => {
                        if (e.key === ' ' || e.key === 'Enter') {
                          e.preventDefault();
                          handleDown();
                        }
                      }}
                      onKeyUp={(e) => {
                        if (e.key === ' ' || e.key === 'Enter') {
                          handleUp();
                        }
                      }}
                      className={`w-full min-h-[56px] font-black text-sm uppercase tracking-wider cursor-pointer select-none touch-none transition-colors ${holding ? 'bg-green-400 text-black' : 'bg-red-500 text-black'}`}
                    >
                      {holding ? '摇晃中…' : '按住模拟摇晃'}
                    </button>
                  </div>
                </div>
              )}

              {phase === 'warning' && (
                <div className="relative flex-1 flex flex-col items-center justify-center text-center gap-4 px-6 py-8 bg-red-600 text-black">
                  <AlertTriangle className="w-16 h-16" />
                  <div className="space-y-1">
                    <p className="text-3xl font-black uppercase">检测到中断</p>
                    <p className="text-sm font-bold">进度已清零，音量提升至 {volume}%</p>
                  </div>
                  <p className="text-xs font-bold uppercase tracking-widest">即将自动返回任务…</p>
                </div>
              )}

              {phase === 'done' && (
                <div className="relative flex-1 flex flex-col items-center justify-center text-center gap-5 px-6 py-8">
                  <div className="w-20 h-20 border-4 border-green-400 flex items-center justify-center">
                    <CheckCircle2 className="w-10 h-10 text-green-400" />
                  </div>
                  <div className="space-y-1">
                    <p className="text-3xl font-black uppercase tracking-tighter">起床成功</p>
                    <p className="text-sm text-zinc-400">闹钟已关闭</p>
                  </div>
                  <div className="grid grid-cols-2 gap-3 w-full">
                    <div className="bg-zinc-900 border border-zinc-800 p-3">
                      <p className="text-2xl font-black">{elapsedSeconds}s</p>
                      <p className="text-[11px] text-zinc-400 uppercase tracking-widest">本次用时</p>
                    </div>
                    <div className="bg-zinc-900 border border-zinc-800 p-3">
                      <p className="text-2xl font-black">{interrupts}</p>
                      <p className="text-[11px] text-zinc-400 uppercase tracking-widest">中断次数</p>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => dispatch({ type: 'start' })}
                    className="cursor-pointer w-full min-h-[48px] inline-flex items-center justify-center gap-2 border-2 border-white font-black uppercase tracking-wider hover:bg-white hover:text-black transition-colors"
                  >
                    <RotateCcw className="w-4 h-4" /> 再试一次
                  </button>
                </div>
              )}
            </div>
          </div>
          <p className="text-[11px] text-zinc-400 text-center max-w-[340px] leading-relaxed">
            这是交互式模拟，不会触发真实闹钟或读取设备传感器。
          </p>
        </section>

        {/* Rules */}
        <section className="space-y-5">
          <div className="space-y-2">
            <div className="inline-flex items-center gap-1.5 bg-red-500 text-black px-3 py-1 text-xs font-black uppercase tracking-widest">
              <Smartphone className="w-3 h-3" /> 全局硬性规则
            </div>
            <h2 className="text-3xl font-black uppercase tracking-tighter leading-tight">动作不停，闹钟不止</h2>
            <p className="text-sm text-zinc-400 leading-relaxed">
              亲自体验强制清醒闹钟的核心机制：持续动作推进进度，中断就清零并让铃声更响。
            </p>
          </div>

          <div className="space-y-3">
            {RULES.map((rule) => (
              <div key={rule.code} className="bg-zinc-950 border-2 border-zinc-800 p-4 flex items-start gap-3 min-h-[72px]">
                <span className="text-[10px] font-black bg-red-500 text-black px-2 py-1 shrink-0">{rule.code}</span>
                <div className="min-w-0">
                  <p className="font-black text-white text-sm uppercase tracking-tight">{rule.title}</p>
                  <p className="text-xs text-zinc-400 mt-1 leading-relaxed">{rule.desc}</p>
                </div>
              </div>
            ))}
          </div>

          <div className="flex flex-col sm:flex-row gap-3">
            <button
              type="button"
              onClick={() => navigate('/alarms')}
              className="cursor-pointer flex-1 min-h-[48px] inline-flex items-center justify-center gap-2 bg-red-500 text-black font-black uppercase tracking-wider hover:bg-red-400 transition-colors"
            >
              <BellRing className="w-4 h-4" /> 管理我的闹钟
            </button>
            <button
              type="button"
              onClick={() => navigate('/stats')}
              className="cursor-pointer flex-1 min-h-[48px] inline-flex items-center justify-center gap-2 border-2 border-white font-black uppercase tracking-wider hover:bg-white hover:text-black transition-colors"
            >
              <BarChart2 className="w-4 h-4" /> 查看起床统计
            </button>
          </div>
        </section>
      </main>

      <OmniflowBadge />
    </div>
  );
}
