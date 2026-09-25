/**
 * Watching a game.
 *
 * A pre-game projection is a statement about a game nobody has played yet. Once
 * it starts, most of what decides it is no longer the ratings -- it is the score
 * and how much time is left to change it. A three-run lead in the second inning
 * is worth a little; the same lead in the ninth is worth almost everything, and a
 * model that keeps reporting its pre-game number through both is not watching.
 *
 * So: how much game is left, what the lead is, and how much scoring the rest of
 * the game can still hold.
 *
 * The distribution of the remaining scoring is taken from the sport rather than
 * assumed, because the sports genuinely differ. Football and basketball put up
 * enough points that the remaining margin is close to normal, and are treated
 * that way. Baseball and soccer deal in single figures, where a normal curve is a
 * bad fit and, worse, cannot represent the two things that matter most in a close
 * one: that a tie in soccer is a result rather than a coin flip, and that a tie
 * in baseball is neither -- it is extra innings. Those are summed exactly over
 * the Poisson counts instead, which gives a draw probability honestly rather than
 * carving one out afterwards.
 *
 * What this deliberately does not do is pretend to more resolution than the feed
 * has. ESPN gives a period and a clock; it does not tell us there are two on and
 * one out. So a lead is assessed at the granularity of the half-inning, and the
 * score is the state. Base-out leverage would be a real improvement and would
 * need a real play-by-play feed.
 */
import type { SportProfile } from './types';

export interface LiveState {
  /** The period, inning or half in progress, counting from 1. */
  period: number;
  /** Seconds left in this period. Null when the sport has no clock. */
  clockSeconds: number | null;
  /** Baseball: true once the home side is batting. */
  bottomHalf?: boolean;
  homeScore: number;
  awayScore: number;
}

export interface LiveProbability {
  homeWinPct: number;
  awayWinPct: number;
  /** Soccer only, and only while a draw is still reachable. */
  drawPct?: number;
  /** How much of the game is still to play, 0 to 1. */
  remaining: number;
  /** False once the result can no longer change. */
  live: boolean;
}

/**
 * Overtime is short and unpredictable, so it is treated as a sliver of a game
 * rather than as none: a tie going to extra time is close to even, and whoever
 * happens to lead mid-overtime is a heavy but not certain favourite.
 */
const OVERTIME_REMAINING = 0.04;

/** See the note where it is used: the endgame is not a random walk. */
const ENDGAME_SIGMA_FLOOR = 0.3;

const clamp01 = (x: number) => (x < 0 ? 0 : x > 1 ? 1 : x);

/**
 * The share of the game still to come. 1 before the first pitch, 0 once it can
 * no longer change.
 */
export function fractionRemaining(s: LiveState, p: SportProfile): number {
  const regulation = Math.max(1, p.regulationPeriods);
  if (!Number.isFinite(s.period) || s.period < 1) return 1;
  // Past regulation: a fixed sliver, however many extra periods have been played.
  if (s.period > regulation) return OVERTIME_REMAINING;

  let withinPeriod: number;
  if (p.periodSeconds && s.clockSeconds != null && Number.isFinite(s.clockSeconds)) {
    withinPeriod = clamp01(1 - s.clockSeconds / p.periodSeconds);
  } else if (p.periodSeconds == null) {
    // No clock: an inning is counted in halves, which is all the feed supports.
    withinPeriod = s.bottomHalf ? 0.5 : 0;
  } else {
    // A clock sport whose clock did not arrive. Mid-period is the least wrong
    // guess, and is better than reporting the pre-game number all game.
    withinPeriod = 0.5;
  }
  return clamp01(1 - (s.period - 1 + withinPeriod) / regulation);
}

/** Φ, via Abramowitz & Stegun 7.1.26. Plenty for a win probability. */
function normalCdf(z: number): number {
  const t = 1 / (1 + 0.2316419 * Math.abs(z));
  const poly = t * (0.319381530 + t * (-0.356563782 + t * (1.781477937 + t * (-1.821255978 + t * 1.330274429))));
  const tail = Math.exp(-0.5 * z * z) / Math.sqrt(2 * Math.PI) * poly;
  return z >= 0 ? 1 - tail : tail;
}

