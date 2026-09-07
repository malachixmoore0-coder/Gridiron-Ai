/**
 * What does a school's own roster page actually give up?
 *
 *   npm run data:schools            # college baseball, every school in the map
 *   npm run data:schools -- cbase 6 # the first six
 *
 * The sandbox cannot reach athletics sites at all, so this exists to be run in
 * CI, where it can. It reports per school which URL answered, how many players
 * were read off it, and how many of those came with a photograph — enough to
 * tell a working scrape from a page that changed shape, without committing a
 * single byte of data.
 */
import fs from 'node:fs';
import path from 'node:path';
import { SCHOOL_SITES, rosterUrls, scrapeTeam, siteFor, supportsAthletics } from '../pipeline/multi/athletics';
import { closeBrowser, renderPages } from '../pipeline/multi/render';
import { report } from '../pipeline/lib/report';

const DATA = path.resolve(__dirname, '../data/live/sports');
const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';

interface Team { id: string; name: string; logoUrl?: string | null }

const teamsOf = (league: string): Team[] =>
  (JSON.parse(fs.readFileSync(path.join(DATA, league, 'teams.json'), 'utf8')) as { teams: Team[] }).teams;

const out = report('schools');
const log = out.log;

/** /roster/zane-adams/17285 → /roster/#/#, so a page's links group into shapes. */
const shapeOf = (href: string) =>
  href.split('?')[0].split('/').map((x) => (x && /\d/.test(x) ? '#' : x)).join('/') + (href.includes('?') ? `?${href.split('?')[1].replace(/=\d+/g, '=#')}` : '');

/** What does this page actually link to — fetched, and again once rendered? */
async function shapes(schools: string[], league: string) {
  for (const want of schools) {
    const site = SCHOOL_SITES.find((x) => x.school.toLowerCase() === want.toLowerCase());
    if (!site) { log(`${want}: not in the map`); continue; }
    const url = rosterUrls(site, league)[0];

    // With a timeout: a site that accepts the connection and then says nothing
    // will otherwise hold the whole probe open until the runner gives up.
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 20_000);
    const plain = await fetch(url, { redirect: 'follow', signal: ctrl.signal, headers: { 'user-agent': UA, accept: 'text/html' } })
      .then(async (r) => (r.ok ? { status: r.status, html: await r.text(), url: r.url } : { status: r.status, html: '', url }))
      .catch(() => ({ status: 0, html: '', url }))
      .finally(() => clearTimeout(timer));
    const drawn = (await renderPages([url], { settle: { selector: 'img', count: 20 } })).get(url) ?? '';

    for (const [how, html] of [['fetched', plain.html], ['rendered', drawn]] as const) {
      log(`\n${site.school} ${how} ${url} → ${how === 'fetched' ? plain.status : 200} ${html.length} bytes · ${(html.match(/<img/gi) ?? []).length} images`);
      if (!html) continue;
      const counts = new Map<string, { n: number; sample: string }>();
      for (const m of html.matchAll(/href=["']([^"']+)["']/gi)) {
        if (/^(#|mailto:|javascript:|tel:)/.test(m[1])) continue;
        const shape = shapeOf(m[1]);
        const hit = counts.get(shape);
        if (hit) hit.n += 1; else counts.set(shape, { n: 1, sample: m[1] });
      }
      for (const [shape, { n, sample }] of [...counts].sort((a, b) => b[1].n - a[1].n).slice(0, 12)) {
        log(`  ${String(n).padStart(3)}  ${shape.slice(0, 70)}   e.g. ${sample.slice(0, 70)}`);
      }
    }
  }
}

async function main() {
  if (process.argv[2] === '--shapes') return shapes((process.argv[3] ?? '').split(','), process.argv[4] ?? 'cbase');
  const league = process.argv[2] ?? 'cbase';
  const limit = Number(process.argv[3] ?? SCHOOL_SITES.length);
  if (!supportsAthletics(league)) throw new Error(`no roster path for ${league}`);

  const teams = teamsOf(league);
  // "silent" re-reads only the schools that gave nothing last time, which is
  // the set worth watching once the easy ones are done.
  let silent: Set<string> | null = null;
  if (process.argv.includes('--silent')) {
    const cache = JSON.parse(fs.readFileSync(path.join(DATA, league, 'athletics.json'), 'utf8')) as
      { teams: Record<string, { players: unknown[] }> };
    silent = new Set(Object.entries(cache.teams).filter(([, v]) => !v.players.length).map(([id]) => id));
  }
  const mapped = teams
    .map((t) => ({ team: t, site: siteFor(t.logoUrl) }))
    .filter((r) => r.site && (!silent || silent.has(r.team.id)))
    .slice(0, limit);

  log(`${league}: ${mapped.length} of ${teams.length} teams have a school site in the map\n`);

  let answered = 0;
  let players = 0;
  let photos = 0;

  for (const { site } of mapped) {
    const squad = await scrapeTeam(site!, league, site!.id);
    if (squad.players.length) answered += 1;
    players += squad.players.length;
    const shot = squad.players.filter((p) => p.photo).length;
    photos += shot;
    log(`${site!.school.padEnd(20)} ${String(squad.players.length).padStart(3)} players · ${String(shot).padStart(3)} photos  ${squad.url ?? 'no page answered'}`);
    if (!squad.players.length) {
      for (const t of squad.tried) log(`${' '.repeat(21)}${String(t.status).padStart(3)} read=${t.players} ${t.url}${t.note ? ` (${t.note})` : ''}`);
    } else {
      const p = squad.players[0];
      log(`${' '.repeat(21)}e.g. ${p.name} #${p.jersey ?? '—'} ${p.pos || '—'} ${(p.photo ?? 'no photo').slice(0, 90)}`);
    }
  }

  log(`\n${answered}/${mapped.length} schools published a squad · ${players} players · ${photos} with a photograph`);
}

// The browser is closed here rather than at the end of main, because a probe
// that returns early down one branch would otherwise leave Chromium running
// and node would never exit — which is exactly what happened.
main()
  .catch((e) => { console.error(e); process.exitCode = 1; })
  .finally(async () => { out.flush(); await closeBrowser(); });
