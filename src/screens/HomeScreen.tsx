/**
 * The Floor — Gridiron AI's home.
 *
 * Structured like a trading desk rather than a sports app, because that is what
 * the product actually is: one tape, one headline position, one ranked book of
 * opportunities, one P&L. Everything above the fold answers "is there money on
 * the board right now?" and everything below it answers "how have I been doing?"
 */
import React, { useEffect, useMemo, useState } from 'react';
import { View, Text, ScrollView, TouchableOpacity, StyleSheet, RefreshControl } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { colors, grad, numeric, radius, shadow, spacing, type as T } from '@/theme';
import { useTeams } from '@/context/TeamsContext';
import { useEntitlements } from '@/context/EntitlementsContext';
import { useEngagement } from '@/context/EngagementContext';
import { buildEdges, lockOfDay, fmtOdds, type EdgeRow } from '@/utils/edge';
import { TeamMark } from '@/components/TeamMark';
import { Ticker, type TickerItem } from '@/components/Ticker';
import { ConvictionBar, Locked, MeterPill, StreakPill, TierPill } from '@/components/Pro';
import type { RunRequest } from '@/hooks/useAnalysis';
import { DEFAULT_CTX } from '@/hooks/useAnalysis';

interface Props {
  onRun: (r: RunRequest) => void;
  onOpenGame: (teamId: string, gameId: string) => void;
  onOpenTeam: (teamId: string) => void;
  onUpgrade: () => void;
  onOpenCard: () => void;
  onOpenParlay: () => void;
  onOpenModel: () => void;
}

const clock = () => new Date().toLocaleDateString(undefined, { weekday: 'long', month: 'short', day: 'numeric' });

