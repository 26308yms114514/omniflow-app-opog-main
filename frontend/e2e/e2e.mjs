/**
 * End-to-end verification of the built app in a real Chromium browser.
 *
 * Everything until now was unit tests and static checks. This drives the actual
 * bundle at a phone-sized viewport and pushes synthetic `devicemotion` events
 * through the real pipeline, which is the only way to prove that the shake and
 * march tasks advance progress.
 *
 * Why the events are dispatched from a script rather than fed to the browser:
 * CDP's sensor override (`Emulation.setSensorOverrideEnabled` +
 * `setSensorOverrideReadings`) only drives the Generic Sensor API
 * (`new Accelerometer()`). `devicemotion` comes from a different platform path:
 * with the override active the page receives either no events or one with every
 * field null. Both combinations (accelerometer alone, and
 * linear-acceleration + gravity) were tried. So the sensor *plumbing* a real
 * phone uses cannot be reproduced here — what these tests prove is that the
 * threshold, timing and progress logic is right given the events Android sends.
 *
 * Uses the installed Edge (channel: 'msedge') so no browser download is needed.
 *
 * Needs two origins, because they prove different things:
 *
 *   APP_URL     an https build, so the secure-context paths run for real.
 *               pnpm cert && pnpm build && pnpm preview
 *               APP_URL=https://<lan-ip>:4173/ pnpm test:e2e
 *
 *   NOTIFY_URL  a plain http server on loopback. Chrome treats 127.0.0.1 as a
 *               secure context, and only there can the service worker register:
 *               an untrusted certificate blocks it outright. Without this the
 *               notification path has no coverage.
 *               python -m http.server 4180 --directory dist
 *
 * The notification section is skipped cleanly when NOTIFY_URL is unreachable.
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
    // Backdated so the alarm counts as pre-existing: an alarm saved *after* its
    // own scheduled moment deliberately does not ring retroactively.
    createdAt: Date.now() - 3_600_000,
    updatedAt: Date.now() - 3_600_000,
    ...overrides,
  };
}

/**
 * Starts a background pump inside the page that keeps emitting synthetic
 * device-motion samples.
 *
 *   shake       human-sloppy strokes: the gap between them wanders, which is
 *               also what keeps the anti-cheat detector from — correctly —
 *               calling this a machine.
 *   mechanical  perfectly even strokes, i.e. a phone taped to a fan.
 *   march       a gravity-centred 2 Hz bounce, which is what the step detector
 *               expects.
 */
