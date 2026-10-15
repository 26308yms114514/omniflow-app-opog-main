import { db } from '../db/index';
import { alarms, sessions, insertAlarmSchema, insertSessionSchema } from '../db/schema';
import { eq, desc } from 'drizzle-orm';
import { z } from 'zod';
import type { InsertAlarm, InsertAlarmSession } from '../db/schema';

export const alarmsRepository = {
  async findAll() {
    return db.select().from(alarms).orderBy(desc(alarms.createdAt));
  },

  async findById(id: string) {
    const rows = await db.select().from(alarms).where(eq(alarms.id, id));
    return rows[0] ?? null;
  },

  async create(data: z.infer<typeof insertAlarmSchema>) {
    const rows = await db.insert(alarms).values(data as InsertAlarm).returning();
    return rows[0];
  },

  async update(id: string, data: z.infer<typeof insertAlarmSchema>) {
    const rows = await db.update(alarms).set(data as Partial<InsertAlarm>).where(eq(alarms.id, id)).returning();
    return rows[0] ?? null;
  },

  async delete(id: string) {
    const rows = await db.delete(alarms).where(eq(alarms.id, id)).returning();
    return rows.length > 0;
  },
};

export const sessionsRepository = {
  async findAll(limit = 200) {
    return db.select().from(sessions).orderBy(desc(sessions.startedAt)).limit(limit);
  },

  async findByAlarmId(alarmId: string) {
    return db.select().from(sessions).where(eq(sessions.alarmId, alarmId)).orderBy(desc(sessions.startedAt));
  },

  async create(data: z.infer<typeof insertSessionSchema>) {
    const rows = await db.insert(sessions).values(data as InsertAlarmSession).returning();
    return rows[0];
  },
};
