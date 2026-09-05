import React, { useState } from 'react';
import { View, Text, Image, StyleSheet } from 'react-native';
import type { Team } from '@/engine/types';
import { colors } from '@/theme';

interface Props { team: Team; size?: number; }

/** Team logo when the live dataset supplies one, otherwise a colour-block badge with the abbreviation. */
export function TeamMark({ team, size = 44 }: Props) {
  const [failed, setFailed] = useState(false);
  if (team.logoUrl && !failed) {
    return (
      <View style={[styles.logoWrap, { width: size, height: size, borderRadius: size / 2, backgroundColor: team.colors.primary }]}>
        <Image source={{ uri: team.logoUrl }} style={{ width: size * 0.78, height: size * 0.78 }} resizeMode="contain" onError={() => setFailed(true)} />
      </View>
    );
  }
  return (
    <View style={[styles.wrap, { width: size, height: size, borderRadius: size / 2, backgroundColor: team.colors.primary, borderColor: team.colors.secondary }]}>
      <Text style={[styles.abbr, { fontSize: size * 0.32 }]}>{team.abbr}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { alignItems: 'center', justifyContent: 'center', borderWidth: 2.5 },
  logoWrap: { alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  abbr: { color: colors.white, fontWeight: '900', letterSpacing: 0.5, textShadowColor: 'rgba(0,0,0,0.5)', textShadowRadius: 3 },
});
