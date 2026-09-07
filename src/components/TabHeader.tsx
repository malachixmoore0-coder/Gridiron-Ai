/**
 * One header for every tab.
 *
 * Left to right: you, where you are, which league, what you are paying, and the
 * way out to settings. Your avatar sits first and large because it is the thing
 * people reach for most after the tabs themselves — and because a profile you
 * cannot find is a profile nobody fills in.
 */
import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors, radius, spacing, type as T } from '@/theme';
import { LeagueSwitch } from '@/components/LeagueSwitch';
import { TierPill, StreakPill } from '@/components/Pro';
import { Avatar } from '@/components/Social';
import { useEntitlements } from '@/context/EntitlementsContext';
import { useEngagement } from '@/context/EngagementContext';
import { useSocial } from '@/social/SocialContext';
import { useLive } from '@/live/LiveContext';
import { useNav } from '@/navigation/NavContext';
import { haptic } from '@/utils/haptics';

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
  const social = useSocial();
  const live = useLive();
  const nav = useNav();

  return (
    <View style={styles.wrap}>
      <View style={styles.top}>
        <TouchableOpacity
          style={styles.avatar}
          activeOpacity={0.8}
          onPress={() => { haptic('light'); nav.openProfile(); }}
          accessibilityRole="button"
          accessibilityLabel={social.signedIn ? 'Your profile' : 'Sign in'}
        >
          <Avatar profile={social.me} size={40} />
          {!social.signedIn && <View style={styles.avatarDot} />}
        </TouchableOpacity>

        <View style={{ flex: 1 }}>
          <Text style={styles.title} numberOfLines={1}>{title}</Text>
        </View>

        {right}
        {streak && <StreakPill days={eng.streak} />}
        <TierPill
          tier={ent.tier}
          trial={ent.trial.active ? ent.trial.daysLeft : undefined}
          onPress={() => { haptic('light'); (onUpgrade ?? nav.openUpgrade)(); }}
        />
        <TouchableOpacity
          style={styles.gear}
          activeOpacity={0.8}
          onPress={() => { haptic('light'); (onSettings ?? nav.openSettings)(); }}
          accessibilityRole="button"
          accessibilityLabel="Settings"
        >
          <Ionicons name="settings-sharp" size={17} color={colors.inkDim} />
        </TouchableOpacity>
      </View>

      {/* The subtitle gets its own line. Sharing the top row with the avatar,
          the tier pill and the gear left it about a hundred and fifty points
          wide, which truncated every subtitle in the app to an ellipsis. */}
      {(!!subtitle || live.liveCount > 0) && (
        <View style={styles.subRow}>
          {live.liveCount > 0 && (
            <View style={styles.liveDot}>
              <View style={styles.dot} />
              <Text style={styles.liveText}>{live.liveCount} live</Text>
            </View>
          )}
          {!!subtitle && <Text style={styles.sub} numberOfLines={1}>{subtitle}</Text>}
        </View>
      )}

      {leagues && <View style={styles.switchRow}><LeagueSwitch /></View>}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { paddingHorizontal: spacing.lg, paddingBottom: spacing.sm },
  top: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  avatar: { marginRight: 2 },
  avatarDot: { position: 'absolute', right: -1, bottom: -1, width: 12, height: 12, borderRadius: 6, backgroundColor: colors.gold, borderWidth: 2, borderColor: colors.bg },
  title: { ...T.title, color: colors.ink, fontSize: 23 },
  subRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 3 },
  sub: { color: colors.inkFaint, fontSize: 11, fontWeight: '700', flexShrink: 1 },
  liveDot: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  dot: { width: 6, height: 6, borderRadius: 3, backgroundColor: colors.live },
  liveText: { color: colors.live, fontSize: 10, fontWeight: '900', letterSpacing: 0.4 },
  gear: { width: 34, height: 34, borderRadius: radius.pill, backgroundColor: colors.cardAlt, borderWidth: 1, borderColor: colors.border, alignItems: 'center', justifyContent: 'center' },
  switchRow: { marginTop: spacing.sm },
});
