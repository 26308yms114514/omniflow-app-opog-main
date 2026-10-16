/**
 * Synthesised alarm siren.
 *
 * The app ships no audio assets, and mobile browsers refuse to start audio
 * until a user gesture. Building the tone with the Web Audio API means:
 *   - nothing to download, so it works offline and adds no bundle weight;
 *   - no <audio> element to unlock, just `AudioContext.resume()`;
 *   - the "volume +20% per interruption" rule maps onto a real gain change.
 *
 * Android specifics this file handles:
 *   - `webkitAudioContext` on older Chrome/WebView builds;
 *   - a context created before the user's tap starts in "suspended" state, so
 *     `unlock()` must be called from inside the gesture handler;
 *   - loudspeaker output is mono and easily distorted, so everything is routed
 *     through a compressor instead of simply raising the gain.
 */

type AudioContextCtor = typeof AudioContext;

function getAudioContextCtor(): AudioContextCtor | null {
  if (typeof window === 'undefined') return null;
  const w = window as unknown as {
    AudioContext?: AudioContextCtor;
    webkitAudioContext?: AudioContextCtor;
  };
  return w.AudioContext ?? w.webkitAudioContext ?? null;
}

/** Base pitch of the siren, in Hz. */
const SWEEP_LOW = 640;
const SWEEP_HIGH = 1180;
/** How many times per second the siren sweeps up and down. */
const SWEEP_RATE = 3.2;
/** How many times per second the tone pulses on and off. */
const PULSE_RATE = 4;

export class AlarmSound {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private compressor: DynamicsCompressorNode | null = null;
  private tone: OscillatorNode | null = null;
  private sweep: OscillatorNode | null = null;
  private sweepDepth: GainNode | null = null;
  private pulse: OscillatorNode | null = null;
  private pulseDepth: GainNode | null = null;
  private gate: GainNode | null = null;
  private running = false;
  private boost = 1;
  private disposed = false;

  /** Whether the underlying AudioContext is usable right now. */
  get available(): boolean {
    return getAudioContextCtor() !== null;
  }

  /**
   * Must be called from inside a user gesture handler (a click/tap) so the
   * browser lets the context leave the "suspended" state. Safe to call often.
   */
  async unlock(): Promise<boolean> {
    const Ctor = getAudioContextCtor();
    if (!Ctor || this.disposed) return false;

    if (!this.ctx) {
      this.ctx = new Ctor();
      this.buildGraph(this.ctx);
    }
    if (this.ctx.state === 'suspended') {
      try {
        await this.ctx.resume();
      } catch {
        return false;
      }
    }
    return this.ctx.state === 'running';
  }

  private buildGraph(ctx: AudioContext) {
    // Compressor keeps the boosted signal loud without hard clipping on a
    // phone speaker, which is what makes "volume +20%" actually perceivable.
    const compressor = ctx.createDynamicsCompressor();
    compressor.threshold.value = -18;
    compressor.knee.value = 6;
    compressor.ratio.value = 12;
    compressor.attack.value = 0.003;
    compressor.release.value = 0.25;
    compressor.connect(ctx.destination);

    const master = ctx.createGain();
    master.gain.value = this.gainForBoost();
    master.connect(compressor);

    // Pulsing gate: a square LFO biased so the gain swings between 0 and 1.
    const gate = ctx.createGain();
    gate.gain.value = 0.5;
    gate.connect(master);

    const pulse = ctx.createOscillator();
    pulse.type = 'square';
    pulse.frequency.value = PULSE_RATE;
    const pulseDepth = ctx.createGain();
    pulseDepth.gain.value = 0.5;
    pulse.connect(pulseDepth);
    pulseDepth.connect(gate.gain);

    // Siren tone with its own frequency sweep.
    const tone = ctx.createOscillator();
    tone.type = 'square';
    tone.frequency.value = (SWEEP_LOW + SWEEP_HIGH) / 2;
    tone.connect(gate);

    const sweep = ctx.createOscillator();
    sweep.type = 'sine';
    sweep.frequency.value = SWEEP_RATE;
    const sweepDepth = ctx.createGain();
    sweepDepth.gain.value = (SWEEP_HIGH - SWEEP_LOW) / 2;
    sweep.connect(sweepDepth);
    sweepDepth.connect(tone.frequency);

    this.compressor = compressor;
    this.master = master;
    this.gate = gate;
    this.pulse = pulse;
    this.pulseDepth = pulseDepth;
    this.tone = tone;
    this.sweep = sweep;
    this.sweepDepth = sweepDepth;
  }

  private gainForBoost(): number {
    // Base level stays moderate; the compressor does the heavy lifting.
    return Math.min(0.35 * this.boost, 1);
  }

  /** Start (or restart) the siren. No-op when already running. */
  start(): void {
    if (this.disposed || !this.ctx || this.running) return;
    if (this.ctx.state !== 'running') return;
    this.running = true;
    const now = this.ctx.currentTime;
    try {
      this.pulse?.start(now);
      this.tone?.start(now);
      this.sweep?.start(now);
    } catch {
      // Already started (can happen after an interrupted stop) — ignore.
    }
  }

  /** Silence the siren but keep the graph alive so it can restart instantly. */
  stop(): void {
    if (!this.running || !this.ctx) return;
    this.running = false;
    try {
      this.pulse?.stop();
      this.tone?.stop();
      this.sweep?.stop();
    } catch {
      // Already stopped.
    }
    // Oscillators cannot be restarted, so rebuild them for the next round.
    this.pulse?.disconnect();
    this.tone?.disconnect();
    this.sweep?.disconnect();
    this.sweepDepth?.disconnect();
    this.pulseDepth?.disconnect();
    this.gate?.disconnect();
    this.pulse = null;
    this.tone = null;
    this.sweep = null;
    this.sweepDepth = null;
    this.pulseDepth = null;
    this.gate = null;
    if (this.ctx && this.master) {
      const ctx = this.ctx;
      const master = this.master;
      const compressor = this.compressor;
      // Rebuild a fresh, silent graph ready to start again.
      this.master = null;
      this.compressor = null;
      master.disconnect();
      compressor?.disconnect();
      this.buildGraph(ctx);
    }
  }

  get isRunning(): boolean {
    return this.running;
  }

  /**
   * Volume multiplier used by the interruption penalty (1 = normal).
   * Takes effect immediately, including while the siren is sounding.
   */
  setBoost(multiplier: number): void {
    this.boost = Math.max(0.2, multiplier);
    if (!this.ctx || !this.master) return;
    const gain = this.gainForBoost();
    // A short ramp avoids a click in the speaker.
    this.master.gain.setTargetAtTime(gain, this.ctx.currentTime, 0.02);
  }

  /** Release the AudioContext. The instance is unusable afterwards. */
  dispose(): void {
    this.stop();
    this.disposed = true;
    const ctx = this.ctx;
    this.ctx = null;
    this.master = null;
    this.compressor = null;
    if (ctx) {
      void ctx.close().catch(() => {});
    }
  }
}

/** Single shared instance so the siren survives route changes. */
let shared: AlarmSound | null = null;

export function getAlarmSound(): AlarmSound {
  if (!shared) shared = new AlarmSound();
  return shared;
}
