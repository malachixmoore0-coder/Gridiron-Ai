/**
 * Turning a venue's city into coordinates, so eighteen leagues can have a
 * forecast without anybody maintaining a table of stadium coordinates.
 *
 * The football build knows exactly where every stadium is because thirty-two
 * and a hundred-and-thirty-odd of them are curated by hand. That does not scale
 * to the Premier League, Liga MX, the MLB and everything else at once, and a
 * hand-kept list of two hundred grounds is a list that goes stale the first time
 * a club moves.
 *
 * So the city comes off ESPN's own scoreboard and Open-Meteo's geocoder — free,
 * keyless, same provider as the forecast — turns it into a point. City-level
 * accuracy is the right resolution anyway: a weather model's grid is coarser
 * than the distance from a city centre to its ground, so a more precise input
 * would not produce a more precise answer.
 *
 * Results are cached to disk and committed, so a build geocodes a city once
 * ever rather than once a day. The cache is the only reason this is a handful
 * of requests per build instead of a few hundred.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fetchJson } from '../lib/fetch';

export interface Point { lat: number; lng: number }

const CACHE = path.resolve(__dirname, '../../data/live/geocode.json');

type Cache = Record<string, Point | null>;

let cache: Cache | null = null;

function load(): Cache {
  if (cache) return cache;
  try { cache = JSON.parse(fs.readFileSync(CACHE, 'utf8')) as Cache; }
  catch { cache = {}; }
  return cache;
}

export function saveGeocache(): void {
  if (!cache) return;
  fs.mkdirSync(path.dirname(CACHE), { recursive: true });
  // Sorted so the committed file has a stable diff instead of a reshuffle.
  const sorted = Object.fromEntries(Object.entries(cache).sort(([a], [b]) => a.localeCompare(b)));
  fs.writeFileSync(CACHE, JSON.stringify(sorted, null, 1));
}

const key = (place: string) => place.trim().toLowerCase();

/**
 * Coordinates for a place name, or null.
 *
 * A miss and a failure are not the same thing, and the first version of this
 * cached them the same way — on the reasoning that a city the geocoder cannot
 * find today it will not find tomorrow either. That is true of a name the
 * geocoder genuinely does not know. It is not true of a request that never got
 * an answer, and the first real run proved it: Berlin, Hamburg and Athens all
 * came back empty and were then cached as permanently unfindable, which is
 * plainly a rate limit rather than a gap in the world's gazetteer.
 *
 * So only an actual answer of "no results" is cached. A failed request returns
 * null for this build and is asked again on the next one.
 */
export async function geocode(place: string): Promise<Point | null> {
  const name = place.trim();
  if (!name) return null;
  const c = load();
  const k = key(name);
  if (k in c) return c[k];

  // The geocoder wants a bare place name; "Chicago, Illinois" finds nothing
  // where "Chicago" finds it immediately, so the qualifier is used to choose
  // between results rather than to search with.
  const [city, region] = name.split(',').map((x) => x.trim());
  // Hyphens are how "Newcastle-upon-Tyne" is written on a scoreboard and not
  // how it is indexed in a gazetteer.
  const query = city.replace(/-/g, ' ').trim();
  const url = `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(query)}&count=10&language=en&format=json`;

  type Row = { latitude: number; longitude: number; admin1?: string; country?: string };
  let data: { results?: Row[] } | null = null;
  let answered = false;
  // Two tries with a pause between them: a free keyless API rate-limits a burst
  // of a hundred and thirty cities, and the pause is cheaper than the miss.
  for (let attempt = 0; attempt < 2 && !answered; attempt += 1) {
    if (attempt) await new Promise((r) => setTimeout(r, 1200));
    try {
      data = await fetchJson<{ results?: Row[] }>(url, `Geocode ${name}`, 10_000);
      answered = true;
    } catch { /* try once more, then give up without caching */ }
  }
  if (!answered) return null;

  const results = data?.results ?? [];
  const wanted = region?.toLowerCase();
  const hit = (wanted && results.find((r) => r.admin1?.toLowerCase() === wanted || r.country?.toLowerCase() === wanted))
    ?? results[0]
    ?? null;

  c[k] = hit ? { lat: hit.latitude, lng: hit.longitude } : null;
  return c[k];
}
