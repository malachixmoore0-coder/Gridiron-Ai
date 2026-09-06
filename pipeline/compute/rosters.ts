/**
 * Full rosters → per-team roster files (data/live/rosters/{teamId}.json):
 * every rostered player placed on a string from the official depth chart
 * (nflverse publishes real pos_rank values), graded where there is production
 * to grade, with strengths / weaknesses, usage, current-season game logs and
 * the team's season schedule with results.
 *
 * The engine depth chart (used by the simulation) is cut from these same
 * rankings, so the grade a player shows on his profile is the grade the engine
 * uses.
 */
import type { InjuryStatus, Player, PlayerRole, Position, Team } from '../../src/engine/types';
import type { PlayerGameLog, PlayerTrait, RosterPlayer, RosterPositionLabel, StatLine, TeamRosterFile, TeamScheduleGame } from '../../src/data/liveTypes';
import type { DepthRow, GameRow, GameStat, PlayerAcc, RosterRow, SnapAgg, TeamAcc } from '../sources/nflverse';
import { blendWeight, gamesPlayed, type BuildCtx } from './context';
import { clamp, nameKey, percentile, r2, r3, idFromNv, nvFromId } from '../lib/util';

export const STRING_SIZES: Record<RosterPositionLabel, number> = { QB: 1, RB: 1, WR: 3, TE: 1, OL: 5, EDGE: 2, DT: 2, LB: 3, CB: 2, NCB: 1, S: 2, K: 1, P: 1, LS: 1 };
export const POS_ORDER: RosterPositionLabel[] = ['QB', 'RB', 'WR', 'TE', 'OL', 'EDGE', 'DT', 'LB', 'CB', 'NCB', 'S', 'K', 'P', 'LS'];
const UNIT: Record<RosterPositionLabel, RosterPlayer['unit']> = { QB: 'offense', RB: 'offense', WR: 'offense', TE: 'offense', OL: 'offense', EDGE: 'defense', DT: 'defense', LB: 'defense', CB: 'defense', NCB: 'defense', S: 'defense', K: 'special', P: 'special', LS: 'special' };

/** Roster position → position group. */
export function rosterGroup(r: { position: string; depth_chart_position: string; weight: number }): RosterPositionLabel | null {
  const p = (r.depth_chart_position || r.position || '').toUpperCase();
  switch (p) {
    case 'QB': return 'QB';
    case 'RB': case 'FB': case 'HB': return 'RB';
    case 'WR': return 'WR';
    case 'TE': return 'TE';
    case 'T': case 'OT': case 'LT': case 'RT': case 'G': case 'OG': case 'LG': case 'RG': case 'C': case 'OL': return 'OL';
    case 'DE': case 'EDGE': case 'OLB': case 'LOLB': case 'ROLB': return 'EDGE';
    case 'DT': case 'NT': case 'DL': return 'DT';
    case 'LB': case 'ILB': case 'MLB': case 'LILB': case 'RILB': return 'LB';
    case 'CB': case 'LCB': case 'RCB': return 'CB';
    case 'NB': case 'NCB': return 'NCB';
    case 'S': case 'FS': case 'SS': case 'DB': return 'S';
    case 'K': case 'PK': return 'K';
    case 'P': return 'P';
    case 'LS': return 'LS';
    default: return null;
  }
}

