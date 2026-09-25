/**
 * What the weather is actually worth, and whether any side handles it better.
 *
 * The engine has carried a table of weather multipliers since it was written --
 * cold 0.95, rain 0.94, snow 0.88, wind nothing at all on the total -- and not
 * one of those numbers had ever been checked against a game, because until the
 * weather log existed there was no record of the conditions in any game already
 * played. They are plausible. That is all they were.
 *
 * Two things are measured here, and they are very different in how much they can
 * be trusted.
 *
 * The league effect, first: how much scoring moves in each kind of weather,
 * across everybody. Hundreds of games land in the common buckets, so this is
 * measurable and is the number worth acting on.
 *
 * Then the per-side effect: whether a particular team scores better in the cold
 * than its own norm, beyond however the whole league moves in the cold. This is
 * the one people want and the one the data is worst at supporting -- ninety-odd
 * games a season split across weather buckets leaves single figures per team, and
 * single figures cannot distinguish a cold-weather club from a club that had a
 * good April. It is measured anyway, shrunk by a reliability estimated from the
 * data, and reported with its sample size attached so nobody reads eight games as
 * a tendency.
 *
 * Everything is measured against the venue's own average rather than the
 * league's. Cold games are not spread evenly -- they happen in April and
 * September in northern cities, which are also the parks that suppress scoring
 * anyway. Comparing a cold game in Detroit to the league mean would credit the
 * cold with the ballpark. Comparing it to other games in Detroit does not.
 */
import type { Weather } from '../../src/engine/types';

/** Only observations. A forecast that said a 60% chance is not evidence of rain. */
export interface ObservedGame {
  homeId: string;
  awayId: string;
  homeScore: number;
  awayScore: number;
  summary: Weather;
}

export interface LeagueEffect {
  bucket: Weather;
  games: number;
  /** Runs above or below what this venue usually sees, in this weather. */
  delta: number;
  /** The same for every other kind of weather, which is what delta is measured against. */
  factor: number;
  t: number;
}

export interface SideEffect {
  teamId: string;
  bucket: Weather;
  games: number;
  /** Raw: this side's shift in this weather, net of the league's shift in it. */
  raw: number;
  /** After shrinking for how little of that is distinguishable from noise. */
  edge: number;
}

export interface WeatherSplits {
  generatedAt: string;
  games: number;
  league: LeagueEffect[];
  /** Reliability of the per-side numbers. Near zero means do not use them. */
  sideReliability: number;
  sides: SideEffect[];
}

const BUCKETS: Weather[] = ['clear', 'cold', 'heat', 'rain', 'wind', 'snow'];
/** Under this there is no bucket, only a handful of games that happened to be cold. */
const MIN_BUCKET = 25;
const MIN_SIDE = 5;

const mean = (a: number[]) => a.reduce((s, x) => s + x, 0) / (a.length || 1);
const variance = (a: number[]) => { const m = mean(a); return mean(a.map((x) => (x - m) ** 2)); };

/** Welch's t for two samples that need not share a variance or a size. */
function welch(a: number[], b: number[]): number {
  if (a.length < 2 || b.length < 2) return 0;
  const va = variance(a) * (a.length / (a.length - 1));
  const vb = variance(b) * (b.length / (b.length - 1));
  const se = Math.sqrt(va / a.length + vb / b.length);
  if (se > 0) return Math.abs(mean(a) - mean(b)) / se;
  /*
   * No spread on either side. If the two means also match there is nothing here,
   * but if they differ this is perfect separation -- the strongest evidence a
   * sample can carry -- and returning 0 for it would read as "no effect" and
   * hide exactly the signal worth finding. Real data never lands here; contrived
   * data does, and so would a bucket where every game finished identically.
   */
  return mean(a) === mean(b) ? 0 : 99;
}

export const emptySplits = (at: string): WeatherSplits =>
  ({ generatedAt: at, games: 0, league: [], sideReliability: 0, sides: [] });

export function computeWeatherSplits(all: ObservedGame[], at: string): WeatherSplits {
  if (all.length < MIN_BUCKET * 2) return emptySplits(at);
  const total = (g: ObservedGame) => g.homeScore + g.awayScore;

  // The venue's own average, so the park is not mistaken for the weather.
  const byVenue = new Map<string, number[]>();
  for (const g of all) byVenue.set(g.homeId, [...(byVenue.get(g.homeId) ?? []), total(g)]);
  const venueMean = new Map([...byVenue].map(([k, v]) => [k, mean(v)]));
  /** How far this game ran above or below normal for where it was played. */
  const excess = (g: ObservedGame) => total(g) - (venueMean.get(g.homeId) ?? mean(all.map(total)));

  const lgMean = mean(all.map(total));

  // ---- the league effect ---------------------------------------------------
  const league: LeagueEffect[] = [];
  const shift = new Map<Weather, number>();
  for (const bucket of BUCKETS) {
    const inB = all.filter((g) => g.summary === bucket);
    const out = all.filter((g) => g.summary !== bucket);
    if (inB.length < MIN_BUCKET || out.length < MIN_BUCKET) continue;
    const d = mean(inB.map(excess)) - mean(out.map(excess));
    shift.set(bucket, d);
    league.push({
      bucket,
      games: inB.length,
      delta: Math.round(d * 100) / 100,
      factor: Math.round((1 + d / lgMean) * 1000) / 1000,
      t: Math.round(welch(inB.map(excess), out.map(excess)) * 100) / 100,
    });
  }

  /*
   * ---- and whether any side is different ----------------------------------
   * A team's games count whether it was home or away: the question is how the
   * side performs in the conditions, not how its ballpark does. The league's own
   * shift in that weather is subtracted, so what is left is the part specific to
   * the team rather than to the weather.
   */
  const raws: SideEffect[] = [];
  const teams = new Set(all.flatMap((g) => [g.homeId, g.awayId]));
  const played = (id: string) => all.filter((g) => g.homeId === id || g.awayId === id);
  for (const id of teams) {
    const mine = played(id);
    for (const bucket of BUCKETS) {
      if (!shift.has(bucket)) continue;
      const inB = mine.filter((g) => g.summary === bucket);
      const out = mine.filter((g) => g.summary !== bucket);
      if (inB.length < MIN_SIDE || out.length < MIN_SIDE) continue;
      const own = mean(inB.map(excess)) - mean(out.map(excess));
      raws.push({ teamId: id, bucket, games: inB.length, raw: Math.round((own - shift.get(bucket)!) * 100) / 100, edge: 0 });
    }
  }

  /*
   * How much of that spread is real. Same reasoning as the park factors: the
   * variance two small sample means would produce on their own is subtracted
   * from the variance actually seen, and what is left is the share worth keeping.
   * With single-figure samples this lands near zero, and it should.
   */
  let sideReliability = 0;
  if (raws.length >= 10) {
    const gameVar = variance(all.map(excess));
    const noise = mean(raws.map((r) => {
      const out = Math.max(1, played(r.teamId).length - r.games);
      return gameVar / r.games + gameVar / out;
    }));
    const observed = variance(raws.map((r) => r.raw));
    sideReliability = observed > 0 ? Math.max(0, Math.min(1, (observed - noise) / observed)) : 0;
  }
  for (const r of raws) r.edge = Math.round(r.raw * sideReliability * 100) / 100;

  return {
    generatedAt: at,
    games: all.length,
    league,
    sideReliability: Math.round(sideReliability * 1000) / 1000,
    sides: raws.sort((a, b) => Math.abs(b.edge) - Math.abs(a.edge)),
  };
}
