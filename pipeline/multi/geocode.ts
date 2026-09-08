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
 * A null is cached as hard as a hit: a city the geocoder cannot find today it
 * will not find tomorrow either, and re-asking every build is how a
 * best-effort lookup turns into a rate limit.
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
  const url = `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(city)}&count=10&language=en&format=json`;
  const data = await fetchJson<{ results?: { latitude: number; longitude: number; admin1?: string; country?: string }[] }>(
    url, `Geocode ${name}`, 10_000,
  ).catch(() => null);

  const results = data?.results ?? [];
  const wanted = region?.toLowerCase();
  const hit = (wanted && results.find((r) => r.admin1?.toLowerCase() === wanted || r.country?.toLowerCase() === wanted))
    ?? results[0]
    ?? null;

  c[k] = hit ? { lat: hit.latitude, lng: hit.longitude } : null;
  return c[k];
}
