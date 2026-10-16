/**
 * Audible alarm channel.
 *
 * The first attempt used Web Audio and produced nothing on a real Android
 * phone. This is the second attempt with a different mechanism: an `<audio>`
 * element looping a WAV the app synthesises into memory. It avoids the
 * AudioContext state machine entirely — no suspended context to forget to
 * resume, no gain graph to mis-route — and plays through the system media
 * stream, which is what a web alarm normally does.
 *
 * It is a *second* channel, not a replacement: vibration still runs whenever
 * the platform allows it, and a notification still covers a locked screen.
 *
 * The waveform is pure maths so the PCM can be tested without a browser.
 */

const TWO_PI = Math.PI * 2;

export interface SirenOptions {
  sampleRate?: number;
  /** Centre frequency of the sweep, in Hz. */
  baseHz?: number;
  /** How far above and below the centre the sweep reaches, in Hz. */
  depthHz?: number;
  /** Sweeps per second. */
  sweepHz?: number;
  seconds?: number;
  amplitude?: number;
}

/**
 * A seamlessly looping siren as 16-bit mono PCM.
 *
 * The frequency sweeps continuously as `base + depth·sin(2π·sweep·t)` and the
 * phase is the integral of that, so as long as the clip holds a whole number
 * of sweeps the waveform and its slope match at the loop point. That is why
 * there is no click when it repeats hour after hour.
 */
export function buildSirenPcm(options: SirenOptions = {}): Int16Array {
  const {
    sampleRate = 16_000,
    baseHz = 700,
    depthHz = 350,
    sweepHz = 1,
    seconds = 2,
    amplitude = 0.7,
  } = options;

  const count = Math.max(0, Math.round(sampleRate * seconds));
  const samples = new Int16Array(count);
  const safeAmplitude = Math.min(1, Math.max(0, amplitude));

  for (let i = 0; i < count; i += 1) {
    const t = i / sampleRate;
    // ∫ 2π·(base + depth·sin(2π·sweep·t)) dt
    const phase = TWO_PI * baseHz * t - (depthHz / sweepHz) * Math.cos(TWO_PI * sweepHz * t);
    samples[i] = Math.round(Math.sin(phase) * safeAmplitude * 32767);
  }

  return samples;
}

/** Wrap PCM in a 44-byte RIFF/WAVE header so a browser will decode it. */
export function wrapWav(pcm: Int16Array, sampleRate = 16_000): Uint8Array<ArrayBuffer> {
  const dataBytes = pcm.length * 2;
  const buffer = new ArrayBuffer(44 + dataBytes);
  const view = new DataView(buffer);

  const writeAscii = (offset: number, text: string) => {
    for (let i = 0; i < text.length; i += 1) view.setUint8(offset + i, text.charCodeAt(i));
  };

  const channels = 1;
  const bitsPerSample = 16;
  const byteRate = (sampleRate * channels * bitsPerSample) / 8;

  writeAscii(0, 'RIFF');
  view.setUint32(4, 36 + dataBytes, true);
  writeAscii(8, 'WAVE');
  writeAscii(12, 'fmt ');
  view.setUint32(16, 16, true); // PCM chunk size
  view.setUint16(20, 1, true); // PCM format
  view.setUint16(22, channels, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, byteRate, true);
  view.setUint16(32, (channels * bitsPerSample) / 8, true); // block align
  view.setUint16(34, bitsPerSample, true);
  writeAscii(36, 'data');
  view.setUint32(40, dataBytes, true);

  for (let i = 0; i < pcm.length; i += 1) {
    view.setInt16(44 + i * 2, pcm[i], true);
  }

  return new Uint8Array(buffer);
}

/** How loud a given intensity multiplier should be, capped at full scale. */
export function intensityToVolume(intensity: number): number {
  if (!Number.isFinite(intensity)) return 0.7;
  const clamped = Math.min(2, Math.max(0.2, intensity));
  // 1.0 maps to 0.7 rather than 1.0 so the interruption penalty has somewhere
  // to go; a phone whose media volume is low can still not exceed the system
  // setting, which the environment checklist warns about.
  return Math.min(1, 0.7 * clamped);
}

