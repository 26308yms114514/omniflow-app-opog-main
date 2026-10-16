/**
 * Alarm tone test.
 *
 * Run from the repository root with:
 *   node node_modules/tsx/dist/cli.mjs frontend/src/lib/alarm-tone.test.ts
 *
 * The PCM and the WAV container are pure maths, so they can be checked without
 * a browser — which matters, because a malformed header is exactly the kind of
 * fault that shows up as "no sound" and nothing else.
 */
import assert from 'node:assert/strict';
import { AlarmTone, buildSirenPcm, intensityToVolume, wrapWav } from './alarm-tone';

let passed = 0;
function check(name: string, fn: () => void) {
  fn();
  passed += 1;
  console.log(`  ok  ${name}`);
}

function readAscii(bytes: Uint8Array, offset: number, length: number) {
  return String.fromCharCode(...bytes.slice(offset, offset + length));
}

console.log('alarm-tone');

check('the clip is the requested length', () => {
  assert.equal(buildSirenPcm({ sampleRate: 1000, seconds: 2 }).length, 2000);
  assert.equal(buildSirenPcm({ sampleRate: 16_000, seconds: 2 }).length, 32_000);
  assert.equal(buildSirenPcm({ seconds: 0 }).length, 0);
});

check('the waveform is loud enough to hear and does not clip', () => {
  const pcm = buildSirenPcm({ amplitude: 0.7 });
  let peak = 0;
  for (const sample of pcm) peak = Math.max(peak, Math.abs(sample));
  // 0.7 of full scale is about 22937.
  assert.ok(peak > 20_000 && peak <= 32_767, `peak ${peak}`);
});

check('the sweep actually changes pitch', () => {
  const pcm = buildSirenPcm({ sampleRate: 16_000, seconds: 1 });
  // Count zero crossings in the first and last tenth of a second; a sweeping
  // siren must not have the same rate throughout.
  const crossings = (from: number, to: number) => {
    let count = 0;
    for (let i = from + 1; i < to; i += 1) {
      if (pcm[i - 1] <= 0 !== (pcm[i] <= 0)) count += 1;
    }
    return count;
  };
  const early = crossings(0, 1600);
  const late = crossings(14_400, 16_000);
  assert.ok(early > 0 && late > 0);
  assert.notEqual(early, late, `early ${early} vs late ${late}`);
});

check('the loop point is continuous in level', () => {
  // A jump at the seam is an audible click every two seconds, all night.
  const pcm = buildSirenPcm({ sampleRate: 16_000, seconds: 2 });
  const last = pcm[pcm.length - 1];
  const first = pcm[0];
  assert.ok(Math.abs(last - first) < 3000, `seam ${last} -> ${first}`);
});

check('a whole number of sweeps is what makes the seam clean', () => {
  // Two whole sweeps: the waveform and its slope match where it loops.
  const whole = buildSirenPcm({ sampleRate: 16_000, seconds: 2, sweepHz: 1 });
  const wholeSeam = Math.abs(whole[whole.length - 1] - whole[0]);

  // 2.25 sweeps: the seam lands mid-sweep, so looping clicks.
  const partial = buildSirenPcm({ sampleRate: 16_000, seconds: 2.25, sweepHz: 1 });
  const partialSeam = Math.abs(partial[partial.length - 1] - partial[0]);

  assert.ok(
    wholeSeam < 3000,
    `whole-number seam should be small, got ${wholeSeam}`
  );
  assert.ok(
    wholeSeam < partialSeam,
    `whole ${wholeSeam} should beat partial ${partialSeam}`
  );
});

check('the WAV header is well formed', () => {
  const pcm = buildSirenPcm({ sampleRate: 16_000, seconds: 1 });
  const wav = wrapWav(pcm, 16_000);

  assert.equal(readAscii(wav, 0, 4), 'RIFF');
  assert.equal(readAscii(wav, 8, 4), 'WAVE');
  assert.equal(readAscii(wav, 12, 4), 'fmt ');
  assert.equal(readAscii(wav, 36, 4), 'data');

  const view = new DataView(wav.buffer, wav.byteOffset, wav.byteLength);
  assert.equal(view.getUint32(16, true), 16, 'fmt chunk size');
  assert.equal(view.getUint16(20, true), 1, 'PCM format tag');
  assert.equal(view.getUint16(22, true), 1, 'mono');
  assert.equal(view.getUint32(24, true), 16_000, 'sample rate');
  assert.equal(view.getUint32(28, true), 32_000, 'byte rate');
  assert.equal(view.getUint16(32, true), 2, 'block align');
  assert.equal(view.getUint16(34, true), 16, 'bits per sample');
  assert.equal(view.getUint32(40, true), pcm.length * 2, 'data size');
  // RIFF size covers everything after the first eight bytes.
  assert.equal(view.getUint32(4, true), wav.length - 8);
  assert.equal(wav.length, 44 + pcm.length * 2);
});

