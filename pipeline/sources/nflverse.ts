/**
 * nflverse loaders. All public, keyless, updated by the nflverse automation
 * (play-by-play within minutes of games ending, rosters/depth charts daily,
 * injuries as reports are filed). https://github.com/nflverse/nflverse-data
 */
import { download, forEachRow, readCsv } from '../lib/fetch';
import { bool, num } from '../lib/util';

const REL = 'https://github.com/nflverse/nflverse-data/releases/download';
export const URLS = {
  games: 'https://raw.githubusercontent.com/nflverse/nfldata/master/data/games.csv',
  pbp: (season: number) => `${REL}/pbp/play_by_play_${season}.csv.gz`,
  rosters: (season: number) => `${REL}/rosters/roster_${season}.csv`,
  depthCharts: (season: number) => `${REL}/depth_charts/depth_charts_${season}.csv`,
  injuries: (season: number) => `${REL}/injuries/injuries_${season}.csv`,
  snapCounts: (season: number) => `${REL}/snap_counts/snap_counts_${season}.csv`,
  ftn: (season: number) => `${REL}/ftn_charting/ftn_charting_${season}.csv`,
  advPass: `${REL}/pfr_advstats/advstats_season_pass.csv`,
  advDef: `${REL}/pfr_advstats/advstats_season_def.csv`,
  advRec: `${REL}/pfr_advstats/advstats_season_rec.csv`,
};

/* ------------------------------------------------------------------ */
/* Schedule / results                                                   */
/* ------------------------------------------------------------------ */
export interface GameRow {
  game_id: string; season: number; game_type: string; week: number; gameday: string; weekday: string; gametime: string;
  away_team: string; home_team: string; away_score: number; home_score: number; location: string; div_game: boolean;
  spread_line: number; total_line: number; away_moneyline: number; home_moneyline: number;
  roof: string; surface: string; temp: number; wind: number; stadium: string; stadium_id: string;
  away_coach: string; home_coach: string; away_qb_name: string; home_qb_name: string; espn: string;
}

export async function loadGames(): Promise<GameRow[]> {
  const file = await download(URLS.games, 'nflverse schedule & results (nfldata games.csv)', { ttlMinutes: 30 });
  const rows = await readCsv(file!);
  return rows.map((r) => ({
    game_id: r.game_id, season: num(r.season), game_type: r.game_type, week: num(r.week), gameday: r.gameday, weekday: r.weekday, gametime: r.gametime,
    away_team: r.away_team, home_team: r.home_team, away_score: num(r.away_score), home_score: num(r.home_score), location: r.location, div_game: r.div_game === '1',
    spread_line: num(r.spread_line), total_line: num(r.total_line), away_moneyline: num(r.away_moneyline), home_moneyline: num(r.home_moneyline),
    roof: r.roof, surface: r.surface, temp: num(r.temp), wind: num(r.wind), stadium: r.stadium, stadium_id: r.stadium_id,
    away_coach: r.away_coach, home_coach: r.home_coach, away_qb_name: r.away_qb_name, home_qb_name: r.home_qb_name, espn: r.espn,
  }));
}

/* ------------------------------------------------------------------ */
/* Rosters, depth charts, injuries, snap counts                         */
/* ------------------------------------------------------------------ */
export interface RosterRow {
  team: string; position: string; depth_chart_position: string; status: string; full_name: string; gsis_id: string; espn_id: string; pfr_id: string;
  years_exp: number; headshot_url: string; draft_number: number; entry_year: number; jersey_number: string;
  height: number; weight: number; college: string; birth_date: string;
}
export async function loadRosters(season: number): Promise<RosterRow[]> {
  const file = await download(URLS.rosters(season), `nflverse rosters ${season}`, { ttlMinutes: 60, optional: true });
  if (!file) return [];
  return (await readCsv(file)).map((r) => ({
    team: r.team, position: r.position, depth_chart_position: r.depth_chart_position, status: r.status, full_name: r.full_name,
    gsis_id: r.gsis_id, espn_id: r.espn_id, pfr_id: r.pfr_id, years_exp: num(r.years_exp), headshot_url: r.headshot_url,
    draft_number: num(r.draft_number), entry_year: num(r.entry_year), jersey_number: r.jersey_number,
    height: num(r.height), weight: num(r.weight), college: r.college === 'NA' ? '' : (r.college ?? ''), birth_date: r.birth_date === 'NA' ? '' : (r.birth_date ?? ''),
  }));
}

