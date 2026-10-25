/**
 * Local account test.
 *
 * Run from the repository root with:
 *   node node_modules/tsx/dist/cli.mjs frontend/src/lib/auth.test.ts
 *
 * The properties worth locking down: a password is never stored as text, two
 * people with the same password do not share a hash, wrong credentials do not
 * sign anyone in, and one account cannot see another's alarms.
 */
import assert from 'node:assert/strict';
import { clearStoredSubscribers, readStored, writeStored } from './local-store';
import {
  AuthError,
  SESSION_KEY,
  USERS_KEY,
  adoptLegacyData,
  currentUser,
  listUsers,
  login,
  logout,
  register,
  scopedKey,
  scopedKeyFor,
  subscribeAuth,
} from './auth';

// --- localStorage stub ----------------------------------------------------
const store = new Map<string, string>();
Object.defineProperty(globalThis, 'window', {
  configurable: true,
  writable: true,
  value: {
    localStorage: {
      getItem: (key: string) => (store.has(key) ? store.get(key)! : null),
      setItem: (key: string, value: string) => {
        store.set(key, value);
      },
      removeItem: (key: string) => {
        store.delete(key);
      },
    },
  },
});

let passed = 0;
async function check(name: string, fn: () => void | Promise<void>) {
  store.clear();
  clearStoredSubscribers();
  await fn();
  passed += 1;
  console.log(`  ok  ${name}`);
}

async function expectAuthError(code: string, run: () => Promise<unknown>) {
  try {
    await run();
  } catch (error) {
    assert.ok(error instanceof AuthError, `expected AuthError, got ${error}`);
    assert.equal(error.code, code);
    return;
  }
  assert.fail(`expected ${code}, nothing was thrown`);
}

