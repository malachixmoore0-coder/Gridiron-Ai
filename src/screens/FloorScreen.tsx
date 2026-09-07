/**
 * The Floor — one layout, every league.
 *
 * The college side used to have its own home screen built around kickoff
 * windows, which read as a second slate rather than a home. Now all nine
 * leagues open on the same spine, in the same order, answering the same
 * questions:
 *
 *   the tape        → is anything happening right now?
 *   Lock of the Day → is there one play worth taking?
 *   your card       → how am I doing?
 *   the Edge Board  → where is the model furthest from the number?
 *
 * College keeps what only college needs — the poll and the Upset Radar — but
 * below that spine rather than instead of it. Nobody should have to relearn the
 * app when they tap NCAA.
 */
import React, { useEffect, useMemo, useState } from 'react';
import { View, Text, ScrollView, TouchableOpacity, StyleSheet, RefreshControl, Modal } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { colors, grad, numeric, radius, shadow, spacing, type as T } from '@/theme';
import { useActiveLeague } from '@/league/LeagueContext';
import { useEntitlements } from '@/context/EntitlementsContext';
import { useEngagement } from '@/context/EngagementContext';
import { useLiveGames } from '@/live/LiveContext';
import { buildEdges, lockOfDay, upsets, type EdgeRow } from '@/utils/edge';
import { RefMark } from '@/components/RefMark';
import { Ticker, type TickerItem } from '@/components/Ticker';
import { TabHeader } from '@/components/TabHeader';
import { AddToCard } from '@/components/AddToCard';
import { ConvictionBar, Locked, MeterPill } from '@/components/Pro';
import type { LeagueGame } from '@/league/types';

interface Props {
  onRun: (r: { awayId: string; homeId: string; ctx: { neutralSite: boolean; primetime: boolean; weather: 'auto' } }) => void;
  onOpenGame: (teamId: string, gameId: string) => void;
  onOpenTeam: (teamId: string) => void;
  onUpgrade: () => void;
  onOpenCard: () => void;
  onOpenParlay: () => void;
  onOpenModel: () => void;
}

const clock = () => new Date().toLocaleDateString(undefined, { weekday: 'long', month: 'short', day: 'numeric' });

