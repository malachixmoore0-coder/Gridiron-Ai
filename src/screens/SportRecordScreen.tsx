/**
 * The model's track record for any generic league.
 *
 * Same law as the football version, which is the whole point: a projection is
 * published before the game, frozen when it starts, and graded on the final. It
 * is never back-filled and never quietly revised, so a bad week stays on the
 * page. That is the only version of a track record worth anything.
 */
import React, { useMemo, useState } from 'react';
import { View, Text, ScrollView, TouchableOpacity, StyleSheet, ActivityIndicator } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors, numeric, radius, spacing, clearance } from '@/theme';
import { Chip } from '@/components/Chip';
import { RefMark } from '@/components/RefMark';
import { Locked } from '@/components/Pro';
import { useActiveLeague } from '@/league/LeagueContext';
import { useEntitlements } from '@/context/EntitlementsContext';
import { useSports } from '@/sports/SportsContext';
import { SportGlyph } from '@/components/SportGlyph';
import { LEAGUE_BY_KEY, profileFor, type LeagueKey } from '@/sports/types';
import { calibration, confidenceOf, intervalLabel, pctOf, sampleNote, summarize } from '@/utils/record';
import { clvOf } from '@/utils/clv';
import { ClosingLine } from '@/components/ClosingLine';
import { haptic } from '@/utils/haptics';
import type { PredictionRecord } from '@/league/types';

interface Props { onOpenGame: (teamId: string, gameId: string) => void; onUpgrade?: () => void }

type Bucket = 'final' | 'locked' | 'open';

const BUCKETS: { key: Bucket; label: string }[] = [
  { key: 'final', label: 'Graded' },
  { key: 'locked', label: 'Locked' },
  { key: 'open', label: 'Open' },
];

