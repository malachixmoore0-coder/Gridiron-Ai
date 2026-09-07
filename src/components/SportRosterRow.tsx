/**
 * One player in a generic-league roster.
 *
 * The grade on the right is a league percentile within the player's position
 * group, and it is only shown when there is production behind it. A player
 * with no published statistics gets a dash, not a number — a rookie who has
 * not debuted and a replacement-level veteran are not the same thing, and a
 * made-up grade would claim they were.
 */
import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors, numeric, radius, spacing } from '@/theme';
import { PlayerAvatar } from '@/components/PlayerAvatar';
import { sizedHeadshot } from '@/utils/roster';
import type { SportPlayer } from '@/sports/roster';
import type { LeagueTeamRef } from '@/league/types';

interface Props {
  player: SportPlayer;
  team: LeagueTeamRef | null;
  onPress: () => void;
  showPos?: boolean;
}

export function SportRosterRow({ player, team, onPress, showPos = true }: Props) {
  const hurt = !!player.injury;
  const meta = [
    showPos ? player.pos : null,
    player.age ? `${player.age}` : null,
    player.height,
    player.experience != null ? (player.experience <= 1 ? 'rookie' : `${player.experience} yrs`) : null,
  ].filter(Boolean).join(' · ');

  return (
    <TouchableOpacity style={[styles.row, hurt && styles.dim]} activeOpacity={0.78} onPress={onPress} accessibilityRole="button">
      {/* Ask the CDN for a 40px face rather than pulling a full-size PNG
          thirty times over on one screen. */}
      <PlayerAvatar uri={player.headshotUrl ? sizedHeadshot(player.headshotUrl, 40) : null} name={player.name} size={40} tint={team?.colors} />
      <View style={{ flex: 1 }}>
        <Text style={styles.name} numberOfLines={1}>
          {player.jersey ? <Text style={styles.jersey}>#{player.jersey} </Text> : null}
          {player.name}
          {hurt ? <Text style={styles.hurt}>  {player.injury}</Text> : null}
        </Text>
        <Text style={styles.meta} numberOfLines={1}>
          {player.line ? <Text style={styles.line}>{player.line}</Text> : null}
          {player.line && meta ? '  ·  ' : ''}
          {meta}
        </Text>
      </View>
      <View style={styles.right}>
        <Text style={[styles.rating, numeric, player.rating == null && styles.ratingSoft]}>
          {player.rating ?? '—'}
        </Text>
        <Text style={styles.ratingLabel}>grade</Text>
      </View>
      <Ionicons name="chevron-forward" size={15} color={colors.inkGhost} />
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 8, paddingHorizontal: spacing.sm, borderRadius: radius.md, borderBottomWidth: 1, borderBottomColor: colors.border },
  dim: { opacity: 0.62 },
  name: { color: colors.ink, fontWeight: '800', fontSize: 13.5 },
  jersey: { color: colors.inkFaint, fontWeight: '900', fontSize: 12 },
  hurt: { color: colors.negative, fontSize: 10, fontWeight: '800' },
  meta: { color: colors.inkFaint, fontSize: 11, marginTop: 2 },
  line: { color: colors.ink, fontWeight: '700' },
  right: { alignItems: 'center', width: 34 },
  rating: { color: colors.gold, fontWeight: '900', fontSize: 15 },
  ratingSoft: { color: colors.inkGhost },
  ratingLabel: { color: colors.inkGhost, fontSize: 8, fontWeight: '800', letterSpacing: 0.5, textTransform: 'uppercase' },
});
