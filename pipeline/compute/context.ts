import type { Team } from '../../src/engine/types';
import type { GameRow, RosterRow, DepthRow, InjuryRow, SnapAgg, AdvPass, AdvDef, PbpAgg } from '../sources/nflverse';
import type { EspnInjury } from '../sources/espn';

export interface BuildCtx {
  season: number;
  priorSeason: number;
  today: Date;
  games: GameRow[];
  cur: PbpAgg | null;
  prior: PbpAgg | null;
  depth: Map<string, DepthRow[]>;
  depthAsOf: string;
  rosters: RosterRow[];
  injuries: InjuryRow[];
  injuryWeek: number;
  snaps: Map<string, SnapAgg>;
  snapsPrior: Map<string, SnapAgg>;
  advPass: AdvPass[];
  advDef: AdvDef[];
  espnInjuries: EspnInjury[];
  /** Curated baseline: colours, stadiums, coverage families, fallbacks. */
  baseline: Team[];
  notes: string[];
}

export const gamesPlayed = (agg: PbpAgg | null, nv: string) => agg?.teams.get(nv)?.games.size ?? 0;
/** Weight on the current season vs the prior season for a team. */
export const blendWeight = (gp: number) => gp / (gp + 6);
