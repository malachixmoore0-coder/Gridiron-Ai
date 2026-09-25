/**
 * What the weather was, kept.
 *
 * Until this existed the pipeline forecast the weather for upcoming games, used
 * it in the projection, and then threw it away: every run rebuilds the schedule
 * from ESPN, and a game that has already started is no longer upcoming, so its
 * weather was never written down anywhere. Two thousand eight hundred played
 * baseball games were on file with no record of the conditions in any of them,
 * which makes "how does this team hit in the cold" an unanswerable question no
 * matter how good the model is.
 *
 * So conditions go in a log of their own, keyed by game, in the same spirit as
 * the line history: append what is known, never rewrite what is already there.
 *
 * Two things fill it. A forecast, for a game that has not been played, because
 * that is the number the projection actually used and it should stay auditable.
 * And an observation from Open-Meteo's archive, for games already played, which
 * is what really happened. An observation always beats a forecast and is never
 * overwritten by one — and anything studying how teams perform in weather must
 * read observations only, because a forecast that said a 50% chance of rain is
 * not evidence that it rained.
 */
import fs from 'node:fs';
import path from 'node:path';
import type { Weather } from '../../src/engine/types';
import type { Observation } from '../sources/weather';

export interface WeatherRecord {
  /** 'observed' is what happened; 'forecast' is what was expected. */
  source: 'observed' | 'forecast';
  /** When this was written down. */
  at: string;
  kickoff: string;
  homeId: string;
  awayId: string;
  tempF: number;
  windMph: number;
  /** Inches that fell. Only an observation knows this. */
  precipIn: number | null;
  /** Chance of rain. Only a forecast has one. */
  precipPct: number | null;
  snowIn: number;
  summary: Weather;
}

export interface WeatherFile {
  league: string;
  generatedAt: string;
  games: Record<string, WeatherRecord>;
}

const FILE = 'weather.json';

export const emptyWeather = (league: string): WeatherFile =>
  ({ league, generatedAt: new Date().toISOString(), games: {} });

export function readWeather(dir: string, league: string): WeatherFile {
  try {
    const raw = JSON.parse(fs.readFileSync(path.join(dir, FILE), 'utf8')) as WeatherFile;
    return raw?.games ? raw : emptyWeather(league);
  } catch { return emptyWeather(league); }
}

export function writeWeather(dir: string, file: WeatherFile): void {
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, FILE), JSON.stringify({ ...file, generatedAt: new Date().toISOString() }));
}

/** Games whose conditions are already known for certain, so nobody asks twice. */
export const hasObservation = (file: WeatherFile, id: string): boolean =>
  file.games[id]?.source === 'observed';

export interface LogGame { id: string; kickoff: string; homeId: string; awayId: string }

/**
 * Note a forecast. Kept only while it is the best thing available: an
 * observation for the same game is never downgraded back to a prediction.
 */
export function noteForecast(
  file: WeatherFile,
  g: LogGame,
  wx: { tempF: number; windMph: number; precipPct: number; snowIn: number; summary: Weather },
  at = new Date().toISOString(),
): boolean {
  if (hasObservation(file, g.id)) return false;
  file.games[g.id] = {
    source: 'forecast', at, kickoff: g.kickoff, homeId: g.homeId, awayId: g.awayId,
    tempF: wx.tempF, windMph: wx.windMph, precipIn: null, precipPct: wx.precipPct,
    snowIn: wx.snowIn, summary: wx.summary,
  };
  return true;
}

/** Note what actually happened. This replaces a forecast and settles the game. */
export function noteObservation(
  file: WeatherFile,
  g: LogGame,
  o: Observation,
  at = new Date().toISOString(),
): boolean {
  if (hasObservation(file, g.id)) return false;
  file.games[g.id] = {
    source: 'observed', at, kickoff: g.kickoff, homeId: g.homeId, awayId: g.awayId,
    tempF: o.tempF, windMph: o.windMph, precipIn: o.precipIn, precipPct: null,
    snowIn: o.snowIn, summary: o.summary,
  };
  return true;
}

/** The UTC hour an archive lookup is keyed by. */
export const hourKey = (iso: string): string => new Date(iso).toISOString().slice(0, 13);

/**
 * Match games to a venue's archived hours. Returns how many were settled, so a
 * run that resolves nothing says so instead of looking like it worked.
 */
export function applyArchive(
  file: WeatherFile,
  games: LogGame[],
  hours: Map<string, Observation>,
  at = new Date().toISOString(),
): number {
  let settled = 0;
  for (const g of games) {
    const o = hours.get(hourKey(g.kickoff));
    if (o && noteObservation(file, g, o, at)) settled += 1;
  }
  return settled;
}
