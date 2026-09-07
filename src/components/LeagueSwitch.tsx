/**
 * NFL ⇄ NCAA. Two leagues, one subscription, one card.
 *
 * It sits in the header of every tab rather than in settings, because which
 * league you are looking at is the single most consequential thing on screen
 * and changing it should never cost more than one tap.
 */
import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { colors, radius } from '@/theme';
import { useLeague } from '@/league/LeagueContext';
import { haptic } from '@/utils/haptics';

export function LeagueSwitch({ compact }: { compact?: boolean }) {
  const { league, setLeague, all } = useLeague();
  return (
    <View style={[styles.wrap, compact && styles.compact]}>
      {all.map((l) => {
        const on = l.id === league;
        return (
          <TouchableOpacity
            key={l.id}
            style={[styles.seg, compact && styles.segCompact, on && styles.segOn]}
            activeOpacity={0.85}
            onPress={() => { if (!on) haptic('medium'); setLeague(l.id); }}
            accessibilityRole="tab"
            accessibilityState={{ selected: on }}
            accessibilityLabel={l.label}
          >
            <Text style={[styles.text, compact && styles.textCompact, on && styles.textOn]}>{l.short}</Text>
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { flexDirection: 'row', backgroundColor: colors.cardAlt, borderRadius: radius.pill, padding: 3, borderWidth: 1, borderColor: colors.border },
  compact: { padding: 2 },
  seg: { paddingHorizontal: 14, paddingVertical: 6, borderRadius: radius.pill },
  segCompact: { paddingHorizontal: 10, paddingVertical: 4 },
  segOn: { backgroundColor: colors.green },
  text: { color: colors.inkDim, fontSize: 12, fontWeight: '900', letterSpacing: 0.6 },
  textCompact: { fontSize: 10.5 },
  textOn: { color: colors.bg },
});
