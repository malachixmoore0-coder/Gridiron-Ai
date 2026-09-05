/**
 * GRIDIRON-AI engine types.
 *
 * Everything the engine consumes is a plain, serialisable object so the same
 * code runs in the app, in a Node check script, and (later) against a live
 * data feed. Ratings are on a 1-10 scale unless a field says otherwise.
 */

export type Conference = 'AFC' | 'NFC';
export type Division = 'East' | 'North' | 'South' | 'West';

export type DefensiveFront = '4-3' | '3-4' | 'Multiple';
export type BaseCoverage = 'Cover-1' | 'Cover-2' | 'Cover-3' | 'Quarters' | 'Cover-2 Man';

export type OffensiveScheme =
  | 'Wide Zone'
  | 'West Coast'
  | 'Spread'
  | 'Air Raid'
  | 'Power Run'
  | 'RPO Spread'
  | 'Vertical'
  | 'Motion Heavy';

export type Position =
  | 'QB' | 'RB' | 'WR' | 'TE' | 'LT' | 'OL'
  | 'EDGE' | 'DT' | 'LB' | 'CB' | 'NCB' | 'S' | 'K';

export type PlayerRole = 'starter' | 'rotational' | 'depth';
export type InjuryStatus = 'healthy' | 'questionable' | 'out';

export interface Player {
  id: string;
  name: string;
  pos: Position;
  role: PlayerRole;
  /** Overall grade 1-100. */
  rating: number;
  /** Share of team snaps on their side of the ball, 0-1. */
  snapPct: number;
  /** Receivers/TEs/RBs: share of team targets, 0-1. */
  targetShare?: number;
  /** Receivers/TEs: targets per route run, 0-1. */
  tprr?: number;
  /** Edge/DT: pass-rush win rate, 0-1. */
  prwr?: number;
  /** OL: pass-block win rate, 0-1. */
  pbwr?: number;
  /** One-line angle used in the sleeper report. */
  note?: string;
  /** Injury status from the latest official report / roster (live data). */
  reported?: InjuryStatus;
  /** Short reason for `reported`, e.g. "Knee · Out" or "Reserve/Injured". */
  reportNote?: string;
  /** Headshot URL when the data source provides one. */
  headshotUrl?: string;
}

export interface CoachingProfile {
  headCoach?: string;
  offScheme: OffensiveScheme;
  defFront: DefensiveFront;
  baseCoverage: BaseCoverage;
  /** 3rd-down conversion rate on offense, 0-1. */
  thirdDownOff: number;
  /** 3rd-down stop rate on defense (1 - opponent conversion), 0-1. */
  thirdDownDef: number;
  /** How often they go for it on 4th & short in plus territory, 0-1. */
  fourthDownGoRate: number;
  /** Red-zone touchdown rate, 0-1. */
  redZoneTd: number;
  /** Red-zone play-calling aggressiveness, 1-10. */
  redZoneAggression: number;
  /** Quality of in-game / halftime scheme adjustments, 1-10. */
  halftimeAdjust: number;
  /** Play-action rate on dropbacks, 0-1. */
  playActionRate: number;
  /** Early-down pass rate, 0-1. */
  passRate: number;
  /** Offensive plays per game. */
  pace: number;
}

export interface OffenseProfile {
  passEfficiency: number;   // 1-10
  rushEfficiency: number;   // 1-10
  explosiveness: number;    // 1-10
  qb: number;               // 1-10
  /** Team pass-block win rate, 0-1. */
  pbwr: number;
  slotEfficiency: number;   // 1-10
  teSpeed: number;          // 1-10
  /** How well the offence attacks each front / coverage family (1-10). */
  vsFront: Record<DefensiveFront, number>;
  vsCoverage: Record<BaseCoverage, number>;
}

export interface DefenseProfile {
  passDefense: number;      // 1-10
  rushDefense: number;      // 1-10
  /** Team pass-rush win rate, 0-1. */
  prwr: number;
  nickelCorner: number;     // 1-10
  lbCoverage: number;       // 1-10
  secondaryAdjust: number;  // 1-10
  blitzRate: number;        // 0-1
  takeaways: number;        // 1-10
}

