/**
 * Capture the live site screen by screen at phone size, for planning a demo
 * recording. Screenshots land in C:\qzqxwz\_shots.
 */
import { mkdirSync } from 'node:fs';
import { chromium, devices } from 'playwright-core';

const BASE = 'https://26308yms114514.github.io/omniflow-app-opog-main/';
const OUT = 'C:\\qzqxwz\\_shots';

mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch({ channel: 'msedge', headless: true });
const context = await browser.newContext({
  ...devices['Pixel 5'],
  deviceScaleFactor: 2,
});
const page = await context.newPage();

const shot = async (name) => {
  await page.waitForTimeout(600);
  await page.screenshot({ path: `${OUT}\\${name}.png` });
  console.log(`  saved ${name}.png`);
};

const alarm = (overrides = {}) => ({
  id: 'demo-1',
  hour: 6,
  minute: 30,
  label: '早八课',
  enabled: true,
  repeat: { mon: true, tue: true, wed: true, thu: true, fri: true, sat: false, sun: false },
  config: {
    taskType: 'shake',
    difficulty: 'medium',
    duration: 30,
    count: 60,
    interruptTolerance: 3,
    sensitivity: 'medium',
    snoozeEnabled: false,
    snoozeDifficultyBoost: 10,
  },
  createdAt: Date.now() - 86_400_000,
  updatedAt: Date.now() - 86_400_000,
  ...overrides,
});

console.log('capturing');
await page.goto(BASE, { waitUntil: 'load' });
await page.waitForSelector('#root > *', { timeout: 20_000 });
await page.mouse.click(5, 5);
await page.waitForTimeout(1500);

// A few alarms so the list and stats are not empty.
await page.evaluate(
  list => {
    localStorage.setItem('alarms_v1', JSON.stringify(list));
    const now = Date.now();
    localStorage.setItem(
      'sessions_v1',
      JSON.stringify([
        { alarmId: 'a', startedAt: now - 400_000, completedAt: now - 330_000, interruptCount: 2, taskType: 'shake', difficulty: 'medium', success: true },
        { alarmId: 'b', startedAt: now - 300_000, completedAt: now - 200_000, interruptCount: 1, taskType: 'steps', difficulty: 'hard', success: true },
        { alarmId: 'c', startedAt: now - 200_000, completedAt: now - 150_000, interruptCount: 3, taskType: 'shake', difficulty: 'easy', success: true },
      ])
    );
  },
  [
    alarm(),
    alarm({ id: 'demo-2', hour: 7, minute: 0, label: '晨跑', config: { ...alarm().config, taskType: 'steps', difficulty: 'hard', count: 120 } }),
    alarm({ id: 'demo-3', hour: 13, minute: 20, label: '午休结束', enabled: false, repeat: { mon: false, tue: false, wed: false, thu: false, fri: false, sat: true, sun: true } }),
  ]
);
await page.reload({ waitUntil: 'load' });
await page.waitForSelector('#root > *');
await shot('01-首页');

await page.getByText('环境自检').first().click().catch(() => {});
await shot('02-环境自检');

await page.goto(`${BASE}#/alarms`, { waitUntil: 'load' });
await page.waitForTimeout(500);
await shot('03-闹钟列表');

await page.goto(`${BASE}#/edit/new`, { waitUntil: 'load' });
await page.waitForTimeout(500);
await shot('04-新增闹钟');

await page.goto(`${BASE}#/stats`, { waitUntil: 'load' });
await page.waitForTimeout(500);
await shot('05-统计');

await page.goto(`${BASE}#/f6db0085-1264-4a77-b32e-fa2731e8654f`, { waitUntil: 'load' });
await page.waitForTimeout(500);
await shot('06-产品介绍页');

await page.goto(`${BASE}#/42ed530e-ac29-4218-87cd-e291989cf9c6`, { waitUntil: 'load' });
await page.waitForTimeout(500);
await shot('07-任务演示页');

// The ringing screen, then the task in progress with synthetic motion.
await page.evaluate(() => localStorage.removeItem('active_ring_v1'));
await page.goto(`${BASE}#/task/demo-1`, { waitUntil: 'load' });
await page.waitForSelector('text=开始任务', { timeout: 15_000 });
await shot('08-响铃页');

await page.getByRole('button', { name: '开始任务' }).click();
await page.waitForTimeout(800);
await shot('09-任务进行中');

await page.evaluate(() => {
  window.__stop = false;
  const started = performance.now();
  let sign = 1;
  let nextFlip = 0;
  const tick = () => {
    if (window.__stop) return;
    const t = performance.now() - started;
    if (t >= nextFlip) {
      sign = -sign;
      nextFlip = t + 80 + Math.random() * 180;
    }
    window.dispatchEvent(
      new DeviceMotionEvent('devicemotion', {
        accelerationIncludingGravity: { x: sign * 15, y: 0, z: 9.81 },
      })
    );
    setTimeout(tick, 5);
  };
  tick();
});
await page.waitForTimeout(3000);
await shot('10-摇晃推进进度');
await page.evaluate(() => {
  window.__stop = true;
});

console.log('done');
await browser.close();
