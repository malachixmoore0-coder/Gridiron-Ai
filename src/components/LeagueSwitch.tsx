/**
 * The league picker.
 *
 * Two leagues fitted in a segmented control. Nine do not, so this is a pill that
 * opens a sheet grouped by sport — and the grouping is the point: someone who
 * opens the app in March is looking for basketball or baseball, and the sheet
 * should make that one tap rather than a scroll through football.
 *
 * Leagues out of season stay listed but say so, because a dark row is more
 * honest than a missing one.
 */
import React, { useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Modal, ScrollView } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors, radius, spacing, type as T } from '@/theme';
import { useLeague } from '@/league/LeagueContext';
import { SportGlyph } from '@/components/SportGlyph';
import { LEAGUES, inSeason, type SportId } from '@/sports/types';
import { haptic } from '@/utils/haptics';

const SPORT_ICON: Record<SportId, keyof typeof Ionicons.glyphMap> = {
  football: 'american-football',
  basketball: 'basketball',
  baseball: 'baseball',
  soccer: 'football',
};

export function LeagueSwitch({ compact }: { compact?: boolean }) {
  const { league, setLeague, viewFor } = useLeague();
  const [open, setOpen] = useState(false);
  const current = LEAGUES.find((l) => l.key === league) ?? LEAGUES[0];
  const groups = [...new Set(LEAGUES.map((l) => l.group))];

  return (
    <>
      <TouchableOpacity
        style={[styles.pill, compact && styles.pillCompact, { borderColor: current.accent }]}
        activeOpacity={0.85}
        onPress={() => { haptic('light'); setOpen(true); }}
        accessibilityRole="button"
        accessibilityLabel={`League: ${current.name}. Change league`}
      >
        <Ionicons name={SPORT_ICON[current.sport]} size={compact ? 12 : 13} color={current.accent} />
        <Text style={[styles.pillText, compact && styles.pillTextCompact, { color: current.accent }]}>{current.short}</Text>
        <Ionicons name="chevron-down" size={compact ? 10 : 12} color={colors.inkFaint} />
      </TouchableOpacity>

      <Modal visible={open} transparent animationType="fade" onRequestClose={() => setOpen(false)}>
        <TouchableOpacity style={styles.backdrop} activeOpacity={1} onPress={() => setOpen(false)}>
          <TouchableOpacity activeOpacity={1} style={styles.sheet}>
            <View style={styles.grip} />
            <Text style={styles.sheetTitle}>Leagues</Text>
            <ScrollView style={{ maxHeight: 460 }} showsVerticalScrollIndicator={false}>
              {groups.map((g) => (
                <View key={g} style={styles.group}>
                  <View style={styles.groupHead}>
                    <SportGlyph sport={LEAGUES.find((l) => l.group === g)!.sport} size={15} color={colors.inkFaint} />
                    <Text style={styles.groupTitle}>{g}</Text>
                  </View>
                  {LEAGUES.filter((l) => l.group === g).map((l) => {
                    const on = l.key === league;
                    const live = inSeason(l);
                    const view = viewFor(l.key);
                    const games = view.games.filter((x) => x.status !== 'final').length;
                    return (
                      <TouchableOpacity
                        key={l.key}
                        style={[styles.row, on && { borderColor: l.accent, backgroundColor: colors.cardAlt }]}
                        activeOpacity={0.85}
                        onPress={() => { haptic('medium'); setLeague(l.key); setOpen(false); }}
                        accessibilityRole="radio"
                        accessibilityState={{ selected: on }}
                      >
                        <SportGlyph sport={l.sport} size={20} color={l.accent} tile />
                        <View style={{ flex: 1 }}>
                          <Text style={[styles.rowName, on && { color: l.accent }]}>{l.name}</Text>
                          <Text style={styles.rowMeta}>
                            {view.loading ? 'loading…'
                              : games > 0 ? `${games} game${games === 1 ? '' : 's'} on the board`
                              : live ? 'in season' : 'out of season'}
                          </Text>
                        </View>
                        {on && <Ionicons name="checkmark" size={17} color={l.accent} />}
                      </TouchableOpacity>
                    );
                  })}
                </View>
              ))}
              <Text style={styles.foot}>
                One subscription covers every league. The football leagues run their own engine; the rest share a
                generic one tuned per sport — which is why a soccer projection has a draw in it and a baseball one
                does not.
              </Text>
            </ScrollView>
          </TouchableOpacity>
        </TouchableOpacity>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  pill: { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 11, paddingVertical: 6, borderRadius: radius.pill, backgroundColor: colors.cardAlt, borderWidth: 1 },
  pillCompact: { paddingHorizontal: 9, paddingVertical: 4, gap: 4 },
  pillText: { fontSize: 12, fontWeight: '900', letterSpacing: 0.4 },
  pillTextCompact: { fontSize: 10.5 },

  backdrop: { flex: 1, backgroundColor: colors.overlay, justifyContent: 'flex-end' },
  sheet: { backgroundColor: colors.card, borderTopLeftRadius: radius.xl, borderTopRightRadius: radius.xl, borderTopWidth: 1, borderColor: colors.borderHi, padding: spacing.lg, paddingBottom: spacing.xxl },
  grip: { alignSelf: 'center', width: 38, height: 4, borderRadius: 2, backgroundColor: colors.border, marginBottom: spacing.md },
  sheetTitle: { ...T.title, color: colors.ink, fontSize: 21, marginBottom: spacing.md },

  group: { marginBottom: spacing.md },
  groupHead: { flexDirection: 'row', alignItems: 'center', gap: 7, marginBottom: 6 },
  groupTitle: { ...T.micro, color: colors.inkFaint },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, padding: spacing.md, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, marginBottom: 6 },
  rowName: { color: colors.ink, fontSize: 14, fontWeight: '800' },
  rowMeta: { color: colors.inkFaint, fontSize: 11, marginTop: 2 },
  foot: { color: colors.inkGhost, fontSize: 11, lineHeight: 16, marginTop: spacing.sm },
});
