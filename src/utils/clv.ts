/**
 * Closing line value — did the number get worse after we published it?
 *
 * This is the measure serious bettors use to judge a model, and it is the only
 * one that works before the results come in. Win rate over twenty games is
 * noise; beating the close is not, because the closing line is the market's
 * best estimate after every other opinion has been priced in. A model that
 * publishes +3.5 on a side that closes +2.5 was right about the direction the
 * market would move, whether or not that particular game happened to land.
 *
 * The sign convention, once, so it never drifts. A home line is printed the way
 * a book prints it: -3.5 means home is favoured by 3.5.
 *
 *   home side  → value = openLine − closeLine
 *   away side  → value = closeLine − openLine
 *
 * Laying -3 on a game that closes -4 is a point of value: we gave up three and
 * everyone after us gave up four. Taking +3 on a game that closes +2 is the
 * same point from the other end.
 *
 * Where a market has no handicap — soccer — the same question is asked of the
 * price, in points of implied probability: a side that shortens after we take
 * it has moved our way.
 */
import { impliedProb } from '@/utils/edge';

export interface LineSnapshot {
  at: string;
  spread: number | null;
  total: number | null;
  home: number | null;
  away: number | null;
}

export interface LineHistory {
  kickoff: string;
  opened: LineSnapshot;
  moves: LineSnapshot[];
  closed: LineSnapshot | null;
}

export interface LinesFile {
  league: string;
  generatedAt: string;
  games: Record<string, LineHistory>;
}

export type ClvUnit = 'pts' | 'pct';

export interface ClvRow {
  gameId: string;
  side: 'home' | 'away';
  unit: ClvUnit;
  /** The number the model published against. */
  open: number;
  /** The number the market settled on. */
  close: number;
  /** Positive means the number got worse after we called it. */
  value: number;
}

/** The value of one side, given the two numbers, in points of handicap. */
export const spreadClv = (side: 'home' | 'away', open: number, close: number) =>
  side === 'home' ? open - close : close - open;

/** The value of one price, in points of implied probability. */
export const priceClv = (open: number, close: number) =>
  (impliedProb(close) - impliedProb(open)) * 100;

export interface ClvSummary {
  /** Games with both an opening number and a close on file. */
  graded: number;
  /** How many of those closed worse than we called them. */
  beat: number;
  /** Share of graded picks that beat the close, 0-100. */
  hitRate: number | null;
  /** Mean value across handicap picks, in points. */
  avgPoints: number | null;
  /** Mean value across price-only picks, in points of probability. */
  avgPct: number | null;
  rows: ClvRow[];
}

const EMPTY: ClvSummary = { graded: 0, beat: 0, hitRate: null, avgPoints: null, avgPct: null, rows: [] };

interface PickedSide { id: string; side: 'home' | 'away' }

/**
 * Score every published call against the number it closed at.
 *
 * A game only counts once it has a close on file, and a call only counts if it
 * was published before the line moved — which is the whole point of keeping the
 * opening number rather than the current one.
 */
export function clvOf(picks: PickedSide[], lines: LinesFile | null | undefined): ClvSummary {
  if (!lines?.games) return EMPTY;
  const rows: ClvRow[] = [];

  for (const pick of picks) {
    const hist = lines.games[pick.id];
    if (!hist?.closed) continue;
    const open = hist.opened;
    const close = hist.closed;

    if (open.spread != null && close.spread != null) {
      rows.push({
        gameId: pick.id, side: pick.side, unit: 'pts',
        open: open.spread, close: close.spread,
        value: spreadClv(pick.side, open.spread, close.spread),
      });
      continue;
    }

    const openPrice = pick.side === 'home' ? open.home : open.away;
    const closePrice = pick.side === 'home' ? close.home : close.away;
    if (openPrice != null && closePrice != null) {
      rows.push({
        gameId: pick.id, side: pick.side, unit: 'pct',
        open: openPrice, close: closePrice,
        value: priceClv(openPrice, closePrice),
      });
    }
  }

  if (!rows.length) return EMPTY;

  const pts = rows.filter((r) => r.unit === 'pts');
  const pct = rows.filter((r) => r.unit === 'pct');
  const mean = (xs: ClvRow[]) => (xs.length ? xs.reduce((a, r) => a + r.value, 0) / xs.length : null);
  // A number that did not move is not a win. Beating the close means the market
  // came to you, and half a cent of movement is noise, so it has to be real.
  const beat = rows.filter((r) => r.value > 0.001).length;

  return {
    graded: rows.length,
    beat,
    hitRate: Math.round((beat / rows.length) * 1000) / 10,
    avgPoints: pts.length ? Math.round((mean(pts) as number) * 100) / 100 : null,
    avgPct: pct.length ? Math.round((mean(pct) as number) * 10) / 10 : null,
    rows,
  };
}
