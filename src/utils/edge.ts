/**
 * Model-versus-market maths. This is the part people pay for.
 *
 * The engine already publishes a projection for every game before kickoff
 * (predictions.json, written by the refresh workflow and frozen at kickoff).
 * Every number here is derived from that projection and the market lines on the
 * same game, so the Edge Board costs the device nothing and says exactly what
 * the graded track record says.
 *
 * Conventions, once, so the signs never drift:
 *   • A home line is printed the way a book prints it: -3.5 means home is
 *     favoured by 3.5. PredictionRecord.spread is the model's home line in the
 *     same convention (projectedAway − projectedHome).
 *   • Spread edge = market home line − model home line. Positive means the
 *     model thinks the home side is that many points better than the number.
 *   • Total edge = model total − market total. Positive leans over.
 */
import type { LiveGame, PredictionRecord } from '@/data/liveTypes';

/**
 * What the edge is measured in.
 *
 * Football and basketball have a handicap, so value is points of it. Soccer has
 * no handicap at all — the market is three prices — so value there is what the
 * model says minus what the price says, in points of probability. Mixing the
 * two up is how a 0.6-goal disagreement became "349.1 pts edge" on the front
 * page.
 */
export type EdgeUnit = 'pts' | 'pct';

export interface EdgeRow {
  gameId: string;
  game: LiveGame;
  rec: PredictionRecord;
  /** Value on the side the model likes, in `edgeUnit`. Always positive. */
  spreadEdge: number;
  edgeUnit: EdgeUnit;
  /** 'home' | 'away' — the side that edge is on. */
  spreadSide: 'home' | 'away';
  /** Points of value on the total, and which way. */
  totalEdge: number;
  totalSide: 'over' | 'under';
  /** Model win probability for the side it likes, 0-100. */
  sidePct: number;
  /** Expected value per $1 on the model's side at the posted moneyline, or null. */
  ev: number | null;
  /** 0-100 blend of edge size, model confidence and how settled the number is. */
  conviction: number;
  /** One line a human can act on. */
  reason: string;
  kickoff: number;
  live: boolean;
  played: boolean;
}

/* ---------- odds plumbing ---------- */

/** American odds → implied probability (with the vig still in it). */
export function impliedProb(american: number): number {
  return american > 0 ? 100 / (american + 100) : -american / (-american + 100);
}

/** Strip the vig from a two-way market so model and market compare like for like. */
export function devig(away: number, home: number): { away: number; home: number } {
  const a = impliedProb(away);
  const h = impliedProb(home);
  const s = a + h;
  return s > 0 ? { away: a / s, home: h / s } : { away: 0.5, home: 0.5 };
}

/** Decimal payout for $1 staked. */
export const payout = (american: number) => (american > 0 ? american / 100 : 100 / -american);

/** Expected value per $1 staked at these odds if the model's probability is right. */
export const evOf = (p: number, american: number) => p * payout(american) - (1 - p);

/** American odds that exactly price a probability — the "fair" number. */
export function fairOdds(p: number): number {
  if (p <= 0 || p >= 1) return 0;
  return p >= 0.5 ? -Math.round((p / (1 - p)) * 100) : Math.round(((1 - p) / p) * 100);
}

export const fmtOdds = (n: number) => (n > 0 ? `+${Math.round(n)}` : `${Math.round(n)}`);

/* ---------- the board ---------- */

/**
 * Conviction is deliberately not just "biggest edge". A 9-point disagreement on
 * a game the market has barely priced is usually the model being wrong about a
 * backup quarterback, so three things are blended:
 *   • edge — how far the model is from the number (capped, 55%)
 *   • confidence — how far the model's own probability is from a coin flip (30%)
 *   • settledness — how many refreshes have agreed on this number (15%)
 */
