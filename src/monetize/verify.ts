/**
 * Where a tier actually comes from.
 *
 * The app used to answer "what has this person paid for?" by reading its own
 * storage, and it would take three different people's word for it:
 *
 *   • `?upgraded=allpro` in the address bar — Stripe's success redirect, but
 *     nothing stops anyone typing it;
 *   • a row in AsyncStorage / localStorage — one devtools line;
 *   • a promo code compared against a table compiled into the bundle, which
 *     means the codes ship to everyone who loads the page.
 *
 * None of those is a claim about payment. They are all the client telling
 * itself what it would like to be true.
 *
 * This module is the one place allowed to answer the question, and it answers
 * it in one of two modes:
 *
 *   **Verified.** `EXPO_PUBLIC_ENTITLEMENTS_URL` points at the check function
 *   (docs/entitlements-function.ts, deployed on Supabase). It reads the user's
 *   session, asks Stripe what that customer is subscribed to, and returns the
 *   tier. Its answer overrides local storage in both directions — it grants a
 *   tier the device does not have, and it takes away one the device was not
 *   entitled to. Codes are redeemed there too, against a table that never
 *   leaves the server.
 *
 *   **Provisional.** No endpoint configured, which is where this app is today.
 *   Local state stands so the product works, but every grant is stamped
 *   unverified and the app says so out loud in Settings rather than pretending.
 *
 * Worth being exact about the limit: the engine runs on the device and the feed
 * is a public repo, so a determined person can always patch the JavaScript.
 * Verification is not DRM. What it buys is that the casual bypasses — a URL, a
 * storage row, a code read out of the bundle — stop working, and that the
 * server, not the client, becomes the thing that has to be wrong for someone to
 * get in free.
 */
import type { TierId } from './tiers';

const env = (k: string) => (process.env[k] as string | undefined)?.trim() || null;

/** The deployed check function. Its presence is what switches on verification. */
export const ENTITLEMENTS_URL = env('EXPO_PUBLIC_ENTITLEMENTS_URL');

/** True when a server is available to be the authority. */
export const verificationLive = !!ENTITLEMENTS_URL;

const TIMEOUT_MS = 8_000;

export type GrantSource = 'none' | 'trial' | 'code' | 'checkout' | 'server';

export interface ServerGrant {
  tier: TierId;
  /** Epoch ms the grant lapses, or null for an open-ended subscription. */
  expiresAt: number | null;
  source: GrantSource;
}

async function call(path: string, token: string | null, body?: unknown): Promise<unknown> {
  if (!ENTITLEMENTS_URL) return null;
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(`${ENTITLEMENTS_URL.replace(/\/$/, '')}/${path}`, {
      method: body ? 'POST' : 'GET',
      headers: {
        'content-type': 'application/json',
        ...(token ? { authorization: `Bearer ${token}` } : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
      signal: ctrl.signal,
    });
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  } finally {
    clearTimeout(t);
  }
}

const asGrant = (raw: unknown, source: GrantSource): ServerGrant | null => {
  const o = raw as { tier?: string; expiresAt?: number | null } | null;
  if (!o?.tier) return null;
  return { tier: o.tier as TierId, expiresAt: o.expiresAt ?? null, source };
};

/**
 * What the server says this session is entitled to.
 *
 * `null` means "no answer" — the endpoint is unset, unreachable, or the user is
 * signed out — and a caller must treat that as *unknown*, never as "free". An
 * outage is not a reason to downgrade a paying customer mid-Sunday.
 */
export async function serverEntitlement(token: string | null): Promise<ServerGrant | null> {
  if (!token) return null;
  return asGrant(await call('entitlement', token), 'server');
}

/** Hand Stripe's checkout session back for confirmation. */
export async function verifyCheckout(sessionId: string, token: string | null): Promise<ServerGrant | null> {
  return asGrant(await call('checkout', token, { sessionId }), 'server');
}

/** Redeem a promo code against the server's table rather than the bundle's. */
export async function redeemOnServer(code: string, token: string | null): Promise<ServerGrant | null> {
  return asGrant(await call('redeem', token, { code }), 'server');
}
