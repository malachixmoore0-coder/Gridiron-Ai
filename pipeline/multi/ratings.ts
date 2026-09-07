/**
 * Ratings, from results alone.
 *
 * There is no equivalent of nflverse for the WNBA or college baseball, so the
 * rating every generic league runs on is Elo built from its own finished games —
 * plus a scoring profile per team so a projected total is not just the league
 * average with a rating gap bolted on.
 *
 * Three properties matter and each costs something:
 *   • It is *honest about the early season.* A team with four games gets a
 *     rating pulled hard toward the mean, and the app says how many games are
 *     behind it, because a 3-0 start is not evidence of much.
 *   • It is *margin-aware but capped.* Winning by forty says more than winning
 *     by two and much less than forty times as much, so the margin multiplier is
 *     logarithmic — the standard fix for Elo rewarding blowouts too richly.
 *   • It carries *nothing across seasons* except a regression to the mean. Last
 *     year's roster is not this year's, most of all in college.
 */
import type { SportProfile } from '../../src/sports/types';
import type { EspnEvent } from './espn';

const START = 1500;
const REGRESS = 0.72; // how much of last season survives into this one

export interface TeamRating {
  rating: number;
  played: number;
  pointsFor: number;
  pointsAgainst: number;
  attack: number;
  defence: number;
}

/** K falls as a season accumulates: early games should move a rating more. */
const kFor = (played: number, sport: SportProfile['sport']) => {
  const base = sport === 'baseball' ? 6 : sport === 'soccer' ? 20 : sport === 'basketball' ? 22 : 26;
  return base * (1 + 6 / (played + 6));
};

/** Expected score from a rating gap — the classic logistic on 400. */
const expected = (a: number, b: number) => 1 / (1 + 10 ** ((b - a) / 400));

export function buildRatings(events: EspnEvent[], p: SportProfile, priors?: Map<string, number>): Map<string, TeamRating> {
  const table = new Map<string, TeamRating>();
  const get = (id: string): TeamRating => {
    let r = table.get(id);
    if (!r) {
      const prior = priors?.get(id);
      r = {
        rating: prior != null ? START + (prior - START) * REGRESS : START,
        played: 0, pointsFor: 0, pointsAgainst: 0, attack: 1, defence: 1,
      };
      table.set(id, r);
    }
    return r;
  };

  const finals = events
    .filter((e) => e.status === 'final' && e.homeScore != null && e.awayScore != null)
    .sort((a, b) => a.date.localeCompare(b.date));

  for (const e of finals) {
    const home = get(e.homeId);
    const away = get(e.awayId);
    const hs = e.homeScore as number;
    const as = e.awayScore as number;

    const edge = e.neutral ? 0 : p.homeEdge / p.eloScale; // home edge expressed in rating points
    const expHome = expected(home.rating + edge, away.rating);
    const actual = hs > as ? 1 : hs < as ? 0 : 0.5;

    // Logarithmic margin multiplier, damped for the rating gap so a good team
    // beating a bad one badly does not run away with the table.
    const margin = Math.abs(hs - as);
    const scale = p.sport === 'baseball' || p.sport === 'soccer' ? 1 : 7;
    const mult = Math.log(margin / scale + 1.6) * (2.2 / ((Math.abs(home.rating - away.rating) * 0.001) + 2.2));

    const k = kFor(Math.min(home.played, away.played), p.sport);
    const delta = k * mult * (actual - expHome);
    home.rating += delta;
    away.rating -= delta;

    home.played += 1; away.played += 1;
    home.pointsFor += hs; home.pointsAgainst += as;
    away.pointsFor += as; away.pointsAgainst += hs;
  }

  // Scoring profile: how a team's rates compare to the league's, shrunk toward
  // average until there are enough games to trust them.
  const played = [...table.values()].filter((r) => r.played > 0);
  const leagueFor = played.reduce((s, r) => s + r.pointsFor, 0) / Math.max(1, played.reduce((s, r) => s + r.played, 0));
  for (const r of table.values()) {
    if (!r.played || leagueFor <= 0) { r.attack = 1; r.defence = 1; continue; }
    const w = r.played / (r.played + 8);
    r.attack = 1 + ((r.pointsFor / r.played) / leagueFor - 1) * w;
    r.defence = 1 + ((r.pointsAgainst / r.played) / leagueFor - 1) * w;
  }
  return table;
}

/** Rating → a readable 1-10 grade, for the team page. */
export const gradeOf = (rating: number) =>
  Math.max(1, Math.min(10, Math.round(((rating - 1350) / 300) * 9 + 1)));
