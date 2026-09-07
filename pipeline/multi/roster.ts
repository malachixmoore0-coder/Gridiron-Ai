/**
 * Rosters for the generic leagues.
 *
 * Two requests per team and one or two per league, which is the whole budget:
 *
 *   /teams/<id>/roster        every athlete, with the headshot ESPN hosts
 *   statistics/byathlete      the entire league's season stat lines, paged
 *
 * The second one is the reason this is affordable at all. Asking ESPN for one
 * athlete's statistics at a time would be roughly eight hundred requests per
 * league; byathlete returns every qualified player in a league in one or two
 * pages, and the roster call supplies everyone it leaves out.
 *
 * Nothing here invents a number. A player with no published statistics gets a
 * roster entry with no stat line and a rating derived only from where the
 * league's own depth puts them — and the app says which of the two it is
 * rather than printing an authoritative-looking grade over nothing.
 */
import { fetchJson } from '../lib/fetch';
import type { SportId } from '../../src/sports/types';

const SITE = 'https://site.api.espn.com/apis/site/v2/sports';
const WEB = 'https://site.web.api.espn.com/apis/common/v3/sports';
const CORE = 'https://sports.core.api.espn.com/v2/sports';
/** 500 a page; twelve pages is more players than any league here has. */
const MAX_STAT_PAGES = 12;

export interface RosterStat {
  /** "PTS", "AVG", "G" — short enough for a chip. */
  label: string;
  value: string;
  /** The league's own rank at this stat, 1 = best. Null where unranked. */
  rank?: number | null;
  /** How many players that rank is out of. */
  rankOf?: number | null;
  /** Where this sits in the league, 0-100, derived from the rank. */
  percentile?: number | null;
}

export interface SportPlayer {
  id: string;
  name: string;
  short: string;
  jersey: string | null;
  /** "PG", "SP", "GK". */
  pos: string;
  /** Broad grouping the app lists by: "Guards", "Pitchers", "Midfield". */
  unit: string;
  headshotUrl: string | null;
  height: string | null;
  weight: string | null;
  age: number | null;
  /** Years in the league, where ESPN publishes it. */
  experience: number | null;
  college: string | null;
  birthplace: string | null;
  /**
   * The player's national flag. Soccer rosters are mostly missing headshots on
   * ESPN — three photographs in a squad of twenty-eight — and a wall of blank
   * discs is a worse page than one showing where each player is from.
   */
  flagUrl: string | null;
  status: string | null;
  injury: string | null;
  /** The line under the name: "18.4 PPG · 6.1 REB". */
  line: string | null;
  stats: RosterStat[];
  /** 1-99, or null when there is nothing to grade. */
  rating: number | null;
  /** Where the rating came from, so the app never overstates it. */
  ratingBasis: 'production' | 'roster';
}

export interface SportRosterFile {
  teamId: string;
  league: string;
  generatedAt: string;
  season: number;
  /**
   * Where the season lines came from, so the app can tell "this player has not
   * played" apart from "this league publishes no per-player statistics at all".
   * ESPN serves no such feed for soccer, and a page that blamed the player for
   * that would be wrong about him.
   */
  statsSource: 'league' | 'leaders' | 'athlete' | 'none';
  players: SportPlayer[];
}

/* ---------------------------------------------------------------------------
   Position grouping. Every sport lists a roster in the order people expect to
   read it, which is never alphabetical and never ESPN's order.
--------------------------------------------------------------------------- */

const UNITS: Record<SportId, { unit: string; pos: string[] }[]> = {
  basketball: [
    { unit: 'Guards', pos: ['PG', 'SG', 'G'] },
    { unit: 'Wings', pos: ['SF', 'GF', 'F'] },
    { unit: 'Bigs', pos: ['PF', 'C', 'FC', 'CF'] },
  ],
  baseball: [
    { unit: 'Starting pitchers', pos: ['SP', 'P'] },
    { unit: 'Relievers', pos: ['RP', 'CP'] },
    { unit: 'Catchers', pos: ['C'] },
    { unit: 'Infield', pos: ['1B', '2B', '3B', 'SS', 'IF', 'DH'] },
    { unit: 'Outfield', pos: ['LF', 'CF', 'RF', 'OF'] },
  ],
  soccer: [
    { unit: 'Goalkeepers', pos: ['G', 'GK'] },
    { unit: 'Defenders', pos: ['D', 'DF', 'CB', 'LB', 'RB'] },
    { unit: 'Midfield', pos: ['M', 'MF', 'CM', 'AM', 'DM'] },
    { unit: 'Forwards', pos: ['F', 'FW', 'ST', 'W'] },
  ],
  hockey: [
    { unit: 'Forwards', pos: ['C', 'LW', 'RW', 'F', 'W'] },
    { unit: 'Defense', pos: ['D', 'LD', 'RD'] },
    { unit: 'Goaltenders', pos: ['G'] },
  ],
  football: [
    { unit: 'Offense', pos: ['QB', 'RB', 'FB', 'WR', 'TE', 'OT', 'OG', 'C', 'OL'] },
    { unit: 'Defense', pos: ['DE', 'DT', 'NT', 'LB', 'ILB', 'OLB', 'CB', 'S', 'FS', 'SS', 'DB'] },
    { unit: 'Special teams', pos: ['K', 'P', 'LS'] },
  ],
};

