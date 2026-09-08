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
import { colors, numeric, radius, spacing } from '@/theme';
import { TabHeader } from '@/components/TabHeader';
import { RefMark } from '@/components/RefMark';
import { BookOdds } from '@/components/BookOdds';
import { AddToCard } from '@/components/AddToCard';
import { ProbBar } from '@/components/ProbBar';
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
}

const WEEK_TAB = 132;

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

export function SportSlateScreen({ onRun, onOpenGame }: Props) {
  const view = useActiveLeague();
  const eng = useEngagement();
  const live = useLive();
  const profile = profileFor(view.id);
  const meta = LEAGUE_BY_KEY[view.id];
  const [tab, setTab] = useState<number>(0);
  const [open, setOpen] = useState<string | null>(null);
  const [adding, setAdding] = useState<{ game: LeagueGame; abbrs: [string, string] } | null>(null);
  const [now, setNow] = useState(Date.now());
  const bar = useRef<ScrollView>(null);
  const followed = useRef(false);

  useEffect(() => { const t = setInterval(() => setNow(Date.now()), 60_000); return () => clearInterval(t); }, []);

  const weeks = view.weeks;
  const currentIdx = Math.max(0, weeks.findIndex((w) => w.week === view.week));
  useEffect(() => {
    if (!followed.current && weeks.length) { setTab(currentIdx); followed.current = true; }
  }, [currentIdx, weeks.length]);
  useEffect(() => { bar.current?.scrollTo({ x: Math.max(0, (tab - 1) * WEEK_TAB), animated: false }); }, [tab]);

  const selected = weeks[tab] ?? weeks[currentIdx];
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
        <ScrollView ref={bar} horizontal showsHorizontalScrollIndicator={false} style={styles.bar} contentContainerStyle={styles.barInner}>
          {weeks.map((w, i) => {
            const on = i === tab;
            return (
              <TouchableOpacity
                key={`${w.gameType}-${w.week}`}
                style={[styles.weekTab, on && { borderColor: meta.accent }]}
                activeOpacity={0.85}
                onPress={() => { haptic('select'); setTab(i); }}
                accessibilityRole="tab"
                accessibilityState={{ selected: on }}
              >
                <Text style={[styles.weekLabel, on && { color: meta.accent }]} numberOfLines={1}>{w.label}</Text>
                <Text style={styles.weekMeta}>
                  {w.live ? `${w.live} live` : w.final === w.games ? 'final' : `${w.games} game${w.games === 1 ? '' : 's'}`}
                </Text>
              </TouchableOpacity>
            );
          })}
        </ScrollView>
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
                        <Text style={styles.abbr} numberOfLines={1}>{away?.abbr ?? '—'}</Text>
                        {st === 'scheduled'
                          ? !!away?.record && <Text style={styles.rec}>{away.record}</Text>
                          : <Text style={[styles.score, numeric]}>{g.awayScore ?? '–'}</Text>}
                      </View>
                      <View style={styles.mid}>
                        {st === 'in_progress' ? (
                          <View style={styles.liveRow}><View style={styles.liveDot} /><Text style={styles.liveText}>{g.statusDetail || 'In progress'}</Text></View>
                        ) : (
                          <Text style={styles.when} numberOfLines={1}>
                            {st === 'final' ? 'Final' : new Date(g.kickoff).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })}
                          </Text>
                        )}
                        <Text style={styles.venue} numberOfLines={1}>
                          {g.broadcast || (g.neutralSite ? 'Neutral' : g.stadium) || meta.short}
                        </Text>
                      </View>
                      <View style={styles.team}>
                        <RefMark team={home} size={34} disc />
                        <Text style={styles.abbr} numberOfLines={1}>{home?.abbr ?? '—'}</Text>
                        {st === 'scheduled'
                          ? !!home?.record && <Text style={styles.rec}>{home.record}</Text>
                          : <Text style={[styles.score, numeric]}>{g.homeScore ?? '–'}</Text>}
                      </View>
                    </View>

                    {!!rec && (
                      <>
                        <ProbBar
                          awayPct={rec.awayWinPct}
                          homePct={rec.homeWinPct}
                          drawPct={drawPct}
                          awayAbbr={away?.abbr ?? ''}
                          homeAbbr={home?.abbr ?? ''}
                          height={10}
                        />
                        <View style={styles.lineRow}>
                          <Text style={styles.stat}>
                            <Text style={styles.statKey}>Model </Text>
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
  bar: { flexGrow: 0, flexShrink: 0, marginBottom: spacing.sm },
  // alignItems matters here: a horizontal ScrollView lays its children out in a
  // row, and the default stretch makes each tab take the row's height — which
  // was itself derived from nothing, so the whole strip collapsed to the
  // padding and the labels inside it were clipped away to nothing.
  barInner: { paddingHorizontal: spacing.lg, gap: spacing.sm, alignItems: 'flex-start' },
  weekTab: { width: WEEK_TAB - 10, paddingHorizontal: spacing.md, paddingVertical: 9, borderRadius: radius.md, backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border },
  weekLabel: { color: colors.ink, fontSize: 12.5, fontWeight: '800' },
  weekMeta: { color: colors.inkFaint, fontSize: 10, marginTop: 2 },

  body: { padding: spacing.lg, paddingTop: 0, paddingBottom: 40 },
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
