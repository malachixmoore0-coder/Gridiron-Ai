/**
 * Turn play-by-play aggregates, depth charts and schedule metadata into the
 * engine's Team profiles. Measurable things are measured; the few things no
 * free source exposes (coverage family, stadium noise, colours) come from the
 * curated baseline and are flagged in meta notes.
 */
import type { Team, OffensiveScheme, DefensiveFront } from '../../src/engine/types';
import { deriveSchemeMatrices } from '../../src/data/teams';
import type { TeamAcc, HalfSplit } from '../sources/nflverse';
import { blendWeight, gamesPlayed, type BuildCtx } from './context';
import { clamp, mean, nvFromId, percentile, r1, r2, r3, rateAmong, shrink } from '../lib/util';
import { espnLogo } from '../sources/espn';

export interface Metrics {
  epaPlay: number; passEpa: number; rushEpa: number; success: number; explosive: number; earlyPass: number; thirdConv: number; fourthGo: number; fourthOpp: number;
  rzTd: number; pace: number; pressureAllowed: number; shotgun: number; adot: number; shortTgtEpa: number; scramble: number; offAdjust: number;
  dEpa: number; dPassEpa: number; dRushEpa: number; dExplosive: number; dThirdStop: number; pressure: number; takeaways: number; dTeRbEpa: number; dShortWrEpa: number; defAdjust: number;
  paRate: number; motionRate: number; rpoRate: number; screenRate: number; dBlitz: number;
  vs43: number; vs34: number;
}

const halfAdjust = (m: Map<string, HalfSplit>, sign: 1 | -1) => {
  const diffs: number[] = [];
  for (const h of m.values()) if (h.n1 >= 8 && h.n2 >= 8) diffs.push(sign * (h.h2 / h.n2 - h.h1 / h.n1));
  return diffs.length ? mean(diffs) : NaN;
};

export function metrics(a: TeamAcc | undefined): Metrics | null {
  if (!a || a.plays < 50) return null;
  const g = a.games.size || 1;
  const div = (n: number, d: number) => (d > 0 ? n / d : NaN);
  return {
    epaPlay: div(a.epa, a.plays), passEpa: div(a.passEpa, a.passPlays), rushEpa: div(a.rushEpa, a.rushPlays), success: div(a.success, a.plays), explosive: div(a.explosive, a.plays),
    earlyPass: div(a.earlyPass, a.earlyDowns), thirdConv: div(a.thirdConv, a.thirdAtt), fourthGo: div(a.fourthGo, a.fourthOpp), fourthOpp: a.fourthOpp,
    rzTd: div(a.rzTd, a.rzTrips.size), pace: a.plays / g, pressureAllowed: div(a.pressuresAllowed, a.dropbacks), shotgun: div(a.shotgun, a.plays), adot: div(a.airYards, a.airN),
    shortTgtEpa: div(a.shortTgtEpa, a.shortTgtN), scramble: div(a.scrambles, a.dropbacks), offAdjust: halfAdjust(a.offHalf, 1),
    dEpa: div(a.dEpa, a.dPlays), dPassEpa: div(a.dPassEpa, a.dPassPlays), dRushEpa: div(a.dRushEpa, a.dRushPlays), dExplosive: div(a.dExplosive, a.dPlays),
    dThirdStop: 1 - div(a.dThirdConv, a.dThirdAtt), pressure: div(a.pressures, a.dDropbacks), takeaways: a.takeaways / g, dTeRbEpa: div(a.dTeRbTgtEpa, a.dTeRbTgtN), dShortWrEpa: div(a.dShortWrTgtEpa, a.dShortWrTgtN),
    defAdjust: halfAdjust(a.defHalf, -1),
    paRate: div(a.ftnPa, a.ftnPass), motionRate: div(a.ftnMotion, a.plays), rpoRate: div(a.ftnRpo, a.plays), screenRate: div(a.ftnScreens, a.ftnPass), dBlitz: div(a.dFtnBlitz, a.dFtnPass),
    vs43: div(a.vs43.epa, a.vs43.n), vs34: div(a.vs34.epa, a.vs34.n),
  };
}

/** Blend current and prior season metrics with a games-played weight. */
export function blend(cur: Metrics | null, prior: Metrics | null, w: number): Metrics | null {
  if (!cur && !prior) return null;
  if (!cur) return prior;
  if (!prior) return cur;
  const out = {} as Metrics;
  for (const k of Object.keys(cur) as (keyof Metrics)[]) {
    const c = cur[k];
    const p = prior[k];
    out[k] = !Number.isFinite(c) ? p : !Number.isFinite(p) ? c : w * c + (1 - w) * p;
  }
  return out;
}