export function SportRecordScreen({ onOpenGame, onUpgrade }: Props) {
  const view = useActiveLeague();
  const ent = useEntitlements();
  const { feeds } = useSports();
  const meta = LEAGUE_BY_KEY[view.id];
  const profile = profileFor(view.id);
  const [bucket, setBucket] = useState<Bucket>('final');

  const model = feeds[view.id as LeagueKey]?.predictions?.model;
  const lines = feeds[view.id as LeagueKey]?.lines;
  const records = view.records as PredictionRecord[];

  // Free accounts see a rolling window; paid accounts see the whole archive.
  const horizon = Date.now() - ent.ent.historyDays * 86_400_000;
  const inWindow = useMemo(() => records.filter((r) => Date.parse(r.kickoff) >= horizon), [records, horizon]);
  const clipped = records.length - inWindow.length;

  const sum = useMemo(() => summarize(inWindow), [inWindow]);

  // Which side the model took, by the same rule the Edge Board uses: the market
  // number minus the model's own line, positive meaning it likes the home side.
  // Scored against the number that game closed at.
  const clv = useMemo(() => clvOf(inWindow.map((r) => {
    const open = lines?.games?.[r.id]?.opened;
    const line = open?.spread ?? r.marketHomeSpread;
    const side: 'home' | 'away' = line != null
      ? (line - r.spread >= 0 ? 'home' : 'away')
      : (r.homeWinPct >= r.awayWinPct ? 'home' : 'away');
    return { id: r.id, side };
  }), lines), [inWindow, lines]);
  const cal = useMemo(() => calibration(inWindow), [inWindow]);
  const shown = useMemo(
    () => inWindow.filter((r) => r.status === bucket)
      .sort((a, b) => (bucket === 'final' ? b.kickoff.localeCompare(a.kickoff) : a.kickoff.localeCompare(b.kickoff)))
      .slice(0, 60),
    [inWindow, bucket],
  );

  if (view.loading && !records.length) {
    return <ActivityIndicator color={colors.green} style={{ marginTop: 60 }} />;
  }

  if (!records.length) {
    return (
      <View style={styles.empty}>
        <SportGlyph sport={profile.sport} size={30} color={meta.accent} tile />
        <Text style={styles.emptyText}>
          No {meta.name} predictions are published yet. The first ones open a few days before the season's
          opening slate, and the record starts filling in from there.
        </Text>
      </View>
    );
  }

  return (
    <ScrollView contentContainerStyle={styles.body}>
      <View style={styles.tiles}>
        <Tile
          label="Straight up"
          value={pctOf(sum.su, sum.finals)}
          sub={`${sum.su}-${sum.finals - sum.su} · winner picked`}
          ci={intervalLabel(sum.su, sum.finals)}
        />
        <Tile
          label="vs spread"
          value={pctOf(sum.ats, sum.ats + sum.atsL)}
          sub={`${sum.ats}-${sum.atsL}${sum.atsP ? `-${sum.atsP}` : ''} · model side`}
          ci={intervalLabel(sum.ats, sum.ats + sum.atsL)}
        />
        <Tile
          label="Over / under"
          value={pctOf(sum.ou, sum.ou + sum.ouL)}
          sub={`${sum.ou}-${sum.ouL}${sum.ouP ? `-${sum.ouP}` : ''} · model total`}
          ci={intervalLabel(sum.ou, sum.ou + sum.ouL)}
        />
      </View>
      <View style={styles.tiles}>
        <Tile label="Brier score" value={sum.brier === null ? '—' : sum.brier.toFixed(3)} sub="0 = perfect · 0.25 = coin flip" />
        <Tile label="Margin error" value={sum.spreadMae === null ? '—' : `±${sum.spreadMae.toFixed(1)}`} sub={`avg ${profile.unit}s off the margin`} />
        <Tile label="Total error" value={sum.totalMae === null ? '—' : `±${sum.totalMae.toFixed(1)}`} sub={`avg ${profile.unit}s off the total`} />
      </View>

      <ClosingLine clv={clv} unit={profile.unit} />

      {/* Said at every sample size, because the sample size never stops
          mattering — only what it supports changes. */}
      <Text style={[styles.thin, confidenceOf(sum.finals) === 'noise' && styles.thinWarn]}>
        {sampleNote(sum.finals)}
      </Text>

      {sum.finals >= 5 && (ent.ent.calibration ? (
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Calibration</Text>
          <Text style={styles.muted}>When the model says a number, does it happen that often? A model that is merely confident drifts away from its own line here.</Text>
          {cal.filter((row) => row.games > 0).map((row) => {
            const actual = (row.favWins / row.games) * 100;
            const expected = row.expected / row.games;
            return (
              <View key={row.label} style={styles.calRow}>
                <Text style={styles.calBucket}>{row.label}</Text>
                <View style={styles.calTrack}>
                  <View style={[styles.calFill, { width: `${Math.min(100, actual)}%` }]} />
                  <View style={[styles.calMark, { left: `${Math.min(99, expected)}%` }]} />
                </View>
                <Text style={[styles.calVal, numeric]}>{actual.toFixed(0)}%</Text>
                <Text style={styles.calN}>n={row.games}</Text>
              </View>
            );
          })}
          <Text style={styles.fineTight}>Bar is what happened; the tick is what the model said would happen.</Text>
        </View>
      ) : (
        <Locked
          title="Calibration"
          blurb="When the model says 70%, does it win 70% of the time? The calibration curve is how you tell a model that is right from one that is merely confident."
          cta="Unlock calibration"
          onPress={onUpgrade ?? (() => {})}
          style={{ marginBottom: 16 }}
        />
      ))}

      {!!clipped && (
        <TouchableOpacity style={styles.clipped} activeOpacity={0.85} onPress={onUpgrade}>
          <Text style={styles.clippedText}>
            {clipped} older prediction{clipped === 1 ? '' : 's'} hidden — free accounts see the last {ent.ent.historyDays} days
          </Text>
          <Ionicons name="chevron-forward" size={14} color={colors.gold} />
        </TouchableOpacity>
      )}

      <View style={styles.filters}>
        {BUCKETS.map((b) => (
          <Chip
            key={b.key}
            label={`${b.label} · ${inWindow.filter((r) => r.status === b.key).length}`}
            active={bucket === b.key}
            onPress={() => { haptic('select'); setBucket(b.key); }}
            small
          />
        ))}
      </View>

      {shown.map((r) => {
        const away = view.teamRef(r.awayId);
        const home = view.teamRef(r.homeId);
        const res = r.result;
        return (
          <TouchableOpacity
            key={r.id}
            style={styles.row}
            activeOpacity={0.85}
            onPress={() => { haptic('light'); onOpenGame(r.homeId, r.id); }}
          >
            <View style={styles.rowTop}>
              <RefMark team={away} size={22} disc />
              <Text style={styles.rowTeams} numberOfLines={1}>
                {away?.abbr ?? r.awayId.toUpperCase()} @ {home?.abbr ?? r.homeId.toUpperCase()}
              </Text>
              <RefMark team={home} size={22} disc />
              <Text style={styles.rowDate}>
                {new Date(r.kickoff).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
              </Text>
            </View>
            <View style={styles.rowBody}>
              <Text style={styles.rowStat}>
                <Text style={styles.rowKey}>Called </Text>
                {r.spread > 0 ? `${away?.abbr} -${r.spread.toFixed(1)}` : `${home?.abbr} ${r.spread.toFixed(1)}`} · {r.total.toFixed(1)}
              </Text>
              {res ? (
                <>
                  <Text style={[styles.rowStat, numeric]}>
                    <Text style={styles.rowKey}>Final </Text>{res.awayScore}–{res.homeScore}
                  </Text>
                  <Badge ok={res.suCorrect} label={res.suCorrect ? 'SU ✓' : 'SU ✗'} />
                  {res.ats && <Badge ok={res.ats === 'win'} push={res.ats === 'push'} label={`ATS ${res.ats === 'win' ? '✓' : res.ats === 'push' ? '—' : '✗'}`} />}
                  {res.ou && <Badge ok={res.ou === 'win'} push={res.ou === 'push'} label={`O/U ${res.ou === 'win' ? '✓' : res.ou === 'push' ? '—' : '✗'}`} />}
                </>
              ) : (
                <Text style={styles.rowPending}>
                  {r.status === 'locked' ? `Locked at the first ${profile.sport === 'baseball' ? 'pitch' : 'whistle'}` : `Open · ${r.updates} update${r.updates === 1 ? '' : 's'}`}
                </Text>
              )}
            </View>
          </TouchableOpacity>
        );
      })}

      {!shown.length && (
        <Text style={styles.muted}>Nothing in this bucket yet.</Text>
      )}

      {!!model && (
        <Text style={styles.fine}>
          {model.simulations.toLocaleString()} runs per game · market weight {Math.round(model.marketWeight * 100)}% · home edge {model.homeEdge} {profile.unit}s. {model.note}
        </Text>
      )}
    </ScrollView>
  );
}

function Tile({ label, value, sub, ci }: { label: string; value: string; sub: string; ci?: string | null }) {
  return (
    <View style={styles.tile}>
      <Text style={styles.tileLabel}>{label}</Text>
      <Text style={[styles.tileValue, numeric]} numberOfLines={1}>{value}</Text>
      <Text style={styles.tileSub} numberOfLines={1}>{sub}</Text>
      {/* The error bar sits with the number it qualifies. A rate on its own is
          a claim; a rate with its interval is a measurement. */}
      {!!ci && <Text style={[styles.tileCi, numeric]} numberOfLines={1}>{ci}</Text>}
    </View>
  );
}

function Badge({ ok, push, label }: { ok: boolean; push?: boolean; label: string }) {
  const tone = push ? colors.inkDim : ok ? colors.green : colors.negative;
  return (
    <View style={[styles.badge, { borderColor: tone }]}>
      <Text style={[styles.badgeText, { color: tone }]}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  body: { padding: spacing.lg, paddingTop: spacing.sm, paddingBottom: clearance.dock },
  empty: { alignItems: 'center', gap: 10, margin: spacing.lg, padding: spacing.xl, backgroundColor: colors.card, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border },
  emptyText: { color: colors.inkFaint, fontSize: 12, lineHeight: 17, textAlign: 'center', maxWidth: 300 },

  tiles: { flexDirection: 'row', gap: spacing.sm, marginBottom: spacing.sm },
  tile: { flex: 1, padding: spacing.sm, borderRadius: radius.md, backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border },
  tileLabel: { color: colors.inkFaint, fontSize: 9, fontWeight: '900', letterSpacing: 0.8, textTransform: 'uppercase' },
  tileValue: { color: colors.ink, fontSize: 17, fontWeight: '900', marginTop: 3 },
  tileSub: { color: colors.inkGhost, fontSize: 9, marginTop: 2 },

  thin: { color: colors.inkDim, fontSize: 11, lineHeight: 16, marginTop: spacing.sm, marginBottom: spacing.sm },
  thinWarn: { color: colors.gold },
  tileCi: { color: colors.inkGhost, fontSize: 9.5, marginTop: 2 },

  card: { padding: spacing.md, borderRadius: radius.lg, backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border, marginBottom: spacing.md },
  cardTitle: { color: colors.ink, fontSize: 13, fontWeight: '900', marginBottom: 4 },
  muted: { color: colors.inkFaint, fontSize: 11, lineHeight: 16 },
  fineTight: { color: colors.inkGhost, fontSize: 9.5, lineHeight: 14, marginTop: 8 },
  fine: { color: colors.inkGhost, fontSize: 9.5, lineHeight: 14, marginTop: spacing.lg },

  calRow: { flexDirection: 'row', alignItems: 'center', gap: 7, marginTop: 7 },
  calBucket: { color: colors.inkDim, fontSize: 10, fontWeight: '800', width: 54 },
  calTrack: { flex: 1, height: 6, borderRadius: 3, backgroundColor: colors.cardAlt, overflow: 'hidden' },
  calFill: { height: 6, borderRadius: 3, backgroundColor: colors.green },
  calMark: { position: 'absolute', top: -2, width: 2, height: 10, backgroundColor: colors.gold },
  calVal: { color: colors.ink, fontSize: 10.5, fontWeight: '900', width: 34, textAlign: 'right' },
  calN: { color: colors.inkGhost, fontSize: 9, width: 34 },

  clipped: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8, padding: spacing.sm, borderRadius: radius.md, backgroundColor: colors.cardAlt, borderWidth: 1, borderColor: colors.border, marginBottom: spacing.md },
  clippedText: { flex: 1, color: colors.gold, fontSize: 11, fontWeight: '700' },

  filters: { flexDirection: 'row', gap: 6, marginBottom: spacing.sm },

  row: { padding: spacing.sm, borderRadius: radius.md, backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border, marginBottom: 6 },
  rowTop: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  rowTeams: { flex: 1, color: colors.ink, fontSize: 12, fontWeight: '900' },
  rowDate: { color: colors.inkGhost, fontSize: 10 },
  rowBody: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 8, marginTop: 6 },
  rowStat: { color: colors.ink, fontSize: 10.5, fontWeight: '700' },
  rowKey: { color: colors.inkFaint },
  rowPending: { color: colors.inkFaint, fontSize: 10.5, fontStyle: 'italic' },
  badge: { paddingHorizontal: 6, paddingVertical: 2, borderRadius: radius.sm, borderWidth: 1 },
  badgeText: { fontSize: 9.5, fontWeight: '900' },
});
