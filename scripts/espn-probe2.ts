/**
 * Follow-up probe: the two shapes the first pass could not answer.
 *
 * Soccer has teams and fixtures everywhere and per-player statistics nowhere
 * that byathlete can see, so this checks the other doors — leaders, a single
 * athlete's stats, and whether a roster entry carries anything inline.
 *
 * Golf has no teams at all, so it needs its own reading entirely: what a
 * tournament looks like, and what the field carries.
 */
import process from 'node:process';

const SITE = 'https://site.api.espn.com/apis/site/v2/sports';
const WEB = 'https://site.web.api.espn.com/apis/common/v3/sports';
const CORE = 'https://sports.core.api.espn.com/v2/sports';

async function json(url: string, timeoutMs = 20000): Promise<any | null> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(url, { signal: ctrl.signal, headers: { accept: 'application/json' } });
    if (!res.ok) return null;
    return await res.json();
  } catch { return null; } finally { clearTimeout(timer); }
}

const peek = (label: string, v: unknown, n = 700) =>
  console.log(`  ${label}:`, String(JSON.stringify(v)).slice(0, n));

async function soccer(path: string) {
  console.log(`\n=== ${path}`);
  const season = new Date().getUTCFullYear();

  const leaders = await json(`${SITE}/${path}/leaders`);
  console.log('  leaders keys:', leaders ? Object.keys(leaders).join(',') : 'null');
  peek('leaders sample', leaders?.leaders?.[0] ?? leaders?.categories?.[0] ?? leaders?.sports?.[0]?.leagues?.[0]?.leaders?.[0] ?? null, 500);

  const teams = await json(`${SITE}/${path}/teams?limit=50`);
  const teamId = teams?.sports?.[0]?.leagues?.[0]?.teams?.[0]?.team?.id;
  const roster = teamId ? await json(`${SITE}/${path}/teams/${teamId}/roster`) : null;
  const first = roster?.athletes?.[0]?.items?.[0] ?? roster?.athletes?.[0];
  console.log('  roster athlete keys:', first ? Object.keys(first).join(',') : 'null');

  const athleteId = first?.id;
  if (athleteId) {
    const s = await json(`${WEB}/${path}/athletes/${athleteId}/stats`);
    console.log('  athlete/stats keys:', s ? Object.keys(s).join(',') : 'null');
    peek('athlete/stats categories', (s?.categories ?? s?.splits?.categories ?? []).map?.((c: any) => c?.name) ?? null, 300);
    const c = await json(`${CORE}/soccer/leagues/${path.split('/')[1]}/seasons/${season}/types/1/athletes/${athleteId}/statistics`);
    console.log('  core statistics:', c ? Object.keys(c).join(',') : 'null');
    peek('core splits', (c?.splits?.categories ?? []).map?.((x: any) => x?.name) ?? null, 300);
  }
}

async function golf() {
  console.log('\n=== golf/pga');
  const board = await json(`${SITE}/golf/pga/scoreboard`);
  console.log('  scoreboard keys:', board ? Object.keys(board).join(',') : 'null');
  const ev = board?.events?.[0];
  console.log('  event keys:', ev ? Object.keys(ev).join(',') : 'null');
  peek('event head', ev ? { id: ev.id, name: ev.name, date: ev.date, status: ev.status?.type?.description, course: ev.courses?.[0]?.name, purse: ev.purse } : null, 400);
  const comp = ev?.competitions?.[0];
  console.log('  competition keys:', comp ? Object.keys(comp).join(',') : 'null');
  const player = comp?.competitors?.[0];
  console.log('  competitor keys:', player ? Object.keys(player).join(',') : 'null');
  peek('competitor', player ? {
    id: player.id, order: player.order, score: player.score, status: player.status,
    athlete: player.athlete ? { id: player.athlete.id, name: player.athlete.displayName, flag: player.athlete.flag?.href, headshot: player.athlete.headshot?.href } : null,
    linescores: (player.linescores ?? []).slice(0, 2),
    statistics: (player.statistics ?? []).slice(0, 4),
  } : null, 900);

  const season = new Date().getUTCFullYear();
  const stats = await json(`${WEB}/golf/pga/statistics/byathlete?region=us&lang=en&contentorigin=espn&limit=5&season=${season}&seasontype=2`);
  peek('byathlete categories', (stats?.categories ?? []).map((c: any) => ({ name: c?.name, names: c?.names })), 900);
  const row = stats?.athletes?.[0];
  peek('byathlete row', row ? { athlete: { id: row.athlete?.id, name: row.athlete?.displayName, headshot: row.athlete?.headshot?.href }, categories: row.categories } : null, 900);
}

async function main() {
  for (const p of ['soccer/eng.1', 'soccer/usa.1']) await soccer(p);
  await golf();
}

main().catch((e) => { console.error(e); process.exitCode = 1; });
