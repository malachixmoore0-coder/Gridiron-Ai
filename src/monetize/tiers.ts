/**
 * Gridiron AI subscription ladder.
 *
 * One subscription, both leagues. That is deliberate and it is the offer: the
 * NFL runs September to February and college August to January, so a single
 * price that covers both is worth more to the buyer than two that each go dead
 * for half the year — and it removes the churn cliff that kills seasonal
 * products.
 *
 * Four rungs, priced on the one thing a bettor actually buys: conviction per
 * minute. Free proves the model is real, Starter removes the meter, All-Pro
 * sells the tools that turn a number into a bet, Franchise sells the model
 * itself. Every paid rung has to be worth its price on a single feature, not
 * on a bundle — that is the test each entitlement below has to pass.
 */

export type TierId = 'walkon' | 'starter' | 'allpro' | 'franchise';
export type Cycle = 'monthly' | 'annual';

export interface Entitlements {
  /** Simulations a day. Infinity = uncapped. */
  simsPerDay: number;
  /** Monte-Carlo runs per simulation. More runs = tighter interval. */
  simDepth: number;
  /** How far down the Edge Board you can see. */
  edgeBoardDepth: number;
  /** The single highest-conviction play of the day, with the reasoning. */
  lockOfDay: boolean;
  /** Days of track record you can page back through. */
  historyDays: number;
  /** Calibration curve + per-bucket hit rates. */
  calibration: boolean;
  /** Player prop projections on the profile screen. */
  props: boolean;
  /** Correlated parlay builder; number = max legs, 0 = locked. */
  parlayLegs: number;
  /** Line-move history and steam alerts. */
  lineMoves: boolean;
  /** What-if lab: re-run with any player in or out. */
  lab: boolean;
  /** Saved-pick card and share images. */
  shareCards: 'off' | 'basic' | 'branded';
  /** Teams you can follow for a personalised feed. */
  follows: number;
  /** Raw JSON model feed + backtests. */
  apiAccess: boolean;
  /** Model weight editing (your own priors). */
  customWeights: boolean;
}

export interface Tier {
  id: TierId;
  name: string;
  tagline: string;
  /** Cents, so nothing is ever a float. */
  monthly: number;
  annual: number;
  /** The one line that sells this rung. */
  hook: string;
  /** Bullets shown on the card — written as outcomes, not features. */
  bullets: string[];
  entitlements: Entitlements;
  accent: 'ink' | 'green' | 'gold' | 'platinum';
}

const FREE: Entitlements = {
  simsPerDay: 3,
  simDepth: 2000,
  edgeBoardDepth: 3,
  lockOfDay: false,
  historyDays: 7,
  calibration: false,
  props: false,
  parlayLegs: 0,
  lineMoves: false,
  lab: false,
  shareCards: 'off',
  follows: 1,
  apiAccess: false,
  customWeights: false,
};

