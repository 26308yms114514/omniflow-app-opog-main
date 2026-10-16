/**
 * End-to-end verification of the built app in a real Chromium browser.
 *
 * Everything until now was unit tests and static checks. This drives the actual
 * bundle at a phone-sized viewport and pushes synthetic `devicemotion` events
 * through the real pipeline, which is the only way to prove that the shake and
 * march tasks advance progress.
 *
 * Uses the installed Edge (channel: 'msedge') so no browser download is needed.
 *
 * Serve a build first (over https, so the secure-context paths are exercised):
 *   pnpm cert && pnpm build && pnpm preview
 * then point this at it:
 *   APP_URL=https://<lan-ip>:4173/ pnpm test:e2e
 */
import { chromium, devices } from 'playwright-core';

const APP_URL = process.env.APP_URL || 'https://10.231.28.231:4173/';
const HASH = APP_URL.endsWith('/') ? APP_URL : `${APP_URL}/`;

let passed = 0;
const failures = [];

function check(name, ok, detail = '') {
  if (ok) {
    passed += 1;
    console.log(`  ok  ${name}`);
  } else {
    failures.push(name);
    console.log(`  FAIL ${name}${detail ? ` — ${detail}` : ''}`);
  }
}

/** Alarm shape the app stores in localStorage. */
function makeAlarm(overrides) {
  return {
    id: 'e2e-alarm',
    label: 'E2E',
    hour: 7,
    minute: 0,
    repeat: { mon: true, tue: true, wed: true, thu: true, fri: true, sat: true, sun: true },
    enabled: true,
    config: {
      taskType: 'shake',
      difficulty: 'easy',
      duration: 10,
      count: 10,
      interruptTolerance: 3,
      sensitivity: 'medium',
      snoozeEnabled: false,
      snoozeDifficultyBoost: 10,
    },
    createdAt: Date.now(),
    ...overrides,
  };
}

/**
 * Starts a background pump inside the page that keeps emitting synthetic
 * device-motion samples. `shake` swings hard on x; `march` produces a
 * gravity-centred 2 Hz bounce, which is what the step detector expects.
 */
async function startMotion(page, mode) {
  await page.evaluate(modeName => {
    window.__motionStop = false;
    let t = 0;
    const tick = () => {
      if (window.__motionStop) return;
      let x = 0;
      let y = 0;
      let z = 9.81;
      if (modeName === 'shake') {
        // Alternate hard so consecutive samples differ by ~30 m/s².
        x = Math.floor(t / 60) % 2 === 0 ? 15 : -15;
      } else {
        const magnitude = 9.81 + 6 * Math.sin(2 * Math.PI * 2 * (t / 1000));
        x = magnitude;
        y = 0;
        z = 0;
      }
      window.dispatchEvent(
        new DeviceMotionEvent('devicemotion', {
          accelerationIncludingGravity: { x, y, z },
        })
      );
      t += 20;
      setTimeout(tick, 20);
    };
    tick();
  }, mode);
}

async function stopMotion(page) {
  await page.evaluate(() => {
    window.__motionStop = true;
  });
}

/**
 * Read the progress percentage from the labelled row only. Matching the first
 * `NN%` in the page text picks up the volume readout instead, which sits
 * higher up and always reads 0% at the start.
 */
function readProgress(page) {
  return page.evaluate(() => {
    const spans = Array.from(document.querySelectorAll('span'));
    const label = spans.find(span => {
      const text = span.textContent?.trim() ?? '';
      return text === '进度' || text.startsWith('已踏步');
    });
    const value = label?.parentElement?.querySelector('span:last-child')?.textContent ?? '';
    return Number.parseInt(value, 10) || 0;
  });
}

function readSteps(page) {
  return page.evaluate(() => {
    const match = document.body.innerText.match(/已踏步\s*(\d+)\s*\/\s*(\d+)\s*步/);
    return match ? Number(match[1]) : 0;
  });
}

