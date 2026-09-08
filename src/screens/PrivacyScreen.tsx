/**
 * Your data, and the two things you are entitled to do with it: take a copy,
 * and end the account.
 *
 * Both are here rather than buried in a support email because that is the point
 * of the right — a deletion you have to ask a human for is a deletion the
 * company gets to slow down. It is also the honest reading of the app stores'
 * rules: an app that lets you create an account in one tap has to let you end
 * it in about as many.
 *
 * Deletion is deliberately awkward in exactly one way: you type your handle.
 * A confirm dialog is muscle memory and gets tapped through; typing the name of
 * the thing is the smallest gesture that proves you meant it. Nothing else about
 * it is made difficult — no cooling-off, no survey, no offer.
 */
import React, { useState } from 'react';
import { View, Text, ScrollView, TouchableOpacity, TextInput, StyleSheet, ActivityIndicator, Platform } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { colors, radius, spacing, type as T, clearance } from '@/theme';
import { useSocial } from '@/social/SocialContext';
import { useEngagement } from '@/context/EngagementContext';
import { useEntitlements } from '@/context/EntitlementsContext';
import { SignInRow } from '@/components/Social';
import { haptic } from '@/utils/haptics';

interface Props { onDone: () => void; }

/**
 * Every key this app writes. Deletion clears all of them, not just the social
 * one — a "deleted" account that leaves your card, your streak and your tier on
 * the device has not been deleted, it has been signed out.
 */
const LOCAL_KEYS = [
  'gridiron-ai.social.local.v1',
  'gridiron-ai.engagement.v1',
  'gridiron-ai.entitlements.v1',
  'gridiron-ai.live-data.v1',
  'cfb-gridiron-ai.live-data.v1',
];

