/**
 * The multi-sport build.
 *
 *   npm run data:sports            # every generic league
 *   npm run data:sports -- nba mlb # just these
 *
 * For each league it reads ESPN once, builds Elo off the finished games,
 * projects every upcoming game through the shared engine, grades anything that
 * has finished since the last run, and writes three files the app already knows
 * how to read.
 *
 * Predictions follow the same law as the football side, and it is the one thing
 * here worth being pedantic about: a projection is written before kickoff,
 * frozen the moment the ball is in play, and never back-filled. A game first
 * seen after it started is not scored at all.
 */
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { GENERIC_LEAGUES, profileFor, type LeagueMeta } from '../../src/sports/types';
import type { SportGame, SportGroup, SportPredictionRecord, SportPredictionsFile, SportScheduleFile, SportTeam, SportTeamsFile } from '../../src/sports/feed';
import { loadRange, loadTeams, type EspnEvent } from './espn';
import { buildRatings } from './ratings';
import { simulate, seedFor } from '../../src/sports/engine';
import { liveWinProbability } from '../../src/sports/live';
import { loadEventBooks } from '../sources/books';
import { applyStats, gradeLeague, loadAthleteStats, loadLeagueStats, loadRoster, rankDepth, unitOf, type SportPlayer, type SportRosterFile } from './roster';
import { backfillHeadshots, readCache, writeCache } from './headshots';
import { geocode, saveGeocache } from './geocode';
import { archiveHours, forecastAt } from '../sources/weather';
import { applyArchive, hasObservation, noteForecast, readWeather, writeWeather, type LogGame } from './weatherLog';
import { backfillFromSchools, nameKey, readAthletics, supportsAthletics, writeAthletics, type SchoolPlayer } from './athletics';
import { closeBrowser } from './render';
import { readLines, recordLines, writeLines } from './lines';
import { leagueEraOf, loadEraIndex, pitcherFactor, type ProbableArm } from './pitchers';
import { computeParkFactors } from './parks';
import { sourceLog } from '../lib/fetch';

const OUT = path.resolve(__dirname, '../../data/live/sports');
const SIMS = 10_000;
/** How much the market is allowed to pull a projection. */
const MARKET_WEIGHT = 0.35;

/**
 * Park factors are measured and published every run; this decides whether a
 * projection is allowed to use them. It is off, and that is a result rather than
 * an oversight.
 *
 * Run `npm run parks:check`. Walking forward through 1,686 MLB games -- fitting
 * the factors only on games already played, which is the only fair way to ask --
 * applying them moves total MAE by +0.13%. Wrong direction, and far inside the
 * noise. Sweeping the shrinkage and keeping whichever value scored best on the
 * very games it was scored against, which is cheating and still the friendliest
 * possible test, picks zero: no park term at all.
 *
 * The effect itself is not in doubt. The measurement is: a season is about ninety
 * home dates and runs per game has a standard deviation near five, so two thirds
 * of the spread across thirty parks is sampling noise, and shrinking by the two
 * thirds that is noise leaves too little to beat doing nothing.
 *
 * Two things would change the answer, and the file is written on every run so
 * both stay open. A second season roughly halves the noise. Better, closing
 * lines price parks correctly and a line is a far quieter measurement than a
 * realised score -- once enough games carry one, the park effect can be read off
 * the market instead of off the scoreboard. Flip this to true when
 * `npm run parks:check` earns it, not before.
 */
const APPLY_PARKS = false;
/** Only price games this far ahead — a rating snapshot a month out says nothing. */
/**
 * How far ahead a forecast is worth fetching.
 *
 * Open-Meteo will answer fifteen days out and the answer is close to
 * worthless — a weather model has little skill past about a week, and nobody is
 * pricing a Tuesday game on next Saturday's rain. Four days covers everything
 * on the board that anyone is actually looking at, and it is the difference
 * between a few dozen requests per league per build and a few hundred.
 */
const WEATHER_DAYS = 4;
/** Forecasts in flight at once. Polite to a free, keyless API; fast enough. */
const WEATHER_CONCURRENCY = 6;
/**
 * Venues to ask the weather archive about per run. Thirty covers a baseball
 * season in one go; the leagues with hundreds of grounds fill in over a few
 * runs instead of holding up a build.
 */
const ARCHIVE_VENUES_PER_RUN = 60;

const HORIZON_DAYS = 12;
/** How far back to read results for the ratings. */
const LOOKBACK_DAYS = 240;
/** How many team rosters to fetch at once. Polite, and still fast enough. */
const ROSTER_CONCURRENCY = 6;
/** How many unknown headshots one run is allowed to chase, per league. */
const HEADSHOT_BUDGET = Number(process.env.HEADSHOT_BUDGET ?? 1200);
/** How many school roster pages one run is allowed to read, per league. */
const ATHLETICS_BUDGET = Number(process.env.ATHLETICS_BUDGET ?? 80);

