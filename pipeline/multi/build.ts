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
import { loadEventBooks } from '../sources/books';
import { applyStats, gradeLeague, loadAthleteStats, loadLeagueStats, loadRoster, rankDepth, unitOf, type SportPlayer, type SportRosterFile } from './roster';
import { backfillHeadshots, readCache, writeCache } from './headshots';
import { geocode, saveGeocache } from './geocode';
import { forecastAt } from '../sources/weather';
import { backfillFromSchools, nameKey, readAthletics, supportsAthletics, writeAthletics, type SchoolPlayer } from './athletics';
import { closeBrowser } from './render';
import { readLines, recordLines, writeLines } from './lines';
import { sourceLog } from '../lib/fetch';

const OUT = path.resolve(__dirname, '../../data/live/sports');
const SIMS = 10_000;
/** How much the market is allowed to pull a projection. */
const MARKET_WEIGHT = 0.35;
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

async function buildLeague(meta: LeagueMeta): Promise<void> {
  const p = profileFor(meta.key);
  const dir = path.join(OUT, meta.slug);
  const now = new Date();
  console.log(`\n${meta.name} (${meta.espn})`);

  const teams = await loadTeams(meta.espn as string);
  if (!teams.length) { console.log('  no teams — skipping'); return; }

  const from = new Date(now); from.setUTCDate(from.getUTCDate() - LOOKBACK_DAYS);
  const to = new Date(now); to.setUTCDate(to.getUTCDate() + HORIZON_DAYS + 8);
  const events = await loadRange(meta.espn as string, from, to);
  console.log(`  ${teams.length} teams · ${events.length} events`);

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
        got += 1;
      });
    }
    console.log(`  weather on ${got}/${upcoming.length} upcoming ${meta.short} games`);
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
  console.log(events.length
    ? `  ${games.length} games · ${groups.length} days · ${opened} opened · ${locked} locked · ${graded} graded`
    : '  out of season — teams published, board left as it was');

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
}

main().catch((e) => { console.error(e); process.exitCode = 1; });