check('the samples survive the round trip', () => {
  const pcm = buildSirenPcm({ sampleRate: 16_000, seconds: 1 });
  const wav = wrapWav(pcm, 16_000);
  const view = new DataView(wav.buffer, wav.byteOffset, wav.byteLength);
  assert.equal(view.getInt16(44, true), pcm[0]);
  assert.equal(view.getInt16(44 + 2 * 100, true), pcm[100]);
  assert.equal(view.getInt16(wav.length - 2, true), pcm[pcm.length - 1]);
});

check('the clip stays small enough to hold in memory', () => {
  const wav = wrapWav(buildSirenPcm(), 16_000);
  assert.ok(wav.length < 100_000, `${wav.length} bytes`);
});

check('intensity maps to a volume that leaves the penalty room', () => {
  assert.ok(Math.abs(intensityToVolume(1) - 0.7) < 1e-9);
  assert.ok(Math.abs(intensityToVolume(2) - 1) < 1e-9, 'the cap is full scale');
  assert.ok(intensityToVolume(1.2) > intensityToVolume(1));
  assert.equal(intensityToVolume(99), 1);
  assert.equal(intensityToVolume(Number.NaN), 0.7);
  assert.ok(intensityToVolume(0.2) > 0, 'never silent');
});

console.log(`\n${passed} checks passed`);

// --- playback lifecycle, with the media element stubbed -------------------
//
// The priming race cannot be seen without stubbing: it needs play() to still
// be in flight when start() arrives. On a real phone that happens whenever the
// page's first tap *is* the 开始任务 button, and the symptom is a silent alarm
// with nothing in the console — exactly what cost the first device test.

class FakeAudio {
  paused = true;
  currentTime = 0;
  muted = false;
  volume = 1;
  loop = false;
  preload = '';
  src = '';
  // Several plays can be outstanding at once — priming and the alarm — so this
  // is a list. Overwriting a single resolver is what made the first version of
  // this test hang.
  private pending: Array<() => void> = [];

  constructor(public deferred = false) {}

  play(): Promise<void> {
    this.paused = false;
    if (!this.deferred) return Promise.resolve();
    return new Promise<void>(resolve => {
      this.pending.push(resolve);
    });
  }

  pause(): void {
    this.paused = true;
  }

  setAttribute(): void {
    /* not needed */
  }

  finishPlay(): void {
    const waiting = this.pending;
    this.pending = [];
    for (const resolve of waiting) resolve();
  }
}

let lastElement: FakeAudio | null = null;

function installFakeAudio(deferred: boolean) {
  lastElement = null;
  // `isSupported` deliberately requires a window, so the stub needs one.
  Object.defineProperty(globalThis, 'window', {
    configurable: true,
    writable: true,
    value: globalThis,
  });
  Object.defineProperty(globalThis, 'Audio', {
    configurable: true,
    writable: true,
    value: function FakeAudioConstructor(this: unknown) {
      const element = new FakeAudio(deferred);
      lastElement = element;
      return element;
    },
  });
}

const objectUrls = new Set<string>();
if (typeof URL.createObjectURL !== 'function') {
  (URL as unknown as { createObjectURL: (b: unknown) => string }).createObjectURL = () => {
    const url = `blob:test/${objectUrls.size}`;
    objectUrls.add(url);
    return url;
  };
  (URL as unknown as { revokeObjectURL: (u: string) => void }).revokeObjectURL = () => {};
}

async function lifecycle(name: string, fn: () => Promise<void>) {
  await fn();
  passed += 1;
  console.log(`  ok  ${name}`);
}

console.log('\nalarm-tone lifecycle');

await lifecycle('priming does not pause an alarm that started meanwhile', async () => {
  installFakeAudio(true);
  const tone = new AlarmTone();

  const priming = tone.unlock(); // in flight: play() has not resolved
  tone.start(); // the user's first tap was 开始任务
  const element = lastElement;

  element!.finishPlay();
  await priming;

  assert.equal(element!.paused, false, 'priming paused the running alarm');
  assert.equal(element!.muted, false, 'priming left the alarm muted');
});

await lifecycle('priming is inaudible when no alarm is running', async () => {
  installFakeAudio(false);
  const tone = new AlarmTone();
  await tone.unlock();
  assert.equal(lastElement!.paused, true, 'priming left the element playing');
  assert.equal(lastElement!.muted, false, 'priming left the element muted');
});

await lifecycle('starting clears a mute left behind by priming', async () => {
  installFakeAudio(false);
  const tone = new AlarmTone();
  await tone.unlock(); // creates the element and leaves it muted mid-flight
  lastElement!.muted = true;
  tone.start();
  assert.equal(lastElement!.muted, false, 'a muted alarm is a silent alarm');
  assert.equal(lastElement!.paused, false);
});

await lifecycle('priming happens once, however many gestures arrive', async () => {
  installFakeAudio(false);
  const tone = new AlarmTone();
  await tone.unlock();
  const first = lastElement;
  await tone.unlock();
  assert.equal(lastElement, first, 'a second element was created');
});

await lifecycle('stop silences the element', async () => {
  installFakeAudio(false);
  const tone = new AlarmTone();
  tone.start();
  tone.stop();
  assert.equal(lastElement!.paused, true);
  assert.equal(tone.isRunning, false);
});

console.log(`\n${passed} checks passed in total`);