/** League-relative scheme label: percentile ranks so labels stay balanced whatever the data source's baseline. */
export function classifyScheme(m: Metrics, pct: (k: keyof Metrics, v: number) => number, fallback: OffensiveScheme): OffensiveScheme {
  if (!Number.isFinite(m.earlyPass)) return fallback;
  const pa = Number.isFinite(m.paRate) ? pct('paRate', m.paRate) : 50;
  const motion = Number.isFinite(m.motionRate) ? pct('motionRate', m.motionRate) : 50;
  const rpo = Number.isFinite(m.rpoRate) ? pct('rpoRate', m.rpoRate) : 50;
  const pass = pct('earlyPass', m.earlyPass);
  const adot = Number.isFinite(m.adot) ? pct('adot', m.adot) : 50;
  const gun = Number.isFinite(m.shotgun) ? pct('shotgun', m.shotgun) : 50;
  if (motion >= 67 && pa >= 50) return 'Motion Heavy';
  if (rpo >= 80) return 'RPO Spread';
  if (pa >= 67 && pass <= 50) return 'Wide Zone';
  if (pass <= 20) return 'Power Run';
  if (pass >= 75 && adot >= 67) return 'Vertical';
  if (pass >= 75) return 'Air Raid';
  if (gun >= 67) return 'Spread';
  return 'West Coast';
}

export function detectFront(depthRows: { pos_grp: string }[] | undefined, fallback: DefensiveFront): DefensiveFront {
  if (!depthRows?.length) return fallback;
  if (depthRows.some((r) => r.pos_grp.startsWith('Base 3-4'))) return '3-4';
  if (depthRows.some((r) => r.pos_grp.startsWith('Base 4-3'))) return '4-3';
  return fallback;
}

export interface TeamBuild { team: Team; metrics: Metrics | null; gp: number; }