export interface DepthRow { team: string; player_name: string; gsis_id: string; espn_id: string; pos_grp: string; pos_abb: string; pos_slot: number; pos_rank: number; dt: string; }
/** Latest depth chart snapshot in the file, grouped by nflverse team abbreviation. */
export async function loadDepthCharts(season: number): Promise<{ byTeam: Map<string, DepthRow[]>; asOf: string }> {
  const file = await download(URLS.depthCharts(season), `nflverse depth charts ${season}`, { ttlMinutes: 60, optional: true });
  const byTeam = new Map<string, DepthRow[]>();
  if (!file) return { byTeam, asOf: '' };
  const rows = (await readCsv(file)).map((r) => ({
    team: r.team, player_name: r.player_name, gsis_id: r.gsis_id, espn_id: r.espn_id, pos_grp: r.pos_grp, pos_abb: r.pos_abb,
    pos_slot: num(r.pos_slot), pos_rank: num(r.pos_rank), dt: r.dt,
  }));
  // Each team's most recent snapshot (teams can publish on different days).
  const latestByTeam = new Map<string, string>();
  for (const r of rows) if (!latestByTeam.has(r.team) || r.dt > latestByTeam.get(r.team)!) latestByTeam.set(r.team, r.dt);
  let asOf = '';
  for (const r of rows) {
    if (r.dt !== latestByTeam.get(r.team)) continue;
    if (r.dt > asOf) asOf = r.dt;
    if (!byTeam.has(r.team)) byTeam.set(r.team, []);
    byTeam.get(r.team)!.push(r);
  }
  return { byTeam, asOf };
}

export interface InjuryRow { team: string; week: number; gsis_id: string; full_name: string; position: string; report_status: string; report_primary_injury: string; practice_status: string; }
/** Latest week's injury report rows per team. Empty before the first report of a season. */
export async function loadInjuries(season: number): Promise<{ rows: InjuryRow[]; week: number }> {
  const file = await download(URLS.injuries(season), `nflverse injury reports ${season}`, { ttlMinutes: 30, optional: true });
  if (!file) return { rows: [], week: 0 };
  const all = (await readCsv(file)).map((r) => ({
    team: r.team, week: num(r.week), gsis_id: r.gsis_id, full_name: r.full_name, position: r.position,
    report_status: r.report_status, report_primary_injury: r.report_primary_injury, practice_status: r.practice_status,
    season_type: r.season_type,
  }));
  const week = Math.max(0, ...all.map((r) => r.week));
  return { rows: all.filter((r) => r.week === week), week };
}

export interface SnapAgg { games: number; offPct: number; defPct: number; }
/** Average snap share per player (keyed by pfr_id) over the season. */
export async function loadSnapCounts(season: number): Promise<Map<string, SnapAgg>> {
  const file = await download(URLS.snapCounts(season), `nflverse snap counts ${season}`, { ttlMinutes: 120, optional: true });
  const out = new Map<string, SnapAgg>();
  if (!file) return out;
  const acc = new Map<string, { g: number; off: number; def: number }>();
  await forEachRow(file, (get) => {
    const id = get('pfr_player_id');
    if (!id) return;
    const a = acc.get(id) ?? { g: 0, off: 0, def: 0 };
    a.g++;
    a.off += num(get('offense_pct')) || 0;
    a.def += num(get('defense_pct')) || 0;
    acc.set(id, a);
  });
  for (const [id, a] of acc) out.set(id, { games: a.g, offPct: a.off / a.g, defPct: a.def / a.g });
  return out;
}