/** The order units appear in, so a roster reads top to bottom the usual way. */
export const unitOrder = (sport: SportId): string[] => UNITS[sport].map((u) => u.unit);

function unitOf(sport: SportId, pos: string): string {
  const p = (pos || '').toUpperCase();
  for (const u of UNITS[sport]) if (u.pos.includes(p)) return u.unit;
  return UNITS[sport][UNITS[sport].length - 1].unit;
}

/* ---------------------------------------------------------------------------
   Which statistics matter, per sport. Two or three, chosen because they are
   what someone actually asks about a player — not because ESPN returns them.
--------------------------------------------------------------------------- */

interface StatSpec { keys: string[]; label: string; suffix?: string }

const HEADLINE: Record<SportId, { skater: StatSpec[]; keeper?: StatSpec[] }> = {
  basketball: {
    skater: [
      { keys: ['avgPoints', 'points'], label: 'PPG' },
      { keys: ['avgRebounds', 'rebounds'], label: 'RPG' },
      { keys: ['avgAssists', 'assists'], label: 'APG' },
    ],
  },
  baseball: {
    skater: [
      { keys: ['avg', 'battingAverage'], label: 'AVG' },
      { keys: ['homeRuns'], label: 'HR' },
      { keys: ['RBIs', 'rbi'], label: 'RBI' },
    ],
    keeper: [
      { keys: ['ERA', 'earnedRunAverage'], label: 'ERA' },
      { keys: ['strikeouts'], label: 'K' },
      { keys: ['WHIP'], label: 'WHIP' },
    ],
  },
  soccer: {
    // The core API's own names, with the leaders feed's spellings kept as
    // aliases so either source can fill the same three slots.
    skater: [
      { keys: ['totalGoals', 'goals', 'scoring'], label: 'G' },
      { keys: ['goalAssists', 'assists'], label: 'A' },
      { keys: ['appearances', 'gamesPlayed', 'gamesStarted'], label: 'Apps' },
    ],
    keeper: [
      { keys: ['saves', 'goalkeeperSaves'], label: 'Saves' },
      { keys: ['cleanSheet', 'shutouts'], label: 'CS' },
      { keys: ['appearances', 'gamesPlayed', 'gamesStarted'], label: 'Apps' },
    ],
  },
  football: {
    skater: [
      { keys: ['passingYards'], label: 'Pass yds' },
      { keys: ['rushingYards'], label: 'Rush yds' },
      { keys: ['receivingYards'], label: 'Rec yds' },
    ],
  },
  hockey: {
    skater: [
      { keys: ['points'], label: 'PTS' },
      { keys: ['goals'], label: 'G' },
      { keys: ['assists'], label: 'A' },
    ],
    keeper: [
      { keys: ['savePct', 'savePercentage'], label: 'SV%' },
      { keys: ['goalsAgainstAverage', 'avgGoalsAgainst'], label: 'GAA' },
      { keys: ['wins'], label: 'W' },
    ],
  },
};

/** True where a sport's "keeper" stat set applies to this position. */
const isSpecialist = (sport: SportId, pos: string) => {
  const p = (pos || '').toUpperCase();
  if (sport === 'baseball') return ['SP', 'RP', 'P', 'CP'].includes(p);
  if (sport === 'soccer' || sport === 'hockey') return ['G', 'GK'].includes(p);
  return false;
};

/* ------------------------------------------------------------------------- */

