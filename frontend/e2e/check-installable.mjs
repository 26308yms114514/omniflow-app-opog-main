/**
 * Is the live site installable on Android?
 *
 * Checks the three things Chrome actually requires before it offers "安装应用":
 * a manifest it can parse, icons it can fetch, and a service worker that reaches
 * the activated state on this exact origin.
 */
import { chromium, devices } from 'playwright-core';

const URL = process.argv[2] || 'https://26308yms114514.github.io/omniflow-app-opog-main/';

const browser = await chromium.launch({ channel: 'msedge', headless: true });
const context = await browser.newContext({ ...devices['Pixel 5'] });
const page = await context.newPage();

const problems = [];
page.on('pageerror', error => problems.push(`pageerror: ${error.message}`));

await page.goto(URL, { waitUntil: 'load' });
await page.waitForSelector('#root > *', { timeout: 20_000 });
// The app registers its worker on the first gesture.
await page.mouse.click(5, 5);
await page.waitForTimeout(2500);

const report = await page.evaluate(async () => {
  const link = document.querySelector('link[rel="manifest"]');
  const manifestHref = link ? new URL(link.getAttribute('href'), location.href).href : null;

  let manifest = null;
  let manifestError = null;
  if (manifestHref) {
    try {
      manifest = await (await fetch(manifestHref)).json();
    } catch (error) {
      manifestError = String(error);
    }
  }

  const icons = [];
  for (const icon of manifest?.icons ?? []) {
    const href = new URL(icon.src, manifestHref).href;
    try {
      const response = await fetch(href);
      icons.push(`${icon.sizes} ${response.status} ${response.headers.get('content-type')}`);
    } catch (error) {
      icons.push(`${icon.sizes} FAILED ${error}`);
    }
  }

  let worker = 'none';
  try {
    const registration = await navigator.serviceWorker.getRegistration();
    worker = registration
      ? `scope=${registration.scope} active=${!!registration.active}`
      : 'no registration';
  } catch (error) {
    worker = `error: ${error}`;
  }

  return {
    displayed: document.title,
    secureContext: window.isSecureContext,
    manifestHref,
    manifestError,
    manifest: manifest
      ? {
          name: manifest.name,
          short_name: manifest.short_name,
          start_url: manifest.start_url,
          display: manifest.display,
          orientation: manifest.orientation,
        }
      : null,
    icons,
    worker,
  };
});

console.log(JSON.stringify({ report, problems }, null, 2));
await browser.close();
