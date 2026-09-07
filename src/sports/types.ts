/**
 * Nine leagues, four sports, one engine.
 *
 * Cloning the football stack per league would have meant nine copies of a
 * five-thousand-line engine, which is nine places for the same bug. Instead a
 * *sport profile* carries everything that differs — how scoring is distributed,
 * how big a home edge is, whether a draw is a real outcome — and one engine
 * reads it. Adding a tenth league is a row in a table.
 *
 * The football leagues keep their own bespoke engines: they have depth charts,
 * snap counts and play-by-play that the generic path has no equivalent for, and
 * flattening them would cost more than it saved. Everything above the data is
 * shared either way.
 */

export type SportId = 'football' | 'basketball' | 'baseball' | 'soccer' | 'hockey' | 'golf';

export type LeagueKey =
  | 'nfl' | 'cfb'          // bespoke football engines
  | 'nba' | 'wnba' | 'mbb' | 'wbb'
  | 'mlb' | 'cbase'
  | 'nhl'
  | 'mls' | 'epl' | 'laliga' | 'seriea' | 'bundesliga' | 'ligue1' | 'ucl' | 'ligamx'
  | 'pga';

/** How a sport's scores actually behave. */
export interface SportProfile {
  sport: SportId;
  /** What a score is called, in the singular. */
  unit: 'point' | 'run' | 'goal' | 'stroke';
  /**
   * Continuous sports (football, basketball) are modelled as a normal margin
   * around the projection; low-count sports (baseball, soccer) are modelled as
   * independent Poisson counts, which is where draws come from honestly rather
   * than as a special case bolted on.
   */
  model: 'normal' | 'poisson';
  /** A draw is a real settled outcome — soccer only. */
  draws: boolean;
  /** Standard deviation of the final margin around the projection. */
  marginSigma: number;
  /** Standard deviation of the total. Unused by Poisson sports. */
  totalSigma: number;
  /** Home advantage, in scoring units. */
  homeEdge: number;
  /** One Elo point is worth this much margin. */
  eloScale: number;
  /** League-average combined score — the prior every projection starts from. */
  baseTotal: number;
  /** The increment a book prints spreads in. */
  spreadStep: number;
  /** Which market a bettor reaches for first in this sport. */
  primaryMarket: 'spread' | 'moneyline';
  /** Segment names for a live clock, longest form first. */
  periods: string[];
  /** How a slate is grouped: football is weekly, everything else is daily. */
  cadence: 'week' | 'day';
}

/**
 * The numbers below are the historical spread of results in each sport, not
 * fitted parameters. They are deliberately conservative and are the first thing
 * to revisit once each league has a season of graded predictions behind it.
 */
export const SPORTS: Record<SportId, Omit<SportProfile, 'sport'>> = {
  football: {
    unit: 'point', model: 'normal', draws: false,
    marginSigma: 13.5, totalSigma: 10.5, homeEdge: 2.0, eloScale: 0.04,
    baseTotal: 44, spreadStep: 0.5, primaryMarket: 'spread',
    periods: ['1st', '2nd', '3rd', '4th', 'OT'], cadence: 'week',
  },
  basketball: {
    unit: 'point', model: 'normal', draws: false,
    marginSigma: 11.5, totalSigma: 16.0, homeEdge: 2.4, eloScale: 0.028,
    baseTotal: 224, spreadStep: 0.5, primaryMarket: 'spread',
    periods: ['1st', '2nd', '3rd', '4th', 'OT'], cadence: 'day',
  },
  baseball: {
    unit: 'run', model: 'poisson', draws: false,
    marginSigma: 4.4, totalSigma: 3.0, homeEdge: 0.22, eloScale: 0.0032,
    baseTotal: 8.6, spreadStep: 1.5, primaryMarket: 'moneyline',
    periods: ['1st', '2nd', '3rd', '4th', '5th', '6th', '7th', '8th', '9th', 'Extra'], cadence: 'day',
  },
  soccer: {
    unit: 'goal', model: 'poisson', draws: true,
    marginSigma: 1.7, totalSigma: 1.4, homeEdge: 0.28, eloScale: 0.0022,
    baseTotal: 2.9, spreadStep: 0.5, primaryMarket: 'moneyline',
    periods: ['1st half', '2nd half', 'Extra'], cadence: 'day',
  },
  hockey: {
    // Goals are rare events like soccer's, so the same Poisson applies — but a
    // hockey game cannot end level. Overtime and the shootout settle it, which
    // the engine handles the same way it handles extra innings.
    unit: 'goal', model: 'poisson', draws: false,
    marginSigma: 2.1, totalSigma: 1.8, homeEdge: 0.20, eloScale: 0.0030,
    baseTotal: 6.1, spreadStep: 0.5, primaryMarket: 'moneyline',
    periods: ['1st', '2nd', '3rd', 'OT', 'SO'], cadence: 'day',
  },
  golf: {
    // Golf is not two sides and a margin, so the head-to-head engine never
    // runs for it — src/sports/golf.ts simulates the whole field instead.
    // These are that model's parameters: a round is drawn around a player's
    // scoring average, and marginSigma is how much one round varies.
    unit: 'stroke', model: 'normal', draws: false,
    marginSigma: 2.9, totalSigma: 2.9, homeEdge: 0, eloScale: 0,
    baseTotal: 71, spreadStep: 1, primaryMarket: 'moneyline',
    periods: ['R1', 'R2', 'R3', 'R4'], cadence: 'day',
  },
};

