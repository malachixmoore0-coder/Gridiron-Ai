/**
 * One game, any sport.
 *
 * The football game page is built around a box score — drives, snap counts,
 * play-by-play — and none of that exists for the generic feeds. Rather than
 * ship an empty imitation of it, this page answers the questions the data can
 * actually answer: what the model thinks, what every book is offering, how the
 * two sides got here, and whether there is anything worth putting on a card.
 *
 * The hero takes its colour from the home side, so a page you land on from the
 * teams tab still feels like that team's page.
 */
import React, { useMemo, useState } from 'react';
import { View, Text, ScrollView, TouchableOpacity, StyleSheet, Modal } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { colors, numeric, radius, spacing } from '@/theme';
import { RefMark } from '@/components/RefMark';
import { ProbBar } from '@/components/ProbBar';
import { BookOdds } from '@/components/BookOdds';
import { AddToCard } from '@/components/AddToCard';
import { useActiveLeague } from '@/league/LeagueContext';
import { useLive } from '@/live/LiveContext';
import { useSports } from '@/sports/SportsContext';
import { LEAGUE_BY_KEY, profileFor, type LeagueKey } from '@/sports/types';
import { haptic } from '@/utils/haptics';
import type { LeagueGame } from '@/league/types';

interface Props {
  gameId: string;
  onBack: () => void;
  onOpenTeam: (id: string) => void;
  onRun: (r: { awayId: string; homeId: string; ctx: { neutralSite: boolean; primetime: boolean; weather: 'auto' } }) => void;
}

/** Mix a team colour into the page ground so the hero reads as theirs. */
function tint(hex: string, amount: number): string {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex || '');
  if (!m) return colors.card;
  const n = parseInt(m[1], 16);
  const mix = (c: number, base: number) => Math.round(c * amount + base * (1 - amount));
  return `rgb(${mix((n >> 16) & 255, 11)}, ${mix((n >> 8) & 255, 23)}, ${mix(n & 255, 32)})`;
}

const dateLine = (iso: string) =>
  new Date(iso).toLocaleString(undefined, { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });

