/**
 * Local accounts.
 *
 * There is no server: the site is static on GitHub Pages and the APK bundles
 * the same files. So an "account" here is a profile that lives on this device —
 * it separates people sharing a phone and keeps each one's alarms and history
 * apart. It is NOT a login to anything remote, and nothing syncs between
 * devices.
 *
 * Passwords are still hashed properly (PBKDF2-SHA256, per-user salt) rather
 * than stored as text. That is not theatre: the same phone may be handed to
 * someone else, and a plaintext password in localStorage would leak the
 * password the person probably also uses elsewhere.
 *
 * `local-store` is reused so a login or logout in one tab reaches the others.
 */
import { readStored, subscribeStored, writeStored } from './local-store';

export const USERS_KEY = 'auth_users_v1';
export const SESSION_KEY = 'auth_session_v1';

/** OWASP's current floor for PBKDF2-HMAC-SHA256. */
const ITERATIONS = 150_000;
const SALT_BYTES = 16;
const KEY_BITS = 256;

export const NICKNAME_MIN = 2;
export const NICKNAME_MAX = 16;
export const PASSWORD_MIN = 6;

export interface User {
  id: string;
  nickname: string;
  createdAt: number;
  /** base64 of the random per-user salt. */
  salt: string;
  /** base64 of the derived key. Never the password itself. */
  hash: string;
}

export interface AuthSession {
  userId: string;
  startedAt: number;
}

export type AuthErrorCode =
  | 'nickname-taken'
  | 'nickname-invalid'
  | 'password-too-short'
  | 'bad-credentials'
  | 'no-crypto'
  | 'no-user';

export class AuthError extends Error {
  constructor(
    public readonly code: AuthErrorCode,
    message: string
  ) {
    super(message);
    this.name = 'AuthError';
  }
}

// --- encoding helpers -----------------------------------------------------

function toBase64(bytes: Uint8Array): string {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

function fromBase64(text: string): Uint8Array {
  const binary = atob(text);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

/** Whether this browser can hash at all — only in a secure context. */
export function hashingAvailable(): boolean {
  return typeof crypto !== 'undefined' && typeof crypto.subtle !== 'undefined';
}

async function deriveKey(password: string, salt: Uint8Array): Promise<string> {
  if (!hashingAvailable()) {
    throw new AuthError(
      'no-crypto',
      '这个浏览器不支持安全哈希，请用 https 地址打开'
    );
  }
  const material = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(password),
    'PBKDF2',
    false,
    ['deriveBits']
  );
  const bits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', salt: salt as unknown as BufferSource, iterations: ITERATIONS, hash: 'SHA-256' },
    material,
    KEY_BITS
  );
  return toBase64(new Uint8Array(bits));
}

/** Compare two base64 digests without leaking length-dependent timing. */
function digestsMatch(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i += 1) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

