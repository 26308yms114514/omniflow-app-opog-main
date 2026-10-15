import { pgTable, text, integer, boolean, timestamp } from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
import { createInsertSchema } from 'drizzle-zod';
import { z } from 'zod';

// Alarms table
export const alarms = pgTable('alarms', {
  id: text('id').primaryKey().default(sql`gen_random_uuid()`),
  label: text('label').notNull().default(''),
  hour: integer('hour').notNull().default(7),
  minute: integer('minute').notNull().default(0),
  // repeat days stored as JSON string
  repeatDays: text('repeat_days').notNull().default('{}'),
  enabled: boolean('enabled').notNull().default(true),
  // alarm config stored as JSON string
  config: text('config').notNull().default('{}'),
  createdAt: timestamp('created_at').notNull().default(sql`now()`),
});

export type Alarm = typeof alarms.$inferSelect;
export type InsertAlarm = typeof alarms.$inferInsert;

export const insertAlarmSchema = createInsertSchema(alarms, {
  label: z.string().max(100),
  hour: z.coerce.number().int().min(0).max(23),
  minute: z.coerce.number().int().min(0).max(59),
  repeatDays: z.string(),
  config: z.string(),
});

export const updateAlarmSchema = insertAlarmSchema.partial();

// Sessions table
export const sessions = pgTable('alarm_sessions', {
  id: text('id').primaryKey().default(sql`gen_random_uuid()`),
  alarmId: text('alarm_id').notNull(),
  startedAt: timestamp('started_at').notNull().default(sql`now()`),
  completedAt: timestamp('completed_at'),
  interruptCount: integer('interrupt_count').notNull().default(0),
  taskType: text('task_type').notNull(),
  difficulty: text('difficulty').notNull(),
  success: boolean('success').notNull().default(false),
});

export type AlarmSession = typeof sessions.$inferSelect;
export type InsertAlarmSession = typeof sessions.$inferInsert;

export const insertSessionSchema = createInsertSchema(sessions, {
  alarmId: z.string().min(1),
  taskType: z.string().min(1),
  difficulty: z.string().min(1),
  interruptCount: z.coerce.number().int().min(0),
  success: z.boolean(),
});