const readJson = <T>(p: string): T | null => { try { return JSON.parse(fs.readFileSync(p, 'utf8')) as T; } catch { return null; } };
const writeJson = (dir: string, name: string, data: unknown) => {
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, name), JSON.stringify(data));
};

/** A player as the school publishes him, in the shape the app already reads. */
const fromSchool = (p: SchoolPlayer): SportPlayer => ({
  id: p.id,
  name: p.name,
  short: p.name,
  jersey: p.jersey,
  pos: p.pos || '—',
  unit: unitOf('baseball', p.pos),
  headshotUrl: p.photo,
  height: null, weight: null, age: null, experience: null,
  college: null, birthplace: null, flagUrl: null,
  status: null, injury: null, line: null,
  // A school page carries no season line, and inventing one would be worse
  // than the blank the app already knows how to render.
  stats: [], rating: null, ratingBasis: 'roster',
});

const dayKey = (iso: string) => iso.slice(0, 10);
const label = (iso: string) =>
  new Date(iso).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', timeZone: 'UTC' });

/** Brier score for a two- or three-way market. */
const brierOf = (p: number, hit: boolean) => (p / 100 - (hit ? 1 : 0)) ** 2;

function gradeRecord(rec: SportPredictionRecord, home: number, away: number): SportPredictionRecord['result'] {
  const margin = home - away;
  const suCorrect = margin === 0
    ? (rec.drawPct ?? 0) >= Math.max(rec.homeWinPct, rec.awayWinPct)
    : margin > 0 ? rec.homeWinPct >= rec.awayWinPct : rec.awayWinPct > rec.homeWinPct;

  let ats: 'win' | 'loss' | 'push' | null = null;
  if (rec.marketHomeSpread != null) {
    const adj = margin + rec.marketHomeSpread;
    const modelLikesHome = rec.spread < rec.marketHomeSpread;
    ats = adj === 0 ? 'push' : (adj > 0) === modelLikesHome ? 'win' : 'loss';
  }
  let ou: 'win' | 'loss' | 'push' | null = null;
  if (rec.marketTotal != null) {
    const total = home + away;
    const modelOver = rec.total > rec.marketTotal;
    ou = total === rec.marketTotal ? 'push' : (total > rec.marketTotal) === modelOver ? 'win' : 'loss';
  }
  const favPct = Math.max(rec.homeWinPct, rec.awayWinPct) / 100;
  const favHit = margin === 0 ? false : (margin > 0) === (rec.homeWinPct >= rec.awayWinPct);
  return {
    homeScore: home, awayScore: away, suCorrect, ats, ou,
    brier: brierOf(favPct * 100, favHit),
    spreadError: (rec.spread) - (-margin),
    totalError: rec.total - (home + away),
  };
}

/** Leagues that should have had games and did not. A build with any is a failed build. */
const silentlyEmpty: string[] = [];

/**
 * Whether a league is inside its own season window today.
 *
 * `months` is [start, end] and wraps the new year: the NHL's [10, 6] is October
 * through June. Liga MX's [1, 12] is every month there is, and an earlier
 * version of this added a month of slack at each end — which turned a
 * year-round window inside out and reported the league as permanently out of
 * season. No slack now: the window is taken exactly as written, which costs at
 * most one noisy day at a season's true edge and never mistakes a whole league
 * for a dormant one.
 */
function inSeason(meta: LeagueMeta, now = new Date()): boolean {
  const [from, to] = meta.months;
  const spanned = from <= to ? to - from + 1 : 12 - from + 1 + to;
  if (spanned >= 12) return true;
  const m = now.getUTCMonth() + 1;
  return from <= to ? m >= from && m <= to : m >= from || m <= to;
}

