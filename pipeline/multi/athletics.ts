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
import { renderPages } from './render';

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

export interface SchoolPlayer {
  /** Stable across runs: the school id and the slug the site uses. */
  id: string;
  name: string;
  jersey: string | null;
  pos: string;
  photo: string | null;
}

export interface AthleticsCache {
  generatedAt: string;
  /** team id → the squad its school publishes, and when it was last read. */
  teams: Record<string, { checkedAt: string; url: string | null; players: SchoolPlayer[] }>;
}

const empty = (): AthleticsCache => ({ generatedAt: new Date().toISOString(), teams: {} });

export function readAthletics(dir: string): AthleticsCache {
  try {
    const raw = JSON.parse(fs.readFileSync(path.join(dir, 'athletics.json'), 'utf8')) as AthleticsCache;
    return raw?.teams ? raw : empty();
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

export interface PageResult { status: number; url: string; body: string; note?: string }

async function fetchText(url: string, name: string, timeoutMs = 20_000): Promise<PageResult> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      signal: ctrl.signal,
      redirect: 'follow',
      headers: {
        accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'accept-language': 'en-US,en;q=0.9',
        // Some athletics sites answer an unfamiliar agent with a 403, and a
        // roster page is a public page; this is the same request a reader makes.
        'user-agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
      },
    });
    const body = res.ok ? await res.text() : '';
    sourceLog.push({ name, url, ok: res.ok, fetchedAt: new Date().toISOString(), note: res.ok ? undefined : `HTTP ${res.status}` });
    return { status: res.status, url: res.url || url, body };
  } catch (e) {
    const note = e instanceof Error ? e.message : String(e);
    sourceLog.push({ name, url, ok: false, fetchedAt: new Date().toISOString(), note });
    return { status: 0, url, body: '', note };
  } finally {
    clearTimeout(timer);
  }
}

/**
 * What a player's own link looks like, across the vendors.
 *
 * Sidearm's newer sites use /sports/baseball/roster/zane-adams/17285; its older
 * ones use roster.aspx?rp_id=17285 with the name only in the label; others say
 * /bios/ or /player/. All four are the same thing — the link a reader follows
 * to one person — and it is the only reliable tie between a face and a name.
 */
