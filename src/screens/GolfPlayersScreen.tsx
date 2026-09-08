/**
 * Every player on tour, ranked by the one number the model runs on.
 *
 * Scoring average is the whole ranking. It is a blunt measure — it does not
 * know which courses someone played or who they played against — and the page
 * says so, because a leaderboard that looks authoritative and isn't is worse
 * than one that admits what it is.
 */
import React, { useEffect, useMemo, useState } from 'react';
import { View, Text, ScrollView, TouchableOpacity, TextInput, StyleSheet, ActivityIndicator, Image } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { colors, numeric, radius, spacing, clearance } from '@/theme';
import { TabHeader } from '@/components/TabHeader';
import { useGolf } from '@/sports/GolfContext';
import { sizedHeadshot } from '@/utils/roster';
import { haptic } from '@/utils/haptics';

interface Props { onOpenPlayer: (playerId: string) => void }

export function GolfPlayersScreen({ onOpenPlayer }: Props) {
  const golf = useGolf();
  const [q, setQ] = useState('');

  useEffect(() => { golf.ensure(); }, [golf]);

  const list = useMemo(() => {
    const term = q.trim().toLowerCase();
    const all = golf.file?.players ?? [];
    const filtered = term ? all.filter((p) => p.name.toLowerCase().includes(term)) : all;
    // Anyone with a scoring average first, in order; the unranked after.
    return [
      ...filtered.filter((p) => p.scoringAverage != null),
      ...filtered.filter((p) => p.scoringAverage == null),
    ];
  }, [golf.file, q]);

  return (
    <SafeAreaView edges={['top']} style={styles.safe}>
      <TabHeader
        title="Players"
        subtitle={golf.file ? `${golf.file.ranked} of ${golf.file.players.length} with a scoring average` : 'PGA Tour'}
      />

      <View style={styles.searchRow}>
        <Ionicons name="search" size={15} color={colors.inkFaint} />
        <TextInput
          style={styles.search}
          value={q}
          onChangeText={setQ}
          placeholder="Search the tour"
          placeholderTextColor={colors.inkGhost}
          autoCapitalize="none"
          autoCorrect={false}
        />
        {!!q && (
          <TouchableOpacity onPress={() => setQ('')} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
            <Ionicons name="close-circle" size={16} color={colors.inkGhost} />
          </TouchableOpacity>
        )}
      </View>

      <ScrollView contentContainerStyle={styles.body}>
        {golf.loading && !golf.file && <ActivityIndicator color={colors.green} style={{ marginTop: 40 }} />}
        {!golf.loading && !list.length && (
          <Text style={styles.muted}>
            {q ? `Nobody on tour matches “${q}”.` : 'No players published yet. The PGA dataset rebuilds on a schedule.'}
          </Text>
        )}

        {list.map((p, i) => (
          <TouchableOpacity
            key={p.id}
            style={styles.row}
            activeOpacity={0.8}
            onPress={() => { haptic('light'); onOpenPlayer(p.id); }}
          >
            <Text style={[styles.rank, numeric]}>{p.scoringAverage != null ? i + 1 : '—'}</Text>
            {p.headshotUrl || p.flagUrl ? (
              <Image
                source={{ uri: sizedHeadshot((p.headshotUrl ?? p.flagUrl)!, 36) }}
                style={[styles.face, !p.headshotUrl && styles.flag]}
                resizeMode={p.headshotUrl ? 'cover' : 'contain'}
              />
            ) : <View style={[styles.face, styles.faceEmpty]} />}
            <View style={{ flex: 1 }}>
              <Text style={styles.name} numberOfLines={1}>{p.name}</Text>
              <Text style={styles.meta} numberOfLines={1}>
                {p.line ?? 'no published statistics this season'}
              </Text>
            </View>
            {p.rating != null && (
              <View style={styles.gradeWrap}>
                <Text style={[styles.grade, numeric, { color: p.rating >= 75 ? colors.green : p.rating >= 55 ? colors.gold : colors.inkDim }]}>
                  {p.rating}
                </Text>
                <Text style={styles.gradeLabel}>GRADE</Text>
              </View>
            )}
            <Ionicons name="chevron-forward" size={15} color={colors.inkGhost} />
          </TouchableOpacity>
        ))}

        {list.length > 0 && (
          <Text style={styles.fine}>
            Ranked on scoring average alone, which is deliberately blunt: it does not adjust for which courses someone played or
            the strength of the fields they played in. It is the same number the tournament projection runs on, so what you see
            here is what the model sees.
          </Text>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  searchRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginHorizontal: spacing.lg, paddingHorizontal: spacing.md, paddingVertical: 9, borderRadius: radius.pill, backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border },
  search: { flex: 1, color: colors.ink, fontSize: 13, padding: 0 },
  body: { padding: spacing.lg, paddingBottom: clearance.dock },
  muted: { color: colors.inkFaint, fontSize: 12, lineHeight: 18, textAlign: 'center', marginTop: spacing.xl },
  fine: { color: colors.inkGhost, fontSize: 9.5, lineHeight: 14, marginTop: spacing.lg },

  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, backgroundColor: colors.card, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, padding: spacing.sm, marginBottom: 6 },
  rank: { color: colors.inkGhost, fontSize: 11, fontWeight: '900', width: 24 },
  face: { width: 36, height: 36, borderRadius: 18, backgroundColor: colors.cardAlt },
  flag: { borderWidth: 1, borderColor: colors.border },
  faceEmpty: { borderWidth: 1, borderColor: colors.border },
  name: { color: colors.ink, fontSize: 13.5, fontWeight: '800' },
  meta: { color: colors.inkFaint, fontSize: 11, marginTop: 2 },
  gradeWrap: { alignItems: 'flex-end' },
  grade: { fontSize: 15, fontWeight: '900' },
  gradeLabel: { color: colors.inkGhost, fontSize: 8, fontWeight: '900', letterSpacing: 0.6 },
});
