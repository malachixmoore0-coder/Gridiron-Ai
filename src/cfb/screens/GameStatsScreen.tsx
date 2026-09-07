import React, { useMemo, useState } from 'react';
import { View, Text, ScrollView, TouchableOpacity, ActivityIndicator, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useTeams } from '@/cfb/context/TeamsContext';
import { useRoster } from '@/cfb/hooks/useRoster';
import { colors, radius, shadow, spacing } from '@/theme';
import type { BoxCategory, BoxTotals } from '@/cfb/utils/roster';
import { boxScore, headshotOf, stat } from '@/cfb/utils/roster';
import type { RosterPlayer, StatLine, TeamRosterFile, TeamScheduleGame } from '@/cfb/data/liveTypes';
import { PlayerAvatar } from '@/cfb/components/PlayerAvatar';
import { TeamMark } from '@/cfb/components/TeamMark';
import { Section } from '@/components/Section';
import { ScreenHeader } from '@/components/ScreenHeader';
import { Chip } from '@/components/Chip';
import type { RunRequest } from '@/cfb/hooks/useAnalysis';
import { Modal } from 'react-native';
import { AddToCard } from '@/components/AddToCard';
import { useEngagement } from '@/context/EngagementContext';
import type { LeagueId } from '@/league/types';
import { gameMatchups, biggestEdge } from '@/cfb/utils/gameMatchups';
import { useTeamNews } from '@/cfb/hooks/useTeamNews';
import { Linking } from 'react-native';

interface Props {
  /** Which league owns this game — the card needs it to grade against the right slate. */
  league?: LeagueId;
  teamId: string;
  gameId: string;
  onBack: () => void;
  onOpenPlayer: (teamId: string, playerId: string) => void;
  onOpenTeam: (teamId: string) => void;
  onRun: (req: RunRequest) => void;
}

/**
 * Box score for one game, built from the per-game lines in each team's roster
 * file — so it shows the same numbers that produced the player grades.
 */