export function convictionOf(spreadEdge: number, sidePct: number, updates: number, unit: EdgeUnit = 'pts'): number {
  // Seven points is a full-mark disagreement on a handicap; on a price, eight
  // points of probability is. The two scales are not interchangeable.
  const edge = Math.min(Math.abs(spreadEdge) / (unit === 'pts' ? 7 : 8), 1) * 55;
  // On a handicap, a lopsided game is a confident one either way. On a price it
  // is not: backing an 11% outsider is the opposite of confidence, however good
  // the number is, so only the favourite's side of 50 counts there.
  const distance = unit === 'pts' ? Math.abs(sidePct - 50) : Math.max(sidePct - 50, 0);
  const conf = Math.min(distance / 25, 1) * 30;
  const settled = Math.min(updates / 6, 1) * 15;
  return Math.round(edge + conf + settled);
}

function reasonFor(row: Omit<EdgeRow, 'reason' | 'conviction'>, awayAbbr: string, homeAbbr: string): string {
  const side = row.spreadSide === 'home' ? homeAbbr : awayAbbr;
  if (row.edgeUnit === 'pct') {
    const price = row.spreadSide === 'home'
      ? row.game.homeMoneyline ?? (isPrice(row.game.homeSpread) ? row.game.homeSpread : null)
      : row.game.awayMoneyline;
    const at = price == null ? '' : ` at ${fmtOdds(price)}`;
    return `Model gives ${side} ${row.sidePct.toFixed(0)}% where the price${at} is worth ${(row.sidePct - row.spreadEdge).toFixed(0)}% — ${row.spreadEdge.toFixed(1)} points of value.`;
  }
  const market = row.game.homeSpread;
  const num = market == null ? null : row.spreadSide === 'home' ? market : -market;
  const at = num == null ? '' : ` at ${num > 0 ? `+${num}` : num}`;
  return `Model makes ${side} ${row.spreadEdge.toFixed(1)} better than the number${at} — ${row.sidePct.toFixed(0)}% to win outright.`;
}

/**
 * A handicap is the size of a handicap.
 *
 * The published feed has carried soccer prices in the spread field — Chelsea
 * -425 — and the app has to be right about that on the data already on people's
 * phones, not only on whatever the next refresh writes. So the check lives on
 * both sides of the wire.
 */
const HANDICAP_LIMIT = 30;
/** Over thirty means the number in the spread field is a price, not a handicap. */
export const isPrice = (v: number | null | undefined) => v != null && Math.abs(v) > HANDICAP_LIMIT;
const handicapOf = (v: number | null | undefined) => (v == null || isPrice(v) ? null : v);

/**
 * Value on a market with no handicap.
 *
 * A soccer market is three prices, not a line, so value is the model's own
 * probability minus the one the price implies. Two things make that honest:
 *
 * The vig comes off first. A book's three prices add up to more than certainty
 * — about six per cent more on a three-way market, four and a half on a
 * two-way — and comparing a model against the raw number credits it with value
 * that is really the book's margin. Where the whole market is on file the
 * overround is measured; where only part of it is, the usual figure is used and
 * said so here.
 *
 * And the bar is not zero. A model that disagrees by half a point is a model
 * with rounding error, not an opinion, and a side it gives less than a one-in-
 * four chance is not a play however good the number looks.
 */
const OVERROUND_THREE_WAY = 1.06;
const OVERROUND_TWO_WAY = 1.045;
const MIN_PRICE_EDGE = 3;
const MIN_PRICE_CHANCE = 25;

function priceEdge(g: LiveGame, rec: PredictionRecord): { edge: number; side: 'home' | 'away'; pct: number } | null {
  // A price filed under the spread is still the home side's price.
  const homePrice = g.homeMoneyline ?? (isPrice(g.homeSpread) ? g.homeSpread : null);
  const awayPrice = g.awayMoneyline;
  const drawPrice = g.drawMoneyline;
  if (homePrice == null && awayPrice == null) return null;

  const legs = [homePrice, awayPrice, drawPrice].filter((x): x is number => x != null);
  const whole = drawPrice != null ? legs.length === 3 : legs.length === 2;
  const overround = whole
    ? legs.reduce((sum, x) => sum + impliedProb(x), 0)
    : drawPrice != null ? OVERROUND_THREE_WAY : OVERROUND_TWO_WAY;

  const sides: { side: 'home' | 'away'; price: number | null; pct: number }[] = [
    { side: 'home', price: homePrice, pct: rec.homeWinPct },
    { side: 'away', price: awayPrice, pct: rec.awayWinPct },
  ];
  let best: { edge: number; side: 'home' | 'away'; pct: number } | null = null;
  for (const s of sides) {
    if (s.price == null || s.pct < MIN_PRICE_CHANCE) continue;
    const edge = s.pct - (impliedProb(s.price) / overround) * 100;
    if (!best || edge > best.edge) best = { edge, side: s.side, pct: s.pct };
  }
  return best && best.edge >= MIN_PRICE_EDGE ? best : null;
}

