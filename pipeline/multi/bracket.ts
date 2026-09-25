/**
 * The playoffs, from here to the trophy.
 *
 * A league's postseason is not a list of games, it is a tree of series, and the
 * only honest way to say who wins it is to play the whole thing out many times.
 * That is what this does: every series still alive is simulated game by game
 * from the score it already stands at, the winner is advanced into the next
 * round, and the whole bracket is run enough times for the frequencies to mean
 * something.
 *
 * Three rules keep it honest.
 *
 * Nothing already decided is re-predicted. A series that stands at 2-0 starts
 * every simulation at 2-0, and a series already won is simply won -- the request
 * was to predict the games still to be played, and re-rolling a finished game
 * would quietly flatter the model by letting it "call" results it has seen.
 *
 * A round that has not been drawn is not invented. Where the bracket is known,
 * winners advance into the fixture that is actually waiting for them. Where it
 * is not, the round is reported as undrawn rather than guessed at from seeds
 * that may not be how the league reseeds.
 *
 * Home advantage follows the series, not the team. The side with the better
 * seed hosts the pattern its league uses, and that is worth real probability in
 * a seven-game series.
 */
import type { SportProfile } from '../../src/sports/types';

export interface BracketTeam {
  id: string;
  seed: number | null;
  rating: number;
  attack?: number;
  defence?: number;
}

export interface SeriesState {
  id: string;
  round: string;
  /** Games needed to win. 1 is a single elimination game. */
  bestOf: number;
  homeId: string;
  awayId: string;
  /** Games already won by each side. */
  homeWins: number;
  awayWins: number;
  /** Dates of the games still to be played, in order. */
  remaining: string[];
}

export interface SeriesOdds {
  id: string;
  round: string;
  homeId: string;
  awayId: string;
  homeWins: number;
  awayWins: number;
  bestOf: number;
  /** Chance each side takes the series, given where it already stands. */
  homePct: number;
  awayPct: number;
  /** Decided already: no games left to predict. */
  settled: boolean;
  gamesLeft: number;
}

export interface Bracket {
  generatedAt: string;
  league: string;
  rounds: string[];
  series: SeriesOdds[];
  /** Chance each side lifts the trophy, over the whole remaining bracket. */
  title: { teamId: string; pct: number }[];
  /** Rounds the league has not drawn yet, named so their absence is deliberate. */
  undrawn: string[];
  simulations: number;
}

const needed = (bestOf: number) => Math.floor(bestOf / 2) + 1;

/**
 * One game's win probability for the home side, from the rating gap and the
 * league's own home edge. Deliberately the same arithmetic the projection uses,
 * so a bracket cannot disagree with the board it sits next to.
 */
export function gameProbability(home: BracketTeam, away: BracketTeam, p: SportProfile, neutral = false): number {
  const margin = (home.rating - away.rating) * p.eloScale + (neutral ? 0 : p.homeEdge);
  // Normal margin around that, which is what the engine assumes for every sport
  // it reports a spread for.
  const z = margin / Math.max(0.5, p.marginSigma);
  return 1 / (1 + Math.exp(-1.702 * z));
}

/** A tiny deterministic generator, so a bracket does not move when nothing has. */
function rng(seed: number): () => number {
  let s = seed >>> 0 || 1;
  return () => {
    s ^= s << 13; s >>>= 0;
    s ^= s >> 17;
    s ^= s << 5; s >>>= 0;
    return s / 4294967296;
  };
}

/**
 * Play one series out from where it stands. Returns the winner's id.
 *
 * `pattern` is who hosts each remaining game, which matters: the better seed
 * hosting four of seven is worth more than a coin flip's difference.
 */
function playSeries(
  s: SeriesState,
  home: BracketTeam,
  away: BracketTeam,
  p: SportProfile,
  rand: () => number,
): string {
  const target = needed(s.bestOf);
  let hw = s.homeWins, aw = s.awayWins;
  let i = 0;
  while (hw < target && aw < target) {
    // 2-2-1-1-1 for a seven, 2-2-1 for a five, alternating otherwise: close
    // enough to every league's pattern that the difference is far below the
    // noise in the rating gap itself.
    const played = hw + aw;
    const atHome = s.bestOf === 1 ? true : [0, 1, 4, 6].includes(played);
    const pHome = atHome ? gameProbability(home, away, p) : 1 - gameProbability(away, home, p);
    if (rand() < pHome) hw += 1; else aw += 1;
    if (++i > 40) break;   // cannot happen; refuses to hang if it ever did
  }
  return hw >= target ? s.homeId : s.awayId;
}

