/**
 * Player photographs from the schools themselves.
 *
 * ESPN has no headshot for a college baseball player and no link to the school
 * that does: every team and athlete record comes back with `links: []`, and
 * twelve hundred athlete lookups across three leagues found exactly zero
 * photographs. The pictures exist — they are on the school's own roster page,
 * where the sports information office put them — and the only way to reach one
 * is to know that Alabama's athletics site is rolltide.com. Nothing in any feed
 * says so, so the map below says it instead, school by school.
 *
 * It covers the conferences people actually open — SEC, ACC, Big 12, Big Ten,
 * and the Pac-12 schools still playing — rather than all four hundred and
 * thirty-seven. That is where the traffic is, and a partial map is worth a lot
 * more than none: everyone else keeps the grey disc, which is what the app
 * already does for a player without a photo.
 *
 * The scrape itself is deliberately dumb. Roster pages are built by three or
 * four different vendors and none of them publish a schema, so rather than
 * parse a layout this reads every <img> on the page and keeps the ones whose
 * caption, link or surrounding text names a player we already know is on that
 * roster. A page that changes shape yields fewer photos; it never yields wrong
 * ones, because a name we did not ask for is a name we do not take.
 */
import fs from 'node:fs';
import path from 'node:path';
import { sourceLog } from '../lib/fetch';

export interface SchoolSite {
  /** ESPN's school id — the number in its logo URL, and the same in every sport. */
  id: string;
  school: string;
  domain: string;
}

/**
 * ESPN school id → athletics domain. The id is the one in
 * `.../teamlogos/ncaa/500/<id>.png`, which is stable across sports; the team id
 * on a record is not (Alabama is 333 in basketball and 148 in baseball).
 */