async function buildLeague(meta: LeagueMeta): Promise<void> {
  const p = profileFor(meta.key);
  const dir = path.join(OUT, meta.slug);
  const now = new Date();
  console.log(`\n${meta.name} (${meta.espn})`);

  const teams = await loadTeams(meta.espn as string);
  if (!teams.length) { console.log('  no teams — skipping'); return; }

  const from = new Date(now); from.setUTCDate(from.getUTCDate() - LOOKBACK_DAYS);
  const to = new Date(now); to.setUTCDate(to.getUTCDate() + HORIZON_DAYS + 8);
  const range = await loadRange(meta.espn as string, from, to);
  const events = range.events;
  console.log(`  ${teams.length} teams · ${events.length} events${range.failed ? ` · ${range.failed}/${range.chunks} scoreboard reads FAILED` : ''}`);

  // Ratings carry forward from the last run, regressed toward the mean.
  const prevTeams = readJson<SportTeamsFile>(path.join(dir, 'teams.json'));
  const priors = new Map((prevTeams?.teams ?? []).map((t) => [t.id, t.rating]));
  const ratings = buildRatings(events, p, priors);

  const season = events.length
    ? new Date(events[events.length - 1].date).getUTCFullYear()
    : (prevTeams?.season ?? now.getUTCFullYear());
  const byId = new Map(teams.map((t) => [t.id, t]));
  const rankOf = new Map<string, number>();
  for (const e of events) {
    if (e.homeRank && e.homeRank <= 25) rankOf.set(e.homeId, e.homeRank);
    if (e.awayRank && e.awayRank <= 25) rankOf.set(e.awayId, e.awayRank);
  }

  const sportTeams: SportTeam[] = teams.map((t) => {
    const r = ratings.get(t.id);
    return {
      id: t.id, espnId: t.id, abbr: t.abbr, name: t.name, short: t.short, group: t.group,
      colors: t.colors, logoUrl: t.logoUrl, record: t.record,
      rank: rankOf.get(t.id) ?? null,
      rating: Math.round((r?.rating ?? 1500) * 10) / 10,
      attack: Math.round((r?.attack ?? 1) * 1000) / 1000,
      defence: Math.round((r?.defence ?? 1) * 1000) / 1000,
      played: r?.played ?? 0,
    };
  });

  // ---- schedule, grouped the way the sport is actually followed -----------
  const days = [...new Set(events.map((e) => dayKey(e.date)))].sort();
  const dayIndex = new Map(days.map((d, i) => [d, i + 1]));

  /**
   * Kick-off weather, for the sports it can actually reach.
   *
   * Indoors is skipped on ESPN's own roof flag rather than a guess, and the
   * whole step is skipped for basketball and hockey, so a forecast is never
   * fetched for a game played under a roof. The city is geocoded once ever and
   * cached, which is what keeps this a few calls per build rather than one per
   * game per day.
   */
  const games: SportGame[] = events
    .filter((e) => byId.has(e.homeId) && byId.has(e.awayId))
    .map((e) => ({
      id: e.id,
      season,
      week: dayIndex.get(dayKey(e.date)) ?? 1,
      gameType: 'regular',
      kickoff: e.date,
      weekday: new Date(e.date).toLocaleDateString('en-US', { weekday: 'long', timeZone: 'UTC' }),
      awayId: e.awayId,
      homeId: e.homeId,
      neutralSite: e.neutral,
      stadium: e.venue,
      roof: e.venueIndoor ? 'dome' : 'outdoors',
      homeSpread: e.homeSpread,
      totalLine: e.totalLine,
      awayMoneyline: e.awayMoneyline,
      homeMoneyline: e.homeMoneyline,
      drawMoneyline: e.drawMoneyline,
      primetime: false,
      weather: null,
      weatherHint: null,
      homeProbable: e.homeProbable,
      awayProbable: e.awayProbable,
      period: e.period,
      clockSeconds: e.clockSeconds,
      bottomHalf: e.bottomHalf,
      awayScore: e.awayScore,
      homeScore: e.homeScore,
      status: e.status,
      statusDetail: e.detail,
      broadcast: e.broadcast,
      notes: e.note,
      awayRank: e.awayRank,
      homeRank: e.homeRank,
      books: null,
    }));

  // ---- kick-off weather, for the sports it can reach ----------------------
  if (p.outdoor && !process.argv.includes('--no-weather')) {
    const cityOf = new Map(events.map((e) => [e.id, e.venueCity]));
    const wxLog = readWeather(dir, meta.key);
    const upcoming = games.filter((g) =>
      g.status === 'scheduled'
      && g.roof !== 'dome'
      && !!cityOf.get(g.id)
      && Date.parse(g.kickoff) - Date.now() < WEATHER_DAYS * 86_400_000
      && Date.parse(g.kickoff) > Date.now() - 3 * 3_600_000);

    // The cities first, one at a time and once ever, so the geocoder is never
    // asked the same question twice and never asked in parallel.
    const points = new Map<string, { lat: number; lng: number } | null>();
    for (const city of new Set(upcoming.map((g) => cityOf.get(g.id)!))) {
      points.set(city, await geocode(city));
    }
    saveGeocache();

    // Then the forecasts, a few at a time. Sequentially this was the slowest
    // step in the whole build by an order of magnitude — a hundred and fifty
    // round trips at a couple of hundred milliseconds each, every day, for
    // numbers nobody looks at until the week of.
    let got = 0;
    for (let i = 0; i < upcoming.length; i += WEATHER_CONCURRENCY) {
      const batch = upcoming.slice(i, i + WEATHER_CONCURRENCY);
      const wxs = await Promise.all(batch.map((g) => {
        const at = points.get(cityOf.get(g.id)!);
        return at ? forecastAt(at.lat, at.lng, g.kickoff) : Promise.resolve(null);
      }));
      batch.forEach((g, j) => {
        const wx = wxs[j];
        if (!wx) return;
        g.weather = wx;
        g.weatherHint = wx.summary;
        // Written down as well as used. The forecast a projection was built on
        // is worth keeping even after it is superseded by what happened.
        noteForecast(wxLog, g, wx);
        got += 1;
      });
    }
    console.log(`  weather on ${got}/${upcoming.length} upcoming ${meta.short} games`);

    /*
     * ---- and what the weather actually was ---------------------------------
     * One archive call per venue, covering every game there still unsettled, so
     * a season costs thirty requests rather than three thousand. The archive
     * trails real time by a few days; games inside that lag simply stay
     * unresolved and are picked up by a later run, which is why this asks only
     * for games it does not already have an observation for.
     */
    const pending = games.filter((g) =>
      g.roof !== 'dome'
      && !!cityOf.get(g.id)
      && g.homeScore != null
      && !hasObservation(wxLog, g.id));

    const byCity = new Map<string, LogGame[]>();
    for (const g of pending) {
      const city = cityOf.get(g.id)!;
      const list = byCity.get(city) ?? [];
      list.push({ id: g.id, kickoff: g.kickoff, homeId: g.homeId, awayId: g.awayId });
      byCity.set(city, list);
    }

    // Capped per run. College baseball has hundreds of venues, and a first run
    // that tried them all would turn a five-minute build into an afternoon.
    let settled = 0, asked = 0;
    for (const [city, list] of [...byCity.entries()].sort((a, b) => b[1].length - a[1].length)) {
      if (asked >= ARCHIVE_VENUES_PER_RUN) break;
      const at = points.get(city) ?? await geocode(city);
      points.set(city, at);
      if (!at) continue;
      const days = list.map((g) => g.kickoff.slice(0, 10)).sort();
      asked += 1;
      const hours = await archiveHours(at.lat, at.lng, days[0], days[days.length - 1]);
      if (!hours.size) continue;
      settled += applyArchive(wxLog, list, hours);
    }
    saveGeocache();
    writeWeather(dir, wxLog);
    const observed = Object.values(wxLog.games).filter((w) => w.source === 'observed').length;
    if (pending.length || settled) {
      console.log(`  weather history: +${settled} observed from ${asked} venue${asked === 1 ? '' : 's'} · ${observed} games on file · ${pending.length - settled} still unsettled`);
    }
  }

  const groups: SportGroup[] = days.map((d, i) => {
    const list = games.filter((g) => dayKey(g.kickoff) === d);
    return {
      week: i + 1,
      gameType: 'regular',
      label: label(`${d}T12:00:00Z`),
      games: list.length,
      final: list.filter((g) => g.status === 'final').length,
      live: list.filter((g) => g.status === 'in_progress').length,
      start: `${d}T00:00:00Z`,
    };
  }).filter((g) => g.games > 0);

  const today = dayKey(now.toISOString());
  const currentWeek = dayIndex.get(today) ?? groups.find((g) => g.start.slice(0, 10) >= today)?.week ?? groups[groups.length - 1]?.week ?? 1;

  // ---- per-book prices on the games worth pricing -------------------------
  const soon = games
    .filter((g) => g.status !== 'final' && Date.parse(g.kickoff) > Date.now() - 6 * 3_600_000)
    .sort((a, b) => a.kickoff.localeCompare(b.kickoff))
    .slice(0, 20);
  let booked = 0;
  for (const g of soon) {
    const books = await loadEventBooks(meta.espn!, g.id).catch(() => []);
    if (books.length) { g.books = books; booked += 1; }
  }
  console.log(`  ${booked}/${soon.length} games with per-book prices`);

  // ---- what the number was, every time we looked -------------------------
  // Written before the projections, so a game's opening line is on file from
  // the same run that first priced it.
  {
    const lines = readLines(dir, meta.key);
    const run = recordLines(lines, games.map((g) => ({
      id: g.id, kickoff: g.kickoff, status: g.status,
      homeSpread: g.homeSpread, totalLine: g.totalLine,
      homeMoneyline: g.homeMoneyline, awayMoneyline: g.awayMoneyline,
    })));
    writeLines(dir, lines);
    console.log(`  lines: ${run.tracked} tracked · ${run.opened} opened · ${run.moved} moved · ${run.closed} closed${run.dropped ? ` · ${run.dropped} aged out` : ''}`);
  }

  // ---- how much the building is worth ------------------------------------
  // Measured over the whole season on file, not the games in front of us: a
  // fortnight cannot tell a ballpark from a warm week. Written out so the
  // number stays inspectable, and so it accumulates for the day it is usable.
  const parks = computeParkFactors(games, now.toISOString());
  writeJson(dir, 'parks.json', parks);
  if (parks.reliability > 0) {
    console.log(`  parks: ${Object.keys(parks.factors).length} venues · ${(100 * parks.reliability).toFixed(0)}% of the spread is real · ${parks.rawSpread.toFixed(2)} raw narrowed to ${parks.spread.toFixed(2)}`);
  } else if (parks.games) {
    console.log(`  parks: no venue effect this data can distinguish from noise (${parks.games} games) — every park left at 1.00`);
  }

  // ---- projections, locked at kickoff, never back-filled ------------------
  const prev = readJson<SportPredictionsFile>(path.join(dir, 'predictions.json'));
  // A projection the sport cannot produce is not a projection. Soccer briefly
  // carried 75.9 goals to nil, because a price had been read as a 425-goal
  // handicap and the market pull followed it. Those are dropped rather than
  // kept: an open one is simulated again from the corrected line, and a locked
  // one is better ungraded than graded against a number that was never real.
  const sane = (r: SportPredictionRecord) => r.projectedHome + r.projectedAway <= p.baseTotal * 3;
  const kept = (prev?.records ?? []).filter(sane);
  const dropped = (prev?.records ?? []).length - kept.length;
  if (dropped) console.log(`  dropped ${dropped} projection${dropped === 1 ? '' : 's'} the sport could not have produced`);
  const records = new Map(kept.map((r) => [r.id, r]));
  const teamById = new Map(sportTeams.map((t) => [t.id, t]));

  /*
   * Tonight's arms, and what the league's average one looks like.
   *
   * Only baseball has a starter who decides this much of a game, so only
   * baseball gets the treatment; every other league passes nothing and the
   * engine's pitcher term is inert for them. The ERA on the scoreboard entry
   * wins where there is one, because it covers whoever is actually starting;
   * the roster index fills the gaps, because the league leaderboard only ranks
   * the arms deep enough into the season to be ranked.
   */
  const usesPitchers = p.sport === 'baseball';
  const eraIndex = usesPitchers ? loadEraIndex(path.join(dir, 'rosters'), fs, path) : new Map<string, number>();
  const armOf = (pr: { id: string; name: string; era: number | null } | null | undefined): ProbableArm | null =>
    pr ? { id: pr.id, name: pr.name, era: pr.era ?? eraIndex.get(pr.id) ?? null } : null;
  const allArms = usesPitchers
    ? games.flatMap((g) => [armOf(g.homeProbable), armOf(g.awayProbable)]).filter((a): a is ProbableArm => !!a)
    : [];
  const leagueEra = leagueEraOf(allArms);
  const withEra = allArms.filter((a) => a.era != null).length;
  if (usesPitchers) {
    console.log(`  probables: ${allArms.length} listed · ${withEra} with an ERA · league ${leagueEra.toFixed(2)}`);
  }
  let opened = 0;
  let locked = 0;
  let graded = 0;

  for (const g of games) {
    const home = teamById.get(g.homeId);
    const away = teamById.get(g.awayId);
    if (!home || !away) continue;
    const kickoff = Date.parse(g.kickoff);
    const started = g.status !== 'scheduled' || kickoff <= Date.now();
    const existing = records.get(g.id);

    if (!existing) {
      // Never invent a prediction for a game that has already started.
      if (started) continue;
      if (kickoff - Date.now() > HORIZON_DAYS * 86_400_000) continue;
    }

    if (!existing || existing.status === 'open') {
      if (!started) {
        const res = simulate(
          {
            home: { id: home.id, rating: home.rating, attack: home.attack, defence: home.defence },
            away: { id: away.id, rating: away.rating, attack: away.attack, defence: away.defence },
            neutral: g.neutralSite,
            weather: g.weatherHint,
            homePitcher: usesPitchers ? pitcherFactor(armOf(g.homeProbable), leagueEra) : null,
            awayPitcher: usesPitchers ? pitcherFactor(armOf(g.awayProbable), leagueEra) : null,
            parkFactor: APPLY_PARKS ? parks.factors[g.homeId] ?? null : null,
            tempF: g.weather?.tempF ?? null,
            marketHomeSpread: g.homeSpread,
            marketTotal: g.totalLine,
            marketWeight: MARKET_WEIGHT,
          },
          p, SIMS, seedFor(g.homeId, g.awayId),
        );
        const rec: SportPredictionRecord = {
          id: g.id, season, week: g.week, gameType: g.gameType, kickoff: g.kickoff,
          awayId: g.awayId, homeId: g.homeId, neutralSite: g.neutralSite,
          homeWinPct: Math.round(res.homeWinPct * 10) / 10,
          awayWinPct: Math.round(res.awayWinPct * 10) / 10,
          drawPct: p.draws ? Math.round(res.drawPct * 10) / 10 : undefined,
          projectedHome: Math.round(res.projectedHome * 10) / 10,
          projectedAway: Math.round(res.projectedAway * 10) / 10,
          spread: Math.round(res.spread * 10) / 10,
          total: Math.round(res.total * 10) / 10,
          marketHomeSpread: g.homeSpread,
          marketTotal: g.totalLine,
          marketHomeMoneyline: g.homeMoneyline,
          marketAwayMoneyline: g.awayMoneyline,
          ...(p.draws ? { marketDrawMoneyline: g.drawMoneyline } : {}),
          predictedAt: now.toISOString(),
          updates: (existing?.updates ?? 0) + 1,
          status: 'open',
          lockedAt: null,
          result: null,
        };
        records.set(g.id, rec);
        if (!existing) opened += 1;
      } else if (existing) {
        existing.status = 'locked';
        existing.lockedAt = now.toISOString();
        locked += 1;
      }
    }

    const rec = records.get(g.id);
    if (rec && rec.status !== 'final' && g.status === 'final' && g.homeScore != null && g.awayScore != null) {
      if (rec.status === 'open') { rec.status = 'locked'; rec.lockedAt = rec.lockedAt ?? g.kickoff; }
      rec.result = gradeRecord(rec, g.homeScore, g.awayScore);
      rec.status = 'final';
      graded += 1;
    }
  }

  const teamsFile: SportTeamsFile = {
    league: meta.key, sport: meta.sport, generatedAt: now.toISOString(), season,
    week: currentWeek, phase: 'regular', teams: sportTeams,
  };
  /*
   * ---- games in flight ----------------------------------------------------
   * The pre-game projection is frozen at first pitch and never revisited, which
   * is what makes the graded record honest. This is the other number: what the
   * game is worth right now, given the score and how much of it is left. It is
   * recomputed every run and stored on the game rather than the prediction, so
   * it can never be mistaken for the locked forecast the record is scored on.
   */
  {
    let priced = 0;
    for (const g of games) {
      if (g.status !== 'in_progress' || g.homeScore == null || g.awayScore == null) continue;
      const rec = records.get(g.id);
      // Needs the pre-game scoreline to carry the teams' strength into the live
      // number; without it a trailing good side would look like a trailing poor one.
      if (!rec) continue;
      const live = liveWinProbability(
        {
          period: g.period ?? 1,
          clockSeconds: g.clockSeconds ?? null,
          bottomHalf: g.bottomHalf ?? false,
          homeScore: g.homeScore,
          awayScore: g.awayScore,
        },
        { projectedHome: rec.projectedHome, projectedAway: rec.projectedAway },
        p,
      );
      g.liveHomeWinPct = live.homeWinPct;
      g.liveAwayWinPct = live.awayWinPct;
      if (live.drawPct != null) g.liveDrawPct = live.drawPct;
      g.liveRemaining = Math.round(live.remaining * 1000) / 1000;
      priced += 1;
    }
    if (priced) console.log(`  live: ${priced} game${priced === 1 ? '' : 's'} in flight repriced`);
  }

  const scheduleFile: SportScheduleFile = {
    generatedAt: now.toISOString(), season, week: currentWeek, phase: 'regular', weeks: groups, games,
  };
  const predictionsFile: SportPredictionsFile = {
    generatedAt: now.toISOString(), season,
    model: {
      simulations: SIMS, homeEdge: p.homeEdge, marketWeight: MARKET_WEIGHT,
      note: `${p.model === 'poisson' ? 'Independent Poisson scoring' : 'Normal margin and total'} · Elo from results, ${Math.round(MARKET_WEIGHT * 100)}% market blend`,
    },
    records: [...records.values()].sort((a, b) => a.kickoff.localeCompare(b.kickoff)),
  };

  writeJson(dir, 'teams.json', teamsFile);
  // An empty board must not overwrite a real one — a bad night at ESPN would
  // erase the slate. It is written only when there is something on it, or when
  // there is no board at all yet and the app needs one to render against.
  if (events.length || !fs.existsSync(path.join(dir, 'schedule.json'))) {
    writeJson(dir, 'schedule.json', scheduleFile);
    writeJson(dir, 'predictions.json', predictionsFile);
  }
  /*
   * An empty board is two completely different facts wearing one message.
   *
   * In February the NBA has games and MLB does not, and "out of season" is the
   * truth. But ESPN returning nothing for a league that is mid-season is a
   * broken feed, and this printed the same calm sentence for both, at info
   * level, with a zero exit. Every league went quiet on 15 September and the
   * workflow stayed green three times a day for nine days while the app served
   * a stale board and the prediction ledger — the one instrument that says
   * whether any of this works — stopped recording entirely.
   *
   * The board is still never overwritten by an empty one; that guard was
   * right. What changes is that a league which should have games and does not
   * now fails loudly and takes the build's exit code with it, because a silent
   * failure in the thing that measures you is worse than a noisy one anywhere
   * else.
   */
  if (events.length) {
    console.log(`  ${games.length} games · ${groups.length} days · ${opened} opened · ${locked} locked · ${graded} graded`);
  } else if (range.failed) {
    // The feed refused. Whatever the calendar says, this is a broken read.
    console.error(`  NO GAMES for ${meta.short} — ${range.failed} of ${range.chunks} scoreboard reads failed. Board left as it was.`);
    silentlyEmpty.push(`${meta.short} (feed)`);
  } else if (inSeason(meta)) {
    console.error(`  NO GAMES for ${meta.short}, which is in season and whose feed answered. Board left as it was.`);
    silentlyEmpty.push(`${meta.short} (in season)`);
  } else {
    console.log('  out of season — teams published, board left as it was');
  }

  // ---- rosters, one file per team so the app fetches only what it opens ---
  // Every league gets them, college included. Four hundred sequential requests
  // is the reason this used to be capped; a small amount of concurrency turns
  // that into about a minute, and the app still only ever downloads the one
  // team someone opened.
  {
    const rosterDir = path.join(dir, 'rosters');
    const { stats: leagueStats, source: statsSource } = await loadLeagueStats(meta.espn!, meta.sport, season);
    const depth = rankDepth(leagueStats);
    let everyone: SportPlayer[] = [];
    const perTeam = new Map<string, SportPlayer[]>();

    for (let i = 0; i < sportTeams.length; i += ROSTER_CONCURRENCY) {
      const batch = sportTeams.slice(i, i + ROSTER_CONCURRENCY);
      const results = await Promise.all(batch.map((t) =>
        loadRoster(meta.espn!, meta.sport, t.espnId, leagueStats, depth).catch(() => [] as SportPlayer[])));
      batch.forEach((t, j) => {
        const players = results[j];
        if (!players.length) return;
        perTeam.set(t.id, players);
        everyone.push(...players);
      });
    }

    // Soccer has no league-wide statistics feed, so its numbers are collected
    // one athlete at a time from the core API — but only for players who are
    // actually on a published roster, which keeps it to the squads rather than
    // every registered professional.
    let source = statsSource;
    if (source === 'none' && everyone.length) {
      const perAthlete = await loadAthleteStats(meta.espn!, everyone.map((pl) => pl.id), season);
      if (perAthlete.size) {
        source = 'athlete';
        const perDepth = rankDepth(perAthlete);
        applyStats(everyone, meta.sport, perAthlete, perDepth);
      }
    }

    // Players the roster list has no photograph for get looked up one at a
    // time against their own athlete record, which sometimes has the photo the
    // roster does not. Cached, misses included, and rationed per run so a cold
    // seventeen-thousand-player league fills in over days rather than blowing
    // the build budget in one go.
    const cache = readCache(dir);
    const missing = everyone.filter((pl) => !pl.headshotUrl).map((pl) => pl.id);
    if (missing.length) {
      const { asked, found, exhausted } = await backfillHeadshots(meta.espn!, missing, cache, HEADSHOT_BUDGET);
      for (const pl of everyone) {
        const hit = cache.found[pl.id];
        if (!pl.headshotUrl && hit) pl.headshotUrl = hit;
      }
      const still = everyone.filter((pl) => !pl.headshotUrl).length;
      console.log(exhausted && !asked
        ? `  headshots: ${missing.length} missing · this league publishes none, not asking again`
        : `  headshots: ${missing.length} missing · asked ${asked} · found ${found} · ${still} still without one${exhausted ? ' · giving up on this league' : ''}`);
      if (asked) writeCache(dir, cache);
    }

    // The schools publish what ESPN does not.
    //
    // For basketball that is the missing photograph on an otherwise good
    // roster. For college baseball it is the roster itself: ask ESPN for
    // Arizona and it answers with sixty-eight names spanning a decade, no
    // positions, no numbers and no pictures — an all-time athlete index, not a
    // team. Where a school publishes a squad, that squad is the truth.
    //
    // Only the schools in the map, and only a few pages a run: a roster changes
    // a couple of times a season, not three times a day.
    if (supportsAthletics(meta.key)) {
      const school = readAthletics(dir);
      const run = await backfillFromSchools(meta.key, sportTeams, school, ATHLETICS_BUDGET);
      if (run.read) writeAthletics(dir, school);

      let filled = 0;
      let replaced = 0;
      for (const t of sportTeams) {
        const squad = school.teams[t.id]?.players ?? [];
        if (!squad.length) continue;
        if (meta.key === 'cbase') {
          perTeam.set(t.id, squad.map((p) => fromSchool(p)));
          replaced += 1;
        } else {
          const photo = new Map(squad.map((p) => [nameKey(p.name), p.photo]));
          for (const pl of perTeam.get(t.id) ?? []) {
            const hit = photo.get(nameKey(pl.name));
            if (!pl.headshotUrl && hit) { pl.headshotUrl = hit; filled += 1; }
          }
        }
      }
      if (replaced) everyone = [...perTeam.values()].flat();
      console.log(`  schools: read ${run.read} page${run.read === 1 ? '' : 's'} · ${run.answered} answered · ${run.players} players`
        + (replaced ? ` · ${replaced} rosters taken from the school` : '')
        + (filled ? ` · ${filled} photographs filled in` : ''));
    }

    // Grades are percentiles within the league, so they are computed once
    // across every roster rather than team by team — a fourth outfielder on a
    // good team is not a starter, and a per-team grade would say he was.
    gradeLeague(everyone, meta.sport);

    let written = 0;
    for (const [teamId, players] of perTeam) {
      const target = path.join(rosterDir, `${teamId}.json`);
      // Rewriting an unchanged roster would bump generatedAt and produce a diff
      // on every run — a few thousand files a day of pure churn in the history.
      const prev = readJson<SportRosterFile>(target);
      if (prev && JSON.stringify(prev.players) === JSON.stringify(players)) continue;
      const file: SportRosterFile = {
        teamId, league: meta.key, generatedAt: now.toISOString(), season, statsSource: source, players,
      };
      writeJson(rosterDir, `${teamId}.json`, file);
      written += 1;
    }
    const withStats = everyone.filter((pl) => pl.stats.length).length;
    console.log(`  ${perTeam.size} rosters (${written} changed) · ${everyone.length} players · ${withStats} with a stat line (${source})`);
  }
}

