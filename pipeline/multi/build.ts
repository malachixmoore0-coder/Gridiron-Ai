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
import { gradeLeague, loadLeagueStats, loadRoster, rankDepth, type SportPlayer, type SportRosterFile } from './roster';
import { sourceLog } from '../lib/fetch';

const OUT = path.resolve(__dirname, '../../data/live/sports');
const SIMS = 10_000;
/** How much the market is allowed to pull a projection. */
const MARKET_WEIGHT = 0.35;
/** Only price games this far ahead — a rating snapshot a month out says nothing. */
const HORIZON_DAYS = 12;
/** How far back to read results for the ratings. */
const LOOKBACK_DAYS = 240;
/** Above this many teams, rosters cost more than they are worth. */
const ROSTER_TEAM_CAP = 60;

const readJson = <T>(p: string): T | null => { try { return JSON.parse(fs.readFileSync(p, 'utf8')) as T; } catch { return null; } };
const writeJson = (dir: string, name: string, data: unknown) => {
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, name), JSON.stringify(data));
};

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
  if (!events.length) { console.log('  out of season — nothing to build'); return; }

  // Ratings carry forward from the last run, regressed toward the mean.
  const prevTeams = readJson<SportTeamsFile>(path.join(dir, 'teams.json'));
  const priors = new Map((prevTeams?.teams ?? []).map((t) => [t.id, t.rating]));
  const ratings = buildRatings(events, p, priors);

  const season = new Date(events[events.length - 1].date).getUTCFullYear();
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
      roof: 'outdoors',
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

  // ---- projections, locked at kickoff, never back-filled ------------------
  const prev = readJson<SportPredictionsFile>(path.join(dir, 'predictions.json'));
  const records = new Map((prev?.records ?? []).map((r) => [r.id, r]));
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
  writeJson(dir, 'schedule.json', scheduleFile);
  writeJson(dir, 'predictions.json', predictionsFile);
  console.log(`  ${games.length} games · ${groups.length} days · ${opened} opened · ${locked} locked · ${graded} graded`);

  // ---- rosters, one file per team so the app fetches only what it opens ---
  // A 400-team college league would be four hundred requests and forty
  // megabytes of JSON for a screen almost nobody opens, so rosters are built
  // only where the league is small enough for them to be worth having.
  if (sportTeams.length <= ROSTER_TEAM_CAP) {
    const rosterDir = path.join(dir, 'rosters');
    const leagueStats = await loadLeagueStats(meta.espn!, season);
    const depth = rankDepth(leagueStats);
    const everyone: SportPlayer[] = [];
    const perTeam = new Map<string, SportPlayer[]>();
    for (const t of sportTeams) {
      const players = await loadRoster(meta.espn!, meta.sport, t.espnId, leagueStats, depth).catch(() => []);
      if (!players.length) continue;
      perTeam.set(t.id, players);
      everyone.push(...players);
    }
    // Grades are percentiles within the league, so they are computed once
    // across every roster rather than team by team — a fourth outfielder on a
    // good team is not a starter, and a per-team grade would say he was.
    gradeLeague(everyone, meta.sport);
    for (const [teamId, players] of perTeam) {
      const file: SportRosterFile = {
        teamId, league: meta.key, generatedAt: now.toISOString(), season, players,
      };
      writeJson(rosterDir, `${teamId}.json`, file);
    }
    const withStats = everyone.filter((pl) => pl.stats.length).length;
    console.log(`  ${perTeam.size} rosters · ${everyone.length} players · ${withStats} with a stat line`);
  } else {
    console.log(`  ${sportTeams.length} teams — too many to publish rosters for`);
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
  const ok = sourceLog.filter((s) => s.ok).length;
  console.log(`\n${ok}/${sourceLog.length} sources OK`);
}

main().catch((e) => { console.error(e); process.exitCode = 1; });
