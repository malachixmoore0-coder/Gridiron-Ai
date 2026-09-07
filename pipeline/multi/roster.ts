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

export interface RosterStat {
  /** "PTS", "AVG", "G" — short enough for a chip. */
  label: string;
  value: string;
  /** Where this sits in the league, 0-100, when the sample supports one. */
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
    skater: [
      { keys: ['totalGoals', 'goals'], label: 'G' },
      { keys: ['goalAssists', 'assists'], label: 'A' },
      { keys: ['appearances'], label: 'Apps' },
    ],
    keeper: [
      { keys: ['saves'], label: 'Saves' },
      { keys: ['cleanSheet', 'shutouts'], label: 'CS' },
      { keys: ['appearances'], label: 'Apps' },
    ],
  },
  football: {
    skater: [
      { keys: ['passingYards'], label: 'Pass yds' },
      { keys: ['rushingYards'], label: 'Rush yds' },
      { keys: ['receivingYards'], label: 'Rec yds' },
    ],
  },
};

/** True where a sport's "keeper" stat set applies to this position. */
const isSpecialist = (sport: SportId, pos: string) => {
  const p = (pos || '').toUpperCase();
  if (sport === 'baseball') return ['SP', 'RP', 'P', 'CP'].includes(p);
  if (sport === 'soccer') return ['G', 'GK'].includes(p);
  return false;
};

/* ------------------------------------------------------------------------- */

const str = (v: unknown): string | null => (typeof v === 'string' && v.trim() ? v.trim() : null);
const numOf = (v: unknown): number | null => {
  const n = typeof v === 'number' ? v : typeof v === 'string' ? Number(v.replace(/[^0-9.\-]/g, '')) : NaN;
  return Number.isFinite(n) ? n : null;
};

/** Flatten ESPN's category → stats tree into one lookup by stat name. */
function flattenStats(node: any): Map<string, { display: string; value: number | null }> {
  const out = new Map<string, { display: string; value: number | null }>();
  const visit = (n: any, depth = 0) => {
    if (!n || depth > 5) return;
    for (const s of n.stats ?? []) {
      const name = str(s?.name) ?? str(s?.abbreviation);
      if (!name || out.has(name)) continue;
      out.set(name, { display: str(s?.displayValue) ?? String(s?.value ?? ''), value: numOf(s?.value) });
    }
    for (const c of n.categories ?? n.splits ?? n.children ?? []) visit(c, depth + 1);
    if (n.categories == null && Array.isArray(n)) for (const c of n) visit(c, depth + 1);
  };
  visit(node);
  if (Array.isArray(node)) for (const n of node) visit(n);
  return out;
}

/**
 * Every athlete's season line for a whole league, keyed by athlete id.
 *
 * ESPN pages this endpoint; two pages of 500 covers every league here with
 * room to spare. A league that does not publish it returns an empty map and
 * the rosters simply carry no stat lines, which is the honest outcome.
 */
export async function loadLeagueStats(path: string, season: number): Promise<Map<string, Map<string, { display: string; value: number | null }>>> {
  const out = new Map<string, Map<string, { display: string; value: number | null }>>();
  for (let page = 1; page <= 3; page += 1) {
    const url = `${WEB}/${path}/statistics/byathlete?region=us&lang=en&contentorigin=espn&limit=500&page=${page}&season=${season}&seasontype=2`;
    const json = await fetchJson<any>(url, `${path} athlete stats p${page}`, 25000).catch(() => null);
    if (process.env.ROSTER_DEBUG && page === 1) {
      const row = json?.athletes?.[0];
      const { athlete: _drop, ...rest } = row ?? {};
      console.log('    [debug] top-level categories:', JSON.stringify((json?.categories ?? []).map((c: any) => ({ name: c?.name, names: c?.names, abbr: c?.abbreviations }))).slice(0, 1200));
      console.log('    [debug] row without athlete:', JSON.stringify(rest).slice(0, 1600));
    }
    const rows = json?.athletes ?? [];
    if (!rows.length) break;
    for (const row of rows) {
      const id = row?.athlete?.id != null ? String(row.athlete.id) : null;
      if (!id || out.has(id)) continue;
      out.set(id, flattenStats(row));
    }
    if (rows.length < 500) break;
  }
  return out;
}

/** One team's roster, joined to the league stat lines already in hand. */
export async function loadRoster(
  path: string,
  sport: SportId,
  teamId: string,
  stats: Map<string, Map<string, { display: string; value: number | null }>>,
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
      const hit = spec.keys.map((k) => line.get(k)).find((v) => v && v.display && v.display !== '0' && v.display !== '-');
      if (hit) picked.push({ label: spec.label, value: hit.display, percentile: null });
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
 * Turn raw stat lines into a 1-99 grade, within a league.
 *
 * The grade is a percentile of the sport's headline number among everyone on
 * a roster who actually has one, so it means "compared to the rest of the
 * league" and nothing more. Players with no published statistics keep a null
 * rating rather than being handed the median, because a benchwarmer and a
 * rookie who has not debuted are not the same thing as an average player.
 */
export function gradeLeague(players: SportPlayer[], sport: SportId): void {
  const primary = (p: SportPlayer): number | null => {
    const s = p.stats[0];
    if (!s) return null;
    const n = numOf(s.value);
    if (n == null) return null;
    // Lower is better for ERA and WHIP; flip those so one comparison works.
    return /ERA|WHIP/i.test(s.label) ? -n : n;
  };

  const byUnit = new Map<string, SportPlayer[]>();
  for (const p of players) {
    if (primary(p) == null) continue;
    const key = isSpecialist(sport, p.pos) ? `${p.unit}:s` : p.unit;
    (byUnit.get(key) ?? byUnit.set(key, []).get(key)!).push(p);
  }

  for (const group of byUnit.values()) {
    const sorted = [...group].sort((a, b) => (primary(a) ?? 0) - (primary(b) ?? 0));
    const n = sorted.length;
    sorted.forEach((p, i) => {
      // A group of one tells us nothing; leave it ungraded rather than 99.
      if (n < 4) return;
      const pct = i / (n - 1);
      p.rating = Math.round(45 + pct * 50);
      p.stats = p.stats.map((s, j) => (j === 0 ? { ...s, percentile: Math.round(pct * 100) } : s));
      p.ratingBasis = 'production';
    });
  }
}