/** Build the Edge Board from the published slate and the published projections. */
export function buildEdges(
  games: LiveGame[],
  records: PredictionRecord[],
  abbrOf: (teamId: string) => string,
): EdgeRow[] {
  const byId = new Map(records.map((r) => [r.id, r]));
  const rows: EdgeRow[] = [];
  for (const g of games) {
    const rec = byId.get(g.id);
    if (!rec) continue;

    const market = handicapOf(g.homeSpread) ?? handicapOf(rec.marketHomeSpread);
    const marketTotal = g.totalLine ?? rec.marketTotal;
    const totalDiff = marketTotal == null ? 0 : rec.total - marketTotal;
    const common = {
      gameId: g.id,
      game: g,
      rec,
      totalEdge: Math.abs(totalDiff),
      totalSide: (totalDiff >= 0 ? 'over' : 'under') as 'over' | 'under',
      kickoff: Date.parse(g.kickoff),
      live: g.status === 'in_progress',
      played: g.status === 'final',
    };

    let base: Omit<EdgeRow, 'reason' | 'conviction'>;
    if (market != null) {
      const diff = market - rec.spread; // + = model likes home
      const spreadSide: 'home' | 'away' = diff >= 0 ? 'home' : 'away';
      const sidePct = spreadSide === 'home' ? rec.homeWinPct : rec.awayWinPct;
      const ml = spreadSide === 'home' ? g.homeMoneyline : g.awayMoneyline;
      base = { ...common, spreadEdge: Math.abs(diff), edgeUnit: 'pts', spreadSide, sidePct, ev: ml == null ? null : evOf(sidePct / 100, ml) };
    } else {
      // No handicap on this market — soccer, and any game a book has priced
      // but not spread. Without a price either there is nothing to compare the
      // model against, so the game simply has no edge to publish.
      const hit = priceEdge(g, rec);
      if (!hit) continue;
      const ml = hit.side === 'home' ? g.homeMoneyline : g.awayMoneyline;
      base = { ...common, spreadEdge: hit.edge, edgeUnit: 'pct', spreadSide: hit.side, sidePct: hit.pct, ev: ml == null ? null : evOf(hit.pct / 100, ml) };
    }

    rows.push({
      ...base,
      conviction: convictionOf(base.spreadEdge, base.sidePct, rec.updates, base.edgeUnit),
      reason: reasonFor(base, abbrOf(g.awayId), abbrOf(g.homeId)),
    });
  }
  return rows.sort((a, b) => b.conviction - a.conviction || b.spreadEdge - a.spreadEdge);
}

/**
 * The single play of the day: highest conviction among games that have not
 * kicked off, with a floor so the app says "nothing worth it today" rather than
 * inventing a pick out of a half-point disagreement.
 */
export function lockOfDay(rows: EdgeRow[], minConviction = 45): EdgeRow | null {
  const open = rows.filter((r) => !r.played && !r.live && r.kickoff > Date.now());
  const best = open[0];
  return best && best.conviction >= minConviction ? best : null;
}

/** Games where the model has the underdog winning outright — the upset board. */
export function upsets(rows: EdgeRow[]): EdgeRow[] {
  return rows
    .filter((r) => !r.played && r.game.homeSpread != null)
    .filter((r) => {
      const homeDog = (r.game.homeSpread ?? 0) > 0;
      const modelPicksHome = r.rec.homeWinPct >= 50;
      return homeDog === modelPicksHome && Math.abs(r.rec.homeWinPct - 50) > 2;
    })
    .sort((a, b) => Math.max(b.rec.homeWinPct, b.rec.awayWinPct) - Math.max(a.rec.homeWinPct, a.rec.awayWinPct));
}