export function SportGameScreen({ gameId, onBack, onOpenTeam, onRun }: Props) {
  const view = useActiveLeague();
  const live = useLive();
  const { feeds } = useSports();
  const meta = LEAGUE_BY_KEY[view.id];
  const profile = profileFor(view.id);
  const [adding, setAdding] = useState(false);

  const base = view.games.find((g) => g.id === gameId);
  const score = live.scores.get(gameId);
  const game: LeagueGame | undefined = useMemo(() => {
    if (!base) return undefined;
    if (!score || base.status === 'final') return base;
    return { ...base, awayScore: score.awayScore ?? base.awayScore, homeScore: score.homeScore ?? base.homeScore, status: score.status, statusDetail: score.statusDetail ?? base.statusDetail };
  }, [base, score]);

  const ratings = useMemo(() => {
    const feed = feeds[view.id as LeagueKey];
    return new Map((feed?.teams?.teams ?? []).map((t) => [t.id, t]));
  }, [feeds, view.id]);

  /** The last five results each side has on the board, most recent first. */
  const form = useMemo(() => {
    const of = (teamId: string) =>
      view.games
        .filter((g) => g.status === 'final' && (g.awayId === teamId || g.homeId === teamId) && g.id !== gameId)
        .sort((a, b) => b.kickoff.localeCompare(a.kickoff))
        .slice(0, 5)
        .map((g) => {
          const home = g.homeId === teamId;
          const own = (home ? g.homeScore : g.awayScore) ?? 0;
          const opp = (home ? g.awayScore : g.homeScore) ?? 0;
          return { id: g.id, won: own > opp, drew: own === opp, own, opp, opponent: view.abbrOf(home ? g.awayId : g.homeId), home };
        });
    return game ? { away: of(game.awayId), home: of(game.homeId) } : { away: [], home: [] };
  }, [view, game, gameId]);

  if (!game) {
    return (
      <View style={styles.missing}>
        <Ionicons name="help-circle-outline" size={24} color={colors.inkGhost} />
        <Text style={styles.missingText}>That game is not on the current {meta.name} board.</Text>
        <TouchableOpacity style={styles.missingBtn} onPress={onBack}><Text style={styles.missingBtnText}>Go back</Text></TouchableOpacity>
      </View>
    );
  }

  const away = view.teamRef(game.awayId);
  const home = view.teamRef(game.homeId);
  const rec = view.findRecord(game.id);
  const drawPct = (rec as { drawPct?: number } | undefined)?.drawPct ?? 0;
  const ar = ratings.get(game.awayId);
  const hr = ratings.get(game.homeId);
  const started = game.status !== 'scheduled';
  const unit = profile.unit;

  return (
    <ScrollView style={styles.root} contentContainerStyle={styles.body}>
      <LinearGradient
        colors={[tint(home?.colors.primary ?? meta.accent, 0.42), tint(away?.colors.primary ?? meta.accent, 0.16), colors.bg]}
        style={styles.hero}
      >
        <Text style={styles.kicker}>{meta.name.toUpperCase()} · {game.gameType.toUpperCase()}</Text>
        <View style={styles.heroRow}>
          <TouchableOpacity style={styles.side} activeOpacity={0.85} onPress={() => onOpenTeam(game.awayId)}>
            <RefMark team={away} size={48} disc />
            <Text style={styles.sideAbbr}>{away?.abbr ?? '—'}</Text>
            <Text style={styles.sideMeta} numberOfLines={1}>{away?.record ?? ''}</Text>
          </TouchableOpacity>

          <View style={styles.middle}>
            {started ? (
              <>
                <Text style={[styles.scoreLine, numeric]}>{game.awayScore ?? 0} – {game.homeScore ?? 0}</Text>
                <Text style={[styles.status, game.status === 'in_progress' && { color: colors.live }]} numberOfLines={1}>
                  {game.status === 'final' ? 'Final' : game.statusDetail || 'In progress'}
                </Text>
              </>
            ) : (
              <>
                <Text style={styles.when}>{dateLine(game.kickoff)}</Text>
                <Text style={styles.status} numberOfLines={1}>{game.broadcast || (game.neutralSite ? 'Neutral site' : game.stadium) || meta.short}</Text>
              </>
            )}
          </View>

          <TouchableOpacity style={styles.side} activeOpacity={0.85} onPress={() => onOpenTeam(game.homeId)}>
            <RefMark team={home} size={48} disc />
            <Text style={styles.sideAbbr}>{home?.abbr ?? '—'}</Text>
            <Text style={styles.sideMeta} numberOfLines={1}>{home?.record ?? ''}</Text>
          </TouchableOpacity>
        </View>
      </LinearGradient>

      {rec ? (
        <View style={styles.card}>
          <Text style={styles.cardTitle}>The model</Text>
          <ProbBar awayPct={rec.awayWinPct} homePct={rec.homeWinPct} drawPct={drawPct} awayAbbr={away?.abbr ?? ''} homeAbbr={home?.abbr ?? ''} />
          {drawPct > 0 && (
            <Text style={styles.drawNote}>
              In a low-scoring sport the tie is a real outcome, not a rounding error, so it gets its own share of the bar.
            </Text>
          )}
          <View style={styles.grid}>
            <Cell label="Projected" value={`${rec.projectedAway.toFixed(1)} – ${rec.projectedHome.toFixed(1)}`} sub={`${unit}s, mean of the runs`} />
            <Cell
              label="Model line"
              value={rec.spread > 0 ? `${away?.abbr} -${rec.spread.toFixed(1)}` : `${home?.abbr} ${rec.spread.toFixed(1)}`}
              sub={game.homeSpread != null ? `market ${game.homeSpread > 0 ? `${away?.abbr} -${game.homeSpread}` : `${home?.abbr} ${game.homeSpread}`}` : 'no market line yet'}
            />
            <Cell label="Total" value={rec.total.toFixed(1)} sub={game.totalLine != null ? `market ${game.totalLine}` : 'no market total yet'} />
          </View>
          {game.homeSpread != null && (
            <Text style={styles.edgeNote}>
              {Math.abs(game.homeSpread - rec.spread) < 0.5
                ? 'The model and the market agree here. That is information too — it usually means there is no edge to take.'
                : `The model is ${Math.abs(game.homeSpread - rec.spread).toFixed(1)} ${unit}s off the market. That gap is the whole reason to look at this game.`}
            </Text>
          )}
        </View>
      ) : (
        <View style={styles.card}>
          <Text style={styles.cardTitle}>The model</Text>
          <Text style={styles.muted}>
            No projection is published for this game yet. Projections open a few days out and lock at the first whistle.
          </Text>
        </View>
      )}

      <View style={styles.card}>
        <Text style={styles.cardTitle}>Sportsbooks</Text>
        <BookOdds game={game} rec={rec} awayAbbr={away?.abbr ?? ''} homeAbbr={home?.abbr ?? ''} />
      </View>

      {(!!ar || !!hr) && (
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Matchup</Text>
          <Bar label="Rating" a={ar?.rating ?? 1500} h={hr?.rating ?? 1500} awayAbbr={away?.abbr ?? ''} homeAbbr={home?.abbr ?? ''} fmt={(v) => Math.round(v).toString()} />
          <Bar label={`${unit}s scored`} a={ar?.attack ?? 1} h={hr?.attack ?? 1} awayAbbr={away?.abbr ?? ''} homeAbbr={home?.abbr ?? ''} fmt={(v) => `${v >= 1 ? '+' : ''}${Math.round((v - 1) * 100)}%`} />
          <Bar label={`${unit}s allowed`} a={2 - (ar?.defence ?? 1)} h={2 - (hr?.defence ?? 1)} awayAbbr={away?.abbr ?? ''} homeAbbr={home?.abbr ?? ''} fmt={(v) => `${2 - v <= 1 ? '' : '+'}${Math.round(((2 - v) - 1) * 100)}%`} />
          <Text style={styles.muted}>
            Ratings sit behind {Math.min(ar?.played ?? 0, hr?.played ?? 0)} game{Math.min(ar?.played ?? 0, hr?.played ?? 0) === 1 ? '' : 's'}{' '}
            for the thinner of the two sides. Early in a season that is a guess wearing a number, and the model leans harder on the market to say so.
          </Text>
        </View>
      )}

      {(form.away.length > 0 || form.home.length > 0) && (
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Recent form</Text>
          <FormRow abbr={away?.abbr ?? ''} rows={form.away} />
          <FormRow abbr={home?.abbr ?? ''} rows={form.home} />
        </View>
      )}

      <View style={styles.actions}>
        <TouchableOpacity
          style={styles.btn}
          activeOpacity={0.85}
          onPress={() => { haptic('light'); setAdding(true); }}
          accessibilityRole="button"
        >
          <Ionicons name="bookmark-outline" size={15} color={colors.ink} />
          <Text style={styles.btnText}>Add to card</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.btn, styles.btnGo]}
          activeOpacity={0.85}
          onPress={() => { haptic('medium'); onRun({ awayId: game.awayId, homeId: game.homeId, ctx: { neutralSite: game.neutralSite, primetime: false, weather: 'auto' } }); }}
          accessibilityRole="button"
        >
          <Ionicons name="analytics" size={15} color={colors.bg} />
          <Text style={[styles.btnText, { color: colors.bg }]}>Simulate</Text>
        </TouchableOpacity>
      </View>

      <Modal visible={adding} transparent animationType="fade" onRequestClose={() => setAdding(false)}>
        <TouchableOpacity style={styles.backdrop} activeOpacity={1} onPress={() => setAdding(false)}>
          <TouchableOpacity activeOpacity={1} style={styles.sheetWrap}>
            <AddToCard
              league={view.id}
              game={game}
              rec={rec}
              awayAbbr={away?.abbr ?? ''}
              homeAbbr={home?.abbr ?? ''}
              onClose={() => setAdding(false)}
            />
          </TouchableOpacity>
        </TouchableOpacity>
      </Modal>
    </ScrollView>
  );
}