export function HomeScreen({ onRun, onOpenGame, onOpenTeam, onUpgrade, onOpenCard, onOpenParlay, onOpenModel }: Props) {
  const { getTeam, hasTeam, weekGames, records, refresh, refreshing, week, phase } = useTeams();
  const ent = useEntitlements();
  const eng = useEngagement();
  const [now, setNow] = useState(Date.now());

  useEffect(() => { const t = setInterval(() => setNow(Date.now()), 60_000); return () => clearInterval(t); }, []);

  // Grade any saved pick whose game has a final on the published slate.
  useEffect(() => {
    const finals = new Map(
      weekGames
        .filter((g) => g.status === 'final' && g.awayScore != null && g.homeScore != null)
        .map((g) => [g.id, { awayScore: g.awayScore as number, homeScore: g.homeScore as number }]),
    );
    if (finals.size) eng.settle(finals);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [weekGames.length, eng.loaded]);

  const rows = useMemo(
    () => buildEdges(weekGames, records, (id) => (hasTeam(id) ? getTeam(id).abbr : id.toUpperCase())),
    [weekGames, records, getTeam, hasTeam],
  );
  const board = useMemo(() => rows.filter((r) => !r.played), [rows]);
  const lock = useMemo(() => lockOfDay(board), [board]);
  const visible = ent.ent.edgeBoardDepth === Infinity ? board : board.slice(0, ent.ent.edgeBoardDepth);
  const hidden = board.length - visible.length;

  const tick: TickerItem[] = useMemo(() => {
    const live = weekGames.filter((g) => g.status === 'in_progress').map((g) => ({
      key: `l-${g.id}`,
      left: `${abbr(g.awayId)} ${g.awayScore ?? 0}–${g.homeScore ?? 0} ${abbr(g.homeId)}`,
      right: g.statusDetail ?? 'LIVE',
      tone: 'live' as const,
      onPress: () => onOpenGame(g.homeId, g.id),
    }));
    const edges = board.slice(0, 12).map((r) => ({
      key: `e-${r.gameId}`,
      left: `${abbr(r.game.awayId)}@${abbr(r.game.homeId)}`,
      right: `${r.spreadSide === 'home' ? abbr(r.game.homeId) : abbr(r.game.awayId)} +${r.spreadEdge.toFixed(1)}`,
      tone: 'money' as const,
      onPress: () => onOpenGame(r.game.homeId, r.gameId),
    }));
    return [...live, ...edges];
    function abbr(id: string) { return hasTeam(id) ? getTeam(id).abbr : id.toUpperCase(); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [weekGames, board, getTeam, hasTeam, now]);

  const s = eng.summary;

  return (
    <SafeAreaView edges={['top']} style={styles.safe}>
      <View style={styles.head}>
        <View style={{ flex: 1 }}>
          <Text style={styles.wordmark}>GRIDIRON <Text style={{ color: colors.green }}>AI</Text></Text>
          <Text style={styles.date}>{clock()} · {phase === 'postseason' ? 'Postseason' : phase === 'offseason' ? 'Offseason' : `Week ${week}`}</Text>
        </View>
        <View style={styles.headRight}>
          <StreakPill days={eng.streak} onPress={onOpenCard} />
          <TierPill tier={ent.tier} trial={ent.trial.active ? ent.trial.daysLeft : undefined} onPress={onUpgrade} />
          <TouchableOpacity style={styles.gear} activeOpacity={0.8} onPress={onOpenModel} accessibilityRole="button" accessibilityLabel="Model settings">
            <Ionicons name="options" size={16} color={colors.inkDim} />
          </TouchableOpacity>
        </View>
      </View>

      <Ticker items={tick} />

      <ScrollView
        contentContainerStyle={styles.body}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} tintColor={colors.green} />}
      >
        {/* ---- Lock of the day ---- */}
        {lock ? (
          ent.ent.lockOfDay ? <LockCard row={lock} onOpen={onOpenGame} onRun={onRun} /> : (
            <Locked
              title="Lock of the Day"
              blurb="The single highest-conviction play on the board, with the reasoning behind it. Free accounts see the board; Starter sees the pick."
              cta="Unlock the Lock"
              onPress={onUpgrade}
              preview={<LockCard row={lock} onOpen={() => {}} onRun={() => {}} />}
              style={{ height: 214, marginBottom: spacing.lg }}
            />
          )
        ) : null}

        {/* ---- P&L strip ---- */}
        <TouchableOpacity style={styles.pnl} activeOpacity={0.85} onPress={onOpenCard}>
          <View style={styles.pnlCell}>
            <Text style={styles.pnlLabel}>YOUR CARD</Text>
            <Text style={[styles.pnlBig, numeric]}>{s.won}-{s.lost}{s.push ? `-${s.push}` : ''}</Text>
          </View>
          <View style={styles.pnlDivider} />
          <View style={styles.pnlCell}>
            <Text style={styles.pnlLabel}>HIT RATE</Text>
            <Text style={[styles.pnlBig, numeric, { color: (s.hitRate ?? 0) >= 52.4 ? colors.green : colors.ink }]}>
              {s.hitRate == null ? '—' : `${s.hitRate.toFixed(0)}%`}
            </Text>
          </View>
          <View style={styles.pnlDivider} />
          <View style={styles.pnlCell}>
            <Text style={styles.pnlLabel}>UNITS</Text>
            <Text style={[styles.pnlBig, numeric, { color: s.units > 0 ? colors.green : s.units < 0 ? colors.negative : colors.ink }]}>
              {s.units > 0 ? '+' : ''}{s.units.toFixed(1)}
            </Text>
          </View>
          <Ionicons name="chevron-forward" size={16} color={colors.inkGhost} />
        </TouchableOpacity>

        {/* ---- your teams ---- */}
        {eng.follows.length > 0 && (
          <View style={styles.follows}>
            <Text style={styles.followsLabel}>YOUR TEAMS</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.followsRow}>
              {eng.follows.filter(hasTeam).map((id) => {
                const t = getTeam(id);
                const next = board.find((r) => r.game.awayId === id || r.game.homeId === id);
                return (
                  <TouchableOpacity key={id} style={styles.followCard} activeOpacity={0.85}
                    onPress={() => (next ? onOpenGame(id, next.gameId) : onOpenTeam(id))}>
                    <TeamMark team={t} size={30} />
                    <Text style={styles.followAbbr}>{t.abbr}</Text>
                    <Text style={styles.followMeta} numberOfLines={1}>
                      {next
                        ? `${next.game.homeId === id ? 'vs' : '@'} ${(hasTeam(next.game.homeId === id ? next.game.awayId : next.game.homeId) ? getTeam(next.game.homeId === id ? next.game.awayId : next.game.homeId).abbr : '')}`
                        : t.record ?? '—'}
                    </Text>
                    {!!next && (
                      <Text style={[styles.followEdge, numeric, {
                        color: (next.spreadSide === 'home' ? next.game.homeId : next.game.awayId) === id ? colors.green : colors.inkFaint,
                      }]}>
                        {(next.spreadSide === 'home' ? next.game.homeId : next.game.awayId) === id ? `+${next.spreadEdge.toFixed(1)}` : 'fade'}
                      </Text>
                    )}
                  </TouchableOpacity>
                );
              })}
            </ScrollView>
          </View>
        )}

        {/* ---- Edge board ---- */}
        <View style={styles.sectionHead}>
          <View style={styles.sectionTitleWrap}>
            <Text style={styles.sectionTitle}>Edge Board</Text>
            <Text style={styles.sectionSub}>Model against the market, ranked by conviction</Text>
          </View>
          <MeterPill left={ent.simsLeft} onPress={onUpgrade} />
        </View>

        {visible.map((r, i) => (
          <EdgeRowCard
            key={r.gameId}
            row={r}
            index={i + 1}
            away={hasTeam(r.game.awayId) ? getTeam(r.game.awayId) : null}
            home={hasTeam(r.game.homeId) ? getTeam(r.game.homeId) : null}
            onOpen={() => onOpenGame(r.game.homeId, r.gameId)}
            onRun={() => onRun({ awayId: r.game.awayId, homeId: r.game.homeId, ctx: { ...DEFAULT_CTX, neutralSite: r.game.neutralSite, primetime: r.game.primetime } })}
          />
        ))}

        {hidden > 0 && (
          <Locked
            title={`${hidden} more edges on the board`}
            blurb="Free shows the top three. Starter opens the whole board, every game, every week — plus the Lock of the Day and the full track record."
            cta="See the whole board"
            onPress={onUpgrade}
            preview={<View>{board.slice(visible.length, visible.length + 3).map((r, i) => (
              <EdgeRowCard key={r.gameId} row={r} index={visible.length + i + 1} away={null} home={null} onOpen={() => {}} onRun={() => {}} />
            ))}</View>}
            style={{ height: 220, marginBottom: spacing.lg }}
          />
        )}

        {!board.length && (
          <View style={styles.empty}>
            <Ionicons name="moon-outline" size={22} color={colors.inkGhost} />
            <Text style={styles.emptyText}>No open games on the board. The tape comes back the moment the next slate posts.</Text>
          </View>
        )}

        {/* ---- Parlay lab entry ---- */}
        <TouchableOpacity style={styles.lab} activeOpacity={0.88} onPress={onOpenParlay}>
          <LinearGradient colors={grad.tier} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.labBg}>
            <View style={styles.labIcon}><Ionicons name="git-merge" size={17} color={colors.gold} /></View>
            <View style={{ flex: 1 }}>
              <Text style={styles.labTitle}>Parlay Lab</Text>
              <Text style={styles.labBlurb}>Stack legs, see the correlated price, compare it to the book.</Text>
            </View>
            <Ionicons name="chevron-forward" size={16} color={colors.inkFaint} />
          </LinearGradient>
        </TouchableOpacity>

        <Text style={styles.legal}>
          Projections, not predictions. Every number here is the same model that is graded in the open on the Record tab.
          21+. If betting stops being fun, stop — 1-800-GAMBLER.
        </Text>
      </ScrollView>
    </SafeAreaView>
  );
}

