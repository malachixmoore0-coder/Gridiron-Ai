/**
 * The Simtoad subscription ladder.
 *
 * One subscription, every league. That is deliberate and it is the offer: the
 * Football runs September to February, basketball November to April, baseball
 * March to October: a single price that covers all of them is worth more to the
 * buyer than any one that goes dead for half the year — and it removes the churn cliff that kills seasonal
 * products.
 *
 * Four rungs, named for how deep into the work each one lets you go rather than
 * for a place on a roster — the old ladder (Walk-On, Starter, All-Pro,
 * Franchise) described a football team, which stopped being true at sixteen
 * leagues and never covered golf at all. Scout proves the model is real,
 * Analyst removes the meter, Quant sells the tools that turn a number into a
 * position, Desk sells the model itself. Every paid rung has to be worth its price on a single feature, not
 * on a bundle — that is the test each entitlement below has to pass.
 */

/**
 * The stored identity of a tier, which is deliberately not its name.
 *
 * These strings are written into the entitlements record on every device and
 * are what the promo codes resolve to, so renaming them to match the new
 * display names would orphan every saved subscription and every code already
 * issued — somebody paying for Quant would come back as free. They are never
 * rendered; `name` below is what a person sees. Leave them alone.
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
  /**
   * Picks on the opening screen's cross-sport board, in full.
   *
   * This is the shop window. A free account sees one complete pick a day —
   * side, number, reasoning and all — because a teaser proves nothing; what it
   * does not see is the rest of the sports playing today, which is the thing
   * being sold.
   */
  crossSportPicks: number;
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
  /** Line-move history and steam alerts. NOT WIRED — no screen reads this. */
  lineMoves: boolean;
  /** What-if lab: re-run with any player in or out. NOT WIRED. */
  lab: boolean;
  /** Saved-pick card and share images. NOT WIRED — nothing reads this yet. */
  shareCards: 'off' | 'basic' | 'branded';
  /** Teams you can follow for a personalised feed. */
  follows: number;
  /** Raw JSON model feed + backtests. NOT WIRED, and the feed is public today. */
  apiAccess: boolean;
  /** Model weight editing (your own priors). NOT WIRED. */
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
  /**
   * What this rung gives you today. Every line here must be something a
   * subscriber can open the app and use right now — if it is on the roadmap it
   * goes in `soon`, where it is labelled as such and nobody is charged for a
   * promise.
   */
  bullets: string[];
  /**
   * Being built, shown as such and never as a reason to pay yet.
   *
   * This list exists because the alternative is worse: five entitlements were
   * being advertised with no code reading them at all — the what-if lab, line
   * moves, the raw feed, editable weights, branded share cards — and line
   * shopping was sold on a feed that returns one book. Saying "in build" costs
   * a sale. Taking money for it costs a refund and the benefit of the doubt.
   */
  soon?: string[];
  entitlements: Entitlements;
  accent: 'ink' | 'green' | 'gold' | 'platinum';
}

const FREE: Entitlements = {
  simsPerDay: 3,
  simDepth: 2000,
  edgeBoardDepth: 3,
  crossSportPicks: 1,
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
    name: 'Scout',
    tagline: 'Free forever',
    monthly: 0,
    annual: 0,
    hook: 'See the model work before you pay a cent.',
    bullets: [
      'Eighteen leagues in one app',
      'Every model number on the full slate — line, total and the gap to market',
      'A free pick every day, a different sport each time',
      'Conviction ranking on the 3 best games a day',
      '3 simulations a day at 2,000 runs',
      'Live scores, box scores and the closing-line panel',
      'Last 7 days of the track record',
    ],
    entitlements: FREE,
    accent: 'ink',
  },
  {
    id: 'starter',
    name: 'Analyst',
    tagline: 'For the whole board, every night',
    monthly: 1299,
    annual: 9900,
    hook: 'Unlimited 10,000-run simulations across every league. No meter.',
    bullets: [
      'Unlimited sims at 10,000 runs, every league',
      "Four sports' best play every day, not one",
      'Conviction ranking on 10 games a day, any league',
      'Lock of the Day with the reasoning',
      'Full season track record + calibration',
      'Follow 5 teams and post your picks',
    ],
    entitlements: {
      ...FREE,
      simsPerDay: Infinity,
      simDepth: 10000,
      edgeBoardDepth: 10,
      crossSportPicks: 4,
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
    name: 'Quant',
    tagline: 'For the one who checks the numbers',
    monthly: 2999,
    annual: 24900,
    hook: 'Every sport on the board, the props, and the parlay maths behind them.',
    bullets: [
      'Everything in Analyst, at 25,000 runs',
      'Conviction on every game on the board — no cap',
      'Every sport on the board, every day',
      'Correlated parlay builder (up to 4 legs)',
      'Player prop projections — NFL and college football',
      'Upset Radar: every underdog the model has winning, in any league',
      'Follow as many teams as you like',
    ],
    soon: [
      'Line shopping across books — needs a feed that carries more than one',
      'What-if lab: pull a starter, re-run instantly',
      'Line-move history and steam alerts',
      'Branded share cards',
    ],
    entitlements: {
      ...FREE,
      simsPerDay: Infinity,
      simDepth: 25000,
      edgeBoardDepth: Infinity,
      crossSportPicks: Infinity,
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
    name: 'Desk',
    tagline: 'For the whole operation',
    monthly: 9900,
    annual: 89900,
    hook: 'The deepest simulations, the longest parlays, and a direct line to the build.',
    bullets: [
      'Everything in Quant, at 50,000 runs',
      '8-leg parlay engine with the correlation haircut',
      'Direct line to the build',
    ],
    soon: [
      'Raw JSON feed: every projection, every hour',
      'Backtests against the full season archive',
      'Edit the node weights and keep your own priors',
    ],
    entitlements: {
      simsPerDay: Infinity,
      simDepth: 50000,
      edgeBoardDepth: Infinity,
      crossSportPicks: Infinity,
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

/** Days of full Quant on the house, once, no card. */
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
