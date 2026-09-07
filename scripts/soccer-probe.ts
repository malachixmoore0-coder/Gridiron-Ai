/**
 * Where do the league sites keep their clubs, and their squads?
 *
 *   npm run data:soccer -- clubs        # what the club index links to
 *   npm run data:soccer -- squad <url>  # what a squad page has on it
 *
 * ESPN publishes a headshot for about one soccer player in ten — 540 of 5,400
 * across the eight leagues — and the rest are on the leagues' own club pages,
 * which are all single-page apps. This exists to find their shapes from CI,
 * since the sandbox cannot reach any of them.
 */
import { renderPages, closeBrowser, extractImages } from '../pipeline/multi/render';
import { report } from '../pipeline/lib/report';

const out = report('soccer');
const log = out.log;

const CLUB_INDEX: Record<string, string> = {
  epl: 'https://www.premierleague.com/clubs',
  laliga: 'https://www.laliga.com/en-GB/clubs',
  bundesliga: 'https://www.bundesliga.com/en/bundesliga/clubs',
  seriea: 'https://www.legaseriea.it/en/serie-a/clubs',
  ligue1: 'https://www.ligue1.com/clubs',
  mls: 'https://www.mlssoccer.com/clubs',
  ligamx: 'https://ligamx.net/cancha/clubes',
  ucl: 'https://www.uefa.com/uefachampionsleague/clubs/',
};

/** /clubs/12/Liverpool/overview → /clubs/#/#/overview, so shapes group. */
const shapeOf = (href: string) =>
  href.split('?')[0].split('/').map((s) => (s && /\d/.test(s) ? '#' : s)).join('/');

async function clubs() {
  const pages = await renderPages(Object.values(CLUB_INDEX), { concurrency: 3, timeoutMs: 25_000 });
  for (const [key, url] of Object.entries(CLUB_INDEX)) {
    const html = pages.get(url);
    log(`\n=== ${key} ${url} → ${html ? `${html.length} bytes` : 'did not open'}`);
    if (!html) continue;
    const counts = new Map<string, { n: number; sample: string }>();
    for (const m of html.matchAll(/href=["']([^"']+)["']/gi)) {
      const href = m[1];
      if (/^(#|mailto:|javascript:)/.test(href)) continue;
      const shape = shapeOf(href);
      const hit = counts.get(shape);
      if (hit) hit.n += 1; else counts.set(shape, { n: 1, sample: href });
    }
    const top = [...counts].sort((a, b) => b[1].n - a[1].n).slice(0, 14);
    for (const [shape, { n, sample }] of top) log(`  ${String(n).padStart(3)}  ${shape}   e.g. ${sample.slice(0, 80)}`);
  }
}

async function squad(url: string) {
  const found = await extractImages([url], { settle: { selector: 'img', count: 12 } });
  const shots = found.get(url) ?? [];
  log(`${url} → ${shots.length} images`);
  for (const c of shots.slice(0, 25)) {
    log(`  alt=${JSON.stringify(c.alt.slice(0, 40))} text=${JSON.stringify(c.text.slice(0, 40))} href=${c.href.slice(0, 50)}`);
    log(`      ${c.src.slice(0, 130)}`);
  }
}

async function main() {
  const mode = process.argv[2] ?? 'clubs';
  if (mode === 'squad') await squad(process.argv[3]);
  else await clubs();
  await closeBrowser();
}

main().then(() => out.flush()).catch((e) => { out.flush(); console.error(e); process.exit(1); });
