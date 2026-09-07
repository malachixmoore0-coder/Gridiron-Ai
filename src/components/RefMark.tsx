/**
 * A team badge drawn from the league adapter's lightweight team reference,
 * so shared screens can show a logo without knowing which league's full Team
 * type they are holding.
 */
import React, { useState } from 'react';
import { View, Text, Image, StyleSheet } from 'react-native';
import { colors } from '@/theme';
import type { LeagueTeamRef } from '@/league/types';

export function RefMark({ team, size = 40, disc }: { team: LeagueTeamRef | null; size?: number; disc?: boolean }) {
  const [failed, setFailed] = useState(false);
  if (!team) return <View style={[styles.wrap, { width: size, height: size, borderRadius: size / 2, backgroundColor: colors.cardAlt }]} />;
  if (team.logoUrl && !failed) {
    return (
      <View style={[styles.logo, { width: size, height: size, borderRadius: size / 2, backgroundColor: disc ? colors.white : team.colors.primary, borderColor: team.colors.primary }]}>
        <Image
          source={{ uri: team.logoUrl }}
          style={{ width: size * 0.76, height: size * 0.76 }}
          resizeMode="contain"
          onError={() => setFailed(true)}
        />
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
  wrap: { alignItems: 'center', justifyContent: 'center', borderWidth: 1 },
  logo: { alignItems: 'center', justifyContent: 'center', borderWidth: 1, overflow: 'hidden' },
  abbr: { color: colors.white, fontWeight: '900' },
});
