/**
 * What does ESPN actually serve for a league?
 *
 *   npx tsx scripts/espn-probe.ts hockey/nhl soccer/eng.1 …
 *
 * Adding a league is cheap; adding one whose data turns out to be missing is
 * expensive, because the discovery happens in the app in front of a user. This
 * asks the four questions that decide whether a league is worth shipping —
 * are there teams, are there fixtures, are there per-player statistics, and do
 * the rosters carry photographs — and prints the answers as a table.
 */
import process from 'node:process';

const SITE = 'https://site.api.espn.com/apis/site/v2/sports';
const WEB = 'https://site.web.api.espn.com/apis/common/v3/sports';

const CANDIDATES = [
  'football/nfl', 'football/college-football',
  'basketball/nba', 'basketball/wnba', 'basketball/mens-college-basketball',
  'basketball/womens-college-basketball', 'baseball/mlb', 'baseball/college-baseball',
  'hockey/nhl',
  'soccer/eng.1', 'soccer/esp.1', 'soccer/ita.1', 'soccer/ger.1', 'soccer/fra.1',
  'soccer/usa.1', 'soccer/mex.1', 'soccer/ned.1', 'soccer/por.1', 'soccer/eng.2',
  'soccer/uefa.champions', 'soccer/uefa.europa', 'soccer/sco.1', 'soccer/bra.1',
  'soccer/mex.1', 'golf/pga',
];

async function json(url: string, timeoutMs = 20000): Promise<any | null> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(url, { signal: ctrl.signal, headers: { accept: 'application/json' } });
    if (!res.ok) return null;
    return await res.json();
  } catch { return null; } finally { clearTimeout(timer); }
}

const ymd = (d: Date) => `${d.getUTCFullYear()}${String(d.getUTCMonth() + 1).padStart(2, '0')}${String(d.getUTCDate()).padStart(2, '0')}`;

async function probe(path: string) {
  const season = new Date().getUTCFullYear();
  const from = new Date(); from.setUTCDate(from.getUTCDate() - 30);
  const to = new Date(); to.setUTCDate(to.getUTCDate() + 21);

  const [teams, board, stats] = await Promise.all([
    json(`${SITE}/${path}/teams?limit=1000`),
    json(`${SITE}/${path}/scoreboard?dates=${ymd(from)}-${ymd(to)}&limit=400`),
    json(`${WEB}/${path}/statistics/byathlete?region=us&lang=en&contentorigin=espn&limit=50&season=${season}&seasontype=2`),
  ]);

  const leagueNode = teams?.sports?.[0]?.leagues?.[0];
  const teamRows = leagueNode?.teams ?? [];
  const logo = leagueNode?.logos?.find((l: any) => /dark/i.test(l?.rel?.join?.(',') ?? ''))?.href
    ?? leagueNode?.logos?.[0]?.href ?? null;
  const events = board?.events ?? [];
  const athletes = stats?.athletes ?? [];
  const categories = (stats?.categories ?? []).map((c: any) => c?.name).filter(Boolean);

  // One roster, to see whether headshots are on file.
  let rosterN = 0;
  let heads = 0;
  const firstId = teamRows[0]?.team?.id;
  if (firstId) {
    const roster = await json(`${SITE}/${path}/teams/${firstId}/roster`);
    const raw: any[] = [];
    for (const entry of roster?.athletes ?? []) {
      if (Array.isArray(entry?.items)) raw.push(...entry.items); else raw.push(entry);
    }
    rosterN = raw.length;
    heads = raw.filter((a) => a?.headshot?.href).length;
  }

  return {
    path,
    logo,
    teams: teamRows.length,
    events: events.length,
    statAthletes: stats?.pagination?.count ?? athletes.length,
    categories: categories.join('/') || '—',
    roster: rosterN,
    headshots: heads,
  };
}

/**
 * League crests are not on any endpoint the app already calls, but ESPN serves
 * them from a stable CDN path. Guessing a URL and shipping it is how you end up
 * with a grid of broken images, so the candidates get checked before any of
 * them goes into the registry.
 */
const LOGO_CANDIDATES: [string, string][] = [
  ['nfl', 'https://a.espncdn.com/i/teamlogos/leagues/500/nfl.png'],
  ['ncaa', 'https://a.espncdn.com/i/teamlogos/leagues/500/ncaa.png'],
  ['college-football', 'https://a.espncdn.com/i/teamlogos/leagues/500/ncaa_f.png'],
  ['nba', 'https://a.espncdn.com/i/teamlogos/leagues/500/nba.png'],
  ['wnba', 'https://a.espncdn.com/i/teamlogos/leagues/500/wnba.png'],
  ['mlb', 'https://a.espncdn.com/i/teamlogos/leagues/500/mlb.png'],
  ['nhl', 'https://a.espncdn.com/i/teamlogos/leagues/500/nhl.png'],
  ['mls-team', 'https://a.espncdn.com/i/teamlogos/leagues/500/mls.png'],
  ['epl-23', 'https://a.espncdn.com/i/leaguelogos/soccer/500/23.png'],
  ['laliga-15', 'https://a.espncdn.com/i/leaguelogos/soccer/500/15.png'],
  ['seriea-12', 'https://a.espncdn.com/i/leaguelogos/soccer/500/12.png'],
  ['bundesliga-10', 'https://a.espncdn.com/i/leaguelogos/soccer/500/10.png'],
  ['ligue1-9', 'https://a.espncdn.com/i/leaguelogos/soccer/500/9.png'],
  ['ucl-2', 'https://a.espncdn.com/i/leaguelogos/soccer/500/2.png'],
  ['ligamx-22', 'https://a.espncdn.com/i/leaguelogos/soccer/500/22.png'],
  ['mls-19', 'https://a.espncdn.com/i/leaguelogos/soccer/500/19.png'],
  ['pga', 'https://a.espncdn.com/i/leaguelogos/golf/500/pga.png'],
  ['pga-team', 'https://a.espncdn.com/i/teamlogos/leagues/500/pga.png'],
];

async function logos() {
  for (const [name, url] of LOGO_CANDIDATES) {
    try {
      const res = await fetch(url, { method: 'GET' });
      const buf = res.ok ? await res.arrayBuffer() : null;
      console.log(name.padEnd(18), res.status, String(buf?.byteLength ?? 0).padStart(7), ' ', url);
    } catch (e) {
      console.log(name.padEnd(18), 'failed', (e as Error).message);
    }
  }
}

async function main() {
  if (process.argv.includes('--logos')) { await logos(); return; }
  const want = process.argv.slice(2).filter((a) => !a.startsWith('-'));
  const list = want.length ? want : CANDIDATES;
  console.log('path'.padEnd(24), 'teams'.padStart(6), 'events'.padStart(7), 'statAth'.padStart(8), 'roster'.padStart(7), 'heads'.padStart(6), '  categories');
  for (const p of list) {
    try {
      const r = await probe(p);
      console.log(
        r.path.padEnd(24),
        String(r.teams).padStart(6),
        String(r.events).padStart(7),
        String(r.statAthletes).padStart(8),
        String(r.roster).padStart(7),
        String(r.headshots).padStart(6),
        '  ' + r.categories.slice(0, 40),
        '  ' + (r.logo ?? '—'),
      );
    } catch (e) {
      console.log(p.padEnd(24), '  failed:', (e as Error).message);
    }
  }
}

main().catch((e) => { console.error(e); process.exitCode = 1; });