export interface Sums extends Required<StatLine> { games: number; dropbacks: number; recEpa: number; rushEpa: number; passEpa: number; cpoe: number; cpoeN: number; qbHits: number; }
const zeroSums = (): Sums => ({ games: 0, dropbacks: 0, recEpa: 0, rushEpa: 0, passEpa: 0, cpoe: 0, cpoeN: 0, qbHits: 0, passAtt: 0, passCmp: 0, passYds: 0, passTd: 0, passInt: 0, rushAtt: 0, rushYds: 0, rushTd: 0, tgt: 0, rec: 0, recYds: 0, recTd: 0, sacks: 0, int: 0, pbu: 0, ff: 0, fgm: 0, fga: 0, epa: 0 });
const addLine = (t: Sums, l: GameStat) => { for (const k of Object.keys(t) as (keyof Sums)[]) if (k in l) (t as any)[k] += (l as any)[k]; };
export function sumsOf(acc: PlayerAcc | undefined, team?: string): Sums {
  const t = zeroSums();
  if (!acc) return t;
  for (const [, l] of acc.log) { if (team !== undefined && l.team !== team) continue; addLine(t, l); t.games++; }
  t.dropbacks = acc.dropbacks; t.recEpa = acc.recEpa; t.rushEpa = acc.rushEpa; t.passEpa = acc.passEpa; t.cpoe = acc.cpoe; t.cpoeN = acc.cpoeN; t.qbHits = acc.qbHits;
  return t;
}
const merge = (a: Sums, b: Sums): Sums => { const o = zeroSums(); for (const k of Object.keys(o) as (keyof Sums)[]) o[k] = a[k] + b[k]; return o; };
const per = (v: number, n: number) => (n > 0 ? v / n : 0);
/** Published files drop zero counters; the app reads a missing counter as 0. */
const compact = <T extends Record<string, number>>(line: T): T => Object.fromEntries(Object.entries(line).filter(([, v]) => v !== 0)) as T;

function production(pos: RosterPositionLabel, s: Sums, seasons: number): { composite: number | null; statLine: string | null; facets: Record<string, number> } {
  const perSeason = (v: number) => (seasons ? v / seasons : v);
  const f: Record<string, number> = {};
  switch (pos) {
    case 'QB': {
      if (s.dropbacks < 50) return { composite: null, statLine: null, facets: f };
      const epaDb = s.passEpa / s.dropbacks;
      const cpoe = s.cpoeN ? s.cpoe / s.cpoeN : 0;
      f.efficiency = epaDb; f.accuracy = cpoe; f.ballSecurity = -per(s.passInt, s.passAtt); f.bigPlay = per(s.passYds, s.passCmp); f.rushing = per(s.rushYds, s.games); f.scoring = per(s.passTd, s.games);
      return { composite: epaDb + cpoe / 40, statLine: `${r2(epaDb)} EPA/dropback · ${cpoe.toFixed(1)} CPOE · ${s.dropbacks} dropbacks`, facets: f };
    }
    case 'RB': {
      if (s.rushAtt + s.tgt < 40) return { composite: null, statLine: null, facets: f };
      const ypc = per(s.rushYds, s.rushAtt);
      f.ypc = ypc; f.explosive = per(s.rushEpa, s.rushAtt); f.receiving = per(s.tgt, s.games); f.workload = per(s.rushAtt, s.games); f.finishing = per(s.rushTd + s.recTd, s.games);
      return { composite: perSeason(s.rushEpa + s.recEpa) + (ypc - 4.2) * 4, statLine: `${ypc.toFixed(1)} YPC · ${r2(perSeason(s.rushEpa + s.recEpa))} EPA/season`, facets: f };
    }
    case 'WR': case 'TE': {
      if (s.tgt < 15) return { composite: null, statLine: null, facets: f };
      const effShrunk = (s.recEpa + 60 * 0.1) / (s.tgt + 60);
      f.efficiency = s.recEpa / s.tgt; f.ypr = per(s.recYds, s.rec); f.hands = per(s.rec, s.tgt); f.scoring = per(s.recTd, s.games); f.volume = per(s.tgt, s.games);
      return { composite: perSeason(s.recEpa) * 0.6 + effShrunk * 60 * 0.4 + perSeason(s.tgt) * 0.03, statLine: `${r2(s.recEpa / s.tgt)} EPA/target on ${Math.round(perSeason(s.tgt))} tgt/season`, facets: f };
    }
    case 'EDGE': case 'DT': {
      const pressures = s.sacks + s.qbHits * 0.5;
      if (s.games < 3 || pressures === 0) return { composite: null, statLine: null, facets: f };
      f.passRush = per(s.sacks, s.games); f.pressure = per(pressures, s.games); f.disruption = per(s.ff, s.games); f.availability = s.games;
      return { composite: per(pressures, s.games) * 8 + per(s.ff, s.games) * 4, statLine: `${per(s.sacks, s.games).toFixed(2)} sacks/g · ${s.qbHits} QB hits in ${s.games} g`, facets: f };
    }
    case 'LB': {
      if (s.games < 3 || s.sacks + s.pbu + s.int + s.ff === 0) return { composite: null, statLine: null, facets: f };
      f.passRush = per(s.sacks, s.games); f.coverage = per(s.pbu + s.int, s.games); f.disruption = per(s.ff, s.games); f.availability = s.games;
      return { composite: per(s.sacks * 1.2 + s.pbu * 0.8 + s.int * 1.5 + s.ff, s.games) * 10, statLine: `${s.sacks} sacks · ${s.pbu} PBU · ${s.int} INT in ${s.games} g`, facets: f };
    }
    case 'CB': case 'NCB': case 'S': {
      if (s.games < 3 || s.pbu + s.int + s.ff < 2) return { composite: null, statLine: null, facets: f };
      f.ballSkills = per(s.int, s.games); f.breakups = per(s.pbu, s.games); f.turnovers = per(s.int + s.ff, s.games); f.availability = s.games;
      return { composite: per(s.pbu + s.int * 2 + s.ff * 0.5, s.games) * 10, statLine: `${s.pbu} PBU · ${s.int} INT in ${s.games} g`, facets: f };
    }
    case 'K': {
      if (s.fga < 5) return { composite: null, statLine: null, facets: f };
      f.accuracy = s.fgm / s.fga; f.volume = per(s.fga, s.games);
      return { composite: s.fgm / s.fga, statLine: `${s.fgm}/${s.fga} FG`, facets: f };
    }
    default: return { composite: null, statLine: null, facets: f };
  }
}

