/**
 * The slate, for any sport.
 *
 * Football is followed a week at a time; basketball, baseball and soccer are
 * followed a day at a time, so the tab strip is days for them and weeks for
 * football — the sport profile decides, not a special case per league.
 *
 * Everything else is the same shape the football slate already had: playing now,
 * upcoming, final, and a drawer on every game with each sportsbook's number and
 * its implied probability next to the model's.
 */
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { View, Text, ScrollView, TouchableOpacity, StyleSheet, RefreshControl, ActivityIndicator, Modal } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { colors, numeric, radius, spacing, clearance } from '@/theme';
import { TabHeader } from '@/components/TabHeader';
import { RefMark } from '@/components/RefMark';
import { BookOdds } from '@/components/BookOdds';
import { AddToCard } from '@/components/AddToCard';
import { ProbBar } from '@/components/ProbBar';
import { ConvictionCell } from '@/components/Pro';
import { useEntitlements } from '@/context/EntitlementsContext';
import { convictionOf, isPrice } from '@/utils/edge';
import { useActiveLeague } from '@/league/LeagueContext';
import { useEngagement } from '@/context/EngagementContext';
import { useLive } from '@/live/LiveContext';
import { SportGlyph } from '@/components/SportGlyph';
import { profileFor, LEAGUE_BY_KEY } from '@/sports/types';
import { haptic } from '@/utils/haptics';
import type { GameStatus } from '@/data/liveTypes';
import type { LeagueGame } from '@/league/types';

interface Props {
  onRun: (r: { awayId: string; homeId: string; ctx: { neutralSite: boolean; primetime: boolean; weather: 'auto' } }) => void;
  onOpenGame: (teamId: string, gameId: string) => void;
  onUpgrade: () => void;
}

/*
 * The day strip's geometry, in one place because the scroll arithmetic depends on
 * it exactly. A tab was 122 wide with an 8px gap -- a pitch of 130 -- while the
 * scroll assumed 132, and two pixels a tab across a hundred and seventy-five days
 * of hockey is three hundred and fifty pixels, so "scroll to today" landed two
 * days past it. Derived from the parts now, so the two cannot drift apart again.
 */
const TAB_WIDTH = 122;
const TAB_GAP = spacing.sm;
const TAB_PITCH = TAB_WIDTH + TAB_GAP;

/** Kickoff has passed and no final is on file: treat it as under way. */
function effectiveStatus(g: { status: GameStatus; kickoff: string }, now: number, hours: number): GameStatus {
  if (g.status === 'final' || g.status === 'in_progress') return g.status;
  const kick = Date.parse(g.kickoff);
  return Number.isFinite(kick) && kick <= now && now - kick < hours * 3_600_000 ? 'in_progress' : 'scheduled';
}

const SECTIONS = [
  { key: 'in_progress', title: 'Playing now', icon: 'radio', blurb: 'Live scores refresh every 20 seconds' },
  { key: 'scheduled', title: 'Upcoming', icon: 'time', blurb: 'Model vs the market before the first pitch' },
  { key: 'final', title: 'Final', icon: 'checkmark-done', blurb: 'How the model did' },
] as const;