export interface LeagueMeta {
  key: LeagueKey;
  sport: SportId;
  /** What the switcher shows. */
  short: string;
  /** Full name for headers and copy. */
  name: string;
  /** Grouping label in the sport picker. */
  group: string;
  /** ESPN's path, e.g. "basketball/nba". Absent for the bespoke football feeds. */
  espn?: string;
  /** Where the published dataset lives, relative to the multi-sport data root. */
  slug: string;
  /** Bespoke leagues run their own engine and screens. */
  bespoke?: boolean;
  /**
   * A field sport — one event, a hundred and fifty entrants, no opponent.
   * Nothing about a slate, a spread or a head-to-head simulation applies, so
   * these leagues get their own screens rather than an empty version of the
   * ones built for two teams.
   */
  kind?: 'field';
  /** Roughly when the season runs, for the offseason notice. */
  months: [number, number];
  /** A sport-specific accent used sparingly — chips, empty states, the picker. */
  accent: string;
  /**
   * Where a league does not behave like its sport's average.
   *
   * A WNBA game and an NBA game are the same sport with the same shape, but a
   * model that expects 224 points in a league that scores 164 is wrong on every
   * total it prints. These overrides are the league-level facts — how much is
   * scored, how big home court is, how far apart the sides are — layered on top
   * of the sport's shape, which is what stays shared.
   */
  tune?: Partial<Omit<SportProfile, 'sport'>>;
}

