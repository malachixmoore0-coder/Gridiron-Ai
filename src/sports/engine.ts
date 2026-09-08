/**
 * The generic engine.
 *
 * Two models, chosen by sport, because a basketball game and a soccer match do
 * not fail in the same shape:
 *
 *   normal   — football and basketball. Margin is the sum of many small
 *              possessions, so it converges on a normal around the projection,
 *              and the total varies independently of who wins.
 *   poisson  — baseball and soccer. Scores are small counts of rare events, so
 *              each side's runs or goals are drawn from their own Poisson. This
 *              is also where draws come from: in soccer they simply happen,
 *              rather than being a rule bolted onto a margin model.
 *
 * Everything is seeded, so the same matchup gives the same answer every time
 * and a published projection can be reproduced from the inputs alone.
 *
 * What it deliberately does not do: pretend to know more than the ratings it is
 * given. It takes two team ratings and a sport profile and returns a
 * distribution. Where the ratings come from — Elo off results, blended with the
 * market — is the pipeline's problem, and it is documented there.
 */
import { createRng, hashString } from '@/engine/rng';
import type { SportProfile } from '@/sports/types';

export interface SimTeam {
  id: string;
  /** Elo-style rating. 1500 is average; 100 points is a clear class gap. */
  rating: number;
  /** Scoring rate relative to the league average, 1 = average. */
  attack?: number;
  /** Scoring allowed relative to the league average, 1 = average, lower better. */
  defence?: number;
}

export interface SimInput {
  home: SimTeam;
  away: SimTeam;
  /** Neutral floor, court or pitch — no home edge. */
  neutral?: boolean;
  /** Market home line, when one exists, used only for the blended projection. */
  marketHomeSpread?: number | null;
  marketTotal?: number | null;
  /** 0 = ignore the market, 1 = follow it. The pipeline decides. */
  marketWeight?: number;
}

export interface SimResult {
  homeWinPct: number;
  awayWinPct: number;
  /** Soccer only; zero everywhere else. */
  drawPct: number;
  projectedHome: number;
  projectedAway: number;
  /** Home line the way a book prints it: negative = home favoured. */
  spread: number;
  total: number;
  /** Margin percentiles, for the range shown on a result screen. */
  p10: number;
  p50: number;
  p90: number;
  /** How often the game lands within a field goal / a possession / a run. */
  closePct: number;
  runs: number;
  /** Margin distribution, ready to draw. Negative bins are away wins. */
  bins: { from: number; to: number; pct: number }[];
}

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

