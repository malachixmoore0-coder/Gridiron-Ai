/**
 * The league-neutral shapes the shared surfaces speak.
 *
 * Both leagues publish the same feed contract with a few extras of their own
 * (college carries poll ranks and bowl names, the NFL carries division flags
 * and a broadcast), so the shared type is the common core plus those extras as
 * optionals. Adapters hand their own richer objects straight through — every
 * required member is already there.
 */
import type { GameStatus, GameWeather, PredictionRecord } from '@/data/liveTypes';
import type { Weather } from '@/engine/types';

import type { LeagueKey, SportId } from '@/sports/types';

export type LeagueId = LeagueKey;

/** One sportsbook's numbers on one game. */
export interface BookLine {
  /** Stable key, e.g. "draftkings". */
  book: string;
  /** Display name, e.g. "DraftKings". */
  name: string;
  /** Home line the way a book prints it: -3.5 = home laying 3.5. */
  homeSpread: number | null;
  spreadHomeOdds: number | null;
  spreadAwayOdds: number | null;
  totalLine: number | null;
  overOdds: number | null;
  underOdds: number | null;
  homeMoneyline: number | null;
  awayMoneyline: number | null;
  /** ISO time this book was last read. */
  updated?: string | null;
}

export interface LeagueGame {
  id: string;
  season: number;
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
  primetime: boolean;
  weather: (GameWeather & { source: 'forecast' | 'observed' }) | null;
  weatherHint: Weather | null;
  awayScore: number | null;
  homeScore: number | null;
  status: GameStatus;
  statusDetail: string | null;
  /* league extras */
  broadcast?: string | null;
  notes?: string | null;
  divisionGame?: boolean;
  conferenceGame?: boolean;
  awayRank?: number | null;
  homeRank?: number | null;
  timeTbd?: boolean;
  lineSource?: string | null;
  /** Per-sportsbook numbers, when the feed carries them. */
  books?: BookLine[] | null;
}

export type { PredictionRecord };

export interface LeagueTeamRef {
  id: string;
  abbr: string;
  /** "Buffalo Bills" or "Ohio State Buckeyes". */
  name: string;
  /** "AFC East" or "Big Ten". */
  group: string;
  colors: { primary: string; secondary: string };
  logoUrl?: string;
  record?: string;
  rank?: number;
}

export interface WeekRef { week: number; gameType: string; label: string; games: number; final: number; live: number; start: string }

/** Everything a shared screen needs from whichever league is on screen. */
export interface LeagueView {
  id: LeagueId;
  /** Which sport's rules apply — decides draws, units and how a slate groups. */
  sport: SportId;
  /** True for the two football leagues, which run their own engine and screens. */
  bespoke: boolean;
  /** Still fetching this league's feed for the first time. */
  loading?: boolean;
  /** Why the feed is missing, when it is. */
  error?: string | null;
  /** "NFL" / "NCAA" — what the switcher shows. */
  short: string;
  /** "Pro football" / "College football". */
  label: string;
  season: number;
  week: number;
  phase: string;
  generatedAt: string;
  refreshing: boolean;
  refresh: () => Promise<void>;
  games: LeagueGame[];
  weekGames: LeagueGame[];
  weeks: WeekRef[];
  gamesForWeek: (week: number, gameType: string) => LeagueGame[];
  records: PredictionRecord[];
  findRecord: (gameId: string) => PredictionRecord | undefined;
  teams: LeagueTeamRef[];
  hasTeam: (id: string) => boolean;
  teamRef: (id: string) => LeagueTeamRef | null;
  abbrOf: (id: string) => string;
  nameOf: (id: string) => string;
}
