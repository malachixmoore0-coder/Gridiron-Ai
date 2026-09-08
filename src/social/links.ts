/**
 * Profile links.
 *
 * A profile nobody can link to is not a profile, it is a screen. Every account
 * gets an address — `/@handle` — so a pick, a record or a person can be sent to
 * somebody who is not holding your phone. This is the whole difference between
 * a social feature and a social product.
 *
 * Two details make it work on the web build:
 *
 *   • the app is published under a repository path (`/Gridiron-Ai/`), not a
 *     domain root, so the base is read off the URL the app was opened with
 *     rather than hard-coded or trusted to an env var that only exists at build
 *     time;
 *   • GitHub Pages serves `404.html` for any unknown path, and the deploy copies
 *     `index.html` over it, so `/Gridiron-Ai/@coldnumbers` boots the app instead
 *     of showing a 404 — the router below then reads the handle back out.
 *
 * On native every function here is inert except `profileUrl`, which still
 * produces the shareable web address.
 */
import { Platform } from 'react-native';

const isWeb = Platform.OS === 'web';
const hasWindow = () => isWeb && typeof window !== 'undefined';

/** Where a handle starts in a path: `/@someone`. */
const HANDLE = /\/@([a-z0-9_]{1,30})\/?$/i;

/** The handle in a path, or null when the path is not a profile. */
export function handleInPath(pathname: string): string | null {
  const m = HANDLE.exec(pathname.replace(/\/index\.html$/, ''));
  return m ? m[1].toLowerCase() : null;
}

/**
 * The path the app itself lives at, with no trailing slash.
 *
 * Read once, from the URL the app was opened with, and before any navigation
 * has had a chance to change it — a profile deep link is stripped back off so
 * `/Gridiron-Ai/@someone` and `/Gridiron-Ai/` both give `/Gridiron-Ai`.
 */
const BASE = (() => {
  if (!hasWindow()) return '';
  const path = window.location.pathname.replace(/\/index\.html$/, '');
  return path.replace(HANDLE, '').replace(/\/$/, '');
})();

/**
 * The site's own public address, when it has one.
 *
 * `EXPO_PUBLIC_SITE_ORIGIN` is set by the build once a custom domain is
 * configured, and its presence is also what says the app now lives at the root
 * of that domain rather than under a project-pages subpath.
 */
const SITE_ORIGIN = ((process.env.EXPO_PUBLIC_SITE_ORIGIN as string | undefined) ?? '').trim().replace(/\/$/, '');

/** The public origin used when a link has to survive leaving the device. */
const ORIGIN = hasWindow()
  ? window.location.origin
  : SITE_ORIGIN || 'https://malachixmoore0-coder.github.io';

/**
 * The prefix to assume when the path gives none.
 *
 * On GitHub's project pages the app is served under `/Gridiron-Ai`, so an empty
 * path means something went wrong and the repository name is the better guess.
 * On its own domain an empty path is simply correct — the app is the site — and
 * guessing a prefix there would produce a shareable link to a page that does
 * not exist, which is worse than no link at all.
 */
const FALLBACK_BASE = SITE_ORIGIN ? '' : '/Gridiron-Ai';

export const profilePath = (handle: string) => `${BASE}/@${handle}`;

/**
 * Where a sign-in link should come back to.
 *
 * The app itself, never the profile the visitor happened to arrive on: sending
 * the link back to `/@someone` would work, but it would also put a stranger's
 * handle in the address of the mail we just sent, and the redirect has to match
 * an entry in the project's allow-list — one stable address does, a handle per
 * user does not.
 */
export const appUrl = (): string | undefined =>
  hasWindow() ? `${ORIGIN}${BASE || FALLBACK_BASE}/` : undefined;

/** The address you would text somebody. Absolute, and valid off-device. */
export const profileUrl = (handle: string) =>
  `${ORIGIN}${BASE || FALLBACK_BASE}/@${handle}`;

/**
 * The handle the app was opened with, if it was opened on a profile.
 *
 * Captured at module load, not read live. The address bar is rewritten to match
 * the top of the overlay stack on the very first render — which, before the
 * social layer has finished restoring, is an empty stack — so by the time the
 * deep link is resolved the handle would already have been scrubbed out of
 * `location.pathname`. Reading it once, at boot, is the only moment it is
 * reliably there.
 */
const OPENED = hasWindow() ? handleInPath(window.location.pathname) : null;

export const openedOnProfile = (): string | null => OPENED;

/**
 * Point the address bar at a profile without touching the history stack.
 *
 * Replace, not push: the overlay stack already pushed an entry when the screen
 * opened, and pushing a second one here would mean two Backs to leave one
 * screen. This only relabels the entry that is already there.
 */
export function showProfilePath(handle: string): void {
  if (!hasWindow()) return;
  try { window.history.replaceState(window.history.state, '', profilePath(handle)); } catch { /* blocked */ }
}

/** Put the address bar back on the app itself. */
export function showAppPath(): void {
  if (!hasWindow()) return;
  if (!handleInPath(window.location.pathname)) return;
  try { window.history.replaceState(window.history.state, '', BASE || '/'); } catch { /* blocked */ }
}

/**
 * Copy a link, and say whether it worked.
 *
 * The async clipboard API needs a secure context and a live user gesture, so
 * there is a `document.execCommand` fallback for the older path and an honest
 * `false` when neither is available — a "Copied!" toast over a clipboard that
 * did not change is worse than no button at all.
 */
export async function copyLink(url: string): Promise<boolean> {
  if (!hasWindow()) return false;
  try {
    if (navigator.clipboard?.writeText) { await navigator.clipboard.writeText(url); return true; }
  } catch { /* fall through to the old way */ }
  try {
    const el = document.createElement('textarea');
    el.value = url;
    el.setAttribute('readonly', '');
    el.style.position = 'fixed';
    el.style.opacity = '0';
    document.body.appendChild(el);
    el.select();
    const ok = document.execCommand('copy');
    document.body.removeChild(el);
    return ok;
  } catch { return false; }
}
