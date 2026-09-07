/**
 * One golfer.
 *
 * Everything here is a season number with a league rank next to it, because
 * that is genuinely all ESPN publishes for golf — and it is enough to answer
 * the only question that matters before a tournament: how good has this player
 * been this year, compared with everyone else in the field.
 */
import React, { useEffect, useMemo } from 'react';
import { View, Text, ScrollView, TouchableOpacity, StyleSheet, Image, ActivityIndicator } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { colors, grad, numeric, radius, spacing } from '@/theme';
import { useGolf } from '@/sports/GolfContext';
import { fieldSeed, simulateField } from '@/sports/golf';
import { sizedHeadshot } from '@/utils/roster';

interface Props { playerId: string; onBack: () => void }

export function GolfPlayerScreen({ playerId, onBack }: Props) {
  const golf = useGolf();
  useEffect(() => { golf.ensure(); }, [golf]);

  const file = golf.file;
  const player = useMemo(() => file?.players.find((p) => p.id === playerId) ?? null, [file, playerId]);

  /** Where they stand in whatever is being played or is next up. */
  const upcoming = useMemo(() => {
    if (!file || !player) return null;
    const t = file.tournaments.find((x) => x.status !== 'final' && x.field.some((e) => e.playerId === playerId));
    if (!t || t.roundsLeft <= 0) return null;
    const byId = new Map(file.players.map((p) => [p.id, p]));
    const entrants = t.field
      .map((e) => {
        const p = byId.get(e.playerId);
        return p?.scoringAverage != null ? { id: e.playerId, scoringAverage: p.scoringAverage, startingScore: e.score ?? 0 } : null;
      })
      .filter((x): x is { id: string; scoringAverage: number; startingScore: number } => !!x);
    if (entrants.length < 5) return null;
    const odds = simulateField(entrants, t.roundsLeft, 4000, fieldSeed(t.id, t.roundsLeft));
    const mine = odds.find((o) => o.playerId === playerId);
    return mine ? { tournament: t, odds: mine } : null;
  }, [file, player, playerId]);

  if (golf.loading && !player) return <ActivityIndicator color={colors.green} style={{ marginTop: 60 }} />;

  if (!player) {
    return (
      <View style={styles.missing}>
        <Ionicons name="person-outline" size={22} color={colors.inkGhost} />
        <Text style={styles.missingText}>That player is not in the published PGA field.</Text>
        <TouchableOpacity style={styles.missingBtn} onPress={onBack}><Text style={styles.missingBtnText}>Go back</Text></TouchableOpacity>
      </View>
    );
  }

  const rank = file ? file.players.filter((p) => p.scoringAverage != null).findIndex((p) => p.id === playerId) + 1 : 0;

  return (
    <ScrollView style={styles.root} contentContainerStyle={styles.body}>
      <LinearGradient colors={grad.vault} style={styles.hero}>
        <View style={styles.heroRow}>
          {player.headshotUrl || player.flagUrl ? (
            <Image
              source={{ uri: sizedHeadshot((player.headshotUrl ?? player.flagUrl)!, 78) }}
              style={[styles.face, !player.headshotUrl && styles.flag]}
              resizeMode={player.headshotUrl ? 'cover' : 'contain'}
            />
          ) : <View style={[styles.face, styles.flag]} />}
          <View style={{ flex: 1 }}>
            <Text style={styles.name} numberOfLines={2}>{player.name}</Text>
            <Text style={styles.sub} numberOfLines={1}>
              PGA Tour{player.country ? ` · ${player.country}` : ''}
              {player.scoringAverage != null && rank > 0 ? ` · ${rank} by scoring average` : ''}
            </Text>
          </View>
        </View>
      </LinearGradient>

      {!!upcoming && (
        <View style={styles.card}>
          <Text style={styles.cardTitle}>{upcoming.tournament.name}</Text>
          <View style={styles.grid}>
            <Cell label="Win" value={`${upcoming.odds.winPct.toFixed(1)}%`} tone={colors.green} />
            <Cell label="Top 5" value={`${upcoming.odds.top5Pct.toFixed(0)}%`} />
            <Cell label="Top 10" value={`${upcoming.odds.top10Pct.toFixed(0)}%`} />
          </View>
          <Text style={styles.muted}>
            {upcoming.tournament.roundsLeft} round{upcoming.tournament.roundsLeft === 1 ? '' : 's'} left, simulated against the rest
            of the field. Compare it with the outright price before you take it — a 4% chance is worth backing at +40 and a bad bet
            at +15.
          </Text>
        </View>
      )}

      {player.stats.length > 0 ? (
        <View style={styles.card}>
          <Text style={styles.cardTitle}>This season</Text>
          {player.stats.map((s) => (
            <View key={s.label} style={styles.statRow}>
              <Text style={styles.statLabel}>{s.label}</Text>
              <Text style={[styles.statValue, numeric]}>{s.value}</Text>
              <Text style={styles.statRank}>{s.rank != null ? `${s.rank}${s.rankOf ? ` of ${s.rankOf}` : ''}` : '—'}</Text>
            </View>
          ))}
          {player.rating != null && (
            <Text style={styles.muted}>
              Grade {player.rating} — a percentile of scoring average across everyone on tour who has one. It is a comparison, not
              a projection.
            </Text>
          )}
        </View>
      ) : (
        <View style={styles.card}>
          <Text style={styles.cardTitle}>This season</Text>
          <Text style={styles.muted}>
            No published statistics this season, so there is nothing to grade and the model cannot price them in a field. That is
            usually a player who has not teed it up on tour this year.
          </Text>
        </View>
      )}

      <Text style={styles.fine}>
        Golf is the hardest sport there is to forecast. This model knows a player's scoring average and nothing else — not the
        course, not the weather, not form, not who is putting well. Treat it as a starting price to argue with, not an answer.
      </Text>
    </ScrollView>
  );
}