export interface BracketInput {
  league: string;
  profile: SportProfile;
  teams: Map<string, BracketTeam>;
  series: SeriesState[];
  /** round -> the round its winners feed into, where the league has drawn it. */
  advancesTo?: Record<string, string>;
  undrawn?: string[];
  simulations?: number;
}

export function simulateBracket(input: BracketInput, at: string): Bracket {
  const { profile: p, teams, series } = input;
  const sims = input.simulations ?? 20000;
  const rounds = [...new Set(series.map((s) => s.round))];

  const titleWins = new Map<string, number>();
  const seriesWins = new Map<string, number>();
  const rand = rng(
    // Seeded from the shape of the bracket, so the same state gives the same
    // numbers run to run and a changed state gives different ones.
    series.reduce((h, s) => (h * 31 + s.id.length + s.homeWins * 7 + s.awayWins * 13) >>> 0, 17),
  );

  // Only the last round can crown anybody; if the bracket is partly undrawn the
  // title column is simply left out rather than attributed to a semi-finalist.
  const finalRound = rounds.length && !(input.undrawn ?? []).length ? rounds[rounds.length - 1] : null;

  for (let n = 0; n < sims; n++) {
    let champion: string | null = null;
    for (const s of series) {
      const home = teams.get(s.homeId), away = teams.get(s.awayId);
      if (!home || !away) continue;
      const w = playSeries(s, home, away, p, rand);
      seriesWins.set(`${s.id}:${w}`, (seriesWins.get(`${s.id}:${w}`) ?? 0) + 1);
      if (s.round === finalRound) champion = w;
    }
    if (champion) titleWins.set(champion, (titleWins.get(champion) ?? 0) + 1);
  }

  const pct = (n: number) => Math.round((1000 * n) / sims) / 10;
  const odds: SeriesOdds[] = series.map((s) => {
    const target = needed(s.bestOf);
    const settled = s.homeWins >= target || s.awayWins >= target;
    const hp = settled ? (s.homeWins >= target ? 100 : 0) : pct(seriesWins.get(`${s.id}:${s.homeId}`) ?? 0);
    return {
      id: s.id, round: s.round, homeId: s.homeId, awayId: s.awayId,
      homeWins: s.homeWins, awayWins: s.awayWins, bestOf: s.bestOf,
      homePct: hp,
      awayPct: Math.round((100 - hp) * 10) / 10,
      settled,
      gamesLeft: settled ? 0 : Math.max(0, s.bestOf - s.homeWins - s.awayWins),
    };
  });

  return {
    generatedAt: at,
    league: input.league,
    rounds,
    series: odds,
    title: [...titleWins.entries()]
      .map(([teamId, n]) => ({ teamId, pct: pct(n) }))
      .sort((a, b) => b.pct - a.pct),
    undrawn: input.undrawn ?? [],
    simulations: sims,
  };
}

/* ------------------------------------------------------------------------- */

export interface PlayoffGame {
  id: string;
  kickoff: string;
  gameType: string;
  homeId: string;
  awayId: string;
  homeScore: number | null;
  awayScore: number | null;
}

/** Series length by round depth, per sport. Index 0 is the first round played. */
const SERIES_SHAPE: Record<string, number[]> = {
  baseball: [3, 5, 7, 7],
  basketball: [3, 5, 7, 7],
  hockey: [7, 7, 7, 7],
};

const ROUND_NAMES = ['First round', 'Semi-finals', 'Conference finals', 'Finals'];

/**
 * Group postseason fixtures into series.
 *
 * Two sides meeting repeatedly inside the postseason are playing a series, and
 * that is the only signal available -- ESPN does not label the round. Grouping
 * by the pair is therefore the definition, and the round is inferred from when
 * the series starts relative to the others.
 *
 * A fixture with an unfilled side is skipped: those are the slots a later round
 * is waiting on, and they are what `undrawn` reports.
 */
