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
import { SCHOOL_SITES, scrapeTeam, siteFor, supportsAthletics } from '../pipeline/multi/athletics';

const DATA = path.resolve(__dirname, '../data/live/sports');

interface Team { id: string; name: string; logoUrl?: string | null }

const teamsOf = (league: string): Team[] =>
  (JSON.parse(fs.readFileSync(path.join(DATA, league, 'teams.json'), 'utf8')) as { teams: Team[] }).teams;

async function main() {
  const league = process.argv[2] ?? 'cbase';
  const limit = Number(process.argv[3] ?? SCHOOL_SITES.length);
  if (!supportsAthletics(league)) throw new Error(`no roster path for ${league}`);

  const teams = teamsOf(league);
  const mapped = teams
    .map((t) => ({ team: t, site: siteFor(t.logoUrl) }))
    .filter((r) => r.site)
    .slice(0, limit);

  console.log(`${league}: ${mapped.length} of ${teams.length} teams have a school site in the map\n`);

  let answered = 0;
  let players = 0;
  let photos = 0;

  for (const { site } of mapped) {
    const squad = await scrapeTeam(site!, league, site!.id);
    if (squad.players.length) answered += 1;
    players += squad.players.length;
    const shot = squad.players.filter((p) => p.photo).length;
    photos += shot;
    console.log(`${site!.school.padEnd(20)} ${String(squad.players.length).padStart(3)} players · ${String(shot).padStart(3)} photos  ${squad.url ?? 'no page answered'}`);
    if (!squad.players.length) {
      for (const t of squad.tried) console.log(`${' '.repeat(21)}${String(t.status).padStart(3)} read=${t.players} ${t.url}${t.note ? ` (${t.note})` : ''}`);
    } else {
      const p = squad.players[0];
      console.log(`${' '.repeat(21)}e.g. ${p.name} #${p.jersey ?? '—'} ${p.pos || '—'} ${(p.photo ?? 'no photo').slice(0, 90)}`);
    }
  }

  console.log(`\n${answered}/${mapped.length} schools published a squad · ${players} players · ${photos} with a photograph`);
}

main().catch((e) => { console.error(e); process.exit(1); });
