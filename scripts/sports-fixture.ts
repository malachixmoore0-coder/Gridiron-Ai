/**
 * Fixture datasets for the generic leagues.
 *
 *   npx tsx scripts/sports-fixture.ts <out-dir> [league…]
 *
 * ESPN is not reachable from every development environment, and a screen that
 * has never rendered against data is a screen nobody has actually tested. This
 * writes the same three files the real pipeline writes, with invented teams and
 * a plausible schedule, so the app can be exercised end to end offline.
 *
 * It deliberately refuses to write into data/live: fixture numbers must never
 * be mistaken for published ones, and the surest way to guarantee that is to
 * make it impossible.
 */
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { GENERIC_LEAGUES, profileFor, type LeagueMeta } from '../src/sports/types';
import { simulate, seedFor } from '../src/sports/engine';
import type { SportGame, SportGroup, SportPredictionRecord, SportTeam } from '../src/sports/feed';
import { createRng, hashString } from '../src/engine/rng';

const OUT = path.resolve(process.argv[2] ?? '.fixtures/sports');
if (/data[\\/]live/.test(OUT)) {
  console.error('Refusing to write fixtures into data/live — pick another directory.');
  process.exit(1);
}

const want = process.argv.slice(3);
const leagues = want.length ? GENERIC_LEAGUES.filter((l) => want.includes(l.key)) : GENERIC_LEAGUES;

const CITIES = [
  'Ashford', 'Belmont', 'Cedar Falls', 'Dunmore', 'Eastport', 'Fairhaven', 'Granite Bay', 'Harlow',
  'Ironwood', 'Juniper', 'Kingsley', 'Lakemont', 'Marlow', 'Northgate', 'Oakridge', 'Pinehurst',
  'Quarry Hill', 'Redstone', 'Stonebrook', 'Thornbury', 'Underhill', 'Vireo', 'Westmere', 'Yarrow',
];
const NICKS = ['Anchors', 'Bandits', 'Comets', 'Dredgers', 'Embers', 'Foxes', 'Gales', 'Hawks',
  'Ironsides', 'Jackals', 'Kestrels', 'Lancers', 'Mariners', 'Nomads', 'Orcas', 'Pilots',
  'Quakes', 'Ravens', 'Sentinels', 'Tridents', 'Ursids', 'Vipers', 'Wardens', 'Yeomen'];
const HUES = ['#1F6FEB', '#D2382C', '#2E9E5B', '#8A4FCF', '#E08A1E', '#1FA3A3', '#C2286F', '#4A5A6A'];

function teamsFor(meta: LeagueMeta, rng: () => number): SportTeam[] {
  const n = meta.sport === 'soccer' ? 16 : meta.key === 'wnba' ? 12 : 20;
  const groups = meta.sport === 'soccer' ? ['Eastern', 'Western'] : ['North', 'South', 'East', 'West'];
  return Array.from({ length: n }, (_, i) => {
    const city = CITIES[i % CITIES.length];
    const nick = NICKS[(i * 7) % NICKS.length];
    const rating = 1500 + Math.round((rng() - 0.5) * 260);
    return {
      id: `${meta.key}-${i + 1}`,
      espnId: `${9000 + i}`,
      abbr: (city.slice(0, 2) + nick.slice(0, 1)).toUpperCase(),
      name: `${city} ${nick}`,
      short: nick,
      group: groups[i % groups.length],
      colors: { primary: HUES[i % HUES.length], secondary: HUES[(i + 3) % HUES.length] },
      logoUrl: null,
      record: null,
      rank: meta.key === 'mbb' || meta.key === 'wbb' || meta.key === 'cbase' ? (i < 25 ? i + 1 : null) : null,
      rating,
      attack: Math.round((0.88 + rng() * 0.26) * 1000) / 1000,
      defence: Math.round((0.88 + rng() * 0.26) * 1000) / 1000,
      played: 14 + Math.floor(rng() * 20),
    };
  });
}

const BOOKS = [
  { book: 'draftkings', name: 'DraftKings' },
  { book: 'fanduel', name: 'FanDuel' },
  { book: 'betmgm', name: 'BetMGM' },
  { book: 'espnbet', name: 'ESPN BET' },
];

const round = (v: number, step: number) => Math.round(v / step) * step;
const mlOf = (pct: number) => (pct >= 50 ? -Math.round((pct / (100 - pct)) * 100) : Math.round(((100 - pct) / pct) * 100));

