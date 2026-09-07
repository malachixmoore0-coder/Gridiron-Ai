/**
 * Every team in a league, grouped the way that league groups itself — divisions
 * in the NBA, conferences in college, the table in MLS — with the rating the
 * engine actually uses and how many games are behind it, because a rating built
 * on four games is a guess wearing a number.
 */
import React, { useMemo, useState } from 'react';
import { View, Text, ScrollView, TouchableOpacity, TextInput, StyleSheet, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { colors, numeric, radius, spacing } from '@/theme';
import { TabHeader } from '@/components/TabHeader';
import { RefMark } from '@/components/RefMark';
import { useActiveLeague } from '@/league/LeagueContext';
import { useEngagement } from '@/context/EngagementContext';
import { useEntitlements } from '@/context/EntitlementsContext';
import { useSports } from '@/sports/SportsContext';
import { LEAGUE_BY_KEY, type LeagueKey } from '@/sports/types';
import { haptic } from '@/utils/haptics';

interface Props { onOpenTeam: (id: string) => void; onUpgrade?: () => void }

/** Rating → a 1-10 grade, the same scale the football pages use. */
export const gradeOf = (rating: number) => Math.max(1, Math.min(10, ((rating - 1350) / 300) * 9 + 1));

export function SportTeamsScreen({ onOpenTeam, onUpgrade }: Props) {
  const view = useActiveLeague();
  const eng = useEngagement();
  const ent = useEntitlements();
  const { feeds } = useSports();
  const meta = LEAGUE_BY_KEY[view.id];
  const [q, setQ] = useState('');

  const ratings = useMemo(() => {
    const feed = feeds[view.id as LeagueKey];
    return new Map((feed?.teams?.teams ?? []).map((t) => [t.id, t]));
  }, [feeds, view.id]);

  const groups = useMemo(() => {
    const term = q.trim().toLowerCase();
    const list = view.teams
      .filter((t) => !term || t.name.toLowerCase().includes(term) || t.abbr.toLowerCase().includes(term))
      .sort((a, b) => (ratings.get(b.id)?.rating ?? 0) - (ratings.get(a.id)?.rating ?? 0));
    const byGroup = new Map<string, typeof list>();
    for (const t of list) {
      const key = t.group || meta.name;
      (byGroup.get(key) ?? byGroup.set(key, []).get(key)!).push(t);
    }
    return [...byGroup.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  }, [view.teams, q, ratings, meta.name]);

  return (
    <SafeAreaView edges={['top']} style={styles.safe}>
      <TabHeader title="Teams" subtitle={`${view.teams.length} in ${meta.name} · ranked by the engine's rating`} />

      <View style={styles.searchRow}>
        <Ionicons name="search" size={15} color={colors.inkFaint} />
        <TextInput
          style={styles.search}
          value={q}
          onChangeText={setQ}
          placeholder={`Search ${meta.short}`}
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
        {view.loading && !view.teams.length && <ActivityIndicator color={colors.green} style={{ marginTop: 40 }} />}
        {!view.loading && !view.teams.length && (
          <Text style={styles.empty}>
            No {meta.name} teams loaded yet. The dataset builds on a schedule; pull the Slate to try again.
          </Text>
        )}

        {groups.map(([group, list]) => (
          <View key={group} style={styles.group}>
            <Text style={styles.groupTitle}>{group}</Text>
            {list.map((t) => {
              const r = ratings.get(t.id);
              const grade = r ? gradeOf(r.rating) : null;
              const following = eng.isFollowing(t.id);
              return (
                <TouchableOpacity
                  key={t.id}
                  style={styles.row}
                  activeOpacity={0.8}
                  onPress={() => { haptic('light'); onOpenTeam(t.id); }}
                >
                  <RefMark team={t} size={38} disc />
                  <View style={{ flex: 1 }}>
                    <Text style={styles.name} numberOfLines={1}>
                      {t.rank ? <Text style={styles.rank}>#{t.rank} </Text> : null}
                      {t.name}
                      {!!t.record && <Text style={styles.record}>  {t.record}</Text>}
                    </Text>
                    <Text style={styles.meta} numberOfLines={1}>
                      {r ? `${r.played} game${r.played === 1 ? '' : 's'} behind the rating` : 'no rating yet'}
                      {r && r.attack !== 1 ? ` · scores ${r.attack >= 1 ? '+' : ''}${Math.round((r.attack - 1) * 100)}%` : ''}
                    </Text>
                  </View>
                  {grade != null && (
                    <View style={styles.gradeWrap}>
                      <Text style={[styles.grade, numeric, { color: grade >= 7 ? colors.green : grade >= 5 ? colors.gold : colors.inkDim }]}>
                        {grade.toFixed(1)}
                      </Text>
                      <Text style={styles.gradeLabel}>GRADE</Text>
                    </View>
                  )}
                  <TouchableOpacity
                    hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                    onPress={() => { haptic('select'); if (eng.toggleFollow(t.id, ent.ent.follows) === 'limit') onUpgrade?.(); }}
                    accessibilityRole="button"
                    accessibilityLabel={following ? 'Unfollow' : 'Follow'}
                  >
                    <Ionicons name={following ? 'star' : 'star-outline'} size={16} color={following ? colors.gold : colors.inkGhost} />
                  </TouchableOpacity>
                </TouchableOpacity>
              );
            })}
          </View>
        ))}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  searchRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginHorizontal: spacing.lg, paddingHorizontal: spacing.md, paddingVertical: 9, borderRadius: radius.pill, backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border },
  search: { flex: 1, color: colors.ink, fontSize: 13, padding: 0 },
  body: { padding: spacing.lg, paddingBottom: 40 },
  empty: { color: colors.inkFaint, fontSize: 12, lineHeight: 18, textAlign: 'center', marginTop: spacing.xl },
  group: { marginBottom: spacing.lg },
  groupTitle: { color: colors.inkFaint, fontSize: 10, fontWeight: '900', letterSpacing: 1.2, textTransform: 'uppercase', marginBottom: spacing.sm },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, backgroundColor: colors.card, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, padding: spacing.md, marginBottom: 6 },
  name: { color: colors.ink, fontSize: 14, fontWeight: '800' },
  rank: { color: colors.gold },
  record: { color: colors.inkFaint, fontSize: 12, fontWeight: '700' },
  meta: { color: colors.inkFaint, fontSize: 11, marginTop: 2 },
  gradeWrap: { alignItems: 'flex-end' },
  grade: { fontSize: 16, fontWeight: '900' },
  gradeLabel: { color: colors.inkGhost, fontSize: 8, fontWeight: '900', letterSpacing: 0.6 },
});
