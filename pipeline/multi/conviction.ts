/**
 * The picks worth standing behind.
 *
 * The goal is a 70% hit rate. Across every game in every sport that is not
 * reachable and no model reaches it: holding a whole season's final records in
 * hand -- knowing in advance exactly how the year ends -- and simply picking the
 * better team wins 56.7% of baseball games, 61.6% of hockey, 71.0% of NBA and
 * 80.2% of college basketball. Baseball is close to a coin flip by construction,
 * which is why a hundred-win team still loses sixty-two.
 *
 * What is reachable is 70% on the games the model is actually confident about,
 * with the coverage stated plainly. A tier that hits 73% on three games in ten is
 * an honest product. The same tier sold as "our picks hit 73%" is not.
 *
 * The threshold is chosen by the lower end of a Wilson interval rather than the
 * hit rate itself, which matters more than it sounds. Scanning thresholds and
 * keeping whichever scored best is how you end up certifying a 100% tier on the
 * strength of one lucky game; the lower bound will not promote a threshold until
 * the sample behind it is large enough to support the claim. A league where no
 * threshold clears the bar reports that instead of finding one.
 */
import type { SportPredictionRecord } from '../../src/sports/feed';

export interface Conviction {
  generatedAt: string;
  /** Model confidence at or above which a pick joins the tier, or null if none qualifies. */
  threshold: number | null;
  target: number;
  /** Graded games at that threshold, and how they went. */
  picks: number;
  wins: number;
  hitRate: number;
  /** Lower end of the 95% interval -- the number the threshold was chosen on. */
  floor: number;
  /** Share of all graded games the tier covers. Small is fine; hidden is not. */
  coverage: number;
  graded: number;
  note: string;
}

/** Fewer than this behind a threshold and the hit rate is an anecdote. */
const MIN_PICKS = 30;
const STEP = 1;
const LOW = 50;
const HIGH = 85;

export function wilsonFloor(k: number, n: number, z = 1.96): number {
  if (!n) return 0;
  const p = k / n, z2 = z * z, den = 1 + z2 / n;
  const centre = p + z2 / (2 * n);
  const spread = z * Math.sqrt((p * (1 - p) + z2 / (4 * n)) / n);
  return Math.max(0, (centre - spread) / den);
}

type Graded = SportPredictionRecord & { result: NonNullable<SportPredictionRecord['result']> };

export const confidenceOf = (r: SportPredictionRecord): number => Math.max(r.homeWinPct, r.awayWinPct);

export const gradedOnly = (rs: SportPredictionRecord[]): Graded[] =>
  rs.filter((r): r is Graded => !!r.result);

/**
 * The lowest threshold whose interval clears the target. Lowest, not best: a
 * higher one may show a prettier rate on fewer games, and buying that is how the
 * tier ends up empty and overstated at the same time.
 */
export function chooseThreshold(rs: Graded[], target: number): number | null {
  for (let t = LOW; t <= HIGH; t += STEP) {
    const picks = rs.filter((r) => confidenceOf(r) >= t);
    if (picks.length < MIN_PICKS) continue;
    const wins = picks.filter((r) => r.result.suCorrect).length;
    if (wilsonFloor(wins, picks.length) >= target) return t;
  }
  return null;
}

/**
 * The best hit rate on offer at any qualifying threshold, ignoring whether its
 * interval clears the target. Reported next to the certified tier because "the
 * best we can show is 73% on 67 games, and 67 games cannot prove 70%" is a much
 * more useful thing to know than "no".
 */
export function bestAvailable(rs: Graded[], minPicks = MIN_PICKS): { threshold: number; picks: number; wins: number; rate: number; floor: number } | null {
  // Compared as a fraction and reported as a percentage. Keeping one variable for
  // both is how the first qualifying threshold silently wins every time.
  let best: { threshold: number; picks: number; wins: number; rate: number; floor: number } | null = null;
  let bestRate = -1;
  for (let t = LOW; t <= HIGH; t += STEP) {
    const picks = rs.filter((r) => confidenceOf(r) >= t);
    if (picks.length < minPicks) continue;
    const wins = picks.filter((r) => r.result.suCorrect).length;
    const rate = wins / picks.length;
    if (rate > bestRate) {
      bestRate = rate;
      best = { threshold: t, picks: picks.length, wins, rate: Math.round(1000 * rate) / 10, floor: Math.round(1000 * wilsonFloor(wins, picks.length)) / 10 };
    }
  }
  return best;
}

/**
 * How many picks it would take to prove a rate beats the target, if the rate
 * holds. Inverting the normal interval: the closer the true rate sits to the
 * target, the more games it takes to tell them apart, which is why a tier
 * running at 73% against a 70% target needs several hundred and one running at
 * 80% needs a few dozen.
 */
export function picksToCertify(rate: number, target: number, z = 1.96): number | null {
  if (rate <= target) return null;
  return Math.ceil((z * z * rate * (1 - rate)) / ((rate - target) ** 2));
}

export function computeConviction(all: SportPredictionRecord[], target: number, at: string): Conviction {
  const rs = gradedOnly(all);
  const empty = (note: string): Conviction => ({
    generatedAt: at, threshold: null, target, picks: 0, wins: 0, hitRate: 0, floor: 0,
    coverage: 0, graded: rs.length, note,
  });
  if (rs.length < MIN_PICKS) return empty(`only ${rs.length} graded games — too few to certify any tier`);

  const t = chooseThreshold(rs, target);
  if (t == null) {
    return empty(`no confidence level clears ${(100 * target).toFixed(0)}% on ${MIN_PICKS}+ games yet`);
  }
  const picks = rs.filter((r) => confidenceOf(r) >= t);
  const wins = picks.filter((r) => r.result.suCorrect).length;
  return {
    generatedAt: at,
    threshold: t,
    target,
    picks: picks.length,
    wins,
    hitRate: Math.round((1000 * wins) / picks.length) / 10,
    floor: Math.round(1000 * wilsonFloor(wins, picks.length)) / 10,
    coverage: Math.round((1000 * picks.length) / rs.length) / 10,
    graded: rs.length,
    note: `${wins}-${picks.length - wins} at ${t}%+ confidence, ${Math.round((100 * picks.length) / rs.length)}% of the slate`,
  };
}

/**
 * Does a threshold chosen on the past hold up on the future?
 *
 * This is the question, and it is not the same as whether a threshold looks good
 * on the games it was chosen from -- it always does. The record is split in two,
 * the threshold is picked on the first half alone, and the hit rate reported is
 * from the second half, which had no say in choosing it.
 */
export function validateForward(all: SportPredictionRecord[], target: number): {
  chosen: number | null; trainPicks: number; testPicks: number; testWins: number; testRate: number;
} {
  const rs = gradedOnly(all).sort((a, b) => (a.kickoff < b.kickoff ? -1 : 1));
  const cut = Math.floor(rs.length / 2);
  const t = chooseThreshold(rs.slice(0, cut), target);
  if (t == null) return { chosen: null, trainPicks: 0, testPicks: 0, testWins: 0, testRate: 0 };
  const train = rs.slice(0, cut).filter((r) => confidenceOf(r) >= t);
  const test = rs.slice(cut).filter((r) => confidenceOf(r) >= t);
  const wins = test.filter((r) => r.result.suCorrect).length;
  return {
    chosen: t,
    trainPicks: train.length,
    testPicks: test.length,
    testWins: wins,
    testRate: test.length ? Math.round((1000 * wins) / test.length) / 10 : 0,
  };
}