export function GameStatsScreen({ teamId, gameId, league = 'cfb', onBack, onOpenPlayer, onOpenTeam, onRun }: Props) {
  const { getTeam, hasTeam, records, games } = useTeams();
  const eng = useEngagement();
  const [adding, setAdding] = useState(false);
  const team = getTeam(teamId);
  const { roster: file, loading } = useRoster(teamId);
  const game = file?.schedule.find((g) => g.id === gameId) ?? null;
  const oppId = game?.oppId && hasTeam(game.oppId) ? game.oppId : null;
  // Always call the hook; an empty id simply never resolves.
  const { roster: oppFile, loading: oppLoading } = useRoster(oppId ?? teamId);
  const opp = oppId ? getTeam(oppId) : null;

  // Unit-versus-unit for the header, and the two teams' headlines below it.
  const home = game?.home ? team : opp;
  const away = game?.home ? opp : team;
  const units = useMemo(
    () => (home && away ? gameMatchups(home, away, home.abbr, away.abbr) : []),
    [home, away],
  );
  const headline = useMemo(() => biggestEdge(units), [units]);
  const feedGame = useMemo(() => games.find((g) => g.id === gameId) ?? null, [games, gameId]);
  const onCard = eng.picks.some((p) => p.gameId === gameId && p.status === 'open');
  const ownNews = useTeamNews(teamId);
  const oppNews = useTeamNews(oppId);
  const [side, setSide] = useState<'own' | 'opp'>('own');

  const own = useMemo(() => (file ? boxScore(file.roster, gameId) : null), [file, gameId]);
  const other = useMemo(() => (oppId && oppFile && oppFile.teamId === oppId ? boxScore(oppFile.roster, gameId) : null), [oppFile, oppId, gameId]);
  const prediction = records.find((r) => r.id === gameId);

  if (!game) {
    return (
      <SafeAreaView style={styles.root} edges={['top']}>
        <ScreenHeader title="Game" onBack={onBack} />
        <View style={styles.center}>
          {loading ? <ActivityIndicator color={colors.gold} /> : <Text style={styles.empty}>This game is not on the published schedule.</Text>}
        </View>
      </SafeAreaView>
    );
  }

  const played = game.status === 'final';
  const oppName = opp ? `${opp.school}` : game.oppName;
  const showing = side === 'own' || !other ? own : other;
  const showingTeam = side === 'own' || !other ? team : opp!;
  const showingFile = side === 'own' || !other ? file : oppFile;

  return (
    <SafeAreaView style={styles.root} edges={['top']}>
      <ScreenHeader
        title={`${game.home ? 'vs' : game.neutral ? 'vs' : 'at'} ${oppName}`}
        subtitle={`${game.gameType === 'regular' ? `Week ${game.week}` : 'Postseason'} · ${new Date(game.date).toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' })}${game.notes ? ` · ${game.notes}` : ''}`}
        onBack={onBack}
      />
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <View style={styles.hero}>
          <TouchableOpacity style={styles.heroTeam} activeOpacity={0.8} onPress={() => onOpenTeam(team.id)}>
            <TeamMark team={team} size={48} />
            <Text style={styles.heroAbbr}>{team.abbr}</Text>
          </TouchableOpacity>
          <View style={styles.heroMid}>
            {played ? (
              <>
                <Text style={styles.heroScore}>{game.teamScore} – {game.oppScore}</Text>
                <Text style={[styles.heroResult, { color: game.result === 'W' ? colors.positive : colors.negative }]}>
                  {game.result === 'W' ? 'Win' : 'Loss'}{game.home ? '' : game.neutral ? ' · neutral' : ' · away'}
                </Text>
              </>
            ) : (
              <>
                <Text style={styles.heroUpcoming}>{new Date(game.date).toLocaleString(undefined, { weekday: 'short', hour: 'numeric', minute: '2-digit' })}</Text>
                <Text style={styles.heroResult}>Not played yet</Text>
              </>
            )}
          </View>
          {opp ? (
            <TouchableOpacity style={styles.heroTeam} activeOpacity={0.8} onPress={() => onOpenTeam(opp.id)}>
              <TeamMark team={opp} size={48} />
              <Text style={styles.heroAbbr}>{opp.abbr}</Text>
            </TouchableOpacity>
          ) : (
            <View style={styles.heroTeam}><View style={styles.oppBlank}><Text style={styles.oppBlankText}>{game.oppName.slice(0, 3).toUpperCase()}</Text></View><Text style={styles.heroAbbr} numberOfLines={1}>{game.oppName}</Text></View>
          )}
        </View>

        {!played && (
          <View style={styles.actions}>
            <TouchableOpacity
              style={[styles.addBtn, onCard && styles.addBtnOn]}
              activeOpacity={0.85}
              onPress={() => setAdding(true)}
              accessibilityRole="button"
              accessibilityLabel="Add this game to your card"
            >
              <Ionicons name={onCard ? 'bookmark' : 'bookmark-outline'} size={17} color={onCard ? colors.bg : colors.ink} />
              <Text style={[styles.addText, onCard && { color: colors.bg }]}>{onCard ? 'On your card' : 'Add to card'}</Text>
            </TouchableOpacity>
          </View>
        )}

        {!played && (
          <TouchableOpacity style={styles.run} activeOpacity={0.85} onPress={() => onRun({ awayId: game.home ? (oppId ?? team.id) : team.id, homeId: game.home ? team.id : (oppId ?? team.id), ctx: { neutralSite: game.neutral, primetime: false, weather: 'auto' } })}>
            <Ionicons name="analytics" size={18} color={colors.bg} />
            <Text style={styles.runText}>Simulate this matchup</Text>
          </TouchableOpacity>
        )}

        {played && prediction?.result && (
          <View style={styles.verdict}>
            <Ionicons name={prediction.result.suCorrect ? 'checkmark-circle' : 'close-circle'} size={16} color={prediction.result.suCorrect ? colors.positive : colors.negative} />
            <Text style={styles.verdictText}>
              Model had {prediction.homeWinPct >= 50 ? 'the home side' : 'the road side'} at {Math.max(prediction.homeWinPct, prediction.awayWinPct).toFixed(1)}% and {prediction.result.suCorrect ? 'called it' : 'missed'}
              {prediction.result.ats ? ` · against the spread ${prediction.result.ats}` : ''} · projected {prediction.total.toFixed(1)}, actual {(game.teamScore ?? 0) + (game.oppScore ?? 0)}
            </Text>
          </View>
        )}

        {units.length > 0 && (
          <Section
            icon="git-compare"
            title="Matchups"
            subtitle={headline ? `Biggest gap: ${headline.label} ${headline.edge > 0 ? '+' : ''}${headline.edge.toFixed(1)}` : 'Unit against unit, on the engine\u2019s own grades'}
          >
            {units.map((u) => {
              const pct = Math.max(6, Math.min(94, 50 + u.edge * 9));
              return (
                <View key={u.label} style={styles.unitRow}>
                  <View style={styles.unitHead}>
                    <Text style={styles.unitLabel}>{u.label}</Text>
                    <Text style={[styles.unitEdge, { color: u.edge >= 1 ? colors.positive : u.edge <= -1 ? colors.negative : colors.inkDim }]}>
                      {u.edge > 0 ? '+' : ''}{u.edge.toFixed(1)}
                    </Text>
                  </View>
                  <Text style={styles.unitAgainst}>{u.against} · {u.attack.toFixed(1)} vs {u.defend.toFixed(1)}</Text>
                  <View style={styles.unitTrack}>
                    <View style={[styles.unitFill, { width: `${pct}%`, backgroundColor: u.edge >= 0 ? colors.positive : colors.negative }]} />
                  </View>
                </View>
              );
            })}
            <Text style={styles.unitFoot}>
              Grades are the same 1-10 unit ratings the simulation compares. Positive favours the side named first.
            </Text>
          </Section>
        )}

        {(ownNews.items.length > 0 || oppNews.items.length > 0) && (
          <Section icon="newspaper" title="Team news" subtitle="Headlines from ESPN, refreshed with the data feed">
            {[{ team, list: ownNews.items }, { team: opp, list: oppNews.items }]
              .filter((g) => g.team && g.list.length)
              .map((group) => (
                <View key={group.team!.id} style={styles.newsGroup}>
                  <Text style={styles.newsTeam}>{group.team!.abbr}</Text>
                  {group.list.slice(0, 4).map((n) => (
                    <TouchableOpacity
                      key={n.id}
                      style={styles.newsItem}
                      activeOpacity={0.8}
                      onPress={() => { if (n.link) Linking.openURL(n.link).catch(() => {}); }}
                      disabled={!n.link}
                    >
                      <Text style={styles.newsHead} numberOfLines={2}>{n.headline}</Text>
                      {!!n.description && <Text style={styles.newsBody} numberOfLines={2}>{n.description}</Text>}
                      <Text style={styles.newsMeta}>
                        {n.source}{n.byline ? ` · ${n.byline}` : ''}{n.published ? ` · ${new Date(n.published).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}` : ''}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>
              ))}
          </Section>
        )}

        {played && own && other && (
          <Section icon="stats-chart" title="Team totals" subtitle="Summed from the players who recorded a play">
            <View style={styles.totalsHead}>
              <Text style={[styles.totalsCell, styles.totalsLabel]} />
              <Text style={[styles.totalsCell, { color: colors.home }]}>{team.abbr}</Text>
              <Text style={[styles.totalsCell, { color: colors.away }]}>{opp!.abbr}</Text>
            </View>
            <TotalRow label="Passing yards" a={own.totals.passYds} b={other.totals.passYds} />
            <TotalRow label="Rushing yards" a={own.totals.rushYds} b={other.totals.rushYds} />
            <TotalRow label="Passing TDs" a={own.totals.passTd} b={other.totals.passTd} />
            <TotalRow label="Rushing TDs" a={own.totals.rushTd} b={other.totals.rushTd} />
            <TotalRow label="Sacks" a={own.totals.sacks} b={other.totals.sacks} />
            <TotalRow label="Takeaways" a={own.totals.takeaways} b={other.totals.takeaways} />
            <TotalRow label="Interceptions thrown" a={own.totals.turnovers} b={other.totals.turnovers} invert />
            <TotalRow label="Plays from scrimmage" a={own.totals.plays} b={other.totals.plays} />
          </Section>
        )}

        {played && other && (
          <View style={styles.sideTabs}>
            <Chip label={team.abbr} active={side === 'own'} onPress={() => setSide('own')} small />
            <Chip label={opp!.abbr} active={side === 'opp'} onPress={() => setSide('opp')} small />
          </View>
        )}

        {played && (oppLoading || loading) && !showing && (
          <View style={styles.center}><ActivityIndicator color={colors.gold} /><Text style={styles.empty}>Loading box score…</Text></View>
        )}

        {played && showing && showing.categories.length === 0 && (
          <Text style={styles.empty}>
            No player stats on file for {showingTeam.abbr} in this game. Play-by-play for a finished game usually lands within a few hours of the whistle.
          </Text>
        )}

        {played && showing?.categories.map((c) => (
          <Section key={c.key} icon={iconFor(c.key)} title={`${showingTeam.abbr} ${c.title.toLowerCase()}`} subtitle={`${c.lines.length} player${c.lines.length === 1 ? '' : 's'}`}>
            <View style={styles.tableHead}>
              <Text style={[styles.cell, styles.nameCell]}>Player</Text>
              {c.columns.map((col) => <Text key={col.key} style={styles.cell}>{col.label}</Text>)}
            </View>
            {c.lines.map((l) => (
              <TouchableOpacity key={l.player.id} style={styles.row} activeOpacity={0.75} onPress={() => onOpenPlayer(showingTeam.id, l.player.id)}>
                <View style={styles.nameCell}>
                  <PlayerAvatar uri={headshotOf(l.player, showingFile, 28)} name={l.player.name} team={showingTeam} size={28} />
                  <View style={{ flex: 1 }}>
                    <Text style={styles.name} numberOfLines={1}>{l.player.jersey ? `#${l.player.jersey} ` : ''}{l.player.name}</Text>
                    <Text style={styles.pos}>{l.player.listedPos || l.player.pos}</Text>
                  </View>
                </View>
                {c.columns.map((col) => <Text key={col.key} style={styles.cell}>{fmt(l.stats, col.key)}</Text>)}
              </TouchableOpacity>
            ))}
          </Section>
        ))}
      </ScrollView>

      <Modal visible={adding} transparent animationType="fade" onRequestClose={() => setAdding(false)}>
        <TouchableOpacity style={styles.backdrop} activeOpacity={1} onPress={() => setAdding(false)}>
          <TouchableOpacity activeOpacity={1} style={styles.sheetWrap}>
            {!!feedGame && (
              <AddToCard
                league={league}
                game={feedGame as never}
                rec={records.find((r) => r.id === gameId)}
                awayAbbr={feedGame.awayId === teamId ? team.abbr : opp?.abbr ?? feedGame.awayId.toUpperCase()}
                homeAbbr={feedGame.homeId === teamId ? team.abbr : opp?.abbr ?? feedGame.homeId.toUpperCase()}
                onClose={() => setAdding(false)}
              />
            )}
            {!feedGame && (
              <View style={styles.noGame}>
                <Text style={styles.noGameText}>
                  This game is not on the published slate yet, so there is no line to price against. It appears once
                  the schedule refresh picks it up.
                </Text>
              </View>
            )}
          </TouchableOpacity>
        </TouchableOpacity>
      </Modal>
    </SafeAreaView>
  );
}

const iconFor = (k: BoxCategory['key']): keyof typeof Ionicons.glyphMap =>
  k === 'passing' ? 'american-football' : k === 'rushing' ? 'walk' : k === 'receiving' ? 'hand-left' : k === 'defense' ? 'shield-checkmark' : 'football';

const fmt = (line: StatLine, key: keyof StatLine) => {
  const v = stat(line, key);
  return key === 'sacks' || key === 'epa' ? (Math.round(v * 10) / 10).toString() : String(Math.round(v));
};

function TotalRow({ label, a, b, invert }: { label: string; a: number; b: number; invert?: boolean }) {
  const aBetter = invert ? a < b : a > b;
  const bBetter = invert ? b < a : b > a;
  return (
    <View style={styles.totalsRow}>
      <Text style={[styles.totalsCell, styles.totalsLabel]}>{label}</Text>
      <Text style={[styles.totalsCell, aBetter && styles.totalsWin]}>{Math.round(a)}</Text>
      <Text style={[styles.totalsCell, bBetter && styles.totalsWin]}>{Math.round(b)}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  actions: { marginBottom: 12 },
  addBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingVertical: 13, borderRadius: 999, backgroundColor: colors.cardAlt, borderWidth: 1, borderColor: colors.green },
  addBtnOn: { backgroundColor: colors.green, borderColor: colors.green },
  addText: { color: colors.ink, fontSize: 14, fontWeight: '900' },
  backdrop: { flex: 1, backgroundColor: colors.overlay, justifyContent: 'flex-end', padding: 12 },
  sheetWrap: { marginBottom: 24 },
  noGame: { backgroundColor: colors.card, borderRadius: 16, borderWidth: 1, borderColor: colors.border, padding: 16 },
  noGameText: { color: colors.inkDim, fontSize: 12, lineHeight: 18 },
  unitRow: { paddingVertical: 9, borderBottomWidth: 1, borderBottomColor: colors.divider },
  unitHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  unitLabel: { color: colors.ink, fontSize: 13, fontWeight: '800' },
  unitEdge: { fontSize: 13, fontWeight: '900' },
  unitAgainst: { color: colors.inkFaint, fontSize: 11, marginTop: 2 },
  unitTrack: { height: 5, borderRadius: 3, backgroundColor: colors.cardAlt, marginTop: 7, overflow: 'hidden' },
  unitFill: { height: 5, borderRadius: 3 },
  unitFoot: { color: colors.inkGhost, fontSize: 10, lineHeight: 15, marginTop: 10 },

  newsGroup: { marginBottom: spacing.md },
  newsTeam: { color: colors.gold, fontSize: 10, fontWeight: '900', letterSpacing: 1, marginBottom: 6 },
  newsItem: { paddingVertical: 9, borderBottomWidth: 1, borderBottomColor: colors.divider },
  newsHead: { color: colors.ink, fontSize: 13.5, fontWeight: '800', lineHeight: 18 },
  newsBody: { color: colors.inkDim, fontSize: 12, lineHeight: 17, marginTop: 3 },
  newsMeta: { color: colors.inkGhost, fontSize: 10, marginTop: 4 },
  root: { flex: 1, backgroundColor: colors.bg },
  content: { paddingHorizontal: spacing.lg, paddingBottom: spacing.xxl },
  center: { alignItems: 'center', gap: 8, paddingVertical: spacing.xl },
  empty: { color: colors.inkFaint, fontSize: 12, lineHeight: 17, textAlign: 'center' },
  hero: { flexDirection: 'row', alignItems: 'center', backgroundColor: colors.card, borderRadius: radius.xl, borderWidth: 1, borderColor: colors.border, padding: spacing.lg, marginBottom: spacing.md, ...shadow.card },
  heroTeam: { alignItems: 'center', gap: 6, width: 84 },
  heroAbbr: { color: colors.ink, fontWeight: '900', fontSize: 12 },
  oppBlank: { width: 48, height: 48, borderRadius: 24, backgroundColor: colors.cardAlt, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: colors.border },
  oppBlankText: { color: colors.inkDim, fontWeight: '900', fontSize: 13 },
  heroMid: { flex: 1, alignItems: 'center' },
  heroScore: { color: colors.ink, fontSize: 30, fontWeight: '900', letterSpacing: -1 },
  heroUpcoming: { color: colors.ink, fontSize: 16, fontWeight: '900' },
  heroResult: { color: colors.inkFaint, fontSize: 11, fontWeight: '800', marginTop: 3 },
  run: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: colors.gold, borderRadius: radius.lg, paddingVertical: 14, marginBottom: spacing.md },
  runText: { color: colors.bg, fontWeight: '900', fontSize: 15 },
  verdict: { flexDirection: 'row', alignItems: 'flex-start', gap: 8, backgroundColor: colors.card, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, padding: spacing.md, marginBottom: spacing.md },
  verdictText: { color: colors.inkDim, fontSize: 11, lineHeight: 16, flex: 1 },
  totalsHead: { flexDirection: 'row', paddingBottom: 6, borderBottomWidth: 1, borderBottomColor: colors.border },
  totalsRow: { flexDirection: 'row', paddingVertical: 7, borderBottomWidth: 1, borderBottomColor: colors.divider },
  totalsCell: { flex: 1, color: colors.inkDim, fontSize: 12, fontWeight: '800', textAlign: 'right' },
  totalsLabel: { flex: 2.4, textAlign: 'left', fontWeight: '700', color: colors.inkFaint },
  totalsWin: { color: colors.ink, fontWeight: '900' },
  sideTabs: { flexDirection: 'row', gap: spacing.sm, marginBottom: spacing.md },
  tableHead: { flexDirection: 'row', alignItems: 'flex-end', paddingBottom: 6, borderBottomWidth: 1, borderBottomColor: colors.border },
  row: { flexDirection: 'row', alignItems: 'center', paddingVertical: 7, borderBottomWidth: 1, borderBottomColor: colors.divider },
  nameCell: { flex: 2.6, flexDirection: 'row', alignItems: 'center', gap: 8 },
  name: { color: colors.ink, fontSize: 12, fontWeight: '800' },
  pos: { color: colors.inkFaint, fontSize: 10, marginTop: 1 },
  cell: { flex: 1, color: colors.inkDim, fontSize: 12, fontWeight: '700', textAlign: 'right' },
});
