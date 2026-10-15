export type TaskType = 'shake' | 'steps' | 'squat' | 'qrcode' | 'walk' | 'nfc';
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
  duration: number;       // seconds for shake/steps
  count: number;          // reps for squat/walk
  interruptTolerance: number; // seconds
  sensitivity: 'low' | 'medium' | 'high';
  snoozeEnabled: boolean;
  snoozeDifficultyBoost: number; // percent
  randomPool: boolean;
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
  difficulty: 'easy',
  duration: 30,
  count: 10,
  interruptTolerance: 3,
  sensitivity: 'medium',
  snoozeEnabled: false,
  snoozeDifficultyBoost: 10,
  randomPool: false,
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
  squat: '深蹲计数',
  qrcode: '扫码解锁',
  walk: '房间绕圈',
  nfc: 'NFC刷卡',
};

export const TASK_ICONS: Record<TaskType, string> = {
  shake: '📳',
  steps: '🚶',
  squat: '🏋️',
  qrcode: '📷',
  walk: '🔄',
  nfc: '📡',
};

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
