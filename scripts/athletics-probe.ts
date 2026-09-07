/**
 * Does a school's roster page actually give up its photographs?
 *
 *   npm run data:schools            # college baseball, the whole map
 *   npm run data:schools -- mbb 12  # men's basketball, first twelve schools
 *
 * The sandbox cannot reach athletics sites at all, so this exists to be run in
 * CI, where it can. It reports per school: which URL answered, how many of that
 * roster's players were matched to a picture, and one sample URL — enough to
 * tell a working scrape from a page that changed shape, without committing a
 * single byte of data.
 */
import fs from 'node:fs';
import path from 'node:path';
import { SCHOOL_SITES, nameKey, scrapeTeam, siteFor, supportsAthletics } from '../pipeline/multi/athletics';

const DATA = path.resolve(__dirname, '../data/live/sports');

interface Team { id: string; name: string; logoUrl?: string | null }

function rosterNames(league: string, teamId: string): string[] {
  try {
    const file = JSON.parse(fs.readFileSync(path.join(DATA, league, 'rosters', `${teamId}.json`), 'utf8')) as { players: { name: string }[] };
    return file.players.map((p) => p.name);
  } catch { return []; }
}

async function main() {
  const league = process.argv[2] ?? 'cbase';
  const limit = Number(process.argv[3] ?? SCHOOL_SITES.length);
  if (!supportsAthletics(league)) throw new Error(`no roster path for ${league}`);

  const teams = (JSON.parse(fs.readFileSync(path.join(DATA, league, 'teams.json'), 'utf8')) as { teams: Team[] }).teams;
  const mapped = teams
    .map((t) => ({ team: t, site: siteFor(t.logoUrl) }))
    .filter((r) => r.site)
    .slice(0, limit);

  console.log(`${league}: ${mapped.length} of ${teams.length} teams have a school site in the map\n`);

  let worked = 0;
  let photos = 0;
  let asked = 0;

  for (const { team, site } of mapped) {
    const names = rosterNames(league, team.id);
    if (!names.length) { console.log(`${site!.school.padEnd(20)} — no local roster to match against`); continue; }
    const wanted = new Set(names.map(nameKey).filter((k) => k.length > 3));
    const { url, photos: hits } = await scrapeTeam(site!, league, wanted);
    asked += 1;
    if (hits.size) worked += 1;
    photos += hits.size;
    const sample = [...hits.values()][0];
    console.log(`${site!.school.padEnd(20)} ${String(hits.size).padStart(3)}/${String(wanted.size).padStart(3)}  ${url ?? 'no page answered'}`);
    if (sample) console.log(`${' '.repeat(21)}e.g. ${sample.slice(0, 120)}`);
  }

  console.log(`\n${worked}/${asked} schools answered with photographs · ${photos} players matched`);
}

main().catch((e) => { console.error(e); process.exit(1); });