const FACET_LABEL: Record<string, string> = {
  efficiency: 'Efficiency', accuracy: 'Accuracy', ballSecurity: 'Ball security', bigPlay: 'Yards per completion', rushing: 'Rushing threat', scoring: 'Scoring',
  ypc: 'Yards per carry', explosive: 'Explosive runs', receiving: 'Receiving usage', workload: 'Workload', finishing: 'Finishing',
  ypr: 'Yards per catch', hands: 'Catch rate', volume: 'Target volume',
  passRush: 'Pass rush', pressure: 'Pressure rate', disruption: 'Forced fumbles', availability: 'Availability', coverage: 'Coverage plays',
  ballSkills: 'Interceptions', breakups: 'Pass breakups', turnovers: 'Turnover creation',
};
const FACET_FMT: Record<string, (v: number) => string> = {
  efficiency: (v) => `${r2(v)} EPA`, accuracy: (v) => `${v.toFixed(1)} CPOE`, ballSecurity: (v) => `${(-v * 100).toFixed(1)}% INT rate`, bigPlay: (v) => `${v.toFixed(1)} yds/cmp`, rushing: (v) => `${v.toFixed(0)} rush yds/g`, scoring: (v) => `${v.toFixed(2)} TD/g`,
  ypc: (v) => `${v.toFixed(1)} YPC`, explosive: (v) => `${r2(v)} EPA/carry`, receiving: (v) => `${v.toFixed(1)} tgt/g`, workload: (v) => `${v.toFixed(1)} carries/g`, finishing: (v) => `${v.toFixed(2)} TD/g`,
  ypr: (v) => `${v.toFixed(1)} yds/rec`, hands: (v) => `${Math.round(v * 100)}% caught`, volume: (v) => `${v.toFixed(1)} tgt/g`,
  passRush: (v) => `${v.toFixed(2)} sacks/g`, pressure: (v) => `${v.toFixed(2)} pressures/g`, disruption: (v) => `${v.toFixed(2)} FF/g`, availability: (v) => `${v} games`, coverage: (v) => `${v.toFixed(2)} PBU+INT/g`,
  ballSkills: (v) => `${v.toFixed(2)} INT/g`, breakups: (v) => `${v.toFixed(2)} PBU/g`, turnovers: (v) => `${v.toFixed(2)} takeaways/g`,
};