function Cell({ label, value, sub }: { label: string; value: string; sub: string }) {
  return (
    <View style={styles.cell}>
      <Text style={styles.cellLabel}>{label}</Text>
      <Text style={[styles.cellValue, numeric]} numberOfLines={1}>{value}</Text>
      <Text style={styles.cellSub} numberOfLines={1}>{sub}</Text>
    </View>
  );
}

/** A two-sided bar: whoever is higher takes more of the width. */
function Bar({ label, a, h, awayAbbr, homeAbbr, fmt }: { label: string; a: number; h: number; awayAbbr: string; homeAbbr: string; fmt: (v: number) => string }) {
  const total = Math.abs(a) + Math.abs(h) || 1;
  const share = Math.max(0.12, Math.min(0.88, Math.abs(a) / total));
  return (
    <View style={styles.barWrap}>
      <View style={styles.barHead}>
        <Text style={[styles.barVal, numeric]}>{fmt(a)}</Text>
        <Text style={styles.barLabel}>{label}</Text>
        <Text style={[styles.barVal, numeric]}>{fmt(h)}</Text>
      </View>
      <View style={styles.barTrack} accessibilityLabel={`${label}: ${awayAbbr} ${fmt(a)}, ${homeAbbr} ${fmt(h)}`}>
        <View style={[styles.barFill, { flex: share, backgroundColor: colors.inkDim }]} />
        <View style={[styles.barFill, { flex: 1 - share, backgroundColor: colors.green }]} />
      </View>
    </View>
  );
}

