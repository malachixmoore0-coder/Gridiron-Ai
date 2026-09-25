/**
 * ESPN, read once, for any league.
 *
 * Every league here — the NBA, the WNBA, both college basketball tournaments,
 * MLB, college baseball, MLS — is served by the same two APIs under a different
 * path. That is the whole reason a generic pipeline is possible: one reader,
 * nine leagues, and adding a tenth is a path string.
 *
 * Everything is best-effort. A league that is out of season returns an empty
 * scoreboard rather than an error, and a missing field is left null instead of
 * being invented.
 */
import { fetchJson, sourceLog } from '../lib/fetch';

export interface EspnTeamRow {
  id: string;
  abbr: string;
  name: string;
  short: string;
  group: string;
  colors: { primary: string; secondary: string };
  logoUrl: string | null;
  record: string | null;
  rank: number | null;
}

export interface EspnProbable {
  id: string;
  name: string;
  /**
   * Season ERA as the scoreboard prints it, when it prints one.
   *
   * Worth reading here rather than relying on the roster files alone: the
   * league statistics feed only carries the arms deep enough into the
   * leaderboard to be ranked — fewer than fifty across all thirty clubs — while
   * the game payload tends to carry a line for whoever is actually starting,
   * which is exactly the population that matters.
   */
  era: number | null;
}

export interface EspnEvent {
  id: string;
  date: string;
  status: 'scheduled' | 'in_progress' | 'final';
  detail: string | null;
  /**
   * Where the game has got to. ESPN gives the period and the seconds left in it;
   * both are absent before the start and unreliable enough afterwards that they
   * are only read while a game is actually running.
   */
  period: number | null;
  clockSeconds: number | null;
  /** Baseball: the home side is batting. Read off ESPN's own "Bot 7th". */
  bottomHalf: boolean | null;
  neutral: boolean;
  venue: string;
  /** City the venue is in, for a forecast lookup. Empty when ESPN omits it. */
  venueCity: string;
  /** ESPN's own roof flag. True means no weather can reach the game. */
  venueIndoor: boolean;
  awayId: string;
  homeId: string;
  awayScore: number | null;
  homeScore: number | null;
  awayRank: number | null;
  homeRank: number | null;
  broadcast: string | null;
  note: string | null;
  homeSpread: number | null;
  totalLine: number | null;
  /**
   * Tonight's listed starter, baseball only and only once ESPN posts one.
   * Null everywhere else, and null for a game whose probables are not up yet —
   * which is most of the board more than a day out.
   */
  homeProbable: EspnProbable | null;
  awayProbable: EspnProbable | null;
  homeMoneyline: number | null;
  awayMoneyline: number | null;
  drawMoneyline: number | null;
}

const SITE = 'https://site.api.espn.com/apis/site/v2/sports';
/** The standings tree lives on a different host prefix to the team list. */
const STANDINGS = 'https://site.api.espn.com/apis/v2/sports';

const hex = (v: unknown, fallback: string) => {
  const s = typeof v === 'string' ? v.replace('#', '').trim() : '';
  return /^[0-9a-f]{6}$/i.test(s) ? `#${s.toUpperCase()}` : fallback;
};

/**
 * Divisions, conferences or table position, plus the season record.
 *
 * The /teams list does not carry either — it is a directory, not a standings
 * table — so both come from the standings tree, which nests differently in
 * every sport (league → conference → division in MLB, a flat table in MLS).
 * Rather than special-case each shape, this walks the tree and takes the
 * nearest named ancestor of whatever node actually holds team entries.
 *
 * It is best-effort by design: a league whose standings are not published yet
 * keeps an empty group and a null record rather than failing the build.
 */
export async function loadStandings(path: string): Promise<Map<string, { group: string; record: string | null }>> {
  const out = new Map<string, { group: string; record: string | null }>();
  // level=3 asks for divisions rather than conferences, which is the more
  // useful grouping where a league has them ("AL East" beats "American
  // League"). Leagues without that depth ignore it; if the request fails
  // outright, fall back to the default tree.
  const json = await fetchJson<any>(`${STANDINGS}/${path}/standings?level=3`, `${path} standings`, 20000)
    .catch(() => fetchJson<any>(`${STANDINGS}/${path}/standings`, `${path} standings (flat)`, 20000).catch(() => null));
  if (!json) return out;

  const summaryOf = (entry: any): string | null => {
    const stats = entry?.stats ?? [];
    const hit = stats.find((x: any) => x?.name === 'overall' || x?.type === 'total' || x?.name === 'record');
    const s = hit?.displayValue ?? hit?.summary ?? null;
    return typeof s === 'string' && /^\d+-\d/.test(s) ? s : null;
  };

  const walk = (node: any, name: string, depth = 0) => {
    if (!node || depth > 6) return;
    const here = typeof node.name === 'string' && node.name ? node.name : name;
    for (const entry of node?.standings?.entries ?? []) {
      const id = entry?.team?.id != null ? String(entry.team.id) : null;
      if (id && !out.has(id)) out.set(id, { group: here, record: summaryOf(entry) });
    }
    for (const child of node?.children ?? []) walk(child, here, depth + 1);
  };

  walk(json, '');
  return out;
}

