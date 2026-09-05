/**
 * Depth charts → engine Player rows, with production-based grades, usage
 * metrics (target share, TPRR proxy, PRWR proxy, snap share) and the latest
 * reported injury status.
 */
import type { InjuryStatus, Player, Position, PlayerRole } from '../../src/engine/types';
import type { DepthRow, PlayerAcc, RosterRow, TeamAcc } from '../sources/nflverse';
import { blendWeight, gamesPlayed, type BuildCtx } from './context';
import { clamp, nvFromId, percentile, r2, r3 } from '../lib/util';

interface Candidate {
  teamId: string;
  nv: string;
  depth: DepthRow;
  roster?: RosterRow;
  pos: Position;
  role: PlayerRole;
  composite: number | null; // null = no production data
  usage: Partial<Pick<Player, 'targetShare' | 'tprr' | 'prwr' | 'pbwr'>>;
  snapPct: number;
  note?: string;
  statLine?: string;
}

const ROLE_SNAP: Record<PlayerRole, number> = { starter: 0.85, rotational: 0.5, depth: 0.25 };

/** Map a depth-chart slot to an engine position given the base front. */
function slotToPosition(abb: string, front: '4-3' | '3-4'): Position | null {
  switch (abb) {
    case 'QB': return 'QB';
    case 'RB': case 'FB': return 'RB';
    case 'WR': return 'WR';
    case 'TE': return 'TE';
    case 'LT': return 'LT';
    case 'LG': case 'C': case 'RG': case 'RT': return 'OL';
    case 'LCB': case 'RCB': return 'CB';
    case 'NB': return 'NCB';
    case 'FS': case 'SS': return 'S';
    case 'PK': return 'K';
    case 'LDE': case 'RDE': return front === '3-4' ? 'DT' : 'EDGE';
    case 'LDT': case 'RDT': case 'NT': return 'DT';
    case 'WLB': case 'SLB': return front === '3-4' ? 'EDGE' : 'LB';
    case 'MLB': case 'RILB': case 'LILB': return 'LB';
    default: return null;
  }
}

/**
 * Which depth ranks to keep per engine position, and the role each rank gets.
 * Receivers are ranked team-wide (WR1..WRn), so ranks 1-3 are the three starters in 11 personnel;
 * most other slots (LDE/RDE, LCB/RCB, …) carry a per-slot rank where 1 = starter.
 */
const KEEP: Record<Position, PlayerRole[]> = {
  QB: ['starter', 'depth'], RB: ['starter', 'rotational'], WR: ['starter', 'starter', 'starter', 'rotational'], TE: ['starter', 'rotational'], LT: ['starter'], OL: ['starter'],
  EDGE: ['starter', 'rotational'], DT: ['starter', 'rotational'], LB: ['starter'], CB: ['starter'], NCB: ['starter'], S: ['starter'], K: ['starter'],
};
/** Max players per engine position after merging slots (e.g. 3 WR slots × rank 1). */
const CAP: Record<Position, number> = { QB: 2, RB: 2, WR: 4, TE: 2, LT: 1, OL: 1, EDGE: 4, DT: 3, LB: 3, CB: 2, NCB: 1, S: 2, K: 1 };

const sum = (a: PlayerAcc | undefined, b: PlayerAcc | undefined, w: number) => {
  const pick = (k: keyof PlayerAcc) => (Number(a?.[k] ?? 0) * (a ? 1 : 0) + Number(b?.[k] ?? 0) * (b ? 1 : 0));
  return {
    targets: pick('targets'), rec: pick('rec'), recYds: pick('recYds'), recEpa: pick('recEpa'), rushAtt: pick('rushAtt'), rushYds: pick('rushYds'), rushEpa: pick('rushEpa'),
    dropbacks: pick('dropbacks'), passEpa: pick('passEpa'), cpoe: pick('cpoe'), cpoeN: pick('cpoeN'), sacks: pick('sacks'), qbHits: pick('qbHits'), ints: pick('ints'),
    // Usage rates favour the current season as it accumulates.
    curWeight: w,
  };
};

