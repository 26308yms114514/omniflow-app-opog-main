/**
 * Fullscreen helper test.
 *
 * Run from the repository root with:
 *   node node_modules/tsx/dist/cli.mjs frontend/src/lib/fullscreen.test.ts
 *
 * The important property is graceful degradation: an embedded preview is an
 * iframe without `allow="fullscreen"`, where every call rejects. None of that
 * may surface as an exception in the task screen.
 */
import assert from 'node:assert/strict';
import {
  enterTaskFullscreen,
  exitTaskFullscreen,
  isFullscreenSupported,
  lockPortrait,
  unlockOrientation,
  type FullscreenEnv,
} from './fullscreen';

let passed = 0;
async function check(name: string, fn: () => void | Promise<void>) {
  await fn();
  passed += 1;
  console.log(`  ok  ${name}`);
}

/** A browser that supports everything and agrees to it. */
function supportingEnv() {
  const calls: string[] = [];
  const doc = {
    fullscreenElement: null as Element | null,
    documentElement: {
      requestFullscreen: async (options?: { navigationUI?: string }) => {
        calls.push(`requestFullscreen:${options?.navigationUI ?? ''}`);
        doc.fullscreenElement = doc.documentElement as unknown as Element;
      },
    },
    exitFullscreen: async () => {
      calls.push('exitFullscreen');
      doc.fullscreenElement = null;
    },
  };
  const orientation = {
    lock: async (value: string) => {
      calls.push(`lock:${value}`);
    },
    unlock: () => {
      calls.push('unlock');
    },
  };
  return { env: { doc, orientation } as FullscreenEnv, calls, doc };
}

async function main() {
  console.log('fullscreen');

  await check('an empty environment reports no support', () => {
    assert.equal(isFullscreenSupported({}), false);
  });

  await check('support is detected from the prefixed entry point too', () => {
    const env: FullscreenEnv = {
      doc: { documentElement: { webkitRequestFullscreen: () => undefined } },
    };
    assert.equal(isFullscreenSupported(env), true);
  });

  await check('entering fullscreen hides the browser navigation', async () => {
    const { env, calls } = supportingEnv();
    assert.equal(await enterTaskFullscreen(env), true);
    assert.deepEqual(calls, ['requestFullscreen:hide']);
  });

  await check('a second call is a no-op that still reports success', async () => {
    const { env, calls } = supportingEnv();
    await enterTaskFullscreen(env);
    assert.equal(await enterTaskFullscreen(env), true);
    // Only one real request reached the browser.
    assert.deepEqual(calls, ['requestFullscreen:hide']);
  });

  await check('an unsupported environment returns false, not an exception', async () => {
    assert.equal(await enterTaskFullscreen({}), false);
    assert.equal(await enterTaskFullscreen({ doc: {} }), false);
  });

  await check('a refused request is swallowed', async () => {
    const env: FullscreenEnv = {
      doc: {
        documentElement: {
          requestFullscreen: () => Promise.reject(new Error('permissions policy')),
        },
      },
    };
    assert.equal(await enterTaskFullscreen(env), false);
  });

  await check('a synchronous throw from the vendor call is swallowed', async () => {
    const env: FullscreenEnv = {
      doc: {
        documentElement: {
          requestFullscreen: () => {
            throw new Error('not user initiated');
          },
        },
      },
    };
    assert.equal(await enterTaskFullscreen(env), false);
  });

  await check('the prefixed call is used when the standard one is absent', async () => {
    let called = false;
    const doc = {
      fullscreenElement: null as Element | null,
      documentElement: {
        webkitRequestFullscreen: async () => {
          called = true;
          doc.fullscreenElement = doc.documentElement as unknown as Element;
        },
      },
    };
    assert.equal(await enterTaskFullscreen({ doc }), true);
    assert.equal(called, true);
  });

  await check('exiting is skipped when nothing is fullscreen', async () => {
    const { env, calls } = supportingEnv();
    await exitTaskFullscreen(env);
    assert.deepEqual(calls, []);
  });

  await check('exiting leaves fullscreen when it is active', async () => {
    const { env, calls } = supportingEnv();
    await enterTaskFullscreen(env);
    await exitTaskFullscreen(env);
    assert.deepEqual(calls, ['requestFullscreen:hide', 'exitFullscreen']);
  });

  await check('a failing exit does not throw', async () => {
    const env: FullscreenEnv = {
      doc: {
        fullscreenElement: {} as Element,
        exitFullscreen: () => Promise.reject(new Error('nope')),
      },
    };
    await exitTaskFullscreen(env);
  });

  await check('portrait lock is attempted and reported', async () => {
    const { env, calls } = supportingEnv();
    assert.equal(await lockPortrait(env), true);
    assert.ok(calls.includes('lock:portrait'));
  });

  await check('an unsupported orientation lock returns false', async () => {
    assert.equal(await lockPortrait({}), false);
    assert.equal(await lockPortrait({ orientation: {} }), false);
  });

  await check('a rejected portrait lock is swallowed', async () => {
    const env: FullscreenEnv = {
      orientation: { lock: () => Promise.reject(new Error('requires fullscreen')) },
    };
    assert.equal(await lockPortrait(env), false);
  });

  await check('unlocking never throws', () => {
    unlockOrientation({});
    unlockOrientation({
      orientation: {
        unlock: () => {
          throw new Error('nothing locked');
        },
      },
    });
  });

  console.log(`\n${passed} checks passed`);
}

main().catch(error => {
  console.error(error);
  process.exit(1);
});