async function startMotion(page, mode) {
  await page.evaluate(modeName => {
    window.__motionStop = false;
    const startedAt = performance.now();
    let sign = 1;
    let nextFlipAt = 0;

    const tick = () => {
      if (window.__motionStop) return;
      const elapsed = performance.now() - startedAt;

      let x = 0;
      let y = 0;
      let z = 9.81;

      if (modeName === 'shake' || modeName === 'mechanical') {
        // Scheduled against the wall clock, not accumulated per tick: polling
        // faster than the stroke period is what makes the mechanical pattern
        // genuinely steady. Reading `t += 20` into the interval inherited
        // setTimeout's jitter (~8% variation), which is not how a fan behaves
        // and was too irregular for the detector to judge.
        if (elapsed >= nextFlipAt) {
          sign = -sign;
          nextFlipAt = elapsed + (modeName === 'mechanical' ? 120 : 80 + Math.random() * 180);
        }
        x = sign * 15;
      } else {
        const magnitude = 9.81 + 6 * Math.sin(2 * Math.PI * 2 * (elapsed / 1000));
        x = magnitude;
        y = 0;
        z = 0;
      }

      window.dispatchEvent(
        new DeviceMotionEvent('devicemotion', {
          accelerationIncludingGravity: { x, y, z },
        })
      );
      setTimeout(tick, 5);
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

  check('the seeded alarm is listed', await page.getByText('下次提醒').first().isVisible());

  const tryListen = page.getByRole('button', { name: /试响铃/ }).first();
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

  // The first phone test reported "no sound" and nothing said why. Playing the
  // clip here makes the audio channel observable: a malformed WAV header or a
  // blocked play() shows up as a stalled currentTime rather than silence.
  const audio = await page.evaluate(() => {
    const element = document.querySelector('audio');
    if (!element) return { present: false };
    return {
      present: true,
      paused: element.paused,
      currentTime: element.currentTime,
      duration: Number.isFinite(element.duration) ? Math.round(element.duration * 10) / 10 : -1,
      source: (element.currentSrc || element.src || '').slice(0, 32),
    };
  });
  console.log(`      (audio element: ${JSON.stringify(audio)})`);
  check(
    'the alarm clip decodes and is actually playing',
    audio.present && audio.paused === false && audio.currentTime > 0,
    JSON.stringify(audio)
  );
  check(
    'the clip is the two-second loop the app synthesised',
    audio.duration >= 1.9 && audio.duration <= 2.1,
    `duration ${audio.duration}`
  );
  check(
    'the clip came from an in-memory blob, not a network fetch',
    audio.source.startsWith('blob:'),
    audio.source
  );

  const sensorHint = await page.evaluate(() => document.body.innerText);
  check(
    'the sensor path is used, not the tap fallback',
    !sensorHint.includes('未检测到传感器'),
    'fell back to touch simulation'
  );

  await stopMotion(page);

  // ---- anti-cheat: a machine-steady rhythm must not count ----------------
  // This is the app's headline claim ("加速度计频率方差分析"), so it is worth
  // proving the fan-on-the-nightstand case really is refused.
  await page.evaluate(() => {
    localStorage.removeItem('active_ring_v1');
  });
  await page.reload({ waitUntil: 'load' });
  await page.goto(`${HASH}#/task/e2e-alarm`, { waitUntil: 'load' });
  await page.waitForSelector('text=开始任务', { timeout: 10_000 });

  await startMotion(page, 'mechanical');
  await page.getByRole('button', { name: '开始任务' }).click();

  // The detector needs a full window of strokes before it can judge, so the
  // first second or so legitimately counts. What matters is that it then stops.
  await page.waitForTimeout(2500);
  const early = await readProgress(page);
  await page.waitForTimeout(4000);
  const later = await readProgress(page);
  const mechanicalText = await page.evaluate(() => document.body.innerText);
  await stopMotion(page);

  console.log(
    `      (machine rhythm: ${early}% after 2.5 s, ${later}% after 6.5 s; unblocked would be 65%)`
  );
  check(
    'a machine-steady rhythm is stopped, not just slowed',
    later === early && later < 30,
    `${early}% then ${later}%`
  );
  check(
    'and the user is told why',
    mechanicalText.includes('机械性晃动'),
    mechanicalText.replace(/\s+/g, ' ').slice(0, 80)
  );

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

  // ---- interrupt penalty -------------------------------------------------
  // The rule "stop moving and the progress resets" had only ever been unit
  // tested; this drives it through the real timer and detector.
  await page.evaluate(alarm => {
    localStorage.removeItem('active_ring_v1');
    localStorage.removeItem('snoozed_alarm_v1');
    localStorage.setItem('alarms_v1', JSON.stringify([alarm]));
  }, makeAlarm({
    id: 'e2e-interrupt',
    config: {
      ...makeAlarm().config,
      duration: 20,
      interruptTolerance: 1,
      difficulty: 'medium',
    },
  }));
  await page.evaluate(() => {
    location.hash = '#/';
  });
  await page.reload({ waitUntil: 'load' });
  await page.goto(`${HASH}#/task/e2e-interrupt`, { waitUntil: 'load' });
  await page.waitForSelector('text=开始任务', { timeout: 10_000 });

  await startMotion(page, 'shake');
  await page.getByRole('button', { name: '开始任务' }).click();
  await page.waitForTimeout(2000);
  const beforePause = await readProgress(page);
  await stopMotion(page);
  // One second of tolerance, plus the 1.5 s recovery screen.
  await page.waitForTimeout(6000);

  const afterPause = await readProgress(page);
  const interruptText = await page.evaluate(() => document.body.innerText);
  check('shaking builds progress before the pause', beforePause > 0, `${beforePause}%`);
  check('pausing resets the progress to zero', afterPause === 0, `${afterPause}%`);
  check(
    'the interruption is counted and the buzz intensified',
    /中断\s*1\s*次/.test(interruptText) && /强度\s*\+20%/.test(interruptText),
    interruptText.replace(/\s+/g, ' ').slice(0, 90)
  );

  // ---- one tap, even when it arrives twice ------------------------------
  // Both start buttons begin with an await, so a hurried thumb used to start a
  // second elapsed timer — and the clock ran at double speed.
  await page.evaluate(alarm => {
    localStorage.removeItem('active_ring_v1');
    localStorage.setItem('alarms_v1', JSON.stringify([alarm]));
  }, makeAlarm({
    id: 'e2e-double-tap',
    config: {
      ...makeAlarm().config,
      taskType: 'shake',
      duration: 120,
      interruptTolerance: 15,
    },
  }));
  await page.evaluate(() => {
    location.hash = '#/';
  });
  await page.reload({ waitUntil: 'load' });
  await page.goto(`${HASH}#/task/e2e-double-tap`, { waitUntil: 'load' });
  await page.waitForSelector('text=开始任务', { timeout: 10_000 });

  await page.evaluate(() => {
    const button = Array.from(document.querySelectorAll('button')).find(candidate =>
      candidate.textContent?.includes('开始任务')
    );
    // Two taps in the same tick: the second lands while the first is awaiting.
    button.click();
    button.click();
  });

  await startMotion(page, 'shake');
  await page.waitForTimeout(5000);
  await stopMotion(page);

  const elapsed = await page.evaluate(() => {
    const match = document.body.innerText.match(/已用时\s*(\d+)\s*秒/);
    return match ? Number(match[1]) : -1;
  });
  console.log(`      (elapsed reads ${elapsed} s after about five — double time would be ~10)`);
  check(
    'a double tap does not start two elapsed timers',
    elapsed > 0 && elapsed <= 7,
    `已用时 ${elapsed} 秒 after about five`
  );

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

  // The completed screen is taller than a small phone; if the body were still
  // `overflow: hidden` the buttons would be clipped out of reach.
  check(
    'the body lock is released on the completion screen',
    await page.evaluate(() => !document.body.classList.contains('task-locked'))
  );

  await page.setViewportSize({ width: 360, height: 560 });
  await page.waitForTimeout(300);
  const homeButton = page.getByRole('button', { name: '返回首页' });
  check(
    'the completion screen still offers a reachable way out on a small phone',
    (await homeButton.count()) > 0 && (await homeButton.isVisible())
  );
  await page.setViewportSize({ width: 393, height: 851 });

  check(
    'completing the task clears the ring',
    (await page.evaluate(() => localStorage.getItem('active_ring_v1'))) === 'null'
  );

  await page.evaluate(() => {
    location.hash = '#/';
  });
  await page.waitForTimeout(700);
  check('after completion the user may leave', page.url().endsWith('#/'), page.url());

  // A finished alarm must not re-fire while it is still inside the catch-up
  // window; wait past one scheduler tick to be sure.
  await page.waitForTimeout(16_000);
  check(
    'a completed alarm does not ring again',
    page.url().endsWith('#/'),
    page.url()
  );

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

  // ---- a time that just passed must not ring on the spot ----------------
  // The countdown promises "tomorrow"; the catch-up window used to fire it
  // immediately, so the app rang the moment you saved it.
  await page.evaluate(alarm => {
    localStorage.removeItem('active_ring_v1');
    localStorage.removeItem('snoozed_alarm_v1');
    localStorage.setItem('alarms_v1', JSON.stringify([alarm]));
  }, makeAlarm({
    id: 'e2e-just-saved',
    ...dueTime,
    createdAt: Date.now(),
    updatedAt: Date.now(),
  }));
  await page.evaluate(() => {
    location.hash = '#/';
  });
  await page.reload({ waitUntil: 'load' });
  // Past one scheduler tick.
  await page.waitForTimeout(16_000);

  const escapedRing = await page.evaluate(() => localStorage.getItem('active_ring_v1'));
  check(
    'an alarm saved for a time that just passed does not ring immediately',
    !String(escapedRing ?? '').includes('e2e-just-saved'),
    `ring=${escapedRing} url=${page.url()}`
  );

  // ---- creating an alarm through the UI --------------------------------
  // The whole feature depends on this journey, and nothing had exercised it.
  await page.evaluate(() => {
    localStorage.removeItem('alarms_v1');
    localStorage.removeItem('active_ring_v1');
    localStorage.removeItem('snoozed_alarm_v1');
    location.hash = '#/';
  });
  await page.reload({ waitUntil: 'load' });
  await page.goto(`${HASH}#/edit/new`, { waitUntil: 'load' });
  await page.waitForSelector('text=新增闹钟', { timeout: 10_000 });

  const hourLabel = page.locator('span.text-5xl').first();
  const minuteLabel = page.locator('span.text-5xl').nth(1);

  await page.fill('input[type="time"]', '06:30');
  check(
    'the native time field drives the readout',
    (await hourLabel.textContent())?.trim() === '06' &&
      (await minuteLabel.textContent())?.trim() === '30',
    `${await hourLabel.textContent()}:${await minuteLabel.textContent()}`
  );

  await page.getByRole('button', { name: '▲' }).first().click();
  check('the arrow buttons still nudge the hour', (await hourLabel.textContent())?.trim() === '07');
  await page.getByRole('button', { name: '▼' }).first().click();
  check('and nudge it back down', (await hourLabel.textContent())?.trim() === '06');

  await page.fill('input[type="text"]', 'E2E 新建');
  await page.getByRole('button', { name: /原地踏步/ }).click();
  await page.getByRole('button', { name: '保存' }).click();

  await page.waitForFunction(() => location.hash === '#/' || location.hash === '', null, {
    timeout: 10_000,
  });
  check('saving returns to the home screen', page.url().endsWith('#/'), page.url());

  const created = await page.evaluate(() => {
    const raw = JSON.parse(localStorage.getItem('alarms_v1') || '[]');
    return raw[0] ?? null;
  });
  check(
    'the alarm is stored with the chosen time and task',
    created?.hour === 6 && created?.minute === 30 && created?.config?.taskType === 'steps',
    JSON.stringify(created && { hour: created.hour, minute: created.minute, task: created.config?.taskType })
  );
  check(
    'the new alarm is announced on the home screen',
    (await page.evaluate(() => document.body.innerText)).includes('E2E 新建')
  );

  // The card used to say 仅一次 when no day was selected while the scheduler ran
  // it daily; the default weekday set must read as 工作日.
  await page.goto(`${HASH}#/alarms`, { waitUntil: 'load' });
  await page.waitForSelector('text=E2E 新建', { timeout: 10_000 });
  check(
    'the card describes when the alarm will actually ring',
    (await page.evaluate(() => document.body.innerText)).includes('工作日')
  );

  // ---- persistence ------------------------------------------------------
  // Checked here, before the delete scenario empties the store on purpose.
  const persisted = await page.evaluate(() => localStorage.getItem('alarms_v1'));
  check(
    'alarms persist in localStorage',
    !!persisted && persisted.includes('E2E 新建'),
    String(persisted).slice(0, 80)
  );

  // ---- destructive actions are confirmed --------------------------------
  // 删除 sits right beside 测试 in the card, so on a phone the first tap must
  // not destroy anything.
  const alarmCount = () =>
    page.evaluate(() => JSON.parse(localStorage.getItem('alarms_v1') || '[]').length);

  await page.getByRole('button', { name: /删除/ }).first().click();
  const confirmDialog = page.getByRole('alertdialog');
  check(
    'deleting asks for confirmation first',
    await confirmDialog.isVisible().catch(() => false)
  );
  check('the alarm survives while the dialog is open', (await alarmCount()) === 1);

  await confirmDialog.getByRole('button', { name: '取消' }).click();
  await page.waitForTimeout(400);
  check('cancelling leaves the alarm alone', (await alarmCount()) === 1);

  await page.getByRole('button', { name: /删除/ }).first().click();
  await page.getByRole('alertdialog').getByRole('button', { name: '删除' }).click();
  await page.waitForTimeout(700);
  check('confirming removes the alarm', (await alarmCount()) === 0);
  check(
    'the empty state returns',
    (await page.evaluate(() => document.body.innerText)).includes('还没有闹钟')
  );

  // ---- stats page -------------------------------------------------------
  // Never covered before, and this round moved its duration maths.
  await page.evaluate(() => {
    const now = Date.now();
    localStorage.setItem('sessions_v1', JSON.stringify([
      { alarmId: 'a', startedAt: now - 90_000, completedAt: now - 30_000, interruptCount: 2, taskType: 'shake', difficulty: 'medium', success: true },
      { alarmId: 'b', startedAt: now - 20_000, completedAt: now - 10_000, interruptCount: 0, taskType: 'steps', difficulty: 'hard', success: true },
    ]));
  });
  await page.goto(`${HASH}#/stats`, { waitUntil: 'load' });
  await page.waitForSelector('text=起床统计', { timeout: 10_000 });
  await page.waitForTimeout(300);
  const statsText = await page.evaluate(() => document.body.innerText);
  check('the stats page renders with data', statsText.includes('起床成功率') && statsText.includes('100%'));
  check(
    'the average duration is a human duration, not a raw second count',
    statsText.includes('35秒'),
    statsText.replace(/\s+/g, ' ').slice(0, 100)
  );
  check(
    'both task names are listed',
    statsText.includes('持续摇晃') && statsText.includes('原地踏步')
  );

  // ---- every route renders without new errors ---------------------------
  // Three of these — the 404 page and the two preview screens — had no
  // coverage at all, and a route that throws is invisible until someone taps
  // it.
  const routes = [
    { hash: '#/', expect: '强制清醒' },
    { hash: '#/alarms', expect: '强制清醒' },
    { hash: '#/edit/new', expect: '新增闹钟' },
    { hash: '#/stats', expect: '起床统计' },
    { hash: '#/f6db0085-1264-4a77-b32e-fa2731e8654f', expect: '强制清醒闹钟' },
    { hash: '#/42ed530e-ac29-4218-87cd-e291989cf9c6', expect: '任务体验预览' },
    { hash: '#/no-such-page', expect: '页面不存在' },
    { hash: '#/task/missing-alarm', expect: '闹钟不存在' },
  ];

  for (const route of routes) {
    const before = pageProblems.length;
    await page.goto(`${HASH}${route.hash}`, { waitUntil: 'load' });
    await page.waitForTimeout(350);
    const text = await page.evaluate(() => document.body.innerText);

    const rendered = text.includes(route.expect);
    const quiet = pageProblems.length === before;
    check(
      `${route.hash} renders cleanly`,
      rendered && quiet,
      [
        rendered ? null : `missing "${route.expect}"`,
        quiet ? null : pageProblems.slice(before).join(' | '),
      ]
        .filter(Boolean)
        .join(' ; ')
    );
  }

  // ---- no runtime errors ------------------------------------------------
  check(
    'no uncaught errors reached the page',
    pageProblems.length === 0,
    pageProblems.slice(0, 3).join(' | ')
  );

  // ---- notification channel over a trustworthy origin -------------------
  // Chrome treats http://127.0.0.1 as a secure context, which makes this the
  // only place the service worker can register without a real certificate. The
  // HTTPS run above cannot: an untrusted certificate blocks registration
  // outright, so the app's notification path had no coverage at all.
  const notifyUrl = process.env.NOTIFY_URL || 'http://127.0.0.1:4180/';
  const notifyContext = await browser.newContext({
    ...devices['Pixel 5'],
    permissions: ['notifications'],
  });
  const notifyPage = await notifyContext.newPage();

  try {
    let reachable = true;
    try {
      await notifyPage.goto(notifyUrl, { waitUntil: 'load', timeout: 20_000 });
    } catch {
      reachable = false;
    }

    if (!reachable) {
      console.log(
        `      (notification checks skipped: ${notifyUrl} is not serving — see the file header)`
      );
    } else {
      await notifyPage.waitForSelector('#root > *', { timeout: 15_000 });

      check(
        'a loopback origin counts as a secure context',
        await notifyPage.evaluate(() => window.isSecureContext === true)
      );
      check(
        'notifications are permitted for this session',
        await notifyPage.evaluate(() => Notification.permission === 'granted')
      );

      // The app registers the worker on the first user gesture.
      await notifyPage.mouse.click(5, 5);
      const registered = await notifyPage.evaluate(async () => {
        try {
          await Promise.race([
            navigator.serviceWorker.ready,
            new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), 10_000)),
          ]);
          return true;
        } catch {
          return false;
        }
      });
      check('the notification service worker registers', registered);

      await notifyPage.evaluate(alarm => {
        localStorage.removeItem('active_ring_v1');
        localStorage.setItem('alarms_v1', JSON.stringify([alarm]));
      }, makeAlarm({ id: 'e2e-notify', ...dueTime }));
      await notifyPage.reload({ waitUntil: 'load' });
      await notifyPage.waitForSelector('text=开始任务', { timeout: 20_000 });
      await notifyPage.waitForTimeout(2000);

      const shown = await notifyPage.evaluate(async () => {
        const registration = await navigator.serviceWorker.ready;
        const list = await registration.getNotifications();
        return list.map(notification => ({ title: notification.title, tag: notification.tag }));
      });
      check(
        'the alarm raises a system notification',
        shown.some(notification => notification.tag === 'alarm-e2e-notify'),
        JSON.stringify(shown)
      );
    }
  } finally {
    await notifyContext.close();
  }
} catch (error) {
  failures.push(`exception: ${error.message}`);
  console.log(`  FAIL exception — ${error.message}`);
} finally {
  await browser.close();
}

console.log(`\n${passed} checks passed, ${failures.length} failed`);
if (failures.length) process.exit(1);
