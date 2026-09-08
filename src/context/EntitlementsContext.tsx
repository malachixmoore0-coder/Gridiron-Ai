/**
 * Who the user is to the product: which tier, how much of today's free meter is
 * left, whether the trial is running, and what each of those unlocks.
 *
 * Where a tier comes from lives in @/monetize/verify, and this file is careful
 * never to be its own authority. Two rules follow from that:
 *
 *   • the address bar is not evidence. `?upgraded=<tier>` used to be enough to
 *     hand out Franchise to anybody who typed it. It is now only honoured when
 *     no verifier is configured, and even then the grant is stamped
 *     `provisional` and the app says so;
 *   • a server's answer wins in both directions. When the check function is
 *     deployed it can grant a tier this device does not have *and take away one
 *     it should not*. A `null` answer is "unknown", never "free" — an outage
 *     must not downgrade a paying customer mid-Sunday.
 *
 * Grants also expire now. A thirty-day code used to be thirty days in name
 * only: nothing ever looked at the number again.
 */
import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Entitlements, RANK, TIER_BY_ID, TIERS, TRIAL_DAYS, TRIAL_TIER, Tier, TierId, Cycle } from '@/monetize/tiers';
import { checkoutUrl, openLink, paymentsLive } from '@/monetize/checkout';
import { redeemOnServer, serverEntitlement, verifyCheckout, verificationLive, type GrantSource } from '@/monetize/verify';

const KEY = 'gridiron-ai.entitlements.v1';
const DAY = 86_400_000;

interface Persisted {
  tier: TierId;
  cycle: Cycle;
  since: number | null;
  trialStartedAt: number | null;
  /** Redeemed founder / beta code, kept so support can see it. */
  code: string | null;
  /** How the current tier was obtained, and when it lapses. */
  source: GrantSource;
  grantExpires: number | null;
  /** Last time a server confirmed the tier. Null = never confirmed. */
  verifiedAt: number | null;
  /** Free-meter usage, reset each local day. */
  usage: { day: string; sims: number };
  /** Upgrade prompts already shown, so the app never nags twice for the same thing. */
  seen: string[];
}

const today = () => new Date().toISOString().slice(0, 10);
const DEFAULTS: Persisted = { tier: 'walkon', cycle: 'monthly', since: null, trialStartedAt: null, code: null, source: 'none', grantExpires: null, verifiedAt: null, usage: { day: today(), sims: 0 }, seen: [] };

/**
 * Beta codes, for the offline path only.
 *
 * These used to be plain strings in the bundle, which meant every code shipped
 * to every visitor — the longest-lived one was ten years of Franchise to anyone who ran
 * `strings` over the JavaScript, no devtools required. They are stored as
 * digests now so reading the bundle does not hand them over.
 *
 * Be clear-eyed about what that is: obfuscation, not security. The comparison
 * still happens on the device, so somebody who reads this file can still work a
 * code out. It raises the floor from "grep the bundle" to "reverse the hash",
 * and the actual fix is the branch above it — when a verifier is configured,
 * redemption happens on the server against a table that never ships.
 */
const CODES: Record<string, { tier: TierId; days: number }> = {
  '3b411d94': { tier: 'franchise', days: 3650 },
  'b4aad6cc': { tier: 'allpro', days: 30 },
  'fe4b15ea': { tier: 'allpro', days: 365 },
  '60a1e901': { tier: 'starter', days: 30 },
};

/** FNV-1a, 32-bit. Enough to keep the codes out of a plain-text search. */
function digest(input: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < input.length; i += 1) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h.toString(16).padStart(8, '0');
}

