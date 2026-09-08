/**
 * Pick two teams, run the generic engine.
 *
 * The football simulator asks about weather, primetime and a neutral site
 * because those move a football game. Basketball, baseball and soccer do not
 * care about a domed roof, so the controls here are the ones that are real for
 * every sport: who is home, whether anybody is, and how much the market gets a
 * say. Asking for inputs that do nothing would be theatre.
 */
import React, { useMemo, useState } from 'react';
import { View, Text, ScrollView, TouchableOpacity, TextInput, StyleSheet, Modal } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { colors, numeric, radius, spacing, clearance } from '@/theme';
import { RefMark } from '@/components/RefMark';
import { useActiveLeague } from '@/league/LeagueContext';
import { useSports } from '@/sports/SportsContext';
import { LEAGUE_BY_KEY, profileFor, type LeagueKey } from '@/sports/types';
import { haptic } from '@/utils/haptics';
import type { LeagueTeamRef } from '@/league/types';

export interface SportRun {
  awayId: string;
  homeId: string;
  ctx: { neutralSite: boolean; primetime: boolean; weather: 'auto' };
  /** 0 = ignore the market entirely, 1 = follow it. */
  marketWeight?: number;
}

interface Props {
  onRun: (r: SportRun) => void;
  onOpenTeam: (id: string) => void;
}

const WEIGHTS = [
  { key: 0, label: 'Model only', blurb: 'Ratings alone. The purest read, and the noisiest.' },
  { key: 0.35, label: 'Blended', blurb: 'What the published projections use.' },
  { key: 0.7, label: 'Market-led', blurb: 'Trust the number twenty books agree on.' },
];