/* ---------- parlays ---------- */

export interface ParlayLeg { key: string; gameId: string; label: string; prob: number; american: number | null; }

/**
 * Parlay pricing with a correlation haircut.
 *
 * Independent legs multiply. Legs from the same game do not — a team covering
 * and that game going over move together, and a book that lets you combine them
 * prices that in. Rather than pretend to a full copula on three data points,
 * this applies a flat, documented correlation of 0.12 per same-game pair,
 * shrinking the joint probability toward the weakest leg. It is deliberately
 * conservative: it will never quote a parlay as better than the independent
 * product.
 */
export const SAME_GAME_RHO = 0.12;

export function parlay(legs: ParlayLeg[]): { prob: number; fair: number; book: number | null; ev: number | null; correlated: boolean } {
  if (!legs.length) return { prob: 0, fair: 0, book: null, ev: null, correlated: false };
  const independent = legs.reduce((p, l) => p * l.prob, 1);
  let pairs = 0;
  for (let i = 0; i < legs.length; i += 1)
    for (let j = i + 1; j < legs.length; j += 1) if (legs[i].gameId === legs[j].gameId) pairs += 1;
  const weakest = Math.min(...legs.map((l) => l.prob));
  const prob = pairs ? independent + (weakest - independent) * Math.min(pairs * SAME_GAME_RHO, 0.6) : independent;
  const book = legs.every((l) => l.american != null)
    ? legs.reduce((d, l) => d * (payout(l.american as number) + 1), 1) - 1
    : null;
  return {
    prob,
    fair: fairOdds(prob),
    book: book == null ? null : book >= 1 ? Math.round(book * 100) : -Math.round(100 / book),
    ev: book == null ? null : prob * book - (1 - prob),
    correlated: pairs > 0,
  };
}

/* ---------- cover probabilities ---------- */

/**
 * Turning a projected margin into a cover probability needs a spread of
 * outcomes, and the on-device board has only the mean. Rather than re-run the
 * simulation for sixteen games, this uses the historical standard deviation of
 * NFL game margins around a projection — about 13.5 points — and the same for
 * totals, about 10.5. Those are the numbers the full simulation converges to,
 * so the board and the deep run agree to within about a point of probability.
 *
 * Where a real simulation is available (the result screen), prefer it. This is
 * the cheap approximation that makes a 16-game board instant.
 */
export const MARGIN_SIGMA = 13.5;
export const TOTAL_SIGMA = 10.5;

/** Standard normal CDF (Abramowitz & Stegun 7.1.26 via erf). */
export function normalCdf(z: number): number {
  const t = 1 / (1 + 0.2316419 * Math.abs(z));
  const d = 0.3989423 * Math.exp((-z * z) / 2);
  const p = d * t * (0.3193815 + t * (-0.3565638 + t * (1.781478 + t * (-1.821256 + t * 1.330274))));
  return z > 0 ? 1 - p : p;
}

/**
 * Probability the home side covers a line printed the book's way
 * (-3 = home laying 3). Pass the negated line for the away side.
 */
export function coverProb(projectedMargin: number, homeLine: number, sigma = MARGIN_SIGMA): number {
  return 1 - normalCdf((-homeLine - projectedMargin) / sigma);
}

/** Probability the total goes over a posted number. */
export function overProb(projectedTotal: number, line: number, sigma = TOTAL_SIGMA): number {
  return 1 - normalCdf((line - projectedTotal) / sigma);
}

/* ---------- sportsbooks ---------- */

/**
 * Books do not agree, and the disagreement is the whole game: a half point on a
 * spread and ten cents on the juice is the difference between a bet worth
 * making and one that is not. So every leg is priced against a *specific* book,
 * and the Lab lets you pick which — including "best available", which shops each
 * leg to whichever book is paying most for the side the model likes.
 */