export function FloorScreen({ onRun, onOpenGame, onOpenTeam, onUpgrade, onOpenCard, onOpenParlay, onOpenModel }: Props) {
  const view = useActiveLeague();
  const ent = useEntitlements();
  const eng = useEngagement();
  const [now, setNow] = useState(Date.now());
  const [adding, setAdding] = useState<EdgeRow | null>(null);

  useEffect(() => { const t = setInterval(() => setNow(Date.now()), 60_000); return () => clearInterval(t); }, []);

  const games = useLiveGames(view.weekGames as LeagueGame[]);

  // Grade any saved pick whose game has a final on the published slate.
  useEffect(() => {
    const finals = new Map(
      games.filter((g) => g.status === 'final' && g.awayScore != null && g.homeScore != null)
        .map((g) => [g.id, { awayScore: g.awayScore as number, homeScore: g.homeScore as number }]),
    );
    if (finals.size) eng.settle(finals);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [games.length, eng.loaded]);

  const rows = useMemo(
    () => buildEdges(games as never, view.records, view.abbrOf),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [games, view.records],
  );
  const board = useMemo(() => rows.filter((r) => !r.played), [rows]);
  const lock = useMemo(() => lockOfDay(board), [board]);
  // Upsets and a poll rail are not a college-football thing, they are a
  // "this sport has an underdog / this league has a poll" thing. Both surfaces
  // now appear wherever the data supports them and stay hidden where it does not.
  const radar = useMemo(() => upsets(board).slice(0, 5), [board]);
  const ranked = useMemo(
    () => view.teams.filter((t) => t.rank && t.rank <= 25).sort((a, b) => (a.rank ?? 99) - (b.rank ?? 99)),
    [view.teams],
  );

  const depth = ent.ent.edgeBoardDepth;
  const visible = depth === Infinity ? board : board.slice(0, depth);
  const hidden = board.length - visible.length;

  const tick: TickerItem[] = useMemo(() => {
    const live = games.filter((g) => g.status === 'in_progress').map((g) => ({
      key: `l-${g.id}`,
      left: `${view.abbrOf(g.awayId)} ${g.awayScore ?? 0}–${g.homeScore ?? 0} ${view.abbrOf(g.homeId)}`,
      right: g.statusDetail ?? 'LIVE',
      tone: 'live' as const,
      onPress: () => onOpenGame(g.homeId, g.id),
    }));
    const edges = board.slice(0, 12).map((r) => ({
      key: `e-${r.gameId}`,
      left: `${view.abbrOf(r.game.awayId)}@${view.abbrOf(r.game.homeId)}`,
      right: `${view.abbrOf(r.spreadSide === 'home' ? r.game.homeId : r.game.awayId)} +${r.spreadEdge.toFixed(1)}`,
      tone: 'money' as const,
      onPress: () => onOpenGame(r.game.homeId, r.gameId),
    }));
    return [...live, ...edges];
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [games, board, now]);

  // Football is followed a week at a time; every other sport is followed a day
  // at a time, so "Week 14" is the wrong word for an MLB Tuesday.
  const period = view.phase === 'postseason'
    ? 'Postseason'
    : view.phase === 'offseason'
      ? 'Offseason'
      : view.sport === 'football'
        ? `Week ${view.week}`
        : view.weeks.find((w) => w.week === view.week)?.label ?? 'Today';

  const s = eng.summary;
  const ctxFor = (g: LeagueGame) => ({ neutralSite: g.neutralSite, primetime: !!g.primetime, weather: 'auto' as const });

  return (
    <SafeAreaView edges={['top']} style={styles.safe}>
      <TabHeader
        title={view.id === 'cfb' ? 'Saturday' : 'The Floor'}
        subtitle={`${clock()} · ${period} · ${board.length} on the board`}
        streak
        onUpgrade={onUpgrade}
        onSettings={onOpenModel}
      />

      <Ticker items={tick} />

      <ScrollView
        contentContainerStyle={styles.body}
        refreshControl={<RefreshControl refreshing={view.refreshing} onRefresh={view.refresh} tintColor={colors.green} />}
      >
        {/* ---- the poll, college only ---- */}
        {ranked.length > 0 && (
          <View style={styles.rail}>
            <Text style={styles.railLabel}>THE POLL</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.railRow}>
              {ranked.map((t) => (
                <TouchableOpacity key={t.id} style={styles.pollChip} activeOpacity={0.8} onPress={() => onOpenTeam(t.id)}>
                  <Text style={[styles.pollRank, numeric]}>{t.rank}</Text>
                  <RefMark team={t} size={26} disc />
                  <Text style={styles.pollAbbr}>{t.abbr}</Text>
                  {!!t.record && <Text style={styles.pollRec}>{t.record}</Text>}
                </TouchableOpacity>
              ))}
            </ScrollView>
          </View>
        )}

        {/* ---- lock of the day ---- */}
        {lock && (ent.ent.lockOfDay ? (
          <LockCard row={lock} onOpen={onOpenGame} onRun={onRun} onAdd={() => setAdding(lock)} />
        ) : (
          <Locked
            title="Lock of the Day"
            blurb="The single highest-conviction play on the board, with the reasoning behind it. Free accounts see the board; Starter sees the pick."
            cta="Unlock the Lock"
            onPress={onUpgrade}
            preview={<LockCard row={lock} onOpen={() => {}} onRun={() => {}} onAdd={() => {}} />}
            style={{ height: 218, marginBottom: spacing.lg }}
          />
        ))}

        {/* ---- your card ---- */}
        <TouchableOpacity style={styles.pnl} activeOpacity={0.85} onPress={onOpenCard} accessibilityRole="button" accessibilityLabel="Open your card">
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
          <View style={styles.pnlDivider} />
          {/* Open picks, so saving one gives you something that visibly moved. */}
          <View style={styles.pnlCell}>
            <Text style={styles.pnlLabel}>OPEN</Text>
            <Text style={[styles.pnlBig, numeric, { color: s.open ? colors.gold : colors.ink }]}>{s.open}</Text>
          </View>
          <Ionicons name="chevron-forward" size={16} color={colors.inkGhost} />
        </TouchableOpacity>

        {/* ---- your teams ---- */}
        {eng.follows.filter(view.hasTeam).length > 0 && (
          <View style={styles.rail}>
            <Text style={styles.railLabel}>YOUR TEAMS</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.railRow}>
              {eng.follows.filter(view.hasTeam).map((id) => {
                const t = view.teamRef(id);
                const next = board.find((r) => r.game.awayId === id || r.game.homeId === id);
                const oppId = next ? (next.game.homeId === id ? next.game.awayId : next.game.homeId) : null;
                return (
                  <TouchableOpacity key={id} style={styles.followCard} activeOpacity={0.85}
                    onPress={() => (next ? onOpenGame(id, next.gameId) : onOpenTeam(id))}>
                    <RefMark team={t} size={28} disc={view.id !== 'nfl'} />
                    <Text style={styles.followAbbr}>{t?.abbr ?? id.toUpperCase()}</Text>
                    <Text style={styles.followMeta} numberOfLines={1}>
                      {next && oppId ? `${next.game.homeId === id ? 'vs' : '@'} ${view.abbrOf(oppId)}` : t?.record ?? '—'}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </ScrollView>
          </View>
        )}

        {/* ---- edge board ---- */}
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
            awayAbbr={view.abbrOf(r.game.awayId)}
            homeAbbr={view.abbrOf(r.game.homeId)}
            onOpen={() => onOpenGame(r.game.homeId, r.gameId)}
            onRun={() => onRun({ awayId: r.game.awayId, homeId: r.game.homeId, ctx: ctxFor(r.game) })}
            onAdd={() => setAdding(r)}
          />
        ))}

        {hidden > 0 && (
          <Locked
            title={`${hidden} more edges on the board`}
            blurb="Free shows the top three. Starter opens the whole board, every league, every day — plus the Lock of the Day and the full track record."
            cta="See the whole board"
            onPress={onUpgrade}
            preview={<View>{board.slice(visible.length, visible.length + 3).map((r, i) => (
              <EdgeRowCard key={r.gameId} row={r} index={visible.length + i + 1} awayAbbr="—" homeAbbr="—" onOpen={() => {}} onRun={() => {}} onAdd={() => {}} />
            ))}</View>}
            style={{ height: 230, marginBottom: spacing.lg }}
          />
        )}

        {!board.length && (
          <View style={styles.empty}>
            <Ionicons name="moon-outline" size={22} color={colors.inkGhost} />
            <Text style={styles.emptyText}>No open games on the board. The tape comes back the moment the next slate posts.</Text>
          </View>
        )}

        {/* ---- upset radar, wherever there are dogs the model likes ---- */}
        {radar.length > 0 && (
          <>
            <View style={[styles.sectionHead, { marginTop: spacing.md }]}>
              <View style={styles.sectionTitleWrap}>
                <Text style={styles.sectionTitle}>Upset Radar</Text>
                <Text style={styles.sectionSub}>Underdogs the model has winning outright</Text>
              </View>
            </View>
            {ent.atLeast('allpro') ? (
              radar.length ? radar.map((r) => (
                <EdgeRowCard
                  key={`u-${r.gameId}`}
                  row={r}
                  dog
                  awayAbbr={view.abbrOf(r.game.awayId)}
                  homeAbbr={view.abbrOf(r.game.homeId)}
                  onOpen={() => onOpenGame(r.game.homeId, r.gameId)}
                  onRun={() => onRun({ awayId: r.game.awayId, homeId: r.game.homeId, ctx: ctxFor(r.game) })}
                  onAdd={() => setAdding(r)}
                />
              )) : <Text style={styles.emptyText}>No live dogs on this board — the market and the model agree this week.</Text>
            ) : (
              <Locked
                title="Upset Radar"
                blurb="Every underdog the model has winning outright, ranked by confidence. The module that pays for itself on one Saturday in October."
                cta="Unlock Upset Radar"
                onPress={onUpgrade}
                preview={<View>{radar.slice(0, 2).map((r) => (
                  <EdgeRowCard key={`p-${r.gameId}`} row={r} dog awayAbbr="—" homeAbbr="—" onOpen={() => {}} onRun={() => {}} onAdd={() => {}} />
                ))}</View>}
                style={{ height: 176, marginBottom: spacing.lg }}
              />
            )}
          </>
        )}

        <TouchableOpacity style={styles.lab} activeOpacity={0.88} onPress={onOpenParlay}>
          <LinearGradient colors={grad.tier} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.labBg}>
            <View style={styles.labIcon}><Ionicons name="git-merge" size={17} color={colors.gold} /></View>
            <View style={{ flex: 1 }}>
              <Text style={styles.labTitle}>Parlay Lab</Text>
              <Text style={styles.labBlurb}>Stack legs, price them at your book, compare it to the ticket.</Text>
            </View>
            <Ionicons name="chevron-forward" size={16} color={colors.inkFaint} />
          </LinearGradient>
        </TouchableOpacity>

        <Text style={styles.legal}>
          Projections, not predictions. Every number here is the same model that is graded in the open on the Record tab.
          21+. If betting stops being fun, stop — 1-800-GAMBLER.
        </Text>
      </ScrollView>

      <Modal visible={!!adding} transparent animationType="fade" onRequestClose={() => setAdding(null)}>
        <TouchableOpacity style={styles.backdrop} activeOpacity={1} onPress={() => setAdding(null)}>
          <TouchableOpacity activeOpacity={1} style={styles.sheetWrap}>
            {!!adding && (
              <AddToCard
                league={view.id}
                game={adding.game as LeagueGame}
                rec={adding.rec}
                awayAbbr={view.abbrOf(adding.game.awayId)}
                homeAbbr={view.abbrOf(adding.game.homeId)}
                onClose={() => setAdding(null)}
              />
            )}
          </TouchableOpacity>
        </TouchableOpacity>
      </Modal>
    </SafeAreaView>
  );
}