/** Box–Muller, reusing one uniform stream. */
function normal(rand: () => number): number {
  let u = 0;
  let v = 0;
  while (u === 0) u = rand();
  while (v === 0) v = rand();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

/** Knuth for small means, which is all these sports ever need. */
function poisson(rand: () => number, lambda: number): number {
  if (lambda <= 0) return 0;
  if (lambda > 30) return Math.max(0, Math.round(lambda + Math.sqrt(lambda) * normal(rand)));
  const L = Math.exp(-lambda);
  let k = 0;
  let p = 1;
  do { k += 1; p *= rand(); } while (p > L);
  return k - 1;
}

/**
 * The projection before any simulation: a rating gap converted to margin, the
 * home edge, and — when the pipeline supplies one — a pull toward the market.
 * The market is not gospel, but a number twenty books agree on carries
 * information the ratings do not.
 */
export function project(input: SimInput, p: SportProfile): { margin: number; total: number } {
  const gap = (input.home.rating - input.away.rating) * p.eloScale;
  const edge = input.neutral ? 0 : p.homeEdge;
  let margin = gap + edge;

  const attack = (input.home.attack ?? 1) * (input.away.defence ?? 1);
  const defend = (input.away.attack ?? 1) * (input.home.defence ?? 1);
  let total = p.baseTotal * ((attack + defend) / 2);

  // A market number is only worth following if it is a market number. A feed
  // that files a price in the spread field — soccer arrived with Chelsea at
  // -425 — would otherwise be read as a 425-goal handicap and pull the
  // projection to 75.9 goals to nil, which is what it did. Nothing about a
  // sport's own scale allows that, so the scale is what decides.
  const line = plausible(input.marketHomeSpread, p.baseTotal * 1.5);
  const marketTotal = input.marketTotal != null && input.marketTotal >= p.baseTotal * 0.3 && input.marketTotal <= p.baseTotal * 3
    ? input.marketTotal
    : null;

  const w = clamp(input.marketWeight ?? 0, 0, 1);
  if (w > 0 && line != null) margin = margin * (1 - w) + -line * w;
  if (w > 0 && marketTotal != null) total = total * (1 - w) + marketTotal * w;

  return { margin, total: Math.max(p.baseTotal * 0.35, total) };
}

/** A market line the sport's own scale can account for, or nothing. */
const plausible = (v: number | null | undefined, limit: number) =>
  v != null && Number.isFinite(v) && Math.abs(v) <= limit ? v : null;

/** What counts as a one-score game in each sport. */
const closeBand = (p: SportProfile) => (p.sport === 'football' ? 3.5 : p.sport === 'basketball' ? 3.5 : 1.5);

export function simulate(input: SimInput, p: SportProfile, runs = 10_000, seed = 1): SimResult {
  const rng = createRng(seed);
  const rand = () => rng.next();
  const { margin, total } = project(input, p);

  let homeWins = 0;
  let awayWins = 0;
  let draws = 0;
  let close = 0;
  let sumHome = 0;
  let sumAway = 0;
  const margins = new Float64Array(runs);
  const band = closeBand(p);

  if (p.model === 'poisson') {
    // Split the projected total around the projected margin, then let each side
    // score independently. Clamped away from zero so a heavy favourite cannot
    // produce a negative rate.
    const lambdaHome = Math.max(0.05, (total + margin) / 2);
    const lambdaAway = Math.max(0.05, (total - margin) / 2);
    for (let i = 0; i < runs; i += 1) {
      const h = poisson(rand, lambdaHome);
      const a = poisson(rand, lambdaAway);
      let hs = h;
      let as = a;
      if (h === a && !p.draws) {
        // Baseball goes to extras: the better side wins it more often, but only
        // just — an extra-innings game is close to a coin flip by construction.
        const edge = clamp(0.5 + (input.home.rating - input.away.rating) / 4000 + (input.neutral ? 0 : 0.02), 0.35, 0.65);
        if (rand() < edge) hs += 1; else as += 1;
      }
      sumHome += hs;
      sumAway += as;
      const m = hs - as;
      margins[i] = m;
      if (m > 0) homeWins += 1; else if (m < 0) awayWins += 1; else draws += 1;
      if (Math.abs(m) <= band) close += 1;
    }
  } else {
    for (let i = 0; i < runs; i += 1) {
      const m = margin + normal(rand) * p.marginSigma;
      const t = Math.max(p.baseTotal * 0.3, total + normal(rand) * p.totalSigma);
      const h = (t + m) / 2;
      const a = (t - m) / 2;
      sumHome += h;
      sumAway += a;
      margins[i] = m;
      if (m > 0) homeWins += 1; else if (m < 0) awayWins += 1; else draws += 1;
      if (Math.abs(m) <= band) close += 1;
    }
  }

  const sorted = Array.from(margins).sort((x, y) => x - y);
  const at = (q: number) => sorted[clamp(Math.floor(q * runs), 0, runs - 1)];
  const bins = histogram(sorted, p);
  const projectedHome = sumHome / runs;
  const projectedAway = sumAway / runs;

  return {
    homeWinPct: (homeWins / runs) * 100,
    awayWinPct: (awayWins / runs) * 100,
    drawPct: p.draws ? (draws / runs) * 100 : 0,
    projectedHome,
    projectedAway,
    // A book prints the home line negative when home is favoured.
    spread: -(projectedHome - projectedAway),
    total: projectedHome + projectedAway,
    p10: at(0.1),
    p50: at(0.5),
    p90: at(0.9),
    closePct: (close / runs) * 100,
    runs,
    bins,
  };
}

/**
 * Twenty-one bins wide enough to hold the bulk of the distribution, with the
 * tails folded into the end bins so a single blowout run does not flatten the
 * chart into a line.
 */
function histogram(sorted: number[], p: SportProfile): { from: number; to: number; pct: number }[] {
  const n = sorted.length;
  if (!n) return [];
  const step = p.model === 'poisson' ? 1 : Math.max(1, Math.round(p.marginSigma / 4));
  const half = 10;
  const out = Array.from({ length: half * 2 + 1 }, (_, i) => ({ from: (i - half) * step, to: (i - half + 1) * step, pct: 0 }));
  for (const m of sorted) {
    const idx = clamp(Math.floor(m / step) + half, 0, out.length - 1);
    out[idx].pct += 1;
  }
  for (const b of out) b.pct = (b.pct / n) * 100;
  return out;
}

/** Probability the home side covers a line printed the book's way. */
export function coverProbability(res: SimResult, homeLine: number, p: SportProfile): number {
  // Re-deriving from the percentiles would be lossy, so this uses the normal
  // approximation the margins converge to. Poisson sports use the same call
  // because a spread there is a run or goal line, which behaves the same way
  // once the distribution is this wide.
  const mu = res.projectedHome - res.projectedAway;
  const sigma = p.marginSigma;
  const z = (-homeLine - mu) / sigma;
  return 1 - normalCdf(z);
}

export function normalCdf(z: number): number {
  const t = 1 / (1 + 0.2316419 * Math.abs(z));
  const d = 0.3989423 * Math.exp((-z * z) / 2);
  const prob = d * t * (0.3193815 + t * (-0.3565638 + t * (1.781478 + t * (-1.821256 + t * 1.330274))));
  return z > 0 ? 1 - prob : prob;
}

/** A stable seed for a matchup, so the same game always simulates the same. */
export const seedFor = (homeId: string, awayId: string, salt = 0): number =>
  hashString(`${awayId}@${homeId}#${salt}`);