for (const meta of leagues) {
  const p = profileFor(meta.key);
  const rng0 = createRng(hashString(meta.key));
  const rng = () => rng0.next();
  const teams = teamsFor(meta, rng);
  const byId = new Map(teams.map((t) => [t.id, t]));
  const now = new Date();
  const season = now.getUTCFullYear();

  const games: SportGame[] = [];
  const records: SportPredictionRecord[] = [];
  const groups: SportGroup[] = [];

  // Seven days behind us as finals, today live, five ahead as upcoming.
  for (let d = -7; d <= 5; d += 1) {
    const day = new Date(now); day.setUTCDate(day.getUTCDate() + d); day.setUTCHours(23, 10, 0, 0);
    const perDay = 3 + Math.floor(rng() * 4);
    const week = d + 8;
    let final = 0; let liveCount = 0;
    for (let g = 0; g < perDay; g += 1) {
      const a = teams[Math.floor(rng() * teams.length)];
      let h = teams[Math.floor(rng() * teams.length)];
      while (h.id === a.id) h = teams[Math.floor(rng() * teams.length)];
      const id = `${meta.key}-g${week}-${g}`;
      const kickoff = new Date(day.getTime() + g * 40 * 60_000).toISOString();

      const res = simulate(
        { home: { id: h.id, rating: h.rating, attack: h.attack, defence: h.defence }, away: { id: a.id, rating: a.rating, attack: a.attack, defence: a.defence } },
        p, 2000, seedFor(h.id, a.id),
      );
      const homeSpread = round(res.spread, p.spreadStep);
      const totalLine = round(res.total, p.spreadStep);
      const status = d < 0 ? 'final' : d === 0 && g === 0 ? 'in_progress' : 'scheduled';
      if (status === 'final') final += 1;
      if (status === 'in_progress') liveCount += 1;

      const homeScore = status === 'scheduled' ? null : Math.round(res.projectedHome + (rng() - 0.5) * p.marginSigma);
      const awayScore = status === 'scheduled' ? null : Math.round(res.projectedAway + (rng() - 0.5) * p.marginSigma);

      games.push({
        id, season, week, gameType: 'regular', kickoff,
        weekday: new Date(kickoff).toLocaleDateString('en-US', { weekday: 'long', timeZone: 'UTC' }),
        awayId: a.id, homeId: h.id, neutralSite: false,
        stadium: `${h.short} Park`, roof: 'outdoors',
        homeSpread, totalLine,
        awayMoneyline: mlOf(res.awayWinPct), homeMoneyline: mlOf(res.homeWinPct),
        drawMoneyline: p.draws ? mlOf(res.drawPct) : null,
        primetime: false, weather: null, weatherHint: null,
        awayScore, homeScore,
        status, statusDetail: status === 'in_progress' ? `${p.periods[1]} · 6:12` : status === 'final' ? 'Final' : null,
        broadcast: null, notes: null,
        awayRank: a.rank, homeRank: h.rank,
        books: BOOKS.map((b, i) => ({
          ...b,
          homeSpread: round(homeSpread + (i - 1.5) * p.spreadStep, p.spreadStep),
          spreadHomeOdds: -110 + (i % 2 ? 5 : -5),
          spreadAwayOdds: -110 - (i % 2 ? 5 : -5),
          totalLine: round(totalLine + (i - 1.5) * p.spreadStep, p.spreadStep),
          overOdds: -108 - i, underOdds: -112 + i,
          homeMoneyline: mlOf(res.homeWinPct) + i * 4,
          awayMoneyline: mlOf(res.awayWinPct) - i * 4,
          updated: now.toISOString(),
        })),
      });

      records.push({
        id, season, week, gameType: 'regular', kickoff,
        awayId: a.id, homeId: h.id, neutralSite: false,
        homeWinPct: Math.round(res.homeWinPct * 10) / 10,
        awayWinPct: Math.round(res.awayWinPct * 10) / 10,
        drawPct: p.draws ? Math.round(res.drawPct * 10) / 10 : undefined,
        projectedHome: Math.round(res.projectedHome * 10) / 10,
        projectedAway: Math.round(res.projectedAway * 10) / 10,
        spread: Math.round(res.spread * 10) / 10,
        total: Math.round(res.total * 10) / 10,
        marketHomeSpread: homeSpread, marketTotal: totalLine,
        predictedAt: kickoff, updates: 2,
        status: status === 'final' ? 'final' : status === 'in_progress' ? 'locked' : 'open',
        lockedAt: status === 'scheduled' ? null : kickoff,
        result: status === 'final' && homeScore != null && awayScore != null ? {
          homeScore, awayScore,
          suCorrect: (homeScore > awayScore) === (res.homeWinPct >= res.awayWinPct),
          ats: homeScore - awayScore + homeSpread === 0 ? 'push' : (homeScore - awayScore + homeSpread > 0) === (res.spread < homeSpread) ? 'win' : 'loss',
          ou: homeScore + awayScore === totalLine ? 'push' : (homeScore + awayScore > totalLine) === (res.total > totalLine) ? 'win' : 'loss',
          brier: 0.2, spreadError: 2.1, totalError: 3.4,
        } : null,
      });
    }
    groups.push({
      week, gameType: 'regular',
      label: new Date(day).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', timeZone: 'UTC' }),
      games: perDay, final, live: liveCount, start: new Date(day).toISOString(),
    });
  }

  // Records come out of the same games, so the tally on the page is real.
  for (const t of teams) {
    let w = 0; let l = 0; let d = 0;
    for (const g of games.filter((x) => x.status === 'final' && (x.homeId === t.id || x.awayId === t.id))) {
      const own = (g.homeId === t.id ? g.homeScore : g.awayScore) ?? 0;
      const opp = (g.homeId === t.id ? g.awayScore : g.homeScore) ?? 0;
      if (own > opp) w += 1; else if (own < opp) l += 1; else d += 1;
    }
    t.record = p.draws ? `${w}-${l}-${d}` : `${w}-${l}`;
  }

  const week = groups[8]?.week ?? groups[0]?.week ?? 1;
  const dir = path.join(OUT, meta.slug);
  fs.mkdirSync(dir, { recursive: true });
  const stamp = now.toISOString();
  fs.writeFileSync(path.join(dir, 'teams.json'), JSON.stringify({ league: meta.key, sport: meta.sport, generatedAt: stamp, season, week, phase: 'regular', teams }));
  fs.writeFileSync(path.join(dir, 'schedule.json'), JSON.stringify({ generatedAt: stamp, season, week, phase: 'regular', weeks: groups, games }));
  fs.writeFileSync(path.join(dir, 'predictions.json'), JSON.stringify({
    generatedAt: stamp, season,
    model: { simulations: 10_000, homeEdge: p.homeEdge, marketWeight: 0.35, note: 'FIXTURE DATA — not a published projection' },
    records,
  }));
  console.log(`${meta.short}: ${teams.length} teams · ${games.length} games · ${records.length} records → ${dir}`);
}
