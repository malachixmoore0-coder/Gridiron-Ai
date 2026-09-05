import { useMemo } from 'react';
import { analyzeMatchup, matchupKey } from '@/engine';
import type { MatchupAnalysis, MatchupInput } from '@/engine/types';
import { hashString } from '@/engine/rng';
import { getTeam } from '@/data/teams';
import { useSettings, MatchupContext } from '@/context/SettingsContext';

export interface RunRequest {
  awayId: string;
  homeId: string;
  ctx: MatchupContext;
}

export const DEFAULT_CTX: MatchupContext = { neutralSite: false, primetime: false, weather: 'auto' };

/** Build the engine input for a request using the app-wide injury report. */
export function buildInput(req: RunRequest, injuredOut: string[], questionable: string[]): MatchupInput {
  const home = getTeam(req.homeId);
  const away = getTeam(req.awayId);
  const ids = new Set([...home.players, ...away.players].map((p) => p.id));
  return {
    home,
    away,
    neutralSite: req.ctx.neutralSite,
    primetime: req.ctx.primetime,
    weather: req.ctx.weather === 'auto' ? undefined : req.ctx.weather,
    injuredOut: injuredOut.filter((id) => ids.has(id)),
    questionable: questionable.filter((id) => ids.has(id)),
  };
}

/**
 * Runs the full engine for a matchup, memoised on everything that can change
 * the answer (teams, context, injuries, weights, sim count, HFA, re-roll seed).
 */
export function useAnalysis(req: RunRequest, reroll = 0, simulations?: number): MatchupAnalysis {
  const s = useSettings();
  const inj = s.injuredOut.join(',');
  const q = s.questionable.join(',');
  const w = `${s.weights.scheme}|${s.weights.personnel}|${s.weights.environment}|${s.weights.xfactor}`;
  const runs = simulations ?? s.simulations;
  return useMemo(() => {
    const input = buildInput(req, s.injuredOut, s.questionable);
    const seed = hashString(`${matchupKey(input)}#${reroll}`);
    return analyzeMatchup(input, { weights: s.weights, simulations: runs, homeFieldBase: s.homeFieldBase, seed });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [req.awayId, req.homeId, req.ctx.neutralSite, req.ctx.primetime, req.ctx.weather, inj, q, w, runs, s.homeFieldBase, reroll]);
}
