/**
 * One app, nine leagues, five tabs and an overlay stack.
 *
 * Two things are load-bearing here.
 *
 * Back. The old build put a single back arrow under the status bar in the top
 * left — unreachable one-handed, and exactly where iOS wants its own edge
 * gesture. Every overlay now sits in an OverlayShell with a full-width back bar
 * at the bottom, and on the web the browser and phone back gestures pop the
 * stack too, because a PWA that swallows the back button feels broken.
 *
 * Leagues. Football is bespoke: the NFL and college screen trees mount against
 * their own engines, with depth charts and box scores the other sports have no
 * equivalent for. Everything else — basketball, baseball, soccer — shares one
 * generic screen tree over one parameterised engine, so a tenth league costs a
 * row in a table rather than a new app. `view.bespoke` is the only place that
 * distinction is allowed to matter; shared surfaces (the card, the parlay lab,
 * the social feed) read the active league through an adapter and never ask.
 */
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { View, StyleSheet, TouchableOpacity, Text, Platform } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors, radius, spacing } from '@/theme';
import { useSettings } from '@/context/SettingsContext';
import { useEntitlements } from '@/context/EntitlementsContext';
import { useEngagement } from '@/context/EngagementContext';
import { useLeague } from '@/league/LeagueContext';
import type { LeagueId } from '@/league/types';
import { LEAGUE_BY_KEY } from '@/sports/types';
import type { RunRequest } from '@/hooks/useAnalysis';
import { BottomTabBar, TabKey } from '@/components/BottomTabBar';
import { OverlayShell } from '@/components/OverlayShell';
import { ErrorBoundary } from '@/components/ErrorBoundary';
import { OnboardingScreen } from '@/screens/OnboardingScreen';
import { AppSettingsScreen } from '@/screens/AppSettingsScreen';
import { NavProvider } from '@/navigation/NavContext';
import { haptic } from '@/utils/haptics';

/* NFL */
import { FloorScreen } from '@/screens/FloorScreen';
import { MatchupScreen } from '@/screens/MatchupScreen';
import { ResultScreen } from '@/screens/ResultScreen';
import { SlateScreen } from '@/screens/SlateScreen';
import { TeamsScreen } from '@/screens/TeamsScreen';
import { TeamDetailScreen } from '@/screens/TeamDetailScreen';
import { PlayerProfileScreen } from '@/screens/PlayerProfileScreen';
import { GameStatsScreen } from '@/screens/GameStatsScreen';
import { SettingsScreen } from '@/screens/SettingsScreen';

/* College */
import { MatchupScreen as CfbMatchup } from '@/cfb/screens/MatchupScreen';
import { ResultScreen as CfbResult } from '@/cfb/screens/ResultScreen';
import { SlateScreen as CfbSlate } from '@/cfb/screens/SlateScreen';
import { TeamsScreen as CfbTeams } from '@/cfb/screens/TeamsScreen';
import { TeamDetailScreen as CfbTeamDetail } from '@/cfb/screens/TeamDetailScreen';
import { PlayerProfileScreen as CfbPlayer } from '@/cfb/screens/PlayerProfileScreen';
import { GameStatsScreen as CfbGameStats } from '@/cfb/screens/GameStatsScreen';
import { SettingsScreen as CfbSettings } from '@/cfb/screens/SettingsScreen';

/* Every other league: one generic engine, one set of screens */
import { SportSlateScreen } from '@/screens/SportSlateScreen';
import { SportTeamsScreen } from '@/screens/SportTeamsScreen';
import { SportTeamScreen } from '@/screens/SportTeamScreen';
import { SportGameScreen } from '@/screens/SportGameScreen';
import { SportMatchupScreen, type SportRun } from '@/screens/SportMatchupScreen';
import { SportResultScreen } from '@/screens/SportResultScreen';
import { SportRecordScreen } from '@/screens/SportRecordScreen';
import { SportPlayerScreen } from '@/screens/SportPlayerScreen';

/* Golf: an event and a field, so none of the two-team screens apply */
import { GolfBoardScreen } from '@/screens/GolfBoardScreen';
import { GolfPlayersScreen } from '@/screens/GolfPlayersScreen';
import { GolfPlayerScreen } from '@/screens/GolfPlayerScreen';

