/**
 * Shared furniture for the social layer: avatars, a post card, and the sign-in
 * row. The post card is the important one — it is the unit that travels, so it
 * has to carry the model's numbers, the tail button, and nothing else.
 */
import React, { useState } from 'react';
import { View, Text, Image, TouchableOpacity, StyleSheet, Modal } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors, numeric, radius, spacing } from '@/theme';
import type { Post, Profile } from '@/social/types';
import { REPORT_REASONS } from '@/social/moderation';
import { useSocial } from '@/social/SocialContext';
import { LEAGUE_BY_KEY } from '@/sports/types';

export function Avatar({ profile, size = 40, onPress }: { profile?: Profile | null; size?: number; onPress?: () => void }) {
  const initials = (profile?.displayName || profile?.handle || '?')
    .split(/\s+/).slice(0, 2).map((w) => w[0]).join('').toUpperCase();
  const body = profile?.avatarUrl ? (
    <Image source={{ uri: profile.avatarUrl }} style={{ width: size, height: size, borderRadius: size / 2 }} />
  ) : (
    <View style={[styles.avatar, { width: size, height: size, borderRadius: size / 2, backgroundColor: profile?.avatarColor ?? colors.cardAlt }]}>
      <Text style={[styles.avatarText, { fontSize: size * 0.36 }]}>{initials}</Text>
    </View>
  );
  return onPress ? <TouchableOpacity activeOpacity={0.8} onPress={onPress} accessibilityRole="button">{body}</TouchableOpacity> : body;
}

/**
 * One person in a list — search results, followers, following, who-to-follow.
 *
 * They all want the same three things (who, their record, a way in), and a list
 * that looks different depending on which screen you reached it from is a list
 * people have to re-learn each time.
 */
export function PersonRow({ profile, onPress, right }: { profile: Profile; onPress: () => void; right?: React.ReactNode }) {
  const rec = profile.showRecord ? profile.record : null;
  return (
    <TouchableOpacity
      style={styles.person}
      activeOpacity={0.85}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`${profile.displayName}, @${profile.handle}`}
    >
      <Avatar profile={profile} size={42} />
      <View style={{ flex: 1 }}>
        <Text style={styles.personName} numberOfLines={1}>{profile.displayName}</Text>
        <Text style={styles.personHandle} numberOfLines={1}>
          @{profile.handle}
          {rec && rec.won + rec.lost > 0 ? ` · ${rec.won}-${rec.lost}` : ''}
          {` · ${profile.followers} follower${profile.followers === 1 ? '' : 's'}`}
        </Text>
        {!!profile.bio && <Text style={styles.personBio} numberOfLines={1}>{profile.bio}</Text>}
      </View>
      {right ?? <Ionicons name="chevron-forward" size={15} color={colors.inkGhost} />}
    </TouchableOpacity>
  );
}

