/**
 * The golf board: what is being played, and who the model likes.
 *
 * A tournament that has started shows the leaderboard as it stands. One that
 * has not shows the projection — win, top five, top ten — from simulating the
 * field. The distinction matters, so the screen says which it is showing
 * rather than blending them into one ambiguous list.
 */
import React, { useEffect, useMemo, useState } from 'react';
import { View, Text, ScrollView, TouchableOpacity, StyleSheet, RefreshControl, ActivityIndicator, Image } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { colors, grad, numeric, radius, spacing } from '@/theme';
import { TabHeader } from '@/components/TabHeader';
import { useGolf } from '@/sports/GolfContext';
import { fieldSeed, simulateField, type FieldOdds, type GolfFile, type GolfTournament } from '@/sports/golf';
import { sizedHeadshot } from '@/utils/roster';
import { haptic } from '@/utils/haptics';

interface Props { onOpenPlayer: (playerId: string) => void }

const dateRange = (a: string, b: string) => {
  const s = new Date(a);
  const e = new Date(b);
  const m = { month: 'short', day: 'numeric' } as const;
  return s.toDateString() === e.toDateString()
    ? s.toLocaleDateString(undefined, m)
    : `${s.toLocaleDateString(undefined, m)} – ${e.toLocaleDateString(undefined, m)}`;
};

const money = (v: number | null) =>
  v == null ? null : v >= 1_000_000 ? `$${(v / 1_000_000).toFixed(1)}M` : `$${Math.round(v / 1000)}K`;

const toPar = (v: number | null) => (v == null ? '—' : v === 0 ? 'E' : v > 0 ? `+${v}` : `${v}`);

/** The field the model can actually price: entrants with a scoring average. */
function priceable(t: GolfTournament, file: GolfFile) {
  const byId = new Map(file.players.map((p) => [p.id, p]));
  return t.field
    .map((e) => {
      const p = byId.get(e.playerId);
      return p?.scoringAverage != null
        ? { id: e.playerId, scoringAverage: p.scoringAverage, startingScore: e.score ?? 0 }
        : null;
    })
    .filter((x): x is { id: string; scoringAverage: number; startingScore: number } => !!x);
}