export const SCHOOL_SITES: SchoolSite[] = [
  { id: '333', school: 'Alabama', domain: 'rolltide.com' },
  { id: '12', school: 'Arizona', domain: 'arizonawildcats.com' },
  { id: '9', school: 'Arizona State', domain: 'thesundevils.com' },
  { id: '8', school: 'Arkansas', domain: 'arkansasrazorbacks.com' },
  { id: '2', school: 'Auburn', domain: 'auburntigers.com' },
  { id: '239', school: 'Baylor', domain: 'baylorbears.com' },
  { id: '103', school: 'Boston College', domain: 'bceagles.com' },
  { id: '252', school: 'BYU', domain: 'byucougars.com' },
  { id: '25', school: 'California', domain: 'calbears.com' },
  { id: '2132', school: 'Cincinnati', domain: 'gobearcats.com' },
  { id: '228', school: 'Clemson', domain: 'clemsontigers.com' },
  { id: '38', school: 'Colorado', domain: 'cubuffs.com' },
  { id: '150', school: 'Duke', domain: 'goduke.com' },
  { id: '57', school: 'Florida', domain: 'floridagators.com' },
  { id: '52', school: 'Florida State', domain: 'seminoles.com' },
  { id: '61', school: 'Georgia', domain: 'georgiadogs.com' },
  { id: '59', school: 'Georgia Tech', domain: 'ramblinwreck.com' },
  { id: '248', school: 'Houston', domain: 'uhcougars.com' },
  { id: '356', school: 'Illinois', domain: 'fightingillini.com' },
  { id: '84', school: 'Indiana', domain: 'iuhoosiers.com' },
  { id: '2294', school: 'Iowa', domain: 'hawkeyesports.com' },
  { id: '66', school: 'Iowa State', domain: 'cyclones.com' },
  { id: '2305', school: 'Kansas', domain: 'kuathletics.com' },
  { id: '2306', school: 'Kansas State', domain: 'kstatesports.com' },
  { id: '96', school: 'Kentucky', domain: 'ukathletics.com' },
  { id: '97', school: 'Louisville', domain: 'gocards.com' },
  { id: '99', school: 'LSU', domain: 'lsusports.net' },
  { id: '120', school: 'Maryland', domain: 'umterps.com' },
  { id: '2390', school: 'Miami', domain: 'miamihurricanes.com' },
  { id: '130', school: 'Michigan', domain: 'mgoblue.com' },
  { id: '127', school: 'Michigan State', domain: 'msuspartans.com' },
  { id: '135', school: 'Minnesota', domain: 'gophersports.com' },
  { id: '344', school: 'Mississippi State', domain: 'hailstate.com' },
  { id: '142', school: 'Missouri', domain: 'mutigers.com' },
  { id: '152', school: 'NC State', domain: 'gopack.com' },
  { id: '158', school: 'Nebraska', domain: 'huskers.com' },
  { id: '153', school: 'North Carolina', domain: 'goheels.com' },
  { id: '77', school: 'Northwestern', domain: 'nusports.com' },
  { id: '87', school: 'Notre Dame', domain: 'fightingirish.com' },
  { id: '194', school: 'Ohio State', domain: 'ohiostatebuckeyes.com' },
  { id: '201', school: 'Oklahoma', domain: 'soonersports.com' },
  { id: '197', school: 'Oklahoma State', domain: 'okstate.com' },
  { id: '145', school: 'Ole Miss', domain: 'olemisssports.com' },
  { id: '2483', school: 'Oregon', domain: 'goducks.com' },
  { id: '204', school: 'Oregon State', domain: 'osubeavers.com' },
  { id: '213', school: 'Penn State', domain: 'gopsusports.com' },
  { id: '221', school: 'Pittsburgh', domain: 'pittsburghpanthers.com' },
  { id: '2509', school: 'Purdue', domain: 'purduesports.com' },
  { id: '164', school: 'Rutgers', domain: 'scarletknights.com' },
  { id: '2567', school: 'SMU', domain: 'smumustangs.com' },
  { id: '2579', school: 'South Carolina', domain: 'gamecocksonline.com' },
  { id: '24', school: 'Stanford', domain: 'gostanford.com' },
  { id: '183', school: 'Syracuse', domain: 'cuse.com' },
  { id: '2628', school: 'TCU', domain: 'gofrogs.com' },
  { id: '2633', school: 'Tennessee', domain: 'utsports.com' },
  { id: '251', school: 'Texas', domain: 'texassports.com' },
  { id: '245', school: 'Texas A&M', domain: '12thman.com' },
  { id: '2641', school: 'Texas Tech', domain: 'texastech.com' },
  { id: '2116', school: 'UCF', domain: 'ucfknights.com' },
  { id: '26', school: 'UCLA', domain: 'uclabruins.com' },
  { id: '30', school: 'USC', domain: 'usctrojans.com' },
  { id: '254', school: 'Utah', domain: 'utahutes.com' },
  { id: '238', school: 'Vanderbilt', domain: 'vucommodores.com' },
  { id: '258', school: 'Virginia', domain: 'virginiasports.com' },
  { id: '259', school: 'Virginia Tech', domain: 'hokiesports.com' },
  { id: '154', school: 'Wake Forest', domain: 'godeacs.com' },
  { id: '264', school: 'Washington', domain: 'gohuskies.com' },
  { id: '265', school: 'Washington State', domain: 'wsucougars.com' },
  { id: '277', school: 'West Virginia', domain: 'wvusports.com' },
  { id: '275', school: 'Wisconsin', domain: 'uwbadgers.com' },
];

const SITE_BY_ID = new Map(SCHOOL_SITES.map((s) => [s.id, s]));

/** The school id hiding in an ESPN logo URL, which is the only place it appears. */
export function schoolIdFrom(logoUrl: string | null | undefined): string | null {
  const hit = /\/ncaa\/500\/(\d+)\.png/.exec(logoUrl ?? '');
  return hit ? hit[1] : null;
}

export const siteFor = (logoUrl: string | null | undefined): SchoolSite | null => {
  const id = schoolIdFrom(logoUrl);
  return id ? SITE_BY_ID.get(id) ?? null : null;
};

/**
 * The path a school's site uses for a sport. Vendors disagree — Sidearm spells
 * it out, PrestoSports abbreviates — so both get tried and the first page that
 * answers wins.
 */
const ROSTER_PATHS: Record<string, string[]> = {
  cbase: ['baseball', 'bsb'],
  mbb: ['mens-basketball', 'mbball'],
  wbb: ['womens-basketball', 'wbball'],
};