const str = (v: unknown): string | null => (typeof v === 'string' && v.trim() ? v.trim() : null);
const numOf = (v: unknown): number | null => {
  const n = typeof v === 'number' ? v : typeof v === 'string' ? Number(v.replace(/[^0-9.\-]/g, '')) : NaN;
  return Number.isFinite(n) ? n : null;
};

/** One athlete's numbers, keyed by ESPN's own stat name. */
export interface StatCell { display: string; value: number | null; rank: number | null }
type StatLine = Map<string, StatCell>;

/**
 * ESPN returns this endpoint columnar: the top-level categories carry the stat
 * *names*, and each athlete's matching category carries `totals`, `values` and
 * `ranks` as arrays in the same order. Joining them by index is the whole
 * parse — and `ranks` is a gift, because it is the league's own ordering
 * rather than one derived here.
 */
function rowStats(row: any, columns: Map<string, string[]>): StatLine {
  const out: StatLine = new Map();
  for (const cat of row?.categories ?? []) {
    const names = columns.get(String(cat?.name ?? ''));
    if (!names) continue;
    const totals: unknown[] = cat?.totals ?? [];
    const values: unknown[] = cat?.values ?? [];
    const ranks: unknown[] = cat?.ranks ?? [];
    names.forEach((name, i) => {
      const display = typeof totals[i] === 'string' ? (totals[i] as string) : null;
      // "-" is ESPN for "this category does not apply to this player".
      if (!display || display === '-' || out.has(name)) return;
      out.set(name, {
        display,
        value: numOf(values[i]),
        rank: numOf(ranks[i]),
      });
    });
  }
  return out;
}

/**
 * Every athlete's season line for a whole league, keyed by athlete id.
 *
 * ESPN pages this endpoint; two pages of 500 covers every league here with
 * room to spare. A league that does not publish it returns an empty map and
 * the rosters simply carry no stat lines, which is the honest outcome.
 */
export async function loadLeagueStats(
  path: string,
  sport: SportId,
  season: number,
): Promise<{ stats: Map<string, StatLine>; source: 'league' | 'leaders' | 'athlete' | 'none' }> {
  const out = new Map<string, StatLine>();
  const columns = new Map<string, string[]>();
  const LIMIT = 500;

  // Baseball has to be asked twice. Left to itself the endpoint answers with
  // the batting leaderboard and nothing else — 141 rows, no pitchers — however
  // the qualified flag is set, because the category is what decides which
  // leaderboard it is.
  const groups: (string | undefined)[] = sport === 'baseball' ? ['batting', 'pitching'] : [undefined];
  let fetched = 0;

  for (const category of groups) {
    // ESPN pages this as a leaderboard, so stopping at the first short page
    // would keep only the top of it. Page until its own pagination says there
    // is nothing left.
    let pages = 1;
    for (let page = 1; page <= Math.min(pages, MAX_STAT_PAGES); page += 1) {
      // qualified=false asks for everyone with a line rather than only those
      // who clear the league's own threshold.
      const url = `${WEB}/${path}/statistics/byathlete?region=us&lang=en&contentorigin=espn&qualified=false`
        + `&limit=${LIMIT}&page=${page}&season=${season}&seasontype=2${category ? `&category=${category}` : ''}`;
      const json = await fetchJson<any>(url, `${path} ${category ?? 'athlete'} stats p${page}`, 25000).catch(() => null);

      if (process.env.ROSTER_DEBUG && page === 1) {
        console.log(`    [debug] ${category ?? 'all'} pagination:`, JSON.stringify(json?.pagination ?? null).slice(0, 260));
        console.log(`    [debug] ${category ?? 'all'} categories:`, JSON.stringify((json?.categories ?? []).map((c: any) => c?.name)));
      }

      // The column names come with the first page and hold for the rest.
      for (const cat of json?.categories ?? []) {
        const name = String(cat?.name ?? '');
        if (name && Array.isArray(cat?.names) && !columns.has(name)) columns.set(name, cat.names.map(String));
      }

      // ESPN does not always report a page count, so derive one from the total
      // where it does, and otherwise keep going for as long as pages arrive
      // full — a short page is the only reliable end-of-list signal.
      const count = numOf(json?.pagination?.count);
      const reported = numOf(json?.pagination?.pages) ?? (count != null ? Math.ceil(count / LIMIT) : null);
      if (reported != null && reported > pages) pages = reported;

      const rows = json?.athletes ?? [];
      if (!rows.length) break;
      if (reported == null && rows.length >= LIMIT) pages = page + 1;
      fetched += 1;

      for (const row of rows) {
        const id = row?.athlete?.id != null ? String(row.athlete.id) : null;
        if (!id) continue;
        // A player can appear under more than one category — a two-way player,
        // or a pitcher who bats — so lines merge rather than replace.
        const line = out.get(id) ?? new Map<string, StatCell>();
        for (const [k, v] of rowStats(row, columns)) if (!line.has(k)) line.set(k, v);
        out.set(id, line);
      }
    }
  }

  if (process.env.ROSTER_DEBUG) console.log(`    [debug] collected ${out.size} athlete stat lines over ${fetched} page(s)`);
  if (out.size === 0) {
    const leaders = await loadLeaders(path);
    return { stats: leaders, source: leaders.size ? 'leaders' as const : 'none' as const };
  }
  return { stats: out, source: 'league' as const };
}

