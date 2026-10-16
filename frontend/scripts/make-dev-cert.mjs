#!/usr/bin/env node
/**
 * Generate a self-signed TLS certificate so a real phone can open the dev
 * server and still get a *secure context*.
 *
 * Why this matters: Android Chrome only exposes `DeviceMotionEvent` in a
 * secure context. Testing over plain `http://<lan-ip>:5173` therefore makes
 * the shake and march tasks silently do nothing — not a code bug, a platform
 * rule. This certificate puts the LAN address in the SAN list so the phone can
 * reach the same origin over https.
 *
 * Usage (from the frontend directory):
 *   pnpm cert            # or: node scripts/make-dev-cert.mjs
 *   pnpm cert 192.168.1.5 192.168.1.6
 *
 * Chrome will still warn about an untrusted issuer the first time; tap through
 * it. The page is still treated as a secure context.
 */
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const certDir = path.resolve(here, '..', '.certs');
const keyFile = path.join(certDir, 'dev.key');
const certFile = path.join(certDir, 'dev.crt');

/** Every non-internal IPv4 address this machine currently has. */
function lanAddresses() {
  const found = [];
  for (const addrs of Object.values(os.networkInterfaces())) {
    for (const addr of addrs ?? []) {
      if (addr.family === 'IPv4' && !addr.internal) found.push(addr.address);
    }
  }
  return found;
}

/** openssl is not always on PATH on Windows; try the usual spots too. */
function findOpenssl() {
  const candidates = [
    process.env.OPENSSL_BIN,
    'openssl',
    'C:/Program Files/Git/usr/bin/openssl.exe',
    'C:/Program Files/Git/mingw64/bin/openssl.exe',
    '/ucrt64/bin/openssl',
    '/usr/bin/openssl',
  ].filter(Boolean);

  for (const candidate of candidates) {
    try {
      execFileSync(candidate, ['version'], { stdio: 'ignore' });
      return candidate;
    } catch {
      // try the next one
    }
  }
  return null;
}

const openssl = findOpenssl();
if (!openssl) {
  console.error('找不到 openssl。请安装它，或用 OPENSSL_BIN 指定完整路径。');
  process.exit(1);
}

const requested = process.argv.slice(2).filter(Boolean);
const addresses = requested.length ? requested : lanAddresses();

if (!addresses.length) {
  console.error('没有找到局域网 IPv4 地址，请手动传入，例如：pnpm cert 192.168.1.5');
  process.exit(1);
}

const san = ['DNS:localhost', 'IP:127.0.0.1', ...addresses.map(ip => `IP:${ip}`)].join(',');

fs.mkdirSync(certDir, { recursive: true });

console.log(`openssl : ${openssl}`);
console.log(`SAN     : ${san}`);

execFileSync(
  openssl,
  [
    'req',
    '-x509',
    '-newkey',
    'rsa:2048',
    '-nodes',
    '-keyout',
    keyFile,
    '-out',
    certFile,
    '-days',
    '825',
    // A leading double slash stops MSYS from rewriting the subject into a path.
    '-subj',
    `//CN=${addresses[0]}`,
    '-addext',
    `subjectAltName=${san}`,
  ],
  { stdio: ['ignore', 'ignore', 'inherit'] }
);

console.log(`\n已写入:\n  ${certFile}\n  ${keyFile}`);
console.log('\n手机访问（同一 Wi-Fi 下）:');
for (const ip of addresses) {
  console.log(`  https://${ip}:5173/`);
}
console.log('\n首次访问会有证书警告，选择「继续访问」即可。');
