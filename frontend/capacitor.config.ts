import type { CapacitorConfig } from '@capacitor/cli';

/**
 * Native shell around the same web app.
 *
 * `androidScheme: 'https'` is not cosmetic: it makes the WebView serve the
 * bundle from `https://localhost`, which is a *secure context*. Without it the
 * shake and march tasks lose `DeviceMotionEvent` entirely — the same trap that
 * makes opening the site over plain http on a phone silently do nothing.
 */
const config: CapacitorConfig = {
  appId: 'com.qingxing.alarmclock',
  appName: '强制清醒闹钟',
  webDir: 'dist',
  android: {
    // The app fetches nothing over http, so mixed content stays off.
    allowMixedContent: false,
  },
  server: {
    androidScheme: 'https',
  },
};

export default config;