/* ---------- Lock of the Day ---------- */

function LockCard({ row, onOpen, onRun, onAdd }: {
  row: EdgeRow;
  onOpen: (teamId: string, gameId: string) => void;
  onRun: (r: { awayId: string; homeId: string; ctx: { neutralSite: boolean; primetime: boolean; weather: 'auto' } }) => void;
  onAdd: () => void;
}) {
  const view = useActiveLeague();
  const eng = useEngagement();
  const ent = useEntitlements();
  const sideId = row.spreadSide === 'home' ? row.game.homeId : row.game.awayId;
  const side = view.teamRef(sideId);
  const num = row.game.homeSpread == null ? null : row.spreadSide === 'home' ? row.game.homeSpread : -row.game.homeSpread;
  const saved = eng.hasPick(row.gameId, 'spread', row.spreadSide);
  const label = `${side?.abbr ?? sideId.toUpperCase()} ${num == null ? 'ML' : num > 0 ? `+${num}` : num}`;

  return (
    <View style={styles.lockCard}>
      <LinearGradient colors={grad.edge} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={StyleSheet.absoluteFill as never} />
      <View style={styles.lockTop}>
        <View style={styles.lockTag}><Ionicons name="flash" size={10} color={colors.bg} /><Text style={styles.lockTagText}>LOCK OF THE DAY</Text></View>
        <Text style={styles.lockConv}>{row.conviction}<Text style={styles.lockConvSmall}> conviction</Text></Text>
      </View>

      <TouchableOpacity style={styles.lockMain} activeOpacity={0.85} onPress={() => onOpen(row.game.homeId, row.gameId)}>
        <RefMark team={side} size={46} disc={view.id !== 'nfl'} />
        <View style={{ flex: 1 }}>
          <Text style={styles.lockPick}>{label}</Text>
          <Text style={styles.lockReason} numberOfLines={2}>{row.reason}</Text>
        </View>
      </TouchableOpacity>

      <View style={styles.lockStats}>
        <Stat label="EDGE" value={`+${row.spreadEdge.toFixed(1)}`} tone={colors.green} />
        <Stat label="WIN" value={`${row.sidePct.toFixed(0)}%`} />
        <Stat label="EV" value={row.ev == null ? '—' : `${(row.ev * 100).toFixed(1)}%`} tone={(row.ev ?? 0) > 0 ? colors.green : colors.inkDim} />
      </View>

      <View style={styles.lockActions}>
        <TouchableOpacity
          style={[styles.lockBtn, saved && styles.lockBtnDone]}
          activeOpacity={0.85}
          onPress={onAdd}
          accessibilityRole="button"
          accessibilityLabel="Add to your card"
        >
          <Ionicons name={saved ? 'checkmark' : 'bookmark-outline'} size={14} color={saved ? colors.bg : colors.ink} />
          <Text style={[styles.lockBtnText, saved && { color: colors.bg }]}>{saved ? 'On your card' : 'Add to card'}</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.lockBtn, styles.lockBtnGo]}
          activeOpacity={0.85}
          onPress={() => onRun({ awayId: row.game.awayId, homeId: row.game.homeId, ctx: { neutralSite: row.game.neutralSite, primetime: !!row.game.primetime, weather: 'auto' } })}
        >
          <Ionicons name="analytics" size={14} color={colors.bg} />
          <Text style={[styles.lockBtnText, { color: colors.bg }]}>Run {ent.ent.simDepth.toLocaleString()}</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