/** Every team in a league, with the colours and logo the app draws with. */
export async function loadTeams(path: string): Promise<EspnTeamRow[]> {
  const [json, standings] = await Promise.all([
    fetchJson<any>(`${SITE}/${path}/teams?limit=1000`, `${path} teams`, 20000).catch(() => null),
    loadStandings(path),
  ]);
  const rows = json?.sports?.[0]?.leagues?.[0]?.teams ?? [];
  const out: EspnTeamRow[] = [];
  for (const wrap of rows) {
    const t = wrap?.team;
    if (!t?.id || !t?.abbreviation) continue;
    const standing = standings.get(String(t.id));
    const summary = (t.record?.items ?? []).find((i: any) => i?.type === 'total')?.summary ?? standing?.record ?? null;
    out.push({
      id: String(t.id),
      abbr: String(t.abbreviation).toUpperCase(),
      name: String(t.displayName ?? t.name ?? t.abbreviation),
      short: String(t.shortDisplayName ?? t.name ?? t.abbreviation),
      group: String(t.groups?.parent?.name ?? t.groups?.name ?? standing?.group ?? ''),
      colors: { primary: hex(t.color, '#2A3646'), secondary: hex(t.alternateColor, '#8FA1B4') },
      logoUrl: t.logos?.[0]?.href ?? null,
      record: summary,
      rank: null,
    });
  }
  return out;
}

const statusOf = (state: string, completed: boolean): EspnEvent['status'] =>
  completed || state === 'post' ? 'final' : state === 'in' ? 'in_progress' : 'scheduled';

const num = (v: unknown): number | null => {
  const n = typeof v === 'string' ? Number(v) : typeof v === 'number' ? v : NaN;
  return Number.isFinite(n) ? n : null;
};

/**
 * One day (or date range) of a league's scoreboard. `dates` takes ESPN's own
 * format: YYYYMMDD, or YYYYMMDD-YYYYMMDD for a span.
 */
/**
 * The probable starter on one competitor.
 *
 * ESPN has moved this around: it has lived on the competitor as `probables`, on
 * the competition as a whole, and the athlete has appeared both nested under
 * `athlete` and flattened onto the entry itself. None of those shapes is
 * documented and any of them can turn up, so this reads whichever is present
 * and returns null rather than guessing when none is — an unknown pitcher is a
 * no-op downstream, which is the right failure.
 */
/** ERA off whichever statistics list the payload happens to carry. */
function eraOf(entry: any, athlete: any): number | null {
  for (const list of [entry?.statistics, athlete?.statistics]) {
    for (const st of Array.isArray(list) ? list : []) {
      const key = String(st?.abbreviation ?? st?.name ?? st?.shortDisplayName ?? '');
      if (!/^era$/i.test(key) && !/earnedRunAverage/i.test(key)) continue;
      const v = Number(st?.displayValue ?? st?.value);
      if (Number.isFinite(v) && v > 0 && v < 12) return v;
    }
  }
  return null;
}

export function probableOf(competitor: any, comp: any, side: 'home' | 'away'): EspnProbable | null {
  const lists = [
    competitor?.probables,
    comp?.probables?.filter?.((x: any) => String(x?.homeAway ?? '') === side),
  ];
  for (const list of lists) {
    for (const entry of Array.isArray(list) ? list : []) {
      // "probableStartingPitcher" is the only one worth reading; when ESPN
      // omits the name field entirely, any single entry is the starter.
      const kind = String(entry?.name ?? entry?.abbreviation ?? '');
      if (kind && !/starting\s*pitcher|^SP$/i.test(kind)) continue;
      const a = entry?.athlete ?? entry;
      const id = a?.id ?? entry?.playerId;
      const name = a?.displayName ?? a?.fullName ?? a?.shortName;
      if (id != null && name) return { id: String(id), name: String(name), era: eraOf(entry, a) };
    }
  }
  return null;
}

/**
 * Thrown when the scoreboard could not be read at all.
 *
 * Distinct from a scoreboard that loads and lists no games, which is what an
 * off day looks like. Both used to arrive here as an empty array, so a dead
 * feed and a quiet Tuesday were the same value and the build guessed — wrongly,
 * for nine days — that it was the Tuesday.
 */