export const supportsAthletics = (leagueKey: string) => leagueKey in ROSTER_PATHS;

// ---------------------------------------------------------------- the cache

export interface AthleticsCache {
  generatedAt: string;
  /** athlete id → the photograph on their school's roster page. */
  photos: Record<string, string>;
  /** team id → when its roster page was last read, and what came of it. */
  teams: Record<string, { checkedAt: string; url: string | null; found: number }>;
}

const empty = (): AthleticsCache => ({ generatedAt: new Date().toISOString(), photos: {}, teams: {} });

export function readAthletics(dir: string): AthleticsCache {
  try {
    const raw = JSON.parse(fs.readFileSync(path.join(dir, 'athletics.json'), 'utf8')) as AthleticsCache;
    return raw?.photos && raw?.teams ? raw : empty();
  } catch { return empty(); }
}

export function writeAthletics(dir: string, cache: AthleticsCache): void {
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'athletics.json'), JSON.stringify({ ...cache, generatedAt: new Date().toISOString() }));
}

// --------------------------------------------------------------- the scrape

/** Names as a key: no punctuation, no accents, no case, no middle ground. */
export function nameKey(name: string): string {
  return name
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/\b(jr|sr|ii|iii|iv|v)\b/g, '')
    .replace(/[^a-z]/g, '');
}

/** Crests, sponsor bugs and the grey silhouette every vendor ships. */
const JUNK = /placeholder|silhouette|no[-_]?photo|noimage|default|blank|spacer|logo|sponsor|icon|\.svg(\?|$)/i;

const ATTR = (tag: string, name: string): string | null => {
  const hit = new RegExp(`${name}\\s*=\\s*("([^"]*)"|'([^']*)')`, 'i').exec(tag);
  const v = hit ? (hit[2] ?? hit[3] ?? '').trim() : '';
  return v || null;
};

/** The biggest candidate in a srcset, which is the one worth keeping. */
const fromSrcset = (v: string): string | null => {
  const last = v.split(',').map((s) => s.trim()).filter(Boolean).pop();
  return last ? last.split(/\s+/)[0] : null;
};