/* ---------- Lock of the Day ---------- */

function LockCard({ row, onOpen, onRun }: { row: EdgeRow; onOpen: (teamId: string, gameId: string) => void; onRun: (r: RunRequest) => void }) {
  const { getTeam, hasTeam } = useTeams();
  const eng = useEngagement();
  const ent = useEntitlements();
  const sideId = row.spreadSide === 'home' ? row.game.homeId : row.game.awayId;
  const side = hasTeam(sideId) ? getTeam(sideId) : null;
  const num = row.game.homeSpread == null ? null : row.spreadSide === 'home' ? row.game.homeSpread : -row.game.homeSpread;
  const saved = eng.hasPick(row.gameId, 'spread', row.spreadSide);

  return (
    <View style={styles.lockCard}>
      <LinearGradient colors={grad.edge} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={StyleSheet.absoluteFill as never} />
      <View style={styles.lockTop}>
        <View style={styles.lockTag}><Ionicons name="flash" size={10} color={colors.bg} /><Text style={styles.lockTagText}>LOCK OF THE DAY</Text></View>
        <Text style={styles.lockConv}>{row.conviction}<Text style={styles.lockConvSmall}> conviction</Text></Text>
      </View>

      <TouchableOpacity style={styles.lockMain} activeOpacity={0.85} onPress={() => onOpen(row.game.homeId, row.gameId)}>
        {side && <TeamMark team={side} size={46} />}
        <View style={{ flex: 1 }}>
          <Text style={styles.lockPick}>
            {side ? side.abbr : sideId.toUpperCase()} {num == null ? 'ML' : num > 0 ? `+${num}` : num}
          </Text>
          <Text style={styles.lockReason} numberOfLines={2}>{row.reason}</Text>
        </View>
      </TouchableOpacity>

      <View style={styles.lockStats}>
        <Stat label="EDGE" value={`+${row.spreadEdge.toFixed(1)}`} tone={colors.green} />
        <Stat label="WIN" value={`${row.sidePct.toFixed(0)}%`} />
        <Stat label="EV" value={row.ev == null ? '—' : `${(row.ev * 100).toFixed(1)}%`} tone={(row.ev ?? 0) > 0 ? colors.green : colors.inkDim} />
        <Stat label="FAIR" value={row.ev == null ? '—' : fmtOdds(row.rec.homeWinPct >= 50 ? -110 : 110)} hide />
      </View>

      <View style={styles.lockActions}>
        <TouchableOpacity
          style={[styles.lockBtn, saved && styles.lockBtnDone]}
          activeOpacity={0.85}
          onPress={() => eng.savePick({
            gameId: row.gameId, awayId: row.game.awayId, homeId: row.game.homeId,
            market: 'spread', side: row.spreadSide, number: row.game.homeSpread,
            modelPct: row.sidePct, edge: row.spreadEdge,
            label: `${side?.abbr ?? sideId} ${num == null ? 'ML' : num > 0 ? `+${num}` : num}`,
          })}
        >
          <Ionicons name={saved ? 'checkmark' : 'bookmark-outline'} size={14} color={saved ? colors.bg : colors.ink} />
          <Text style={[styles.lockBtnText, saved && { color: colors.bg }]}>{saved ? 'On your card' : 'Save to card'}</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.lockBtn, styles.lockBtnGo]}
          activeOpacity={0.85}
          onPress={() => onRun({ awayId: row.game.awayId, homeId: row.game.homeId, ctx: { ...DEFAULT_CTX, neutralSite: row.game.neutralSite, primetime: row.game.primetime } })}
        >
          <Ionicons name="analytics" size={14} color={colors.bg} />
          <Text style={[styles.lockBtnText, { color: colors.bg }]}>Run {ent.ent.simDepth.toLocaleString()}</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