export function GolfBoardScreen({ onOpenPlayer }: Props) {
  const golf = useGolf();
  const [open, setOpen] = useState<string | null>(null);

  useEffect(() => { golf.ensure(); }, [golf]);

  const file = golf.file;
  const tournaments = useMemo(() => {
    if (!file) return [] as GolfTournament[];
    const live = file.tournaments.filter((t) => t.status === 'in_progress');
    const next = file.tournaments.filter((t) => t.status === 'scheduled');
    const done = file.tournaments.filter((t) => t.status === 'final').reverse();
    return [...live, ...next, ...done];
  }, [file]);

  // Open on something with content. The next tournament matters most, but its
  // field is not published until a few days out, and landing on an empty page
  // is a worse first impression than landing on last week's leaderboard.
  useEffect(() => {
    if (open || !tournaments.length) return;
    const best =
      tournaments.find((t) => t.status === 'in_progress')
      ?? tournaments.find((t) => t.status === 'scheduled' && t.field.length)
      ?? tournaments.find((t) => t.status === 'final' && t.field.length)
      ?? tournaments[0];
    setOpen(best.id);
  }, [open, tournaments]);

  const current = tournaments.find((t) => t.id === open) ?? tournaments[0] ?? null;

  const odds = useMemo<FieldOdds[]>(() => {
    if (!current || !file || current.status === 'final' || current.roundsLeft <= 0) return [];
    const entrants = priceable(current, file);
    if (entrants.length < 5) return [];
    return simulateField(entrants, current.roundsLeft, 4000, fieldSeed(current.id, current.roundsLeft))
      .sort((a, b) => b.winPct - a.winPct);
  }, [current, file]);

  const byId = useMemo(() => new Map((file?.players ?? []).map((p) => [p.id, p])), [file]);

  if (golf.loading && !file) {
    return (
      <SafeAreaView edges={['top']} style={styles.safe}>
        <TabHeader title="Golf" subtitle="Loading the PGA Tour…" />
        <ActivityIndicator color={colors.green} style={{ marginTop: 60 }} />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView edges={['top']} style={styles.safe}>
      <TabHeader
        title="Golf"
        subtitle={file ? `PGA Tour · ${file.tournaments.length} events on the calendar` : 'PGA Tour'}
      />

      {tournaments.length > 1 && (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.bar} contentContainerStyle={styles.barInner}>
          {tournaments.map((t) => {
            const on = t.id === current?.id;
            return (
              <TouchableOpacity
                key={t.id}
                style={[styles.tab, on && { borderColor: colors.green }]}
                activeOpacity={0.85}
                onPress={() => { haptic('select'); setOpen(t.id); }}
                accessibilityRole="tab"
                accessibilityState={{ selected: on }}
              >
                <Text style={[styles.tabName, on && { color: colors.green }]} numberOfLines={1}>{t.short}</Text>
                <Text style={styles.tabMeta} numberOfLines={1}>
                  {t.status === 'in_progress' ? 'live' : t.status === 'final' ? 'final' : dateRange(t.start, t.end)}
                </Text>
              </TouchableOpacity>
            );
          })}
        </ScrollView>
      )}

      <ScrollView
        contentContainerStyle={styles.body}
        refreshControl={<RefreshControl refreshing={golf.loading} onRefresh={golf.refresh} tintColor={colors.green} />}
      >
        {!!golf.error && !file && (
          <Text style={styles.error}>Could not load the PGA feed: {golf.error}. It rebuilds on a schedule — pull to try again.</Text>
        )}

        {!!current && (
          <LinearGradient colors={grad.vault} style={styles.hero}>
            <Text style={styles.kicker}>
              {current.status === 'in_progress' ? 'PLAYING NOW' : current.status === 'final' ? 'FINAL' : 'UPCOMING'}
            </Text>
            <Text style={styles.name}>{current.name}</Text>
            <Text style={styles.meta} numberOfLines={2}>
              {dateRange(current.start, current.end)}
              {current.course ? ` · ${current.course}` : ''}
              {money(current.purse) ? ` · ${money(current.purse)}` : ''}
            </Text>
            {!!current.statusDetail && <Text style={styles.detail}>{current.statusDetail}</Text>}
          </LinearGradient>
        )}

        {!!current && current.field.length > 0 && current.status !== 'scheduled' && (
          <View style={styles.card}>
            <Text style={styles.cardTitle}>{current.status === 'final' ? 'Final leaderboard' : 'Leaderboard'}</Text>
            {current.field.slice(0, 25).map((e, i) => (
              <TouchableOpacity
                key={e.playerId}
                style={styles.row}
                activeOpacity={0.85}
                onPress={() => { haptic('light'); onOpenPlayer(e.playerId); }}
              >
                <Text style={[styles.pos, numeric]}>{e.position ?? i + 1}</Text>
                <Face url={e.headshotUrl ?? e.flagUrl} />
                <Text style={styles.rowName} numberOfLines={1}>{e.name}</Text>
                {!!e.thru && <Text style={styles.thru}>{e.thru}</Text>}
                <Text style={[styles.score, numeric, (e.score ?? 0) < 0 && { color: colors.green }]}>{toPar(e.score)}</Text>
              </TouchableOpacity>
            ))}
          </View>
        )}

        {odds.length > 0 && (
          <View style={styles.card}>
            <Text style={styles.cardTitle}>
              {current?.status === 'in_progress' ? 'From here' : 'The model'}
            </Text>
            <View style={styles.head}>
              <Text style={[styles.h, { flex: 1 }]}>PLAYER</Text>
              <Text style={[styles.h, styles.hCol]}>WIN</Text>
              <Text style={[styles.h, styles.hCol]}>TOP 5</Text>
              <Text style={[styles.h, styles.hCol]}>TOP 10</Text>
            </View>
            {odds.slice(0, 20).map((o) => {
              const p = byId.get(o.playerId);
              return (
                <TouchableOpacity
                  key={o.playerId}
                  style={styles.row}
                  activeOpacity={0.85}
                  onPress={() => { haptic('light'); onOpenPlayer(o.playerId); }}
                >
                  <Face url={p?.headshotUrl ?? p?.flagUrl ?? null} />
                  <Text style={styles.rowName} numberOfLines={1}>{p?.name ?? o.playerId}</Text>
                  <Text style={[styles.pct, numeric, { color: colors.green }]}>{o.winPct.toFixed(1)}%</Text>
                  <Text style={[styles.pct, numeric]}>{o.top5Pct.toFixed(0)}%</Text>
                  <Text style={[styles.pct, numeric]}>{o.top10Pct.toFixed(0)}%</Text>
                </TouchableOpacity>
              );
            })}
            <Text style={styles.muted}>
              {current?.roundsLeft ?? 0} round{(current?.roundsLeft ?? 0) === 1 ? '' : 's'} simulated four thousand times, each drawn
              around the player's season scoring average{current?.status === 'in_progress' ? ', starting from where they stand now' : ''}.
              It knows nothing about the course, the weather or who is putting well — golf is the hardest sport there is to forecast,
              and a model that claimed otherwise would be lying about it.
            </Text>
          </View>
        )}

        {!!current && current.field.length === 0 && (
          <View style={styles.card}>
            <Text style={styles.cardTitle}>No field yet</Text>
            <Text style={styles.muted}>
              The field for this tournament has not been published. It usually lands a few days out, and the projection appears
              with it.
            </Text>
          </View>
        )}

        {!tournaments.length && !golf.loading && (
          <View style={styles.card}>
            <Text style={styles.muted}>Nothing on the PGA calendar in this window.</Text>
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

function Face({ url }: { url: string | null | undefined }) {
  if (!url) return <View style={styles.faceEmpty} />;
  return <Image source={{ uri: sizedHeadshot(url, 28) }} style={styles.face} resizeMode="cover" />;
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  bar: { flexGrow: 0, marginBottom: spacing.sm },
  barInner: { paddingHorizontal: spacing.lg, gap: spacing.sm },
  tab: { width: 132, paddingHorizontal: spacing.md, paddingVertical: 9, borderRadius: radius.md, backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border },
  tabName: { color: colors.ink, fontSize: 12, fontWeight: '800' },
  tabMeta: { color: colors.inkFaint, fontSize: 10, marginTop: 2 },

  body: { padding: spacing.lg, paddingTop: 0, paddingBottom: 40 },
  error: { color: colors.negative, fontSize: 12, lineHeight: 17, marginBottom: spacing.md },

  hero: { padding: spacing.md, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border },
  kicker: { color: colors.inkFaint, fontSize: 9.5, fontWeight: '900', letterSpacing: 1.3 },
  name: { color: colors.ink, fontSize: 19, fontWeight: '900', marginTop: 4 },
  meta: { color: colors.inkDim, fontSize: 11.5, lineHeight: 16, marginTop: 4 },
  detail: { color: colors.green, fontSize: 11, fontWeight: '800', marginTop: 6 },

  card: { marginTop: spacing.md, padding: spacing.md, borderRadius: radius.lg, backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border },
  cardTitle: { color: colors.ink, fontSize: 13, fontWeight: '900', marginBottom: spacing.sm },
  muted: { color: colors.inkFaint, fontSize: 11, lineHeight: 16, marginTop: spacing.sm },

  head: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingBottom: 5 },
  h: { color: colors.inkGhost, fontSize: 8.5, fontWeight: '900', letterSpacing: 0.7 },
  hCol: { width: 42, textAlign: 'right' },

  row: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 7, borderTopWidth: 1, borderTopColor: colors.border },
  pos: { color: colors.inkFaint, fontSize: 11, fontWeight: '900', width: 26 },
  face: { width: 28, height: 28, borderRadius: 14, backgroundColor: colors.cardAlt },
  faceEmpty: { width: 28, height: 28, borderRadius: 14, backgroundColor: colors.cardAlt, borderWidth: 1, borderColor: colors.border },
  rowName: { flex: 1, color: colors.ink, fontSize: 12.5, fontWeight: '800' },
  thru: { color: colors.inkFaint, fontSize: 10 },
  score: { color: colors.ink, fontSize: 13, fontWeight: '900', width: 40, textAlign: 'right' },
  pct: { color: colors.inkDim, fontSize: 11.5, fontWeight: '800', width: 42, textAlign: 'right' },
});
