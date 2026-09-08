/**
 * A profile — yours or someone else's.
 *
 * This is the page a link points at, so it has to answer, above the fold and to
 * a stranger, the only question anyone opens a handicapper's profile to ask:
 * are they any good. That is why the record strip sits directly under the name
 * rather than below the posts, and why the first tab is Picks rather than a
 * timeline. A betting profile whose front page is chat is a chat profile.
 *
 * The privacy model is deliberately two switches rather than one, because they
 * answer different questions. "Show my record" is about the number; "show my
 * picks" is about the positions. Plenty of people will happily post a 61-49
 * line and never show you what they are on. A private account hides the picks
 * from everyone but accepted followers while the record can stay public — the
 * proof without the plays.
 */
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { View, Text, ScrollView, TouchableOpacity, TextInput, StyleSheet, Switch, ActivityIndicator, Image, Platform, Share } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { colors, numeric, radius, spacing, type as T, clearance } from '@/theme';
import { useSocial } from '@/social/SocialContext';
import { useEngagement } from '@/context/EngagementContext';
import { Avatar, PostCard, SignInRow } from '@/components/Social';
import { AVATAR_SPEC, BANNER_SPEC, PickError, pickImage } from '@/utils/imagePicker';
import { copyLink, profileUrl } from '@/social/links';
import { haptic } from '@/utils/haptics';
import type { Post, Profile } from '@/social/types';

interface Props {
  userId: string;
  onOpenProfile: (id: string) => void;
  onCompose: () => void;
  /** Open the follower or following list for an account. */
  onOpenPeople: (userId: string, tab: 'followers' | 'following', name: string) => void;
  /** Reports the handle back up so the address bar can show /@handle. */
  onResolved?: (handle: string) => void;
}

type Tab = 'picks' | 'posts' | 'record';

const TABS: { key: Tab; label: string }[] = [
  { key: 'picks', label: 'Picks' },
  { key: 'posts', label: 'Posts' },
  { key: 'record', label: 'Record' },
];

/** 1,240 → 1.2K. Counts are glanced at, not read. */
const compact = (n: number) =>
  n >= 1_000_000 ? `${(n / 1_000_000).toFixed(1).replace(/\.0$/, '')}M`
  : n >= 1_000 ? `${(n / 1_000).toFixed(1).replace(/\.0$/, '')}K`
  : `${n}`;

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const joined = (ts: number) => {
  const d = new Date(ts);
  return `Joined ${MONTHS[d.getMonth()]} ${d.getFullYear()}`;
};

const rateOf = (won: number, lost: number) => (won + lost > 0 ? (won / (won + lost)) * 100 : null);