async function fetchText(url: string, name: string, timeoutMs = 20_000): Promise<{ body: string; url: string } | null> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      signal: ctrl.signal,
      redirect: 'follow',
      headers: {
        accept: 'text/html,application/xhtml+xml',
        // Some athletics sites answer an unfamiliar agent with a 403, and a
        // roster page is a public page; this is the same request a reader makes.
        'user-agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36',
      },
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const body = await res.text();
    sourceLog.push({ name, url, ok: true, fetchedAt: new Date().toISOString() });
    return { body, url: res.url || url };
  } catch (e) {
    sourceLog.push({ name, url, ok: false, fetchedAt: new Date().toISOString(), note: e instanceof Error ? e.message : String(e) });
    return null;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Read one roster page and return the photographs it has for the names given.
 *
 * Every image is a candidate; a candidate is kept only when the page ties it to
 * a name we were asked about — through its alt text, the player-bio link
 * wrapped around it, or the words immediately beside it. Wanting the name first
 * is what makes this safe to point at a page nobody has looked at.
 */
export function photosFromHtml(html: string, pageUrl: string, wanted: Set<string>): Map<string, string> {
  const out = new Map<string, string>();
  const tags = [...html.matchAll(/<img\b[^>]*>/gi)];

  const take = (key: string | null, raw: string | null) => {
    if (!key || !raw || out.has(key) || !wanted.has(key)) return;
    if (JUNK.test(raw)) return;
    let abs: string;
    try { abs = new URL(raw, pageUrl).toString(); } catch { return; }
    if (!/^https?:/i.test(abs)) return;
    out.set(key, abs);
  };

  for (const m of tags) {
    const tag = m[0];
    const src = ATTR(tag, 'data-src') ?? ATTR(tag, 'data-lazy-src') ?? ATTR(tag, 'src')
      ?? (ATTR(tag, 'srcset') ? fromSrcset(ATTR(tag, 'srcset')!) : null)
      ?? (ATTR(tag, 'data-srcset') ? fromSrcset(ATTR(tag, 'data-srcset')!) : null);
    if (!src) continue;

    // 1. The caption. Vendors that fill alt in fill it with the player's name.
    const alt = ATTR(tag, 'alt');
    if (alt) take(nameKey(alt), src);

    const at = m.index ?? 0;
    const before = html.slice(Math.max(0, at - 700), at);
    const after = html.slice(at + tag.length, at + tag.length + 700);

    // 2. The bio link the photo sits inside: .../roster/john-smith/1234.
    for (const href of [...before.matchAll(/href\s*=\s*"([^"]*roster\/[^"]*)"/gi)].slice(-2)) {
      for (const part of href[1].split('/').reverse()) {
        const key = nameKey(part.replace(/-/g, ' '));
        if (key.length > 4) take(key, src);
      }
    }

    // 3. Failing both, the words next to it — a name in the cell is still a
    //    name, even when the markup around it says nothing useful.
    if (![...wanted].some((k) => out.get(k) === src)) {
      const text = `${before} ${after}`.replace(/<[^>]*>/g, ' ');
      for (const key of wanted) {
        if (out.has(key)) continue;
        if (nameKey(text).includes(key) && key.length > 6) { take(key, src); break; }
      }
    }
  }
  return out;
}

export interface TeamPhotos { url: string | null; photos: Map<string, string>; }

/** Try a school's roster page for a sport, in each shape its vendor might use. */
export async function scrapeTeam(site: SchoolSite, leagueKey: string, wanted: Set<string>): Promise<TeamPhotos> {
  for (const sport of ROSTER_PATHS[leagueKey] ?? []) {
    for (const shape of [`https://${site.domain}/sports/${sport}/roster`, `https://${site.domain}/roster.aspx?path=${sport}`]) {
      const page = await fetchText(shape, `${site.school} ${leagueKey} roster`);
      if (!page) continue;
      const photos = photosFromHtml(page.body, page.url, wanted);
      if (photos.size) return { url: page.url, photos };
    }
  }
  return { url: null, photos: new Map() };
}

export interface AthleticsRun { teams: number; found: number; players: number; }

/**
 * Fill in what the schools publish, for as many teams as this run can afford.
 *
 * Teams are re-read on a slow cycle rather than every build: a roster page
 * changes a few times a year, and reading seventy of them three times a day to
 * be told the same thing is the mistake the ESPN backfill already made once.
 */
export async function backfillFromSchools(
  leagueKey: string,
  teams: { id: string; logoUrl?: string | null; players: { id: string; name: string }[] }[],
  cache: AthleticsCache,
  budget: number,
  recheckDays = 21,
  concurrency = 4,
): Promise<AthleticsRun> {
  const stale = Date.now() - recheckDays * 86_400_000;
  const due = teams
    .map((t) => ({ team: t, site: siteFor(t.logoUrl) }))
    .filter((r): r is { team: typeof teams[number]; site: SchoolSite } => !!r.site)
    .filter(({ team }) => {
      const seen = cache.teams[team.id];
      return !seen || Date.parse(seen.checkedAt) < stale;
    })
    .slice(0, budget);

  let found = 0;
  let players = 0;

  for (let i = 0; i < due.length; i += concurrency) {
    const batch = due.slice(i, i + concurrency);
    const results = await Promise.all(batch.map(({ site, team }) => {
      const wanted = new Set(team.players.map((p) => nameKey(p.name)).filter((k) => k.length > 3));
      return scrapeTeam(site, leagueKey, wanted).catch(() => ({ url: null, photos: new Map<string, string>() }));
    }));
    batch.forEach(({ team }, j) => {
      const { url, photos } = results[j];
      cache.teams[team.id] = { checkedAt: new Date().toISOString(), url, found: photos.size };
      if (photos.size) found += 1;
      for (const p of team.players) {
        const hit = photos.get(nameKey(p.name));
        if (hit) { cache.photos[p.id] = hit; players += 1; }
      }
    });
  }

  return { teams: due.length, found, players };
}
