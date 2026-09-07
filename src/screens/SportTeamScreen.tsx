/**
 * A team page, painted in that team's colours.
 *
 * The football team pages carry depth charts and per-player profiles. The
 * generic feeds have neither, so this page is built from what is real: where
 * the rating comes from, what the schedule has already said about them, and
 * what the model makes of what is left.
 */
import React, { useMemo } from 'react';
import { View, Text, ScrollView, TouchableOpacity, StyleSheet, ActivityIndicator } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { colors, numeric, radius, spacing } from '@/theme';
import { RefMark } from '@/components/RefMark';
import { useActiveLeague } from '@/league/LeagueContext';
import { useEngagement } from '@/context/EngagementContext';
import { useEntitlements } from '@/context/EntitlementsContext';
import { useLive } from '@/live/LiveContext';
import { useSports } from '@/sports/SportsContext';
import { LEAGUE_BY_KEY, profileFor, type LeagueKey } from '@/sports/types';
import { gradeOf } from '@/screens/SportTeamsScreen';
import { SportRosterRow } from '@/components/SportRosterRow';
import { byUnit, useRoster } from '@/sports/roster';
import { tintOver } from '@/utils/tint';
import { haptic } from '@/utils/haptics';

interface Props {
  teamId: string;
  onBack: () => void;
  onOpenTeam: (id: string) => void;
  onOpenGame: (teamId: string, gameId: string) => void;
  onOpenPlayer: (teamId: string, playerId: string) => void;
  onUpgrade?: () => void;
}

const dayOf = (iso: string) => new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });

