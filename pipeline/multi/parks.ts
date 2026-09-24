/**
 * How much the building changes the score.
 *
 * A model with one base total for a whole league says a game in San Diego and a
 * game in Denver should look the same, and they do not. The fix is a multiplier
 * per venue, measured the classic way: how much is scored in a club's home
 * games against how much the same clubs score on the road. Using the road half
 * as the baseline is what removes the team from the measurement — a good
 * offence inflates both halves and cancels.
 *
 * The hard part is not measuring it, it is knowing how much of the measurement
 * to believe. One season is about ninety home dates, and runs per game has a
 * standard deviation near five, so sampling noise alone will invent a spread
 * across thirty parks that looks a lot like a real one. Measured on this
 * season's data, roughly two thirds of the raw spread is noise: taken at face
 * value the factors make out-of-sample predictions worse, not better.
 *
 * So the raw ratio is shrunk toward one, and the amount is estimated from the
 * data on every run rather than fixed here. Subtracting the variance that
 * sampling alone would produce from the variance actually observed leaves the
 * share that is real, and that share is how much of the signal survives. A
 * league whose venues genuinely do not matter gets a reliability near zero and
 * its factors collapse to 1.0 on their own, which is why this can run for every
 * sport without a list of which ones have park effects.
 */

export interface ParkGame {
  homeId: string;
  awayId: string;
  homeScore: number | null;
  awayScore: number | null;
  neutralSite?: boolean;
}

export interface ParkFactors {
  generatedAt: string;
  games: number;
  /** The share of the raw spread that is not sampling noise. 0 disables the whole thing. */
  reliability: number;
  /** Raw spread before shrinking, and after — for the log line, and for judging it later. */
  rawSpread: number;
  spread: number;
  /** Home team id to a multiplier on the league's base total. Mean 1.0 by construction. */
  factors: Record<string, number>;
}

/** Below this there is nothing to measure and pretending otherwise is the bug. */
const MIN_HOME = 20;
const MIN_ROAD = 20;
const MIN_VENUES = 8;
/**
 * A cap, for the case the variance estimate is wrong rather than the data. No
 * venue in any of these sports moves scoring by half, so a factor that says so
 * is a fault upstream and not a discovery.
 */
const CAP = 0.35;

const mean = (a: number[]) => a.reduce((s, x) => s + x, 0) / (a.length || 1);
const variance = (a: number[]) => { const m = mean(a); return mean(a.map((x) => (x - m) ** 2)); };

export const emptyParks = (at: string): ParkFactors =>
  ({ generatedAt: at, games: 0, reliability: 0, rawSpread: 0, spread: 0, factors: {} });

export function computeParkFactors(all: ParkGame[], at: string): ParkFactors {
  const played = all.filter(
    (g) => g.homeScore != null && g.awayScore != null && !g.neutralSite,
  ) as (ParkGame & { homeScore: number; awayScore: number })[];
  if (played.length < MIN_VENUES * (MIN_HOME + MIN_ROAD)) return emptyParks(at);

  const total = (g: { homeScore: number; awayScore: number }) => g.homeScore + g.awayScore;
  const home = new Map<string, { n: number; runs: number }>();
  const road = new Map<string, { n: number; runs: number }>();
  const bump = (m: Map<string, { n: number; runs: number }>, k: string, r: number) => {
    const e = m.get(k) ?? { n: 0, runs: 0 };
    e.n += 1; e.runs += r; m.set(k, e);
  };
  for (const g of played) { bump(home, g.homeId, total(g)); bump(road, g.awayId, total(g)); }

  // The raw ratio, for venues with enough of both halves to compare.
  const raw = new Map<string, number>();
  const counts: { h: number; r: number }[] = [];
  for (const [id, h] of home) {
    const r = road.get(id);
    if (!r || h.n < MIN_HOME || r.n < MIN_ROAD) continue;
    raw.set(id, (h.runs / h.n) / (r.runs / r.n));
    counts.push({ h: h.n, r: r.n });
  }
  if (raw.size < MIN_VENUES) return emptyParks(at);

  // Centre on the league so the base total keeps its meaning.
  const centre = mean([...raw.values()]);
  if (!Number.isFinite(centre) || centre <= 0) return emptyParks(at);
  for (const [k, v] of raw) raw.set(k, v / centre);

  /*
   * What share of the spread is real. The variance two independent sample means
   * would produce on their own is sd^2/n on each half, expressed relative to the
   * league average because the quantity is a ratio; whatever is left over after
   * subtracting it is the part the venues account for.
   */
  const lg = mean(played.map(total));
  const gameVar = variance(played.map(total));
  const noise = mean(counts.map((c) => (gameVar / c.h) / (lg * lg) + (gameVar / c.r) / (lg * lg)));
  const observed = variance([...raw.values()]);
  const reliability = observed > 0 ? Math.max(0, Math.min(1, (observed - noise) / observed)) : 0;

  /*
   * Shrink, re-centre, and only then clamp. The order matters: capping first and
   * centring afterwards lets the centring push a capped value straight back out
   * past the cap, so the cap would not be a cap. Clamping last makes it one, at
   * the cost of the league mean drifting a hair off 1.0 in the only case the
   * clamp ever bites, which is data already wrong enough to need the guard.
   */
  const shrunk = new Map<string, number>();
  for (const [k, v] of raw) shrunk.set(k, 1 + reliability * (v - 1));
  const after = mean([...shrunk.values()]);

  const factors: Record<string, number> = {};
  for (const [k, v] of shrunk) {
    const centred = after > 0 ? v / after : 1;
    factors[k] = Math.round(Math.min(1 + CAP, Math.max(1 - CAP, centred)) * 1000) / 1000;
  }

  const vals = Object.values(factors);
  return {
    generatedAt: at,
    games: played.length,
    reliability: Math.round(reliability * 1000) / 1000,
    rawSpread: Math.round((Math.max(...raw.values()) - Math.min(...raw.values())) * 1000) / 1000,
    spread: Math.round((Math.max(...vals) - Math.min(...vals)) * 1000) / 1000,
    factors,
  };
}