/* Shared */
import { RecordHubScreen } from '@/screens/RecordHubScreen';
import { SocialScreen } from '@/screens/SocialScreen';
import { ComposeScreen } from '@/screens/ComposeScreen';
import { ProfileScreen } from '@/screens/ProfileScreen';
import { PeopleScreen, type PeopleTab } from '@/screens/PeopleScreen';
import { useSocial } from '@/social/SocialContext';
import { openedOnProfile, showAppPath, showProfilePath } from '@/social/links';
import { ParlayScreen } from '@/screens/ParlayScreen';
import { UpgradeScreen } from '@/screens/UpgradeScreen';
import type { PostPick } from '@/social/types';

type AnyRun = { awayId: string; homeId: string; ctx: unknown };

type Overlay =
  | { kind: 'result'; league: LeagueId; request: AnyRun }
  | { kind: 'team'; league: LeagueId; teamId: string }
  | { kind: 'player'; league: LeagueId; teamId: string; playerId: string }
  | { kind: 'golfer'; playerId: string }
  | { kind: 'game'; league: LeagueId; teamId: string; gameId: string }
  | { kind: 'simulate'; league: LeagueId }
  | { kind: 'parlay' }
  | { kind: 'upgrade' }
  | { kind: 'model'; league: LeagueId }
  | { kind: 'settings' }
  | { kind: 'compose'; pick?: PostPick | null }
  | { kind: 'profile'; userId: string; handle?: string }
  | { kind: 'people'; userId: string; name: string; tab: PeopleTab };

const TITLES: Record<Overlay['kind'], string> = {
  result: 'Back', team: 'Back', player: 'Back', golfer: 'Back', game: 'Back', simulate: 'Close',
  parlay: 'Back', upgrade: 'Close', model: 'Back', compose: 'Cancel', profile: 'Back', settings: 'Done',
  people: 'Back',
};

const isWeb = Platform.OS === 'web';

/** Every league but the two football ones runs the generic screens. */
const isGeneric = (l: LeagueId) => !LEAGUE_BY_KEY[l]?.bespoke;