export interface RankedPlayer {
  teamId: string; nv: string; gsisId: string; roster: RosterRow; pos: RosterPositionLabel;
  rank: number; string: number; s: Sums; cur: Sums; prior: Sums;
  composite: number | null; statLine: string | null; usage: RosterPlayer['usage'];
  rating: number; ratingBasis: RosterPlayer['ratingBasis']; role: RosterPlayer['role']; facets: Record<string, number>;
  snapMeasured: number | null;
}

function usageScore(pos: RosterPositionLabel, cur: Sums, prior: Sums): number {
  const u = (x: Sums) => {
    switch (pos) {
      case 'QB': return x.passAtt + x.rushAtt * 0.5;
      case 'RB': return x.rushAtt + x.tgt;
      case 'WR': case 'TE': return x.tgt * 2;
      case 'EDGE': case 'DT': return x.sacks * 6 + x.qbHits * 2 + x.ff * 3 + x.games;
      case 'LB': return x.sacks * 4 + x.pbu * 2 + x.int * 4 + x.ff * 3 + x.games;
      case 'CB': case 'NCB': case 'S': return x.pbu * 3 + x.int * 5 + x.ff * 2 + x.games;
      case 'K': return x.fga * 3;
      default: return x.games;
    }
  };
  return u(cur) * 3 + u(prior) * 0.6;
}

export interface RosterBuild { byTeam: Map<string, RankedPlayer[]>; files: Map<string, TeamRosterFile>; }