export interface PlayerBuild { byTeam: Map<string, Player[]>; qbRating: Map<string, number>; teSpeed: Map<string, number>; }

export function buildPlayers(ctx: BuildCtx, fronts: Map<string, '4-3' | '3-4'>): PlayerBuild {
  const rosterByGsis = new Map(ctx.rosters.filter((r) => r.gsis_id).map((r) => [r.gsis_id, r]));
  const rosterByName = new Map(ctx.rosters.map((r) => [`${r.team}|${r.full_name.toLowerCase()}`, r]));
  const advDefByPfr = new Map<string, { prss: number; sk: number; g: number; tgt: number; rat: number; comb: number; mtk: number; int: number; seasons: number }>();
  for (const d of ctx.advDef) {
    if (d.season !== ctx.season && d.season !== ctx.priorSeason) continue;
    const a = advDefByPfr.get(d.pfr_id) ?? { prss: 0, sk: 0, g: 0, tgt: 0, rat: 0, comb: 0, mtk: 0, int: 0, seasons: 0 };
    a.prss += d.prss || 0; a.sk += d.sk || 0; a.g += d.g || 0; a.tgt += d.tgt || 0; a.rat += (d.rat || 0) * (d.tgt || 0); a.comb += d.comb || 0; a.mtk += (d.m_tkl_percent || 0) * (d.comb || 0); a.int += d.int || 0; a.seasons++;
    advDefByPfr.set(d.pfr_id, a);
  }
  const injByGsis = new Map(ctx.injuries.map((i) => [i.gsis_id, i]));
  const espnByKey = new Map(ctx.espnInjuries.map((e) => [`${e.team}|${e.name.toLowerCase()}`, e]));

  const candidates: Candidate[] = [];
  for (const b of ctx.baseline) {
    const nv = nvFromId(b.id);
    const front = fronts.get(nv) ?? (b.coaching.defFront === '3-4' ? '3-4' : '4-3');
    const rows = (ctx.depth.get(nv) ?? []).filter((r) => r.pos_grp !== 'Special Teams' || r.pos_abb === 'PK');
    const gp = gamesPlayed(ctx.cur, nv);
    const w = blendWeight(gp);
    const teamCur = ctx.cur?.teams.get(nv);
    const teamPrior = ctx.prior?.teams.get(nv);
    const teamPass = (t: TeamAcc | undefined) => t?.passPlays ?? 0;
    const teamDb = (t: TeamAcc | undefined) => t?.dropbacks ?? 0;

    const byPos = new Map<Position, DepthRow[]>();
    for (const r of rows) {
      const pos = slotToPosition(r.pos_abb, front);
      if (!pos) continue;
      (byPos.get(pos) ?? byPos.set(pos, []).get(pos)!).push(r);
    }
    // One row per player per team: a player who appears in two slots (e.g. FS and NB) keeps the higher-priority position.
    const seen = new Set<string>();
    const PRIORITY: Position[] = ['QB', 'WR', 'RB', 'TE', 'LT', 'OL', 'EDGE', 'DT', 'NCB', 'CB', 'S', 'LB', 'K'];
    for (const pos of PRIORITY) {
      const list = byPos.get(pos);
      if (!list) continue;
      const ranks = KEEP[pos];
      const ordered = [...list].sort((x, y) => x.pos_rank - y.pos_rank || x.pos_slot - y.pos_slot);
      let kept = 0;
      for (const r of ordered) {
        if (kept >= CAP[pos]) break;
        if (r.pos_rank > ranks.length) continue;
        if (!r.player_name || !r.player_name.trim()) continue; // blank depth-chart slot
        if (seen.has(r.gsis_id || r.player_name)) continue;
        const roster = rosterByGsis.get(r.gsis_id) ?? rosterByName.get(`${nv}|${r.player_name.toLowerCase()}`);
        // The roster file is the authority on who is actually on the team: drop players the
        // depth-chart snapshot still lists after they were cut, retired, or moved elsewhere.
        if (roster && (roster.status === 'CUT' || roster.status === 'RET' || roster.team !== nv)) {
          ctx.notes.push(`${b.abbr}: dropped ${r.player_name} from depth chart (roster: ${roster.team} ${roster.status}).`);
          continue;
        }
        seen.add(r.gsis_id || r.player_name);
        const role = ranks[r.pos_rank - 1];
        const cur = ctx.cur?.players.get(r.gsis_id);
        const prior = ctx.prior?.players.get(r.gsis_id);
        const s = sum(cur, prior, w);
        const adv = roster?.pfr_id ? advDefByPfr.get(roster.pfr_id) : undefined;
        const snapCur = roster?.pfr_id ? ctx.snaps.get(roster.pfr_id) : undefined;
        const snapPrior = roster?.pfr_id ? ctx.snapsPrior.get(roster.pfr_id) : undefined;
        const isDef = pos === 'EDGE' || pos === 'DT' || pos === 'LB' || pos === 'CB' || pos === 'NCB' || pos === 'S';
        const snapFrom = (x?: { offPct: number; defPct: number; games: number }) => (x && x.games >= 2 ? (isDef ? x.defPct : x.offPct) : NaN);
        const snapMeasured = Number.isFinite(snapFrom(snapCur)) && gp >= 3 ? snapFrom(snapCur) : snapFrom(snapPrior);
        const snapPct = clamp(Number.isFinite(snapMeasured) ? snapMeasured : ROLE_SNAP[role], 0.05, 1);

        let composite: number | null = null;
        const usage: Candidate['usage'] = {};
        let statLine: string | undefined;
        const seasonsWithData = (cur ? 1 : 0) + (prior ? 1 : 0);
        const perSeason = (v: number) => (seasonsWithData ? v / seasonsWithData : v);
        if (pos === 'QB') {
          if (s.dropbacks >= 50) {
            composite = s.passEpa / s.dropbacks + (s.cpoeN ? s.cpoe / s.cpoeN : 0) / 40;
            statLine = `${r2(s.passEpa / s.dropbacks)} EPA/dropback · ${s.cpoeN ? (s.cpoe / s.cpoeN).toFixed(1) : '—'} CPOE`;
          }
        } else if (pos === 'RB') {
          if (s.rushAtt + s.targets >= 40) {
            composite = perSeason(s.rushEpa + s.recEpa) + (s.rushAtt ? (s.rushYds / s.rushAtt - 4.2) * 4 : 0);
            statLine = `${s.rushAtt ? (s.rushYds / s.rushAtt).toFixed(1) : '—'} YPC · ${r2(perSeason(s.rushEpa + s.recEpa))} EPA/season`;
          }
        } else if (pos === 'WR' || pos === 'TE') {
          if (s.targets >= 15) {
            // Efficiency-weighted volume; per-target efficiency is shrunk toward the league mean (~0.10 EPA/target)
            // with a 60-target prior so a hot 30-target sample doesn't outgrade a full-season WR1.
            const effShrunk = (s.recEpa + 60 * 0.1) / (s.targets + 60);
            composite = perSeason(s.recEpa) * 0.6 + effShrunk * 60 * 0.4 + perSeason(s.targets) * 0.03;
            statLine = `${r2(s.recEpa / s.targets)} EPA/target on ${Math.round(perSeason(s.targets))} tgt/season`;
          }
        } else if (pos === 'EDGE' || pos === 'DT') {
          const prssPerGame = adv && adv.g ? adv.prss / adv.g : (s.sacks + s.qbHits) * 1.6 / Math.max(1, (cur ? gp : 0) + (prior ? 17 : 0));
          if (adv || s.sacks + s.qbHits > 0) {
            composite = prssPerGame * 2 + perSeason(s.sacks) * 0.6;
            usage.prwr = r3(clamp(0.06 + prssPerGame * 0.025, 0.05, 0.32));
            statLine = `${prssPerGame.toFixed(1)} pressures/g · ${perSeason(s.sacks).toFixed(1)} sacks/season`;
          }
        } else if (pos === 'LB') {
          if (adv && adv.g) {
            composite = (adv.comb / adv.g) * 0.4 + (adv.prss / adv.g) * 1.5 + adv.int * 1.5 - (adv.comb ? (adv.mtk / adv.comb) * 25 : 0) + (adv.tgt ? (100 - adv.rat / adv.tgt) / 12 : 0);
            statLine = `${(adv.comb / adv.g).toFixed(1)} tackles/g · ${adv.tgt ? (adv.rat / adv.tgt).toFixed(0) : '—'} passer rating allowed`;
          }
        } else if (pos === 'CB' || pos === 'NCB' || pos === 'S') {
          if (adv && adv.tgt >= 15) {
            const ratAllowed = adv.rat / adv.tgt;
            composite = (110 - ratAllowed) / 10 + adv.int * 1.2 - (adv.comb ? (adv.mtk / adv.comb) * 10 : 0);
            statLine = `${ratAllowed.toFixed(0)} passer rating allowed on ${adv.tgt} tgt · ${adv.int} INT`;
          }
        }
        // Usage metrics for receivers (share of the team's passes; TPRR ≈ targets / routes, routes ≈ dropbacks × snap share).
        if (pos === 'WR' || pos === 'TE' || pos === 'RB') {
          const useCur = gp >= 4 && cur;
          const acc = useCur ? cur : prior;
          const tp = useCur ? teamPass(teamCur) : teamPass(ctx.prior?.teams.get(prior?.team ?? nv));
          const db = useCur ? teamDb(teamCur) : teamDb(ctx.prior?.teams.get(prior?.team ?? nv));
          if (acc && tp > 40) {
            usage.targetShare = r3(clamp(acc.targets / tp, 0, 0.4));
            usage.tprr = r3(clamp(acc.targets / Math.max(1, db * snapPct), 0.04, 0.4));
          } else {
            usage.targetShare = role === 'starter' ? (pos === 'WR' ? 0.16 : 0.11) : 0.07;
            usage.tprr = role === 'starter' ? 0.19 : 0.15;
          }
        }
        candidates.push({ teamId: b.id, nv, depth: r, roster, pos, role, composite, usage, snapPct: r2(pos === 'QB' && role === 'starter' ? 1 : snapPct), statLine });
        kept++;
      }
    }
  }

  // Percentile grades within each position across the league.
  const pops = new Map<Position, number[]>();
  for (const c of candidates) if (c.composite !== null) (pops.get(c.pos) ?? pops.set(c.pos, []).get(c.pos)!).push(c.composite);

  const gradeOf = (c: Candidate, teamPbwr: number): number => {
    if (c.pos === 'LT' || c.pos === 'OL') return Math.round(clamp(55 + ((teamPbwr - 0.45) / 0.3) * 35, 50, 92) - (c.role === 'starter' ? 0 : 8));
    if (c.pos === 'K') return 72;
    if (c.composite !== null) {
      const p = percentile(c.composite, pops.get(c.pos) ?? []);
      return Math.round(clamp(42 + p * 0.55, 40, 97));
    }
    const rookie = (c.roster?.years_exp ?? 1) === 0;
    const draft = c.roster?.draft_number ?? NaN;
    const bonus = Number.isFinite(draft) ? (draft <= 32 ? 12 : draft <= 64 ? 7 : draft <= 105 ? 3 : 0) : 0;
    return clamp((rookie ? 60 : 56) + bonus + (c.role === 'starter' ? 4 : 0), 45, 80);
  };

  const statusOf = (c: Candidate): { reported?: InjuryStatus; reportNote?: string } => {
    const inj = injByGsis.get(c.depth.gsis_id);
    if (inj?.report_status) {
      const st = inj.report_status;
      if (st === 'Out' || st === 'Doubtful') return { reported: 'out', reportNote: `${inj.report_primary_injury || 'Injury'} · ${st}` };
      if (st === 'Questionable') return { reported: 'questionable', reportNote: `${inj.report_primary_injury || 'Injury'} · Questionable` };
    }
    const rs = c.roster?.status;
    if (rs === 'RES' || rs === 'PUP' || rs === 'NON' || rs === 'SUS' || rs === 'EXE') {
      return { reported: 'out', reportNote: rs === 'RES' ? 'Reserve list (IR)' : rs === 'SUS' ? 'Suspended' : rs === 'EXE' ? 'Exempt list' : 'Reserve/PUP' };
    }
    const e = espnByKey.get(`${c.teamId}|${c.depth.player_name.toLowerCase()}`);
    if (e) {
      const st = e.status.toLowerCase();
      if (st.includes('out') || st.includes('injured reserve') || st.includes('doubtful')) return { reported: 'out', reportNote: `${e.detail || 'Injury'} · ${e.status} (ESPN)` };
      if (st.includes('questionable')) return { reported: 'questionable', reportNote: `${e.detail || 'Injury'} · Questionable (ESPN)` };
    }
    return {};
  };

  const byTeam = new Map<string, Player[]>();
  const qbRating = new Map<string, number>();
  const teSpeed = new Map<string, number>();
  const teamPbwr = new Map<string, number>();
  for (const b of ctx.baseline) {
    const nv = nvFromId(b.id);
    const gp = gamesPlayed(ctx.cur, nv);
    const w = blendWeight(gp);
    const pa = (t?: TeamAcc) => (t && t.dropbacks > 0 ? t.pressuresAllowed / t.dropbacks : NaN);
    const c = pa(ctx.cur?.teams.get(nv));
    const p = pa(ctx.prior?.teams.get(nv));
    const rate = Number.isFinite(c) && Number.isFinite(p) ? w * c + (1 - w) * p : Number.isFinite(c) ? c : p;
    teamPbwr.set(b.id, clamp(0.85 - (Number.isFinite(rate) ? rate : 0.2) * 1.6, 0.45, 0.75));
  }
  const qbPop = candidates.filter((c) => c.pos === 'QB' && c.composite !== null).map((c) => c.composite!) ;
  const tePop = candidates.filter((c) => c.pos === 'TE' && c.composite !== null).map((c) => c.composite!);

  for (const c of candidates) {
    const grade = gradeOf(c, teamPbwr.get(c.teamId) ?? 0.6);
    const status = statusOf(c);
    const player: Player = {
      id: `${c.teamId}-${c.depth.gsis_id || c.depth.player_name.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`,
      name: c.depth.player_name,
      pos: c.pos,
      role: c.role,
      rating: grade,
      snapPct: c.snapPct,
      ...c.usage,
      ...(c.pos === 'LT' || c.pos === 'OL' ? { pbwr: r3(clamp((teamPbwr.get(c.teamId) ?? 0.6) + 0.25, 0.7, 0.97)) } : {}),
      ...(c.statLine ? { note: c.statLine } : {}),
      ...status,
      ...(c.roster?.headshot_url ? { headshotUrl: c.roster.headshot_url } : {}),
    };
    (byTeam.get(c.teamId) ?? byTeam.set(c.teamId, []).get(c.teamId)!).push(player);

    if (c.pos === 'QB' && c.role === 'starter') {
      // Team QB rating (1-10) from the QB1's production percentile; unknown/rookie → 5.0 (+draft bump).
      if (c.composite !== null) qbRating.set(c.teamId, r2(clamp(2.5 + (percentile(c.composite, qbPop) / 100) * 7.5, 1, 10)));
      else qbRating.set(c.teamId, (c.roster?.draft_number ?? 99) <= 12 ? 5.5 : 5.0);
    }
    if (c.pos === 'TE' && c.role === 'starter') {
      teSpeed.set(c.teamId, c.composite !== null ? r2(clamp(3 + (percentile(c.composite, tePop) / 100) * 6.5, 1, 10)) : 5.0);
    }
  }
  const POS_ORDER: Position[] = ['QB', 'RB', 'WR', 'TE', 'LT', 'OL', 'EDGE', 'DT', 'LB', 'CB', 'NCB', 'S', 'K'];
  for (const [, list] of byTeam) list.sort((a, b) => POS_ORDER.indexOf(a.pos) - POS_ORDER.indexOf(b.pos) || (a.role === b.role ? b.rating - a.rating : a.role === 'starter' ? -1 : 1));
  return { byTeam, qbRating, teSpeed };
}
