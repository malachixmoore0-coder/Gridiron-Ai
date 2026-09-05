import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import type { Team } from '@/engine/types';
import { colors } from '@/theme';

interface Props { team: Team; size?: number; }

/** Colour-block team badge with the abbreviation — no logos needed. */
export function TeamMark({ team, size = 44 }: Props) {
  return (
    <View style={[styles.wrap, { width: size, height: size, borderRadius: size / 2, backgroundColor: team.colors.primary, borderColor: team.colors.secondary }]}>
      <Text style={[styles.abbr, { fontSize: size * 0.32 }]}>{team.abbr}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { alignItems: 'center', justifyContent: 'center', borderWidth: 2.5 },
  abbr: { color: colors.white, fontWeight: '900', letterSpacing: 0.5, textShadowColor: 'rgba(0,0,0,0.5)', textShadowRadius: 3 },
});