interface State {
  loaded: boolean;
  tier: Tier;
  tierId: TierId;
  cycle: Cycle;
  ent: Entitlements;
  paid: boolean;
  /** Trial state, if one is running or available. */
  trial: { active: boolean; available: boolean; daysLeft: number };
  /** Sims left today on the free meter; Infinity when uncapped. */
  simsLeft: number;
  /** True when the tier covers the entitlement at all. */
  can: (key: keyof Entitlements) => boolean;
  /** Numeric ceiling for an entitlement. */
  limit: (key: keyof Entitlements) => number;
  /** True when a server has confirmed this tier. False = provisional. */
  verified: boolean;
  /** Whether a verifier exists at all, so the UI can word it honestly. */
  verifiable: boolean;
  /** Reconcile with the server for this session token. Safe to call often. */
  sync: (token: string | null) => Promise<void>;
  /** Spend one unit of the daily meter. False = out of sims. */
  spendSim: () => boolean;
  atLeast: (t: TierId) => boolean;
  startTrial: () => void;
  redeem: (code: string) => Promise<{ ok: boolean; message: string }>;
  upgrade: (tier: TierId, cycle: Cycle) => Promise<'checkout' | 'intent'>;
  setCycle: (c: Cycle) => void;
  /** Dev/preview: set the tier by hand (Settings → Developer). */
  setTier: (t: TierId) => void;
  markSeen: (k: string) => void;
  hasSeen: (k: string) => boolean;
}

const Ctx = createContext<State | null>(null);

