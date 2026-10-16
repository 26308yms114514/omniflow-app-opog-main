/**
 * Unlock tasks the app actually implements.
 *
 * `squat`, `qrcode`, `walk` and `nfc` were listed in earlier builds behind a
 * "即将" badge but were never built — picking one silently fell back to shake
 * detection. They have been removed rather than left as dead options.
 */
export type TaskType = 'shake' | 'steps';
export type Difficulty = 'easy' | 'medium' | 'hard';
export type AlarmStatus = 'idle' | 'ringing' | 'task' | 'interrupted' | 'completed';

export interface RepeatDays {
  mon: boolean;
  tue: boolean;
  wed: boolean;
  thu: boolean;
  fri: boolean;
  sat: boolean;
  sun: boolean;
}

export interface AlarmConfig {
  taskType: TaskType;
  difficulty: Difficulty;
  duration: number;       // seconds, for the shake task
  count: number;          // target steps, for the march task
  interruptTolerance: number; // seconds
  /**
   * Base sensor sensitivity. Not surfaced in the editor — `difficulty` is the
   * user-facing knob and scales this value. Kept in the model so the two are
   * independent should a sensitivity control return.
   */
  sensitivity: 'low' | 'medium' | 'high';
  snoozeEnabled: boolean;
  snoozeDifficultyBoost: number; // percent added to the next ring's difficulty
}

export interface Alarm {
  id: string;
  label: string;
  hour: number;
  minute: number;
  repeat: RepeatDays;
  enabled: boolean;
  config: AlarmConfig;
  createdAt: number;
  /**
   * When the alarm was last edited. Used so that changing an alarm to a time
   * that has just passed schedules it for tomorrow instead of ringing on the
   * spot. Absent on alarms stored before this field existed.
   */
  updatedAt?: number;
}

export interface AlarmSession {
  alarmId: string;
  startedAt: number;
  completedAt?: number;
  interruptCount: number;
  taskType: TaskType;
  difficulty: Difficulty;
  success: boolean;
}

export const DEFAULT_CONFIG: AlarmConfig = {
  taskType: 'shake',
  // Neutral, matching every `?? …` fallback in the app. It used to be 'easy'
  // while the fallbacks said 'medium', so a new alarm and a malformed one
  // behaved differently.
  difficulty: 'medium',
  duration: 30,
  // Steps, not squats: `count` used to mean "reps" for tasks that no longer
  // exist, and 10 steps is about five seconds of marching — no wake-up at all.
  count: 60,
  interruptTolerance: 3,
  sensitivity: 'medium',
  snoozeEnabled: false,
  snoozeDifficultyBoost: 10,
};

export const DEFAULT_REPEAT: RepeatDays = {
  mon: true,
  tue: true,
  wed: true,
  thu: true,
  fri: true,
  sat: false,
  sun: false,
};

export const TASK_LABELS: Record<TaskType, string> = {
  shake: '持续摇晃',
  steps: '原地踏步',
};

export const TASK_ICONS: Record<TaskType, string> = {
  shake: '📳',
  steps: '🚶',
};

export const TASK_DESCRIPTIONS: Record<TaskType, string> = {
  shake: '用力摇晃手机，加速度变化达到阈值才计入进度',
  steps: '手持手机原地踏步，逐步累加目标步数',
};

/** Every task type currently offered, in display order. */
export const TASK_TYPES: TaskType[] = ['shake', 'steps'];

/**
 * Map anything stored by an older build onto a task that still exists.
 *
 * Alarms live in localStorage, so a device may still hold `squat` / `qrcode` /
 * `walk` / `nfc`. Those must not render as an unselected, unusable picker row,
 * so they degrade to the shake task.
 */
export function normalizeTaskType(value: unknown): TaskType {
  return value === 'steps' ? 'steps' : 'shake';
}

/** Normalise one stored alarm, preserving identity when nothing changed. */
export function normalizeAlarm(alarm: Alarm): Alarm {
  const taskType = normalizeTaskType(alarm?.config?.taskType);
  if (!alarm?.config || alarm.config.taskType === taskType) return alarm;
  return { ...alarm, config: { ...alarm.config, taskType } };
}

export const DIFFICULTY_LABELS: Record<Difficulty, string> = {
  easy: '简单',
  medium: '中等',
  hard: '硬核',
};

export const DAY_LABELS: (keyof RepeatDays)[] = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];
export const DAY_DISPLAY: Record<keyof RepeatDays, string> = {
  mon: '一',
  tue: '二',
  wed: '三',
  thu: '四',
  fri: '五',
  sat: '六',
  sun: '日',
};

const WEEKDAYS: (keyof RepeatDays)[] = ['mon', 'tue', 'wed', 'thu', 'fri'];
const WEEKEND: (keyof RepeatDays)[] = ['sat', 'sun'];

/**
 * "HH:MM", the single place this app decides how a clock time is written.
 * The same template string used to be repeated in the alarm card, the task
 * screen and the scheduler, which is how formats drift apart.
 *
 * Out-of-range or non-numeric input is wrapped rather than producing "NaN:NaN".
 */
export function formatClock(hour: number, minute: number): string {
  const wrap = (value: number, span: number) =>
    (((Math.trunc(Number(value)) || 0) % span) + span) % span;
  const pad = (value: number) => String(value).padStart(2, '0');
  return `${pad(wrap(hour, 24))}:${pad(wrap(minute, 60))}`;
}

/**
 * Human-readable repeat summary.
 *
 * An empty day set is deliberately reported as 每天 rather than 仅一次: that is
 * what `nextOccurrence` does with it, and the editor warns about it. The alarm
 * list used to say 仅一次 in that case, contradicting both.
 */
export function describeRepeat(repeat: RepeatDays): string {
  const selected = DAY_LABELS.filter(day => repeat[day]);
  if (selected.length === 0 || selected.length === 7) return '每天';

  const isOnly = (days: (keyof RepeatDays)[]) =>
    days.every(day => repeat[day]) &&
    DAY_LABELS.filter(day => !days.includes(day)).every(day => !repeat[day]);

  if (isOnly(WEEKDAYS)) return '工作日';
  if (isOnly(WEEKEND)) return '周末';

  return `每周 ${selected.map(day => DAY_DISPLAY[day]).join(' ')}`;
}
