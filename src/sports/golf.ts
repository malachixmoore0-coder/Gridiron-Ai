/**
 * Golf: the published shape, the model, and the fetch.
 *
 * Everything else in this app is two sides and a margin. Golf is a hundred and
 * fifty players and a number, which breaks every assumption the rest of the
 * engine makes — so it gets its own small one rather than being forced through
 * a spread it does not have.
 *
 * The model is deliberately simple and says so on screen: each player's round
 * is drawn from a normal around their season scoring average, four rounds are
 * added up, and the lowest total wins. That is enough to price an outright
 * market and nothing more. It does not know the course, the weather, the form
 * of the last month, or who is putting well — and a golf model that claimed to
 * would be lying about the hardest sport to forecast there is.
 */
import { createRng, hashString } from '@/engine/rng';
import { MULTI_DATA_URL } from '@/sports/feed';
import type { RosterStat } from '@/sports/roster';

export interface GolfPlayer {
  id: string;
  name: string;
  short: string;
  headshotUrl: string | null;
  flagUrl: string | null;
  country: string | null;
  /** Season scoring average, the one number the model runs on. */
  scoringAverage: number | null;
  stats: RosterStat[];
  line: string | null;
  /** Percentile of scoring average across the ranked field, 1-99. */
  rating: number | null;
}

export interface GolfEntry {
  playerId: string;
  name: string;
  headshotUrl: string | null;
  flagUrl: string | null;
  /** "T4", "1", "CUT", "WD". */
  position: string | null;
  /** To par, negative is under. */
  score: number | null;
  scoreText: string | null;
  today: string | null;
  thru: string | null;
  rounds: number[];
  status: string | null;
}

export interface GolfTournament {
  id: string;
  name: string;
  short: string;
  start: string;
  end: string;
  status: 'scheduled' | 'in_progress' | 'final';
  statusDetail: string | null;
  course: string | null;
  purse: number | null;
  /** Rounds still to play, for the projection. */
  roundsLeft: number;
  field: GolfEntry[];
}

export interface GolfFile {
  generatedAt: string;
  season: number;
  /** How many players carry a published scoring average. */
  ranked: number;
  tournaments: GolfTournament[];
  players: GolfPlayer[];
}

/* ------------------------------------------------------------------ model -- */

/** Spread of a single round around a player's average, in strokes. */
export const ROUND_SIGMA = 2.9;

export interface FieldOdds {
  playerId: string;
  winPct: number;
  top5Pct: number;
  top10Pct: number;
}

/** Box–Muller, sharing one uniform stream. */
function normal(rand: () => number): number {
  let u = 0;
  let v = 0;
  while (u === 0) u = rand();
  while (v === 0) v = rand();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

/**
 * Simulate a field.
 *
 * `starting` is each player's score so far relative to the field — zero for a
 * tournament that has not begun. Ties for the win are split rather than played
 * out, because a simulated playoff would add noise without adding information.
 */
export function simulateField(
  entrants: { id: string; scoringAverage: number; startingScore?: number }[],
  roundsLeft: number,
  runs = 4000,
  seed = 1,
): FieldOdds[] {
  const n = entrants.length;
  if (!n || roundsLeft <= 0) return entrants.map((e) => ({ playerId: e.id, winPct: 0, top5Pct: 0, top10Pct: 0 }));

  const rng = createRng(seed);
  const rand = () => rng.next();
  const wins = new Float64Array(n);
  const top5 = new Float64Array(n);
  const top10 = new Float64Array(n);
  const totals = new Float64Array(n);
  const order = new Int32Array(n);

  for (let r = 0; r < runs; r += 1) {
    for (let i = 0; i < n; i += 1) {
      const e = entrants[i];
      let total = e.startingScore ?? 0;
      for (let k = 0; k < roundsLeft; k += 1) total += e.scoringAverage + normal(rand) * ROUND_SIGMA;
      totals[i] = total;
      order[i] = i;
    }
    // Partial ordering is all this needs: the top ten and who ties for first.
    const idx = Array.from(order).sort((a, b) => totals[a] - totals[b]);
    const best = totals[idx[0]];
    const tied = idx.filter((i) => totals[i] === best);
    const share = 1 / tied.length;
    for (const i of tied) wins[i] += share;
    for (let p = 0; p < Math.min(10, n); p += 1) {
      if (p < 5) top5[idx[p]] += 1;
      top10[idx[p]] += 1;
    }
  }

  return entrants.map((e, i) => ({
    playerId: e.id,
    winPct: (wins[i] / runs) * 100,
    top5Pct: (top5[i] / runs) * 100,
    top10Pct: (top10[i] / runs) * 100,
  }));
}

/** A stable seed for one tournament, so a projection reproduces exactly. */
export const fieldSeed = (tournamentId: string, roundsLeft: number) =>
  hashString(`${tournamentId}#${roundsLeft}`);

/* ------------------------------------------------------------------ fetch -- */

export const golfUrl = () => `${MULTI_DATA_URL}/pga/golf.json`;
