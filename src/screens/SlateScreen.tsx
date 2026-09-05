import React, { useMemo } from 'react';
import { View, Text, ScrollView, TouchableOpacity, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';
import { analyzeMatchup } from '@/engine';
import { SAMPLE_SLATE } from '@/data/slate';
import { getTeam } from '@/data/teams';
import { colors, radius, shadow, spacing } from '@/theme';
import { spreadText, oneDp } from '@/utils/format';
import { useSettings } from '@/context/SettingsContext';
import { buildInput, RunRequest } from '@/hooks/useAnalysis';
import { TeamMark } from '@/components/TeamMark';
import { ProbBar } from '@/components/ProbBar';
import { ScreenHeader } from '@/components/ScreenHeader';

interface Props { onRun: (req: RunRequest) => void; }

/** Quick-look board: every sample game simulated (2,000 runs each) with the current model + injuries. */
export function SlateScreen({ onRun }: Props) {
  const s = useSettings();
  const inj = s.injuredOut.join(',');
  const q = s.questionable.join(',');
  const w = JSON.stringify(s.weights);

  const rows = useMemo(() => SAMPLE_SLATE.map((g) => {
    const req: RunRequest = { awayId: g.awayId, homeId: g.homeId, ctx: { neutralSite: !!g.neutralSite, primetime: !!g.primetime, weather: g.weather ?? 'auto' } };
    const a = analyzeMatchup(buildInput(req, s.injuredOut, s.questionable), { weights: s.weights, simulations: 2000, homeFieldBase: s.homeFieldBase });
    return { g, req, a };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }), [inj, q, w, s.homeFieldBase]);

  return (
    <SafeAreaView style={styles.root} edges={['top']}>
      <ScreenHeader title="Slate" subtitle="Sample marquee matchups · 2,000 quick sims each" />
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        {rows.map(({ g, req, a }) => {
          const away = getTeam(g.awayId);
          const home = getTeam(g.homeId);
          const sim = a.simulation;
          return (
            <TouchableOpacity key={g.id} style={styles.card} activeOpacity={0.8} onPress={() => onRun(req)}>
              <View style={styles.top}>
                <View style={styles.team}><TeamMark team={away} size={36} /><Text style={styles.abbr}>{away.abbr}</Text></View>
                <View style={styles.mid}>
                  <Text style={styles.label}>{g.label}</Text>
                  <Text style={styles.tags}>
                    {[g.primetime ? 'Primetime' : null, g.weather ? g.weather[0].toUpperCase() + g.weather.slice(1) : null, g.neutralSite ? 'Neutral' : null].filter(Boolean).join(' · ') || home.stadium.name}
                  </Text>
                </View>
                <View style={styles.team}><TeamMark team={home} size={36} /><Text style={styles.abbr}>{home.abbr}</Text></View>
              </View>
              <ProbBar awayPct={sim.awayWinPct} homePct={sim.homeWinPct} awayAbbr={away.abbr} homeAbbr={home.abbr} height={10} />
              <View style={styles.bottom}>
                <Text style={styles.stat}><Text style={styles.statKey}>Line </Text>{spreadText(sim.spread < 0 ? home.abbr : away.abbr, sim.spread)}</Text>
                <Text style={styles.stat}><Text style={styles.statKey}>Total </Text>{oneDp(sim.projectedTotal)}</Text>
                <Text style={styles.stat}><Text style={styles.statKey}>Proj </Text>{oneDp(sim.projectedAway)}–{oneDp(sim.projectedHome)}</Text>
                <Ionicons name="chevron-forward" size={16} color={colors.inkFaint} />
              </View>
            </TouchableOpacity>
          );
        })}
        <Text style={styles.note}>Tap a game for the full 10,000-run breakdown. This is a curated sample slate, not a live schedule.</Text>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  content: { paddingHorizontal: spacing.lg, paddingBottom: spacing.xxl },
  card: { backgroundColor: colors.card, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border, padding: spacing.lg, marginBottom: spacing.md, ...shadow.card },
  top: { flexDirection: 'row', alignItems: 'center', marginBottom: spacing.md },
  team: { alignItems: 'center', gap: 4, width: 56 },
  abbr: { color: colors.ink, fontWeight: '900', fontSize: 12 },
  mid: { flex: 1, alignItems: 'center' },
  label: { color: colors.ink, fontWeight: '800', fontSize: 13, textAlign: 'center' },
  tags: { color: colors.inkFaint, fontSize: 11, marginTop: 2, textAlign: 'center' },
  bottom: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: spacing.md },
  stat: { color: colors.ink, fontWeight: '800', fontSize: 12 },
  statKey: { color: colors.inkFaint, fontWeight: '700' },
  note: { color: colors.inkFaint, fontSize: 11, textAlign: 'center', lineHeight: 16, marginTop: spacing.sm },
});
