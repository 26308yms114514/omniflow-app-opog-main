/**
 * Best-effort fullscreen and portrait lock for the wake-up task.
 *
 * The product promises a "全屏锁定界面"; in an Android browser that means
 * hiding the URL bar, which is what `requestFullscreen` does. Both APIs are
 * optional, vendor-prefixed in places, and reject outright when the call did
 * not come from a user gesture or when the page is inside an iframe — which is
 * exactly the situation in an embedded preview. So every function here reports
 * success as a boolean and never throws.
 *
 * The environment is injectable so that degradation can be tested without a
 * browser.
 */

export interface FullscreenElementLike {
  requestFullscreen?: (options?: { navigationUI?: string }) => Promise<void> | void;
  webkitRequestFullscreen?: () => Promise<void> | void;
}

export interface FullscreenDocumentLike {
  fullscreenElement?: Element | null;
  webkitFullscreenElement?: Element | null;
  documentElement?: FullscreenElementLike;
  exitFullscreen?: () => Promise<void> | void;
  webkitExitFullscreen?: () => Promise<void> | void;
}

export interface OrientationLike {
  lock?: (orientation: string) => Promise<void>;
  unlock?: () => void;
}

export interface FullscreenEnv {
  doc?: FullscreenDocumentLike;
  orientation?: OrientationLike;
}

function defaultEnv(): FullscreenEnv {
  if (typeof document === 'undefined') return {};
  const doc = document as unknown as FullscreenDocumentLike;
  const orientation =
    typeof screen === 'undefined'
      ? undefined
      : (screen as unknown as { orientation?: OrientationLike }).orientation;
  return { doc, orientation };
}

function isActive(doc: FullscreenDocumentLike | undefined): boolean {
  if (!doc) return false;
  return Boolean(doc.fullscreenElement || doc.webkitFullscreenElement);
}

/** True when this browser exposes any fullscreen entry point at all. */
export function isFullscreenSupported(env: FullscreenEnv = defaultEnv()): boolean {
  const element = env.doc?.documentElement;
  return Boolean(element?.requestFullscreen || element?.webkitRequestFullscreen);
}

/** Enter fullscreen. Returns false when unsupported, refused, or already there. */
export async function enterTaskFullscreen(
  env: FullscreenEnv = defaultEnv()
): Promise<boolean> {
  const doc = env.doc;
  const element = doc?.documentElement;
  if (!doc || !element) return false;
  // Already fullscreen counts as success; calling again would be a no-op that
  // some builds reject.
  if (isActive(doc)) return true;

  try {
    if (element.requestFullscreen) {
      await element.requestFullscreen({ navigationUI: 'hide' });
      return true;
    }
    if (element.webkitRequestFullscreen) {
      await element.webkitRequestFullscreen();
      return true;
    }
  } catch {
    // Not user-initiated, disallowed by permissions policy, or inside an
    // iframe without allow="fullscreen".
  }
  return false;
}

export async function exitTaskFullscreen(
  env: FullscreenEnv = defaultEnv()
): Promise<void> {
  const doc = env.doc;
  if (!doc || !isActive(doc)) return;
  try {
    if (doc.exitFullscreen) await doc.exitFullscreen();
    else if (doc.webkitExitFullscreen) await doc.webkitExitFullscreen();
  } catch {
    // Nothing useful to do; the browser will drop it on navigation anyway.
  }
}

/**
 * Lock to portrait. Chrome only honours this while fullscreen, so call it
 * after (not instead of) `enterTaskFullscreen`.
 */
export async function lockPortrait(
  env: FullscreenEnv = defaultEnv()
): Promise<boolean> {
  const orientation = env.orientation;
  if (!orientation?.lock) return false;
  try {
    await orientation.lock.call(orientation, 'portrait');
    return true;
  } catch {
    return false;
  }
}

export function unlockOrientation(env: FullscreenEnv = defaultEnv()): void {
  try {
    env.orientation?.unlock?.();
  } catch {
    // Older implementations throw when nothing is locked.
  }
}