export function RootNavigator() {
  const { loaded, onboarded, overrides } = useSettings();
  const ent = useEntitlements();
  const eng = useEngagement();
  const { league, active } = useLeague();
  const social = useSocial();
  const [tab, setTab] = useState<TabKey>('home');
  const [stack, setStack] = useState<Overlay[]>([]);
  /** Measured height of the dock, so the Simulate button can clear it exactly. */
  const [dock, setDock] = useState(62);
  const depth = useRef(0);

  /* Web: mirror the overlay stack into history so the browser and the phone's
     back gesture close a screen instead of leaving the app. */
  useEffect(() => {
    if (!isWeb || typeof window === 'undefined') return;
    const onPop = () => { depth.current = Math.max(0, depth.current - 1); setStack((s) => s.slice(0, -1)); };
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, []);

  const push = useCallback((o: Overlay) => {
    haptic('light');
    setStack((s) => [...s, o]);
    if (isWeb && typeof window !== 'undefined') { depth.current += 1; window.history.pushState({ gi: depth.current }, ''); }
  }, []);

  const pop = useCallback(() => {
    haptic('select');
    if (isWeb && typeof window !== 'undefined' && depth.current > 0) { window.history.back(); return; }
    setStack((s) => s.slice(0, -1));
  }, []);

  const clearStack = useCallback(() => {
    const n = depth.current;
    setStack([]);
    if (isWeb && typeof window !== 'undefined' && n > 0) { depth.current = 0; window.history.go(-n); }
  }, []);

  /**
   * A profile link is an entry point, not just an exit.
   *
   * Somebody opening `/@coldnumbers` has arrived at that account, so the app
   * boots and then pushes the profile on top of the Floor — which also means
   * Back lands them in the app rather than bouncing them off the site. The
   * handle is resolved once, and only once the social layer has finished
   * restoring, or a signed-in user's own profile would miss.
   */
  const deepLinked = useRef(false);
  useEffect(() => {
    if (!isWeb || deepLinked.current || !social.ready) return;
    const handle = openedOnProfile();
    if (!handle) return;
    deepLinked.current = true;
    let live = true;
    social.profileByHandle(handle).then((p) => {
      // Push even when the handle resolves to nothing: the profile screen's own
      // "no account at that address" state is the right answer to a dead link,
      // and it keeps the address bar honest instead of silently landing on the
      // Floor as if nothing had been asked for.
      if (live) setStack((cur) => (cur.length ? cur : [{ kind: 'profile', userId: p?.id ?? `@${handle}`, handle }]));
    }).catch(() => {});
    return () => { live = false; };
  }, [social]);

  /** Keep the address bar on whatever the top of the stack actually is. */
  useEffect(() => {
    if (!isWeb) return;
    const top = stack[stack.length - 1];
    if (top?.kind === 'profile' && top.handle) showProfilePath(top.handle);
    else showAppPath();
  }, [stack]);

  /** The profile screen reports its handle once loaded, so the URL can name it. */
  const nameProfile = useCallback((index: number, handle: string) => {
    setStack((cur) => {
      const at = cur[index];
      if (!at || at.kind !== 'profile' || at.handle === handle) return cur;
      return cur.map((o, i) => (i === index ? { ...o, handle } : o));
    });
  }, []);

  if (!loaded || !ent.loaded) return <View style={styles.root} />;
  if (!onboarded) return <OnboardingScreen onDone={() => {}} />;

  const openTeam = (teamId: string, l: LeagueId = league) => push({ kind: 'team', league: l, teamId });
  const openPlayer = (teamId: string, playerId: string, l: LeagueId = league) => push({ kind: 'player', league: l, teamId, playerId });
  const openGame = (teamId: string, gameId: string, l: LeagueId = league) => push({ kind: 'game', league: l, teamId, gameId });
  const openUpgrade = () => push({ kind: 'upgrade' });
  const openCompose = (pick?: PostPick | null) => push({ kind: 'compose', pick });
  const openProfile = (userId: string) => push({ kind: 'profile', userId });
  const openPeople = (userId: string, tab: PeopleTab, name: string) => push({ kind: 'people', userId, name, tab });
  const nav = {
    openProfile: () => openProfile('me'),
    openSettings: () => push({ kind: 'settings' }),
    openUpgrade: () => push({ kind: 'upgrade' }),
    openCard: () => { clearStack(); setTab('record'); },
  };

  /** Every simulation goes through here, which is where the free meter is spent. */
  const run = (request: AnyRun, l: LeagueId = league) => {
    if (!ent.spendSim()) { openUpgrade(); return; }
    push({ kind: 'result', league: l, request });
  };

  /** Share a saved pick: hand the composer the pick with its numbers attached. */
  const sharePick = (pickId: string) => {
    const p = eng.picks.find((x) => x.id === pickId);
    if (!p) return;
    openCompose({
      league, gameId: p.gameId, awayId: p.awayId, homeId: p.homeId,
      market: p.market, side: p.side, number: p.number,
      label: p.label, modelPct: p.modelPct, edge: p.edge,
    });
  };

  const cfb = league === 'cfb';
  /** Football runs its own screens; every other sport shares the generic ones. */
  const generic = !active.bespoke && !active.field;
  /** Golf has no opponent, so it replaces the two-team tabs entirely. */
  const field = active.field;
  const openGolfer = (playerId: string) => push({ kind: 'golfer', playerId });

  return (
    <NavProvider value={nav}>
    <View style={styles.root}>
      <View style={styles.content}>
        {tab === 'home' && (field
          ? <GolfBoardScreen onOpenPlayer={openGolfer} />
          : <FloorScreen
            onRun={(r) => run(r as AnyRun, league)}
            onOpenGame={(t, g) => openGame(t, g, league)}
            onOpenTeam={(t) => openTeam(t, league)}
            onUpgrade={openUpgrade}
            onOpenCard={() => setTab('record')}
            onOpenParlay={() => push({ kind: 'parlay' })}
            onOpenModel={() => push({ kind: 'model', league })}
          />)}

        {tab === 'slate' && (field
          ? <GolfBoardScreen onOpenPlayer={openGolfer} />
          : generic
            ? <SportSlateScreen onRun={(r) => run(r as AnyRun, league)} onOpenGame={(t, g) => openGame(t, g, league)} onUpgrade={openUpgrade} />
            : cfb
              ? <CfbSlate onRun={(r) => run(r as AnyRun, 'cfb')} onUpgrade={openUpgrade} />
              : <SlateScreen onRun={(r) => run(r, 'nfl')} onUpgrade={openUpgrade} />)}

        {tab === 'record' && (
          <RecordHubScreen
            onRun={(r) => run(r, league)}
            onUpgrade={openUpgrade}
            onOpenGame={(t, g) => openGame(t, g, league)}
            onShare={sharePick}
          />
        )}

        {tab === 'teams' && (field
          ? <GolfPlayersScreen onOpenPlayer={openGolfer} />
          : generic
            ? <SportTeamsScreen onOpenTeam={(t) => openTeam(t, league)} onUpgrade={openUpgrade} />
            : cfb
              ? <CfbTeams onOpenTeam={(t) => openTeam(t, 'cfb')} onUpgrade={openUpgrade} />
              : <TeamsScreen onOpenTeam={(t) => openTeam(t, 'nfl')} onUpgrade={openUpgrade} />)}

        {tab === 'social' && (
          <SocialScreen
            onCompose={() => openCompose(null)}
            onOpenProfile={openProfile}
            onOpenGame={(l, t, g) => openGame(t, g, l)}
          />
        )}
      </View>

      {/* Simulate is an action, not a destination, so it floats above the dock —
          and only on Teams, which is the one tab whose rows do not already run
          one. On the Floor every edge row carries its own Simulate button and on
          Record the whole card runs one, so there the floating button was pure
          overlap: it sat on top of the controls it duplicated. Its offset is the
          dock's measured height rather than a guess, because the dock grows by
          the home-indicator inset and a fixed number rides up onto the tabs on
          exactly the phones that have one. */}
      {!field && tab === 'teams' && (
        <TouchableOpacity
          style={[styles.fab, { bottom: dock + 14 }]}
          activeOpacity={0.88}
          onPress={() => push({ kind: 'simulate', league })}
          accessibilityRole="button"
          accessibilityLabel="Simulate a matchup"
        >
          <Ionicons name="flash" size={18} color={colors.bg} />
          <Text style={styles.fabText}>Simulate</Text>
        </TouchableOpacity>
      )}

      <View onLayout={(e) => setDock(e.nativeEvent.layout.height)}>
        <BottomTabBar
          active={tab}
          onChange={(t) => { if (t !== tab) haptic('select'); clearStack(); setTab(t); }}
          badge={Object.keys(overrides).length}
        />
      </View>

      {stack.map((o, i) => (
        <View key={`${o.kind}-${i}`} style={[StyleSheet.absoluteFill, styles.overlay]}>
          <ErrorBoundary onBack={pop}>
            <OverlayShell onBack={pop} backLabel={TITLES[o.kind]}>
              {o.kind === 'result' ? (
                isGeneric(o.league)
                  ? <SportResultScreen request={o.request as SportRun} onBack={pop} onOpenTeam={(t) => openTeam(t, o.league)} />
                  : o.league === 'cfb'
                    ? <CfbResult request={o.request as never} onBack={pop} onOpenTeam={(t) => openTeam(t, 'cfb')} onUpgrade={openUpgrade} />
                    : <ResultScreen request={o.request as RunRequest} onBack={pop} onOpenTeam={(t) => openTeam(t, 'nfl')} onUpgrade={openUpgrade} />
              ) : o.kind === 'team' ? (
                isGeneric(o.league)
                  ? <SportTeamScreen teamId={o.teamId} onBack={pop} onOpenTeam={(t) => openTeam(t, o.league)} onOpenGame={(t, g) => openGame(t, g, o.league)} onOpenPlayer={(t, pl) => openPlayer(t, pl, o.league)} onUpgrade={openUpgrade} />
                  : o.league === 'cfb'
                    ? <CfbTeamDetail teamId={o.teamId} onBack={pop} onOpenPlayer={(t, p) => openPlayer(t, p, 'cfb')} onOpenTeam={(t) => openTeam(t, 'cfb')} onOpenGame={(t, g) => openGame(t, g, 'cfb')} />
                    : <TeamDetailScreen teamId={o.teamId} onBack={pop} onOpenPlayer={(t, p) => openPlayer(t, p, 'nfl')} onOpenTeam={(t) => openTeam(t, 'nfl')} onOpenGame={(t, g) => openGame(t, g, 'nfl')} />
              ) : o.kind === 'player' ? (
                isGeneric(o.league)
                  ? <SportPlayerScreen teamId={o.teamId} playerId={o.playerId} onBack={pop} onOpenTeam={(t) => openTeam(t, o.league)} />
                  : o.league === 'cfb'
                    ? <CfbPlayer teamId={o.teamId} playerId={o.playerId} onBack={pop} onOpenTeam={(t) => openTeam(t, 'cfb')} onUpgrade={openUpgrade} />
                    : <PlayerProfileScreen teamId={o.teamId} playerId={o.playerId} onBack={pop} onOpenTeam={(t) => openTeam(t, 'nfl')} onUpgrade={openUpgrade} />
              ) : o.kind === 'game' ? (
                isGeneric(o.league)
                  ? <SportGameScreen gameId={o.gameId} onBack={pop} onOpenTeam={(t) => openTeam(t, o.league)} onRun={(r) => run(r as AnyRun, o.league)} />
                  : o.league === 'cfb'
                    ? <CfbGameStats teamId={o.teamId} gameId={o.gameId} league="cfb" onBack={pop} onOpenPlayer={(t, p) => openPlayer(t, p, 'cfb')} onOpenTeam={(t) => openTeam(t, 'cfb')} onRun={(r) => run(r as AnyRun, 'cfb')} />
                    : <GameStatsScreen teamId={o.teamId} gameId={o.gameId} league="nfl" onBack={pop} onOpenPlayer={(t, p) => openPlayer(t, p, 'nfl')} onOpenTeam={(t) => openTeam(t, 'nfl')} onRun={(r) => run(r, 'nfl')} />
              ) : o.kind === 'simulate' ? (
                isGeneric(o.league)
                  ? <SportMatchupScreen onRun={(r) => run(r as AnyRun, o.league)} onOpenTeam={(t) => openTeam(t, o.league)} />
                  : o.league === 'cfb'
                    ? <CfbMatchup onRun={(r) => run(r as AnyRun, 'cfb')} onOpenTeam={(t) => openTeam(t, 'cfb')} />
                    : <MatchupScreen onRun={(r) => run(r, 'nfl')} onOpenTeam={(t) => openTeam(t, 'nfl')} />
              ) : o.kind === 'model' ? (
                /* The football engines expose tunable weights; the generic ones do
                   not, so their "model" screen is the track record it has earned. */
                isGeneric(o.league)
                  ? <SportRecordScreen onOpenGame={(t, g) => openGame(t, g, o.league)} onUpgrade={openUpgrade} />
                  : o.league === 'cfb'
                    ? <CfbSettings onBack={pop} onUpgrade={openUpgrade} onOpenCard={() => { clearStack(); setTab('record'); }} />
                    : <SettingsScreen onBack={pop} onUpgrade={openUpgrade} onOpenCard={() => { clearStack(); setTab('record'); }} />
              ) : o.kind === 'settings' ? (
                <AppSettingsScreen
                  onProfile={() => openProfile('me')}
                  onUpgrade={openUpgrade}
                  onModel={() => push({ kind: 'model', league })}
                  onCard={() => { clearStack(); setTab('record'); }}
                />
              ) : o.kind === 'golfer' ? (
                <GolfPlayerScreen playerId={o.playerId} onBack={pop} />
              ) : o.kind === 'parlay' ? (
                <ParlayScreen onBack={pop} onUpgrade={openUpgrade} />
              ) : o.kind === 'upgrade' ? (
                <UpgradeScreen onBack={pop} />
              ) : o.kind === 'people' ? (
                <PeopleScreen userId={o.userId} name={o.name} tab={o.tab} onOpenProfile={openProfile} />
              ) : o.kind === 'compose' ? (
                <ComposeScreen onDone={pop} initialPick={o.pick ?? null} />
              ) : (
                <ProfileScreen
                  userId={o.userId}
                  onOpenProfile={openProfile}
                  onCompose={() => openCompose(null)}
                  onOpenPeople={openPeople}
                  onResolved={(handle) => nameProfile(i, handle)}
                />
              )}
            </OverlayShell>
          </ErrorBoundary>
        </View>
      ))}
    </View>
    </NavProvider>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  content: { flex: 1 },
  overlay: { backgroundColor: colors.bg },
  fab: {
    position: 'absolute', right: spacing.lg, flexDirection: 'row', alignItems: 'center', gap: 7,
    paddingHorizontal: 16, paddingVertical: 11, borderRadius: radius.pill, backgroundColor: colors.green,
    shadowColor: '#000', shadowOffset: { width: 0, height: 6 }, shadowOpacity: 0.4, shadowRadius: 14, elevation: 8,
  },
  fabText: { color: colors.bg, fontSize: 13, fontWeight: '900' },
});
