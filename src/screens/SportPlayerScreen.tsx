/**
 * A player page for the generic leagues.
 *
 * The football player pages are built on snap counts and play-by-play, and
 * inventing an equivalent for a shortstop would be worse than not having one.
 * This page shows what is actually known: who they are, what they have done
 * this season, and where that sits in their league. Where a number is missing
 * it says so instead of filling the space.
 */
import React, { useMemo } from 'react';
import { View, Text, ScrollView, TouchableOpacity, StyleSheet, ActivityIndicator } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { colors, numeric, radius, spacing } from '@/theme';
import { PlayerAvatar } from '@/components/PlayerAvatar';
import { RefMark } from '@/components/RefMark';
import { useActiveLeague } from '@/league/LeagueContext';
import { useRoster, type SportPlayer } from '@/sports/roster';
import { LEAGUE_BY_KEY, type LeagueKey } from '@/sports/types';
import { tintOver } from '@/utils/tint';
import { sizedHeadshot } from '@/utils/roster';
import { haptic } from '@/utils/haptics';

interface Props {
  teamId: string;
  playerId: string;
  onBack: () => void;
  onOpenTeam: (id: string) => void;
}

export function SportPlayerScreen({ teamId, playerId, onBack, onOpenTeam }: Props) {
  const view = useActiveLeague();
  const meta = LEAGUE_BY_KEY[view.id];
  const { players, loading } = useRoster(view.id as LeagueKey, teamId);
  const team = view.teamRef(teamId);

  const player = useMemo(() => players.find((p) => p.id === playerId) ?? null, [players, playerId]);
  /** Everyone at the same position, so "third best" means something. */
  const peers = useMemo(
    () => players.filter((p) => p.unit === player?.unit && p.rating != null).sort((a, b) => (b.rating ?? 0) - (a.rating ?? 0)),
    [players, player],
  );
  const rank = player ? peers.findIndex((p) => p.id === player.id) : -1;

  if (loading && !player) return <ActivityIndicator color={colors.green} style={{ marginTop: 60 }} />;

  if (!player) {
    return (
      <View style={styles.missing}>
        <Ionicons name="person-outline" size={22} color={colors.inkGhost} />
        <Text style={styles.missingText}>That player is not on the published {meta.name} roster.</Text>
        <TouchableOpacity style={styles.missingBtn} onPress={onBack}><Text style={styles.missingBtnText}>Go back</Text></TouchableOpacity>
      </View>
    );
  }

  const bio: [string, string][] = [
    ['Position', player.pos],
    ...(player.height ? [['Height', player.height] as [string, string]] : []),
    ...(player.weight ? [['Weight', player.weight] as [string, string]] : []),
    ...(player.age != null ? [['Age', `${player.age}`] as [string, string]] : []),
    ...(player.experience != null ? [['Experience', player.experience <= 1 ? 'Rookie' : `${player.experience} seasons`] as [string, string]] : []),
    ...(player.college ? [['College', player.college] as [string, string]] : []),
    ...(player.birthplace ? [['From', player.birthplace] as [string, string]] : []),
  ];

  return (
    <ScrollView style={styles.root} contentContainerStyle={styles.body}>
      <LinearGradient
        colors={[tintOver(team?.colors.primary ?? meta.accent, 0.5), tintOver(team?.colors.secondary ?? meta.accent, 0.18), colors.bg]}
        style={styles.hero}
      >
        <View style={styles.heroRow}>
          <PlayerAvatar uri={player.headshotUrl ? sizedHeadshot(player.headshotUrl, 78) : null} name={player.name} size={78} tint={team?.colors} />
          <View style={{ flex: 1 }}>
            <Text style={styles.name} numberOfLines={2}>{player.name}</Text>
            <TouchableOpacity
              style={styles.teamRow}
              activeOpacity={0.8}
              onPress={() => { haptic('light'); onOpenTeam(teamId); }}
              accessibilityRole="button"
            >
              <RefMark team={team} size={18} disc />
              <Text style={styles.teamText} numberOfLines={1}>
                {player.jersey ? `#${player.jersey} · ` : ''}{player.pos} · {team?.abbr ?? ''}
              </Text>
              <Ionicons name="chevron-forward" size={13} color={colors.inkFaint} />
            </TouchableOpacity>
            {!!player.injury && (
              <View style={styles.injury}>
                <Ionicons name="medkit" size={11} color={colors.negative} />
                <Text style={styles.injuryText} numberOfLines={1}>{player.injury}</Text>
              </View>
            )}
          </View>
        </View>
      </LinearGradient>

      {player.stats.length > 0 ? (
        <View style={styles.card}>
          <Text style={styles.cardTitle}>This season</Text>
          <View style={styles.statRow}>
            {player.stats.map((s) => (
              <View key={s.label} style={styles.stat}>
                <Text style={[styles.statValue, numeric]}>{s.value}</Text>
                <Text style={styles.statLabel}>{s.label}</Text>
                {s.rank != null && (
                  <Text style={styles.statRank} numberOfLines={1}>
                    {ordinal(s.rank)}{s.rankOf ? ` of ${s.rankOf}` : ''} in {meta.short}
                  </Text>
                )}
                {s.percentile != null && (
                  <View style={styles.pctTrack}>
                    <View style={[styles.pctFill, { width: `${Math.max(3, Math.min(100, s.percentile))}%` }]} />
                  </View>
                )}
              </View>
            ))}
          </View>
          {player.rating != null && (
            <Text style={styles.muted}>
              Grade {player.rating} — where {player.stats[0]?.label ?? 'this'} sits against every ranked player in {meta.short}
              {rank >= 0 ? `, ${ordinal(rank + 1)} of ${peers.length} on this roster` : ''}. It is a comparison, not a projection: it
              says where this season has ranked, not what happens next.
            </Text>
          )}
        </View>
      ) : (
        <View style={styles.card}>
          <Text style={styles.cardTitle}>This season</Text>
          <Text style={styles.muted}>
            No published statistics yet. That usually means a player has not appeared this season, or has not reached the
            threshold the league qualifies on — either way there is nothing to grade, so nothing is graded.
          </Text>
        </View>
      )}

      <View style={styles.card}>
        <Text style={styles.cardTitle}>Profile</Text>
        {bio.map(([k, v]) => (
          <View key={k} style={styles.bioRow}>
            <Text style={styles.bioKey}>{k}</Text>
            <Text style={styles.bioValue} numberOfLines={1}>{v}</Text>
          </View>
        ))}
        {!!player.status && player.status !== 'Active' && (
          <View style={styles.bioRow}>
            <Text style={styles.bioKey}>Status</Text>
            <Text style={[styles.bioValue, { color: colors.gold }]}>{player.status}</Text>
          </View>
        )}
      </View>

      {peers.length > 1 && (
        <View style={styles.card}>
          <Text style={styles.cardTitle}>{player.unit} on this roster</Text>
          {peers.slice(0, 6).map((p, i) => (
            <View key={p.id} style={styles.peerRow}>
              <Text style={[styles.peerRank, numeric]}>{i + 1}</Text>
              <Text style={[styles.peerName, p.id === player.id && { color: colors.green }]} numberOfLines={1}>{p.name}</Text>
              <Text style={styles.peerLine} numberOfLines={1}>{p.line ?? '—'}</Text>
              <Text style={[styles.peerRating, numeric]}>{p.rating}</Text>
            </View>
          ))}
        </View>
      )}

      <Text style={styles.fine}>
        Rosters, headshots and season lines come from the league's public feeds and rebuild on a schedule. The app does not
        model individual players — the ratings that drive its projections are team ratings, and a player page is context,
        not an input.
      </Text>
    </ScrollView>
  );
}

