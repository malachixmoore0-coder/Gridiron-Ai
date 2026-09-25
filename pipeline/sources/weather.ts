/**
 * Open-Meteo forecast (free, keyless) for outdoor games inside the forecast
 * window. Best-effort: returns null on any failure.
 */
import { fetchJson } from '../lib/fetch';
import type { Weather } from '../../src/engine/types';
import type { GameWeather } from '../../src/data/liveTypes';
export type { GameWeather };

/**
 * One classifier, used for a forecast and for an archived observation alike.
 *
 * It has to be shared. A forecast knows a chance of rain and an archive knows
 * how much actually fell, and if each side invented its own rule for calling a
 * game "rain" then a study of how a team plays in the rain would be measuring
 * the difference between the two rules as much as the weather. Where real
 * precipitation is known it decides; a probability is only consulted when that
 * is all there is.
 */
export function classify(w: {
  tempF: number; windMph: number; snowIn: number;
  precipIn?: number | null; precipPct?: number | null;
}): Weather {
  const wet = w.precipIn != null ? w.precipIn > 0.01 : (w.precipPct ?? 0) >= 50;
  if (w.snowIn > 0.05) return 'snow';
  if (w.windMph >= 15) return 'wind';
  if (wet) return 'rain';
  if (w.tempF <= 32) return 'cold';
  if (w.tempF >= 88) return 'heat';
  return 'clear';
}

/** What the weather actually was, as opposed to what it was expected to be. */
export interface Observation {
  tempF: number;
  windMph: number;
  /** Inches that fell. The archive knows this; a forecast does not. */
  precipIn: number;
  snowIn: number;
  summary: Weather;
}

/**
 * Observed hourly weather for one place across a span of dates, keyed by the
 * UTC hour ("2026-07-04T19").
 *
 * One call covers a venue's whole season, which is the difference between
 * thirty requests and three thousand. Open-Meteo's archive lags real time by a
 * few days, so the most recent games stay unresolved until it catches up --
 * they are simply absent from the map rather than guessed at.
 */
export async function archiveHours(
  lat: number, lng: number, startDate: string, endDate: string,
): Promise<Map<string, Observation>> {
  const out = new Map<string, Observation>();
  const url = `https://archive-api.open-meteo.com/v1/archive?latitude=${lat}&longitude=${lng}`
    + `&start_date=${startDate}&end_date=${endDate}`
    + '&hourly=temperature_2m,precipitation,wind_speed_10m,snowfall'
    + '&wind_speed_unit=mph&temperature_unit=fahrenheit&precipitation_unit=inch&timezone=UTC';
  const data = await fetchJson<any>(url, `Open-Meteo archive ${lat.toFixed(2)},${lng.toFixed(2)} ${startDate}..${endDate}`, 30_000);
  try {
    const times: string[] = data.hourly.time;
    for (let i = 0; i < times.length; i++) {
      const tempF = Number(data.hourly.temperature_2m[i]);
      const windMph = Number(data.hourly.wind_speed_10m[i]);
      const precipIn = Number(data.hourly.precipitation[i]);
      const snowIn = Number(data.hourly.snowfall[i]);
      // A gap in the archive is a gap, not a zero: a game recorded as 0F and
      // calm because the row was missing would read as an extreme cold game.
      if (![tempF, windMph, precipIn, snowIn].every(Number.isFinite)) continue;
      out.set(times[i].slice(0, 13), { tempF, windMph, precipIn, snowIn, summary: classify({ tempF, windMph, precipIn, snowIn }) });
    }
  } catch {
    return out;
  }
  return out;
}

export async function forecastAt(lat: number, lng: number, kickoffIso: string): Promise<GameWeather | null> {
  const kickoff = new Date(kickoffIso);
  const hoursOut = (kickoff.getTime() - Date.now()) / 3_600_000;
  if (!Number.isFinite(hoursOut) || hoursOut < -3 || hoursOut > 15 * 24) return null;
  const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lng}&hourly=temperature_2m,precipitation_probability,wind_speed_10m,snowfall&forecast_days=16&wind_speed_unit=mph&temperature_unit=fahrenheit&precipitation_unit=inch&timezone=UTC`;
  const data = await fetchJson<any>(url, `Open-Meteo forecast ${lat.toFixed(2)},${lng.toFixed(2)}`, 10_000);
  try {
    const times: string[] = data.hourly.time;
    const target = kickoff.toISOString().slice(0, 13);
    let i = times.findIndex((t) => t.startsWith(target));
    if (i < 0) i = times.length - 1;
    const pick = (k: string) => Number(data.hourly[k][i]);
    const tempF = pick('temperature_2m');
    const windMph = pick('wind_speed_10m');
    const precipPct = pick('precipitation_probability');
    const snowIn = pick('snowfall');
    return { tempF, windMph, precipPct, snowIn, summary: classify({ tempF, windMph, precipPct, snowIn }) };
  } catch {
    return null;
  }
}