export function buildRosters(ctx: BuildCtx, teams: Team[], games: GameRow[], teamPbwr: (id: string) => number): RosterBuild {
  const rosterByTeam = new Map<string, RosterRow[]>();
  for (const r of ctx.rosters) (rosterByTeam.get(r.team) ?? rosterByTeam.set(r.team, []).get(r.team)!).push(r);
  const injByGsis = new Map(ctx.injuries.map((i) => [i.gsis_id, i]));
  const espnByKey = new Map(ctx.espnInjuries.map((e) => [`${e.team}|${nameKey(e.name)}`, e]));
  const byNv = new Map(teams.map((t) => [nvFromId(t.id), t]));

  // Official depth-chart rank per player, when the file has one.
  const depthRank = new Map<string, number>();
  for (const [, rows] of ctx.depth) for (const r of rows) {
    const key = r.gsis_id || r.player_name.toLowerCase();
    const cur = depthRank.get(key);
    if (cur === undefined || r.pos_rank < cur) depthRank.set(key, r.pos_rank);
  }

  const byTeam = new Map<string, RankedPlayer[]>();
  for (const t of teams) {
    const nv = nvFromId(t.id);
    const roster = (rosterByTeam.get(nv) ?? []).filter((r) => r.gsis_id);
    const pools = new Map<RosterPositionLabel, RankedPlayer[]>();
    const seen = new Set<string>();
    for (const r of roster) {
      const pos = rosterGroup(r);
      if (!pos || seen.has(r.gsis_id)) continue;
      seen.add(r.gsis_id);
      const curAcc = ctx.cur?.players.get(r.gsis_id);
      const priorAcc = ctx.prior?.players.get(r.gsis_id);
      const cur = sumsOf(curAcc, nv);
      const prior = sumsOf(priorAcc);
      const seasons = (cur.games ? 1 : 0) + (prior.games ? 1 : 0);
      const s = merge(cur, prior);
      const prod = production(pos, s, seasons);
      const isDef = UNIT[pos] === 'defense';
      const snapFrom = (x?: SnapAgg) => (x && x.games >= 2 ? (isDef ? x.defPct : x.offPct) : NaN);
      const gp = gamesPlayed(ctx.cur, nv);
      const snapCur = r.pfr_id ? ctx.snaps.get(r.pfr_id) : undefined;
      const snapPrior = r.pfr_id ? ctx.snapsPrior.get(r.pfr_id) : undefined;
      const measured = Number.isFinite(snapFrom(snapCur)) && gp >= 3 ? snapFrom(snapCur) : snapFrom(snapPrior);
      pools.set(pos, [...(pools.get(pos) ?? []), {
        teamId: t.id, nv, gsisId: r.gsis_id, roster: r, pos, rank: 0, string: 0, s, cur, prior,
        composite: prod.composite, statLine: prod.statLine, usage: { snapPct: 0 }, rating: 0, ratingBasis: 'roster', role: 'reserve', facets: prod.facets,
        snapMeasured: Number.isFinite(measured) ? measured : null,
      }]);
    }
    const all: RankedPlayer[] = [];
    for (const [pos, list] of pools) {
      // The official depth chart decides the order where it has an opinion;
      // measured snaps then usage break ties and rank everyone else below.
      list.sort((a, b) => {
        const ra = depthRank.get(a.gsisId) ?? 99;
        const rb = depthRank.get(b.gsisId) ?? 99;
        if (ra !== rb) return ra - rb;
        const sa = a.snapMeasured ?? -1;
        const sb = b.snapMeasured ?? -1;
        if (Math.abs(sa - sb) > 0.05) return sb - sa;
        return usageScore(pos, b.cur, b.prior) - usageScore(pos, a.cur, a.prior) || b.roster.years_exp - a.roster.years_exp || a.roster.full_name.localeCompare(b.roster.full_name);
      });
      list.forEach((p, i) => { p.rank = i + 1; p.string = Math.ceil((i + 1) / STRING_SIZES[pos]); });
      all.push(...list);
    }
    byTeam.set(t.id, all);
  }

  const pops = new Map<RosterPositionLabel, number[]>();
  const facetPops = new Map<string, number[]>();
  for (const list of byTeam.values()) for (const p of list) {
    if (p.composite !== null) (pops.get(p.pos) ?? pops.set(p.pos, []).get(p.pos)!).push(p.composite);
    for (const [k, v] of Object.entries(p.facets)) { const key = `${p.pos}|${k}`; (facetPops.get(key) ?? facetPops.set(key, []).get(key)!).push(v); }
  }
  const teamById = new Map(teams.map((t) => [t.id, t]));
  for (const [teamId, list] of byTeam) {
    const t = teamById.get(teamId)!;
    const nv = nvFromId(teamId);
    const teamCur = ctx.cur?.teams.get(nv);
    const teamPrior = ctx.prior?.teams.get(nv);
    const gp = gamesPlayed(ctx.cur, nv);
    for (const p of list) {
      const starterish = p.string === 1;
      if (p.pos === 'OL') { p.rating = Math.round(clamp(55 + ((teamPbwr(teamId) - 0.45) / 0.3) * 35, 50, 92) - (starterish ? 0 : 8) - Math.max(0, p.string - 2) * 4); p.ratingBasis = 'roster'; }
      else if (p.composite !== null) { p.rating = Math.round(clamp(42 + percentile(p.composite, pops.get(p.pos) ?? []) * 0.55, 40, 97)); p.ratingBasis = 'production'; }
      else {
        const rookie = (p.roster.years_exp ?? 1) === 0;
        const draft = p.roster.draft_number;
        const bonus = Number.isFinite(draft) ? (draft <= 32 ? 12 : draft <= 64 ? 7 : draft <= 105 ? 3 : 0) : 0;
        p.rating = Math.round(clamp((rookie ? 60 : 56) + bonus + (starterish ? 4 : 0) - Math.max(0, p.string - 2) * 4, 40, 80));
        p.ratingBasis = 'roster';
      }
      const fallback = starterish ? (p.pos === 'QB' ? 1 : p.pos === 'WR' ? [0.85, 0.75, 0.6][p.rank - 1] ?? 0.55 : p.pos === 'RB' ? 0.55 : p.pos === 'TE' ? 0.65 : p.pos === 'OL' ? 0.95 : p.pos === 'EDGE' ? 0.7 : p.pos === 'DT' ? 0.6 : p.pos === 'LB' ? 0.75 : p.pos === 'CB' ? 0.85 : p.pos === 'NCB' ? 0.7 : p.pos === 'S' ? 0.9 : 1)
        : p.string === 2 ? 0.35 : 0.1;
      const snap = p.snapMeasured ?? fallback;
      p.usage = { snapPct: r2(clamp(snap, 0.03, 1)) };
      if (p.pos === 'WR' || p.pos === 'TE' || p.pos === 'RB') {
        const useCur = gp >= 4 && p.cur.tgt > 0;
        const acc = useCur ? p.cur : p.prior;
        const team = useCur ? teamCur : teamPrior;
        const tp = (team as TeamAcc | undefined)?.passPlays ?? 0;
        const db = (team as TeamAcc | undefined)?.dropbacks ?? 0;
        if (acc.games && tp > 40) { p.usage.targetShare = r3(clamp(acc.tgt / tp, 0, 0.4)); p.usage.tprr = r3(clamp(acc.tgt / Math.max(1, db * p.usage.snapPct), 0.04, 0.4)); }
        else { p.usage.targetShare = starterish ? (p.pos === 'WR' ? 0.16 : 0.11) : 0.07; p.usage.tprr = starterish ? 0.19 : 0.15; }
      }
      if (p.pos === 'EDGE' || p.pos === 'DT') {
        const adv = p.roster.pfr_id ? ctx.advDef.find((d) => d.pfr_id === p.roster.pfr_id && (d.season === ctx.season || d.season === ctx.priorSeason)) : undefined;
        const prssPerGame = adv && adv.g ? adv.prss / adv.g : per(p.s.sacks + p.s.qbHits * 0.5, p.s.games) * 1.6;
        if (prssPerGame > 0) p.usage.prwr = r3(clamp(0.06 + prssPerGame * 0.025, 0.05, 0.32));
      }
      if (p.pos === 'OL') p.usage.pbwr = r3(clamp(teamPbwr(teamId) + 0.25 - Math.max(0, p.string - 1) * 0.05, 0.6, 0.97));
    }
  }

  const files = new Map<string, TeamRosterFile>();
  for (const t of teams) {
    const nv = nvFromId(t.id);
    const list = byTeam.get(t.id) ?? [];
    const sched: TeamScheduleGame[] = games
      .filter((g) => g.season === ctx.season && (g.home_team === nv || g.away_team === nv))
      .sort((a, b) => a.gameday.localeCompare(b.gameday))
      .map((g) => {
        const home = g.home_team === nv;
        const oppNv = home ? g.away_team : g.home_team;
        const opp = byNv.get(oppNv);
        const ts = home ? g.home_score : g.away_score;
        const os = home ? g.away_score : g.home_score;
        const final = Number.isFinite(ts) && Number.isFinite(os);
        return { id: g.game_id, week: g.week, gameType: g.game_type, date: g.gameday, oppId: opp?.id ?? idFromNv(oppNv), oppName: opp ? `${opp.city} ${opp.name}` : oppNv, home: home && g.location !== 'Neutral', neutral: g.location === 'Neutral', status: final ? 'final' : 'scheduled', teamScore: final ? ts : null, oppScore: final ? os : null, result: final ? (ts > os ? 'W' : ts < os ? 'L' : null) : null, notes: null };
      });
    const wins = sched.filter((g) => g.result === 'W').length;
    const losses = sched.filter((g) => g.result === 'L').length;
    const nextGame = sched.find((g) => g.status === 'scheduled') ?? null;
    const roster: RosterPlayer[] = list.map((p) => {
      const acc = ctx.cur?.players.get(p.gsisId);
      const logs: PlayerGameLog[] = [];
      if (acc) for (const [gid, l] of acc.log) {
        if (l.team !== nv) continue;
        const sg = sched.find((x) => x.id === gid) ?? null;
        const { team: _t, ...stats } = l;
        logs.push({ gameId: gid, week: sg?.week ?? 0, date: sg?.date ?? '', oppId: sg?.oppId ?? null, oppName: sg?.oppName ?? 'Opponent', home: sg?.home ?? true, result: sg?.result ?? null, teamScore: sg?.teamScore ?? null, oppScore: sg?.oppScore ?? null, stats: compact({ ...stats, epa: r2(stats.epa) }) });
      }
      logs.sort((a, b) => a.week - b.week);
      const traits = { strengths: [] as PlayerTrait[], weaknesses: [] as PlayerTrait[] };
      for (const [k, v] of Object.entries(p.facets)) {
        const pop = facetPops.get(`${p.pos}|${k}`) ?? [];
        if (pop.length < 12) continue;
        const pct = Math.round(percentile(v, pop));
        const trait: PlayerTrait = { label: FACET_LABEL[k] ?? k, value: (FACET_FMT[k] ?? ((x: number) => String(r2(x))))(v), percentile: pct };
        if (pct >= 70) traits.strengths.push(trait); else if (pct <= 30) traits.weaknesses.push(trait);
      }
      traits.strengths.sort((a, b) => b.percentile - a.percentile); traits.weaknesses.sort((a, b) => a.percentile - b.percentile);
      let reported: InjuryStatus | undefined; let reportNote: string | undefined;
      const inj = injByGsis.get(p.gsisId);
      if (inj?.report_status === 'Out' || inj?.report_status === 'Doubtful') { reported = 'out'; reportNote = `${inj.report_primary_injury || 'Injury'} · ${inj.report_status}`; }
      else if (inj?.report_status === 'Questionable') { reported = 'questionable'; reportNote = `${inj.report_primary_injury || 'Injury'} · Questionable`; }
      else if (p.roster.status === 'RES' || p.roster.status === 'PUP' || p.roster.status === 'NON' || p.roster.status === 'SUS') { reported = 'out'; reportNote = p.roster.status === 'RES' ? 'Reserve list (IR)' : p.roster.status === 'SUS' ? 'Suspended' : 'Reserve/PUP'; }
      else {
        const e = espnByKey.get(`${t.id}|${nameKey(p.roster.full_name)}`);
        if (e) {
          const st = e.status.toLowerCase();
          if (st.includes('out') || st.includes('injured reserve') || st.includes('doubtful')) { reported = 'out'; reportNote = `${e.detail || 'Injury'} · ${e.status} (ESPN)`; }
          else if (st.includes('questionable')) { reported = 'questionable'; reportNote = `${e.detail || 'Injury'} · Questionable (ESPN)`; }
        }
      }
      const h = p.roster.height;
      const exp = p.roster.years_exp;
      const { games: cg, dropbacks: _d, recEpa: _r, rushEpa: _ru, passEpa: _pe, cpoe: _c, cpoeN: _cn, qbHits: _q, ...curLine } = p.cur;
      const { games: pg, dropbacks: _d2, recEpa: _r2, rushEpa: _ru2, passEpa: _pe2, cpoe: _c2, cpoeN: _cn2, qbHits: _q2, ...priorLine } = p.prior;
      return {
        id: `${t.id}-${p.gsisId}`, athleteId: p.gsisId, name: p.roster.full_name, jersey: p.roster.jersey_number || null, pos: p.pos, listedPos: p.roster.depth_chart_position || p.roster.position || p.pos, unit: UNIT[p.pos],
        string: p.string, rank: p.rank, role: p.role, rating: p.rating, ratingBasis: p.ratingBasis,
        headshotUrl: p.roster.headshot_url || null,
        height: Number.isFinite(h) && h > 0 ? `${Math.floor(h / 12)}'${h % 12}"` : null,
        weight: Number.isFinite(p.roster.weight) && p.roster.weight > 0 ? p.roster.weight : null,
        classYear: Number.isFinite(exp) ? exp : null, classLabel: Number.isFinite(exp) ? (exp === 0 ? 'Rookie' : `${exp} yr${exp === 1 ? '' : 's'}`) : null,
        hometown: null, college: p.roster.college || null,
        ...(reported ? { reported, reportNote } : {}),
        usage: p.usage, strengths: traits.strengths.slice(0, 4), weaknesses: traits.weaknesses.slice(0, 4),
        season: { ...compact({ ...curLine, epa: r2(curLine.epa) }), games: cg }, prior: pg ? { ...compact({ ...priorLine, epa: r2(priorLine.epa) }), games: pg } : null, games: logs, statLine: p.statLine,
      };
    });
    roster.sort((a, b) => POS_ORDER.indexOf(a.pos) - POS_ORDER.indexOf(b.pos) || a.rank - b.rank);
    files.set(t.id, { teamId: t.id, generatedAt: ctx.today.toISOString(), season: ctx.season, record: `${wins}-${losses}`, schedule: sched, nextGameId: nextGame?.id ?? null, roster, stringSizes: STRING_SIZES, headshotBase: null });
  }
  return { byTeam, files };
}