function Stat({ label, value, tone }: { label: string; value: string; tone?: string }) {
  return (
    <View>
      <Text style={styles.statLabel}>{label}</Text>
      <Text style={[styles.statValue, numeric, tone ? { color: tone } : null]}>{value}</Text>
    </View>
  );
}

/* ---------- one row of the board ---------- */

function EdgeRowCard({ row, index, awayAbbr, homeAbbr, onOpen, onRun, onAdd, dog }: {
  row: EdgeRow; index?: number; awayAbbr: string; homeAbbr: string;
  onOpen: () => void; onRun: () => void; onAdd: () => void; dog?: boolean;
}) {
  const eng = useEngagement();
  const saved = eng.hasPick(row.gameId, 'spread', row.spreadSide);
  const sideAbbr = row.spreadSide === 'home' ? homeAbbr : awayAbbr;
  const num = row.game.homeSpread == null ? null : row.spreadSide === 'home' ? row.game.homeSpread : -row.game.homeSpread;
  const kick = new Date(row.game.kickoff);
  return (
    <TouchableOpacity style={styles.row} activeOpacity={0.85} onPress={onOpen}>
      {index != null && <Text style={[styles.rank, numeric]}>{index}</Text>}
      <View style={{ flex: 1, gap: 3 }}>
        <Text style={styles.rowTeams}>
          {awayAbbr} <Text style={{ color: colors.inkGhost }}>@</Text> {homeAbbr}
          {row.live && <Text style={{ color: colors.live }}>  ● LIVE</Text>}
        </Text>
        <Text style={styles.rowPick}>
          <Text style={{ color: dog ? colors.gold : colors.green }}>{sideAbbr} {num == null ? 'ML' : num > 0 ? `+${num}` : num}</Text>
          <Text style={{ color: colors.inkFaint }}>
            {'  ·  '}{kick.toLocaleDateString(undefined, { weekday: 'short' })} {kick.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })}
            {dog ? `  ·  ${Math.max(row.rec.homeWinPct, row.rec.awayWinPct).toFixed(0)}% ML` : ''}
          </Text>
        </Text>
        <ConvictionBar value={row.conviction} width={96} />
      </View>
      <View style={styles.rowRight}>
        <Text style={[styles.rowEdge, numeric, dog && { color: colors.gold }]}>+{row.spreadEdge.toFixed(1)}</Text>
        <Text style={styles.rowEdgeLabel}>pts edge</Text>
        <View style={styles.rowBtns}>
          <TouchableOpacity
            style={[styles.rowAdd, saved && styles.rowAddOn]}
            onPress={onAdd}
            activeOpacity={0.8}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            accessibilityRole="button"
            accessibilityLabel="Add to your card"
          >
            <Ionicons name={saved ? 'bookmark' : 'bookmark-outline'} size={13} color={saved ? colors.bg : colors.green} />
          </TouchableOpacity>
          <TouchableOpacity style={styles.rowRun} onPress={onRun} activeOpacity={0.8} accessibilityRole="button" accessibilityLabel="Simulate this game">
            <Ionicons name="play" size={11} color={colors.bg} />
          </TouchableOpacity>
        </View>
      </View>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  body: { padding: spacing.lg, paddingBottom: 40 },

  rail: { marginBottom: spacing.lg },
  railLabel: { color: colors.inkFaint, fontSize: 9, fontWeight: '900', letterSpacing: 1.6, marginBottom: spacing.sm },
  railRow: { gap: spacing.sm, paddingRight: spacing.lg },
  pollChip: { alignItems: 'center', gap: 3, paddingHorizontal: 10, paddingVertical: 8, backgroundColor: colors.card, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, minWidth: 62 },
  pollRank: { color: colors.gold, fontSize: 11, fontWeight: '900' },
  pollAbbr: { color: colors.ink, fontSize: 11, fontWeight: '800' },
  pollRec: { color: colors.inkFaint, fontSize: 9, fontWeight: '700' },
  followCard: { alignItems: 'center', gap: 3, paddingHorizontal: 12, paddingVertical: 10, backgroundColor: colors.card, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, minWidth: 76 },
  followAbbr: { color: colors.ink, fontSize: 12, fontWeight: '900' },
  followMeta: { color: colors.inkFaint, fontSize: 10, fontWeight: '700' },

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
  statLabel: { color: colors.inkFaint, fontSize: 9, fontWeight: '900', letterSpacing: 1 },
  statValue: { color: colors.ink, fontSize: 16, fontWeight: '900', marginTop: 2 },
  lockActions: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.md },
  lockBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 11, borderRadius: radius.pill, backgroundColor: colors.cardAlt, borderWidth: 1, borderColor: colors.border },
  lockBtnDone: { backgroundColor: colors.green, borderColor: colors.green },
  lockBtnGo: { backgroundColor: colors.green, borderColor: colors.green },
  lockBtnText: { color: colors.ink, fontSize: 12, fontWeight: '800' },

  pnl: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, backgroundColor: colors.card, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border, padding: spacing.md, marginBottom: spacing.lg },
  pnlCell: { flex: 1 },
  pnlDivider: { width: 1, height: 26, backgroundColor: colors.divider },
  pnlLabel: { color: colors.inkFaint, fontSize: 9, fontWeight: '900', letterSpacing: 1 },
  pnlBig: { color: colors.ink, fontSize: 18, fontWeight: '900', marginTop: 2 },

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
  rowBtns: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 5 },
  rowAdd: { width: 26, height: 26, borderRadius: 13, borderWidth: 1, borderColor: colors.green, alignItems: 'center', justifyContent: 'center' },
  rowAddOn: { backgroundColor: colors.green },
  rowRun: { width: 26, height: 26, borderRadius: 13, backgroundColor: colors.green, alignItems: 'center', justifyContent: 'center' },

  empty: { alignItems: 'center', gap: 8, padding: spacing.xl, backgroundColor: colors.card, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border, marginBottom: spacing.lg },
  emptyText: { color: colors.inkFaint, fontSize: 12, textAlign: 'center', lineHeight: 17, maxWidth: 300, marginBottom: spacing.lg },

  lab: { borderRadius: radius.lg, overflow: 'hidden', marginTop: spacing.sm, marginBottom: spacing.lg, borderWidth: 1, borderColor: colors.border },
  labBg: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, padding: spacing.md },
  labIcon: { width: 34, height: 34, borderRadius: 12, backgroundColor: colors.goldSoft, alignItems: 'center', justifyContent: 'center' },
  labTitle: { color: colors.ink, fontSize: 14, fontWeight: '900' },
  labBlurb: { color: colors.inkFaint, fontSize: 11, marginTop: 1 },

  legal: { color: colors.inkGhost, fontSize: 10, lineHeight: 15, textAlign: 'center', marginTop: spacing.sm },

  backdrop: { flex: 1, backgroundColor: colors.overlay, justifyContent: 'flex-end', padding: spacing.md },
  sheetWrap: { marginBottom: spacing.xl },
});