async function main() {
  const want = process.argv.slice(2).filter((a) => !a.startsWith('-'));
  const leagues = want.length ? GENERIC_LEAGUES.filter((l) => want.includes(l.key)) : GENERIC_LEAGUES;
  console.log(`Gridiron AI multi-sport build — ${leagues.map((l) => l.short).join(', ')}`);
  for (const l of leagues) {
    try { await buildLeague(l); }
    catch (e) { console.error(`  ${l.short} failed: ${(e as Error).message}`); }
  }
  await closeBrowser();
  const ok = sourceLog.filter((s) => s.ok).length;
  console.log(`\n${ok}/${sourceLog.length} sources OK`);

  /*
   * Name the failures. Every reason was already recorded here and none of it
   * was ever printed, so "6030/7267 sources OK" was the entire account of a
   * feed that had stopped answering — a number nobody can act on, in front of
   * the one fact that would have explained nine days of missing data. Grouped
   * by reason, worst first, because 1200 identical timeouts are one problem.
   */
  const bad = sourceLog.filter((s) => !s.ok);
  if (bad.length) {
    const byReason = new Map<string, { n: number; example: string }>();
    for (const f of bad) {
      const reason = (f.note ?? 'unknown').replace(/\d{8}-\d{8}/g, '<dates>').slice(0, 80);
      const e = byReason.get(reason) ?? { n: 0, example: f.name };
      e.n += 1;
      byReason.set(reason, e);
    }
    console.log(`\n${bad.length} source${bad.length === 1 ? '' : 's'} failed:`);
    for (const [reason, { n, example }] of [...byReason.entries()].sort((a, b) => b[1].n - a[1].n).slice(0, 8)) {
      console.log(`  ${String(n).padStart(5)} x  ${reason}   e.g. ${example}`);
    }
  }
}

main()
  .then(() => {
    if (silentlyEmpty.length) {
      console.error(`\nFAILED: ${silentlyEmpty.length} in-season league(s) returned no games — ${silentlyEmpty.join(', ')}.`);
      console.error('Nothing was overwritten, but nothing was recorded either. The feed needs looking at.');
      process.exitCode = 1;
    }
  })
  .catch((e) => { console.error(e); process.exitCode = 1; });