/**
 * Per-athlete season statistics, for the sports the league-wide endpoint does
 * not cover.
 *
 * ESPN publishes no byathlete feed for soccer — not for the Premier League,
 * not for any of the eight leagues here — but it does publish each player's
 * season splits on the core API, one request at a time. Five thousand requests
 * is a lot to ask of anyone, so this runs with a small amount of concurrency
 * and only for the athletes actually on a published roster.
 *
 * The season and season-type that work vary by competition (a calendar-year
 * league and an August-to-May one do not agree on what 2026 means), so the
 * combination is discovered once from a single athlete and then reused.
 */
export async function loadAthleteStats(
  path: string,
  athleteIds: string[],
  season: number,
  concurrency = 8,
): Promise<Map<string, StatLine>> {
  const out = new Map<string, StatLine>();
  if (!athleteIds.length) return out;
  const league = path.split('/')[1];
  const base = (id: string, y: number, t: number) =>
    `${CORE}/${path.split('/')[0]}/leagues/${league}/seasons/${y}/types/${t}/athletes/${id}/statistics`;

  // Find a (season, type) that actually answers, using the first few athletes
  // in case the very first one has not played.
  let combo: { y: number; t: number } | null = null;
  const combos = [
    { y: season, t: 1 }, { y: season, t: 2 },
    { y: season + 1, t: 1 }, { y: season - 1, t: 1 },
  ];
  outer: for (const probe of athleteIds.slice(0, 4)) {
    for (const c of combos) {
      const json = await fetchJson<any>(base(probe, c.y, c.t), `${path} stat probe`, 12000).catch(() => null);
      if (json?.splits?.categories?.length) { combo = c; break outer; }
    }
  }
  if (!combo) {
    if (process.env.ROSTER_DEBUG) console.log(`    [debug] ${path}: no season/type combination returned splits`);
    return out;
  }
  if (process.env.ROSTER_DEBUG) console.log(`    [debug] ${path}: using season ${combo.y} type ${combo.t}`);

  for (let i = 0; i < athleteIds.length; i += concurrency) {
    const batch = athleteIds.slice(i, i + concurrency);
    const rows = await Promise.all(batch.map((id) =>
      fetchJson<any>(base(id, combo!.y, combo!.t), `${path} athlete ${id}`, 12000).catch(() => null)));
    batch.forEach((id, j) => {
      const cats = rows[j]?.splits?.categories ?? [];
      if (!cats.length) return;
      const line: StatLine = new Map();
      for (const cat of cats) {
        for (const st of cat?.stats ?? []) {
          const name = str(st?.name) ?? str(st?.abbreviation);
          if (!name || line.has(name)) continue;
          const display = str(st?.displayValue) ?? (st?.value != null ? String(st.value) : null);
          if (!display || display === '-') continue;
          line.set(name, { display, value: numOf(st?.value), rank: numOf(st?.rank) });
        }
      }
      if (line.size) out.set(id, line);
    });
  }
  return out;
}

/**
 * A fallback for leagues the statistics endpoint does not serve.
 *
 * ESPN has no byathlete feed for soccer, so MLS would publish rosters with no
 * numbers on them at all. The leaders endpoint does exist, and while it only
 * covers the top of each category, a striker's goal count is most of what
 * anyone wanted from that page. Everyone else keeps an empty line, which is
 * the truth: their numbers are not published anywhere this app can reach.
 */