export interface Stadium {
  name: string;
  city: string;
  dome: boolean;
  /** Crowd-noise factor, 1-10. */
  noise: number;
  altitudeFt: number;
  /** Rough travel coordinate (degrees) for distance modelling. */
  lat: number;
  lng: number;
}

export interface Team {
  id: string;
  abbr: string;
  city: string;
  name: string;
  conference: Conference;
  division: Division;
  colors: { primary: string; secondary: string };
  stadium: Stadium;
  coaching: CoachingProfile;
  offense: OffenseProfile;
  defense: DefenseProfile;
  players: Player[];
  /** Team ids of protected rivals outside the division (e.g. historic rivals). */
  rivals?: string[];
  /** Team logo URL (live data). */
  logoUrl?: string;
  /** Current-season record, e.g. "3-1" (live data). */
  record?: string;
}

export type Weather = 'dome' | 'clear' | 'wind' | 'rain' | 'snow' | 'cold' | 'heat';

export interface MatchupInput {
  home: Team;
  away: Team;
  neutralSite?: boolean;
  weather?: Weather;
  primetime?: boolean;
  /** Player ids ruled out for this game (either team). */
  injuredOut?: string[];
  /** Player ids listed questionable (half degradation). */
  questionable?: string[];
}

export interface NodeWeights {
  scheme: number;     // default 25
  personnel: number;  // default 35
  environment: number; // default 15
  xfactor: number;    // default 25
}

export interface EngineOptions {
  weights?: Partial<NodeWeights>;
  /** Number of Monte-Carlo runs (default 10,000). */
  simulations?: number;
  /** Seed for the deterministic RNG. Same seed + same input => same output. */
  seed?: number;
  /** Base home-field edge in win-probability points, 2.5-4.5 (default 3.0). */
  homeFieldBase?: number;
}

/** A single weighted node's verdict. */
export interface NodeResult {
  key: keyof NodeWeights;
  label: string;
  weight: number;
  /** Positive favours the home team, negative the away team; roughly -10..10. */
  edge: number;
  /** Contribution to the projected margin in points. */
  points: number;
  factors: { label: string; value: string; favors: 'home' | 'away' | 'even' }[];
}

export interface AdvantageMatrix {
  passing: { home: number; away: number };
  rushing: { home: number; away: number };
  trench: { home: number; away: number };
  coaching: { home: number; away: number };
}

export interface InjuryImpact {
  player: Player;
  team: 'home' | 'away';
  status: InjuryStatus;
  /** Human-readable metric such as "-18% win efficiency". */
  metric: string;
  /** Points of margin swung against that player's team. */
  pointsLost: number;
}

export interface SleeperReport {
  player: Player;
  team: 'home' | 'away';
  headline: string;
  reason: string;
  /** Estimated swing to the spread if they hit, in points. */
  spreadImpact: number;
  /** Probability they meaningfully alter the script, 0-1. */
  hitRate: number;
}

export interface SimulationSummary {
  runs: number;
  homeWinPct: number;
  awayWinPct: number;
  tiePct: number;
  projectedHome: number;
  projectedAway: number;
  projectedTotal: number;
  /** Negative = home favoured, positive = away favoured. */
  spread: number;
  /** Std dev of the margin distribution. */
  volatility: number;
  oneScoreGamePct: number;
  homeCoverPct: number;
  overPct: number;
  /** Margin histogram (home - away) bucketed into 3-point bins. */
  marginBins: { from: number; to: number; pct: number }[];
  /** Median-ish "most likely" scores. */
  mostLikelyScores: { home: number; away: number; pct: number }[];
}

export interface GameScript {
  early: string;
  halftime: string;
  late: string;
  /** How often the home team leads at half. */
  homeLeadsAtHalfPct: number;
  /** How often the game is within one score in the 4th quarter. */
  clutchPct: number;
  keys: string[];
}

export interface MatchupAnalysis {
  home: Team;
  away: Team;
  input: MatchupInput;
  weights: NodeWeights;
  nodes: NodeResult[];
  matrix: AdvantageMatrix;
  injuries: InjuryImpact[];
  simulation: SimulationSummary;
  script: GameScript;
  sleepers: SleeperReport[];
  /** Expected pre-simulation margin, in points (home - away). */
  modelMargin: number;
  seed: number;
}
