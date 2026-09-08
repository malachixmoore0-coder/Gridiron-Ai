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
import { renderPages, closeBrowser, captureJson, extractImages } from '../pipeline/multi/render';
import { report } from '../pipeline/lib/report';

const out = report('soccer');
const log = out.log;

/**
 * Where each league keeps its clubs. These are the pages themselves, not
 * guesses at them — three of my own guesses were wrong (the Premier League
 * moved to /en/clubs, Serie A says /team, and Ligue 1 has no club index at all,
 * only a standings table that links to every side).
 */
const CLUB_INDEX: Record<string, string> = {
  epl: 'https://www.premierleague.com/en/clubs',
  laliga: 'https://www.laliga.com/en-US/clubs',
  bundesliga: 'https://www.bundesliga.com/en/bundesliga/clubs',
  seriea: 'https://en.legaseriea.it/team',
  ligue1: 'https://ligue1.com/en/competitions/ligue1mcdonalds/standings',
  mls: 'https://www.mlssoccer.com/clubs/',
  ligamx: 'https://ligamx.net',
  ucl: 'https://www.uefa.com/uefachampionsleague/clubs/',
};

/** /clubs/12/Liverpool/overview → /clubs/#/#/overview, so shapes group. */
const shapeOf = (href: string) =>
  href.split('?')[0].split('/').map((s) => (s && /\d/.test(s) ? '#' : s)).join('/');

/** Anything that looks like it points at one club rather than a section. */
const CLUBBY = /\/(clubs?|teams?|equipos?|squadre?|club-sheet|equipo)\b/i;

async function clubs() {
  // These pages hydrate late — the Premier League's club grid is not in the
  // markup at all until its scripts run — so the browser is told what to wait
  // for rather than being given a fixed pause.
  const pages = await renderPages(Object.values(CLUB_INDEX), {
    concurrency: 2,
    timeoutMs: 30_000,
    settle: { selector: 'a[href*="club"], a[href*="team"], a[href*="equipo"]', count: 10 },
    waitMs: 3500,
  });

  const firstClub: Record<string, string> = {};

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
    const ranked = [...counts].sort((a, b) => b[1].n - a[1].n);
    for (const [shape, { n, sample }] of ranked.slice(0, 10)) log(`  ${String(n).padStart(3)}  ${shape.slice(0, 72)}   e.g. ${sample.slice(0, 72)}`);

    // The club link is the one that repeats about as often as there are clubs.
    const club = ranked.find(([shape, { n }]) => n >= 6 && CLUBBY.test(shape) && /#|-/.test(shape));
    if (!club) { log('  (no club link found)'); continue; }
    try { firstClub[key] = new URL(club[1].sample, url).toString(); } catch { /* not a URL */ }
    log(`  → club pages look like ${club[0]} (${club[1].n})`);
  }

  // And what a club page holds: the squad, or a link to it.
  for (const [key, club] of Object.entries(firstClub)) {
    const tries = [club, `${club.replace(/\/$/, '')}/squad`];
    const found = await extractImages(tries, { settle: { selector: 'img', count: 12 }, waitMs: 3000, concurrency: 2 });
    for (const url of tries) {
      const cards = found.get(url) ?? [];
      log(`\n--- ${key} ${url} → ${cards.length} images`);
      for (const c of cards.slice(0, 10)) {
        log(`  alt=${JSON.stringify(c.alt.slice(0, 34))} text=${JSON.stringify(c.text.slice(0, 40))} href=${c.href.slice(0, 44)}`);
        log(`      ${c.src.slice(0, 120)}`);
      }
    }
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