const ago = (ts: number) => {
  const m = Math.max(0, Math.round((Date.now() - ts) / 60000));
  if (m < 1) return 'now';
  if (m < 60) return `${m}m`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h}h`;
  return `${Math.round(h / 24)}d`;
};

interface PostCardProps {
  post: Post;
  onOpenProfile: (userId: string) => void;
  onLike: (on: boolean) => void;
  onTail: (on: boolean) => void;
  onOpenPick?: () => void;
  onDelete?: () => void;
  mine?: boolean;
}

export function PostCard({ post, onOpenProfile, onLike, onTail, onOpenPick, onDelete, mine }: PostCardProps) {
  const p = post.author;
  const social = useSocial();
  const [menu, setMenu] = useState(false);
  const [reporting, setReporting] = useState(false);
  const [done, setDone] = useState<string | null>(null);
  const mine_ = mine || post.authorId === social.me?.id;
  /** An @handle in the text is a link, the same as it is everywhere else. */
  const openHandle = async (handle: string) => {
    const found = await social.profileByHandle(handle).catch(() => null);
    if (found) onOpenProfile(found.id);
  };
  return (
    <View style={styles.card}>
      <View style={styles.head}>
        <Avatar profile={p} size={38} onPress={() => onOpenProfile(post.authorId)} />
        <TouchableOpacity style={{ flex: 1 }} activeOpacity={0.8} onPress={() => onOpenProfile(post.authorId)}>
          <Text style={styles.name} numberOfLines={1}>
            {p?.displayName ?? 'Someone'}
            {p?.record && p.record.won + p.record.lost > 0 && (
              <Text style={styles.rec}>  {p.record.won}-{p.record.lost}</Text>
            )}
          </Text>
          <Text style={styles.handle}>@{p?.handle ?? 'unknown'} · {ago(post.createdAt)}</Text>
        </TouchableOpacity>
        {mine_ && !!onDelete ? (
          <TouchableOpacity onPress={onDelete} hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }} accessibilityLabel="Delete post">
            <Ionicons name="trash-outline" size={15} color={colors.inkGhost} />
          </TouchableOpacity>
        ) : !mine_ ? (
          <TouchableOpacity onPress={() => setMenu(true)} hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }} accessibilityRole="button" accessibilityLabel="Post options: block or report">
            <Ionicons name="ellipsis-horizontal" size={16} color={colors.inkGhost} />
          </TouchableOpacity>
        ) : null}
      </View>

      {!!post.text && <Text style={styles.text}>{renderText(post.text, openHandle)}</Text>}

      {!!post.gifUrl && (
        <Image source={{ uri: post.gifUrl }} style={styles.gif} resizeMode="cover" accessibilityLabel="GIF" />
      )}

      {!!post.pick && (
        <TouchableOpacity style={styles.pick} activeOpacity={0.85} onPress={onOpenPick} disabled={!onOpenPick}>
          <View style={styles.pickTag}>
            <Text style={styles.pickTagText}>{LEAGUE_BY_KEY[post.pick.league]?.short ?? 'NFL'}</Text>
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.pickLabel}>{post.pick.label}</Text>
            <Text style={styles.pickMeta}>
              model {post.pick.modelPct.toFixed(0)}% · edge +{post.pick.edge.toFixed(1)}
              {post.pick.book ? ` · ${post.pick.book}` : ''}
              {post.pick.odds != null ? ` ${post.pick.odds > 0 ? '+' : ''}${post.pick.odds}` : ''}
            </Text>
          </View>
          <Ionicons name="chevron-forward" size={14} color={colors.inkGhost} />
        </TouchableOpacity>
      )}

      {/* Block and report live behind the same control on every post, because a
          safety action people cannot find is one they do not take. */}
      <Modal visible={menu} transparent animationType="fade" onRequestClose={() => { setMenu(false); setReporting(false); }}>
        <TouchableOpacity style={styles.sheetBack} activeOpacity={1} onPress={() => { setMenu(false); setReporting(false); }}>
          <View style={styles.sheet}>
            {done ? (
              <Text style={styles.sheetDone}>{done}</Text>
            ) : reporting ? (
              <>
                <Text style={styles.sheetTitle}>Report this post</Text>
                {REPORT_REASONS.map((r) => (
                  <TouchableOpacity
                    key={r.key}
                    style={styles.sheetRow}
                    activeOpacity={0.8}
                    onPress={async () => {
                      await social.report({ postId: post.id, subjectId: post.authorId, reason: r.key }).catch(() => {});
                      setDone('Reported. Thanks — we look at every one.');
                      setTimeout(() => { setMenu(false); setReporting(false); setDone(null); }, 1600);
                    }}
                  >
                    <Text style={styles.sheetRowText}>{r.label}</Text>
                  </TouchableOpacity>
                ))}
              </>
            ) : (
              <>
                <Text style={styles.sheetTitle}>@{p?.handle ?? 'this account'}</Text>
                <TouchableOpacity style={styles.sheetRow} activeOpacity={0.8} onPress={() => setReporting(true)}>
                  <Ionicons name="flag-outline" size={15} color={colors.ink} />
                  <Text style={styles.sheetRowText}>Report this post</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={styles.sheetRow}
                  activeOpacity={0.8}
                  onPress={async () => {
                    await social.block(post.authorId, true).catch(() => {});
                    setDone('Blocked. You will not see them again.');
                    setTimeout(() => { setMenu(false); setDone(null); }, 1600);
                  }}
                >
                  <Ionicons name="ban-outline" size={15} color={colors.negative} />
                  <Text style={[styles.sheetRowText, { color: colors.negative }]}>Block @{p?.handle ?? 'them'}</Text>
                </TouchableOpacity>
              </>
            )}
          </View>
        </TouchableOpacity>
      </Modal>

      <View style={styles.actions}>
        <TouchableOpacity style={styles.action} activeOpacity={0.8} onPress={() => onLike(!post.likedByMe)} accessibilityLabel="Like">
          <Ionicons name={post.likedByMe ? 'heart' : 'heart-outline'} size={15} color={post.likedByMe ? colors.negative : colors.inkFaint} />
          <Text style={[styles.actionText, numeric, post.likedByMe && { color: colors.negative }]}>{post.likes || ''}</Text>
        </TouchableOpacity>
        {!!post.pick && (
          <TouchableOpacity style={[styles.action, styles.tail, post.tailedByMe && styles.tailOn]} activeOpacity={0.85} onPress={() => onTail(!post.tailedByMe)} accessibilityLabel="Tail this pick">
            <Ionicons name={post.tailedByMe ? 'checkmark' : 'git-branch-outline'} size={14} color={post.tailedByMe ? colors.bg : colors.green} />
            <Text style={[styles.tailText, post.tailedByMe && { color: colors.bg }]}>
              {post.tailedByMe ? 'Tailed' : 'Tail'}{post.tails ? ` ${post.tails}` : ''}
            </Text>
          </TouchableOpacity>
        )}
      </View>
    </View>
  );
}

/** Hashtags get the accent, @handles are links, everything else is plain. */
function renderText(text: string, onHandle: (handle: string) => void) {
  const parts = text.split(/(#[\p{L}\p{N}_]{2,30}|@[a-z0-9_]{1,30})/giu);
  return parts.map((part, i) => {
    if (part.startsWith('#')) return <Text key={i} style={styles.tag}>{part}</Text>;
    if (part.startsWith('@')) {
      return (
        <Text key={i} style={styles.mention} onPress={() => onHandle(part.slice(1).toLowerCase())}>
          {part}
        </Text>
      );
    }
    return <Text key={i}>{part}</Text>;
  });
}

export function SignInRow({ onGoogle, onApple, busy }: { onGoogle: () => void; onApple: () => void; busy?: boolean }) {
  return (
    <View style={styles.signRow}>
      <TouchableOpacity style={styles.signBtn} activeOpacity={0.85} onPress={onGoogle} disabled={busy} accessibilityLabel="Continue with Google">
        <Ionicons name="logo-google" size={16} color={colors.ink} />
        <Text style={styles.signText}>Google</Text>
      </TouchableOpacity>
      <TouchableOpacity style={styles.signBtn} activeOpacity={0.85} onPress={onApple} disabled={busy} accessibilityLabel="Continue with Apple">
        <Ionicons name="logo-apple" size={17} color={colors.ink} />
        <Text style={styles.signText}>Apple</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  avatar: { alignItems: 'center', justifyContent: 'center' },

  person: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, backgroundColor: colors.card, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, padding: spacing.md, marginBottom: spacing.sm },
  personName: { color: colors.ink, fontSize: 14, fontWeight: '800' },
  personHandle: { color: colors.inkFaint, fontSize: 11, marginTop: 1 },
  personBio: { color: colors.inkGhost, fontSize: 11, marginTop: 3 },
  avatarText: { color: colors.white, fontWeight: '900' },

  card: { backgroundColor: colors.card, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border, padding: spacing.md, marginBottom: spacing.sm },
  head: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  name: { color: colors.ink, fontSize: 14, fontWeight: '800' },
  rec: { color: colors.green, fontSize: 12, fontWeight: '800' },
  handle: { color: colors.inkFaint, fontSize: 11, marginTop: 1 },
  text: { color: colors.ink, fontSize: 14, lineHeight: 20, marginTop: spacing.sm },
  tag: { color: colors.green, fontWeight: '800' },
  mention: { color: colors.away, fontWeight: '800' },
  gif: { width: '100%', height: 190, borderRadius: radius.md, marginTop: spacing.sm, backgroundColor: colors.cardAlt },

  pick: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginTop: spacing.sm, padding: spacing.sm, borderRadius: radius.md, backgroundColor: colors.cardAlt, borderWidth: 1, borderColor: colors.border },
  pickTag: { paddingHorizontal: 7, paddingVertical: 3, borderRadius: radius.sm, backgroundColor: colors.greenSoft },
  pickTagText: { color: colors.green, fontSize: 9, fontWeight: '900', letterSpacing: 0.6 },
  pickLabel: { color: colors.ink, fontSize: 13, fontWeight: '900' },
  pickMeta: { color: colors.inkFaint, fontSize: 11, marginTop: 1 },

  actions: { flexDirection: 'row', alignItems: 'center', gap: spacing.lg, marginTop: spacing.sm },
  action: { flexDirection: 'row', alignItems: 'center', gap: 5, paddingVertical: 4 },
  actionText: { color: colors.inkFaint, fontSize: 12, fontWeight: '800' },
  tail: { marginLeft: 'auto', paddingHorizontal: 12, paddingVertical: 6, borderRadius: radius.pill, borderWidth: 1, borderColor: colors.green },
  tailOn: { backgroundColor: colors.green },
  tailText: { color: colors.green, fontSize: 12, fontWeight: '900' },

  sheetBack: { flex: 1, backgroundColor: 'rgba(5,8,12,0.82)', justifyContent: 'flex-end' },
  sheet: { backgroundColor: colors.card, borderTopLeftRadius: radius.xl, borderTopRightRadius: radius.xl, borderWidth: 1, borderColor: colors.borderHi, padding: spacing.lg, paddingBottom: spacing.xxl, gap: 2 },
  sheetTitle: { color: colors.inkFaint, fontSize: 12, fontWeight: '800', marginBottom: spacing.sm },
  sheetRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, paddingVertical: 14 },
  sheetRowText: { color: colors.ink, fontSize: 14.5, fontWeight: '700' },
  sheetDone: { color: colors.green, fontSize: 14, fontWeight: '800', paddingVertical: 18, textAlign: 'center' },
  signRow: { flexDirection: 'row', gap: spacing.sm },
  signBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingVertical: 12, borderRadius: radius.pill, backgroundColor: colors.cardAlt, borderWidth: 1, borderColor: colors.borderHi },
  signText: { color: colors.ink, fontSize: 14, fontWeight: '800' },
});