function Cell({ label, value, tone }: { label: string; value: string; tone?: string }) {
  return (
    <View style={styles.cell}>
      <Text style={styles.cellLabel}>{label}</Text>
      <Text style={[styles.cellValue, numeric, tone ? { color: tone } : null]}>{value}</Text>
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
  heroRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  face: { width: 78, height: 78, borderRadius: 39, backgroundColor: colors.cardAlt },
  flag: { borderWidth: 1, borderColor: colors.border },
  name: { color: colors.ink, fontSize: 20, fontWeight: '900' },
  sub: { color: colors.inkFaint, fontSize: 11.5, marginTop: 4 },

  card: { marginHorizontal: spacing.lg, marginTop: spacing.md, padding: spacing.md, backgroundColor: colors.card, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border },
  cardTitle: { color: colors.ink, fontSize: 13, fontWeight: '900', marginBottom: spacing.sm },
  muted: { color: colors.inkFaint, fontSize: 11, lineHeight: 16, marginTop: spacing.sm },
  fine: { color: colors.inkGhost, fontSize: 9.5, lineHeight: 14, marginHorizontal: spacing.lg, marginTop: spacing.lg },

  grid: { flexDirection: 'row', gap: spacing.sm },
  cell: { flex: 1, padding: spacing.sm, borderRadius: radius.md, backgroundColor: colors.cardAlt },
  cellLabel: { color: colors.inkFaint, fontSize: 9, fontWeight: '900', letterSpacing: 0.8, textTransform: 'uppercase' },
  cellValue: { color: colors.ink, fontSize: 17, fontWeight: '900', marginTop: 3 },

  statRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingVertical: 8, borderTopWidth: 1, borderTopColor: colors.border },
  statLabel: { flex: 1, color: colors.inkDim, fontSize: 12 },
  statValue: { color: colors.ink, fontSize: 13.5, fontWeight: '900', width: 74, textAlign: 'right' },
  statRank: { color: colors.inkGhost, fontSize: 10, width: 68, textAlign: 'right' },
});