/** Every league the app knows about, in the order the picker shows them. */
export const LEAGUES: LeagueMeta[] = [
  { key: 'nfl',   sport: 'football',   short: 'NFL',   name: 'NFL',                     group: 'Football',   slug: 'nfl',   bespoke: true, months: [9, 2],  accent: '#12D992' },
  { key: 'cfb',   sport: 'football',   short: 'NCAAF', name: 'College football',        group: 'Football',   slug: 'cfb',   bespoke: true, months: [8, 1],  accent: '#FFB020' },
  { key: 'nba',   sport: 'basketball', short: 'NBA',   name: 'NBA',                     group: 'Basketball', slug: 'nba',   espn: 'basketball/nba',                      months: [10, 6], accent: '#F26B36' },
  { key: 'wnba',  sport: 'basketball', short: 'WNBA',  name: 'WNBA',                    group: 'Basketball', slug: 'wnba',  espn: 'basketball/wnba',                     months: [5, 10], accent: '#FF6FA5',
    tune: { baseTotal: 164, marginSigma: 10.5, totalSigma: 13.0, eloScale: 0.024 } },
  { key: 'mbb',   sport: 'basketball', short: 'NCAAM', name: "Men's college basketball", group: 'Basketball', slug: 'mbb',  espn: 'basketball/mens-college-basketball',  months: [11, 4], accent: '#4DA3FF',
    // A 350-team field is far wider than any pro league, and college home court
    // is the largest in American sport.
    tune: { baseTotal: 145, marginSigma: 10.5, totalSigma: 12.5, homeEdge: 3.2, eloScale: 0.026 } },
  { key: 'wbb',   sport: 'basketball', short: 'NCAAW', name: "Women's college basketball", group: 'Basketball', slug: 'wbb', espn: 'basketball/womens-college-basketball', months: [11, 4], accent: '#B073FF',
    tune: { baseTotal: 135, marginSigma: 11.5, totalSigma: 12.0, homeEdge: 3.2, eloScale: 0.028 } },
  { key: 'mlb',   sport: 'baseball',   short: 'MLB',   name: 'MLB',                     group: 'Baseball',   slug: 'mlb',   espn: 'baseball/mlb',                        months: [3, 11], accent: '#E8B341' },
  { key: 'cbase', sport: 'baseball',   short: 'NCAAB', name: 'College baseball',        group: 'Baseball',   slug: 'cbase', espn: 'baseball/college-baseball',           months: [2, 6],  accent: '#8FD14F',
    // Aluminium bats and a much wider field: college games score half again what
    // an MLB game does, and blowouts are ordinary rather than notable.
    tune: { baseTotal: 12.4, marginSigma: 5.6, totalSigma: 4.2, homeEdge: 0.32, eloScale: 0.0038, spreadStep: 0.5 } },
  { key: 'nhl',   sport: 'hockey',     short: 'NHL',   name: 'NHL',                     group: 'Hockey',     slug: 'nhl',   espn: 'hockey/nhl',                          months: [10, 6], accent: '#67C7F2' },

  /* ---- Soccer -----------------------------------------------------------
     Eight leagues rather than one. Every one of them publishes teams,
     fixtures and results, which is everything the model needs; none of them
     publishes per-player statistics through ESPN, which is why their roster
     pages say so rather than pretending. Goal environments differ enough to
     be worth tuning — a Bundesliga match is half a goal livelier than a
     LaLiga one, and a model that ignores that is wrong on every total. */
  { key: 'epl',        sport: 'soccer', short: 'EPL',    name: 'Premier League',   group: 'Soccer', slug: 'epl',        espn: 'soccer/eng.1',           months: [8, 5],  accent: '#8B5CF6',
    tune: { baseTotal: 2.85, homeEdge: 0.24 } },
  { key: 'laliga',     sport: 'soccer', short: 'LALIGA', name: 'LaLiga',           group: 'Soccer', slug: 'laliga',     espn: 'soccer/esp.1',           months: [8, 5],  accent: '#FF6B4A',
    tune: { baseTotal: 2.55, homeEdge: 0.28 } },
  { key: 'seriea',     sport: 'soccer', short: 'SERIEA', name: 'Serie A',          group: 'Soccer', slug: 'seriea',     espn: 'soccer/ita.1',           months: [8, 5],  accent: '#4D8BFF',
    tune: { baseTotal: 2.70, homeEdge: 0.26 } },
  { key: 'bundesliga', sport: 'soccer', short: 'BUND',   name: 'Bundesliga',       group: 'Soccer', slug: 'bundesliga', espn: 'soccer/ger.1',           months: [8, 5],  accent: '#E23D3D',
    tune: { baseTotal: 3.15, homeEdge: 0.26 } },
  { key: 'ligue1',     sport: 'soccer', short: 'LIGUE1', name: 'Ligue 1',          group: 'Soccer', slug: 'ligue1',     espn: 'soccer/fra.1',           months: [8, 5],  accent: '#F2C14E',
    tune: { baseTotal: 2.75, homeEdge: 0.27 } },
  { key: 'ucl',        sport: 'soccer', short: 'UCL',    name: 'Champions League', group: 'Soccer', slug: 'ucl',        espn: 'soccer/uefa.champions',  months: [9, 5],  accent: '#5B7FFF',
    // A group stage pairing a champion with a qualifier is far more lopsided
    // than any domestic league, so the rating gap counts for more.
    tune: { baseTotal: 3.05, homeEdge: 0.22, eloScale: 0.0028 } },
  { key: 'ligamx',     sport: 'soccer', short: 'LIGAMX', name: 'Liga MX',          group: 'Soccer', slug: 'ligamx',     espn: 'soccer/mex.1',           months: [1, 12], accent: '#2FA36B',
    // Altitude and travel make Liga MX the strongest home field in the group.
    tune: { baseTotal: 2.65, homeEdge: 0.38 } },
  { key: 'mls',        sport: 'soccer', short: 'MLS',    name: 'MLS',              group: 'Soccer', slug: 'mls',        espn: 'soccer/usa.1',           months: [2, 12], accent: '#35D0C8',
    tune: { baseTotal: 2.90, homeEdge: 0.32 } },

  { key: 'pga',   sport: 'golf',       short: 'PGA',   name: 'PGA Tour',                group: 'Golf',       slug: 'pga',   espn: 'golf/pga',   kind: 'field',   months: [1, 11], accent: '#7FD177' },
];

export const LEAGUE_BY_KEY: Record<LeagueKey, LeagueMeta> =
  Object.fromEntries(LEAGUES.map((l) => [l.key, l])) as Record<LeagueKey, LeagueMeta>;

export const profileFor = (key: LeagueKey): SportProfile => {
  const meta = LEAGUE_BY_KEY[key];
  return { sport: meta.sport, ...SPORTS[meta.sport], ...(meta.tune ?? {}) };
};

/** Leagues that share the generic head-to-head engine, screens and pipeline. */
export const GENERIC_LEAGUES = LEAGUES.filter((l) => !l.bespoke && !l.kind);

/** Leagues that are an event and a field rather than two sides. */
export const FIELD_LEAGUES = LEAGUES.filter((l) => l.kind === 'field');

/** True when the league is between seasons right now. */
export function inSeason(meta: LeagueMeta, at = new Date()): boolean {
  const m = at.getMonth() + 1;
  const [from, to] = meta.months;
  return from <= to ? m >= from && m <= to : m >= from || m <= to;
}
