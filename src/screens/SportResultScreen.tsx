/**
 * The answer, for any sport.
 *
 * Ten thousand games, and then the honest parts: where the middle of the
 * distribution sits, how wide it is, what the market is offering against it,
 * and — the part most models skip — how much of this is actually knowledge.
 * A rating built on six games gets a warning, not a decimal place.
 */
import React, { useMemo, useState } from 'react';
import { View, Text, ScrollView, TouchableOpacity, StyleSheet, Modal } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { colors, grad, numeric, radius, spacing, clearance } from '@/theme';
import { RefMark } from '@/components/RefMark';
import { ProbBar } from '@/components/ProbBar';
import { Histogram } from '@/components/Histogram';
import { AddToCard } from '@/components/AddToCard';
import { useActiveLeague } from '@/league/LeagueContext';
import { useSports } from '@/sports/SportsContext';
import { LEAGUE_BY_KEY, profileFor, type LeagueKey } from '@/sports/types';
import { coverProbability, seedFor, simulate, type SimResult } from '@/sports/engine';
import type { SportRun } from '@/screens/SportMatchupScreen';
import { haptic } from '@/utils/haptics';

interface Props {
  request: SportRun;
  onBack: () => void;
  onOpenTeam: (id: string) => void;
}

const RUNS = 10_000;

