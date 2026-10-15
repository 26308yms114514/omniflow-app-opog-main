import { useState, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ChevronLeft, Check } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Slider } from '@/components/ui/slider';
import { toast } from 'sonner';
import { useAlarms } from '@/hooks/use-alarms';
import {
  Alarm, AlarmConfig, RepeatDays,
  TaskType, Difficulty,
  TASK_LABELS, TASK_ICONS, DIFFICULTY_LABELS,
  DAY_LABELS, DAY_DISPLAY,
  DEFAULT_CONFIG, DEFAULT_REPEAT,
} from '@/types/alarm';

const TASK_TYPES: TaskType[] = ['shake', 'steps', 'squat', 'qrcode', 'walk', 'nfc'];
const DIFFICULTIES: Difficulty[] = ['easy', 'medium', 'hard'];
const TASK_AVAILABLE: Record<TaskType, boolean> = {
  shake: true,
  steps: true,
  squat: false,
  qrcode: false,
  walk: false,
  nfc: false,
};

export default function AlarmEdit() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { alarms, addAlarm, updateAlarm } = useAlarms();
  const isNew = id === 'new';

  const existing = isNew ? null : alarms.find(a => a.id === id) ?? null;

  const [hour, setHour] = useState(existing?.hour ?? 7);
  const [minute, setMinute] = useState(existing?.minute ?? 0);
  const [label, setLabel] = useState(existing?.label ?? '');
  const [repeat, setRepeat] = useState<RepeatDays>(existing?.repeat ?? { ...DEFAULT_REPEAT });
  const [config, setConfig] = useState<AlarmConfig>(existing?.config ?? { ...DEFAULT_CONFIG });

  useEffect(() => {
    if (!isNew && !existing) navigate('/');
  }, [isNew, existing, navigate]);

  const toggleDay = (day: keyof RepeatDays) => {
    setRepeat(prev => ({ ...prev, [day]: !prev[day] }));
  };

  const setTask = (t: TaskType) => setConfig(prev => ({ ...prev, taskType: t }));
  const setDifficulty = (d: Difficulty) => setConfig(prev => ({ ...prev, difficulty: d }));

  const handleSave = () => {
    const partial: Partial<Alarm> = { hour, minute, label, repeat, config };
    if (isNew) {
      addAlarm(partial);
      toast.success('闹钟已添加');
    } else {
      updateAlarm(id!, partial);
      toast.success('闹钟已保存');
    }
    navigate('/');
  };

  const hourStr = String(hour).padStart(2, '0');
  const minStr = String(minute).padStart(2, '0');

  return (
    <div className="min-h-screen bg-background flex flex-col">
      {/* Header */}
      <header className="sticky top-0 z-10 bg-background/95 backdrop-blur border-b border-border px-4 py-3">
        <div className="max-w-lg mx-auto flex items-center justify-between">
          <Button variant="ghost" size="icon" onClick={() => navigate('/')}>
            <ChevronLeft className="w-5 h-5" />
          </Button>
          <h1 className="text-base font-semibold">{isNew ? '新增闹钟' : '编辑闹钟'}</h1>
          <Button size="sm" onClick={handleSave} className="gap-1">
            <Check className="w-4 h-4" /> 保存
          </Button>
        </div>
      </header>

      <main className="flex-1 px-4 py-6 max-w-lg mx-auto w-full space-y-6">
        {/* Time Picker */}
        <section className="bg-card rounded-2xl border border-border p-5">
          <h2 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-4">起床时间</h2>
          <div className="flex items-center justify-center gap-2">
            <div className="flex flex-col items-center gap-1">
              <Button variant="ghost" size="sm" onClick={() => setHour(h => (h + 1) % 24)}>▲</Button>
              <span className="text-5xl font-bold tabular-nums w-16 text-center">{hourStr}</span>
              <Button variant="ghost" size="sm" onClick={() => setHour(h => (h - 1 + 24) % 24)}>▼</Button>
            </div>
            <span className="text-4xl font-bold text-muted-foreground mb-1">:</span>
            <div className="flex flex-col items-center gap-1">
              <Button variant="ghost" size="sm" onClick={() => setMinute(m => (m + 1) % 60)}>▲</Button>
              <span className="text-5xl font-bold tabular-nums w-16 text-center">{minStr}</span>
              <Button variant="ghost" size="sm" onClick={() => setMinute(m => (m - 1 + 60) % 60)}>▼</Button>
            </div>
          </div>
          <div className="mt-4">
            <input
              type="text"
              placeholder="闹钟标签（可选）"
              value={label}
              onChange={e => setLabel(e.target.value)}
              className="w-full bg-muted/50 rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-primary/50 placeholder:text-muted-foreground"
            />
          </div>
        </section>

        {/* Repeat Days */}
        <section className="bg-card rounded-2xl border border-border p-5">
          <h2 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">重复日期</h2>
          <div className="flex gap-2 justify-between">
            {DAY_LABELS.map(day => (
              <button
                key={day}
                onClick={() => toggleDay(day)}
                className={`flex-1 h-9 rounded-full text-sm font-medium transition-colors ${
                  repeat[day]
                    ? 'bg-primary text-primary-foreground'
                    : 'bg-muted text-muted-foreground'
                }`}
              >
                {DAY_DISPLAY[day]}
              </button>
            ))}
          </div>
        </section>

        {/* Task Type */}
        <section className="bg-card rounded-2xl border border-border p-5">
          <h2 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">解锁任务</h2>
          <div className="grid grid-cols-3 gap-2">
            {TASK_TYPES.map(t => {
              const available = TASK_AVAILABLE[t];
              const selected = config.taskType === t;
              return (
                <button
                  key={t}
                  onClick={() => available && setTask(t)}
                  data-omniflow-feature-status={available ? undefined : 'unbuilt'}
                  className={`relative flex flex-col items-center gap-1 rounded-xl p-3 border text-sm font-medium transition-all ${
                    selected
                      ? 'bg-primary text-primary-foreground border-primary'
                      : available
                      ? 'bg-muted/50 text-foreground border-border hover:border-primary/50'
                      : 'bg-muted/20 text-muted-foreground border-border/30 cursor-pointer'
                  }`}
                >
                  <span className="text-xl">{TASK_ICONS[t]}</span>
                  <span className="text-xs">{TASK_LABELS[t]}</span>
                  {!available && (
                    <span className="absolute top-1 right-1 text-[9px] bg-muted text-muted-foreground rounded px-1">即将</span>
                  )}
                </button>
              );
            })}
          </div>
        </section>

        {/* Difficulty */}
        <section className="bg-card rounded-2xl border border-border p-5">
          <h2 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">难度档位</h2>
          <div className="flex gap-2">
            {DIFFICULTIES.map(d => (
              <button
                key={d}
                onClick={() => setDifficulty(d)}
                className={`flex-1 py-2 rounded-xl text-sm font-medium border transition-all ${
                  config.difficulty === d
                    ? 'bg-primary text-primary-foreground border-primary'
                    : 'bg-muted/50 text-foreground border-border'
                }`}
              >
                {DIFFICULTY_LABELS[d]}
              </button>
            ))}
          </div>
        </section>

        {/* Task Duration / Count */}
        {(config.taskType === 'shake' || config.taskType === 'steps') && (
          <section className="bg-card rounded-2xl border border-border p-5">
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">任务时长</h2>
              <span className="text-sm font-bold text-primary">{config.duration}秒</span>
            </div>
            <Slider
              min={10}
              max={120}
              step={5}
              value={[config.duration]}
              onValueChange={([v]) => setConfig(prev => ({ ...prev, duration: v }))}
            />
            <div className="flex justify-between text-xs text-muted-foreground mt-1">
              <span>10秒</span><span>120秒</span>
            </div>
          </section>
        )}

        {/* Interrupt Tolerance */}
        <section className="bg-card rounded-2xl border border-border p-5">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">中断容忍时限</h2>
            <span className="text-sm font-bold text-primary">{config.interruptTolerance}秒</span>
          </div>
          <Slider
            min={1}
            max={10}
            step={1}
            value={[config.interruptTolerance]}
            onValueChange={([v]) => setConfig(prev => ({ ...prev, interruptTolerance: v }))}
          />
          <div className="flex justify-between text-xs text-muted-foreground mt-1">
            <span>1秒</span><span>10秒</span>
          </div>
        </section>

        {/* Snooze */}
        <section className="bg-card rounded-2xl border border-border p-5">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-sm font-semibold">贪睡模式</h2>
              <p className="text-xs text-muted-foreground mt-0.5">二次闹铃难度自动提升 {config.snoozeDifficultyBoost}%</p>
            </div>
            <Switch
              checked={config.snoozeEnabled}
              onCheckedChange={v => setConfig(prev => ({ ...prev, snoozeEnabled: v }))}
            />
          </div>
        </section>
      </main>
    </div>
  );
}
