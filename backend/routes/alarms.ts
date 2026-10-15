import { Router } from 'express';
import { alarmsRepository, sessionsRepository } from '../repositories/alarms';
import { insertAlarmSchema, updateAlarmSchema, insertSessionSchema } from '../db/schema';
import type { ApiResponse, AlarmItem, AlarmSessionItem, StatsResponse } from '../../shared/types/api';

const router = Router();

// Helper to serialize alarm row to API shape
function serializeAlarm(row: Awaited<ReturnType<typeof alarmsRepository.findById>>): AlarmItem | null {
  if (!row) return null;
  return {
    id: row.id,
    label: row.label,
    hour: row.hour,
    minute: row.minute,
    repeatDays: JSON.parse(row.repeatDays || '{}'),
    enabled: row.enabled,
    config: JSON.parse(row.config || '{}'),
    createdAt: row.createdAt ? row.createdAt.toISOString() : new Date().toISOString(),
  };
}

function serializeSession(row: Awaited<ReturnType<typeof sessionsRepository.findAll>>[number]): AlarmSessionItem {
  return {
    id: row.id,
    alarmId: row.alarmId,
    startedAt: row.startedAt ? row.startedAt.toISOString() : new Date().toISOString(),
    completedAt: row.completedAt ? row.completedAt.toISOString() : null,
    interruptCount: row.interruptCount,
    taskType: row.taskType as AlarmSessionItem['taskType'],
    difficulty: row.difficulty as AlarmSessionItem['difficulty'],
    success: row.success,
  };
}

// GET /api/alarms
router.get('/', async (_req, res) => {
  try {
    const rows = await alarmsRepository.findAll();
    const data = rows.map(r => serializeAlarm(r)).filter(Boolean) as AlarmItem[];
    res.json({ success: true, data } as ApiResponse<AlarmItem[]>);
  } catch (error) {
    console.error('Error fetching alarms:', error);
    res.status(500).json({ success: false, data: [], message: 'Failed to fetch alarms' });
  }
});

// GET /api/alarms/:id
router.get('/:id', async (req, res) => {
  try {
    const id = req.params.id as string;
    const row = await alarmsRepository.findById(id);
    if (!row) {
      return res.status(404).json({ success: false, data: null, message: 'Alarm not found' });
    }
    res.json({ success: true, data: serializeAlarm(row) } as ApiResponse<AlarmItem>);
  } catch (error) {
    console.error('Error fetching alarm:', error);
    res.status(500).json({ success: false, data: null, message: 'Failed to fetch alarm' });
  }
});

// POST /api/alarms
router.post('/', async (req, res) => {
  try {
    const body = req.body;
    const parsed = insertAlarmSchema.safeParse({
      label: body.label ?? '',
      hour: body.hour,
      minute: body.minute,
      repeatDays: typeof body.repeatDays === 'string' ? body.repeatDays : JSON.stringify(body.repeatDays ?? {}),
      enabled: body.enabled ?? true,
      config: typeof body.config === 'string' ? body.config : JSON.stringify(body.config ?? {}),
    });
    if (!parsed.success) {
      return res.status(400).json({ success: false, data: null, message: parsed.error.message });
    }
    const row = await alarmsRepository.create(parsed.data);
    res.status(201).json({ success: true, data: serializeAlarm(row) } as ApiResponse<AlarmItem>);
  } catch (error) {
    console.error('Error creating alarm:', error);
    res.status(500).json({ success: false, data: null, message: 'Failed to create alarm' });
  }
});

// PUT /api/alarms/:id
router.put('/:id', async (req, res) => {
  try {
    const id = req.params.id as string;
    const body = req.body;
    const updateData: Record<string, unknown> = {};
    if (body.label !== undefined) updateData.label = body.label;
    if (body.hour !== undefined) updateData.hour = body.hour;
    if (body.minute !== undefined) updateData.minute = body.minute;
    if (body.repeatDays !== undefined) updateData.repeatDays = typeof body.repeatDays === 'string' ? body.repeatDays : JSON.stringify(body.repeatDays);
    if (body.enabled !== undefined) updateData.enabled = body.enabled;
    if (body.config !== undefined) updateData.config = typeof body.config === 'string' ? body.config : JSON.stringify(body.config);

    const parsed = updateAlarmSchema.safeParse(updateData);
    if (!parsed.success) {
      return res.status(400).json({ success: false, data: null, message: parsed.error.message });
    }
    const row = await alarmsRepository.update(id, parsed.data as Parameters<typeof alarmsRepository.update>[1]);
    if (!row) {
      return res.status(404).json({ success: false, data: null, message: 'Alarm not found' });
    }
    res.json({ success: true, data: serializeAlarm(row) } as ApiResponse<AlarmItem>);
  } catch (error) {
    console.error('Error updating alarm:', error);
    res.status(500).json({ success: false, data: null, message: 'Failed to update alarm' });
  }
});

// DELETE /api/alarms/:id
router.delete('/:id', async (req, res) => {
  try {
    const id = req.params.id as string;
    const deleted = await alarmsRepository.delete(id);
    if (!deleted) {
      return res.status(404).json({ success: false, data: null, message: 'Alarm not found' });
    }
    res.json({ success: true, data: null, message: 'Alarm deleted' });
  } catch (error) {
    console.error('Error deleting alarm:', error);
    res.status(500).json({ success: false, data: null, message: 'Failed to delete alarm' });
  }
});

// GET /api/alarms/sessions/all
router.get('/sessions/all', async (_req, res) => {
  try {
    const rows = await sessionsRepository.findAll();
    const data = rows.map(serializeSession);
    res.json({ success: true, data } as ApiResponse<AlarmSessionItem[]>);
  } catch (error) {
    console.error('Error fetching sessions:', error);
    res.status(500).json({ success: false, data: [], message: 'Failed to fetch sessions' });
  }
});

// GET /api/alarms/sessions/stats
router.get('/sessions/stats', async (_req, res) => {
  try {
    const rows = await sessionsRepository.findAll();
    const total = rows.length;
    const successCount = rows.filter(r => r.success).length;
    const successRate = total > 0 ? Math.round((successCount / total) * 100) : 0;
    const recentSessions = rows.slice(0, 30).map(serializeSession);
    const stats: StatsResponse = {
      totalSessions: total,
      successCount,
      successRate,
      avgDuration: 0,
      avgInterrupts: total > 0 ? Math.round(rows.reduce((s, r) => s + r.interruptCount, 0) / total * 10) / 10 : 0,
      recentSessions,
    };
    res.json({ success: true, data: stats } as ApiResponse<StatsResponse>);
  } catch (error) {
    console.error('Error fetching stats:', error);
    res.status(500).json({ success: false, data: null, message: 'Failed to fetch stats' });
  }
});

// POST /api/alarms/sessions
router.post('/sessions', async (req, res) => {
  try {
    const body = req.body;
    const parsed = insertSessionSchema.safeParse({
      alarmId: body.alarmId,
      taskType: body.taskType,
      difficulty: body.difficulty,
      interruptCount: body.interruptCount ?? 0,
      success: body.success ?? false,
      completedAt: body.completedAt ? new Date(body.completedAt) : undefined,
    });
    if (!parsed.success) {
      return res.status(400).json({ success: false, data: null, message: parsed.error.message });
    }
    const row = await sessionsRepository.create(parsed.data);
    res.status(201).json({ success: true, data: serializeSession(row) } as ApiResponse<AlarmSessionItem>);
  } catch (error) {
    console.error('Error creating session:', error);
    res.status(500).json({ success: false, data: null, message: 'Failed to create session' });
  }
});

export default router;