export function PrivacyScreen({ onDone }: Props) {
  const s = useSocial();
  const eng = useEngagement();
  const ent = useEntitlements();
  const [typed, setTyped] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [exported, setExported] = useState<string | null>(null);

  const handle = s.me?.handle ?? '';
  const armed = !!handle && typed.trim().toLowerCase().replace(/^@/, '') === handle.toLowerCase();

  /**
   * Right of access. Everything the app holds about you that it did not get
   * from a public feed: your profile, your posts, your card, your settings.
   */
  const exportData = async () => {
    haptic('light');
    const posts = s.me ? await s.postsOf(s.me.id).catch(() => []) : [];
    const dump = {
      exportedAt: new Date().toISOString(),
      profile: s.me,
      posts,
      card: { picks: eng.picks, summary: eng.summary, streak: eng.streak },
      plan: { tier: ent.tierId, verified: ent.verified },
      blocked: s.blocked,
    };
    const text = JSON.stringify(dump, null, 2);
    if (Platform.OS === 'web' && typeof document !== 'undefined') {
      try {
        const url = URL.createObjectURL(new Blob([text], { type: 'application/json' }));
        const a = document.createElement('a');
        a.href = url;
        a.download = `gridiron-ai-data-${new Date().toISOString().slice(0, 10)}.json`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
        setExported('Downloaded.');
        return;
      } catch { /* fall through to showing it */ }
    }
    setExported(text);
  };

  const destroy = async () => {
    if (!armed || busy) return;
    setBusy(true);
    setError(null);
    haptic('warning');
    try {
      await s.deleteAccount();
      await AsyncStorage.multiRemove(LOCAL_KEYS);
      onDone();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'That did not go through. Try again.');
      setBusy(false);
    }
  };

  return (
    <SafeAreaView edges={['top']} style={styles.safe}>
      <ScrollView contentContainerStyle={styles.body}>
        <Text style={styles.title}>Your data</Text>

        {!s.signedIn ? (
          <View style={styles.card}>
            <Text style={styles.blurb}>
              There is no account on this device yet. Nothing has been stored about you beyond the app's own settings.
            </Text>
            <SignInRow onGoogle={() => s.signIn('google')} onApple={() => s.signIn('apple')} busy={s.busy} />
          </View>
        ) : (
          <>
            <View style={styles.card}>
              <Text style={styles.cardTitle}>Take a copy</Text>
              <Text style={styles.blurb}>
                Your profile, your posts, your card and your plan, as one JSON file. Everything the app holds that you
                put there.
              </Text>
              <TouchableOpacity style={styles.ghost} activeOpacity={0.85} onPress={exportData} accessibilityRole="button">
                <Ionicons name="download-outline" size={16} color={colors.ink} />
                <Text style={styles.ghostText}>Export my data</Text>
              </TouchableOpacity>
              {!!exported && (
                exported === 'Downloaded.'
                  ? <Text style={styles.ok}>Downloaded.</Text>
                  : <ScrollView style={styles.dump} horizontal={false}><Text style={styles.dumpText} selectable>{exported}</Text></ScrollView>
              )}
            </View>

            <View style={[styles.card, styles.danger]}>
              <Text style={[styles.cardTitle, { color: colors.negative }]}>Delete this account</Text>
              <Text style={styles.blurb}>
                Your profile, posts, follows, likes and card go, and they do not come back. {s.live
                  ? 'This runs on the server, so it takes the account with it, not just this device.'
                  : 'Accounts are device-only right now, so this clears everything stored here.'}
              </Text>
              <Text style={styles.blurb}>
                {ent.paid
                  ? 'Deleting the account does not cancel a subscription — cancel that with your card provider first, or you will keep being charged for an account that no longer exists.'
                  : 'Nothing is billed on this account.'}
              </Text>
              <Text style={styles.confirmLabel}>Type <Text style={styles.confirmHandle}>@{handle}</Text> to confirm</Text>
              <TextInput
                style={styles.input}
                value={typed}
                onChangeText={setTyped}
                placeholder={`@${handle}`}
                placeholderTextColor={colors.inkGhost}
                autoCapitalize="none"
                autoCorrect={false}
                accessibilityLabel="Type your handle to confirm deletion"
              />
              {!!error && <Text style={styles.error}>{error}</Text>}
              <TouchableOpacity
                style={[styles.destroy, !armed && styles.destroyOff]}
                activeOpacity={0.85}
                onPress={destroy}
                disabled={!armed || busy}
                accessibilityRole="button"
                accessibilityLabel="Permanently delete this account"
              >
                {busy
                  ? <ActivityIndicator size="small" color={colors.white} />
                  : <Text style={styles.destroyText}>Delete my account permanently</Text>}
              </TouchableOpacity>
            </View>
          </>
        )}

        <Text style={styles.foot}>
          21+ where sports betting is legal. Projections are information, not advice. If betting stops being fun,
          stop — 1-800-GAMBLER.
        </Text>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  body: { padding: spacing.lg, paddingBottom: clearance.overlay, gap: spacing.lg },
  title: { ...T.title, color: colors.ink, fontSize: 24 },
  card: { backgroundColor: colors.card, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border, padding: spacing.lg, gap: spacing.md },
  danger: { borderColor: 'rgba(255,95,109,0.35)' },
  cardTitle: { color: colors.ink, fontSize: 15, fontWeight: '900' },
  blurb: { color: colors.inkDim, fontSize: 13, lineHeight: 19 },
  ghost: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingVertical: 12, borderRadius: radius.pill, backgroundColor: colors.cardAlt, borderWidth: 1, borderColor: colors.borderHi },
  ghostText: { color: colors.ink, fontSize: 13.5, fontWeight: '800' },
  ok: { color: colors.green, fontSize: 12.5, fontWeight: '800' },
  dump: { maxHeight: 220, backgroundColor: colors.bgAlt, borderRadius: radius.md, padding: spacing.md },
  dumpText: { color: colors.inkDim, fontSize: 10, lineHeight: 14, fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace' },
  confirmLabel: { color: colors.inkFaint, fontSize: 12, fontWeight: '700' },
  confirmHandle: { color: colors.ink, fontWeight: '900' },
  input: { color: colors.ink, fontSize: 15, backgroundColor: colors.bgAlt, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, paddingHorizontal: spacing.md, paddingVertical: 11 },
  error: { color: colors.negative, fontSize: 12.5, lineHeight: 18 },
  destroy: { alignItems: 'center', paddingVertical: 13, borderRadius: radius.pill, backgroundColor: colors.negative },
  destroyOff: { opacity: 0.35 },
  destroyText: { color: colors.white, fontSize: 14, fontWeight: '900' },
  foot: { color: colors.inkGhost, fontSize: 11, lineHeight: 16 },
});