async function loadLeaders(path: string): Promise<Map<string, StatLine>> {
  const out = new Map<string, StatLine>();
  const json = await fetchJson<any>(`${SITE}/${path}/leaders`, `${path} leaders`, 20000).catch(() => null);
  // The site API wraps leaders differently per sport; take whichever nest
  // actually holds a list of categories.
  const categories =
    json?.leaders?.categories
    ?? json?.categories
    ?? json?.sports?.[0]?.leagues?.[0]?.leaders?.categories
    ?? json?.sports?.[0]?.leagues?.[0]?.leaders
    ?? json?.leaders
    ?? [];
  if (process.env.ROSTER_DEBUG) {
    console.log('    [debug] leaders keys:', json ? Object.keys(json).join(',') : 'null',
      '· categories:', Array.isArray(categories) ? categories.length : 'not a list',
      '· first:', String(JSON.stringify(Array.isArray(categories) ? categories[0] : null)).slice(0, 500));
  }
  for (const cat of Array.isArray(categories) ? categories : []) {
    const name = String(cat?.name ?? cat?.abbreviation ?? '');
    if (!name) continue;
    (cat?.leaders ?? []).forEach((entry: any, i: number) => {
      const id = entry?.athlete?.id != null ? String(entry.athlete.id) : null;
      if (!id) return;
      const line = out.get(id) ?? new Map<string, StatCell>();
      if (!line.has(name)) {
        line.set(name, {
          display: str(entry?.displayValue) ?? String(entry?.value ?? ''),
          value: numOf(entry?.value),
          // A leaders list is already in rank order.
          rank: i + 1,
        });
      }
      out.set(id, line);
    });
  }
  if (process.env.ROSTER_DEBUG) console.log(`    [debug] leaders fallback: ${out.size} athletes`);
  return out;
}

/**
 * The worst rank seen at each stat, which is the closest thing this endpoint
 * gives to "how many players are ranked here" — and the denominator a
 * percentile needs.
 */
export function rankDepth(stats: Map<string, StatLine>): Map<string, number> {
  const depth = new Map<string, number>();
  for (const line of stats.values()) {
    for (const [name, cell] of line) {
      if (cell.rank == null) continue;
      if (cell.rank > (depth.get(name) ?? 0)) depth.set(name, cell.rank);
    }
  }
  return depth;
}

/** One team's roster, joined to the league stat lines already in hand. */
export async function loadRoster(
  path: string,
  sport: SportId,
  teamId: string,
  stats: Map<string, StatLine>,
  depth: Map<string, number>,
): Promise<SportPlayer[]> {
  const json = await fetchJson<any>(`${SITE}/${path}/teams/${teamId}/roster`, `${path} roster ${teamId}`, 20000).catch(() => null);
  if (!json) return [];

  // Football groups athletes by unit; every other sport returns them flat.
  const raw: any[] = [];
  for (const entry of json.athletes ?? []) {
    if (Array.isArray(entry?.items)) raw.push(...entry.items);
    else raw.push(entry);
  }

  const out: SportPlayer[] = [];
  for (const a of raw) {
    const id = a?.id != null ? String(a.id) : null;
    const name = str(a?.fullName) ?? str(a?.displayName);
    if (!id || !name) continue;

    const pos = (str(a?.position?.abbreviation) ?? str(a?.position?.name) ?? '').toUpperCase();
    const line = stats.get(id);
    const specs = (isSpecialist(sport, pos) && HEADLINE[sport].keeper) || HEADLINE[sport].skater;

    const picked: RosterStat[] = [];
    for (const spec of specs) {
      if (!line) break;
      let hit: StatCell | undefined;
      let hitKey = '';
      for (const k of spec.keys) {
        const v = line.get(k);
        if (v && v.display && v.display !== '-') { hit = v; hitKey = k; break; }
      }
      if (!hit) continue;
      const of = depth.get(hitKey) ?? null;
      picked.push({
        label: spec.label,
        value: hit.display,
        rank: hit.rank,
        rankOf: of,
        // ESPN ranks 1 = best, so the percentile is the share of the field
        // this player is ahead of.
        percentile: hit.rank != null && of && of > 1 ? Math.round((1 - (hit.rank - 1) / (of - 1)) * 100) : null,
      });
    }

    const injury = (a?.injuries ?? [])[0];

    out.push({
      id,
      name,
      short: str(a?.shortName) ?? name,
      jersey: str(a?.jersey),
      pos: pos || '—',
      unit: unitOf(sport, pos),
      headshotUrl: str(a?.headshot?.href),
      height: str(a?.displayHeight),
      weight: str(a?.displayWeight),
      age: numOf(a?.age),
      experience: numOf(a?.experience?.years),
      college: str(a?.college?.name) ?? str(a?.college?.shortName),
      flagUrl: str(a?.flag?.href) ?? str(a?.citizenshipCountry?.flag?.href),
      birthplace: [str(a?.birthPlace?.city), str(a?.birthPlace?.state) ?? str(a?.birthPlace?.country)].filter(Boolean).join(', ') || null,
      status: str(a?.status?.name) ?? str(a?.status?.type),
      injury: injury ? [str(injury?.status), str(injury?.details?.type)].filter(Boolean).join(' · ') || null : null,
      line: picked.length ? picked.map((s) => `${s.value} ${s.label}`).join(' · ') : null,
      stats: picked,
      rating: null,
      ratingBasis: picked.length ? 'production' : 'roster',
    });
  }
  return out;
}

