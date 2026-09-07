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
import { SCHOOL_SITES, nameKey, photosFromHtml, rosterUrls, scrapeTeam, siteFor, supportsAthletics } from '../pipeline/multi/athletics';

const DATA = path.resolve(__dirname, '../data/live/sports');
const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';

interface Team { id: string; name: string; logoUrl?: string | null }

function rosterNames(league: string, teamId: string): string[] {
  try {
    const file = JSON.parse(fs.readFileSync(path.join(DATA, league, 'rosters', `${teamId}.json`), 'utf8')) as { players: { name: string }[] };
    return file.players.map((p) => p.name);
  } catch { return []; }
}

/** Print the shape of one school's page, for when the parser finds nothing. */
async function dump(school: string, league: string) {
  const site = SCHOOL_SITES.find((s) => s.school.toLowerCase() === school.toLowerCase());
  if (!site) throw new Error(`no site for ${school}`);
  const teams = (JSON.parse(fs.readFileSync(path.join(DATA, league, 'teams.json'), 'utf8')) as { teams: Team[] }).teams;
  const team = teams.find((t) => siteFor(t.logoUrl)?.domain === site.domain);
  const names = team ? rosterNames(league, team.id) : [];

  for (const url of rosterUrls(site, league)) {
    const res = await fetch(url, { redirect: 'follow', headers: { 'user-agent': UA, accept: 'text/html' } }).catch(() => null);
    const body = res?.ok ? await res.text() : '';
    console.log(`\n--- ${url} → ${res?.status ?? 0} ${res?.url ?? ''} ${body.length} bytes`);
    if (!body) continue;
    console.log(`images: ${(body.match(/<img\b/gi) ?? []).length} · known roster names: ${names.length}`);

    // Where a name we know actually appears, and what is around it. This is
    // the only question that matters: can a photo be tied to a player at all?
    for (const name of names.slice(0, 3)) {
      const parts = name.split(' ');
      const last = parts[parts.length - 1];
      const at = body.indexOf(last);
      console.log(`\n"${name}" → ${at < 0 ? 'not in the html at all' : `at ${at}`}`);
      if (at >= 0) console.log(body.slice(Math.max(0, at - 900), at + 500).replace(/\s+/g, ' '));
    }

    // Nuxt sites ship the page's data as JSON beside the page itself.
    const payload = /href="(\/[^"]*_payload\.json[^"]*)"/.exec(body)?.[1];
    if (payload) {
      const abs = new URL(payload, res!.url).toString();
      const p = await fetch(abs, { headers: { 'user-agent': UA } }).catch(() => null);
      const text = p?.ok ? await p.text() : '';
      console.log(`\npayload ${abs} → ${p?.status ?? 0} ${text.length} bytes`);
      if (text) {
        const first = names[0]?.split(' ').pop() ?? '';
        const at = text.indexOf(first);
        console.log(at < 0 ? 'first player not in the payload' : text.slice(Math.max(0, at - 700), at + 700));
      }
    }
    break;
  }
}

async function main() {
  if (process.argv[2] === '--dump') return dump(process.argv[3], process.argv[4] ?? 'cbase');
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
    const { url, photos: hits, tried } = await scrapeTeam(site!, league, wanted);
    asked += 1;
    if (hits.size) worked += 1;
    photos += hits.size;
    console.log(`${site!.school.padEnd(20)} ${String(hits.size).padStart(3)}/${String(wanted.size).padStart(3)}  ${url ?? 'no page answered'}`);
    // What each shape did — status, and how many images the page even had.
    // "200 with 90 images and no matches" is a parser problem; "403" is not.
    for (const t of tried) console.log(`${' '.repeat(21)}${String(t.status).padStart(3)} imgs=${String(t.images).padStart(3)} ${t.url}${t.note ? ` (${t.note})` : ''}`);
    const sample = [...hits.values()][0];
    if (sample) console.log(`${' '.repeat(21)}e.g. ${sample.slice(0, 140)}`);
  }

  console.log(`\n${worked}/${asked} schools answered with photographs · ${photos} players matched`);
}

main().catch((e) => { console.error(e); process.exit(1); });