const ordinal = (n: number) => {
  const s = ['th', 'st', 'nd', 'rd'];
  const v = n % 100;
  return n + (s[(v - 20) % 10] ?? s[v] ?? s[0]);
};

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  body: { paddingBottom: 40 },

  missing: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 10, backgroundColor: colors.bg, padding: spacing.xl },
  missingText: { color: colors.inkFaint, fontSize: 13, textAlign: 'center' },
  missingBtn: { paddingHorizontal: 18, paddingVertical: 10, borderRadius: radius.pill, backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border },
  missingBtnText: { color: colors.ink, fontSize: 12, fontWeight: '800' },

  hero: { paddingHorizontal: spacing.lg, paddingTop: spacing.lg, paddingBottom: spacing.lg },
  heroRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  name: { color: colors.ink, fontSize: 20, fontWeight: '900' },
  teamRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 5 },
  teamText: { flex: 1, color: colors.inkDim, fontSize: 12, fontWeight: '700' },
  injury: { flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 6 },
  injuryText: { flex: 1, color: colors.negative, fontSize: 11, fontWeight: '800' },

  card: { marginHorizontal: spacing.lg, marginTop: spacing.md, padding: spacing.md, backgroundColor: colors.card, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border },
  cardTitle: { color: colors.ink, fontSize: 13, fontWeight: '900', marginBottom: spacing.sm },
  muted: { color: colors.inkFaint, fontSize: 11, lineHeight: 16, marginTop: spacing.sm },
  fine: { color: colors.inkGhost, fontSize: 9.5, lineHeight: 14, marginHorizontal: spacing.lg, marginTop: spacing.lg },

  statRow: { flexDirection: 'row', gap: spacing.sm },
  stat: { flex: 1, padding: spacing.sm, borderRadius: radius.md, backgroundColor: colors.cardAlt },
  statValue: { color: colors.ink, fontSize: 18, fontWeight: '900' },
  statLabel: { color: colors.inkFaint, fontSize: 9, fontWeight: '900', letterSpacing: 0.7, textTransform: 'uppercase', marginTop: 2 },
  statRank: { color: colors.inkGhost, fontSize: 9, marginTop: 3 },
  pctTrack: { height: 4, borderRadius: 2, backgroundColor: colors.border, marginTop: 6, overflow: 'hidden' },
  pctFill: { height: 4, borderRadius: 2, backgroundColor: colors.green },

  bioRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.md, paddingVertical: 7, borderTopWidth: 1, borderTopColor: colors.border },
  bioKey: { color: colors.inkFaint, fontSize: 11.5 },
  bioValue: { flex: 1, color: colors.ink, fontSize: 12, fontWeight: '700', textAlign: 'right' },

  peerRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingVertical: 7, borderTopWidth: 1, borderTopColor: colors.border },
  peerRank: { color: colors.inkGhost, fontSize: 11, fontWeight: '900', width: 16 },
  peerName: { flex: 1.2, color: colors.ink, fontSize: 12, fontWeight: '800' },
  peerLine: { flex: 1, color: colors.inkFaint, fontSize: 10.5, textAlign: 'right' },
  peerRating: { color: colors.gold, fontSize: 12.5, fontWeight: '900', width: 26, textAlign: 'right' },
});