export function SportResultScreen({ request, onBack, onOpenTeam }: Props) {
  const view = useActiveLeague();
  const { feeds } = useSports();
  const meta = LEAGUE_BY_KEY[view.id];
  const profile = profileFor(view.id);
  const [adding, setAdding] = useState(false);

  const teams = useMemo(() => {
    const feed = feeds[view.id as LeagueKey];
    return new Map((feed?.teams?.teams ?? []).map((t) => [t.id, t]));
  }, [feeds, view.id]);

  const away = view.teamRef(request.awayId);
  const home = view.teamRef(request.homeId);

  const game = useMemo(
    () => view.games.find((g) => g.awayId === request.awayId && g.homeId === request.homeId && g.status !== 'final'),
    [view.games, request.awayId, request.homeId],
  );

  const res: SimResult = useMemo(() => simulate(
    {
      home: { id: request.homeId, rating: teams.get(request.homeId)?.rating ?? 1500, attack: teams.get(request.homeId)?.attack, defence: teams.get(request.homeId)?.defence },
      away: { id: request.awayId, rating: teams.get(request.awayId)?.rating ?? 1500, attack: teams.get(request.awayId)?.attack, defence: teams.get(request.awayId)?.defence },
      neutral: request.ctx.neutralSite,
      marketHomeSpread: game?.homeSpread ?? null,
      marketTotal: game?.totalLine ?? null,
      marketWeight: request.marketWeight ?? 0.35,
    },
    profile,
    RUNS,
    seedFor(request.homeId, request.awayId, Math.round((request.marketWeight ?? 0.35) * 100) + (request.ctx.neutralSite ? 1000 : 0)),
  ), [request, teams, game, profile]);

  const played = Math.min(teams.get(request.homeId)?.played ?? 0, teams.get(request.awayId)?.played ?? 0);
  const thin = played < 8;
  const marketLine = game?.homeSpread ?? null;
  const cover = marketLine == null ? null : coverProbability(res, marketLine, profile) * 100;
  const favAbbr = res.spread < 0 ? home?.abbr : away?.abbr;
  const unit = profile.unit;

  return (
    <ScrollView style={styles.root} contentContainerStyle={styles.body}>
      <LinearGradient colors={grad.vault} style={styles.hero}>
        <Text style={styles.kicker}>{meta.name.toUpperCase()} · {RUNS.toLocaleString()} SIMULATED {profile.sport === 'soccer' ? 'MATCHES' : 'GAMES'}</Text>
        <View style={styles.heroRow}>
          <TouchableOpacity style={styles.side} activeOpacity={0.85} onPress={() => onOpenTeam(request.awayId)}>
            <RefMark team={away} size={46} disc />
            <Text style={styles.sideAbbr}>{away?.abbr ?? '—'}</Text>
            <Text style={[styles.sideScore, numeric]}>{res.projectedAway.toFixed(1)}</Text>
          </TouchableOpacity>
          <View style={styles.middle}>
            <Text style={styles.at}>{request.ctx.neutralSite ? 'neutral' : '@'}</Text>
            <Text style={styles.lineBig} numberOfLines={1}>
              {Math.abs(res.spread) < 0.25 ? 'Pick ’em' : `${favAbbr} -${Math.abs(res.spread).toFixed(1)}`}
            </Text>
            <Text style={styles.totalSmall}>Total {res.total.toFixed(1)}</Text>
          </View>
          <TouchableOpacity style={styles.side} activeOpacity={0.85} onPress={() => onOpenTeam(request.homeId)}>
            <RefMark team={home} size={46} disc />
            <Text style={styles.sideAbbr}>{home?.abbr ?? '—'}</Text>
            <Text style={[styles.sideScore, numeric]}>{res.projectedHome.toFixed(1)}</Text>
          </TouchableOpacity>
        </View>
        <ProbBar awayPct={res.awayWinPct} homePct={res.homeWinPct} drawPct={res.drawPct} awayAbbr={away?.abbr ?? ''} homeAbbr={home?.abbr ?? ''} />
      </LinearGradient>

      <View style={styles.card}>
        <Text style={styles.cardTitle}>Where it lands</Text>
        <Histogram bins={res.bins} awayAbbr={away?.abbr ?? ''} homeAbbr={home?.abbr ?? ''} />
        <View style={styles.grid}>
          <Cell label="10th" value={fmtMargin(res.p10, away?.abbr, home?.abbr)} sub={`${unit}s`} />
          <Cell label="Median" value={fmtMargin(res.p50, away?.abbr, home?.abbr)} sub={`${unit}s`} />
          <Cell label="90th" value={fmtMargin(res.p90, away?.abbr, home?.abbr)} sub={`${unit}s`} />
        </View>
        <Text style={styles.muted}>
          Eight runs in ten land between those outer numbers. {res.closePct.toFixed(0)}% finish inside{' '}
          {profile.sport === 'football' || profile.sport === 'basketball' ? 'one score' : `a ${unit}`} — the part of the
          distribution no model can call, and the reason a 60% edge still loses four times in ten.
        </Text>
      </View>

      {marketLine != null && (
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Against the market</Text>
          <View style={styles.grid}>
            <Cell
              label="Market"
              value={marketLine > 0 ? `${away?.abbr} -${marketLine}` : `${home?.abbr} ${marketLine}`}
              sub={game?.lineSource ? `via ${game.lineSource}` : 'book consensus'}
            />
            <Cell label="Model" value={res.spread > 0 ? `${away?.abbr} -${res.spread.toFixed(1)}` : `${home?.abbr} ${res.spread.toFixed(1)}`} sub={`${Math.abs(marketLine - res.spread).toFixed(1)} ${unit}s apart`} />
            <Cell label={`${home?.abbr} covers`} value={cover == null ? '—' : `${cover.toFixed(0)}%`} sub="at that line" />
          </View>
          <Text style={styles.muted}>
            {Math.abs(marketLine - res.spread) < profile.spreadStep
              ? 'The model and the market are on the same number. There is no edge here worth paying vig for.'
              : `The model is on ${res.spread < marketLine ? home?.abbr : away?.abbr} by ${Math.abs(marketLine - res.spread).toFixed(1)} ${unit}s more than the market. That gap is the bet, if you take it.`}
          </Text>
        </View>
      )}

      <View style={[styles.card, thin && styles.cardWarn]}>
        <Text style={styles.cardTitle}>How much to trust this</Text>
        <Text style={styles.muted}>
          {thin
            ? `Ratings for this pairing sit behind ${played} game${played === 1 ? '' : 's'}. Early in a season that is close to a prior with a number attached — the market is the better guide until the sample fills in, which is exactly what the market-led weight is for.`
            : `Ratings sit behind ${played}+ games each, which is enough for the ${meta.short} model to be doing real work. It still does not know about injuries, rest or travel — check those before you act on it.`}
        </Text>
        <Text style={styles.fine}>
          Margin σ {profile.marginSigma} · home edge {request.ctx.neutralSite ? 0 : profile.homeEdge} {unit}s · market weight {Math.round((request.marketWeight ?? 0.35) * 100)}% · seeded, so this result reproduces exactly.
        </Text>
      </View>

      <View style={styles.actions}>
        <TouchableOpacity style={styles.btn} activeOpacity={0.85} onPress={onBack} accessibilityRole="button">
          <Ionicons name="refresh" size={15} color={colors.ink} />
          <Text style={styles.btnText}>New matchup</Text>
        </TouchableOpacity>
        {!!game && (
          <TouchableOpacity
            style={[styles.btn, styles.btnGo]}
            activeOpacity={0.85}
            onPress={() => { haptic('light'); setAdding(true); }}
            accessibilityRole="button"
          >
            <Ionicons name="bookmark-outline" size={15} color={colors.bg} />
            <Text style={[styles.btnText, { color: colors.bg }]}>Add to card</Text>
          </TouchableOpacity>
        )}
      </View>

      <Modal visible={adding} transparent animationType="fade" onRequestClose={() => setAdding(false)}>
        <TouchableOpacity style={styles.backdrop} activeOpacity={1} onPress={() => setAdding(false)}>
          <TouchableOpacity activeOpacity={1} style={styles.sheetWrap}>
            {!!game && (
              <AddToCard
                league={view.id}
                game={game}
                rec={view.findRecord(game.id)}
                awayAbbr={away?.abbr ?? ''}
                homeAbbr={home?.abbr ?? ''}
                onClose={() => setAdding(false)}
              />
            )}
          </TouchableOpacity>
        </TouchableOpacity>
      </Modal>
    </ScrollView>
  );
}