function Stat({ label, value, tone, hide }: { label: string; value: string; tone?: string; hide?: boolean }) {
  if (hide) return null;
  return (
    <View style={styles.stat}>
      <Text style={styles.statLabel}>{label}</Text>
      <Text style={[styles.statValue, numeric, tone ? { color: tone } : null]}>{value}</Text>
    </View>
  );
}

/* ---------- one row of the board ---------- */

export function EdgeRowCard({ row, index, away, home, onOpen, onRun }: {
  row: EdgeRow; index: number;
  away: { abbr: string; colors: { primary: string } } | null;
  home: { abbr: string; colors: { primary: string } } | null;
  onOpen: () => void; onRun: () => void;
}) {
  const sideAbbr = row.spreadSide === 'home' ? home?.abbr ?? 'HOME' : away?.abbr ?? 'AWAY';
  const num = row.game.homeSpread == null ? null : row.spreadSide === 'home' ? row.game.homeSpread : -row.game.homeSpread;
  const kick = new Date(row.game.kickoff);
  return (
    <TouchableOpacity style={styles.row} activeOpacity={0.85} onPress={onOpen}>
      <Text style={[styles.rank, numeric]}>{index}</Text>
      <View style={{ flex: 1, gap: 3 }}>
        <Text style={styles.rowTeams}>
          {away?.abbr ?? row.game.awayId.toUpperCase()} <Text style={{ color: colors.inkGhost }}>@</Text> {home?.abbr ?? row.game.homeId.toUpperCase()}
          {row.live && <Text style={{ color: colors.live }}>  ● LIVE</Text>}
        </Text>
        <Text style={styles.rowPick}>
          <Text style={{ color: colors.green }}>{sideAbbr} {num == null ? 'ML' : num > 0 ? `+${num}` : num}</Text>
          <Text style={{ color: colors.inkFaint }}>  ·  {kick.toLocaleDateString(undefined, { weekday: 'short' })} {kick.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })}</Text>
        </Text>
        <ConvictionBar value={row.conviction} width={96} />
      </View>
      <View style={styles.rowRight}>
        <Text style={[styles.rowEdge, numeric]}>+{row.spreadEdge.toFixed(1)}</Text>
        <Text style={styles.rowEdgeLabel}>pts edge</Text>
        <TouchableOpacity style={styles.rowRun} onPress={onRun} activeOpacity={0.8}>
          <Ionicons name="play" size={11} color={colors.bg} />
        </TouchableOpacity>
      </View>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  head: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: spacing.lg, paddingBottom: spacing.sm, gap: spacing.sm },
  wordmark: { ...T.title, color: colors.ink, fontSize: 22, letterSpacing: -0.4 },
  date: { color: colors.inkFaint, fontSize: 11, fontWeight: '700', marginTop: 1 },
  gear: { width: 30, height: 30, borderRadius: 15, backgroundColor: colors.cardAlt, borderWidth: 1, borderColor: colors.border, alignItems: 'center', justifyContent: 'center' },
  headRight: { flexDirection: 'row', alignItems: 'center', gap: 6 },

  body: { padding: spacing.lg, paddingBottom: 40 },

  lockCard: { backgroundColor: colors.card, borderRadius: radius.xl, borderWidth: 1, borderColor: colors.greenGlow, padding: spacing.lg, marginBottom: spacing.lg, overflow: 'hidden', ...shadow.money },
  lockTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  lockTag: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: colors.green, paddingHorizontal: 8, paddingVertical: 3, borderRadius: radius.sm },
  lockTagText: { color: colors.bg, fontSize: 9, fontWeight: '900', letterSpacing: 1 },
  lockConv: { color: colors.green, fontSize: 18, fontWeight: '900' },
  lockConvSmall: { color: colors.inkFaint, fontSize: 10, fontWeight: '800' },
  lockMain: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, marginTop: spacing.md },
  lockPick: { ...T.title, color: colors.ink, fontSize: 24 },
  lockReason: { color: colors.inkDim, fontSize: 12, lineHeight: 16, marginTop: 2 },
  lockStats: { flexDirection: 'row', gap: spacing.xl, marginTop: spacing.md, paddingTop: spacing.md, borderTopWidth: 1, borderTopColor: colors.divider },
  stat: {},
  statLabel: { color: colors.inkFaint, fontSize: 9, fontWeight: '900', letterSpacing: 1 },
  statValue: { color: colors.ink, fontSize: 16, fontWeight: '900', marginTop: 2 },
  lockActions: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.md },
  lockBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 10, borderRadius: radius.pill, backgroundColor: colors.cardAlt, borderWidth: 1, borderColor: colors.border },
  lockBtnDone: { backgroundColor: colors.green, borderColor: colors.green },
  lockBtnGo: { backgroundColor: colors.green, borderColor: colors.green },
  lockBtnText: { color: colors.ink, fontSize: 12, fontWeight: '800' },

  pnl: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, backgroundColor: colors.card, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border, padding: spacing.md, marginBottom: spacing.lg },
  pnlCell: { flex: 1 },
  pnlDivider: { width: 1, height: 26, backgroundColor: colors.divider },
  pnlLabel: { color: colors.inkFaint, fontSize: 9, fontWeight: '900', letterSpacing: 1 },
  pnlBig: { color: colors.ink, fontSize: 18, fontWeight: '900', marginTop: 2 },

  follows: { marginBottom: spacing.lg },
  followsLabel: { color: colors.inkFaint, fontSize: 9, fontWeight: '900', letterSpacing: 1.6, marginBottom: spacing.sm },
  followsRow: { gap: spacing.sm, paddingRight: spacing.lg },
  followCard: { alignItems: 'center', gap: 3, paddingHorizontal: 12, paddingVertical: 10, backgroundColor: colors.card, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, minWidth: 76 },
  followAbbr: { color: colors.ink, fontSize: 12, fontWeight: '900' },
  followMeta: { color: colors.inkFaint, fontSize: 10, fontWeight: '700' },
  followEdge: { fontSize: 12, fontWeight: '900' },
  sectionHead: { flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between', marginBottom: spacing.md, gap: spacing.sm },
  sectionTitleWrap: { flexShrink: 1 },
  sectionTitle: { ...T.section, color: colors.ink, fontSize: 18 },
  sectionSub: { color: colors.inkFaint, fontSize: 11, marginTop: 1 },

  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, backgroundColor: colors.card, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border, padding: spacing.md, marginBottom: spacing.sm },
  rank: { color: colors.inkGhost, fontSize: 15, fontWeight: '900', width: 18, textAlign: 'center' },
  rowTeams: { color: colors.ink, fontSize: 14, fontWeight: '900', letterSpacing: 0.2 },
  rowPick: { fontSize: 11, fontWeight: '800' },
  rowRight: { alignItems: 'flex-end', gap: 2 },
  rowEdge: { color: colors.green, fontSize: 17, fontWeight: '900' },
  rowEdgeLabel: { color: colors.inkFaint, fontSize: 9, fontWeight: '800', letterSpacing: 0.4 },
  rowRun: { marginTop: 4, width: 26, height: 26, borderRadius: 13, backgroundColor: colors.green, alignItems: 'center', justifyContent: 'center' },

  empty: { alignItems: 'center', gap: 8, padding: spacing.xl, backgroundColor: colors.card, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border, marginBottom: spacing.lg },
  emptyText: { color: colors.inkFaint, fontSize: 12, textAlign: 'center', lineHeight: 17, maxWidth: 280 },

  lab: { borderRadius: radius.lg, overflow: 'hidden', marginTop: spacing.sm, marginBottom: spacing.lg, borderWidth: 1, borderColor: colors.border },
  labBg: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, padding: spacing.md },
  labIcon: { width: 34, height: 34, borderRadius: 12, backgroundColor: colors.goldSoft, alignItems: 'center', justifyContent: 'center' },
  labTitle: { color: colors.ink, fontSize: 14, fontWeight: '900' },
  labBlurb: { color: colors.inkFaint, fontSize: 11, marginTop: 1 },

  legal: { color: colors.inkGhost, fontSize: 10, lineHeight: 15, textAlign: 'center', marginTop: spacing.sm },
});