export function SportSlateScreen({ onRun, onOpenGame, onUpgrade }: Props) {
  const ent = useEntitlements();
  const view = useActiveLeague();
  const eng = useEngagement();
  const live = useLive();
  const profile = profileFor(view.id);
  const meta = LEAGUE_BY_KEY[view.id];
  const [tab, setTab] = useState<number>(0);
  const [barWidth, setBarWidth] = useState(0);
  const [open, setOpen] = useState<string | null>(null);
  const [adding, setAdding] = useState<{ game: LeagueGame; abbrs: [string, string] } | null>(null);
  const [now, setNow] = useState(Date.now());
  const bar = useRef<ScrollView>(null);
  const followed = useRef<string | null>(null);

  useEffect(() => { const t = setInterval(() => setNow(Date.now()), 60_000); return () => clearInterval(t); }, []);

  const weeks = view.weeks;
  const currentIdx = Math.max(0, weeks.findIndex((w) => w.week === view.week));

  /*
   * Jump to today, once per league.
   *
   * This used to be a boolean, set the first time a slate loaded and never
   * cleared, which meant it only ever worked for whichever league happened to
   * open first. Switching league kept the old day index: leaving the WNBA on day
   * 116 of 116 and switching to baseball's 215 landed you in June, with today's
   * games seven months off to the right. Keyed by league, it re-syncs on every
   * switch and still will not fight a deliberate scroll within one.
   */
  useEffect(() => {
    if (!weeks.length || followed.current === view.id) return;
    setTab(currentIdx);
    followed.current = view.id;
  }, [view.id, currentIdx, weeks.length]);

  /**
   * A day index that is always inside the strip. Leagues have wildly different
   * numbers of days, so an index carried over from a longer season would
   * otherwise point past the end -- which read as a blank strip and a body
   * showing some other day's games.
   */
  const tabIdx = weeks.length ? Math.min(Math.max(0, tab), weeks.length - 1) : 0;

  // Centred, not flush left. A strip two hundred days long is only usable if the
  // day in question is somewhere near the middle of it when it arrives.
  useEffect(() => {
    if (!bar.current) return;
    const centred = barWidth > 0 ? tabIdx * TAB_PITCH + TAB_WIDTH / 2 - barWidth / 2 : (tabIdx - 1) * TAB_PITCH;
    bar.current.scrollTo({ x: Math.max(0, centred), animated: false });
  }, [tabIdx, barWidth, weeks.length]);

  const selected = weeks[tabIdx] ?? weeks[currentIdx];

  /**
   * The next day with a game still to play, today included. -1 means the league
   * has nothing scheduled at all -- the WNBA in late September, say, with the
   * season all but over and the next round not yet published. Worth telling
   * somebody, because an empty board otherwise reads as a broken app.
   */
  const upcomingIdx = useMemo(
    () => weeks.findIndex((w, i) => i >= currentIdx && w.games - w.final - w.live > 0),
    [weeks, currentIdx],
  );
  const liveHours = profile.sport === 'baseball' ? 5 : profile.sport === 'soccer' ? 3 : 4;

  const games = useMemo(() => {
    if (!selected) return [] as LeagueGame[];
    return view.gamesForWeek(selected.week, selected.gameType).map((g) => {
      const s = live.scores.get(g.id);
      return !s || g.status === 'final'
        ? g
        : { ...g, awayScore: s.awayScore ?? g.awayScore, homeScore: s.homeScore ?? g.homeScore, status: s.status, statusDetail: s.statusDetail ?? g.statusDetail };
    });
  }, [view, selected, live.scores]);

  const grouped = useMemo(() => {
    const out: Record<GameStatus, LeagueGame[]> = { in_progress: [], scheduled: [], final: [] };
    for (const g of games) out[effectiveStatus(g, now, liveHours)].push(g);
    out.scheduled.sort((a, b) => a.kickoff.localeCompare(b.kickoff));
    out.final.sort((a, b) => b.kickoff.localeCompare(a.kickoff));
    return out;
  }, [games, now, liveHours]);

  /**
   * Conviction per game, and how much of it this tier gets to read. Ranked over
   * the whole week so a filter cannot promote a game into the free set, and
   * capped by the same depth that limits the Edge Board — a rung buys more of
   * the board ranked, and it means the same thing on every screen.
   */
  const convictions = useMemo(() => {
    const m = new Map<string, number>();
    for (const g of games) {
      // Soccer's moneyline arrives in the spread field, and a price is not a
      // handicap: comparing a model margin against one is meaningless.
      if (g.status !== 'scheduled' || g.homeSpread == null || isPrice(g.homeSpread)) continue;
      const rec = view.findRecord(g.id);
      if (!rec) continue;
      const e = rec.spread - g.homeSpread;
      const side = e < 0 ? rec.homeWinPct : rec.awayWinPct;
      m.set(g.id, convictionOf(e, side, rec.updates ?? 0));
    }
    return m;
  }, [games, view]);

  const readable = useMemo(() => {
    const depth = ent.ent.edgeBoardDepth;
    if (depth === Infinity || depth >= convictions.size) return null;
    return new Set([...convictions.entries()].sort((a, b) => b[1] - a[1]).slice(0, depth).map(([id]) => id));
  }, [convictions, ent.ent.edgeBoardDepth]);

  if (view.loading && !games.length) {
    return (
      <SafeAreaView edges={['top']} style={styles.safe}>
        <TabHeader title="Slate" subtitle={`Loading ${meta.name}…`} />
        <ActivityIndicator color={colors.green} style={{ marginTop: 60 }} />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView edges={['top']} style={styles.safe}>
      <TabHeader
        title="Slate"
        subtitle={selected ? `${meta.name} · ${selected.label}` : meta.name}
      />

      {weeks.length > 1 && (
        <View style={styles.barRow}>
          {tabIdx !== currentIdx && (
            <TouchableOpacity
              style={styles.todayJump}
              activeOpacity={0.85}
              onPress={() => { haptic('select'); setTab(currentIdx); }}
              accessibilityRole="button"
              accessibilityLabel="Jump back to today"
            >
              <Ionicons name="today-outline" size={13} color={meta.accent} />
              <Text style={[styles.todayText, { color: meta.accent }]}>Today</Text>
            </TouchableOpacity>
          )}
        <ScrollView
          ref={bar}
          horizontal
          showsHorizontalScrollIndicator={false}
          style={styles.bar}
          contentContainerStyle={styles.barInner}
          onLayout={(e) => setBarWidth(e.nativeEvent.layout.width)}
        >
          {weeks.map((w, i) => {
            const on = i === tabIdx;
            return (
              <TouchableOpacity
                key={`${w.gameType}-${w.week}`}
                style={[styles.weekTab, on && { borderColor: meta.accent }]}
                activeOpacity={0.85}
                onPress={() => { haptic('select'); setTab(i); }}
                accessibilityRole="tab"
                accessibilityState={{ selected: on }}
                // React Native Web does not map accessibilityState.selected onto
                // a tab, so the strip shipped with no aria-selected anywhere and
                // a screen reader could not tell which day was chosen. Stated
                // outright; harmless on native, which ignores it.
                {...({ 'aria-selected': on } as object)}
              >
                <Text style={[styles.weekLabel, on && { color: meta.accent }]} numberOfLines={1}>
                  {i === currentIdx ? 'Today' : w.label}
                </Text>
                <Text style={styles.weekMeta}>
                  {w.live ? `${w.live} live` : w.final === w.games ? 'final' : `${w.games} game${w.games === 1 ? '' : 's'}`}
                </Text>
              </TouchableOpacity>
            );
          })}
        </ScrollView>
        </View>
      )}

      <ScrollView
        contentContainerStyle={styles.body}
        refreshControl={<RefreshControl refreshing={view.refreshing} onRefresh={view.refresh} tintColor={colors.green} />}
      >
        {!!view.error && (
          <Text style={styles.error}>
            Could not load {meta.name}: {view.error}. The published feed rebuilds on a schedule — pull to try again.
          </Text>
        )}

        {SECTIONS.map((sec) => {
          const list = grouped[sec.key];
          if (!list.length) return null;
          return (
            <View key={sec.key} style={styles.section}>
              <View style={styles.sectionHead}>
                <Ionicons name={sec.icon} size={13} color={sec.key === 'in_progress' ? colors.live : colors.inkFaint} />
                <Text style={[styles.sectionTitle, sec.key === 'in_progress' && { color: colors.live }]}>{sec.title}</Text>
                <View style={styles.count}><Text style={styles.countText}>{list.length}</Text></View>
                <Text style={styles.sectionBlurb} numberOfLines={1}>{sec.blurb}</Text>
              </View>

              {list.map((g) => {
                const away = view.teamRef(g.awayId);
                const home = view.teamRef(g.homeId);
                const rec = view.findRecord(g.id);
                const st = effectiveStatus(g, now, liveHours);
                const opened = open === g.id;
                const onCard = eng.picks.some((p) => p.gameId === g.id && p.status === 'open');
                const drawPct = (rec as { drawPct?: number } | undefined)?.drawPct ?? 0;
                /*
                 * A running game is shown at what it is worth now, not at what it
                 * was worth before it started. Until this, a side nine down in the
                 * fourth still carried its pre-game 75%, which is not a forecast
                 * so much as a refusal to look at the scoreboard. Pre-game numbers
                 * are still what the record is graded on -- these only ever reach
                 * the screen.
                 */
                const liveNow = st === 'in_progress' && g.liveHomeWinPct != null && g.liveAwayWinPct != null;
                const awayPct = liveNow ? g.liveAwayWinPct! : rec?.awayWinPct ?? 0;
                const homePct = liveNow ? g.liveHomeWinPct! : rec?.homeWinPct ?? 0;
                const barDraw = liveNow ? g.liveDrawPct ?? 0 : drawPct;
                return (
                  <TouchableOpacity
                    key={g.id}
                    style={[styles.card, st === 'in_progress' && styles.cardLive, opened && styles.cardOpen]}
                    activeOpacity={0.85}
                    onPress={() => { haptic('select'); setOpen(opened ? null : g.id); }}
                    accessibilityRole="button"
                    accessibilityState={{ expanded: opened }}
                    accessibilityLabel={`${away?.abbr ?? g.awayId} at ${home?.abbr ?? g.homeId}, show sportsbook lines`}
                  >
                    <View style={styles.top}>
                      <View style={styles.team}>
                        <RefMark team={away} size={34} disc />
                        <Text style={styles.abbr} numberOfLines={1}>{away?.abbr ?? (g.matchupPending ? 'TBC' : '—')}</Text>
                        {st === 'scheduled'
                          ? !!away?.record && <Text style={styles.rec}>{away.record}</Text>
                          : <Text style={[styles.score, numeric]}>{g.awayScore ?? '–'}</Text>}
                      </View>
                      <View style={styles.mid}>
                        {st === 'in_progress' ? (
                          <View style={styles.liveRow}><View style={styles.liveDot} /><Text style={styles.liveText}>{g.statusDetail || 'In progress'}</Text></View>
                        ) : g.matchupPending ? (
                          // The fixture is real and on the schedule; the two
                          // sides are not decided yet. Saying so beats a dash.
                          <Text style={styles.when} numberOfLines={1}>
                            {new Date(g.kickoff).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })} · TBC
                          </Text>
                        ) : (
                          <Text style={styles.when} numberOfLines={1}>
                            {st === 'final' ? 'Final' : new Date(g.kickoff).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })}
                          </Text>
                        )}
                        <Text style={styles.venue} numberOfLines={1}>
                          {[
                            g.broadcast || (g.neutralSite ? 'Neutral' : g.stadium) || meta.short,
                            // Named where it applies, because it moves the total
                            // and a number that moves for a reason should say so.
                            g.weatherHint && g.weatherHint !== 'clear' && g.weatherHint !== 'dome'
                              ? g.weatherHint[0].toUpperCase() + g.weatherHint.slice(1)
                              : null,
                          ].filter(Boolean).join(' · ')}
                        </Text>
                        {/* The starters, for the same reason as the weather and
                            more so: in baseball they are the largest single
                            input to the number on this row, and a projection
                            that turns on who is throwing should name them. */}
                        {st === 'scheduled' && !!(g.awayProbable || g.homeProbable) && (
                          <Text style={styles.probables} numberOfLines={1}>
                            {[g.awayProbable, g.homeProbable]
                              .map((pr) => (pr ? (pr.era != null ? `${pr.name} ${pr.era.toFixed(2)}` : pr.name) : 'TBD'))
                              .join('  vs  ')}
                          </Text>
                        )}
                      </View>
                      <View style={styles.team}>
                        <RefMark team={home} size={34} disc />
                        <Text style={styles.abbr} numberOfLines={1}>{home?.abbr ?? (g.matchupPending ? 'TBC' : '—')}</Text>
                        {st === 'scheduled'
                          ? !!home?.record && <Text style={styles.rec}>{home.record}</Text>
                          : <Text style={[styles.score, numeric]}>{g.homeScore ?? '–'}</Text>}
                      </View>
                    </View>

                    {!!rec && (
                      <>
                        <ProbBar
                          awayPct={awayPct}
                          homePct={homePct}
                          drawPct={barDraw}
                          awayAbbr={away?.abbr ?? ''}
                          homeAbbr={home?.abbr ?? ''}
                          height={10}
                        />
                        <View style={styles.lineRow}>
                          <Text style={styles.stat}>
                            <Text style={styles.statKey}>{liveNow ? 'Live · model ' : 'Model '}</Text>
                            {rec.spread > 0 ? `${away?.abbr} -${rec.spread.toFixed(1)}` : `${home?.abbr} ${rec.spread.toFixed(1)}`} · {rec.total.toFixed(1)}
                          </Text>
                          {g.homeSpread != null && (
                            <Text style={styles.stat}>
                              <Text style={styles.statKey}>Market </Text>
                              {g.homeSpread > 0 ? `${away?.abbr} -${g.homeSpread}` : `${home?.abbr} ${g.homeSpread}`}
                              {g.totalLine != null ? ` · ${g.totalLine}` : ''}
                            </Text>
                          )}
                          {onCard && <Ionicons name="bookmark" size={13} color={colors.green} />}
                          <Ionicons name={opened ? 'chevron-up' : 'chevron-down'} size={15} color={colors.inkFaint} />
                        </View>
                        {convictions.has(g.id) && (
                          <ConvictionCell
                            value={convictions.get(g.id)!}
                            locked={!!readable && !readable.has(g.id)}
                            onUpgrade={onUpgrade}
                          />
                        )}
                      </>
                    )}

                    {opened && (
                      <View>
                        <BookOdds game={g} rec={rec} awayAbbr={away?.abbr ?? ''} homeAbbr={home?.abbr ?? ''} />
                        <View style={styles.actions}>
                          <TouchableOpacity
                            style={styles.btn}
                            activeOpacity={0.85}
                            onPress={() => { haptic('light'); setAdding({ game: g, abbrs: [away?.abbr ?? '', home?.abbr ?? ''] }); }}
                            accessibilityRole="button"
                            accessibilityLabel="Add to your card"
                          >
                            <Ionicons name="bookmark-outline" size={14} color={colors.ink} />
                            <Text style={styles.btnText}>Add to card</Text>
                          </TouchableOpacity>
                          <TouchableOpacity
                            style={[styles.btn, styles.btnAlt]}
                            activeOpacity={0.85}
                            onPress={() => { haptic('light'); onOpenGame(g.homeId, g.id); }}
                            accessibilityRole="button"
                            accessibilityLabel="Open the game page"
                          >
                            <Ionicons name="stats-chart" size={14} color={colors.ink} />
                            <Text style={styles.btnText}>Game</Text>
                          </TouchableOpacity>
                          <TouchableOpacity
                            style={[styles.btn, styles.btnGo]}
                            activeOpacity={0.85}
                            onPress={() => { haptic('medium'); onRun({ awayId: g.awayId, homeId: g.homeId, ctx: { neutralSite: g.neutralSite, primetime: false, weather: 'auto' } }); }}
                            accessibilityRole="button"
                            accessibilityLabel="Simulate this game"
                          >
                            <Ionicons name="analytics" size={14} color={colors.bg} />
                            <Text style={[styles.btnText, { color: colors.bg }]}>Simulate</Text>
                          </TouchableOpacity>
                        </View>
                      </View>
                    )}
                  </TouchableOpacity>
                );
              })}
            </View>
          );
        })}

        {/*
          * A day with nothing still to play is ordinary and needs no comment --
          * unless the reason somebody is looking is that they want the next
          * fixture, which is most of the time. So: point at it, or say plainly
          * that there is not one. An empty board with no explanation is what
          * makes a working app look broken.
          */}
        {!view.loading && !grouped.scheduled.length && (
          upcomingIdx >= 0 && upcomingIdx !== tabIdx ? (
            <TouchableOpacity
              style={styles.nextUp}
              activeOpacity={0.85}
              onPress={() => { haptic('select'); setTab(upcomingIdx); }}
              accessibilityRole="button"
              accessibilityLabel={`Go to the next ${meta.name} games, ${weeks[upcomingIdx]?.label}`}
            >
              <Ionicons name="arrow-forward-circle-outline" size={16} color={meta.accent} />
              <Text style={styles.nextUpText}>
                Nothing left to play on this day. Next {meta.name} games: {weeks[upcomingIdx]?.label}.
              </Text>
            </TouchableOpacity>
          ) : upcomingIdx < 0 ? (
            <View style={styles.nextUp}>
              <Ionicons name="checkmark-done-circle-outline" size={16} color={colors.inkFaint} />
              <Text style={styles.nextUpText}>
                {meta.name} has no games scheduled yet. Its season is at an end or between rounds — fixtures appear
                here as soon as they are published.
              </Text>
            </View>
          ) : null
        )}

        {!games.length && !view.loading && (
          <View style={styles.empty}>
            <SportGlyph sport={profile.sport} size={30} color={meta.accent} tile />
            <Text style={styles.emptyText}>
              Nothing on this slate. {meta.name} publishes a fresh board when its season is running — the picker says
              which leagues have games today.
            </Text>
          </View>
        )}
      </ScrollView>

      <Modal visible={!!adding} transparent animationType="fade" onRequestClose={() => setAdding(null)}>
        <TouchableOpacity style={styles.backdrop} activeOpacity={1} onPress={() => setAdding(null)}>
          <TouchableOpacity activeOpacity={1} style={styles.sheetWrap}>
            {!!adding && (
              <AddToCard
                league={view.id}
                game={adding.game}
                rec={view.findRecord(adding.game.id)}
                awayAbbr={adding.abbrs[0]}
                homeAbbr={adding.abbrs[1]}
                onClose={() => setAdding(null)}
              />
            )}
          </TouchableOpacity>
        </TouchableOpacity>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  // flexShrink matters as much as flexGrow: a row in a flex column shrinks by
  // default, and a horizontal ScrollView clips what it cannot fit. The strip
  // was 26pt tall around a 47pt tab, so every label lost its second line and
  // the tabs disappeared under the card below. It is not the thing that gives
  // way when the column is short of room.
  bar: { flexGrow: 1, flexShrink: 1, marginBottom: 0 },
  // The jump sits outside the scroller on purpose: inside it, the one control
  // that gets you back to today would itself need scrolling to.
  barRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingLeft: spacing.lg, marginBottom: spacing.sm },
  todayJump: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 10, paddingVertical: 7, borderRadius: radius.md, backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border },
  todayText: { fontSize: 11, fontWeight: '700' },
  nextUp: { flexDirection: 'row', alignItems: 'center', gap: 8, padding: spacing.md, marginBottom: spacing.md, backgroundColor: colors.card, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border },
  nextUpText: { color: colors.inkFaint, fontSize: 12, flex: 1, lineHeight: 17 },
  // alignItems matters here: a horizontal ScrollView lays its children out in a
  // row, and the default stretch makes each tab take the row's height — which
  // was itself derived from nothing, so the whole strip collapsed to the
  // padding and the labels inside it were clipped away to nothing.
  barInner: { paddingRight: spacing.lg, gap: TAB_GAP, alignItems: 'flex-start' },
  weekTab: { width: TAB_WIDTH, paddingHorizontal: spacing.md, paddingVertical: 9, borderRadius: radius.md, backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border },
  weekLabel: { color: colors.ink, fontSize: 12.5, fontWeight: '800' },
  weekMeta: { color: colors.inkFaint, fontSize: 10, marginTop: 2 },

  body: { padding: spacing.lg, paddingTop: 0, paddingBottom: clearance.dock },
  error: { color: colors.negative, fontSize: 12, lineHeight: 17, marginBottom: spacing.md },

  section: { marginBottom: spacing.lg },
  sectionHead: { flexDirection: 'row', alignItems: 'center', gap: 7, marginBottom: spacing.sm },
  sectionTitle: { color: colors.ink, fontSize: 13, fontWeight: '900', letterSpacing: 0.2 },
  count: { minWidth: 20, paddingHorizontal: 5, height: 17, borderRadius: 9, backgroundColor: colors.cardAlt, alignItems: 'center', justifyContent: 'center' },
  countText: { color: colors.inkDim, fontSize: 10, fontWeight: '900' },
  sectionBlurb: { color: colors.inkGhost, fontSize: 10, flex: 1, textAlign: 'right' },

  card: { backgroundColor: colors.card, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border, padding: spacing.md, marginBottom: spacing.sm },
  cardLive: { borderColor: colors.live },
  cardOpen: { borderColor: colors.borderHi },
  top: { flexDirection: 'row', alignItems: 'center', marginBottom: spacing.sm },
  team: { flex: 1, alignItems: 'center', gap: 3 },
  abbr: { color: colors.ink, fontSize: 12, fontWeight: '900' },
  rec: { color: colors.inkFaint, fontSize: 10, fontWeight: '700' },
  score: { color: colors.ink, fontSize: 19, fontWeight: '900' },
  mid: { flex: 1.4, alignItems: 'center', gap: 2 },
  when: { color: colors.ink, fontSize: 12.5, fontWeight: '800' },
  venue: { color: colors.inkFaint, fontSize: 10 },
  probables: { color: colors.inkGhost, fontSize: 9.5, marginTop: 2 },
  liveRow: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  liveDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: colors.live },
  liveText: { color: colors.live, fontSize: 11, fontWeight: '900' },

  lineRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginTop: spacing.sm },
  stat: { color: colors.ink, fontSize: 10.5, fontWeight: '700' },
  statKey: { color: colors.inkFaint },

  actions: { flexDirection: 'row', gap: 8, marginTop: spacing.md },
  btn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 10, borderRadius: radius.pill, backgroundColor: colors.cardAlt, borderWidth: 1, borderColor: colors.border },
  btnAlt: {},
  btnGo: { backgroundColor: colors.green, borderColor: colors.green },
  btnText: { color: colors.ink, fontSize: 12, fontWeight: '800' },

  empty: { alignItems: 'center', gap: 8, padding: spacing.xl, backgroundColor: colors.card, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border },
  emptyText: { color: colors.inkFaint, fontSize: 12, textAlign: 'center', lineHeight: 17, maxWidth: 300 },

  backdrop: { flex: 1, backgroundColor: colors.overlay, justifyContent: 'flex-end', padding: spacing.md },
  sheetWrap: { marginBottom: spacing.xl },
});