export function buildTeams(ctx: BuildCtx, qbRating: (id: string) => number, teSpeed: (id: string) => number): TeamBuild[] {
  const league: Record<string, number[]> = {};
  const perTeam = ctx.baseline.map((b) => {
    const nv = nvFromId(b.id);
    const gp = gamesPlayed(ctx.cur, nv);
    const m = blend(metrics(ctx.cur?.teams.get(nv)), metrics(ctx.prior?.teams.get(nv)), blendWeight(gp));
    if (m) for (const k of Object.keys(m) as (keyof Metrics)[]) (league[k] ??= []).push(m[k]);
    return { b, nv, gp, m };
  });
  const L = (k: keyof Metrics) => league[k] ?? [];
  const lm = (k: keyof Metrics) => mean(L(k).filter(Number.isFinite));
  const pct = (k: keyof Metrics, v: number) => percentile(v, L(k));

  // Latest coach per team from the schedule file (the current season first, then prior).
  const coachOf = (nv: string): string | undefined => {
    const rows = ctx.games.filter((g) => (g.home_team === nv || g.away_team === nv) && (g.home_coach || g.away_coach)).sort((a, b) => b.gameday.localeCompare(a.gameday));
    const cur = rows.find((g) => g.season === ctx.season);
    const g = cur ?? rows[0];
    return g ? (g.home_team === nv ? g.home_coach : g.away_coach) || undefined : undefined;
  };
  const priorCoachOf = (nv: string): string | undefined => {
    const rows = ctx.games.filter((g) => g.season === ctx.priorSeason && (g.home_team === nv || g.away_team === nv)).sort((a, b) => b.gameday.localeCompare(a.gameday));
    const g = rows[0];
    return g ? (g.home_team === nv ? g.home_coach : g.away_coach) || undefined : undefined;
  };
  const roofOf = (nv: string): boolean | undefined => {
    const home = ctx.games.filter((g) => g.season === ctx.season && g.home_team === nv && g.location !== 'Neutral');
    if (!home.length) return undefined;
    const roofs = new Set(home.map((g) => g.roof));
    if (roofs.has('dome')) return true;
    if (roofs.has('outdoors') && roofs.size === 1) return false;
    return undefined;
  };

  return perTeam.map(({ b, nv, gp, m }) => {
    const coach = coachOf(nv) ?? b.coaching.headCoach;
    const coachChanged = !!coach && !!priorCoachOf(nv) && coach !== priorCoachOf(nv);
    if (!m) {
      ctx.notes.push(`${b.abbr}: no play-by-play available — using baseline ratings.`);
      return { team: { ...b, coaching: { ...b.coaching, headCoach: coach }, logoUrl: espnLogo(b.id) }, metrics: null, gp };
    }
    const qb = qbRating(b.id);
    const passEff = rateAmong(m.passEpa, L('passEpa'));
    const rushEff = rateAmong(m.rushEpa, L('rushEpa'));
    // A new head coach with little current-season evidence keeps the curated scheme label.
    const offScheme = coachChanged && gp < 4 ? b.coaching.offScheme : classifyScheme(m, pct, b.coaching.offScheme);
    const defFront = detectFront(ctx.depth.get(nv), b.coaching.defFront);
    const vsFrontMeasured: Partial<Record<DefensiveFront, number>> = {};
    if (Number.isFinite(m.vs43)) vsFrontMeasured['4-3'] = rateAmong(m.vs43, L('vs43'));
    if (Number.isFinite(m.vs34)) vsFrontMeasured['3-4'] = rateAmong(m.vs34, L('vs34'));
    const { vsFront, vsCoverage } = deriveSchemeMatrices(offScheme, passEff, rushEff, qb, { vsFront: vsFrontMeasured });

    const fourthGo = shrink(m.fourthGo, lm('fourthGo'), m.fourthOpp, 8);
    const adjust = rateAmong((Number.isFinite(m.offAdjust) ? m.offAdjust : 0) + (Number.isFinite(m.defAdjust) ? m.defAdjust : 0), L('offAdjust').map((v, i) => (Number.isFinite(v) ? v : 0) + (Number.isFinite(L('defAdjust')[i]) ? L('defAdjust')[i] : 0)), { spread: 1.2 });
    const dome = roofOf(nv);

    const team: Team = {
      ...b,
      logoUrl: espnLogo(b.id),
      stadium: { ...b.stadium, dome: dome ?? b.stadium.dome },
      coaching: {
        headCoach: coach,
        offScheme,
        defFront,
        baseCoverage: b.coaching.baseCoverage,
        thirdDownOff: r3(Number.isFinite(m.thirdConv) ? m.thirdConv : b.coaching.thirdDownOff),
        thirdDownDef: r3(Number.isFinite(m.dThirdStop) ? m.dThirdStop : b.coaching.thirdDownDef),
        fourthDownGoRate: r3(clamp(fourthGo, 0.05, 0.95)),
        redZoneTd: r3(Number.isFinite(m.rzTd) ? m.rzTd : b.coaching.redZoneTd),
        redZoneAggression: r1(clamp(rateAmong(fourthGo, L('fourthGo')) * 0.6 + rateAmong(m.rzTd, L('rzTd')) * 0.4, 1, 10)),
        halftimeAdjust: r1(shrink(adjust, 5.5, gp + 17 * (1 - blendWeight(gp)), 10)),
        playActionRate: r3(Number.isFinite(m.paRate) ? m.paRate : b.coaching.playActionRate),
        passRate: r3(Number.isFinite(m.earlyPass) ? m.earlyPass : b.coaching.passRate),
        pace: r1(Number.isFinite(m.pace) ? m.pace : b.coaching.pace),
      },
      offense: {
        passEfficiency: passEff,
        rushEfficiency: rushEff,
        explosiveness: rateAmong(m.explosive, L('explosive')),
        qb,
        pbwr: r3(clamp(0.85 - (Number.isFinite(m.pressureAllowed) ? m.pressureAllowed : 0.2) * 1.6, 0.45, 0.75)),
        slotEfficiency: rateAmong(m.shortTgtEpa, L('shortTgtEpa')),
        teSpeed: teSpeed(b.id),
        vsFront,
        vsCoverage,
      },
      defense: {
        passDefense: rateAmong(m.dPassEpa, L('dPassEpa'), { invert: true }),
        rushDefense: rateAmong(m.dRushEpa, L('dRushEpa'), { invert: true }),
        prwr: r3(clamp(0.22 + (Number.isFinite(m.pressure) ? m.pressure : 0.2) * 1.3, 0.3, 0.6)),
        nickelCorner: rateAmong(m.dShortWrEpa, L('dShortWrEpa'), { invert: true }),
        lbCoverage: rateAmong(m.dTeRbEpa, L('dTeRbEpa'), { invert: true }),
        secondaryAdjust: r1(shrink(rateAmong(m.defAdjust, L('defAdjust'), { spread: 1.2 }), 5.5, gp + 17 * (1 - blendWeight(gp)), 10)),
        blitzRate: r3(Number.isFinite(m.dBlitz) ? m.dBlitz : b.defense.blitzRate),
        takeaways: rateAmong(m.takeaways, L('takeaways')),
      },
      players: [], // filled by players.ts
    };
    return { team, metrics: m, gp };
  });
}

export const roundMetrics = (m: Metrics | null) => (m ? Object.fromEntries(Object.entries(m).map(([k, v]) => [k, Number.isFinite(v) ? r3(v) : null])) : null);
export { r2 };