export class AlarmTone {
  private element: HTMLAudioElement | null = null;
  private objectUrl: string | null = null;
  private intensity = 1;
  private running = false;
  /** Set the instant start() is called, before play() has resolved. */
  private startRequested = false;
  private priming: Promise<boolean> | null = null;

  get isSupported(): boolean {
    return typeof window !== 'undefined' && typeof Audio === 'function';
  }

  get isRunning(): boolean {
    return this.running;
  }

  /**
   * Prime playback from inside a user gesture. The browser allows later
   * programmatic plays once an element has been played by a gesture, which is
   * what makes an alarm hours later possible.
   *
   * Played muted and then paused so priming itself is inaudible — but if the
   * alarm starts while this is still awaiting, it is left running and unmuted.
   * Pausing there would silently stop the very thing being unlocked, which is
   * precisely the fault the first phone test could not see.
   */
  async unlock(): Promise<boolean> {
    if (!this.isSupported) return false;
    if (!this.priming) this.priming = this.prime();
    return this.priming;
  }

  private async prime(): Promise<boolean> {
    try {
      const element = this.ensureElement();
      element.muted = true;
      await element.play();

      if (!this.startRequested) {
        element.pause();
        element.currentTime = 0;
      }
      element.muted = false;
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Begin sounding. Returns false only when the platform cannot play audio at
   * all; a blocked autoplay resolves later through `isRunning`, which the
   * scheduler re-checks on every tick and retries.
   */
  start(): boolean {
    if (!this.isSupported) return false;
    const element = this.ensureElement();
    element.loop = true;
    // Never inherit the muted state priming leaves behind: a muted alarm is
    // indistinguishable from a broken one.
    element.muted = false;
    element.volume = intensityToVolume(this.intensity);
    this.startRequested = true;

    const played = element.play();
    if (played && typeof played.then === 'function') {
      played.then(
        () => {
          this.running = true;
        },
        () => {
          this.running = false;
        }
      );
    }
    return true;
  }

  stop(): void {
    this.running = false;
    this.startRequested = false;
    if (!this.element) return;
    try {
      this.element.pause();
      this.element.currentTime = 0;
    } catch {
      // Nothing to stop if the element was never playable.
    }
  }

  /** Louder, up to the system's own ceiling. Takes effect mid-alarm. */
  setIntensity(level: number): void {
    this.intensity = Number.isFinite(level) ? Math.min(2, Math.max(0.2, level)) : 1;
    if (this.element) this.element.volume = intensityToVolume(this.intensity);
  }

  dispose(): void {
    this.stop();
    if (this.objectUrl) {
      URL.revokeObjectURL(this.objectUrl);
      this.objectUrl = null;
    }
    this.element = null;
  }

  private ensureElement(): HTMLAudioElement {
    if (this.element) return this.element;

    const wav = wrapWav(buildSirenPcm());
    this.objectUrl = URL.createObjectURL(new Blob([wav], { type: 'audio/wav' }));

    const element = new Audio(this.objectUrl);
    element.loop = true;
    element.preload = 'auto';
    // Keeps the alarm on the media stream on Android, where routing a Web
    // Audio graph to the speaker is the part that silently failed.
    element.setAttribute('playsinline', '');
    // Attached to the document rather than left detached: it renders nothing
    // without `controls`, and being in the tree is what lets a test — or the
    // user's own dev tools — see whether the clip decoded and is advancing.
    // The first phone test reported "no sound" with nothing observable to
    // explain it, which must not be possible again.
    if (typeof document !== 'undefined' && document.body) {
      document.body.appendChild(element);
    }
    this.element = element;
    return element;
  }
}

let shared: AlarmTone | null = null;

export function getAlarmTone(): AlarmTone {
  if (!shared) shared = new AlarmTone();
  return shared;
}
