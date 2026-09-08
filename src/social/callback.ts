/**
 * What the sign-in redirect actually carried.
 *
 * A mail link comes back to the app with its answer in the URL — the tokens in
 * the fragment when it worked, an `error_code` when it did not. Supabase's
 * client reads the fragment, and on failure it keeps the reason to itself: the
 * session is simply absent, so the app re-renders the sign-in card with nothing
 * to explain why the link the user just clicked did nothing. That is the worst
 * possible failure for the one screen a new account has to get through.
 *
 * So the URL is read here first, at module load, before the Supabase client is
 * ever constructed and before the fragment is consumed and wiped. Nothing is
 * acted on — the auth library still owns the exchange — it is only remembered,
 * so that when the session does not appear there is something true to say.
 */
import { Platform } from 'react-native';

export type Callback =
  /** Not a sign-in redirect. An ordinary visit. */
  | { kind: 'none' }
  /** Tokens were present; the session should exist once auth has read them. */
  | { kind: 'session' }
  /** The link came back refused. `message` is written for the person reading it. */
  | { kind: 'error'; code: string; message: string };

/**
 * The link is single-use and short-lived, and the two ways it dies look
 * identical from the app: already spent, or too old. Both are worth the same
 * sentence, because the fix is the same and the cause usually is not the user's
 * fault — mail apps and corporate link scanners routinely open a link in the
 * background to check it, which spends it before a human ever taps.
 */
const SPENT = 'That sign-in link had already been used or expired. They are single-use, and some mail apps open links in the background to scan them — send a fresh one and open it in this browser.';

const MESSAGES: Record<string, string> = {
  otp_expired: SPENT,
  access_denied: SPENT,
  otp_disabled: 'Email sign-in is switched off for this project right now.',
  over_email_send_rate_limit: 'Too many links sent in the last hour. Wait a few minutes and try again.',
  validation_failed: 'That address was refused. Check it and try again.',
  flow_state_not_found: SPENT,
  flow_state_expired: SPENT,
};

/** Everything after `#`, and everything after `?`, as one bag of parameters. */
function params(): URLSearchParams | null {
  if (Platform.OS !== 'web' || typeof window === 'undefined') return null;
  const out = new URLSearchParams();
  for (const part of [window.location.hash.replace(/^#/, ''), window.location.search.replace(/^\?/, '')]) {
    if (!part) continue;
    // A `+` in an error_description is a space; URLSearchParams already knows.
    for (const [k, v] of new URLSearchParams(part)) if (!out.has(k)) out.set(k, v);
  }
  return out;
}

function read(): Callback {
  const p = params();
  if (!p) return { kind: 'none' };

  const code = p.get('error_code') ?? p.get('error') ?? '';
  if (code) {
    const described = (p.get('error_description') ?? '').replace(/\+/g, ' ').trim();
    return {
      kind: 'error',
      code,
      // A known code gets the sentence we wrote; anything else gets Supabase's
      // own words, which are at least accurate, rather than a shrug.
      message: MESSAGES[code] ?? (described || `Sign-in failed (${code}).`),
    };
  }

  if (p.get('access_token') || p.get('code')) return { kind: 'session' };
  return { kind: 'none' };
}

/**
 * Captured once, at import. By the time any component renders, the fragment may
 * already have been consumed by the auth client and erased from the address
 * bar, so reading it live would find nothing.
 */
const AT_BOOT: Callback = read();

export const authCallback = (): Callback => AT_BOOT;

/** True when this page load began with a sign-in link, however it turned out. */
export const arrivedFromLink = () => AT_BOOT.kind !== 'none';
