/**
 * Followers and following.
 *
 * Two lists behind one screen, because they are the same list read from either
 * end and nobody wants two Backs to get between them. The tab you arrived on is
 * the one you tapped; the other is one tap away.
 *
 * On the device-only backend these lists are short by construction — there is
 * exactly one account on this phone that can follow anybody — so the empty state
 * says that out loud rather than implying the person has no followers.
 */
import React, { useCallback, useEffect, useState } from 'react';
import { View, Text, ScrollView, TouchableOpacity, StyleSheet, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { colors, radius, spacing, type as T, clearance } from '@/theme';
import { useSocial } from '@/social/SocialContext';
import { PersonRow } from '@/components/Social';
import { haptic } from '@/utils/haptics';
import type { Profile } from '@/social/types';

export type PeopleTab = 'followers' | 'following';

interface Props {
  userId: string;
  name: string;
  tab: PeopleTab;
  onOpenProfile: (userId: string) => void;
}

const TABS: { key: PeopleTab; label: string }[] = [
  { key: 'followers', label: 'Followers' },
  { key: 'following', label: 'Following' },
];

export function PeopleScreen({ userId, name, tab: initial, onOpenProfile }: Props) {
  const s = useSocial();
  const [tab, setTab] = useState<PeopleTab>(initial);
  const [rows, setRows] = useState<Profile[] | null>(null);

  const load = useCallback(async () => {
    setRows(null);
    try {
      setRows(tab === 'followers' ? await s.followersOf(userId) : await s.followingOf(userId));
    } catch {
      setRows([]);
    }
  }, [s, tab, userId]);

  useEffect(() => { load(); }, [load]);

  return (
    <SafeAreaView edges={['top']} style={styles.safe}>
      <View style={styles.head}>
        <Text style={styles.title} numberOfLines={1}>{name}</Text>
        <View style={styles.tabs}>
          {TABS.map((t) => (
            <TouchableOpacity
              key={t.key}
              style={[styles.tab, tab === t.key && styles.tabOn]}
              activeOpacity={0.8}
              onPress={() => { haptic('select'); setTab(t.key); }}
              accessibilityRole="tab"
              accessibilityState={{ selected: tab === t.key }}
            >
              <Text style={[styles.tabText, tab === t.key && styles.tabTextOn]}>{t.label}</Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>

      <ScrollView contentContainerStyle={styles.body}>
        {rows === null && <ActivityIndicator color={colors.green} style={{ marginTop: spacing.xl }} />}
        {rows?.map((p) => <PersonRow key={p.id} profile={p} onPress={() => onOpenProfile(p.id)} />)}
        {rows !== null && !rows.length && (
          <Text style={styles.empty}>
            {s.live
              ? (tab === 'followers' ? 'Nobody yet.' : 'Not following anyone yet.')
              : 'Accounts live on this device until sign-in is switched on, so there is nobody here to list yet.'}
          </Text>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  head: { paddingHorizontal: spacing.lg, paddingBottom: spacing.xs },
  title: { ...T.title, color: colors.ink, fontSize: 20 },
  tabs: { flexDirection: 'row', gap: spacing.xs, marginTop: spacing.md, borderBottomWidth: 1, borderBottomColor: colors.divider },
  tab: { flex: 1, alignItems: 'center', paddingVertical: 11, borderBottomWidth: 2, borderBottomColor: 'transparent' },
  tabOn: { borderBottomColor: colors.green },
  tabText: { color: colors.inkFaint, fontSize: 13, fontWeight: '800' },
  tabTextOn: { color: colors.ink },
  body: { padding: spacing.lg, paddingBottom: clearance.overlay },
  empty: { color: colors.inkFaint, fontSize: 13, lineHeight: 19, textAlign: 'center', marginTop: spacing.xl, paddingHorizontal: spacing.md },
});