/** Poisson pmf, iteratively so a large mean cannot overflow a factorial. */
function poissonPmf(mean: number, cap: number): number[] {
  const out = [Math.exp(-mean)];
  for (let k = 1; k <= cap; k++) out.push(out[k - 1] * mean / k);
  return out;
}

const pct = (x: number) => Math.round(clamp01(x) * 1000) / 10;

/**
 * The win probability given where the game actually stands.
 *
 * `projectedHome`/`projectedAway` are the pre-game scoreline; the rest of the
 * game is expected to hold the unplayed share of it. That is what carries the
 * teams' strength into the live number, so a good side trailing late is still
 * given more of a chance than a poor one in the same spot.
 */
export function liveWinProbability(
  s: LiveState,
  pregame: { projectedHome: number; projectedAway: number },
  p: SportProfile,
): LiveProbability {
  const f = fractionRemaining(s, p);
  const lead = s.homeScore - s.awayScore;

  // Settled.
  if (f <= 0) {
    if (lead > 0) return { homeWinPct: 100, awayWinPct: 0, ...(p.draws ? { drawPct: 0 } : {}), remaining: 0, live: false };
    if (lead < 0) return { homeWinPct: 0, awayWinPct: 100, ...(p.draws ? { drawPct: 0 } : {}), remaining: 0, live: false };
    // Level at the whistle: a result in soccer, and not one anywhere else.
    return p.draws
      ? { homeWinPct: 0, awayWinPct: 0, drawPct: 100, remaining: 0, live: false }
      : { homeWinPct: 50, awayWinPct: 50, remaining: 0, live: true };
  }

  if (p.model === 'poisson') {
    /*
     * Low-scoring sports, summed rather than approximated. The remaining share of
     * each side's projected scoreline is its Poisson mean, and every combination
     * of the two is enumerated -- which is what makes the tie a first-class
     * outcome instead of a rounding artefact.
     */
    const hMean = Math.max(0.01, pregame.projectedHome * f);
    const aMean = Math.max(0.01, pregame.projectedAway * f);
    const cap = Math.max(12, Math.ceil((hMean + aMean) * 4));
    const hp = poissonPmf(hMean, cap);
    const ap = poissonPmf(aMean, cap);
    let home = 0, away = 0, draw = 0;
    for (let h = 0; h <= cap; h++) {
      for (let a = 0; a <= cap; a++) {
        const prob = hp[h] * ap[a];
        const final = lead + h - a;
        if (final > 0) home += prob;
        else if (final < 0) away += prob;
        else draw += prob;
      }
    }
    const mass = home + away + draw;
    if (mass > 0) { home /= mass; away /= mass; draw /= mass; }
    // A level score is a result in soccer. In baseball it is extra innings, and
    // the sides that got there are close enough to even to split it.
    if (p.draws) return { homeWinPct: pct(home), awayWinPct: pct(away), drawPct: pct(draw), remaining: f, live: true };
    return { homeWinPct: pct(home + draw / 2), awayWinPct: pct(away + draw / 2), remaining: f, live: true };
  }

  /*
   * Continuous sports: the remaining margin around the unplayed share of the
   * projected one, widening with the square root of the time left.
   *
   * With a floor, because the square root alone lies about the endgame. It
   * describes a random walk, and the end of a basketball game is not one -- the
   * trailing side starts fouling and shooting threes, deliberately buying
   * variance, and the clock stops while it does. Left unfloored this called a
   * six-point lead with a minute left a certainty at 100.0%, where it is really
   * around 96%, and a model that says 100% about something that happens
   * ninety-six times in a hundred is worse than one that says 90%.
   *
   * A third of the full-game deviation is roughly what it takes to put the
   * familiar endgame numbers where they belong: six up with a minute left lands
   * near 96%, two up near 72%, twenty up at effectively over. It is a prior, not
   * a measurement -- there are no stored live states to fit it against yet, and
   * when there are, this is the number to check first.
   */
  const expected = (pregame.projectedHome - pregame.projectedAway) * f;
  const sigma = Math.max(ENDGAME_SIGMA_FLOOR * p.marginSigma, p.marginSigma * Math.sqrt(f));
  const home = normalCdf((lead + expected) / sigma);
  return { homeWinPct: pct(home), awayWinPct: pct(1 - home), remaining: f, live: true };
}