export const TIERS: Tier[] = [
  {
    id: 'walkon',
    name: 'Walk-On',
    tagline: 'Free forever',
    monthly: 0,
    annual: 0,
    hook: 'See the model work before you pay a cent.',
    bullets: [
      'NFL and college in one app',
      '3 simulations a day at 2,000 runs',
      'Top 3 of the Edge Board',
      'Full slate, live scores and box scores',
      'Last 7 days of the track record',
    ],
    entitlements: FREE,
    accent: 'ink',
  },
  {
    id: 'starter',
    name: 'Starter',
    tagline: 'For Sundays and Saturdays',
    monthly: 1299,
    annual: 9900,
    hook: 'Unlimited 10,000-run simulations across both leagues. No meter.',
    bullets: [
      'Unlimited sims at 10,000 runs, both leagues',
      'The whole Edge Board — Sunday and Saturday',
      'Lock of the Day with the reasoning',
      'Full season track record + calibration',
      'Follow 5 teams and post your picks',
    ],
    entitlements: {
      ...FREE,
      simsPerDay: Infinity,
      simDepth: 10000,
      edgeBoardDepth: 10,
      lockOfDay: true,
      historyDays: 400,
      calibration: true,
      shareCards: 'basic',
      follows: 5,
    },
    accent: 'green',
  },
  {
    id: 'allpro',
    name: 'All-Pro',
    tagline: 'For the bettor with a bankroll',
    monthly: 2999,
    annual: 24900,
    hook: 'Line shopping, props and the tools that turn a number into a bet.',
    bullets: [
      'Everything in Starter, at 25,000 runs',
      'Line shopping: every book on every game',
      'Correlated parlay builder (up to 4 legs)',
      'Player prop projections on every starter',
      'Upset Radar across all 134 college programs',
      'What-if lab: pull a starter, re-run instantly',
      'Branded share cards for your group chat',
    ],
    entitlements: {
      ...FREE,
      simsPerDay: Infinity,
      simDepth: 25000,
      edgeBoardDepth: Infinity,
      lockOfDay: true,
      historyDays: 3650,
      calibration: true,
      props: true,
      parlayLegs: 4,
      lineMoves: true,
      lab: true,
      shareCards: 'branded',
      follows: Infinity,
    },
    accent: 'gold',
  },
  {
    id: 'franchise',
    name: 'Franchise',
    tagline: 'For the syndicate',
    monthly: 9900,
    annual: 89900,
    hook: 'The model itself — weights, feed and all.',
    bullets: [
      'Everything in All-Pro, at 50,000 runs',
      'Raw JSON feed: every projection, every hour',
      'Backtests against the full season archive',
      'Edit the node weights and keep your own priors',
      '8-leg parlay engine with correlation matrix',
      'Direct line to the build',
    ],
    entitlements: {
      simsPerDay: Infinity,
      simDepth: 50000,
      edgeBoardDepth: Infinity,
      lockOfDay: true,
      historyDays: 3650,
      calibration: true,
      props: true,
      parlayLegs: 8,
      lineMoves: true,
      lab: true,
      shareCards: 'branded',
      follows: Infinity,
      apiAccess: true,
      customWeights: true,
    },
    accent: 'platinum',
  },
];

export const FREE_TIER = TIERS[0];
export const TIER_BY_ID = Object.fromEntries(TIERS.map((t) => [t.id, t])) as Record<TierId, Tier>;
export const RANK: Record<TierId, number> = { walkon: 0, starter: 1, allpro: 2, franchise: 3 };

/** Days of full All-Pro on the house, once, no card. */
export const TRIAL_DAYS = 7;
export const TRIAL_TIER: TierId = 'allpro';

export const price = (cents: number) => (cents % 100 === 0 ? `$${cents / 100}` : `$${(cents / 100).toFixed(2)}`);

/** Annual framed the way people buy it: "2 months free". */
export function annualSaving(t: Tier): { pct: number; months: number } | null {
  if (!t.monthly || !t.annual) return null;
  const full = t.monthly * 12;
  return { pct: Math.round(((full - t.annual) / full) * 100), months: Math.round((full - t.annual) / t.monthly) };
}

/** The cheapest tier that actually unlocks a given entitlement. */
export function tierUnlocking(key: keyof Entitlements): Tier {
  const better = (v: Entitlements[keyof Entitlements], base: Entitlements[keyof Entitlements]) => {
    if (typeof v === 'number' && typeof base === 'number') return v > base;
    if (typeof v === 'boolean') return v && !base;
    return v !== base && v !== 'off';
  };
  return TIERS.find((t) => better(t.entitlements[key], FREE[key])) ?? TIERS[1];
}

/** The nudge shown when a locked surface is tapped. */
export function upsellFor(key: keyof Entitlements): { tier: TierId; line: string } {
  const need = tierUnlocking(key);
  return { tier: need.id, line: `${need.name} unlocks this` };
}
