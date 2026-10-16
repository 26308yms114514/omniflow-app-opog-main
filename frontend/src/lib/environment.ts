/**
 * Runtime capability check.
 *
 * The Android failure modes this app has are all silent: a non-HTTPS origin
 * withholds `DeviceMotionEvent`, a denied permission withholds notifications,
 * and a browser without `navigator.vibrate` withholds the alarm entirely.
 * None of them throw. This turns those into a visible checklist so a phone can
 * be diagnosed in seconds instead of by guessing why nothing happened.
 *
 * `evaluateEnvironment` is pure so the rules can be tested without a browser.
 */
import { isDeviceMotionSupported } from './motion';
import { notificationPermission, type NotifyPermission } from './notify';

export type CapabilityLevel = 'critical' | 'recommended' | 'optional';

export interface Capability {
  id: string;
  label: string;
  ok: boolean;
  level: CapabilityLevel;
  detail: string;
  hint?: string;
}

export interface EnvironmentProbes {
  secureContext: boolean;
  deviceMotion: boolean;
  wakeLock: boolean;
  vibrate: boolean;
  notification: NotifyPermission;
}

/** Read the real browser environment. */
export function readProbes(): EnvironmentProbes {
  const nav = typeof navigator === 'undefined' ? undefined : navigator;
  const win = typeof window === 'undefined' ? undefined : window;

  return {
    secureContext: win?.isSecureContext ?? false,
    deviceMotion: isDeviceMotionSupported(),
    wakeLock: !!nav && 'wakeLock' in nav,
    vibrate: !!nav && typeof nav.vibrate === 'function',
    notification: notificationPermission(),
  };
}

export function evaluateEnvironment(p: EnvironmentProbes): Capability[] {
  return [
    {
      id: 'secure-context',
      label: '安全上下文',
      level: 'critical',
      ok: p.secureContext,
      detail: p.secureContext ? 'HTTPS 已启用' : '当前不是 HTTPS',
      hint: '动作传感器只在 HTTPS 下可用，请用 https 地址打开',
    },
    {
      id: 'device-motion',
      label: '动作传感器',
      level: 'critical',
      ok: p.deviceMotion,
      detail: p.deviceMotion ? '浏览器支持 devicemotion' : '浏览器不支持',
      hint: '没有传感器时只能用点击模拟',
    },
    {
      id: 'vibration',
      label: '震动输出',
      level: 'critical',
      ok: p.vibrate,
      detail: p.vibrate ? '可用' : '浏览器不支持震动',
      hint: '这是现在唯一的闹钟通道。iOS Safari 完全没有它，部分安卓机需要开启系统震动',
    },
    {
      id: 'notification',
      label: '系统通知',
      level: 'recommended',
      ok: p.notification === 'granted',
      detail:
        p.notification === 'granted'
          ? '已授权'
          : p.notification === 'denied'
          ? '已被拒绝'
          : p.notification === 'unsupported'
          ? '浏览器不支持'
          : '尚未授权',
      hint: '授权后闹钟在后台也能提醒，是震动之外唯一的兜底',
    },
    {
      id: 'wake-lock',
      label: '屏幕常亮',
      level: 'recommended',
      ok: p.wakeLock,
      detail: p.wakeLock ? '可用' : '浏览器不支持',
      hint: '没有它，手机熄屏会中断任务计时',
    },
  ];
}

export interface EnvironmentSummary {
  ok: boolean;
  total: number;
  failing: Capability[];
}

/** A run is only "ok" when every critical capability is present. */
export function summarizeEnvironment(caps: Capability[]): EnvironmentSummary {
  const failing = caps.filter(c => !c.ok);
  return {
    ok: failing.every(c => c.level !== 'critical'),
    total: caps.length,
    failing,
  };
}