const browser = await chromium.launch({ channel: 'msedge', headless: true });
const context = await browser.newContext({
  ...devices['Pixel 5'],
  ignoreHTTPSErrors: true,
});
const page = await context.newPage();

const pageProblems = [];
/** Errors the self-signed certificate inevitably produces in this harness. */
const ENVIRONMENTAL = /ssl|certificate|serviceworker|service worker|net::ERR_CERT/i;
page.on('pageerror', error => pageProblems.push(`pageerror: ${error.message}`));
page.on('console', message => {
  if (message.type() !== 'error') return;
  const text = message.text();
  if (ENVIRONMENTAL.test(text)) return;
  pageProblems.push(`console: ${text}`);
});

console.log(`app: ${HASH}`);

try {
  // ---- boot -------------------------------------------------------------
  const response = await page.goto(HASH, { waitUntil: 'load', timeout: 30_000 });
  check('the page loads', !!response && response.status() === 200, `status ${response?.status()}`);
  await page.waitForSelector('#root > *', { timeout: 15_000 });
  check('React mounts something into #root', true);

  const heading = await page.locator('h1', { hasText: '强制清醒' }).first().textContent();
  check('the home screen renders its heading', heading?.includes('强制清醒'), String(heading));

  await page.getByText('环境自检').first().click({ timeout: 5_000 });
  const secureRow = page.getByText('安全上下文').first();
  check('the environment checklist opens', await secureRow.isVisible());

  // ---- shake task -------------------------------------------------------
  await page.evaluate(alarm => {
    localStorage.setItem('alarms_v1', JSON.stringify([alarm]));
  }, makeAlarm());
  await page.reload({ waitUntil: 'load' });
  await page.waitForSelector('#root > *');

  check('the seeded alarm is listed', await page.getByText('下次响铃').first().isVisible());

  const tryListen = page.getByRole('button', { name: /试听/ }).first();
  check('the test-sound button is offered once an alarm exists', (await tryListen.count()) > 0);

  await page.goto(`${HASH}#/task/e2e-alarm`, { waitUntil: 'load' });
  await page.waitForSelector('text=开始任务', { timeout: 10_000 });
  check('the task screen opens from a seeded alarm', true);

  // Motion must already be flowing when the task starts, so the 1.5 s probe
  // window sees a real sensor and does not fall back to tap simulation.
  await startMotion(page, 'shake');
  await page.getByRole('button', { name: '开始任务' }).click();
  await page.waitForTimeout(2500);

  const shakePercent = await readProgress(page);
  console.log(`      (measured progress after 2.5 s of shaking: ${shakePercent}%)`);
  check(
    'shaking advances the progress bar',
    shakePercent > 10,
    `progress was ${shakePercent}%`
  );

  const sensorHint = await page.evaluate(() => document.body.innerText);
  check(
    'the sensor path is used, not the tap fallback',
    !sensorHint.includes('未检测到传感器'),
    'fell back to touch simulation'
  );

  await stopMotion(page);

  // ---- march task -------------------------------------------------------
  await page.evaluate(alarm => {
    localStorage.setItem('alarms_v1', JSON.stringify([alarm]));
  }, makeAlarm({
    id: 'e2e-steps',
    config: { ...makeAlarm().config, taskType: 'steps', count: 10 },
  }));
  // A raw localStorage write does not notify the running app (the native
  // `storage` event is cross-document only), so reload to pick it up.
  await page.reload({ waitUntil: 'load' });
  await page.goto(`${HASH}#/task/e2e-steps`, { waitUntil: 'load' });
  await page.waitForSelector('text=开始任务', { timeout: 10_000 });

  await startMotion(page, 'march');
  await page.getByRole('button', { name: '开始任务' }).click();
  await page.waitForTimeout(4000);

  const stepText = await readSteps(page);
  check('marching counts real steps', stepText > 0, `counted ${stepText} steps`);
  await stopMotion(page);

  // ---- core loop: a due alarm launches, traps, then releases -----------
  await stopMotion(page);

  // One minute in the past so the alarm is inside the 5-minute catch-up
  // window without racing the turn of the minute.
  const due = new Date(Date.now() - 60_000);
  const dueTime = { hour: due.getHours(), minute: due.getMinutes() };

  await page.evaluate(alarm => {
    localStorage.removeItem('active_ring_v1');
    localStorage.removeItem('snoozed_alarm_v1');
    localStorage.setItem('alarms_v1', JSON.stringify([alarm]));
  }, makeAlarm({ id: 'e2e-due', ...dueTime }));
  await page.evaluate(() => {
    location.hash = '#/';
  });
  await page.reload({ waitUntil: 'load' });

  await page.waitForSelector('text=开始任务', { timeout: 20_000 });
  check(
    'a due alarm launches the wake-up task on its own',
    page.url().includes('#/task/e2e-due'),
    page.url()
  );

  // The scheduler must not let the back gesture silence the alarm.
  await page.evaluate(() => {
    location.hash = '#/';
  });
  await page.waitForFunction(() => location.hash.includes('/task/e2e-due'), null, {
    timeout: 15_000,
  });
  check('navigating away from a ringing task pulls the user back', true);

  const ringing = await page.evaluate(() => localStorage.getItem('active_ring_v1'));
  check('the ring is recorded so a reload cannot escape it', !!ringing && ringing.includes('e2e-due'));

  // Finish it: shake until the configured duration is served.
  await page.getByRole('button', { name: '开始任务' }).click();
  await startMotion(page, 'shake');
  await page.waitForSelector('text=起床成功', { timeout: 45_000 });
  await stopMotion(page);
  check('serving the full duration completes the task', true);

  check(
    'completing the task clears the ring',
    (await page.evaluate(() => localStorage.getItem('active_ring_v1'))) === 'null'
  );

  await page.evaluate(() => {
    location.hash = '#/';
  });
  await page.waitForTimeout(700);
  check('after completion the user may leave', page.url().endsWith('#/'), page.url());

  // ---- snooze ----------------------------------------------------------
  await page.evaluate(alarm => {
    localStorage.removeItem('active_ring_v1');
    localStorage.removeItem('snoozed_alarm_v1');
    localStorage.setItem('alarms_v1', JSON.stringify([alarm]));
  }, makeAlarm({
    id: 'e2e-snooze',
    ...dueTime,
    config: { ...makeAlarm().config, snoozeEnabled: true },
  }));
  await page.evaluate(() => {
    location.hash = '#/';
  });
  await page.reload({ waitUntil: 'load' });
  await page.waitForSelector('text=开始任务', { timeout: 20_000 });

  const snoozeButton = page.getByRole('button', { name: /再睡/ });
  check('the snooze button appears when the alarm opts in', (await snoozeButton.count()) > 0);
  await snoozeButton.click();
  await page.waitForTimeout(600);

  const snoozed = await page.evaluate(() => localStorage.getItem('snoozed_alarm_v1'));
  check(
    'snoozing schedules the next ring',
    !!snoozed && snoozed.includes('e2e-snooze'),
    String(snoozed)
  );
  check(
    'snoozing releases the ring',
    (await page.evaluate(() => localStorage.getItem('active_ring_v1'))) === 'null'
  );

  // ---- no runtime errors ------------------------------------------------
  check(
    'no uncaught errors reached the page',
    pageProblems.length === 0,
    pageProblems.slice(0, 3).join(' | ')
  );

  // ---- persistence ------------------------------------------------------
  const persisted = await page.evaluate(() => localStorage.getItem('alarms_v1'));
  check(
    'alarms persist in localStorage',
    !!persisted && persisted.includes('e2e-snooze'),
    String(persisted).slice(0, 80)
  );
} catch (error) {
  failures.push(`exception: ${error.message}`);
  console.log(`  FAIL exception — ${error.message}`);
} finally {
  await browser.close();
}

console.log(`\n${passed} checks passed, ${failures.length} failed`);
if (failures.length) process.exit(1);
