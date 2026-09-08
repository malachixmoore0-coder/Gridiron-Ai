/**
 * The entitlement check — the thing that makes a tier a fact rather than a
 * client's opinion.
 *
 * Deploy:
 *   supabase functions deploy entitlements --no-verify-jwt
 *   supabase secrets set STRIPE_SECRET_KEY=sk_live_... STRIPE_WEBHOOK_SECRET=whsec_...
 *
 * Then point the app at it:
 *   EXPO_PUBLIC_ENTITLEMENTS_URL=https://<project>.functions.supabase.co/entitlements
 *
 * The moment that variable is set the client stops being its own authority:
 * `sync()` takes this function's answer over local storage in both directions,
 * codes are redeemed here against a table that never ships, and the address bar
 * stops being able to grant anything at all.
 *
 * Four routes:
 *   GET  /entitlement  — what is this session entitled to, right now
 *   POST /checkout     — confirm a Stripe Checkout session the app just returned from
 *   POST /redeem       — redeem a promo code
 *   POST /webhook      — Stripe's subscription lifecycle (the source of truth)
 *
 * `--no-verify-jwt` is deliberate: the webhook route is called by Stripe, which
 * has no Supabase JWT. Every *other* route authenticates the bearer token
 * itself, and the webhook authenticates by signature instead. Skipping the
 * platform's check is not the same as skipping a check.
 */
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import Stripe from 'https://esm.sh/stripe@14?target=deno';

const stripe = new Stripe(Deno.env.get('STRIPE_SECRET_KEY') ?? '', { apiVersion: '2023-10-16' });
const WEBHOOK_SECRET = Deno.env.get('STRIPE_WEBHOOK_SECRET') ?? '';

const admin = () => createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  { auth: { persistSession: false } },
);

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json', ...CORS } });

const CORS: Record<string, string> = {
  'access-control-allow-origin': '*',
  'access-control-allow-headers': 'authorization, content-type',
  'access-control-allow-methods': 'GET, POST, OPTIONS',
};

/** Price id → tier. Set these to your live price ids. */
const TIER_BY_PRICE: Record<string, string> = JSON.parse(Deno.env.get('TIER_BY_PRICE') ?? '{}');

/** The user behind a bearer token, or null. Never trust a body for identity. */
async function userFor(req: Request): Promise<{ id: string; email: string | null } | null> {
  const auth = req.headers.get('authorization');
  if (!auth?.startsWith('Bearer ')) return null;
  const { data } = await admin().auth.getUser(auth.slice(7));
  return data.user ? { id: data.user.id, email: data.user.email ?? null } : null;
}

/**
 * The stored grant for a user. `entitlements` is written only by this function
 * and read by nobody else with write access — its RLS allows select-own and no
 * insert or update from the client at all.
 */
async function grantFor(userId: string) {
  const { data } = await admin()
    .from('entitlements')
    .select('tier, expires_at')
    .eq('user_id', userId)
    .maybeSingle();
  if (!data) return { tier: 'walkon', expiresAt: null };
  const expiresAt = data.expires_at ? Date.parse(data.expires_at) : null;
  // An expired row is a free account. The check happens here, not on the phone.
  if (expiresAt != null && expiresAt < Date.now()) return { tier: 'walkon', expiresAt: null };
  return { tier: data.tier, expiresAt };
}

async function setGrant(userId: string, tier: string, expiresAt: number | null, source: string, ref: string | null) {
  await admin().from('entitlements').upsert({
    user_id: userId,
    tier,
    expires_at: expiresAt ? new Date(expiresAt).toISOString() : null,
    source,
    ref,
    updated_at: new Date().toISOString(),
  });
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  const path = new URL(req.url).pathname.split('/').filter(Boolean).pop();

  /* Stripe's own callback. Authenticated by signature, not by JWT — and the raw
     body is required, so it must be read before anything parses it. */
  if (path === 'webhook') {
    const sig = req.headers.get('stripe-signature');
    const raw = await req.text();
    let event: Stripe.Event;
    try {
      event = await stripe.webhooks.constructEventAsync(raw, sig ?? '', WEBHOOK_SECRET);
    } catch {
      return json({ error: 'bad signature' }, 400);
    }

    const sub = event.data.object as Stripe.Subscription & { metadata?: Record<string, string> };
    const userId = sub.metadata?.user_id;
    if (!userId) return json({ ok: true, note: 'no user_id in metadata' });

    switch (event.type) {
      case 'customer.subscription.created':
      case 'customer.subscription.updated': {
        const price = sub.items?.data?.[0]?.price?.id ?? '';
        const tier = TIER_BY_PRICE[price] ?? 'walkon';
        const active = sub.status === 'active' || sub.status === 'trialing';
        await setGrant(userId, active ? tier : 'walkon', sub.current_period_end * 1000, 'stripe', sub.id);
        break;
      }
      // Cancelled, refunded, charged back: the grant goes away here, and the
      // next sync on the device takes it away there. This is the half the old
      // client-side model had no answer for at all.
      case 'customer.subscription.deleted':
        await setGrant(userId, 'walkon', null, 'stripe', sub.id);
        break;
      default:
        break;
    }
    return json({ ok: true });
  }

  const user = await userFor(req);
  if (!user) return json({ error: 'unauthorized' }, 401);

  if (path === 'entitlement') return json(await grantFor(user.id));

  if (path === 'checkout') {
    const { sessionId } = await req.json().catch(() => ({ sessionId: null }));
    if (!sessionId) return json({ error: 'sessionId required' }, 400);
    const session = await stripe.checkout.sessions.retrieve(String(sessionId), { expand: ['line_items'] });
    if (session.payment_status !== 'paid' && session.status !== 'complete') return json({ error: 'not paid' }, 402);
    const price = session.line_items?.data?.[0]?.price?.id ?? '';
    const tier = TIER_BY_PRICE[price];
    if (!tier) return json({ error: 'unknown price' }, 400);
    // Open-ended for now: the subscription webhook lands within seconds and
    // replaces this with the real period end. Granting immediately is what
    // stops a paying customer staring at a free account while Stripe catches up.
    await setGrant(user.id, tier, null, 'stripe', String(sessionId));
    return json(await grantFor(user.id));
  }

  if (path === 'redeem') {
    const { code } = await req.json().catch(() => ({ code: null }));
    if (!code) return json({ error: 'code required' }, 400);
    const db = admin();
    const { data: row } = await db
      .from('promo_codes')
      .select('code, tier, days, max_uses, uses')
      .eq('code', String(code).trim().toUpperCase())
      .maybeSingle();
    if (!row) return json({ error: 'unknown code' }, 404);
    if (row.max_uses != null && row.uses >= row.max_uses) return json({ error: 'code exhausted' }, 410);
    await db.from('promo_codes').update({ uses: row.uses + 1 }).eq('code', row.code);
    await setGrant(user.id, row.tier, Date.now() + row.days * 86_400_000, 'code', row.code);
    return json(await grantFor(user.id));
  }

  return json({ error: 'not found' }, 404);
});