export function SportMatchupScreen({ onRun, onOpenTeam }: Props) {
  const view = useActiveLeague();
  const { feeds } = useSports();
  const meta = LEAGUE_BY_KEY[view.id];
  const profile = profileFor(view.id);

  const ratings = useMemo(() => {
    const feed = feeds[view.id as LeagueKey];
    return new Map((feed?.teams?.teams ?? []).map((t) => [t.id, t]));
  }, [feeds, view.id]);

  const ordered = useMemo(
    () => [...view.teams].sort((a, b) => (ratings.get(b.id)?.rating ?? 0) - (ratings.get(a.id)?.rating ?? 0)),
    [view.teams, ratings],
  );

  const [awayId, setAwayId] = useState(() => ordered[1]?.id ?? '');
  const [homeId, setHomeId] = useState(() => ordered[0]?.id ?? '');
  const [neutral, setNeutral] = useState(false);
  const [weight, setWeight] = useState(0.35);
  const [picking, setPicking] = useState<'away' | 'home' | null>(null);

  const away = view.teamRef(awayId);
  const home = view.teamRef(homeId);
  const ready = !!away && !!home && awayId !== homeId;

  /** If these two are actually on the board, say so and carry the real line in. */
  const scheduled = useMemo(
    () => view.games.find((g) => (g.awayId === awayId && g.homeId === homeId) || (g.awayId === homeId && g.homeId === awayId)),
    [view.games, awayId, homeId],
  );

  return (
    <SafeAreaView edges={['top']} style={styles.safe}>
      <ScrollView contentContainerStyle={styles.body}>
        <Text style={styles.title}>Simulate</Text>
        <Text style={styles.sub}>
          {meta.name} · {profile.model === 'poisson'
            ? `${profile.unit}s are drawn from each side's own rate, ten thousand times`
            : `margin and total are drawn around the projection, ten thousand times`}
        </Text>

        <View style={styles.pickRow}>
          <Picker label="Away" team={away} onPress={() => { haptic('select'); setPicking('away'); }} onOpen={() => awayId && onOpenTeam(awayId)} rating={ratings.get(awayId)?.rating} />
          <View style={styles.at}><Text style={styles.atText}>{neutral ? 'vs' : '@'}</Text></View>
          <Picker label="Home" team={home} onPress={() => { haptic('select'); setPicking('home'); }} onOpen={() => homeId && onOpenTeam(homeId)} rating={ratings.get(homeId)?.rating} />
        </View>

        <TouchableOpacity
          style={styles.swap}
          activeOpacity={0.85}
          onPress={() => { haptic('light'); setAwayId(homeId); setHomeId(awayId); }}
          accessibilityRole="button"
          accessibilityLabel="Swap home and away"
        >
          <Ionicons name="swap-horizontal" size={14} color={colors.inkDim} />
          <Text style={styles.swapText}>Swap sides</Text>
        </TouchableOpacity>

        {!!scheduled && (
          <View style={styles.sched}>
            <Ionicons name="calendar" size={13} color={colors.green} />
            <Text style={styles.schedText} numberOfLines={2}>
              These two are on the board {new Date(scheduled.kickoff).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
              {scheduled.homeSpread != null ? ` · market has ${scheduled.homeSpread > 0 ? `${view.abbrOf(scheduled.awayId)} -${scheduled.homeSpread}` : `${view.abbrOf(scheduled.homeId)} ${scheduled.homeSpread}`}` : ''}
            </Text>
          </View>
        )}

        <View style={styles.card}>
          <TouchableOpacity
            style={styles.toggle}
            activeOpacity={0.85}
            onPress={() => { haptic('select'); setNeutral((v) => !v); }}
            accessibilityRole="switch"
            accessibilityState={{ checked: neutral }}
          >
            <View style={{ flex: 1 }}>
              <Text style={styles.toggleTitle}>Neutral site</Text>
              <Text style={styles.toggleSub}>
                Worth {profile.homeEdge} {profile.unit}{profile.homeEdge === 1 ? '' : 's'} to the home side in {meta.short} — turn it off and that goes away.
              </Text>
            </View>
            <View style={[styles.knob, neutral && styles.knobOn]}>
              <View style={[styles.dot, neutral && styles.dotOn]} />
            </View>
          </TouchableOpacity>
        </View>

        <View style={styles.card}>
          <Text style={styles.cardTitle}>How much the market gets a say</Text>
          <View style={styles.weights}>
            {WEIGHTS.map((w) => (
              <TouchableOpacity
                key={w.key}
                style={[styles.weight, weight === w.key && { borderColor: meta.accent, backgroundColor: colors.cardAlt }]}
                activeOpacity={0.85}
                onPress={() => { haptic('select'); setWeight(w.key); }}
                accessibilityRole="radio"
                accessibilityState={{ selected: weight === w.key }}
              >
                <Text style={[styles.weightLabel, weight === w.key && { color: meta.accent }]}>{w.label}</Text>
              </TouchableOpacity>
            ))}
          </View>
          <Text style={styles.muted}>{WEIGHTS.find((w) => w.key === weight)?.blurb}</Text>
          {weight > 0 && !scheduled && (
            <Text style={styles.mutedWarn}>
              There is no market line for this pairing, so nothing to blend toward — this will run on ratings alone.
            </Text>
          )}
        </View>

        <TouchableOpacity
          style={[styles.run, !ready && styles.runOff]}
          activeOpacity={0.88}
          disabled={!ready}
          onPress={() => {
            haptic('medium');
            onRun({ awayId, homeId, ctx: { neutralSite: neutral, primetime: false, weather: 'auto' }, marketWeight: weight });
          }}
          accessibilityRole="button"
        >
          <Ionicons name="flash" size={16} color={colors.bg} />
          <Text style={styles.runText}>Run 10,000 {profile.sport === 'soccer' ? 'matches' : 'games'}</Text>
        </TouchableOpacity>
      </ScrollView>

      <Modal visible={!!picking} animationType="slide" transparent onRequestClose={() => setPicking(null)}>
        <TeamSheet
          title={picking === 'away' ? 'Away side' : 'Home side'}
          teams={ordered}
          ratings={ratings}
          excludeId={picking === 'away' ? homeId : awayId}
          selectedId={picking === 'away' ? awayId : homeId}
          onSelect={(id) => { haptic('light'); if (picking === 'away') setAwayId(id); else setHomeId(id); setPicking(null); }}
          onClose={() => setPicking(null)}
        />
      </Modal>
    </SafeAreaView>
  );
}

function Picker({ label, team, rating, onPress, onOpen }: { label: string; team: LeagueTeamRef | null; rating?: number; onPress: () => void; onOpen: () => void }) {
  return (
    <TouchableOpacity style={styles.picker} activeOpacity={0.85} onPress={onPress} accessibilityRole="button" accessibilityLabel={`Choose the ${label.toLowerCase()} team`}>
      <Text style={styles.pickerLabel}>{label.toUpperCase()}</Text>
      <RefMark team={team} size={54} disc />
      <Text style={styles.pickerName} numberOfLines={2}>{team?.name ?? 'Pick a team'}</Text>
      {rating != null && (
        <TouchableOpacity onPress={onOpen} hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}>
          <Text style={[styles.pickerRating, numeric]}>{Math.round(rating)} ›</Text>
        </TouchableOpacity>
      )}
    </TouchableOpacity>
  );
}