function FormRow({ abbr, rows }: { abbr: string; rows: { id: string; won: boolean; drew: boolean; own: number; opp: number; opponent: string; home: boolean }[] }) {
  return (
    <View style={styles.formRow}>
      <Text style={styles.formAbbr}>{abbr}</Text>
      <View style={styles.formPills}>
        {rows.length === 0 && <Text style={styles.muted}>No finals on the board yet</Text>}
        {rows.map((r) => (
          <View
            key={r.id}
            style={[styles.pill, { borderColor: r.drew ? colors.gold : r.won ? colors.green : colors.negative }]}
          >
            <Text style={[styles.pillTop, { color: r.drew ? colors.gold : r.won ? colors.green : colors.negative }]}>
              {r.drew ? 'D' : r.won ? 'W' : 'L'} {r.own}–{r.opp}
            </Text>
            <Text style={styles.pillSub} numberOfLines={1}>{r.home ? 'vs' : '@'} {r.opponent}</Text>
          </View>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  body: { paddingBottom: 40 },

  missing: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 10, backgroundColor: colors.bg, padding: spacing.xl },
  missingText: { color: colors.inkFaint, fontSize: 13, textAlign: 'center' },
  missingBtn: { paddingHorizontal: 18, paddingVertical: 10, borderRadius: radius.pill, backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border },
  missingBtnText: { color: colors.ink, fontSize: 12, fontWeight: '800' },

  hero: { paddingHorizontal: spacing.lg, paddingTop: spacing.lg, paddingBottom: spacing.xl },
  kicker: { color: colors.inkFaint, fontSize: 10, fontWeight: '900', letterSpacing: 1.4 },
  heroRow: { flexDirection: 'row', alignItems: 'center', marginTop: spacing.md },
  side: { flex: 1, alignItems: 'center', gap: 5 },
  sideAbbr: { color: colors.ink, fontSize: 14, fontWeight: '900' },
  sideMeta: { color: colors.inkFaint, fontSize: 10.5, fontWeight: '700' },
  middle: { flex: 1.3, alignItems: 'center', gap: 4 },
  scoreLine: { color: colors.ink, fontSize: 26, fontWeight: '900' },
  when: { color: colors.ink, fontSize: 13, fontWeight: '800', textAlign: 'center' },
  status: { color: colors.inkFaint, fontSize: 10.5, fontWeight: '700', textAlign: 'center' },

  card: { marginHorizontal: spacing.lg, marginTop: spacing.md, padding: spacing.md, backgroundColor: colors.card, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border },
  cardTitle: { color: colors.ink, fontSize: 13, fontWeight: '900', marginBottom: spacing.sm },
  muted: { color: colors.inkFaint, fontSize: 11, lineHeight: 16 },
  drawNote: { color: colors.gold, fontSize: 11, lineHeight: 16, marginTop: spacing.sm },

  grid: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.md },
  cell: { flex: 1, padding: spacing.sm, borderRadius: radius.md, backgroundColor: colors.cardAlt },
  cellLabel: { color: colors.inkFaint, fontSize: 9, fontWeight: '900', letterSpacing: 0.8, textTransform: 'uppercase' },
  cellValue: { color: colors.ink, fontSize: 14, fontWeight: '900', marginTop: 3 },
  cellSub: { color: colors.inkGhost, fontSize: 9.5, marginTop: 2 },
  edgeNote: { color: colors.inkFaint, fontSize: 11, lineHeight: 16, marginTop: spacing.md },

  barWrap: { marginBottom: spacing.md },
  barHead: { flexDirection: 'row', alignItems: 'center', marginBottom: 5 },
  barLabel: { flex: 1, color: colors.inkFaint, fontSize: 10, fontWeight: '800', textAlign: 'center', textTransform: 'uppercase', letterSpacing: 0.6 },
  barVal: { color: colors.ink, fontSize: 12, fontWeight: '900', minWidth: 54 },
  barTrack: { flexDirection: 'row', height: 7, borderRadius: 4, overflow: 'hidden', gap: 2 },
  barFill: { height: 7, borderRadius: 4 },

  formRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginBottom: spacing.sm },
  formAbbr: { color: colors.ink, fontSize: 12, fontWeight: '900', width: 46 },
  formPills: { flex: 1, flexDirection: 'row', flexWrap: 'wrap', gap: 5 },
  pill: { paddingHorizontal: 7, paddingVertical: 4, borderRadius: radius.sm, borderWidth: 1, backgroundColor: colors.cardAlt },
  pillTop: { fontSize: 10, fontWeight: '900' },
  pillSub: { color: colors.inkGhost, fontSize: 8.5 },

  actions: { flexDirection: 'row', gap: 8, marginHorizontal: spacing.lg, marginTop: spacing.lg },
  btn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7, paddingVertical: 12, borderRadius: radius.pill, backgroundColor: colors.cardAlt, borderWidth: 1, borderColor: colors.border },
  btnGo: { backgroundColor: colors.green, borderColor: colors.green },
  btnText: { color: colors.ink, fontSize: 12.5, fontWeight: '800' },

  backdrop: { flex: 1, backgroundColor: colors.overlay, justifyContent: 'flex-end', padding: spacing.md },
  sheetWrap: { marginBottom: spacing.xl },
});