const fmtMargin = (m: number, awayAbbr?: string, homeAbbr?: string) =>
  m === 0 ? 'Level' : m > 0 ? `${homeAbbr} +${m.toFixed(1)}` : `${awayAbbr} +${Math.abs(m).toFixed(1)}`;

function Cell({ label, value, sub }: { label: string; value: string; sub: string }) {
  return (
    <View style={styles.cell}>
      <Text style={styles.cellLabel}>{label}</Text>
      <Text style={[styles.cellValue, numeric]} numberOfLines={1}>{value}</Text>
      <Text style={styles.cellSub} numberOfLines={1}>{sub}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  body: { paddingBottom: clearance.overlay },

  hero: { paddingHorizontal: spacing.lg, paddingTop: spacing.lg, paddingBottom: spacing.lg },
  kicker: { color: colors.inkFaint, fontSize: 9.5, fontWeight: '900', letterSpacing: 1.3 },
  heroRow: { flexDirection: 'row', alignItems: 'center', marginTop: spacing.md, marginBottom: spacing.md },
  side: { flex: 1, alignItems: 'center', gap: 4 },
  sideAbbr: { color: colors.ink, fontSize: 13, fontWeight: '900' },
  sideScore: { color: colors.green, fontSize: 18, fontWeight: '900' },
  middle: { flex: 1.25, alignItems: 'center', gap: 2 },
  at: { color: colors.inkGhost, fontSize: 10, fontWeight: '800' },
  lineBig: { color: colors.ink, fontSize: 17, fontWeight: '900', textAlign: 'center' },
  totalSmall: { color: colors.inkFaint, fontSize: 11, fontWeight: '700' },

  card: { marginHorizontal: spacing.lg, marginTop: spacing.md, padding: spacing.md, backgroundColor: colors.card, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border },
  cardWarn: { borderColor: colors.gold },
  cardTitle: { color: colors.ink, fontSize: 13, fontWeight: '900', marginBottom: spacing.sm },
  muted: { color: colors.inkFaint, fontSize: 11, lineHeight: 16, marginTop: spacing.sm },
  fine: { color: colors.inkGhost, fontSize: 9.5, lineHeight: 14, marginTop: spacing.sm },

  grid: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.md },
  cell: { flex: 1, padding: spacing.sm, borderRadius: radius.md, backgroundColor: colors.cardAlt },
  cellLabel: { color: colors.inkFaint, fontSize: 9, fontWeight: '900', letterSpacing: 0.8, textTransform: 'uppercase' },
  cellValue: { color: colors.ink, fontSize: 13.5, fontWeight: '900', marginTop: 3 },
  cellSub: { color: colors.inkGhost, fontSize: 9.5, marginTop: 2 },

  actions: { flexDirection: 'row', gap: 8, marginHorizontal: spacing.lg, marginTop: spacing.lg },
  btn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7, paddingVertical: 12, borderRadius: radius.pill, backgroundColor: colors.cardAlt, borderWidth: 1, borderColor: colors.border },
  btnGo: { backgroundColor: colors.green, borderColor: colors.green },
  btnText: { color: colors.ink, fontSize: 12.5, fontWeight: '800' },

  backdrop: { flex: 1, backgroundColor: colors.overlay, justifyContent: 'flex-end', padding: spacing.md },
  sheetWrap: { marginBottom: spacing.xl },
});