async function main() {
  console.log('auth');

  await check('the first registration signs the person in', async () => {
    const user = await register('小明', 'hunter2');
    assert.equal(user.nickname, '小明');
    assert.equal(currentUser()?.id, user.id);
    assert.equal(listUsers().length, 1);
  });

  await check('the password is not stored, only a salted hash', async () => {
    await register('小红', 'hunter2');
    const raw = JSON.stringify(readStored(USERS_KEY, []));
    assert.ok(!raw.includes('hunter2'), 'password found in storage');
    const [user] = listUsers();
    assert.ok(user.salt.length > 0);
    assert.ok(user.hash.length > 0);
    assert.notEqual(user.hash, user.salt);
  });

  await check('the same password produces different hashes for two people', async () => {
    await register('甲某', 'samepass');
    await register('乙某', 'samepass');
    const users = listUsers();
    assert.equal(users.length, 2);
    assert.notEqual(users[0].hash, users[1].hash, 'hashes should differ by salt');
    assert.notEqual(users[0].salt, users[1].salt);
  });

  await check('a taken nickname is refused', async () => {
    await register('小明', 'hunter2');
    await expectAuthError('nickname-taken', () => register('小明', 'other123'));
  });

  await check('nicknames are compared ignoring case and spacing', async () => {
    await register('XiaoMing', 'hunter2');
    await expectAuthError('nickname-taken', () => register('  xiaoming ', 'other123'));
  });

  await check('a short nickname or password is refused', async () => {
    await expectAuthError('nickname-invalid', () => register('a', 'hunter2'));
    await expectAuthError('nickname-invalid', () =>
      register('这个名字实在是太长了超过十六个字符了吧', 'hunter2')
    );
    await expectAuthError('password-too-short', () => register('小明', '123'));
  });

  await check('logging in with the right password works', async () => {
    await register('小明', 'hunter2');
    logout();
    assert.equal(currentUser(), null);
    const user = await login('小明', 'hunter2');
    assert.equal(currentUser()?.id, user.id);
  });

  await check('a wrong password signs nobody in', async () => {
    await register('小明', 'hunter2');
    logout();
    await expectAuthError('bad-credentials', () => login('小明', 'hunter3'));
    assert.equal(currentUser(), null);
  });

  await check('an unknown nickname fails the same way', async () => {
    await register('小明', 'hunter2');
    logout();
    await expectAuthError('bad-credentials', () => login('查无此人', 'hunter2'));
    assert.equal(currentUser(), null);
  });

  await check('logging out clears the session and any pending ring', async () => {
    await register('小明', 'hunter2');
    writeStored('active_ring_v1', { alarmId: 'x' });
    writeStored('snoozed_alarm_v1', { alarmId: 'x' });
    logout();
    assert.equal(readStored(SESSION_KEY, null), null);
    // Written as an explicit null rather than removed, so every tab sees it.
    assert.equal(readStored('active_ring_v1', null), null);
    assert.equal(readStored('snoozed_alarm_v1', null), null);
  });

  await check('alarms of two accounts never meet', async () => {
    const first = await register('甲某', 'hunter2');
    writeStored(scopedKeyFor(first.id, 'alarms_v1'), [{ id: 'a1' }]);

    const second = await register('乙某', 'hunter2');
    assert.equal(scopedKey('alarms_v1'), scopedKeyFor(second.id, 'alarms_v1'));
    assert.equal(readStored(scopedKeyFor(second.id, 'alarms_v1'), []).length, 0);
    assert.equal(readStored(scopedKeyFor(first.id, 'alarms_v1'), []).length, 1);
  });

  await check('the scoped key follows whoever is signed in', async () => {
    await register('甲某', 'hunter2');
    const firstKey = scopedKey('alarms_v1');
    logout();
    assert.equal(scopedKey('alarms_v1'), 'alarms_v1', 'no session means no scope');
    await register('乙某', 'hunter2');
    assert.notEqual(scopedKey('alarms_v1'), firstKey);
  });

  await check('pre-account alarms are adopted by the first registration', async () => {
    writeStored('alarms_v1', [{ id: 'legacy-1' }, { id: 'legacy-2' }]);
    writeStored('sessions_v1', [{ alarmId: 'legacy-1' }]);

    const user = await register('小明', 'hunter2');
    const adopted = readStored<unknown[]>(scopedKeyFor(user.id, 'alarms_v1'), []);
    assert.equal(adopted.length, 2);
    const adoptedSessions = readStored<unknown[]>(
      scopedKeyFor(user.id, 'sessions_v1'),
      []
    );
    assert.equal(adoptedSessions.length, 1);
    // The unscoped copies must be gone, or the next account would inherit them.
    assert.equal(readStored<unknown[]>('alarms_v1', []).length, 0);
    assert.equal(readStored<unknown[]>('sessions_v1', []).length, 0);
  });

  await check('a second account does not adopt the first one\'s alarms', async () => {
    writeStored('alarms_v1', [{ id: 'legacy-1' }]);
    const first = await register('甲某', 'hunter2');
    logout();

    const second = await register('乙某', 'hunter2');
    assert.equal(readStored<unknown[]>(scopedKeyFor(first.id, 'alarms_v1'), []).length, 1);
    assert.equal(readStored<unknown[]>(scopedKeyFor(second.id, 'alarms_v1'), []).length, 0);
  });

  await check('subscribers hear about logins and logouts', async () => {
    let changes = 0;
    const off = subscribeAuth(() => {
      changes += 1;
    });
    await register('小明', 'hunter2');
    assert.ok(changes > 0, 'registration was not announced');
    const before = changes;
    logout();
    assert.ok(changes > before, 'logout was not announced');
    off();
  });

  await check('adoptLegacyData is harmless with nothing to adopt', async () => {
    adoptLegacyData('nobody');
    assert.equal(readStored<unknown[]>('alarms_v1', []).length, 0);
  });

  console.log(`\n${passed} checks passed`);
}

main().catch(error => {
  console.error(error);
  process.exit(1);
});