export function ProfileScreen({ userId, onOpenProfile, onCompose, onOpenPeople, onResolved }: Props) {
  const s = useSocial();
  const eng = useEngagement();
  /**
   * The header avatar and Settings both open "your" profile, and they do it
   * whether or not you have signed in yet — so self is decided by the sentinel
   * id, never by whether a profile record happens to exist. Deciding it the
   * other way is what made your own avatar open a screen reading "That account
   * no longer exists."
   */
  const isMe = !userId || userId === 'me' || userId === s.me?.id;
  const [profile, setProfile] = useState<Profile | null>(isMe ? s.me : null);
  const [posts, setPosts] = useState<Post[]>([]);
  const [followed, setFollowed] = useState(false);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(false);
  const [tab, setTab] = useState<Tab>('picks');
  /** Picks lead, unless there are none — an empty first tab reads as a dead account. */
  const [tabPicked, setTabPicked] = useState(false);
  const [copied, setCopied] = useState(false);
  const [draft, setDraft] = useState({ displayName: '', handle: '', bio: '' });
  /** Which picture is being chosen right now, and what went wrong last time. */
  const [picking, setPicking] = useState<'avatar' | 'banner' | null>(null);
  const [pickError, setPickError] = useState<string | null>(null);

  /**
   * Choosing a picture saves immediately rather than waiting for Save. Editing
   * text and choosing an image are different gestures — one is a draft, the
   * other is a decision — and making the photo sit in limbo until you also
   * press Save is how people end up losing it.
   */
  const choose = useCallback(async (which: 'avatar' | 'banner') => {
    if (picking) return;
    setPicking(which);
    setPickError(null);
    haptic('light');
    try {
      const res = await pickImage(which === 'avatar' ? AVATAR_SPEC : BANNER_SPEC);
      if (!res) return;
      await s.saveProfile(which === 'avatar' ? { avatarUrl: res.uri } : { bannerUrl: res.uri });
      haptic('success');
      await load();
    } catch (e) {
      setPickError(e instanceof PickError ? e.message : 'That image could not be used.');
    } finally {
      setPicking(null);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [picking, s]);

  const clearImage = useCallback(async (which: 'avatar' | 'banner') => {
    haptic('select');
    await s.saveProfile(which === 'avatar' ? { avatarUrl: null } : { bannerUrl: null });
    await load();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [s]);

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
    setTabPicked((already) => {
      if (!already && !ps.some((x) => x.pick) && ps.length) setTab('posts');
      return true;
    });
    setLoading(false);
  }, [isMe, s, userId]);

  useEffect(() => { load(); }, [load]);

  // The address bar follows the account, not the screen: once the profile is
  // known, this page has a name somebody can send to somebody else.
  useEffect(() => { if (profile?.handle) onResolved?.(profile.handle); }, [profile?.handle, onResolved]);

  // Your public record is your card's record — the same numbers, graded the
  // same way. Nothing separate to maintain and nothing to fake.
  const card = eng.summary;

  const share = useCallback(async () => {
    if (!profile) return;
    const url = profileUrl(profile.handle);
    haptic('light');
    if (Platform.OS === 'web') {
      const ok = await copyLink(url);
      if (ok) { setCopied(true); setTimeout(() => setCopied(false), 2200); }
      return;
    }
    try { await Share.share({ message: url, url }); } catch { /* dismissed */ }
  }, [profile]);

  const picksOnly = useMemo(() => posts.filter((p) => !!p.pick), [posts]);

  if (isMe && (!s.signedIn || (!loading && !profile))) {
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
        <ScrollView contentContainerStyle={styles.body}>
          <Text style={styles.title}>Not found</Text>
          <Text style={styles.blurb}>
            There is no account at that address. Handles can change — try searching for them on the Social tab.
          </Text>
        </ScrollView>
      </SafeAreaView>
    );
  }

  const showRecord = isMe || profile.showRecord;
  const showPicks = isMe || (profile.showPicks && !profile.isPrivate) || followed;

  /** One shape for both cases, so the strip does not branch four times. */
  const stats = isMe
    ? { won: card.won, lost: card.lost, push: card.push, units: card.units, hitRate: card.hitRate, open: card.open as number | null }
    : profile.record
      ? { ...profile.record, hitRate: rateOf(profile.record.won, profile.record.lost), open: null }
      : null;

  const shown = tab === 'picks' ? picksOnly : posts;

  return (
    <SafeAreaView edges={['top']} style={styles.safe}>
      <ScrollView contentContainerStyle={styles.body}>
        {/* The banner is the one place on the profile with room to be personal,
            so it is offered even when empty — an inviting empty state beats a
            hidden feature nobody finds. */}
        <View style={styles.bannerWrap}>
          {profile.bannerUrl ? (
            <Image source={{ uri: profile.bannerUrl }} style={styles.banner} resizeMode="cover" />
          ) : (
            // No banner is not the same as nothing there. A band in the
            // account's own avatar colour gives the page a top edge and a
            // little identity, where an empty box just reads as broken.
            <View style={[styles.banner, styles.bannerEmpty, { backgroundColor: profile.avatarColor }]}>
              <View style={styles.bannerVeil} />
              {isMe && (
                <>
                  <Ionicons name="image-outline" size={18} color={colors.ink} />
                  <Text style={styles.bannerHint}>Add a banner</Text>
                </>
              )}
            </View>
          )}
          {isMe && (
            <View style={styles.bannerActions}>
              <TouchableOpacity
                style={styles.imgBtn}
                activeOpacity={0.85}
                onPress={() => choose('banner')}
                disabled={picking === 'banner'}
                accessibilityRole="button"
                accessibilityLabel={profile.bannerUrl ? 'Change your banner photo' : 'Add a banner photo'}
              >
                {picking === 'banner'
                  ? <ActivityIndicator size="small" color={colors.ink} />
                  : <Ionicons name="camera" size={14} color={colors.ink} />}
                <Text style={styles.imgBtnText}>{profile.bannerUrl ? 'Change' : 'Add'}</Text>
              </TouchableOpacity>
              {!!profile.bannerUrl && (
                <TouchableOpacity style={styles.imgBtn} activeOpacity={0.85} onPress={() => clearImage('banner')} accessibilityRole="button" accessibilityLabel="Remove your banner photo">
                  <Ionicons name="trash-outline" size={14} color={colors.ink} />
                </TouchableOpacity>
              )}
            </View>
          )}
        </View>

        {/* Avatar overlapping the banner, actions on the same line to its right:
            the layout every profile on a phone has trained people to read. */}
        <View style={styles.identityRow}>
          <View style={styles.avatarWrap}>
            <Avatar profile={profile} size={72} />
            {isMe && (
              <TouchableOpacity
                style={styles.avatarEdit}
                activeOpacity={0.85}
                onPress={() => choose('avatar')}
                disabled={picking === 'avatar'}
                accessibilityRole="button"
                accessibilityLabel={profile.avatarUrl ? 'Change your profile picture' : 'Add a profile picture'}
              >
                {picking === 'avatar'
                  ? <ActivityIndicator size="small" color={colors.bg} />
                  : <Ionicons name="camera" size={13} color={colors.bg} />}
              </TouchableOpacity>
            )}
          </View>

          <View style={styles.actions}>
            <TouchableOpacity
              style={styles.ghostBtn}
              activeOpacity={0.85}
              onPress={share}
              accessibilityRole="button"
              accessibilityLabel={`Share a link to @${profile.handle}`}
            >
              <Ionicons name={copied ? 'checkmark' : 'link-outline'} size={15} color={copied ? colors.green : colors.ink} />
              {copied && <Text style={styles.copiedText}>Copied</Text>}
            </TouchableOpacity>
            {isMe ? (
              <TouchableOpacity
                style={styles.ghostBtnWide}
                activeOpacity={0.85}
                onPress={() => (editing ? s.saveProfile(draft).then(() => { setEditing(false); load(); }) : setEditing(true))}
              >
                <Text style={styles.ghostText}>{editing ? 'Save' : 'Edit profile'}</Text>
              </TouchableOpacity>
            ) : (
              <TouchableOpacity
                style={[styles.follow, followed && styles.followOn]}
                activeOpacity={0.85}
                onPress={async () => { haptic('light'); await s.follow(profile.id, !followed); setFollowed(!followed); load(); }}
              >
                <Text style={[styles.followText, followed && { color: colors.bg }]}>{followed ? 'Following' : 'Follow'}</Text>
              </TouchableOpacity>
            )}
          </View>
        </View>

        {!!pickError && <Text style={styles.pickError}>{pickError}</Text>}

        <View style={styles.identity}>
          {editing ? (
            <>
              <TextInput style={styles.editName} value={draft.displayName} onChangeText={(v) => setDraft((d) => ({ ...d, displayName: v }))} placeholder="Display name" placeholderTextColor={colors.inkGhost} />
              <TextInput style={styles.editHandle} value={draft.handle} onChangeText={(v) => setDraft((d) => ({ ...d, handle: v.toLowerCase().replace(/[^a-z0-9_]/g, '') }))} placeholder="handle" placeholderTextColor={colors.inkGhost} autoCapitalize="none" />
            </>
          ) : (
            <>
              <Text style={styles.name}>{profile.displayName}</Text>
              <View style={styles.handleRow}>
                <Text style={styles.handle}>@{profile.handle}</Text>
                {profile.isPrivate && (
                  <View style={styles.privateTag}>
                    <Ionicons name="lock-closed" size={9} color={colors.inkDim} />
                    <Text style={styles.privateTagText}>Private</Text>
                  </View>
                )}
              </View>
            </>
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

        {editing && !!profile.avatarUrl && (
          <TouchableOpacity style={styles.removePhoto} activeOpacity={0.85} onPress={() => clearImage('avatar')} accessibilityRole="button">
            <Ionicons name="trash-outline" size={13} color={colors.inkDim} />
            <Text style={styles.removePhotoText}>Remove profile picture</Text>
          </TouchableOpacity>
        )}

        <Text style={styles.joined}>{joined(profile.createdAt)}</Text>

        {/* Counts read as a sentence and open the lists, the way they do
            everywhere else — a follower count you cannot tap is a decoration. */}
        <View style={styles.counts}>
          <TouchableOpacity
            style={styles.countBtn}
            activeOpacity={0.7}
            onPress={() => onOpenPeople(profile.id, 'following', profile.displayName)}
            accessibilityRole="button"
            accessibilityLabel={`${profile.following} following`}
          >
            <Text style={[styles.countNum, numeric]}>{compact(profile.following)}</Text>
            <Text style={styles.countLabel}>Following</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.countBtn}
            activeOpacity={0.7}
            onPress={() => onOpenPeople(profile.id, 'followers', profile.displayName)}
            accessibilityRole="button"
            accessibilityLabel={`${profile.followers} followers`}
          >
            <Text style={[styles.countNum, numeric]}>{compact(profile.followers)}</Text>
            <Text style={styles.countLabel}>Follower{profile.followers === 1 ? '' : 's'}</Text>
          </TouchableOpacity>
        </View>

        {/* The answer to why anyone opened this page. */}
        {showRecord && (
          <View style={styles.strip}>
            <Stat label="RECORD" value={stats ? `${stats.won}-${stats.lost}${stats.push ? `-${stats.push}` : ''}` : '—'} />
            <Stat label="HIT RATE" value={stats?.hitRate != null ? `${stats.hitRate.toFixed(0)}%` : '—'} tone={stats?.hitRate != null && stats.hitRate >= 52.4 ? colors.green : undefined} />
            <Stat
              label="UNITS"
              value={stats ? `${stats.units > 0 ? '+' : ''}${stats.units.toFixed(1)}` : '—'}
              tone={stats && stats.units > 0 ? colors.green : stats && stats.units < 0 ? colors.negative : undefined}
            />
            <Stat label="OPEN" value={stats?.open != null ? `${stats.open}` : '—'} />
          </View>
        )}
        {showRecord && !stats && (
          <Text style={styles.stripNote}>
            {isMe ? 'Grade a few picks and this fills in.' : 'This account has not published a record yet.'}
          </Text>
        )}
        {!showRecord && (
          <Text style={styles.stripNote}>{profile.displayName} keeps their record private.</Text>
        )}

        <View style={styles.tabs}>
          {TABS.map((t) => (
            <TouchableOpacity
              key={t.key}
              style={[styles.tab, tab === t.key && styles.tabOn]}
              activeOpacity={0.8}
              onPress={() => { haptic('select'); setTab(t.key); }}
              accessibilityRole="tab"
              accessibilityState={{ selected: tab === t.key }}
            >
              <Text style={[styles.tabText, tab === t.key && styles.tabTextOn]}>
                {t.label}
                {t.key === 'picks' && picksOnly.length ? ` ${picksOnly.length}` : ''}
                {t.key === 'posts' && posts.length ? ` ${posts.length}` : ''}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        {tab === 'record' ? (
          <RecordTab isMe={isMe} profile={profile} stats={stats} card={card} onSync={() => s.saveProfile({ record: { won: card.won, lost: card.lost, push: card.push, units: card.units } })} onChange={(patch) => s.saveProfile(patch).then(load)} onSignOut={s.signOut} showRecord={showRecord} />
        ) : !showPicks ? (
          <View style={styles.locked}>
            <Ionicons name="lock-closed" size={16} color={colors.inkFaint} />
            <Text style={styles.lockedText}>
              This account is private. Follow {profile.displayName} to see their picks — the record above stays visible either way.
            </Text>
          </View>
        ) : (
          <>
            {isMe && (
              <TouchableOpacity style={styles.newPost} activeOpacity={0.85} onPress={onCompose}>
                <Ionicons name="create-outline" size={15} color={colors.bg} />
                <Text style={styles.newPostText}>{tab === 'picks' ? 'Post a pick' : 'New post'}</Text>
              </TouchableOpacity>
            )}
            {shown.map((p) => (
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
            {!shown.length && (
              <Text style={styles.blurb}>
                {tab === 'picks'
                  ? (isMe ? 'No picks posted yet. Share one from your card and it lands here with its numbers attached.' : `${profile.displayName} has not posted a pick yet.`)
                  : (isMe ? 'No posts yet.' : `${profile.displayName} has not posted yet.`)}
              </Text>
            )}
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

/**
 * The Record tab: the breakdown behind the strip, and — for your own profile —
 * the switches that decide how much of it anyone else gets to see.
 */
function RecordTab({
  isMe, profile, stats, card, onSync, onChange, onSignOut, showRecord,
}: {
  isMe: boolean;
  profile: Profile;
  stats: { won: number; lost: number; push: number; units: number; hitRate: number | null; open: number | null } | null;
  card: { won: number; lost: number; push: number; graded: number; units: number; hitRate: number | null; open: number };
  onSync: () => void;
  onChange: (patch: Partial<Profile>) => void;
  onSignOut: () => void;
  showRecord: boolean;
}) {
  const published = profile.record;
  const drifted = isMe && published && (published.won !== card.won || published.lost !== card.lost);

  return (
    <View style={{ gap: spacing.md }}>
      {showRecord && stats && (
        <View style={styles.panel}>
          <Line label="Graded" value={`${stats.won + stats.lost + stats.push}`} />
          <Line label="Won" value={`${stats.won}`} tone={colors.green} />
          <Line label="Lost" value={`${stats.lost}`} tone={colors.negative} />
          {!!stats.push && <Line label="Push" value={`${stats.push}`} />}
          <Line
            label="Break-even is 52.4%"
            value={stats.hitRate != null ? `${stats.hitRate.toFixed(1)}%` : '—'}
            tone={stats.hitRate != null && stats.hitRate >= 52.4 ? colors.green : colors.inkDim}
          />
        </View>
      )}

      {!isMe && !showRecord && (
        <Text style={styles.blurb}>Nothing to show — this account keeps its record private.</Text>
      )}

      {isMe && (
        <>
          <View style={styles.panel}>
            <Text style={styles.panelTitle}>Who sees what</Text>
            <Row
              label="Private account"
              hint="Only accepted followers see your picks. Your record can still be public."
              value={profile.isPrivate}
              onChange={(v) => onChange({ isPrivate: v })}
            />
            <Row
              label="Show my record"
              hint="The win/loss line, hit rate and units on your profile."
              value={profile.showRecord}
              onChange={(v) => onChange({ showRecord: v })}
            />
            <Row
              label="Show my picks"
              hint="The actual sides and numbers, not just the record."
              value={profile.showPicks}
              onChange={(v) => onChange({ showPicks: v })}
            />
          </View>

          <TouchableOpacity style={[styles.sync, drifted && styles.syncOn]} activeOpacity={0.85} onPress={onSync}>
            <Ionicons name="sync" size={14} color={drifted ? colors.bg : colors.green} />
            <Text style={[styles.syncText, drifted && { color: colors.bg }]}>
              {published
                ? `Update your published record (${published.won}-${published.lost} → ${card.won}-${card.lost})`
                : `Publish your card record (${card.won}-${card.lost})`}
            </Text>
          </TouchableOpacity>
          <Text style={styles.syncHint}>
            Your public record is a snapshot you publish, not a live feed — so a bad week never rewrites itself behind
            your back, and a good one is yours to post.
          </Text>

          <TouchableOpacity style={styles.signOut} activeOpacity={0.8} onPress={onSignOut}>
            <Text style={styles.signOutText}>Sign out</Text>
          </TouchableOpacity>
        </>
      )}
    </View>
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

function Line({ label, value, tone }: { label: string; value: string; tone?: string }) {
  return (
    <View style={styles.line}>
      <Text style={styles.lineLabel}>{label}</Text>
      <Text style={[styles.lineValue, numeric, tone ? { color: tone } : null]}>{value}</Text>
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
  body: { padding: spacing.lg, paddingBottom: clearance.overlay },
  title: { ...T.title, color: colors.ink, fontSize: 24, marginBottom: spacing.md },
  blurb: { color: colors.inkDim, fontSize: 13, lineHeight: 19 },
  card: { backgroundColor: colors.card, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.borderHi, padding: spacing.lg, gap: spacing.md },

  bannerWrap: { marginHorizontal: -spacing.lg, marginTop: -spacing.lg },
  banner: { width: '100%', aspectRatio: 3.6, backgroundColor: colors.card },
  bannerEmpty: { alignItems: 'center', justifyContent: 'center', gap: 5 },
  bannerVeil: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(5,8,12,0.62)' },
  bannerHint: { color: colors.ink, fontSize: 11, fontWeight: '700' },
  bannerActions: { position: 'absolute', right: spacing.md, bottom: spacing.sm, flexDirection: 'row', gap: 6 },
  imgBtn: { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 10, paddingVertical: 6, borderRadius: radius.pill, backgroundColor: 'rgba(5,8,12,0.72)', borderWidth: 1, borderColor: colors.border },
  imgBtnText: { color: colors.ink, fontSize: 11, fontWeight: '800' },

  identityRow: { flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between', marginTop: -34 },
  avatarWrap: { borderWidth: 3, borderColor: colors.bg, borderRadius: 42 },
  avatarEdit: { position: 'absolute', right: -2, bottom: -2, width: 26, height: 26, borderRadius: 13, backgroundColor: colors.green, alignItems: 'center', justifyContent: 'center', borderWidth: 2, borderColor: colors.bg },
  actions: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingBottom: 2 },
  ghostBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 11, paddingVertical: 8, borderRadius: radius.pill, backgroundColor: colors.cardAlt, borderWidth: 1, borderColor: colors.border },
  ghostBtnWide: { paddingHorizontal: 16, paddingVertical: 9, borderRadius: radius.pill, backgroundColor: colors.cardAlt, borderWidth: 1, borderColor: colors.border },
  ghostText: { color: colors.ink, fontSize: 12.5, fontWeight: '800' },
  copiedText: { color: colors.green, fontSize: 11.5, fontWeight: '800' },
  follow: { paddingHorizontal: 20, paddingVertical: 9, borderRadius: radius.pill, borderWidth: 1, borderColor: colors.green },
  followOn: { backgroundColor: colors.green },
  followText: { color: colors.green, fontSize: 12.5, fontWeight: '900' },

  pickError: { color: colors.negative, fontSize: 11.5, lineHeight: 16, marginTop: spacing.sm },
  removePhoto: { flexDirection: 'row', alignItems: 'center', gap: 6, alignSelf: 'flex-start', marginTop: spacing.sm, paddingVertical: 6 },
  removePhotoText: { color: colors.inkDim, fontSize: 11.5, fontWeight: '700' },

  identity: { marginTop: spacing.md },
  name: { ...T.title, color: colors.ink, fontSize: 22 },
  handleRow: { flexDirection: 'row', alignItems: 'center', gap: 7, marginTop: 2 },
  handle: { color: colors.inkFaint, fontSize: 13, fontWeight: '700' },
  privateTag: { flexDirection: 'row', alignItems: 'center', gap: 3, paddingHorizontal: 6, paddingVertical: 2, borderRadius: radius.sm, backgroundColor: colors.cardAlt },
  privateTagText: { color: colors.inkDim, fontSize: 9.5, fontWeight: '800' },
  editName: { color: colors.ink, fontSize: 19, fontWeight: '800', borderBottomWidth: 1, borderBottomColor: colors.border, paddingVertical: 2 },
  editHandle: { color: colors.inkDim, fontSize: 13, borderBottomWidth: 1, borderBottomColor: colors.border, paddingVertical: 2, marginTop: 4 },

  bio: { color: colors.inkDim, fontSize: 14, lineHeight: 20, marginTop: spacing.sm },
  editBio: { color: colors.ink, fontSize: 14, lineHeight: 20, marginTop: spacing.md, backgroundColor: colors.card, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, padding: spacing.md, minHeight: 74, textAlignVertical: 'top' },
  joined: { color: colors.inkGhost, fontSize: 12, fontWeight: '700', marginTop: spacing.sm },

  counts: { flexDirection: 'row', gap: spacing.lg, marginTop: spacing.sm },
  countBtn: { flexDirection: 'row', alignItems: 'baseline', gap: 5, paddingVertical: 6 },
  countNum: { color: colors.ink, fontSize: 14, fontWeight: '900' },
  countLabel: { color: colors.inkFaint, fontSize: 12.5, fontWeight: '700' },

  strip: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.md, padding: spacing.md, borderRadius: radius.lg, backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border },
  stripNote: { color: colors.inkGhost, fontSize: 11.5, lineHeight: 16, marginTop: spacing.sm },
  statLabel: { color: colors.inkFaint, fontSize: 8, fontWeight: '900', letterSpacing: 0.8 },
  statValue: { color: colors.ink, fontSize: 17, fontWeight: '900', marginTop: 3 },

  tabs: { flexDirection: 'row', gap: spacing.xs, marginTop: spacing.lg, marginBottom: spacing.md, borderBottomWidth: 1, borderBottomColor: colors.divider },
  tab: { flex: 1, alignItems: 'center', paddingVertical: 11, borderBottomWidth: 2, borderBottomColor: 'transparent' },
  tabOn: { borderBottomColor: colors.green },
  tabText: { color: colors.inkFaint, fontSize: 13, fontWeight: '800' },
  tabTextOn: { color: colors.ink },

  panel: { padding: spacing.md, borderRadius: radius.lg, backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border },
  panelTitle: { color: colors.ink, fontSize: 14, fontWeight: '900', marginBottom: spacing.xs },
  line: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 8, borderTopWidth: 1, borderTopColor: colors.divider },
  lineLabel: { color: colors.inkDim, fontSize: 12.5, fontWeight: '700' },
  lineValue: { color: colors.ink, fontSize: 14, fontWeight: '900' },

  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, paddingVertical: 10, borderTopWidth: 1, borderTopColor: colors.divider },
  rowLabel: { color: colors.ink, fontSize: 13, fontWeight: '800' },
  rowHint: { color: colors.inkFaint, fontSize: 11, lineHeight: 15, marginTop: 2 },

  sync: { flexDirection: 'row', alignItems: 'center', gap: 7, paddingHorizontal: spacing.md, paddingVertical: 11, borderRadius: radius.pill, borderWidth: 1, borderColor: colors.green },
  syncOn: { backgroundColor: colors.green },
  syncText: { flex: 1, color: colors.green, fontSize: 12, fontWeight: '800' },
  syncHint: { color: colors.inkGhost, fontSize: 11, lineHeight: 16 },
  signOut: { paddingVertical: 10 },
  signOutText: { color: colors.inkGhost, fontSize: 12, fontWeight: '700' },

  newPost: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 11, borderRadius: radius.pill, backgroundColor: colors.green, marginBottom: spacing.md },
  newPostText: { color: colors.bg, fontSize: 13, fontWeight: '900' },

  locked: { flexDirection: 'row', gap: spacing.sm, alignItems: 'flex-start', padding: spacing.md, borderRadius: radius.md, backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border },
  lockedText: { flex: 1, color: colors.inkFaint, fontSize: 12, lineHeight: 17 },
});