export class ScoreboardUnavailable extends Error {}

export async function loadScoreboard(path: string, dates: string, limit = 400): Promise<EspnEvent[]> {
  const url = `${SITE}/${path}/scoreboard?limit=${limit}&dates=${dates}`;
  const json = await fetchJson<any>(url, `${path} scoreboard ${dates}`, 22000);
  if (json == null) {
    // fetchJson has just recorded why, against this exact url. Reading it back
    // is how the caller learns a 400 (this date syntax is not accepted) from a
    // timeout (it is, and the network had a bad moment) — the two need
    // completely different responses and both arrive here as null.
    const last = sourceLog[sourceLog.length - 1];
    const why = last && last.url === url ? (last.note ?? 'unknown') : 'unknown';
    throw new ScoreboardUnavailable(`${path} scoreboard ${dates}: ${why}`);
  }
  const out: EspnEvent[] = [];
  for (const ev of json?.events ?? []) {
    const comp = ev?.competitions?.[0];
    if (!comp) continue;
    const cs = comp.competitors ?? [];
    const home = cs.find((c: any) => c?.homeAway === 'home');
    const away = cs.find((c: any) => c?.homeAway === 'away');
    if (!home?.team?.id || !away?.team?.id) continue;
    const state = String(comp.status?.type?.state ?? 'pre');
    const done = !!comp.status?.type?.completed;
    const started = state !== 'pre';

    // ESPN prints a spread as "BOS -4.5"; the sign has to be read against the
    // home abbreviation or it silently flips on half the slate.
    const odds = comp.odds?.[0];
    let homeSpread = num(odds?.spread);
    if (homeSpread == null && typeof odds?.details === 'string') {
      const m = odds.details.match(/^([A-Z]{2,5})\s+(-?\d+(?:\.\d+)?)$/);
      if (m) homeSpread = m[1] === home.team.abbreviation ? Number(m[2]) : -Number(m[2]);
      else if (/EVEN|PK/i.test(odds.details)) homeSpread = 0;
    }

    // Soccer has no handicap on its main market, and ESPN fills the same field
    // with the home side's price instead: Chelsea at home to Hull came back as
    // spread -425. Read as a handicap that made the model 349 goals better than
    // the number, and put a side with a 0% chance of winning on the front page
    // as the lock of the day.
    //
    // So a handicap counts only when it is the size of one. Anything bigger is
    // a price, and is treated as the price it is.
    const HANDICAP_LIMIT = 30;
    let priceFromSpread: number | null = null;
    if (homeSpread != null && Math.abs(homeSpread) > HANDICAP_LIMIT) {
      priceFromSpread = homeSpread;
      homeSpread = null;
    }

    const homeMoneyline = priceOf(odds?.homeTeamOdds) ?? priceFromSpread;
    const awayMoneyline = priceOf(odds?.awayTeamOdds);
    const drawMoneyline = priceOf(odds?.drawOdds);

    out.push({
      id: String(ev.id),
      date: String(comp.date ?? ev.date ?? ''),
      status: statusOf(state, done),
      detail: comp.status?.type?.shortDetail ?? null,
      // Only while it is in progress. A finished game reports the last period it
      // reached, which read as live state would put a settled game back in play.
      period: state === 'in' ? num(comp.status?.period) : null,
      clockSeconds: state === 'in' ? num(comp.status?.clock) : null,
      bottomHalf: state === 'in' ? /\bbot(?:tom)?\b/i.test(String(comp.status?.type?.shortDetail ?? '')) : null,
      neutral: !!comp.neutralSite,
      venue: String(comp.venue?.fullName ?? ''),
      // Address and roof come straight from the scoreboard, which is what makes
      // a forecast possible for eighteen leagues without a curated table of
      // stadium coordinates to keep up to date.
      venueCity: [comp.venue?.address?.city, comp.venue?.address?.state ?? comp.venue?.address?.country]
        .filter(Boolean).map(String).join(', '),
      venueIndoor: !!comp.venue?.indoor,
      awayId: String(away.team.id),
      homeId: String(home.team.id),
      awayScore: started ? num(away.score) : null,
      homeScore: started ? num(home.score) : null,
      awayRank: num(away.curatedRank?.current) ?? null,
      homeRank: num(home.curatedRank?.current) ?? null,
      broadcast: comp.broadcasts?.[0]?.names?.[0] ?? null,
      note: ev.name && /bowl|final|championship|classic/i.test(String(ev.name)) ? String(ev.name) : null,
      homeSpread,
      totalLine: num(odds?.overUnder),
      homeProbable: probableOf(home, comp, 'home'),
      awayProbable: probableOf(away, comp, 'away'),
      homeMoneyline,
      awayMoneyline,
      drawMoneyline,
    });
  }
  return out;
}

