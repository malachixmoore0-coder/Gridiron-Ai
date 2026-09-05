import React, { useMemo } from 'react';
import { View, Text, ScrollView, TouchableOpacity, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';
import { analyzeMatchup } from '@/engine';
import { colors, radius, shadow, spacing } from '@/theme';
import { spreadText, oneDp } from '@/utils/format';
import { useSettings } from '@/context/SettingsContext';
import { useTeams } from '@/context/TeamsContext';
import { buildInput, RunRequest } from '@/hooks/useAnalysis';
import { TeamMark } from '@/components/TeamMark';
import { ProbBar } from '@/components/ProbBar';
import { ScreenHeader } from '@/components/ScreenHeader';
import { DataBanner } from '@/components/DataBanner';
import { SAMPLE_SLATE } from '@/data/slate';

interface Props { onRun: (req: RunRequest) => void; }

/** This week's real slate (from the live schedule), each game quick-simulated (2,000 runs) and compared with the market line. */
export function SlateScreen({ onRun }: Props) {
  const s = useSettings();
  const { getTeam, weekGames, week, season, phase, generatedAt, teams } = useTeams();
  const ov = JSON.stringify(s.overrides);
  const w = JSON.stringify(s.weights);
  const usingSample = weekGames.length === 0;

  const rows = useMemo(() => {
    const games = usingSample
      ? SAMPLE_SLATE.filter((g) => teams.some((t) => t.id === g.awayId) && teams.some((t) => t.id === g.homeId)).map((g) => ({
          id: g.id, awayId: g.awayId, homeId: g.homeId, label: g.label, kickoff: null as string | null, neutralSite: !!g.neutralSite, primetime: !!g.primetime,
          weather: g.weather ?? null, homeSpread: null as number | null, totalLine: null as number | null, status: 'scheduled' as const, awayScore: null, homeScore: null,
        }))
      : weekGames.map((g) => ({
          id: g.id, awayId: g.awayId, homeId: g.homeId, label: g.stadium, kickoff: g.kickoff, neutralSite: g.neutralSite, primetime: g.primetime,
          weather: g.weatherHint && g.weatherHint !== 'dome' ? g.weatherHint : null, homeSpread: g.homeSpread, totalLine: g.totalLine, status: g.status, awayScore: g.awayScore, homeScore: g.homeScore,
        }));
    return games.map((g) => {
      const req: RunRequest = { awayId: g.awayId, homeId: g.homeId, ctx: { neutralSite: g.neutralSite, primetime: g.primetime, weather: g.weather ?? 'auto' } };
      const a = analyzeMatchup(buildInput(req, getTeam(g.homeId), getTeam(g.awayId), s.overrides), { weights: s.weights, simulations: 2000, homeFieldBase: s.homeFieldBase });
      return { g, req, a };
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ov, w, s.homeFieldBase, generatedAt, usingSample]);

  return (
    <SafeAreaView style={styles.root} edges={['top']}>
      <ScreenHeader title={usingSample ? 'Slate' : `Week ${week} slate`} subtitle={usingSample ? 'Sample marquee matchups · 2,000 quick sims each' : `${season} ${phase} · model vs market · 2,000 quick sims each`} />
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <DataBanner compact />
        {rows.map(({ g, req, a }) => {
          const away = getTeam(g.awayId);
          const home = getTeam(g.homeId);
          const sim = a.simulation;
          const modelFavAbbr = sim.spread < 0 ? home.abbr : away.abbr;
          const marketFavAbbr = g.homeSpread !== null ? (g.homeSpread <= 0 ? home.abbr : away.abbr) : null;
          const marketLine = g.homeSpread !== null ? Math.abs(g.homeSpread) : null;
          // Edge = how many points the model disagrees with the market on the home line.
          const modelHomeLine = sim.spread; // away - home
          const edge = g.homeSpread !== null ? modelHomeLine - g.homeSpread : null;
          return (
            <TouchableOpacity key={g.id} style={styles.card} activeOpacity={0.8} onPress={() => onRun(req)}>
              <View style={styles.top}>
                <View style={styles.team}><TeamMark team={away} size={36} /><Text style={styles.abbr}>{away.abbr}</Text>{!!away.record && <Text style={styles.rec}>{away.record}</Text>}</View>
                <View style={styles.mid}>
                  <Text style={styles.label} numberOfLines={1}>{g.kickoff ? new Date(g.kickoff).toLocaleString(undefined, { weekday: 'short', hour: 'numeric', minute: '2-digit' }) : g.label}</Text>
                  <Text style={styles.tags} numberOfLines={1}>
                    {[g.primetime ? 'Primetime' : null, g.weather ? g.weather[0].toUpperCase() + g.weather.slice(1) : null, g.neutralSite ? 'Neutral' : null].filter(Boolean).join(' · ') || g.label}
                  </Text>
                  {g.status === 'final' && <Text style={styles.final}>Final {g.awayScore}–{g.homeScore}</Text>}
                </View>
                <View style={styles.team}><TeamMark team={home} size={36} /><Text style={styles.abbr}>{home.abbr}</Text>{!!home.record && <Text style={styles.rec}>{home.record}</Text>}</View>
              </View>
              <ProbBar awayPct={sim.awayWinPct} homePct={sim.homeWinPct} awayAbbr={away.abbr} homeAbbr={home.abbr} height={10} />
              <View style={styles.bottom}>
                <Text style={styles.stat}><Text style={styles.statKey}>Model </Text>{spreadText(modelFavAbbr, sim.spread)} · {oneDp(sim.projectedTotal)}</Text>
                {marketFavAbbr && marketLine !== null && (
                  <Text style={styles.stat}><Text style={styles.statKey}>Market </Text>{marketLine < 0.25 ? 'PK' : `${marketFavAbbr} -${marketLine}`}{g.totalLine !== null ? ` · ${g.totalLine}` : ''}</Text>
                )}
                {edge !== null && Math.abs(edge) >= 2 && (
                  <Text style={[styles.edge, { color: colors.gold }]}>{edge < 0 ? home.abbr : away.abbr} +{Math.abs(edge).toFixed(1)} vs mkt</Text>
                )}
                <Ionicons name="chevron-forward" size={16} color={colors.inkFaint} />
              </View>
            </TouchableOpacity>
          );
        })}
        <Text style={styles.note}>
          {usingSample
            ? 'No live schedule loaded — showing a curated sample board. Tap a game for the full 10,000-run breakdown.'
            : 'Lines are the schedule feed\'s consensus at the last refresh. "vs mkt" shows where the model disagrees by two points or more. Tap a game for the full 10,000-run breakdown.'}
        </Text>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  content: { paddingHorizontal: spacing.lg, paddingBottom: spacing.xxl },
  card: { backgroundColor: colors.card, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border, padding: spacing.lg, marginBottom: spacing.md, ...shadow.card },
  top: { flexDirection: 'row', alignItems: 'center', marginBottom: spacing.md },
  team: { alignItems: 'center', gap: 2, width: 60 },
  abbr: { color: colors.ink, fontWeight: '900', fontSize: 12 },
  rec: { color: colors.inkFaint, fontSize: 10, fontWeight: '700' },
  mid: { flex: 1, alignItems: 'center' },
  label: { color: colors.ink, fontWeight: '800', fontSize: 13, textAlign: 'center' },
  tags: { color: colors.inkFaint, fontSize: 11, marginTop: 2, textAlign: 'center' },
  final: { color: colors.gold, fontSize: 11, fontWeight: '900', marginTop: 2 },
  bottom: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: spacing.md, gap: 6, flexWrap: 'wrap' },
  stat: { color: colors.ink, fontWeight: '800', fontSize: 12 },
  statKey: { color: colors.inkFaint, fontWeight: '700' },
  edge: { fontWeight: '900', fontSize: 11 },
  note: { color: colors.inkFaint, fontSize: 11, textAlign: 'center', lineHeight: 16, marginTop: spacing.sm },
});
