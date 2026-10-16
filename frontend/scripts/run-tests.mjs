#!/usr/bin/env node
/**
 * Runs every `*.test.ts` under `src/` and reports a one-line summary per file.
 *
 * Each test file runs in its own process on purpose: several of them install a
 * fake `window`/`localStorage` on the global object, and the storage-sync
 * module keeps subscriber state at module scope. Sharing a process would let
 * one file's stubs leak into the next.
 *
 * Usage:
 *   pnpm test
 */
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..');
const srcDir = path.join(root, 'src');

function findTests(dir) {
  const found = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) found.push(...findTests(full));
    else if (entry.name.endsWith('.test.ts')) found.push(full);
  }
  return found;
}

const tests = findTests(srcDir).sort();
if (tests.length === 0) {
  console.error('No *.test.ts files found under src/.');
  process.exit(1);
}

const tsxCli = path.join(root, 'node_modules', 'tsx', 'dist', 'cli.mjs');
if (!fs.existsSync(tsxCli)) {
  console.error('tsx is not installed. Run `pnpm install` first.');
  process.exit(1);
}

let failed = 0;
let checks = 0;

for (const file of tests) {
  const label = path.relative(root, file).split(path.sep).join('/');
  const result = spawnSync(process.execPath, [tsxCli, file], {
    encoding: 'utf8',
    env: process.env,
  });

  const output = `${result.stdout ?? ''}${result.stderr ?? ''}`;
  const lines = output.trim().split('\n');
  const summary = lines[lines.length - 1] ?? '';

  if (result.status !== 0) {
    failed += 1;
    console.error(`FAIL  ${label}`);
    console.error(output.trimEnd());
    console.error('');
  } else {
    const match = summary.match(/(\d+) checks passed/);
    if (match) checks += Number(match[1]);
    console.log(`ok    ${label.padEnd(32)} ${summary}`);
  }
}

console.log('');
console.log(
  `${tests.length - failed}/${tests.length} files passed, ${checks} checks in total`
);

if (failed > 0) process.exit(1);