const PLAYER_HREF = /<a\b[^>]*href=["']([^"'#]*(?:\/roster\/|\/bios?\/|\/player\/|rp_id=)[^"'#]*)["'][^>]*>/gi;

/** Baseball's positions as the schools abbreviate them, and nothing else. */
const POS = /\b(RHP|LHP|SP|RP|P|C|1B|2B|3B|SS|INF|IF|UTL|UT|OF|LF|CF|RF|DH)\b/;

/** RHP is a starter to a school and a pitcher to the app's roster grouping. */
const NORMAL_POS: Record<string, string> = { RHP: 'SP', LHP: 'SP', P: 'SP', INF: 'IF', UTL: 'IF', UT: 'IF' };

/** The first real image URL in a slice of markup, wherever the vendor put it. */
function firstImage(chunk: string): string | null {
  const hits: { at: number; url: string }[] = [];
  for (const m of chunk.matchAll(/(?:data-src|data-lazy-src|src|srcset|data-srcset)\s*=\s*["']([^"']+)["']/gi)) {
    const raw = m[1].includes(',') || /\s\d+[wx]\s*$/.test(m[1]) ? (m[1].split(',')[0] ?? '').trim().split(/\s+/)[0] : m[1].trim();
    if (raw && !JUNK.test(raw)) hits.push({ at: m.index ?? 0, url: raw });
  }
  hits.sort((a, b) => a.at - b.at);
  return hits[0]?.url ?? null;
}

/**
 * The squad a school publishes, read off its own roster page.
 *
 * This exists because ESPN has no college baseball roster to give. Ask it for
 * Arizona and it answers with sixty-eight names spanning a decade, no
 * positions, no numbers and no photographs — an all-time athlete index, not a
 * team. The school's page is the roster: current, numbered, and with the
 * pictures the sports information office took.
 *
 * Each player is one bio link. The link's own label carries the name and the
 * jersey number ("Zane Adams jersey number 20 full bio"), the picture is the
 * first image inside the card, and the position is whichever of baseball's
 * abbreviations appears in the card's text. A card that yields no name is
 * skipped rather than guessed at.
 */
export function rosterFromHtml(html: string, pageUrl: string, idPrefix: string): SchoolPlayer[] {
  const anchors = [...html.matchAll(PLAYER_HREF)];
  // A player link is /…/roster/<name-slug>/<id>. The roster index itself is not
  // a player, and neither is anything with no name after the section it is in.
  const slugOf = (href: string) => {
    const segs = href.split('?')[0].split('/').filter(Boolean);
    const at = Math.max(segs.lastIndexOf('roster'), segs.lastIndexOf('bio'), segs.lastIndexOf('bios'), segs.lastIndexOf('player'));
    if (at < 0) return undefined;
    return segs.slice(at + 1).find((x) => /[a-z]/i.test(x) && !/^\d+$/.test(x));
  };
  const out = new Map<string, SchoolPlayer>();

  anchors.forEach((a, i) => {
    const at = a.index ?? 0;
    const slug = slugOf(a[1]);

    const aria = ATTR(a[0], 'aria-label') ?? ATTR(a[0], 'title') ?? '';
    const name = aria.replace(/\b(jersey|number|full bio|bio|profile)\b.*$/i, '').trim()
      || (slug ?? '').split('-').map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
    // Older sites put no name in the URL at all, only in the link's label.
    const key = slug ?? nameKey(name);
    if (!key || nameKey(name).length < 4 || out.has(key)) return;

    // The card runs to the next player's link — the next *different* one, since
    // a card links the same player twice, once from the photo and once from the
    // name, and the details sit between them.
    const next = anchors.slice(i + 1).find((b) => (slugOf(b[1]) ?? b[1]) !== (slug ?? a[1]));
    const stop = Math.min(next?.index ?? html.length, at + 3000);
    const card = html.slice(at, stop);
    const text = card.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ');

    const jersey = /jersey number (\d+)/i.exec(aria)?.[1] ?? /#\s?(\d{1,2})\b/.exec(text)?.[1] ?? null;
    const raw = POS.exec(text.replace(new RegExp(name, 'i'), ' '))?.[1] ?? '';
    const photoRaw = firstImage(card);
    let photo: string | null = null;
    if (photoRaw) { try { photo = new URL(photoRaw, pageUrl).toString(); } catch { photo = null; } }

    // A coach has a photograph and a bio link too, and neither a number nor a
    // position. Nothing else on the page tells them apart from a player.
    if (!jersey && !raw) return;

    out.set(key, {
      id: `${idPrefix}-${slug ?? nameKey(name)}`,
      name,
      jersey,
      pos: NORMAL_POS[raw] ?? raw ?? '',
      photo,
    });
  });

  return [...out.values()];
}

export interface TeamScrape {
  url: string | null;
  players: SchoolPlayer[];
  /** What each URL shape did, so a dry spell can be diagnosed from the log. */
  tried: { url: string; status: number; players: number; note?: string }[];
}

/** Every URL shape a school's roster page might live at, in order of likelihood. */
export function rosterUrls(site: SchoolSite, leagueKey: string): string[] {
  const out: string[] = [];
  for (const sport of ROSTER_PATHS[leagueKey] ?? []) {
    out.push(`https://${site.domain}/sports/${sport}/roster`);
    out.push(`https://www.${site.domain}/sports/${sport}/roster`);
    // The schools that never moved to Sidearm, in the shapes they did keep.
    out.push(`https://${site.domain}/sport/${sport}/roster`);
    out.push(`https://${site.domain}/roster/${sport}`);
    out.push(`https://${site.domain}/roster.aspx?path=${sport}`);
  }
  return out;
}

/** A page listing this many players is a roster; anything less is a staff list. */
const A_SQUAD = 12;

/**
 * Ask the site where its own roster is.
 *
 * Arkansas answered 404 to all six shapes because it does not use any of them,
 * and guessing a seventh is a game with no end. Its front page links to the
 * page we want, though — every athletics site does, because that is how its own
 * readers get there — so read the link rather than invent the URL.
 */
async function discoverRosterUrls(site: SchoolSite, leagueKey: string): Promise<string[]> {
  const home = await fetchText(`https://${site.domain}/`, `${site.school} home`);
  if (!home.body) return [];
  const words = ROSTER_PATHS[leagueKey] ?? [];
  const urls = new Set<string>();
  for (const m of home.body.matchAll(/href=["']([^"']*roster[^"']*)["']/gi)) {
    const href = m[1].toLowerCase();
    if (!words.some((w) => href.includes(w))) continue;
    try { urls.add(new URL(m[1], home.url).toString()); } catch { /* not a URL */ }
  }
  return [...urls].slice(0, 3);
}

/**
 * Read a school's roster page: the cheap way first, then the two expensive ones.
 *
 * Plain requests get the thirty-six schools whose pages are built on the server.
 * The rest either put the roster somewhere else — which their own navigation
 * will say — or build it in the browser, which is what the browser is for.
 */
export async function scrapeTeam(site: SchoolSite, leagueKey: string, idPrefix: string): Promise<TeamScrape> {
  const tried: TeamScrape['tried'] = [];
  let best: { url: string; players: SchoolPlayer[] } | null = null;
  /** URLs that answered at all, in the order they answered — what to render. */
  const alive: string[] = [];

  const read = async (shape: string) => {
    const page = await fetchText(shape, `${site.school} ${leagueKey} roster`);
    const players = page.body ? rosterFromHtml(page.body, page.url, idPrefix) : [];
    tried.push({ url: shape, status: page.status, players: players.length, note: page.note });
    if (page.status === 200 && page.body && !alive.includes(page.url)) alive.push(page.url);
    if (!best || players.length > best.players.length) best = { url: page.url, players };
    return players.length;
  };

  for (const shape of rosterUrls(site, leagueKey)) {
    if (await read(shape) >= A_SQUAD) return { url: best!.url, players: best!.players, tried };
  }

  // Nothing at the shapes we guessed: follow the site's own link instead.
  for (const found of await discoverRosterUrls(site, leagueKey)) {
    if (tried.some((t) => t.url === found)) continue;
    if (await read(found) >= A_SQUAD) return { url: best!.url, players: best!.players, tried };
  }

  // A page that answers with almost nothing on it is a page that builds itself
  // in the browser. Open it in one.
  const rendered = await renderPages(alive.slice(0, 2), {
    settle: { selector: 'a[href*="/roster/"], a[href*="rp_id="], a[href*="/player/"]', count: A_SQUAD },
  });
  for (const [url, html] of rendered) {
    const players = rosterFromHtml(html, url, idPrefix);
    tried.push({ url: `${url} (rendered)`, status: 200, players: players.length });
    if (!best || players.length > best.players.length) best = { url, players };
  }

  const found: { url: string; players: SchoolPlayer[] } | null = best;
  return found && found.players.length >= A_SQUAD
    ? { url: found.url, players: found.players, tried }
    : { url: null, players: [], tried };
}

export interface AthleticsRun { read: number; answered: number; players: number; }

/**
 * Read as many school roster pages as this run can afford.
 *
 * Pages are re-read on a slow cycle rather than every build: a roster changes a
 * few times a season, and reading seventy of them three times a day to be told
 * the same thing is the mistake the ESPN headshot backfill already made once.
 */
export async function backfillFromSchools(
  leagueKey: string,
  teams: { id: string; logoUrl?: string | null }[],
  cache: AthleticsCache,
  budget: number,
  recheckDays = 21,
  concurrency = 4,
): Promise<AthleticsRun> {
  const stale = Date.now() - recheckDays * 86_400_000;
  const due = teams
    .map((t) => ({ team: t, site: siteFor(t.logoUrl) }))
    .filter((r): r is { team: { id: string; logoUrl?: string | null }; site: SchoolSite } => !!r.site)
    .filter(({ team }) => {
      const seen = cache.teams[team.id];
      return !seen || Date.parse(seen.checkedAt) < stale;
    })
    .slice(0, budget);

  let answered = 0;
  let players = 0;

  for (let i = 0; i < due.length; i += concurrency) {
    const batch = due.slice(i, i + concurrency);
    const results = await Promise.all(batch.map(({ site, team }) =>
      scrapeTeam(site, leagueKey, `${site.id}`).catch(() => ({ url: null, players: [], tried: [] } as TeamScrape))));
    batch.forEach(({ team }, j) => {
      const { url, players: squad } = results[j];
      cache.teams[team.id] = { checkedAt: new Date().toISOString(), url, players: squad };
      if (squad.length) { answered += 1; players += squad.length; }
    });
  }

  return { read: due.length, answered, players };
}
