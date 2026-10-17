import fs from "node:fs";
import path from "node:path";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react-swc";
import { defineConfig } from "vite";

/**
 * Phone testing mode.
 *
 * `DeviceMotionEvent` — the sensor behind both the shake and the march tasks —
 * is only exposed in a *secure context*. Opening `http://<lan-ip>:5173` on an
 * Android phone therefore makes those tasks silently do nothing.
 *
 * So: when a self-signed certificate exists in `.certs/` (create one with
 * `pnpm cert`), the dev and preview servers switch to https and bind to every
 * interface, which is exactly what a phone on the same Wi-Fi needs. Without
 * the certificate the servers behave normally and stay on localhost.
 *
 * The certificate is git-ignored: it contains a private key.
 */
const certDir = path.resolve(__dirname, ".certs");
const keyFile = path.join(certDir, "dev.key");
const certFile = path.join(certDir, "dev.crt");
const hasCert = fs.existsSync(keyFile) && fs.existsSync(certFile);

const phoneTesting = hasCert
  ? {
      host: true,
      https: {
        key: fs.readFileSync(keyFile),
        cert: fs.readFileSync(certFile),
      },
    }
  : {};

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss()],
  /**
   * Relative asset URLs, so one build works wherever it is served from: a
   * domain root, a sub-path such as a GitHub Pages project site, or a file
   * opened directly. Absolute `/assets/...` paths break the moment the site is
   * not at the root, which is exactly what a project page is.
   *
   * Safe with HashRouter: the document URL never gains a path segment, so
   * `./sw.js` and `./manifest.webmanifest` keep resolving next to index.html.
   */
  base: './',
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
      "@shared": path.resolve(__dirname, "../shared"),
    },
  },
  server: { ...phoneTesting },
  preview: { ...phoneTesting },
});
