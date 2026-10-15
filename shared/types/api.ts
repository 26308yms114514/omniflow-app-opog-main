// Shared API types — single source of truth for frontend <-> backend contracts.

export interface ApiResponse<T> {
  success: boolean;
  data: T;
  message?: string;
}

export type TaskType = 'shake' | 'steps' | 'squat' | 'qrcode' | 'walk' | 'nfc';
export type Difficulty = 'easy' | 'medium' | 'hard';

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
  duration: number;
  count: number;
  interruptTolerance: number;
  sensitivity: 'low' | 'medium' | 'high';
  snoozeEnabled: boolean;
  snoozeDifficultyBoost: number;
  randomPool: boolean;
}

export interface AlarmItem {
  id: string;
  label: string;
  hour: number;
  minute: number;
  repeatDays: RepeatDays;
  enabled: boolean;
  config: AlarmConfig;
  createdAt: string;
}

export interface AlarmSessionItem {
  id: string;
  alarmId: string;
  startedAt: string;
  completedAt: string | null;
  interruptCount: number;
  taskType: TaskType;
  difficulty: Difficulty;
  success: boolean;
}

export interface CreateAlarmRequest {
  label?: string;
  hour: number;
  minute: number;
  repeatDays: RepeatDays;
  enabled?: boolean;
  config: AlarmConfig;
}

export interface UpdateAlarmRequest {
  label?: string;
  hour?: number;
  minute?: number;
  repeatDays?: RepeatDays;
  enabled?: boolean;
  config?: AlarmConfig;
}

export interface CreateSessionRequest {
  alarmId: string;
  taskType: TaskType;
  difficulty: Difficulty;
  interruptCount: number;
  success: boolean;
  completedAt?: string;
}

export interface StatsResponse {
  totalSessions: number;
  successCount: number;
  successRate: number;
  avgDuration: number;
  avgInterrupts: number;
  recentSessions: AlarmSessionItem[];
}
