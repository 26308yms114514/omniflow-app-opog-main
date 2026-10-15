-- Initial schema for 强制清醒闹钟 (Force Wake Alarm)

CREATE TABLE IF NOT EXISTS "alarms" (
  "id" TEXT PRIMARY KEY DEFAULT gen_random_uuid(),
  "label" TEXT NOT NULL DEFAULT '',
  "hour" INTEGER NOT NULL DEFAULT 7,
  "minute" INTEGER NOT NULL DEFAULT 0,
  "repeat_days" TEXT NOT NULL DEFAULT '{}',
  "enabled" BOOLEAN NOT NULL DEFAULT true,
  "config" TEXT NOT NULL DEFAULT '{}',
  "created_at" TIMESTAMP NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS "alarm_sessions" (
  "id" TEXT PRIMARY KEY DEFAULT gen_random_uuid(),
  "alarm_id" TEXT NOT NULL,
  "started_at" TIMESTAMP NOT NULL DEFAULT now(),
  "completed_at" TIMESTAMP,
  "interrupt_count" INTEGER NOT NULL DEFAULT 0,
  "task_type" TEXT NOT NULL,
  "difficulty" TEXT NOT NULL,
  "success" BOOLEAN NOT NULL DEFAULT false
);

CREATE INDEX IF NOT EXISTS "alarm_sessions_alarm_id_idx" ON "alarm_sessions" ("alarm_id");
CREATE INDEX IF NOT EXISTS "alarm_sessions_started_at_idx" ON "alarm_sessions" ("started_at" DESC);