/* ------------------------------------------------------------------ */
/* PFR advanced stats (season level)                                    */
/* ------------------------------------------------------------------ */
export interface AdvPass { pfr_id: string; team: string; season: number; pass_attempts: number; pressure_pct: number; times_blitzed: number; pa_pass_att: number; rpo_plays: number; scrambles: number; on_tgt_pct: number; }
export async function loadAdvPass(): Promise<AdvPass[]> {
  const file = await download(URLS.advPass, 'PFR advanced passing (via nflverse)', { ttlMinutes: 240, optional: true });
  if (!file) return [];
  return (await readCsv(file)).map((r) => ({
    pfr_id: r.pfr_id, team: r.team, season: num(r.season), pass_attempts: num(r.pass_attempts), pressure_pct: num(r.pressure_pct),
    times_blitzed: num(r.times_blitzed), pa_pass_att: num(r.pa_pass_att), rpo_plays: num(r.rpo_plays), scrambles: num(r.scrambles), on_tgt_pct: num(r.on_tgt_pct),
  }));
}
export interface AdvDef { pfr_id: string; tm: string; season: number; pos: string; g: number; prss: number; sk: number; bltz: number; hrry: number; qbkd: number; tgt: number; rat: number; comb: number; m_tkl_percent: number; int: number; }
export async function loadAdvDef(): Promise<AdvDef[]> {
  const file = await download(URLS.advDef, 'PFR advanced defense (via nflverse)', { ttlMinutes: 240, optional: true });
  if (!file) return [];
  return (await readCsv(file)).map((r) => ({
    pfr_id: r.pfr_id, tm: r.tm, season: num(r.season), pos: r.pos, g: num(r.g), prss: num(r.prss), sk: num(r.sk), bltz: num(r.bltz), hrry: num(r.hrry), qbkd: num(r.qbkd),
    tgt: num(r.tgt), rat: num(r.rat), comb: num(r.comb), m_tkl_percent: num(r.m_tkl_percent), int: num(r.int),
  }));
}

/* ------------------------------------------------------------------ */
/* Play-by-play aggregation (streamed)                                  */
/* ------------------------------------------------------------------ */
export interface HalfSplit { h1: number; h2: number; n1: number; n2: number; }
export interface TeamAcc {
  games: Set<string>;
  // offense
  plays: number; epa: number; success: number; passPlays: number; passEpa: number; rushPlays: number; rushEpa: number; explosive: number;
  earlyDowns: number; earlyPass: number; thirdAtt: number; thirdConv: number; fourthOpp: number; fourthGo: number;
  rzTrips: Set<string>; rzTd: number; dropbacks: number; pressuresAllowed: number; sacksAllowed: number; shotgun: number; noHuddle: number;
  shortTgtN: number; shortTgtEpa: number; airYards: number; airN: number; scrambles: number;
  offHalf: Map<string, HalfSplit>;
  // defense (what this team allowed / generated)
  dPlays: number; dEpa: number; dPassPlays: number; dPassEpa: number; dRushPlays: number; dRushEpa: number; dExplosive: number;
  dThirdAtt: number; dThirdConv: number; dDropbacks: number; pressures: number; sacks: number; takeaways: number;
  dTeRbTgtN: number; dTeRbTgtEpa: number; dShortWrTgtN: number; dShortWrTgtEpa: number; dRzTrips: Set<string>; dRzTd: number;
  defHalf: Map<string, HalfSplit>;
  // FTN charting (filled later)
  ftnPass: number; ftnPa: number; ftnMotion: number; ftnRpo: number; ftnScreens: number; dFtnPass: number; dFtnBlitz: number;
  // offense EPA split by the opponent's base front
  vs43: { n: number; epa: number }; vs34: { n: number; epa: number };
}
/** Box-score style line for one player in one game. */
export interface GameStat {
  passAtt: number; passCmp: number; passYds: number; passTd: number; passInt: number;
  rushAtt: number; rushYds: number; rushTd: number;
  tgt: number; rec: number; recYds: number; recTd: number;
  sacks: number; int: number; pbu: number; ff: number; fgm: number; fga: number; epa: number;
}
export const emptyGameStat = (): GameStat => ({ passAtt: 0, passCmp: 0, passYds: 0, passTd: 0, passInt: 0, rushAtt: 0, rushYds: 0, rushTd: 0, tgt: 0, rec: 0, recYds: 0, recTd: 0, sacks: 0, int: 0, pbu: 0, ff: 0, fgm: 0, fga: 0, epa: 0 });
export interface PlayerAcc {
  name: string; team: string; targets: number; rec: number; recYds: number; recEpa: number; rushAtt: number; rushYds: number; rushEpa: number;
  dropbacks: number; passEpa: number; cpoe: number; cpoeN: number; sacks: number; qbHits: number; ints: number; passTd: number; passInt: number;
  games: Set<string>;
  /** Per-game lines keyed by game id, with the team the player was on that day. */
  log: Map<string, GameStat & { team: string }>;
}
export interface PbpAgg {
  season: number;
  teams: Map<string, TeamAcc>;
  players: Map<string, PlayerAcc>;
  /** `${game_id}|${play_id}` → { pos, def, pass } for joining FTN charting. */
  playIndex: Map<string, { pos: string; def: string; pass: boolean }>;
  plays: number;
}

