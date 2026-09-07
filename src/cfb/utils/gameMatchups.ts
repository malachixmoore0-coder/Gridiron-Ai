/**
 * Unit-versus-unit for a single game.
 *
 * The engine already grades every unit 1-10 and compares them inside the
 * simulation; this exposes the same comparison so a game page can show *why*
 * the number is what it is. Positive edge favours the side named first.
 *
 * Six rows, chosen because they are the six that actually move a football game:
 * both passing games against the coverage they will see, both running games
 * against the front, and the two trench matchups that decide whether any of it
 * happens.
 */
import type { Team } from '@/cfb/engine/types';

export interface UnitMatchup {
  /** "Buffalo passing" */
  label: string;
  /** "vs Kansas City pass defense" */
  against: string;
  /** Which side this row favours. */
  side: 'home' | 'away';
  /** Attacking unit's grade, 1-10. */
  attack: number;
  /** Defending unit's grade, 1-10. */
  defend: number;
  /** attack − defend, positive favours the attacking side. */
  edge: number;
  note: string;
}

const r1 = (v: number) => Math.round(v * 10) / 10;

/**
 * Pass-block and pass-rush win rates are not on the same scale — blocking wins
 * most snaps by definition — so each is graded against its own league baseline
 * instead of a single shared transform. 5.5 is average, one point is roughly a
 * quarter of a standard deviation.
 */
const grade = (v: number, base: number, spread: number) =>
  Math.max(1, Math.min(10, 5.5 + ((v - base) / spread) * 2.5));
const blockGrade = (v: number) => grade(v, 0.60, 0.05);
const rushGrade = (v: number) => grade(v, 0.42, 0.05);

export function gameMatchups(home: Team, away: Team, homeAbbr: string, awayAbbr: string): UnitMatchup[] {
  const row = (
    label: string, against: string, side: 'home' | 'away',
    attack: number, defend: number, note: string,
  ): UnitMatchup => ({ label, against, side, attack: r1(attack), defend: r1(defend), edge: r1(attack - defend), note });

  return [
    row(`${awayAbbr} passing`, `${homeAbbr} pass defense`, 'away',
      (away.offense.passEfficiency + away.offense.qb) / 2, home.defense.passDefense,
      'Quarterback and passing efficiency against the coverage they will see.'),
    row(`${homeAbbr} passing`, `${awayAbbr} pass defense`, 'home',
      (home.offense.passEfficiency + home.offense.qb) / 2, away.defense.passDefense,
      'Quarterback and passing efficiency against the coverage they will see.'),
    row(`${awayAbbr} running`, `${homeAbbr} run defense`, 'away',
      away.offense.rushEfficiency, home.defense.rushDefense,
      'Rushing efficiency against the front.'),
    row(`${homeAbbr} running`, `${awayAbbr} run defense`, 'home',
      home.offense.rushEfficiency, away.defense.rushDefense,
      'Rushing efficiency against the front.'),
    row(`${awayAbbr} protection`, `${homeAbbr} pass rush`, 'away',
      blockGrade(away.offense.pbwr), rushGrade(home.defense.prwr),
      'Pass-block win rate against pass-rush win rate — the trench matchup that decides the passing game.'),
    row(`${homeAbbr} protection`, `${awayAbbr} pass rush`, 'home',
      blockGrade(home.offense.pbwr), rushGrade(away.defense.prwr),
      'Pass-block win rate against pass-rush win rate — the trench matchup that decides the passing game.'),
  ];
}

/** The single biggest mismatch on the board, for a one-line summary. */
export function biggestEdge(rows: UnitMatchup[]): UnitMatchup | null {
  return rows.reduce<UnitMatchup | null>((best, r) => (!best || Math.abs(r.edge) > Math.abs(best.edge) ? r : best), null);
}
