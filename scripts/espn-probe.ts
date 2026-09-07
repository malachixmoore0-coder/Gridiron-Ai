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
  'hockey/nhl',
  'soccer/eng.1', 'soccer/esp.1', 'soccer/ita.1', 'soccer/ger.1', 'soccer/fra.1',
  'soccer/usa.1', 'soccer/mex.1', 'soccer/ned.1', 'soccer/por.1', 'soccer/eng.2',
  'soccer/uefa.champions', 'soccer/uefa.europa', 'soccer/sco.1', 'soccer/bra.1',
  'golf/pga',
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

  const teamRows = teams?.sports?.[0]?.leagues?.[0]?.teams ?? [];
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
    teams: teamRows.length,
    events: events.length,
    statAthletes: stats?.pagination?.count ?? athletes.length,
    categories: categories.join('/') || '—',
    roster: rosterN,
    headshots: heads,
  };
}

async function main() {
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
        '  ' + r.categories.slice(0, 60),
      );
    } catch (e) {
      console.log(p.padEnd(24), '  failed:', (e as Error).message);
    }
  }
}

main().catch((e) => { console.error(e); process.exitCode = 1; });