export function EntitlementsProvider({ children }: { children: React.ReactNode }) {
  const [s, setS] = useState<Persisted>(DEFAULTS);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const raw = await AsyncStorage.getItem(KEY);
        let next = raw ? { ...DEFAULTS, ...(JSON.parse(raw) as Partial<Persisted>) } : DEFAULTS;
        if (next.usage?.day !== today()) next = { ...next, usage: { day: today(), sims: 0 } };
        // A grant that has run out is not a grant. Nothing used to check this,
        // so a thirty-day code was thirty days in name only.
        if (next.grantExpires != null && next.grantExpires < Date.now()) {
          next = { ...next, tier: 'walkon', source: 'none', grantExpires: null, code: null, since: null };
        }

        /* Coming back from checkout. Stripe is asked to confirm it; the address
           bar is only taken at its word when there is nobody to ask, and even
           then the grant is marked provisional rather than sold as verified. */
        let session: string | null = null;
        if (Platform.OS === 'web' && typeof window !== 'undefined') {
          const q = new URLSearchParams(window.location.search);
          session = q.get('session_id');
          const claimed = q.get('upgraded') as TierId | null;
          // Honoured in exactly one situation: payments are switched on but the
          // verifier is not, which is a deliberate, degraded mode an operator
          // opts into. With no payment links configured nobody can have bought
          // anything, so the parameter is not evidence of a purchase — it is
          // just a word in the address bar, and it is ignored.
          if (claimed && TIER_BY_ID[claimed] && paymentsLive && !verificationLive) {
            next = { ...next, tier: claimed, since: Date.now(), source: 'checkout', grantExpires: null, verifiedAt: null };
          }
          if (session || claimed) window.history.replaceState({}, '', window.location.pathname);
        }
        setS(next);
        pendingSession.current = session;
      } catch { /* first run */ }
      setLoaded(true);
    })();
  }, []);

  const save = useCallback((next: Persisted) => { setS(next); AsyncStorage.setItem(KEY, JSON.stringify(next)).catch(() => {}); }, []);

  /**
   * The meter, mirrored where a synchronous read can reach it.
   *
   * `spendSim` runs on a tap, and two taps inside one render both read the same
   * `s` — so hammering a Simulate button spent one unit and ran two. The ref is
   * written before the state is, which makes the second call in a tick see the
   * first one's spend.
   */
  /** A checkout session seen on the URL, waiting for a signed-in session to confirm it. */
  const pendingSession = useRef<string | null>(null);
  /** The session token the last sync ran with, so redeem can reuse it. */
  const tokenRef = useRef<string | null>(null);

  const usage = useRef(s.usage);
  if (usage.current.day !== s.usage.day || usage.current.sims < s.usage.sims) usage.current = s.usage;

  const trialActive = s.trialStartedAt != null && Date.now() - s.trialStartedAt < TRIAL_DAYS * DAY;
  const effectiveId: TierId = trialActive && RANK[TRIAL_TIER] > RANK[s.tier] ? TRIAL_TIER : s.tier;
  const tier = TIER_BY_ID[effectiveId] ?? TIERS[0];
  const ent = tier.entitlements;

  const value: State = useMemo(() => ({
    loaded,
    tier,
    tierId: effectiveId,
    cycle: s.cycle,
    ent,
    paid: RANK[effectiveId] > 0,
    trial: {
      active: trialActive,
      available: s.trialStartedAt == null && RANK[s.tier] === 0,
      daysLeft: trialActive ? Math.max(0, Math.ceil((s.trialStartedAt! + TRIAL_DAYS * DAY - Date.now()) / DAY)) : 0,
    },
    verified: s.verifiedAt != null,
    verifiable: verificationLive,
    sync: async (token) => {
      tokenRef.current = token;
      if (!verificationLive) return;
      // A pending checkout is confirmed first, so the tier the person just paid
      // for is live before the general check reads it back.
      const pending = pendingSession.current;
      if (pending) {
        const g = await verifyCheckout(pending, token);
        pendingSession.current = null;
        if (g) { save({ ...s, tier: g.tier, since: Date.now(), source: 'server', grantExpires: g.expiresAt, verifiedAt: Date.now() }); return; }
      }
      const grant = await serverEntitlement(token);
      // null is "no answer", not "free" — an outage must never downgrade a
      // paying customer. Only a real answer is allowed to change anything.
      if (!grant) return;
      if (grant.tier === s.tier && s.verifiedAt != null) { save({ ...s, verifiedAt: Date.now(), grantExpires: grant.expiresAt }); return; }
      save({ ...s, tier: grant.tier, source: 'server', grantExpires: grant.expiresAt, verifiedAt: Date.now(), since: s.since ?? Date.now() });
    },
    simsLeft: ent.simsPerDay === Infinity
      ? Infinity
      : Math.max(0, ent.simsPerDay - (s.usage.day === today() ? s.usage.sims : 0)),
    can: (key) => {
      const v = ent[key];
      return typeof v === 'number' ? v > 0 : typeof v === 'boolean' ? v : v !== 'off';
    },
    limit: (key) => { const v = ent[key]; return typeof v === 'number' ? v : v ? 1 : 0; },
    spendSim: () => {
      if (ent.simsPerDay === Infinity) return true;
      const day = today();
      const spent = usage.current.day === day ? usage.current.sims : 0;
      if (spent >= ent.simsPerDay) return false;
      const next = { day, sims: spent + 1 };
      usage.current = next;
      save({ ...s, usage: next });
      return true;
    },
    atLeast: (t) => RANK[effectiveId] >= RANK[t],
    startTrial: () => save({ ...s, trialStartedAt: Date.now() }),
    redeem: async (raw) => {
      const code = raw.trim().toUpperCase();
      if (!code) return { ok: false, message: 'Enter a code first.' };
      if (verificationLive) {
        const g = await redeemOnServer(code, tokenRef.current);
        if (!g) return { ok: false, message: 'That code is not live. Check the spelling?' };
        save({ ...s, tier: g.tier, since: Date.now(), code, source: 'server', grantExpires: g.expiresAt, verifiedAt: Date.now() });
        return { ok: true, message: `${TIER_BY_ID[g.tier].name} unlocked. Welcome in.` };
      }
      const hit = CODES[digest(code)];
      if (!hit) return { ok: false, message: 'That code is not live. Check the spelling?' };
      save({ ...s, tier: hit.tier, since: Date.now(), code, source: 'code', grantExpires: Date.now() + hit.days * DAY, verifiedAt: null });
      return { ok: true, message: `${TIER_BY_ID[hit.tier].name} unlocked. Welcome in.` };
    },
    upgrade: async (t, c) => {
      const url = checkoutUrl(t, c);
      if (url && (await openLink(url))) return 'checkout';
      save({ ...s, seen: [...new Set([...s.seen, `intent:${t}:${c}`])] });
      return 'intent';
    },
    setCycle: (c) => save({ ...s, cycle: c }),
    setTier: (t) => save({ ...s, tier: t, since: Date.now() }),
    markSeen: (k) => save({ ...s, seen: [...new Set([...s.seen, k])] }),
    hasSeen: (k) => s.seen.includes(k),
  }), [loaded, s, tier, ent, effectiveId, trialActive, save]);

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useEntitlements(): State {
  const v = useContext(Ctx);
  if (!v) throw new Error('useEntitlements outside EntitlementsProvider');
  return v;
}