function TeamSheet({
  title, teams, ratings, excludeId, selectedId, onSelect, onClose,
}: {
  title: string;
  teams: LeagueTeamRef[];
  ratings: Map<string, { rating: number }>;
  excludeId: string;
  selectedId: string;
  onSelect: (id: string) => void;
  onClose: () => void;
}) {
  const [q, setQ] = useState('');
  const term = q.trim().toLowerCase();
  const list = teams.filter((t) => !term || t.name.toLowerCase().includes(term) || t.abbr.toLowerCase().includes(term));
  return (
    <SafeAreaView style={styles.sheet} edges={['top', 'bottom']}>
      <View style={styles.sheetHead}>
        <Text style={styles.sheetTitle}>{title}</Text>
        <TouchableOpacity onPress={onClose} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
          <Ionicons name="close" size={20} color={colors.ink} />
        </TouchableOpacity>
      </View>
      <View style={styles.searchRow}>
        <Ionicons name="search" size={15} color={colors.inkFaint} />
        <TextInput style={styles.search} value={q} onChangeText={setQ} placeholder="Search" placeholderTextColor={colors.inkGhost} autoCapitalize="none" autoCorrect={false} />
      </View>
      <ScrollView contentContainerStyle={styles.sheetBody}>
        {list.map((t) => {
          const off = t.id === excludeId;
          return (
            <TouchableOpacity
              key={t.id}
              style={[styles.teamRow, t.id === selectedId && styles.teamRowOn, off && { opacity: 0.3 }]}
              activeOpacity={0.85}
              disabled={off}
              onPress={() => onSelect(t.id)}
            >
              <RefMark team={t} size={30} disc />
              <View style={{ flex: 1 }}>
                <Text style={styles.teamName} numberOfLines={1}>{t.name}</Text>
                <Text style={styles.teamMeta} numberOfLines={1}>{t.group}{t.record ? ` · ${t.record}` : ''}</Text>
              </View>
              <Text style={[styles.teamRating, numeric]}>{Math.round(ratings.get(t.id)?.rating ?? 1500)}</Text>
            </TouchableOpacity>
          );
        })}
        {!list.length && <Text style={styles.muted}>No team matches “{q}”.</Text>}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  body: { padding: spacing.lg, paddingBottom: clearance.overlay },
  title: { color: colors.ink, fontSize: 22, fontWeight: '900' },
  sub: { color: colors.inkFaint, fontSize: 11.5, lineHeight: 16, marginTop: 4 },

  pickRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginTop: spacing.lg },
  picker: { flex: 1, alignItems: 'center', gap: 6, padding: spacing.md, borderRadius: radius.lg, backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border },
  pickerLabel: { color: colors.inkGhost, fontSize: 9, fontWeight: '900', letterSpacing: 1 },
  pickerName: { color: colors.ink, fontSize: 12.5, fontWeight: '800', textAlign: 'center' },
  pickerRating: { color: colors.inkFaint, fontSize: 10.5, fontWeight: '800' },
  at: { width: 26, alignItems: 'center' },
  atText: { color: colors.inkFaint, fontSize: 12, fontWeight: '900' },

  swap: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 9, marginTop: spacing.sm },
  swapText: { color: colors.inkDim, fontSize: 11.5, fontWeight: '800' },

  sched: { flexDirection: 'row', alignItems: 'center', gap: 7, padding: spacing.sm, borderRadius: radius.md, backgroundColor: colors.cardAlt, borderWidth: 1, borderColor: colors.border },
  schedText: { flex: 1, color: colors.inkDim, fontSize: 11, lineHeight: 15 },

  card: { marginTop: spacing.md, padding: spacing.md, borderRadius: radius.lg, backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border },
  cardTitle: { color: colors.ink, fontSize: 12.5, fontWeight: '900', marginBottom: spacing.sm },
  muted: { color: colors.inkFaint, fontSize: 11, lineHeight: 16 },
  mutedWarn: { color: colors.gold, fontSize: 11, lineHeight: 16, marginTop: 6 },

  toggle: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  toggleTitle: { color: colors.ink, fontSize: 13, fontWeight: '800' },
  toggleSub: { color: colors.inkFaint, fontSize: 11, lineHeight: 15, marginTop: 2 },
  knob: { width: 42, height: 24, borderRadius: 12, backgroundColor: colors.cardAlt, borderWidth: 1, borderColor: colors.border, justifyContent: 'center', paddingHorizontal: 3 },
  knobOn: { backgroundColor: colors.green, borderColor: colors.green },
  dot: { width: 17, height: 17, borderRadius: 9, backgroundColor: colors.inkDim },
  dotOn: { backgroundColor: colors.bg, alignSelf: 'flex-end' },

  weights: { flexDirection: 'row', gap: 6, marginBottom: spacing.sm },
  weight: { flex: 1, alignItems: 'center', paddingVertical: 9, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border },
  weightLabel: { color: colors.inkDim, fontSize: 11, fontWeight: '800' },

  run: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, marginTop: spacing.lg, paddingVertical: 14, borderRadius: radius.pill, backgroundColor: colors.green },
  runOff: { opacity: 0.4 },
  runText: { color: colors.bg, fontSize: 14, fontWeight: '900' },

  sheet: { flex: 1, backgroundColor: colors.bg },
  sheetHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: spacing.lg, paddingBottom: spacing.sm },
  sheetTitle: { color: colors.ink, fontSize: 16, fontWeight: '900' },
  searchRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginHorizontal: spacing.lg, paddingHorizontal: spacing.md, paddingVertical: 9, borderRadius: radius.pill, backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border },
  search: { flex: 1, color: colors.ink, fontSize: 13, padding: 0 },
  sheetBody: { padding: spacing.lg, paddingBottom: clearance.overlay },
  teamRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, padding: spacing.sm, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.card, marginBottom: 6 },
  teamRowOn: { borderColor: colors.green },
  teamName: { color: colors.ink, fontSize: 13, fontWeight: '800' },
  teamMeta: { color: colors.inkFaint, fontSize: 10.5, marginTop: 1 },
  teamRating: { color: colors.inkDim, fontSize: 12, fontWeight: '900' },
});
