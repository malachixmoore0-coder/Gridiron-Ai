/**
 * One header for every tab.
 *
 * The old build gave each screen its own title treatment, which made the app
 * feel like five apps in a trench coat. Every tab now opens the same way: title,
 * one line of context, the league switch, and the tier pill — so the only thing
 * that changes between tabs is the content.
 */
import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors, spacing, type as T } from '@/theme';
import { LeagueSwitch } from '@/components/LeagueSwitch';
import { TierPill, StreakPill } from '@/components/Pro';
import { useEntitlements } from '@/context/EntitlementsContext';
import { useEngagement } from '@/context/EngagementContext';
import { useLive } from '@/live/LiveContext';

interface Props {
  title: string;
  subtitle?: string;
  /** Hide the league switch on screens that are not league-specific. */
  leagues?: boolean;
  streak?: boolean;
  onUpgrade?: () => void;
  onSettings?: () => void;
  right?: React.ReactNode;
}

export function TabHeader({ title, subtitle, leagues = true, streak, onUpgrade, onSettings, right }: Props) {
  const ent = useEntitlements();
  const eng = useEngagement();
  const live = useLive();
  return (
    <View style={styles.wrap}>
      <View style={styles.top}>
        <View style={{ flex: 1 }}>
          <Text style={styles.title} numberOfLines={1}>{title}</Text>
          <View style={styles.subRow}>
            {live.liveCount > 0 && (
              <View style={styles.liveDot}>
                <View style={styles.dot} />
                <Text style={styles.liveText}>{live.liveCount} live</Text>
              </View>
            )}
            {!!subtitle && <Text style={styles.sub} numberOfLines={1}>{subtitle}</Text>}
          </View>
        </View>
        {right}
        {streak && <StreakPill days={eng.streak} />}
        <TierPill tier={ent.tier} trial={ent.trial.active ? ent.trial.daysLeft : undefined} onPress={onUpgrade} />
        {!!onSettings && (
          <TouchableOpacity style={styles.gear} activeOpacity={0.8} onPress={onSettings} accessibilityRole="button" accessibilityLabel="Model settings">
            <Ionicons name="options" size={16} color={colors.inkDim} />
          </TouchableOpacity>
        )}
      </View>
      {leagues && <View style={styles.switchRow}><LeagueSwitch /></View>}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { paddingHorizontal: spacing.lg, paddingBottom: spacing.sm },
  top: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  title: { ...T.title, color: colors.ink, fontSize: 24 },
  subRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 1 },
  sub: { color: colors.inkFaint, fontSize: 11, fontWeight: '700', flexShrink: 1 },
  liveDot: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  dot: { width: 6, height: 6, borderRadius: 3, backgroundColor: colors.live },
  liveText: { color: colors.live, fontSize: 10, fontWeight: '900', letterSpacing: 0.4 },
  gear: { width: 30, height: 30, borderRadius: 15, backgroundColor: colors.cardAlt, borderWidth: 1, borderColor: colors.border, alignItems: 'center', justifyContent: 'center' },
  switchRow: { flexDirection: 'row', marginTop: spacing.sm },
});
