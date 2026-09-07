/**
 * Checkout wiring.
 *
 * Payments are Stripe Payment Links, which is the shortest honest path from
 * "app works" to "app takes money": no server, no SDK, no App Store cut on the
 * web build. Create one link per tier per cycle in the Stripe dashboard, set
 * them as build-time env vars, and the Upgrade screen becomes live.
 *
 *   EXPO_PUBLIC_PAY_STARTER_MONTHLY=https://buy.stripe.com/...
 *   EXPO_PUBLIC_PAY_STARTER_ANNUAL=...
 *   EXPO_PUBLIC_PAY_ALLPRO_MONTHLY=...
 *   EXPO_PUBLIC_PAY_ALLPRO_ANNUAL=...
 *   EXPO_PUBLIC_PAY_FRANCHISE_MONTHLY=...
 *   EXPO_PUBLIC_PAY_FRANCHISE_ANNUAL=...
 *   EXPO_PUBLIC_BILLING_PORTAL=https://billing.stripe.com/p/login/...
 *
 * Until they are set the Upgrade screen still sells — it just collects the
 * intent instead of the card, so no one ever hits a dead button.
 *
 * A note on what this gate is and is not: the engine runs on the device and the
 * data feed is a public repo, so these entitlements are a product boundary, not
 * a security boundary. The roadmap step that turns them into one is a licence
 * check on the feed (see docs/GROWTH.md) — until then, treat gating as the
 * shape of the offer rather than as DRM.
 */
import { Linking, Platform } from 'react-native';
import type { Cycle, TierId } from './tiers';

const env = (k: string) => (process.env[k] as string | undefined)?.trim() || null;

const LINKS: Record<string, string | null> = {
  'starter:monthly': env('EXPO_PUBLIC_PAY_STARTER_MONTHLY'),
  'starter:annual': env('EXPO_PUBLIC_PAY_STARTER_ANNUAL'),
  'allpro:monthly': env('EXPO_PUBLIC_PAY_ALLPRO_MONTHLY'),
  'allpro:annual': env('EXPO_PUBLIC_PAY_ALLPRO_ANNUAL'),
  'franchise:monthly': env('EXPO_PUBLIC_PAY_FRANCHISE_MONTHLY'),
  'franchise:annual': env('EXPO_PUBLIC_PAY_FRANCHISE_ANNUAL'),
};

export const BILLING_PORTAL = env('EXPO_PUBLIC_BILLING_PORTAL');
export const WAITLIST_URL = env('EXPO_PUBLIC_WAITLIST_URL');

export const checkoutUrl = (tier: TierId, cycle: Cycle): string | null => LINKS[`${tier}:${cycle}`] ?? null;
export const paymentsLive = Object.values(LINKS).some(Boolean);

/** Open a link without ever leaving the user on a dead button. */
export async function openLink(url: string): Promise<boolean> {
  try {
    if (Platform.OS === 'web') { window.open(url, '_blank', 'noopener'); return true; }
    const ok = await Linking.canOpenURL(url);
    if (ok) await Linking.openURL(url);
    return ok;
  } catch { return false; }
}
