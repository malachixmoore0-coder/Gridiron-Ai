import React, { useState } from 'react';
import { View, Text, ScrollView, TouchableOpacity, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';
import type { Weather } from '@/engine/types';
import { getTeam } from '@/data/teams';
import { colors, radius, shadow, spacing } from '@/theme';
import { timeAgo } from '@/utils/format';
import { useSettings } from '@/context/SettingsContext';
import { RunRequest, DEFAULT_CTX } from '@/hooks/useAnalysis';
import { TeamMark } from '@/components/TeamMark';
import { TeamPickerModal } from '@/components/TeamPickerModal';
import { Chip } from '@/components/Chip';
import { ScreenHeader } from '@/components/ScreenHeader';

const WEATHER: { key: Weather | 'auto'; label: string }[] = [
  { key: 'auto', label: 'Auto' },
  { key: 'clear', label: 'Clear' },
  { key: 'wind', label: 'Wind' },
  { key: 'rain', label: 'Rain' },
  { key: 'snow', label: 'Snow' },
  { key: 'cold', label: 'Cold' },
  { key: 'heat', label: 'Heat' },
];

interface Props { onRun: (req: RunRequest) => void; onOpenTeam: (id: string) => void; }

export function MatchupScreen({ onRun, onOpenTeam }: Props) {
  const { recent, simulations, injuredOut, questionable } = useSettings();
  const [awayId, setAwayId] = useState('dal');
  const [homeId, setHomeId] = useState('phi');
  const [ctx, setCtx] = useState(DEFAULT_CTX);
  const [picking, setPicking] = useState<'away' | 'home' | null>(null);

  const away = getTeam(awayId);
  const home = getTeam(homeId);
  const flagged = [...home.players, ...away.players].filter((p) => injuredOut.includes(p.id) || questionable.includes(p.id));
  const isDivision = home.conference === away.conference && home.division === away.division;

  const swap = () => { setAwayId(homeId); setHomeId(awayId); };

  return (
    <SafeAreaView style={styles.root} edges={['top']}>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <ScreenHeader title="Gridiron AI" subtitle="NFL bias & predictive analytics engine" />

        {/* Matchup hero */}
        <View style={styles.hero}>
          <TouchableOpacity style={styles.teamCol} activeOpacity={0.8} onPress={() => setPicking('away')}>
            <TeamMark team={away} size={78} />
            <Text style={styles.teamCity}>{away.city}</Text>
            <Text style={styles.teamName}>{away.name}</Text>
            <Text style={[styles.sideTag, { color: colors.away }]}>AWAY</Text>
          </TouchableOpacity>
          <View style={styles.middle}>
            <Text style={styles.at}>@</Text>
            <TouchableOpacity style={styles.swap} onPress={swap} hitSlop={8}>
              <Ionicons name="swap-horizontal" size={18} color={colors.ink} />
            </TouchableOpacity>
          </View>
          <TouchableOpacity style={styles.teamCol} activeOpacity={0.8} onPress={() => setPicking('home')}>
            <TeamMark team={home} size={78} />
            <Text style={styles.teamCity}>{home.city}</Text>
            <Text style={styles.teamName}>{home.name}</Text>
            <Text style={[styles.sideTag, { color: colors.home }]}>HOME</Text>
          </TouchableOpacity>
        </View>
        <Text style={styles.venue}>
          {ctx.neutralSite ? 'Neutral site' : `${home.stadium.name} · ${home.stadium.city}`}
          {isDivision ? ' · Division game' : ''}
        </Text>

        {/* Context */}
        <Text style={styles.label}>Game context</Text>
        <View style={styles.wrapRow}>
          <Chip label="Neutral site" active={ctx.neutralSite} onPress={() => setCtx((c) => ({ ...c, neutralSite: !c.neutralSite }))} />
          <Chip label="Primetime" active={ctx.primetime} onPress={() => setCtx((c) => ({ ...c, primetime: !c.primetime }))} />
        </View>
        <Text style={styles.label}>Weather {home.stadium.dome && ctx.weather === 'auto' ? '· indoors' : ''}</Text>
        <View style={styles.wrapRow}>
          {WEATHER.map((w) => (
            <Chip key={w.key} label={w.label} active={ctx.weather === w.key} onPress={() => setCtx((c) => ({ ...c, weather: w.key }))} small />
          ))}
        </View>

        {/* Injuries */}
        <View style={styles.injuryCard}>
          <View style={{ flex: 1 }}>
            <Text style={styles.injuryTitle}>Injury report</Text>
            <Text style={styles.injuryText}>
              {flagged.length === 0
                ? 'Both depth charts fully healthy. Tap a team to flag players Out or Questionable.'
                : flagged.map((p) => `${p.name} (${injuredOut.includes(p.id) ? 'OUT' : 'Q'})`).join(' · ')}
            </Text>
          </View>
          <View style={styles.injuryBtns}>
            <TouchableOpacity style={styles.miniBtn} onPress={() => onOpenTeam(away.id)}><Text style={styles.miniBtnText}>{away.abbr}</Text></TouchableOpacity>
            <TouchableOpacity style={styles.miniBtn} onPress={() => onOpenTeam(home.id)}><Text style={styles.miniBtnText}>{home.abbr}</Text></TouchableOpacity>
          </View>
        </View>

        {/* Run */}
        <TouchableOpacity style={styles.run} activeOpacity={0.85} onPress={() => onRun({ awayId, homeId, ctx })}>
          <Ionicons name="analytics" size={20} color={colors.bg} />
          <Text style={styles.runText}>Run {simulations.toLocaleString()} simulations</Text>
        </TouchableOpacity>
        <Text style={styles.runHint}>Scheme 25% · Personnel 35% · Environment 15% · X-Factor 25% — tune in Model.</Text>

        {recent.length > 0 && (
          <>
            <Text style={styles.label}>Recent</Text>
            {recent.map((r) => {
              const a = getTeam(r.awayId);
              const h = getTeam(r.homeId);
              return (
                <TouchableOpacity key={`${r.awayId}-${r.homeId}`} style={styles.recent} activeOpacity={0.75} onPress={() => { setAwayId(r.awayId); setHomeId(r.homeId); onRun({ awayId: r.awayId, homeId: r.homeId, ctx }); }}>
                  <TeamMark team={a} size={28} />
                  <Text style={styles.recentText}>{a.abbr} @ {h.abbr}</Text>
                  <TeamMark team={h} size={28} />
                  <Text style={styles.recentTime}>{timeAgo(r.ts)}</Text>
                  <Ionicons name="chevron-forward" size={16} color={colors.inkFaint} />
                </TouchableOpacity>
              );
            })}
          </>
        )}
      </ScrollView>

      <TeamPickerModal
        visible={picking !== null}
        title={picking === 'away' ? 'Away team' : 'Home team'}
        selectedId={picking === 'away' ? awayId : homeId}
        excludeId={picking === 'away' ? homeId : awayId}
        onSelect={(t) => (picking === 'away' ? setAwayId(t.id) : setHomeId(t.id))}
        onClose={() => setPicking(null)}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  content: { paddingHorizontal: spacing.lg, paddingBottom: spacing.xxl },
  hero: { flexDirection: 'row', alignItems: 'center', backgroundColor: colors.card, borderRadius: radius.xl, borderWidth: 1, borderColor: colors.border, padding: spacing.lg, ...shadow.card },
  teamCol: { flex: 1, alignItems: 'center', gap: 3 },
  teamCity: { color: colors.inkFaint, fontSize: 11, fontWeight: '700', marginTop: 6 },
  teamName: { color: colors.ink, fontSize: 16, fontWeight: '900' },
  sideTag: { fontSize: 10, fontWeight: '900', letterSpacing: 1.5, marginTop: 2 },
  middle: { alignItems: 'center', gap: 10, width: 56 },
  at: { color: colors.inkFaint, fontSize: 22, fontWeight: '900' },
  swap: { width: 34, height: 34, borderRadius: 17, backgroundColor: colors.cardAlt, borderWidth: 1, borderColor: colors.border, alignItems: 'center', justifyContent: 'center' },
  venue: { color: colors.inkFaint, fontSize: 12, textAlign: 'center', marginTop: spacing.sm, fontWeight: '600' },
  label: { color: colors.inkFaint, fontSize: 11, fontWeight: '900', letterSpacing: 1.2, textTransform: 'uppercase', marginTop: spacing.xl, marginBottom: spacing.sm },
  wrapRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  injuryCard: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, backgroundColor: colors.card, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border, padding: spacing.lg, marginTop: spacing.xl },
  injuryTitle: { color: colors.ink, fontWeight: '800', fontSize: 14 },
  injuryText: { color: colors.inkFaint, fontSize: 12, marginTop: 3, lineHeight: 17 },
  injuryBtns: { gap: 6 },
  miniBtn: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: radius.pill, backgroundColor: colors.cardAlt, borderWidth: 1, borderColor: colors.border },
  miniBtnText: { color: colors.ink, fontWeight: '900', fontSize: 12 },
  run: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10, backgroundColor: colors.gold, borderRadius: radius.lg, paddingVertical: 16, marginTop: spacing.xl },
  runText: { color: colors.bg, fontWeight: '900', fontSize: 16 },
  runHint: { color: colors.inkFaint, fontSize: 11, textAlign: 'center', marginTop: spacing.sm },
  recent: { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: colors.card, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, padding: spacing.md, marginBottom: spacing.sm },
  recentText: { color: colors.ink, fontWeight: '800', fontSize: 13 },
  recentTime: { color: colors.inkFaint, fontSize: 11, marginLeft: 'auto' },
});