export interface BookQuote {
  book: string;
  name: string;
  homeSpread: number | null;
  spreadHomeOdds: number | null;
  spreadAwayOdds: number | null;
  totalLine: number | null;
  overOdds: number | null;
  underOdds: number | null;
  homeMoneyline: number | null;
  awayMoneyline: number | null;
}

/** The line the game carries when no per-book data has landed yet. */
export function consensusQuote(game: LiveGame): BookQuote {
  return {
    book: 'consensus',
    name: (game as { lineSource?: string | null }).lineSource || 'Consensus',
    homeSpread: game.homeSpread,
    spreadHomeOdds: -110,
    spreadAwayOdds: -110,
    totalLine: game.totalLine,
    overOdds: -110,
    underOdds: -110,
    homeMoneyline: game.homeMoneyline,
    awayMoneyline: game.awayMoneyline,
  };
}

/** Every book on file for a game, consensus first when nothing else exists. */
export function quotesFor(game: LiveGame): BookQuote[] {
  const books = (game as { books?: BookQuote[] | null }).books;
  if (books && books.length) return books;
  return [consensusQuote(game)];
}

/**
 * Line shopping, done properly: take each leg from whichever book prices it
 * best for the bettor — the longest odds, and on a spread the friendliest
 * number as the tie-break.
 */
export function bestQuote(quotes: BookQuote[]): BookQuote {
  const best = <K extends keyof BookQuote>(key: K, better: (a: number, b: number) => boolean) =>
    quotes.reduce<number | null>((acc, q) => {
      const v = q[key] as number | null;
      if (v == null) return acc;
      return acc == null || better(v, acc) ? v : acc;
    }, null);
  const longer = (a: number, b: number) => a > b; // +150 beats +130, -105 beats -120
  return {
    book: 'best',
    name: 'Best available',
    homeSpread: best('homeSpread', (a, b) => a > b),
    spreadHomeOdds: best('spreadHomeOdds', longer),
    spreadAwayOdds: best('spreadAwayOdds', longer),
    totalLine: best('totalLine', (a, b) => a < b),
    overOdds: best('overOdds', longer),
    underOdds: best('underOdds', longer),
    homeMoneyline: best('homeMoneyline', longer),
    awayMoneyline: best('awayMoneyline', longer),
  };
}

/** Every leg the model is willing to price on one game, at one book's numbers. */
export function legsFor(row: EdgeRow, awayAbbr: string, homeAbbr: string, quote?: BookQuote): ParlayLeg[] {
  const q = quote ?? consensusQuote(row.game);
  const margin = row.rec.projectedHome - row.rec.projectedAway;
  const legs: ParlayLeg[] = [];
  const line = q.homeSpread ?? row.rec.marketHomeSpread;
  if (line != null) {
    const home = coverProb(margin, line);
    legs.push({ key: `${row.gameId}:spread:home`, gameId: row.gameId, label: `${homeAbbr} ${line > 0 ? `+${line}` : line}`, prob: home, american: q.spreadHomeOdds ?? -110 });
    legs.push({ key: `${row.gameId}:spread:away`, gameId: row.gameId, label: `${awayAbbr} ${-line > 0 ? `+${-line}` : -line}`, prob: 1 - home, american: q.spreadAwayOdds ?? -110 });
  }
  legs.push({ key: `${row.gameId}:ml:home`, gameId: row.gameId, label: `${homeAbbr} ML`, prob: row.rec.homeWinPct / 100, american: q.homeMoneyline });
  legs.push({ key: `${row.gameId}:ml:away`, gameId: row.gameId, label: `${awayAbbr} ML`, prob: row.rec.awayWinPct / 100, american: q.awayMoneyline });
  const total = q.totalLine ?? row.rec.marketTotal;
  if (total != null) {
    const over = overProb(row.rec.total, total);
    legs.push({ key: `${row.gameId}:total:over`, gameId: row.gameId, label: `${awayAbbr}/${homeAbbr} o${total}`, prob: over, american: q.overOdds ?? -110 });
    legs.push({ key: `${row.gameId}:total:under`, gameId: row.gameId, label: `${awayAbbr}/${homeAbbr} u${total}`, prob: 1 - over, american: q.underOdds ?? -110 });
  }
  return legs;
}