const newTeam = (): TeamAcc => ({
  games: new Set(), plays: 0, epa: 0, success: 0, passPlays: 0, passEpa: 0, rushPlays: 0, rushEpa: 0, explosive: 0,
  earlyDowns: 0, earlyPass: 0, thirdAtt: 0, thirdConv: 0, fourthOpp: 0, fourthGo: 0, rzTrips: new Set(), rzTd: 0, dropbacks: 0, pressuresAllowed: 0, sacksAllowed: 0, shotgun: 0, noHuddle: 0,
  shortTgtN: 0, shortTgtEpa: 0, airYards: 0, airN: 0, scrambles: 0, offHalf: new Map(),
  dPlays: 0, dEpa: 0, dPassPlays: 0, dPassEpa: 0, dRushPlays: 0, dRushEpa: 0, dExplosive: 0, dThirdAtt: 0, dThirdConv: 0, dDropbacks: 0, pressures: 0, sacks: 0, takeaways: 0,
  dTeRbTgtN: 0, dTeRbTgtEpa: 0, dShortWrTgtN: 0, dShortWrTgtEpa: 0, dRzTrips: new Set(), dRzTd: 0, defHalf: new Map(),
  ftnPass: 0, ftnPa: 0, ftnMotion: 0, ftnRpo: 0, ftnScreens: 0, dFtnPass: 0, dFtnBlitz: 0,
  vs43: { n: 0, epa: 0 }, vs34: { n: 0, epa: 0 },
});
const newPlayer = (name: string, team: string): PlayerAcc => ({
  name, team, targets: 0, rec: 0, recYds: 0, recEpa: 0, rushAtt: 0, rushYds: 0, rushEpa: 0, dropbacks: 0, passEpa: 0, cpoe: 0, cpoeN: 0, sacks: 0, qbHits: 0, ints: 0, passTd: 0, passInt: 0,
  games: new Set(), log: new Map(),
});

