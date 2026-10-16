/**
 * Device-motion helpers tuned for Android browsers.
 *
 * Key platform facts this module encodes:
 *   - Android Chrome exposes `devicemotion` without an explicit permission
 *     prompt, but only on a secure origin (https or localhost).
 *   - iOS 13+ requires `DeviceMotionEvent.requestPermission()` from inside a
 *     user gesture. Android has no such method, which is why the check is
 *     feature-based rather than user-agent based.
 *   - Desktop browsers fire no `devicemotion` at all, so the app needs a
 *     tactile fallback there — but that fallback must stay OFF on a real
 *     phone, otherwise tapping the screen replaces shaking.
 */

export type MotionAvailability =
  | 'granted'
  | 'denied'
  | 'unsupported'
  | 'not-required';

export interface AccelSample {
  x: number;
  y: number;
  z: number;
}

export type Sensitivity = 'low' | 'medium' | 'high';

/**
 * Shake magnitude (m/s²) needed to count as movement, per sensitivity setting.
 * Lower value = more sensitive = easier to satisfy.
 */
const THRESHOLDS: Record<Sensitivity, number> = {
  high: 8,
  medium: 15,
  low: 24,
};

export function thresholdForSensitivity(sensitivity: Sensitivity): number {
  return THRESHOLDS[sensitivity] ?? THRESHOLDS.medium;
}

/** True when the platform can emit `devicemotion` events at all. */
export function isDeviceMotionSupported(): boolean {
  if (typeof window === 'undefined') return false;
  return 'DeviceMotionEvent' in window;
}

/** True on iOS 13+, where an explicit in-gesture permission prompt is needed. */
export function isMotionPermissionRequired(): boolean {
  if (!isDeviceMotionSupported()) return false;
  const ctor = window.DeviceMotionEvent as unknown as {
    requestPermission?: () => Promise<'granted' | 'denied'>;
  };
  return typeof ctor.requestPermission === 'function';
}

/**
 * Ask for motion access. MUST be awaited from inside a user gesture on iOS;
 * on Android it resolves immediately as 'not-required'.
 */
export async function requestMotionAccess(): Promise<MotionAvailability> {
  if (!isDeviceMotionSupported()) return 'unsupported';

  if (!isMotionPermissionRequired()) {
    // Android / desktop: nothing to ask for.
    return 'not-required';
  }

  try {
    const ctor = window.DeviceMotionEvent as unknown as {
      requestPermission: () => Promise<'granted' | 'denied'>;
    };
    const result = await ctor.requestPermission();
    return result === 'granted' ? 'granted' : 'denied';
  } catch {
    // Thrown when not called from a user gesture.
    return 'denied';
  }
}

/** Pull a usable acceleration sample out of a `devicemotion` event. */
export function readAcceleration(e: DeviceMotionEvent): AccelSample | null {
  const acc = e.accelerationIncludingGravity ?? e.acceleration;
  if (!acc) return null;
  const { x, y, z } = acc;
  if (x === null && y === null && z === null) return null;
  return { x: x ?? 0, y: y ?? 0, z: z ?? 0 };
}

/** Euclidean distance between two acceleration samples, in m/s². */
export function accelerationDelta(a: AccelSample, b: AccelSample): number {
  return Math.sqrt(
    (a.x - b.x) ** 2 + (a.y - b.y) ** 2 + (a.z - b.z) ** 2
  );
}

/**
 * Whether the platform will accept a vibration call right now.
 *
 * Chrome refuses — and logs a console error for — vibration from a frame the
 * user has never interacted with ("Blocked call to navigator.vibrate…"), so
 * every caller checks first. Reporting a refusal we cannot see would be worse
 * than not asking: it is silent, and this app vibrates as its alarm.
 */
export function vibrationAllowed(): boolean {
  if (typeof navigator === 'undefined' || typeof navigator.vibrate !== 'function') {
    return false;
  }
  const activation = (navigator as unknown as {
    userActivation?: { hasBeenActive?: boolean };
  }).userActivation;
  // Absent on browsers that do not implement the flag; assume allowed there.
  return activation?.hasBeenActive !== false;
}

/** Feature-detected one-shot vibration. Android supports it; iOS Safari does not. */
export function vibrate(pattern: number | number[]): boolean {
  if (!vibrationAllowed()) return false;
  try {
    return navigator.vibrate(pattern);
  } catch {
    return false;
  }
}
