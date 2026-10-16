/**
 * The alarm, as one thing with two mechanisms.
 *
 * Sound and vibration are separate APIs with separate failure modes — an
 * `<audio>` element is refused without a prior gesture, `navigator.vibrate` is
 * refused while the document is hidden and does not exist at all on iOS — so
 * they fire together and either may cover for the other. Keeping them behind a
 * single object means the scheduler still owns "is the alarm sounding?" in one
 * place instead of growing a second set of rules.
 */
import { AlarmTone, getAlarmTone } from './alarm-tone';
import { VibrationAlarm, getVibrationAlarm } from './vibration-alarm';

export interface AlarmChannels {
  tone: boolean;
  vibration: boolean;
}

export class AlarmOutput {
  constructor(
    private readonly tone: AlarmTone = getAlarmTone(),
    private readonly buzz: VibrationAlarm = getVibrationAlarm()
  ) {}

  get toneSupported(): boolean {
    return this.tone.isSupported;
  }

  get vibrationSupported(): boolean {
    return this.buzz.isSupported;
  }

  /** Prime the audible channel. Must be called from inside a user gesture. */
  async unlock(): Promise<boolean> {
    return this.tone.unlock();
  }

  /** Set both channels going. Either may report false and the other covers. */
  start(): AlarmChannels {
    return {
      tone: this.tone.start(),
      vibration: this.buzz.start(),
    };
  }

  stop(): void {
    this.tone.stop();
    this.buzz.stop();
  }

  /** Escalate both channels together as the interruption penalty grows. */
  setIntensity(level: number): void {
    this.tone.setIntensity(level);
    this.buzz.setIntensity(level);
  }

  /**
   * Whether anything is actually alarming right now. Both mechanisms report
   * asynchronously — a blocked `play()` resolves later — so the scheduler
   * re-reads this on every tick and retries, which is also how the alarm
   * recovers once the user finally touches the page.
   */
  get isRunning(): boolean {
    return this.tone.isRunning || this.buzz.isRunning;
  }

  get channels(): AlarmChannels {
    return { tone: this.tone.isRunning, vibration: this.buzz.isRunning };
  }
}

let shared: AlarmOutput | null = null;

export function getAlarmOutput(): AlarmOutput {
  if (!shared) shared = new AlarmOutput();
  return shared;
}
