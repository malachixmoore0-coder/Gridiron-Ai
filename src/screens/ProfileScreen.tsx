/**
 * A profile — yours or someone else's.
 *
 * The privacy model is deliberately two switches rather than one, because they
 * answer different questions. "Show my record" is about the number; "show my
 * picks" is about the positions. Plenty of people will happily post a 61-49
 * line and never show you what they are on. A private account hides the picks
 * from everyone but accepted followers while the record can stay public — the
 * proof without the plays.
 */
import React, { useCallback, useEffect, useState } from 'react';
import { View, Text, ScrollView, TouchableOpacity, TextInput, StyleSheet, Switch, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { colors, numeric, radius, spacing, type as T } from '@/theme';
import { useSocial } from '@/social/SocialContext';
import { useEngagement } from '@/context/EngagementContext';
import { Avatar, PostCard, SignInRow } from '@/components/Social';
import type { Post, Profile } from '@/social/types';

interface Props { userId: string; onOpenProfile: (id: string) => void; onCompose: () => void; }

export function ProfileScreen({ userId, onOpenProfile, onCompose }: Props) {
  const s = useSocial();
  const eng = useEngagement();
  const isMe = !!s.me && (userId === s.me.id || userId === 'me');
  const [profile, setProfile] = useState<Profile | null>(isMe ? s.me : null);
  const [posts, setPosts] = useState<Post[]>([]);
  const [followed, setFollowed] = useState(false);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState({ displayName: '', handle: '', bio: '' });

  const load = useCallback(async () => {
    setLoading(true);
    const id = isMe ? s.me?.id : userId;
    if (!id) { setLoading(false); return; }
    const [p, ps, f] = await Promise.all([
      isMe ? Promise.resolve(s.me) : s.profileOf(id),
      s.postsOf(id),
      isMe ? Promise.resolve(false) : s.following(id),
    ]);
    setProfile(p ?? null);
    setPosts(ps);
    setFollowed(f);
    if (p) setDraft({ displayName: p.displayName, handle: p.handle, bio: p.bio });
    setLoading(false);
  }, [isMe, s, userId]);

  useEffect(() => { load(); }, [load]);

  // Your public record is your card's record — the same numbers, graded the
  // same way. Nothing separate to maintain and nothing to fake.
  const card = eng.summary;

  if (!s.signedIn && isMe) {
    return (
      <SafeAreaView edges={['top']} style={styles.safe}>
        <ScrollView contentContainerStyle={styles.body}>
          <Text style={styles.title}>Your profile</Text>
          <View style={styles.card}>
            <Text style={styles.blurb}>
              Sign in to claim a handle, write a bio, and put your card behind a name people can follow.
            </Text>
            <SignInRow onGoogle={() => s.signIn('google')} onApple={() => s.signIn('apple')} busy={s.busy} />
          </View>
        </ScrollView>
      </SafeAreaView>
    );
  }

  if (loading) {
    return <SafeAreaView edges={['top']} style={styles.safe}><ActivityIndicator color={colors.green} style={{ marginTop: 60 }} /></SafeAreaView>;
  }

  if (!profile) {
    return (
      <SafeAreaView edges={['top']} style={styles.safe}>
        <Text style={styles.title}>Not found</Text>
        <Text style={styles.blurb}>That account no longer exists.</Text>
      </SafeAreaView>
    );
  }

  const showRecord = isMe || profile.showRecord;
  const showPicks = isMe || (profile.showPicks && !profile.isPrivate) || followed;

  return (
    <SafeAreaView edges={['top']} style={styles.safe}>
      <ScrollView contentContainerStyle={styles.body}>
        <View style={styles.header}>
          <Avatar profile={profile} size={64} />
          <View style={{ flex: 1 }}>
            {editing ? (
              <>
                <TextInput style={styles.editName} value={draft.displayName} onChangeText={(v) => setDraft((d) => ({ ...d, displayName: v }))} placeholder="Display name" placeholderTextColor={colors.inkGhost} />
                <TextInput style={styles.editHandle} value={draft.handle} onChangeText={(v) => setDraft((d) => ({ ...d, handle: v.toLowerCase().replace(/[^a-z0-9_]/g, '') }))} placeholder="handle" placeholderTextColor={colors.inkGhost} autoCapitalize="none" />
              </>
            ) : (
              <>
                <Text style={styles.name}>{profile.displayName}</Text>
                <Text style={styles.handle}>@{profile.handle}{profile.isPrivate ? ' · private' : ''}</Text>
              </>
            )}
          </View>
          {isMe ? (
            <TouchableOpacity style={styles.edit} activeOpacity={0.85} onPress={() => (editing ? s.saveProfile(draft).then(() => { setEditing(false); load(); }) : setEditing(true))}>
              <Text style={styles.editText}>{editing ? 'Save' : 'Edit'}</Text>
            </TouchableOpacity>
          ) : (
            <TouchableOpacity
              style={[styles.follow, followed && styles.followOn]}
              activeOpacity={0.85}
              onPress={async () => { await s.follow(profile.id, !followed); setFollowed(!followed); }}
            >
              <Text style={[styles.followText, followed && { color: colors.bg }]}>{followed ? 'Following' : 'Follow'}</Text>
            </TouchableOpacity>
          )}
        </View>

        {editing ? (
          <TextInput
            style={styles.editBio}
            value={draft.bio}
            onChangeText={(v) => setDraft((d) => ({ ...d, bio: v.slice(0, 240) }))}
            placeholder="Bio — what do you bet, and how?"
            placeholderTextColor={colors.inkGhost}
            multiline
          />
        ) : !!profile.bio && <Text style={styles.bio}>{profile.bio}</Text>}

        <View style={styles.stats}>
          <Stat label="FOLLOWERS" value={`${profile.followers}`} />
          <Stat label="FOLLOWING" value={`${profile.following}`} />
          {showRecord && <Stat label="RECORD" value={isMe ? `${card.won}-${card.lost}` : profile.record ? `${profile.record.won}-${profile.record.lost}` : '—'} />}
          {showRecord && (
            <Stat
              label="UNITS"
              value={isMe ? `${card.units > 0 ? '+' : ''}${card.units.toFixed(1)}` : profile.record ? `${profile.record.units > 0 ? '+' : ''}${profile.record.units.toFixed(1)}` : '—'}
              tone={(isMe ? card.units : profile.record?.units ?? 0) > 0 ? colors.green : undefined}
            />
          )}
        </View>

        {isMe && (
          <View style={styles.privacy}>
            <Text style={styles.privacyTitle}>Who sees what</Text>
            <Row
              label="Private account"
              hint="Only accepted followers see your picks. Your record can still be public."
              value={profile.isPrivate}
              onChange={(v) => s.saveProfile({ isPrivate: v }).then(load)}
            />
            <Row
              label="Show my record"
              hint="The win/loss line and units on your profile."
              value={profile.showRecord}
              onChange={(v) => s.saveProfile({ showRecord: v }).then(load)}
            />
            <Row
              label="Show my picks"
              hint="The actual sides and numbers, not just the record."
              value={profile.showPicks}
              onChange={(v) => s.saveProfile({ showPicks: v }).then(load)}
            />
            <TouchableOpacity style={styles.sync} activeOpacity={0.85} onPress={() => s.saveProfile({ record: { won: card.won, lost: card.lost, push: card.push, units: card.units } })}>
              <Ionicons name="sync" size={14} color={colors.green} />
              <Text style={styles.syncText}>Publish my current card record ({card.won}-{card.lost})</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.signOut} activeOpacity={0.8} onPress={s.signOut}>
              <Text style={styles.signOutText}>Sign out</Text>
            </TouchableOpacity>
          </View>
        )}

        <View style={styles.postsHead}>
          <Text style={styles.postsTitle}>Posts</Text>
          {isMe && (
            <TouchableOpacity style={styles.newPost} activeOpacity={0.85} onPress={onCompose}>
              <Ionicons name="create-outline" size={14} color={colors.bg} />
              <Text style={styles.newPostText}>New</Text>
            </TouchableOpacity>
          )}
        </View>

        {!showPicks && (
          <View style={styles.locked}>
            <Ionicons name="lock-closed" size={16} color={colors.inkFaint} />
            <Text style={styles.lockedText}>
              This account is private. Follow {profile.displayName} to see their picks — the record above stays visible either way.
            </Text>
          </View>
        )}

        {showPicks && posts.map((p) => (
          <PostCard
            key={p.id}
            post={{ ...p, author: p.author ?? profile }}
            mine={isMe}
            onOpenProfile={onOpenProfile}
            onLike={(on) => s.like(p.id, on)}
            onTail={(on) => s.tail(p.id, on)}
            onDelete={isMe ? () => s.remove(p.id).then(load) : undefined}
          />
        ))}
        {showPicks && !posts.length && <Text style={styles.blurb}>No posts yet.</Text>}
      </ScrollView>
    </SafeAreaView>
  );
}