/** Stream one season of play-by-play into team + player accumulators. Returns null if the file doesn't exist yet. */
export async function aggregatePbp(season: number, posMap: Map<string, string>, frontMap: Map<string, '4-3' | '3-4'>): Promise<PbpAgg | null> {
  const file = await download(URLS.pbp(season), `nflverse play-by-play ${season}`, { ttlMinutes: 120, optional: true, timeoutMs: 600_000 });
  if (!file) return null;
  const agg: PbpAgg = { season, teams: new Map(), players: new Map(), playIndex: new Map(), plays: 0 };
  const team = (abbr: string) => { if (!agg.teams.has(abbr)) agg.teams.set(abbr, newTeam()); return agg.teams.get(abbr)!; };
  const player = (id: string, name: string, tm: string) => { if (!agg.players.has(id)) agg.players.set(id, newPlayer(name, tm)); return agg.players.get(id)!; };
  const line = (p: PlayerAcc, gameId: string, tm: string) => { let l = p.log.get(gameId); if (!l) { l = { ...emptyGameStat(), team: tm }; p.log.set(gameId, l); } p.games.add(gameId); return l; };
  const half = (m: Map<string, HalfSplit>, game: string) => { if (!m.has(game)) m.set(game, { h1: 0, h2: 0, n1: 0, n2: 0 }); return m.get(game)!; };

  await forEachRow(file, (get) => {
    if (get('season_type') !== 'REG') return;
    const pos = get('posteam');
    const def = get('defteam');
    if (!pos || !def) return;
    const playType = get('play_type');
    const isPass = get('pass') === '1';
    const isRush = get('rush') === '1';
    const gameId = get('game_id');
    const o = team(pos);
    const d = team(def);
    o.games.add(gameId);
    d.games.add(gameId);

    // Fourth-down decision making (counted on the down, before filtering to pass/rush).
    const down = num(get('down'));
    const ydstogo = num(get('ydstogo'));
    const yl = num(get('yardline_100'));
    const qtr = num(get('qtr'));
    const diff = num(get('score_differential'));
    const halfSecs = num(get('half_seconds_remaining'));
    if (down === 4 && ydstogo <= 2 && yl <= 60 && yl >= 3 && halfSecs > 120 && !(qtr >= 4 && diff < -8) && !(qtr >= 4 && diff > 8)) {
      if (isPass || isRush) { o.fourthOpp++; o.fourthGo++; }
      else if (playType === 'punt' || playType === 'field_goal') o.fourthOpp++;
    }

    if (playType === 'field_goal') {
      const k = get('kicker_player_id');
      if (k) { const l = line(player(k, get('kicker_player_name'), pos), gameId, pos); l.fga++; if (get('field_goal_result') === 'made') l.fgm++; }
    }

    if (!(isPass || isRush)) return;
    if (playType === 'qb_kneel' || playType === 'qb_spike') return;
    const epa = num(get('epa'));
    if (!Number.isFinite(epa)) return;
    agg.plays++;
    agg.playIndex.set(`${gameId}|${get('play_id')}`, { pos, def, pass: isPass });

    const yards = num(get('yards_gained')) || 0;
    const success = num(get('success')) || 0;
    const explosive = (isPass && yards >= 20) || (isRush && yards >= 10) ? 1 : 0;
    o.plays++; o.epa += epa; o.success += success; o.explosive += explosive;
    d.dPlays++; d.dEpa += epa; d.dExplosive += explosive;
    if (isPass) { o.passPlays++; o.passEpa += epa; d.dPassPlays++; d.dPassEpa += epa; }
    else { o.rushPlays++; o.rushEpa += epa; d.dRushPlays++; d.dRushEpa += epa; }
    const oppFront = frontMap.get(def);
    if (oppFront === '4-3') { o.vs43.n++; o.vs43.epa += epa; } else if (oppFront === '3-4') { o.vs34.n++; o.vs34.epa += epa; }
    if (get('shotgun') === '1') o.shotgun++;
    if (get('no_huddle') === '1') o.noHuddle++;
    if (get('qb_scramble') === '1') o.scrambles++;

    // Neutral early-down pass rate (Q1-Q3, within 14).
    if ((down === 1 || down === 2) && qtr <= 3 && Math.abs(diff) <= 14) { o.earlyDowns++; if (isPass) o.earlyPass++; }
    if (down === 3) {
      const conv = get('third_down_converted') === '1';
      const failed = get('third_down_failed') === '1';
      if (conv || failed) { o.thirdAtt++; d.dThirdAtt++; if (conv) { o.thirdConv++; d.dThirdConv++; } }
    }
    // Red zone: trips keyed by drive, TDs by drive result.
    if (yl <= 20) {
      const key = `${gameId}|${get('fixed_drive')}`;
      if (!o.rzTrips.has(key)) { o.rzTrips.add(key); d.dRzTrips.add(key); if (get('fixed_drive_result') === 'Touchdown') { o.rzTd++; d.dRzTd++; } }
    }
    // Halves for adjustment proxies.
    const gh = get('game_half');
    if (gh === 'Half1' || gh === 'Half2') {
      const ho = half(o.offHalf, gameId); const hd = half(d.defHalf, gameId);
      if (gh === 'Half1') { ho.h1 += epa; ho.n1++; hd.h1 += epa; hd.n1++; } else { ho.h2 += epa; ho.n2++; hd.h2 += epa; hd.n2++; }
    }
    // Pressure proxies + passer stats.
    if (get('qb_dropback') === '1') {
      o.dropbacks++; d.dDropbacks++;
      const hit = get('qb_hit') === '1';
      const sack = get('sack') === '1';
      if (hit || sack) { o.pressuresAllowed++; d.pressures++; }
      if (sack) { o.sacksAllowed++; d.sacks++; }
      const pid = get('passer_player_id');
      if (pid) {
        const p = player(pid, get('passer_player_name'), pos);
        p.dropbacks++; p.passEpa += epa;
        const l = line(p, gameId, pos);
        l.epa += epa;
        const sacked = get('sack') === '1';
        if (!sacked) { l.passAtt++; if (get('complete_pass') === '1') { l.passCmp++; l.passYds += yards; } }
        const cpoe = num(get('cpoe'));
        if (Number.isFinite(cpoe)) { p.cpoe += cpoe; p.cpoeN++; }
        if (get('pass_touchdown') === '1') { p.passTd++; l.passTd++; }
        if (get('interception') === '1') { p.passInt++; l.passInt++; }
      }
      const air = num(get('air_yards'));
      if (Number.isFinite(air)) { o.airYards += air; o.airN++; }
    }
    // Takeaways.
    if (get('interception') === '1' || get('fumble_lost') === '1') d.takeaways++;
    // Targets.
    const rid = get('receiver_player_id');
    if (isPass && rid) {
      const p = player(rid, get('receiver_player_name'), pos);
      p.targets++; p.recEpa += epa;
      const l = line(p, gameId, pos);
      l.tgt++; l.epa += epa;
      if (get('complete_pass') === '1') { p.rec++; p.recYds += yards; l.rec++; l.recYds += yards; if (get('pass_touchdown') === '1') l.recTd++; }
      const air = num(get('air_yards'));
      const rpos = posMap.get(rid) ?? '';
      if (Number.isFinite(air) && air <= 10) { o.shortTgtN++; o.shortTgtEpa += epa; }
      if (rpos === 'TE' || rpos === 'RB' || rpos === 'FB') { d.dTeRbTgtN++; d.dTeRbTgtEpa += epa; }
      else if (rpos === 'WR' && Number.isFinite(air) && air <= 10) { d.dShortWrTgtN++; d.dShortWrTgtEpa += epa; }
    }
    const rusher = get('rusher_player_id');
    if (isRush && rusher) {
      const p = player(rusher, get('rusher_player_name'), pos);
      p.rushAtt++; p.rushYds += yards; p.rushEpa += epa;
      const l = line(p, gameId, pos);
      l.rushAtt++; l.rushYds += yards; l.epa += epa;
      if (get('rush_touchdown') === '1') l.rushTd++;
    }
    // Defender credit.
    for (const col of ['sack_player_id', 'half_sack_1_player_id', 'half_sack_2_player_id']) {
      const id = get(col);
      if (id) { const p = player(id, get(col.replace('_id', '_name')), def); const share = col === 'sack_player_id' ? 1 : 0.5; p.sacks += share; line(p, gameId, def).sacks += share; }
    }
    for (const col of ['qb_hit_1_player_id', 'qb_hit_2_player_id']) {
      const id = get(col);
      if (id) { const p = player(id, get(col.replace('_id', '_name')), def); p.qbHits++; line(p, gameId, def); }
    }
    const intId = get('interception_player_id');
    if (intId) { const p = player(intId, get('interception_player_name'), def); p.ints++; line(p, gameId, def).int++; }
    for (const col of ['pass_defense_1_player_id', 'pass_defense_2_player_id']) {
      const id = get(col);
      if (id) line(player(id, get(col.replace('_id', '_name')), def), gameId, def).pbu++;
    }
    const ffId = get('forced_fumble_player_1_player_id');
    if (ffId) line(player(ffId, get('forced_fumble_player_1_player_name'), def), gameId, def).ff++;
  });
  return agg;
}

/** Join FTN charting (play-action, motion, RPO, blitz) onto the pbp aggregates. */
export async function applyFtn(season: number, agg: PbpAgg): Promise<boolean> {
  const file = await download(URLS.ftn(season), `FTN charting ${season} (via nflverse)`, { ttlMinutes: 120, optional: true });
  if (!file) return false;
  let joined = 0;
  await forEachRow(file, (get) => {
    const idx = agg.playIndex.get(`${get('nflverse_game_id')}|${get('nflverse_play_id')}`);
    if (!idx) return;
    joined++;
    const o = agg.teams.get(idx.pos)!;
    const d = agg.teams.get(idx.def)!;
    if (bool(get('is_motion'))) o.ftnMotion++;
    if (bool(get('is_rpo'))) o.ftnRpo++;
    if (idx.pass) {
      o.ftnPass++; d.dFtnPass++;
      if (bool(get('is_play_action'))) o.ftnPa++;
      if (bool(get('is_screen_pass'))) o.ftnScreens++;
      if (num(get('n_pass_rushers')) >= 5) d.dFtnBlitz++;
    }
  });
  return joined > 0;
}