/**
 * One side's price, in whichever shape ESPN felt like using.
 *
 * The legacy scoreboard says moneyLine: -140. The newer one nests it under
 * current.moneyLine.american as the string "-140", and some sports fill in only
 * a summary. All three mean the same thing, and reading only the first is why
 * soccer arrived with no prices on it at all.
 */
function priceOf(side: any): number | null {
  for (const c of [side?.moneyLine, side?.current?.moneyLine?.american, side?.moneyLine?.american, side?.odds, side?.summary]) {
    if (typeof c === 'number' && Number.isFinite(c)) return c;
    if (typeof c === 'string') {
      const m = /^([+-]?\d{2,5})$/.exec(c.trim().replace(/^EVEN$/i, '100'));
      if (m) return Number(m[1]);
    }
  }
  return null;
}

/** A span of days, fetched a chunk at a time so no single request is enormous. */
/**
 * Every game in a window, and whether the feed actually answered.
 *
 * `failed` counts chunks the scoreboard refused. A caller that finds no games
 * needs to know which kind of nothing it is looking at before deciding the
 * season is over.
 */
export interface Range { events: EspnEvent[]; failed: number; chunks: number }

/**
 * How a window of dates is asked for.
 *
 * ESPN accepted `dates=20260922-20261005` for years and began answering it with
 * HTTP 400 in mid-September, which is the whole reason nine days of games went
 * missing: every scoreboard read failed, every league looked empty, and the
 * build called it an off-season. The undocumented API had moved and nothing
 * here noticed.
 *
 * Rather than hard-code whichever syntax happens to work this month, the
 * granularity degrades on its own. A range is one request per fortnight; a
 * month is one per month; a day is one per day and always works. The first 400
 * drops to the next rung for the rest of the process, so the cost of being
 * wrong is one wasted request, not a silent outage — and when ESPN moves again
 * this survives it.
 */
type Granularity = 'range' | 'month' | 'day';
const NEXT: Record<Granularity, Granularity | null> = { range: 'month', month: 'day', day: null };

/** Degrades once per process, never recovers — ESPN will not change back mid-run. */
let granularity: Granularity = 'range';

const yyyymmdd = (d: Date) => `${d.getUTCFullYear()}${String(d.getUTCMonth() + 1).padStart(2, '0')}${String(d.getUTCDate()).padStart(2, '0')}`;
const yyyymm = (d: Date) => `${d.getUTCFullYear()}${String(d.getUTCMonth() + 1).padStart(2, '0')}`;

/** The windows to ask for, and the `dates=` value for each, at a given granularity. */
function chunksFor(from: Date, to: Date, g: Granularity, chunkDays: number): string[] {
  const out: string[] = [];
  const cursor = new Date(from);
  if (g === 'month') {
    cursor.setUTCDate(1);
    while (cursor <= to) {
      out.push(yyyymm(cursor));
      cursor.setUTCMonth(cursor.getUTCMonth() + 1);
    }
    return out;
  }
  const step = g === 'day' ? 1 : chunkDays;
  while (cursor <= to) {
    if (g === 'day') out.push(yyyymmdd(cursor));
    else {
      const end = new Date(cursor);
      end.setUTCDate(end.getUTCDate() + step - 1);
      out.push(`${yyyymmdd(cursor)}-${yyyymmdd(end > to ? to : end)}`);
    }
    cursor.setUTCDate(cursor.getUTCDate() + step);
  }
  return out;
}

export async function loadRange(path: string, from: Date, to: Date, chunkDays = 14): Promise<Range> {
  const out: EspnEvent[] = [];
  const seen = new Set<string>();
  let failed = 0;
  let chunks = 0;

  for (;;) {
    const dates = chunksFor(from, to, granularity, chunkDays);
    let rejected = false;
    failed = 0;
    chunks = dates.length;

    for (const d of dates) {
      try {
        for (const e of await loadScoreboard(path, d)) {
          if (!seen.has(e.id)) { seen.add(e.id); out.push(e); }
        }
      } catch (e) {
        const msg = (e as Error).message;
        // A 400 means the syntax is refused, not that the day was bad. Stop
        // burning requests on a format ESPN will reject every time.
        if (/HTTP 4[01]0/.test(msg) && NEXT[granularity]) { rejected = true; break; }
        failed += 1;
        console.warn(`    scoreboard ${d}: ${msg}`);
      }
    }

    if (!rejected) break;
    const next = NEXT[granularity]!;
    console.warn(`    ESPN refused ${granularity} date syntax — falling back to ${next}`);
    granularity = next;
    out.length = 0;
    seen.clear();
  }

  return { events: out.sort((a, b) => a.date.localeCompare(b.date)), failed, chunks };
}