export function SportTeamScreen({ teamId, onBack, onOpenTeam, onOpenGame, onOpenPlayer, onUpgrade }: Props) {
  const view = useActiveLeague();
  const eng = useEngagement();
  const ent = useEntitlements();
  const live = useLive();
  const { feeds } = useSports();
  const meta = LEAGUE_BY_KEY[view.id];
  const profile = profileFor(view.id);

  const team = view.teamRef(teamId);
  const rating = useMemo(() => {
    const feed = feeds[view.id as LeagueKey];
    return (feed?.teams?.teams ?? []).find((t) => t.id === teamId) ?? null;
  }, [feeds, view.id, teamId]);

  const roster = useRoster(view.id as LeagueKey, teamId);
  const units = useMemo(() => byUnit(roster.players, profile.sport), [roster.players, profile.sport]);

  const games = useMemo(
    () => view.games
      .filter((g) => g.awayId === teamId || g.homeId === teamId)
      .map((g) => {
        const s = live.scores.get(g.id);
        return !s || g.status === 'final' ? g : { ...g, awayScore: s.awayScore ?? g.awayScore, homeScore: s.homeScore ?? g.homeScore, status: s.status, statusDetail: s.statusDetail ?? g.statusDetail };
      })
      .sort((a, b) => a.kickoff.localeCompare(b.kickoff)),
    [view.games, teamId, live.scores],
  );

  const played = games.filter((g) => g.status === 'final');
  const upcoming = games.filter((g) => g.status !== 'final');

  /** What the results actually say, independent of the rating. */
  const tally = useMemo(() => {
    let w = 0; let l = 0; let d = 0; let scored = 0; let allowed = 0;
    for (const g of played) {
      const home = g.homeId === teamId;
      const own = (home ? g.homeScore : g.awayScore) ?? 0;
      const opp = (home ? g.awayScore : g.homeScore) ?? 0;
      scored += own; allowed += opp;
      if (own > opp) w += 1; else if (own < opp) l += 1; else d += 1;
    }
    return { w, l, d, scored, allowed, n: played.length };
  }, [played, teamId]);

  if (!team) {
    return (
      <View style={styles.missing}>
        <Text style={styles.missingText}>That team is not in the loaded {meta.name} feed.</Text>
        <TouchableOpacity style={styles.missingBtn} onPress={onBack}><Text style={styles.missingBtnText}>Go back</Text></TouchableOpacity>
      </View>
    );
  }

  const following = eng.isFollowing(teamId);
  const grade = rating ? gradeOf(rating.rating) : null;
  const rank = useMemo(() => {
    const feed = feeds[view.id as LeagueKey];
    const list = [...(feed?.teams?.teams ?? [])].sort((a, b) => b.rating - a.rating);
    const i = list.findIndex((t) => t.id === teamId);
    return i < 0 ? null : { at: i + 1, of: list.length };
  }, [feeds, view.id, teamId]);

  return (
    <ScrollView style={styles.root} contentContainerStyle={styles.body}>
      <LinearGradient colors={[tintOver(team.colors.primary, 0.55), tintOver(team.colors.secondary || team.colors.primary, 0.22), colors.bg]} style={styles.hero}>
        <View style={styles.heroTop}>
          <RefMark team={team} size={58} disc />
          <View style={{ flex: 1 }}>
            <Text style={styles.name} numberOfLines={2}>
              {team.rank ? <Text style={styles.pollRank}>#{team.rank} </Text> : null}{team.name}
            </Text>
            <Text style={styles.group} numberOfLines={1}>{team.group} · {meta.name}</Text>
          </View>
          <TouchableOpacity
            style={[styles.follow, following && styles.followOn]}
            activeOpacity={0.85}
            onPress={() => { haptic('select'); if (eng.toggleFollow(teamId, ent.ent.follows) === 'limit') onUpgrade?.(); }}
            accessibilityRole="button"
            accessibilityLabel={following ? 'Unfollow this team' : 'Follow this team'}
          >
            <Ionicons name={following ? 'star' : 'star-outline'} size={14} color={following ? colors.bg : colors.ink} />
            <Text style={[styles.followText, following && { color: colors.bg }]}>{following ? 'Following' : 'Follow'}</Text>
          </TouchableOpacity>
        </View>

        <View style={styles.tiles}>
          <Tile
            label="Record"
            value={tally.n ? `${tally.w}-${tally.l}${profile.draws ? `-${tally.d}` : ''}` : team.record || '—'}
            sub={tally.n ? `${tally.n} on the board` : 'season not started'}
          />
          <Tile
            label="Rating"
            value={rating ? Math.round(rating.rating).toString() : '—'}
            sub={rank ? `${rank.at} of ${rank.of} in ${meta.short}` : 'not rated yet'}
          />
          <Tile
            label="Grade"
            value={grade == null ? '—' : grade.toFixed(1)}
            sub={rating ? `${rating.played} game${rating.played === 1 ? '' : 's'} behind it` : 'no games behind it'}
          />
        </View>
      </LinearGradient>

      {!!rating && (
        <View style={styles.card}>
          <Text style={styles.cardTitle}>How the rating is built</Text>
          <Text style={styles.muted}>
            Every result moves the rating by how far it landed from what was expected, damped by margin — a
            {' '}{profile.unit === 'run' ? '10-run' : profile.unit === 'goal' ? '5-goal' : '30-point'} win over a bad side moves it less than
            the scoreboard suggests. It carries {Math.round((1 - 0.72) * 100)}% of last season forward, and its confidence grows with games played.
          </Text>
          <View style={styles.rowStats}>
            <Stat label={`${profile.unit}s scored`} value={`${rating.attack >= 1 ? '+' : ''}${Math.round((rating.attack - 1) * 100)}%`} good={rating.attack >= 1} />
            <Stat label={`${profile.unit}s allowed`} value={`${rating.defence <= 1 ? '' : '+'}${Math.round((rating.defence - 1) * 100)}%`} good={rating.defence <= 1} />
            <Stat label="Per game" value={tally.n ? `${(tally.scored / tally.n).toFixed(1)} – ${(tally.allowed / tally.n).toFixed(1)}` : '—'} good={tally.scored >= tally.allowed} />
          </View>
        </View>
      )}

      {(roster.players.length > 0 || roster.loading || roster.missing) && (
        <View style={styles.card}>
          <View style={styles.rosterHead}>
            <Text style={styles.cardTitle}>Roster</Text>
            {roster.players.length > 0 && (
              <Text style={styles.rosterCount}>
                {roster.players.length} listed
                {roster.statsSource === 'none' ? ' · no league stats published' : ` · ${roster.players.filter((pl) => pl.rating != null).length} graded`}
                {roster.players.length > 4 && !roster.players.some((pl) => pl.headshotUrl) ? ' · no photos published' : ''}
              </Text>
            )}
          </View>
          {roster.loading && !roster.players.length && <ActivityIndicator color={colors.green} style={{ marginVertical: 16 }} />}
          {roster.missing && (
            <Text style={styles.muted}>
              No roster is published for {meta.name}. Leagues with hundreds of teams are skipped — the whole set would be
              tens of megabytes for a page almost nobody opens.
            </Text>
          )}
          {units.map(([unit, list]) => (
            <View key={unit} style={styles.unit}>
              <Text style={styles.unitTitle}>{unit}</Text>
              {list.map((pl) => (
                <SportRosterRow
                  key={pl.id}
                  player={pl}
                  team={team}
                  showPos={profile.sport !== 'baseball'}
                  onPress={() => { haptic('light'); onOpenPlayer(teamId, pl.id); }}
                />
              ))}
            </View>
          ))}
        </View>
      )}

      {upcoming.length > 0 && (
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Next up</Text>
          {upcoming.slice(0, 6).map((g) => {
            const home = g.homeId === teamId;
            const oppId = home ? g.awayId : g.homeId;
            const opp = view.teamRef(oppId);
            const rec = view.findRecord(g.id);
            const winPct = rec ? (home ? rec.homeWinPct : rec.awayWinPct) : null;
            return (
              <TouchableOpacity key={g.id} style={styles.gameRow} activeOpacity={0.85} onPress={() => { haptic('light'); onOpenGame(teamId, g.id); }}>
                <Text style={styles.gameDay}>{dayOf(g.kickoff)}</Text>
                <RefMark team={opp} size={24} disc />
                <Text style={styles.gameOpp} numberOfLines={1}>{home ? 'vs' : '@'} {opp?.abbr ?? oppId.toUpperCase()}</Text>
                {g.status === 'in_progress' ? (
                  <Text style={styles.liveTag}>{g.statusDetail || 'Live'}</Text>
                ) : winPct != null ? (
                  <Text style={[styles.gameWin, numeric, { color: winPct >= 50 ? colors.green : colors.inkDim }]}>{winPct.toFixed(0)}%</Text>
                ) : (
                  <Text style={styles.gameWin}>—</Text>
                )}
                <Ionicons name="chevron-forward" size={14} color={colors.inkGhost} />
              </TouchableOpacity>
            );
          })}
        </View>
      )}

      {played.length > 0 && (
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Results</Text>
          {[...played].reverse().slice(0, 12).map((g) => {
            const home = g.homeId === teamId;
            const oppId = home ? g.awayId : g.homeId;
            const opp = view.teamRef(oppId);
            const own = (home ? g.homeScore : g.awayScore) ?? 0;
            const other = (home ? g.awayScore : g.homeScore) ?? 0;
            const mark = own > other ? 'W' : own < other ? 'L' : 'D';
            const tone = mark === 'W' ? colors.green : mark === 'L' ? colors.negative : colors.gold;
            return (
              <TouchableOpacity key={g.id} style={styles.gameRow} activeOpacity={0.85} onPress={() => { haptic('light'); onOpenGame(teamId, g.id); }}>
                <Text style={styles.gameDay}>{dayOf(g.kickoff)}</Text>
                <TouchableOpacity onPress={() => onOpenTeam(oppId)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                  <RefMark team={opp} size={24} disc />
                </TouchableOpacity>
                <Text style={styles.gameOpp} numberOfLines={1}>{home ? 'vs' : '@'} {opp?.abbr ?? oppId.toUpperCase()}</Text>
                <Text style={[styles.result, numeric, { color: tone }]}>{mark} {own}–{other}</Text>
                <Ionicons name="chevron-forward" size={14} color={colors.inkGhost} />
              </TouchableOpacity>
            );
          })}
        </View>
      )}

      {!games.length && (
        <View style={styles.card}>
          <Text style={styles.muted}>
            No {meta.name} games on the board for {team.abbr} yet. Schedules publish about two weeks ahead.
          </Text>
        </View>
      )}
    </ScrollView>
  );
}

function Tile({ label, value, sub }: { label: string; value: string; sub: string }) {
  return (
    <View style={styles.tile}>
      <Text style={styles.tileLabel}>{label}</Text>
      <Text style={[styles.tileValue, numeric]} numberOfLines={1}>{value}</Text>
      <Text style={styles.tileSub} numberOfLines={1}>{sub}</Text>
    </View>
  );
}

function Stat({ label, value, good }: { label: string; value: string; good: boolean }) {
  return (
    <View style={styles.stat}>
      <Text style={[styles.statValue, numeric, { color: good ? colors.green : colors.inkDim }]}>{value}</Text>
      <Text style={styles.statLabel} numberOfLines={1}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  body: { paddingBottom: 40 },

  missing: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 10, backgroundColor: colors.bg, padding: spacing.xl },
  missingText: { color: colors.inkFaint, fontSize: 13, textAlign: 'center' },
  missingBtn: { paddingHorizontal: 18, paddingVertical: 10, borderRadius: radius.pill, backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border },
  missingBtnText: { color: colors.ink, fontSize: 12, fontWeight: '800' },

  hero: { paddingHorizontal: spacing.lg, paddingTop: spacing.lg, paddingBottom: spacing.lg },
  heroTop: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  name: { color: colors.ink, fontSize: 18, fontWeight: '900' },
  pollRank: { color: colors.gold },
  group: { color: colors.inkFaint, fontSize: 11, marginTop: 2 },
  follow: { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 11, paddingVertical: 7, borderRadius: radius.pill, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.card },
  followOn: { backgroundColor: colors.gold, borderColor: colors.gold },
  followText: { color: colors.ink, fontSize: 11, fontWeight: '800' },

  tiles: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.lg },
  tile: { flex: 1, padding: spacing.sm, borderRadius: radius.md, backgroundColor: 'rgba(5,8,12,0.5)', borderWidth: 1, borderColor: colors.border },
  tileLabel: { color: colors.inkFaint, fontSize: 9, fontWeight: '900', letterSpacing: 0.8, textTransform: 'uppercase' },
  tileValue: { color: colors.ink, fontSize: 17, fontWeight: '900', marginTop: 3 },
  tileSub: { color: colors.inkGhost, fontSize: 9.5, marginTop: 2 },

  card: { marginHorizontal: spacing.lg, marginTop: spacing.md, padding: spacing.md, backgroundColor: colors.card, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border },
  cardTitle: { color: colors.ink, fontSize: 13, fontWeight: '900', marginBottom: spacing.sm },
  rosterHead: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', gap: spacing.sm },
  rosterCount: { color: colors.inkGhost, fontSize: 10, marginBottom: spacing.sm },
  unit: { marginTop: spacing.sm },
  unitTitle: { color: colors.inkFaint, fontSize: 9.5, fontWeight: '900', letterSpacing: 1.1, textTransform: 'uppercase', marginBottom: 4 },
  muted: { color: colors.inkFaint, fontSize: 11, lineHeight: 16 },

  rowStats: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.md },
  stat: { flex: 1, alignItems: 'center', padding: spacing.sm, borderRadius: radius.md, backgroundColor: colors.cardAlt },
  statValue: { fontSize: 14, fontWeight: '900' },
  statLabel: { color: colors.inkGhost, fontSize: 9, marginTop: 2, textAlign: 'center' },

  gameRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingVertical: 9, borderTopWidth: 1, borderTopColor: colors.border },
  gameDay: { color: colors.inkFaint, fontSize: 10.5, fontWeight: '700', width: 46 },
  gameOpp: { flex: 1, color: colors.ink, fontSize: 12.5, fontWeight: '800' },
  gameWin: { color: colors.inkDim, fontSize: 12, fontWeight: '900' },
  result: { fontSize: 12, fontWeight: '900' },
  liveTag: { color: colors.live, fontSize: 10.5, fontWeight: '900' },
});