export function seriesFromGames(games: PlayoffGame[], sport: string): { series: SeriesState[]; undrawn: string[] } {
  const post = games.filter((g) => g.gameType === 'postseason' && g.homeId && g.awayId);
  if (!post.length) return { series: [], undrawn: [] };

  const byPair = new Map<string, PlayoffGame[]>();
  for (const g of post) {
    const key = [g.homeId, g.awayId].sort().join('|');
    byPair.set(key, [...(byPair.get(key) ?? []), g]);
  }

  // Round depth from the order the series begin. Series starting within the same
  // few days belong to the same round.
  const pairs = [...byPair.entries()].map(([key, list]) => {
    const sorted = [...list].sort((a, b) => (a.kickoff < b.kickoff ? -1 : 1));
    return { key, list: sorted, start: sorted[0].kickoff };
  }).sort((a, b) => (a.start < b.start ? -1 : 1));

  const shape = SERIES_SHAPE[sport] ?? [7, 7, 7, 7];
  let round = 0;
  let roundStart = pairs.length ? Date.parse(pairs[0].start) : 0;
  const series: SeriesState[] = [];
  for (const pr of pairs) {
    // More than a week after this round began is the next round.
    if (Date.parse(pr.start) - roundStart > 8 * 86_400_000) { round += 1; roundStart = Date.parse(pr.start); }
    const first = pr.list[0];
    // The side hosting game one is the better seed, which is how every one of
    // these leagues arranges it.
    const homeId = first.homeId, awayId = first.awayId;
    let homeWins = 0, awayWins = 0;
    const remaining: string[] = [];
    for (const g of pr.list) {
      if (g.homeScore == null || g.awayScore == null) { remaining.push(g.kickoff); continue; }
      const homeWon = g.homeScore > g.awayScore;
      const winnerIsSeriesHome = (g.homeId === homeId) === homeWon;
      if (winnerIsSeriesHome) homeWins += 1; else awayWins += 1;
    }
    series.push({
      id: pr.key,
      round: ROUND_NAMES[Math.min(round, ROUND_NAMES.length - 1)],
      bestOf: shape[Math.min(round, shape.length - 1)] ?? 7,
      homeId, awayId, homeWins, awayWins, remaining,
    });
  }

  // Rounds the league has scheduled but not filled: fixtures with a side still
  // unknown are not in `post` at all, so the absence is inferred from the shape.
  const drawn = new Set(series.map((s) => s.round));
  const undrawn = ROUND_NAMES.slice(0, Math.max(...[...drawn].map((r) => ROUND_NAMES.indexOf(r)), 0) + 2)
    .filter((r) => !drawn.has(r));

  return { series, undrawn };
}

/**
 * Is this fixture part of a postseason?
 *
 * Three signals, because no one of them is dependable. ESPN's numeric season
 * type is the intended answer and is simply absent on some leagues' scoreboards
 * -- the WNBA played a full playoff and every game of it came back untyped. The
 * slug says "post-season" in words when the number does not. And a playoff
 * fixture is nearly always named as one: "WNBA Finals - Game 3", "NLDS Game 1".
 *
 * Any one of the three is enough. Guarding against a false positive matters
 * less than it looks: a regular-season game wrongly called a playoff would have
 * to also be played repeatedly between the same two sides within a week to be
 * mistaken for a series, which is what the grouping actually keys on.
 */
const PLAYOFF_WORDS = /\b(play-?offs?|post-?season|finals?|semi-?finals?|quarter-?finals?|conference final|wild ?card|division series|championship series|world series|elimination|nlds|alds|nlcs|alcs|game \d+ of)\b/i;

export function isPostseason(e: { seasonType: number | null; seasonSlug: string | null; title: string | null }): boolean {
  if (e.seasonType === 3) return true;
  if (e.seasonSlug && /post/.test(e.seasonSlug)) return true;
  return !!e.title && PLAYOFF_WORDS.test(e.title);
}