/**
 * Attach headline numbers to players whose statistics arrived separately.
 *
 * The roster pass picks a player's three headline stats while it reads them,
 * which does not work when the numbers come from a second source afterwards —
 * so this does the same selection over an already-built roster.
 */
export function applyStats(
  players: SportPlayer[],
  sport: SportId,
  stats: Map<string, StatLine>,
  depth: Map<string, number>,
): void {
  for (const p of players) {
    const line = stats.get(p.id);
    if (!line) continue;
    const specs = (isSpecialist(sport, p.pos) && HEADLINE[sport].keeper) || HEADLINE[sport].skater;
    const picked: RosterStat[] = [];
    for (const spec of specs) {
      let hit: StatCell | undefined;
      let hitKey = '';
      for (const k of spec.keys) {
        const v = line.get(k);
        if (v && v.display && v.display !== '-') { hit = v; hitKey = k; break; }
      }
      if (!hit) continue;
      const of = depth.get(hitKey) ?? null;
      picked.push({
        label: spec.label,
        value: hit.display,
        rank: hit.rank,
        rankOf: of,
        percentile: hit.rank != null && of && of > 1 ? Math.round((1 - (hit.rank - 1) / (of - 1)) * 100) : null,
      });
    }
    if (!picked.length) continue;
    p.stats = picked;
    p.line = picked.map((x) => `${x.value} ${x.label}`).join(' · ');
    p.ratingBasis = 'production';
  }
}

/**
 * Turn raw stat lines into a 1-99 grade, within a league.
 *
 * The grade is a percentile of the sport's headline number among everyone on
 * a roster who actually has one, so it means "compared to the rest of the
 * league" and nothing more. Players with no published statistics keep a null
 * rating rather than being handed the median, because a benchwarmer and a
 * rookie who has not debuted are not the same thing as an average player.
 */
export function gradeLeague(players: SportPlayer[], sport: SportId): void {
  // Where ESPN published a rank, that is the league's own ordering across every
  // player it qualifies — far better than anything re-derived from a subset,
  // so it is used directly and only the fallback path sorts anything.
  const ranked = players.filter((p) => p.stats[0]?.percentile != null);
  for (const p of ranked) {
    p.rating = Math.round(40 + (p.stats[0].percentile as number) * 0.59);
    p.ratingBasis = 'production';
  }

  const rest = players.filter((p) => p.stats.length && p.stats[0].percentile == null);
  if (!rest.length) return;

  const primary = (p: SportPlayer): number | null => {
    const s = p.stats[0];
    if (!s) return null;
    const n = numOf(s.value);
    if (n == null) return null;
    // Lower is better for ERA and WHIP; flip those so one comparison works.
    return /ERA|WHIP/i.test(s.label) ? -n : n;
  };

  const byUnit = new Map<string, SportPlayer[]>();
  for (const p of rest) {
    if (primary(p) == null) continue;
    const key = isSpecialist(sport, p.pos) ? `${p.unit}:s` : p.unit;
    (byUnit.get(key) ?? byUnit.set(key, []).get(key)!).push(p);
  }

  for (const group of byUnit.values()) {
    const sorted = [...group].sort((a, b) => (primary(a) ?? 0) - (primary(b) ?? 0));
    const n = sorted.length;
    // A group of three tells us nothing; leave those ungraded rather than 99.
    if (n < 4) continue;
    sorted.forEach((p, i) => {
      const pct = i / (n - 1);
      p.rating = Math.round(40 + pct * 59);
      p.stats = p.stats.map((s, j) => (j === 0 ? { ...s, percentile: Math.round(pct * 100) } : s));
      p.ratingBasis = 'production';
    });
  }
}
