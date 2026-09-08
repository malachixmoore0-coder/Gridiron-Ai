/**
 * The Social tab.
 *
 * A feed of picks with the model's numbers attached, which is the only thing
 * that makes a football timeline worth reading: you can see what someone took,
 * what the model thought of it, and tail it into your own card in one tap.
 */
import React, { useEffect, useMemo, useState } from 'react';
import { View, Text, ScrollView, TouchableOpacity, TextInput, StyleSheet, RefreshControl, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { colors, radius, spacing, type as T, clearance } from '@/theme';
import { useSocial } from '@/social/SocialContext';
import { useEngagement } from '@/context/EngagementContext';
import { useLeague } from '@/league/LeagueContext';
import { Avatar, PersonRow, PostCard, SignInRow } from '@/components/Social';
import { LeagueSwitch } from '@/components/LeagueSwitch';
import type { FeedScope, Profile } from '@/social/types';
import type { LeagueId } from '@/league/types';

interface Props {
  onCompose: () => void;
  onOpenProfile: (userId: string) => void;
  onOpenGame: (league: LeagueId, teamId: string, gameId: string) => void;
}

const SCOPES: { key: FeedScope; label: string }[] = [
  { key: 'everyone', label: 'Everyone' },
  { key: 'following', label: 'Following' },
  { key: 'picks', label: 'Picks only' },
];

export function SocialScreen({ onCompose, onOpenProfile, onOpenGame }: Props) {
  const s = useSocial();
  const eng = useEngagement();
  const { viewFor } = useLeague();
  const [query, setQuery] = useState('');
  const [found, setFound] = useState<Profile[] | null>(null);
  const [searching, setSearching] = useState(false);
  /** A handful of accounts to start from, so a new feed is not a dead end. */
  const [suggested, setSuggested] = useState<Profile[]>([]);

  useEffect(() => {
    let live = true;
    s.search('').then((all) => { if (live) setSuggested(all.slice(0, 3)); }).catch(() => {});
    return () => { live = false; };
  }, [s]);

  const runSearch = async (q: string) => {
    setQuery(q);
    if (!q.trim()) { setFound(null); return; }
    setSearching(true);
    try { setFound(await s.search(q)); } catch { setFound([]); }
    setSearching(false);
  };

  const tailInto = (postId: string, on: boolean) => {
    const post = s.feed.find((p) => p.id === postId);
    s.tail(postId, on);
    // Tailing is not a like — it puts the pick on your own card, graded the
    // same way as one you found yourself.
    if (on && post?.pick) {
      const k = post.pick;
      eng.savePick({
        gameId: k.gameId, awayId: k.awayId, homeId: k.homeId,
        market: k.market, side: k.side, number: k.number,
        modelPct: k.modelPct, edge: k.edge,
        label: `${k.label} · tailed @${post.author?.handle ?? ''}`.trim(),
      });
    }
  };

  const empty = useMemo(() => !s.feed.length, [s.feed]);

  return (
    <SafeAreaView edges={['top']} style={styles.safe}>
      <View style={styles.head}>
        <View style={{ flex: 1 }}>
          <Text style={styles.title}>Social</Text>
          <Text style={styles.sub}>{s.live ? 'Picks from people you follow' : 'On this device until sign-in is switched on'}</Text>
        </View>
        <TouchableOpacity style={styles.me} activeOpacity={0.85} onPress={() => onOpenProfile(s.me?.id ?? 'me')} accessibilityLabel="Your profile">
          <Avatar profile={s.me} size={32} />
        </TouchableOpacity>
      </View>
      <View style={styles.switchRow}><LeagueSwitch /></View>

      <View style={styles.searchRow}>
        <Ionicons name="search" size={15} color={colors.inkFaint} />
        <TextInput
          style={styles.search}
          value={query}
          onChangeText={runSearch}
          placeholder="Find people by name or @handle"
          placeholderTextColor={colors.inkGhost}
          autoCapitalize="none"
          autoCorrect={false}
        />
        {!!query && (
          <TouchableOpacity onPress={() => runSearch('')} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
            <Ionicons name="close-circle" size={16} color={colors.inkGhost} />
          </TouchableOpacity>
        )}
      </View>

      {found ? (
        <ScrollView contentContainerStyle={styles.body}>
          {searching && <ActivityIndicator color={colors.green} style={{ marginTop: spacing.lg }} />}
          {!searching && !found.length && <Text style={styles.empty}>Nobody by that name yet.</Text>}
          {found.map((p) => <PersonRow key={p.id} profile={p} onPress={() => onOpenProfile(p.id)} />)}
        </ScrollView>
      ) : (
        <>
          <View style={styles.scopes}>
            {SCOPES.map((sc) => (
              <TouchableOpacity
                key={sc.key}
                style={[styles.scope, s.scope === sc.key && styles.scopeOn]}
                activeOpacity={0.85}
                onPress={() => s.setScope(sc.key)}
                accessibilityRole="tab"
                accessibilityState={{ selected: s.scope === sc.key }}
              >
                <Text style={[styles.scopeText, s.scope === sc.key && styles.scopeTextOn]}>{sc.label}</Text>
              </TouchableOpacity>
            ))}
          </View>

          <ScrollView
            contentContainerStyle={styles.body}
            refreshControl={<RefreshControl refreshing={false} onRefresh={s.refreshFeed} tintColor={colors.green} />}
          >
            {!s.signedIn && (
              <View style={styles.signCard}>
                <Text style={styles.signTitle}>Bring your card with you</Text>
                <Text style={styles.signBlurb}>
                  Sign in to post, follow people and tail their picks. Your record follows your account, and you decide
                  what any of it shows publicly.
                </Text>
                <SignInRow onGoogle={() => s.signIn('google')} onApple={() => s.signIn('apple')} busy={s.busy} />
                {!s.live && (
                  <Text style={styles.signNote}>
                    Sign-in providers are not connected yet, so this creates a profile on this device only. Nothing you
                    post here leaves the phone.
                  </Text>
                )}
              </View>
            )}

            {!!suggested.length && (
              <View style={styles.suggest}>
                <Text style={styles.suggestTitle}>Who to follow</Text>
                {suggested.map((p) => <PersonRow key={p.id} profile={p} onPress={() => onOpenProfile(p.id)} />)}
              </View>
            )}

            {empty && s.ready && <Text style={styles.empty}>Nothing here yet. Be the first to post a pick.</Text>}

            {s.feed.map((p) => (
              <PostCard
                key={p.id}
                post={p}
                mine={p.authorId === s.me?.id}
                onOpenProfile={onOpenProfile}
                onLike={(on) => s.like(p.id, on)}
                onTail={(on) => tailInto(p.id, on)}
                onDelete={() => s.remove(p.id)}
                onOpenPick={p.pick ? () => {
                  const league = p.pick!.league;
                  const view = viewFor(league);
                  const home = p.pick!.homeId;
                  if (view.hasTeam(home)) onOpenGame(league, home, p.pick!.gameId);
                } : undefined}
              />
            ))}
            <View style={{ height: 80 }} />
          </ScrollView>
        </>
      )}

      <TouchableOpacity style={styles.fab} activeOpacity={0.88} onPress={onCompose} accessibilityLabel="New post">
        <Ionicons name="create" size={20} color={colors.bg} />
      </TouchableOpacity>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  head: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingHorizontal: spacing.lg, paddingBottom: spacing.sm },
  switchRow: { paddingHorizontal: spacing.lg, paddingBottom: spacing.sm },
  title: { ...T.title, color: colors.ink, fontSize: 24 },
  sub: { color: colors.inkFaint, fontSize: 11, fontWeight: '700', marginTop: 1 },
  me: { marginLeft: 2 },

  searchRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginHorizontal: spacing.lg, paddingHorizontal: spacing.md, paddingVertical: 9, borderRadius: radius.pill, backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border },
  search: { flex: 1, color: colors.ink, fontSize: 13, padding: 0 },

  scopes: { flexDirection: 'row', gap: spacing.sm, paddingHorizontal: spacing.lg, paddingTop: spacing.md },
  scope: { paddingHorizontal: 14, paddingVertical: 7, borderRadius: radius.pill, backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border },
  scopeOn: { backgroundColor: colors.cardAlt, borderColor: colors.green },
  scopeText: { color: colors.inkFaint, fontSize: 12, fontWeight: '800' },
  scopeTextOn: { color: colors.green },

  body: { padding: spacing.lg, paddingBottom: clearance.dock },
  empty: { color: colors.inkFaint, fontSize: 13, textAlign: 'center', marginTop: spacing.xl, lineHeight: 19 },

  signCard: { backgroundColor: colors.card, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.borderHi, padding: spacing.lg, marginBottom: spacing.lg, gap: spacing.sm },
  signTitle: { ...T.section, color: colors.ink, fontSize: 17 },
  signBlurb: { color: colors.inkDim, fontSize: 13, lineHeight: 19 },
  signNote: { color: colors.inkGhost, fontSize: 11, lineHeight: 16, marginTop: 2 },

  suggest: { marginBottom: spacing.lg },
  suggestTitle: { ...T.section, color: colors.ink, fontSize: 15, marginBottom: spacing.sm },

  fab: { position: 'absolute', right: spacing.lg, bottom: spacing.lg, width: 52, height: 52, borderRadius: 26, backgroundColor: colors.green, alignItems: 'center', justifyContent: 'center' },
});
