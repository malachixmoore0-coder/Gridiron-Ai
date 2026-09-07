/**
 * Finding the players ESPN's roster list has no photograph for.
 *
 * A roster entry carries a headshot when ESPN has one indexed against the team.
 * For a lot of leagues — college baseball most of all — it simply does not,
 * and a page of grey discs is the result. The athlete's own record is a
 * separate document, and it sometimes has the photo the roster list lacks, so
 * this asks for it.
 *
 * The cost is one request per player without a photo, which for a
 * seventeen-thousand-player league is far too much to repeat three times a day.
 * So the answers are cached — including the misses, which matter just as much,
 * since "checked, nothing there" is what stops the next run asking again — and
 * each run only works through a slice of whoever is still unknown. A cold
 * league fills in over a few days and then costs nothing.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fetchJson } from '../lib/fetch';

const CORE = 'https://sports.core.api.espn.com/v2/sports';
/** Asked this many times with nothing to show, a league is written off. */
const GIVE_UP_AFTER = 400;

export interface HeadshotCache {
  generatedAt: string;
  /** athlete id → url, or null for "asked, ESPN has none". */
  found: Record<string, string | null>;
  /**
   * Set once a league has been asked enough to conclude it has no photographs
   * at all. College baseball answered a thousand times with nothing, and a
   * thousand requests a run to be told the same is worse than useless.
   */
  exhausted?: boolean;
}

const empty = (): HeadshotCache => ({ generatedAt: new Date().toISOString(), found: {} });

export function readCache(dir: string): HeadshotCache {
  try {
    const raw = JSON.parse(fs.readFileSync(path.join(dir, 'headshots.json'), 'utf8')) as HeadshotCache;
    return raw?.found ? raw : empty();
  } catch { return empty(); }
}

export function writeCache(dir: string, cache: HeadshotCache): void {
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'headshots.json'), JSON.stringify({ ...cache, generatedAt: new Date().toISOString() }));
}

const str = (v: unknown): string | null => (typeof v === 'string' && v.trim() ? v.trim() : null);

/**
 * Look up the athletes we have never asked about, up to a budget.
 *
 * Returns how many were asked and how many turned up a photograph, so the
 * build log says plainly whether this is worth its requests for a league.
 */
export async function backfillHeadshots(
  espnPath: string,
  ids: string[],
  cache: HeadshotCache,
  budget: number,
  concurrency = 8,
): Promise<{ asked: number; found: number; exhausted: boolean }> {
  if (cache.exhausted) return { asked: 0, found: 0, exhausted: true };

  const [sport, league] = espnPath.split('/');
  const unknown = ids.filter((id) => !(id in cache.found)).slice(0, budget);
  let found = 0;

  for (let i = 0; i < unknown.length; i += concurrency) {
    const batch = unknown.slice(i, i + concurrency);
    const rows = await Promise.all(batch.map((id) =>
      fetchJson<any>(`${CORE}/${sport}/leagues/${league}/athletes/${id}`, `${espnPath} athlete ${id}`, 12000)
        .catch(() => null)));
    batch.forEach((id, j) => {
      const href = str(rows[j]?.headshot?.href);
      cache.found[id] = href;
      if (href) found += 1;
    });
  }

  // A league that has been asked this many times and produced nothing is not
  // holding out on us. Stop asking.
  const asked = Object.keys(cache.found).length;
  if (found === 0 && asked >= GIVE_UP_AFTER && !Object.values(cache.found).some(Boolean)) {
    cache.exhausted = true;
  }

  return { asked: unknown.length, found, exhausted: !!cache.exhausted };
}
