/**
 * The published shape for every generic league.
 *
 * It deliberately reuses the field names the football feeds already use —
 * LeagueGame and PredictionRecord — so every shared surface (the Edge Board,
 * the slate drawer, the parlay lab, the card, the paywall's proof) works for a
 * WNBA game without a line of new code. The only additions are the ones the
 * other sports actually need: a draw price, a rating on the team, and a group
 * key that means "week" in football and "day" everywhere else.
 */
import type { BookLine, GameStatus, GameWeather } from '@/data/liveTypes';
import type { Weather } from '@/engine/types';
import type { LeagueKey, SportId } from '@/sports/types';

export interface SportTeam {
  id: string;
  /** ESPN's numeric id, kept so news and logos can be re-fetched. */
  espnId: string;
  abbr: string;
  /** "Boston Celtics" or "Purdue Boilermakers". */
  name: string;
  /** "Celtics" — used where space is tight. */
  short: string;
  /** Division, conference or table position group. */
  group: string;
  colors: { primary: string; secondary: string };
  logoUrl?: string | null;
  record?: string | null;
  /** Poll rank where the sport has one. */
  rank?: number | null;
  /* ---- what the engine reads ---- */
  /** Elo-style strength. 1500 is average. */
  rating: number;
  /** Scoring rate against league average, 1 = average. */
  attack: number;
  /** Scoring allowed against league average, 1 = average, lower is better. */
  defence: number;
  /** Games behind the rating, so the app can say how settled it is. */
  played: number;
}

/** A listed starting pitcher, as shown on a card. */
export interface GameProbable {
  id: string;
  name: string;
  era: number | null;
}

export interface SportGame {
  id: string;
  season: number;
  /** Week number in football, day-of-season index elsewhere. */
  week: number;
  gameType: string;
  kickoff: string;
  weekday: string;
  awayId: string;
  homeId: string;
  neutralSite: boolean;
  stadium: string;
  roof: string;
  homeSpread: number | null;
  totalLine: number | null;
  awayMoneyline: number | null;
  homeMoneyline: number | null;
  /** Soccer's third price. Null everywhere a draw cannot happen. */
  drawMoneyline?: number | null;
  primetime: boolean;
  /**
   * Kick-off forecast, for the outdoor sports the build can reach. These were
   * hard-null when every generic league was assumed to be played indoors or
   * with the weather ignored; baseball and soccer carry a real one now.
   */
  weather: GameWeather | null;
  weatherHint: Weather | null;
  /**
   * Tonight's listed starters, baseball only. Present once ESPN posts the
   * probables — usually a day out — and absent before that, which is honest:
   * a baseball projection made before the arms are named is a different, and
   * worse, projection than one made after.
   */
  homeProbable?: GameProbable | null;
  awayProbable?: GameProbable | null;
  awayScore: number | null;
  homeScore: number | null;
  status: GameStatus;
  statusDetail: string | null;
  broadcast?: string | null;
  notes?: string | null;
  awayRank?: number | null;
  homeRank?: number | null;
  books?: BookLine[] | null;
}

export interface SportGroup {
  /** Week number, or the day as an index. */
  week: number;
  gameType: string;
  /** "Week 4" or "Sat 12 Apr". */
  label: string;
  games: number;
  final: number;
  live: number;
  start: string;
}

export interface SportTeamsFile {
  league: LeagueKey;
  sport: SportId;
  generatedAt: string;
  season: number;
  /** Current week or day index. */
  week: number;
  phase: 'preseason' | 'regular' | 'postseason' | 'offseason';
  teams: SportTeam[];
}

export interface SportScheduleFile {
  generatedAt: string;
  season: number;
  week: number;
  phase: string;
  weeks: SportGroup[];
  games: SportGame[];
}

export interface SportPredictionsFile {
  generatedAt: string;
  season: number;
  model: { simulations: number; homeEdge: number; marketWeight: number; note: string };
  records: SportPredictionRecord[];
}

export interface SportPredictionRecord {
  id: string;
  season: number;
  week: number;
  gameType: string;
  kickoff: string;
  awayId: string;
  homeId: string;
  neutralSite: boolean;
  homeWinPct: number;
  awayWinPct: number;
  /** Soccer only. */
  drawPct?: number;
  projectedHome: number;
  projectedAway: number;
  spread: number;
  total: number;
  marketHomeSpread: number | null;
  marketTotal: number | null;
  predictedAt: string;
  updates: number;
  status: 'open' | 'locked' | 'final';
  lockedAt: string | null;
  result: {
    homeScore: number;
    awayScore: number;
    suCorrect: boolean;
    ats: 'win' | 'loss' | 'push' | null;
    ou: 'win' | 'loss' | 'push' | null;
    brier: number;
    spreadError: number;
    totalError: number;
  } | null;
}

/** Where a league's feed lives. Every generic league publishes the same three files. */
export const MULTI_DATA_URL: string =
  (process.env.EXPO_PUBLIC_MULTI_DATA_URL as string | undefined)?.replace(/\/$/, '') ??
  'https://raw.githubusercontent.com/malachixmoore0-coder/Gridiron-Ai/main/data/live/sports';

export const feedUrl = (slug: string, file: string) => `${MULTI_DATA_URL}/${slug}/${file}`;
