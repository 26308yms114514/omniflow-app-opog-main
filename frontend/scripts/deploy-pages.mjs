/**
 * Publish the built site to GitHub Pages.
 *
 *   pnpm deploy:pages
 *
 * Omniflow ran out of credits, so this is the host now. It builds `dist/` and
 * force-pushes it as the tip of the `gh-pages` branch, which Pages serves at
 * https://26308yms114514.github.io/omniflow-app-opog-main/
 *
 * The force-push is deliberate: gh-pages carries build output and nothing else,
 * so its history is worth less than the certainty that it matches `dist/`.
 * Everything that matters lives on `main`.
 */
import { execFileSync } from 'node:child_process';
import { cpSync, existsSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const frontendDir = resolve(here, '..');
const distDir = join(frontendDir, 'dist');
const remote = 'https://github.com/26308yms114514/omniflow-app-opog-main.git';

function run(command, args, cwd) {
  execFileSync(command, args, { cwd, stdio: 'inherit' });
}

console.log('› building');
run(process.execPath, [join(frontendDir, 'node_modules/vite/bin/vite.js'), 'build'], frontendDir);

if (!existsSync(join(distDir, 'index.html'))) {
  console.error('build produced no index.html — refusing to deploy');
  process.exit(1);
}

const staging = mkdtempSync(join(tmpdir(), 'pages-'));
try {
  console.log(`› staging in ${staging}`);
  cpSync(distDir, staging, { recursive: true });
  // Pages serves through Jekyll by default, which drops files it does not
  // recognise. The marker turns that off.
  writeFileSync(join(staging, '.nojekyll'), '');

  const git = (...args) => run('git', args, staging);
  git('init', '-q');
  git('config', 'user.email', 'deploy@local');
  git('config', 'user.name', 'deploy');
  git('add', '-A');
  git('commit', '-q', '-m', `Deploy ${new Date().toISOString()}`);
  git('branch', '-M', 'gh-pages');
  git('remote', 'add', 'origin', remote);

  console.log('› pushing gh-pages');
  git('push', '-f', 'origin', 'gh-pages');

  console.log('');
  console.log('deployed: https://26308yms114514.github.io/omniflow-app-opog-main/');
  console.log('Pages takes a minute to rebuild; the bundle name changes when it has.');
} finally {
  rmSync(staging, { recursive: true, force: true });
}
