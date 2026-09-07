/**
 * The Record tab: two records under one roof.
 *
 * "The model" is the published, locked-at-kickoff track record for whichever
 * league is on screen. "Your card" is yours, graded off the same finals. Keeping
 * them one tap apart is deliberate — the whole pitch is that they are scored the
 * same way, and separating them into different corners of the app would hide it.
 */
import React, { useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { colors, radius, spacing, type as T } from '@/theme';
import { LeagueSwitch } from '@/components/LeagueSwitch';
import { useLeague } from '@/league/LeagueContext';
import { CardScreen } from '@/screens/CardScreen';
import { RecordScreen as NflRecord } from '@/screens/RecordScreen';
import { RecordScreen as CfbRecord } from '@/cfb/screens/RecordScreen';
import { SportRecordScreen } from '@/screens/SportRecordScreen';
import type { RunRequest } from '@/hooks/useAnalysis';

interface Props {
  onRun: (r: RunRequest) => void;
  onUpgrade: () => void;
  onOpenGame: (teamId: string, gameId: string) => void;
  onShare: (pickId: string) => void;
}

type Tab = 'model' | 'card';

export function RecordHubScreen({ onRun, onUpgrade, onOpenGame, onShare }: Props) {
  const { league, active } = useLeague();
  const [tab, setTab] = useState<Tab>('model');

  return (
    <SafeAreaView edges={['top']} style={styles.safe}>
      <View style={styles.head}>
        <Text style={styles.title}>Record</Text>
      </View>
      <View style={styles.switchRow}><LeagueSwitch /></View>
      <View style={styles.tabs}>
        {(['model', 'card'] as Tab[]).map((t) => (
          <TouchableOpacity
            key={t}
            style={[styles.tab, tab === t && styles.tabOn]}
            activeOpacity={0.85}
            onPress={() => setTab(t)}
            accessibilityRole="tab"
            accessibilityState={{ selected: tab === t }}
          >
            <Text style={[styles.tabText, tab === t && styles.tabTextOn]}>{t === 'model' ? 'The model' : 'Your card'}</Text>
          </TouchableOpacity>
        ))}
      </View>
      <View style={{ flex: 1 }}>
        {tab === 'card'
          ? <CardScreen onUpgrade={onUpgrade} onOpenGame={onOpenGame} onShare={onShare} embedded />
          : !active.bespoke
            ? <SportRecordScreen onOpenGame={onOpenGame} onUpgrade={onUpgrade} />
            : league === 'cfb'
              ? <CfbRecord onRun={onRun as never} onUpgrade={onUpgrade} />
              : <NflRecord onRun={onRun} onUpgrade={onUpgrade} />}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  head: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: spacing.lg, paddingBottom: spacing.sm, gap: spacing.md },
  switchRow: { paddingHorizontal: spacing.lg, paddingBottom: spacing.sm },
  title: { ...T.title, color: colors.ink, fontSize: 24 },
  tabs: { flexDirection: 'row', gap: spacing.sm, paddingHorizontal: spacing.lg, paddingBottom: spacing.sm },
  tab: { flex: 1, alignItems: 'center', paddingVertical: 9, borderRadius: radius.pill, backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border },
  tabOn: { backgroundColor: colors.cardAlt, borderColor: colors.green },
  tabText: { color: colors.inkFaint, fontSize: 12.5, fontWeight: '800' },
  tabTextOn: { color: colors.green },
});