/** Engine depth chart cut from the ranked roster. */
const KEEP: Record<Position, PlayerRole[]> = {
  QB: ['starter', 'depth'], RB: ['starter', 'rotational'], WR: ['starter', 'starter', 'starter', 'rotational'], TE: ['starter', 'rotational'], LT: ['starter'], OL: ['starter'],
  EDGE: ['starter', 'rotational'], DT: ['starter', 'rotational'], LB: ['starter'], CB: ['starter'], NCB: ['starter'], S: ['starter'], K: ['starter'],
};
const ENGINE_ORDER: Position[] = ['QB', 'RB', 'WR', 'TE', 'LT', 'OL', 'EDGE', 'DT', 'LB', 'CB', 'NCB', 'S', 'K'];

export function depthChartFrom(ranked: RankedPlayer[], teamId: string, files: Map<string, TeamRosterFile>): { players: Player[]; qbComposite: number | null; teComposite: number | null } {
  const players: Player[] = [];
  const file = files.get(teamId);
  const rp = new Map(file?.roster.map((r) => [r.athleteId, r]) ?? []);
  let qbComposite: number | null = null;
  let teComposite: number | null = null;
  const used = new Set<string>();
  for (const pos of ENGINE_ORDER) {
    // The left tackle is the top lineman listed at tackle; other linemen fill 'OL'.
    const pool = pos === 'LT'
      ? ranked.filter((p) => p.pos === 'OL' && /^(LT|T|OT)$/i.test(p.roster.depth_chart_position || ''))
      : pos === 'OL'
        ? ranked.filter((p) => p.pos === 'OL' && !used.has(p.gsisId))
        : ranked.filter((p) => p.pos === (pos as unknown as RosterPositionLabel));
    KEEP[pos].forEach((role, i) => {
      const p = pool[i];
      if (!p || used.has(p.gsisId)) return;
      used.add(p.gsisId);
      p.role = role;
      const r = rp.get(p.gsisId);
      if (r) r.role = role;
      if (pos === 'QB' && i === 0) qbComposite = p.composite;
      if (pos === 'TE' && i === 0) teComposite = p.composite;
      players.push({
        id: `${teamId}-${p.gsisId}`, name: p.roster.full_name, pos, role, rating: p.rating, snapPct: p.usage.snapPct,
        ...(p.usage.targetShare !== undefined ? { targetShare: p.usage.targetShare, tprr: p.usage.tprr } : {}),
        ...(p.usage.prwr !== undefined ? { prwr: p.usage.prwr } : {}),
        ...(pos === 'LT' || pos === 'OL' ? { pbwr: p.usage.pbwr } : {}),
        ...(p.statLine ? { note: p.statLine } : {}),
        ...(r?.reported ? { reported: r.reported, reportNote: r.reportNote } : {}),
        ...(p.roster.headshot_url ? { headshotUrl: p.roster.headshot_url } : {}),
        ...(p.roster.jersey_number ? { jersey: p.roster.jersey_number } : {}),
      });
    });
  }
  return { players, qbComposite, teComposite };
}