function Stat({ label, value, tone }: { label: string; value: string; tone?: string }) {
  return (
    <View style={{ flex: 1 }}>
      <Text style={styles.statLabel}>{label}</Text>
      <Text style={[styles.statValue, numeric, tone ? { color: tone } : null]}>{value}</Text>
    </View>
  );
}

function Row({ label, hint, value, onChange }: { label: string; hint: string; value: boolean; onChange: (v: boolean) => void }) {
  return (
    <View style={styles.row}>
      <View style={{ flex: 1 }}>
        <Text style={styles.rowLabel}>{label}</Text>
        <Text style={styles.rowHint}>{hint}</Text>
      </View>
      <Switch
        value={value}
        onValueChange={onChange}
        trackColor={{ true: colors.greenDim, false: colors.border }}
        thumbColor={value ? colors.green : colors.inkFaint}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  body: { padding: spacing.lg, paddingBottom: 40 },
  title: { ...T.title, color: colors.ink, fontSize: 24, marginBottom: spacing.md },
  blurb: { color: colors.inkDim, fontSize: 13, lineHeight: 19 },
  card: { backgroundColor: colors.card, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.borderHi, padding: spacing.lg, gap: spacing.md },

  header: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  name: { ...T.title, color: colors.ink, fontSize: 21 },
  handle: { color: colors.inkFaint, fontSize: 12, fontWeight: '700', marginTop: 1 },
  editName: { color: colors.ink, fontSize: 19, fontWeight: '800', borderBottomWidth: 1, borderBottomColor: colors.border, paddingVertical: 2 },
  editHandle: { color: colors.inkDim, fontSize: 13, borderBottomWidth: 1, borderBottomColor: colors.border, paddingVertical: 2, marginTop: 4 },
  edit: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: radius.pill, backgroundColor: colors.cardAlt, borderWidth: 1, borderColor: colors.border },
  editText: { color: colors.ink, fontSize: 12, fontWeight: '800' },
  follow: { paddingHorizontal: 16, paddingVertical: 9, borderRadius: radius.pill, borderWidth: 1, borderColor: colors.green },
  followOn: { backgroundColor: colors.green },
  followText: { color: colors.green, fontSize: 12, fontWeight: '900' },

  bio: { color: colors.inkDim, fontSize: 14, lineHeight: 20, marginTop: spacing.md },
  editBio: { color: colors.ink, fontSize: 14, lineHeight: 20, marginTop: spacing.md, backgroundColor: colors.card, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, padding: spacing.md, minHeight: 74, textAlignVertical: 'top' },

  stats: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.lg, padding: spacing.md, borderRadius: radius.lg, backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border },
  statLabel: { color: colors.inkFaint, fontSize: 8, fontWeight: '900', letterSpacing: 0.8 },
  statValue: { color: colors.ink, fontSize: 17, fontWeight: '900', marginTop: 3 },

  privacy: { marginTop: spacing.lg, padding: spacing.md, borderRadius: radius.lg, backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border },
  privacyTitle: { color: colors.ink, fontSize: 14, fontWeight: '900', marginBottom: spacing.sm },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, paddingVertical: 10, borderTopWidth: 1, borderTopColor: colors.divider },
  rowLabel: { color: colors.ink, fontSize: 13, fontWeight: '800' },
  rowHint: { color: colors.inkFaint, fontSize: 11, lineHeight: 15, marginTop: 2 },
  sync: { flexDirection: 'row', alignItems: 'center', gap: 7, marginTop: spacing.sm, paddingVertical: 10 },
  syncText: { color: colors.green, fontSize: 12, fontWeight: '800' },
  signOut: { paddingVertical: 8 },
  signOutText: { color: colors.inkGhost, fontSize: 12, fontWeight: '700' },

  postsHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: spacing.xl, marginBottom: spacing.md },
  postsTitle: { ...T.section, color: colors.ink, fontSize: 17 },
  newPost: { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 12, paddingVertical: 7, borderRadius: radius.pill, backgroundColor: colors.green },
  newPostText: { color: colors.bg, fontSize: 12, fontWeight: '900' },

  locked: { flexDirection: 'row', gap: spacing.sm, alignItems: 'flex-start', padding: spacing.md, borderRadius: radius.md, backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border },
  lockedText: { flex: 1, color: colors.inkFaint, fontSize: 12, lineHeight: 17 },
});