function newId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `u_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
}

// --- store ----------------------------------------------------------------

export function listUsers(): User[] {
  const users = readStored<User[]>(USERS_KEY, []);
  return Array.isArray(users) ? users.filter(u => u && typeof u.id === 'string') : [];
}

export function findUser(nickname: string): User | undefined {
  const wanted = nickname.trim().toLowerCase();
  return listUsers().find(u => u.nickname.toLowerCase() === wanted);
}

export function currentSession(): AuthSession | null {
  const session = readStored<AuthSession | null>(SESSION_KEY, null);
  if (!session || typeof session.userId !== 'string') return null;
  return session;
}

export function currentUser(): User | null {
  const session = currentSession();
  if (!session) return null;
  return listUsers().find(u => u.id === session.userId) ?? null;
}

/** Notified whenever anyone registers, logs in or logs out. */
export function subscribeAuth(onChange: () => void): () => void {
  const offUsers = subscribeStored(USERS_KEY, onChange);
  const offSession = subscribeStored(SESSION_KEY, onChange);
  return () => {
    offUsers();
    offSession();
  };
}

function validate(nickname: string, password: string): string {
  const trimmed = nickname.trim();
  if (trimmed.length < NICKNAME_MIN || trimmed.length > NICKNAME_MAX) {
    throw new AuthError(
      'nickname-invalid',
      `昵称需要 ${NICKNAME_MIN}~${NICKNAME_MAX} 个字符`
    );
  }
  if (password.length < PASSWORD_MIN) {
    throw new AuthError('password-too-short', `密码至少 ${PASSWORD_MIN} 位`);
  }
  return trimmed;
}

/**
 * Move pre-account data into the new account.
 *
 * Everyone who used the app before accounts existed has alarms sitting under
 * the old unscoped keys. Adopting them on first registration means adding
 * accounts does not look like the app ate their alarms.
 */
export function adoptLegacyData(userId: string): void {
  const legacyAlarms = readStored<unknown[]>('alarms_v1', []);
  const legacySessions = readStored<unknown[]>('sessions_v1', []);
  const targetAlarms = scopedKeyFor(userId, 'alarms_v1');
  const targetSessions = scopedKeyFor(userId, 'sessions_v1');

  if (Array.isArray(legacyAlarms) && legacyAlarms.length > 0) {
    const existing = readStored<unknown[]>(targetAlarms, []);
    if (!Array.isArray(existing) || existing.length === 0) {
      writeStored(targetAlarms, legacyAlarms);
    }
    writeStored('alarms_v1', []);
  }
  if (Array.isArray(legacySessions) && legacySessions.length > 0) {
    const existing = readStored<unknown[]>(targetSessions, []);
    if (!Array.isArray(existing) || existing.length === 0) {
      writeStored(targetSessions, legacySessions);
    }
    writeStored('sessions_v1', []);
  }
}

/** Register a new profile and sign it in. */
export async function register(nickname: string, password: string): Promise<User> {
  const trimmed = validate(nickname, password);
  if (findUser(trimmed)) {
    throw new AuthError('nickname-taken', '这个昵称已经被占用');
  }

  const salt = crypto.getRandomValues(new Uint8Array(SALT_BYTES));
  const hash = await deriveKey(password, salt);

  const user: User = {
    id: newId(),
    nickname: trimmed,
    createdAt: Date.now(),
    salt: toBase64(salt),
    hash,
  };

  writeStored(USERS_KEY, [...listUsers(), user]);
  adoptLegacyData(user.id);
  writeStored(SESSION_KEY, { userId: user.id, startedAt: Date.now() } as AuthSession);
  return user;
}

/** Verify a password and sign in. */
export async function login(nickname: string, password: string): Promise<User> {
  const user = findUser(nickname);
  // Derive against a dummy salt when the nickname is unknown, so a wrong name
  // and a wrong password cost the same time and reveal nothing.
  const salt = user ? fromBase64(user.salt) : new Uint8Array(SALT_BYTES);
  const hash = await deriveKey(password, salt);

  if (!user || !digestsMatch(hash, user.hash)) {
    throw new AuthError('bad-credentials', '昵称或密码不对');
  }

  writeStored(SESSION_KEY, { userId: user.id, startedAt: Date.now() } as AuthSession);
  return user;
}

export function logout(): void {
  writeStored(SESSION_KEY, null);
  // A pending ring belongs to the account that just left.
  writeStored('active_ring_v1', null);
  writeStored('snoozed_alarm_v1', null);
}

export function removeUser(userId: string): void {
  writeStored(
    USERS_KEY,
    listUsers().filter(u => u.id !== userId)
  );
  const session = currentSession();
  if (session?.userId === userId) logout();
}

// --- per-account storage --------------------------------------------------

/** Key suffix for the signed-in account, so two profiles never share data. */
export function scopedKeyFor(userId: string, base: string): string {
  return `${base}::${userId}`;
}

/**
 * The storage key for the signed-in account.
 *
 * Falls back to the unscoped key when nobody is signed in, which only happens
 * before the auth gate mounts.
 */
export function scopedKey(base: string): string {
  const session = currentSession();
  return session ? scopedKeyFor(session.userId, base) : base;
}
