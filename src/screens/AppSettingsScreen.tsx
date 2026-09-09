/**
 * Settings.
 *
 * The gear used to open the model's node weights, which is a power-user screen
 * wearing the icon everyone taps looking for their account. This is the screen
 * that icon should open: who you are, what the app is allowed to do, where the
 * data comes from, and the legal and responsible-gambling links that belong
 * somewhere findable rather than buried in a footer.
 *
 * The model weights are still one tap away, under Model.
 */
import React, { useState } from 'react';
import { View, Text, ScrollView, TouchableOpacity, Switch, StyleSheet, Linking } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { colors, numeric, radius, spacing, type as T, clearance } from '@/theme';
import { BrandLockup } from '@/components/Brand';
import { Avatar } from '@/components/Social';
import { TierPill } from '@/components/Pro';
import { useSocial } from '@/social/SocialContext';
import { useEntitlements } from '@/context/EntitlementsContext';
import { useEngagement } from '@/context/EngagementContext';
import { useLeague } from '@/league/LeagueContext';
import { useLive } from '@/live/LiveContext';
import { usePrefs } from '@/context/PrefsContext';
import { hapticsSupported, haptic } from '@/utils/haptics';
import { timeAgo } from '@/utils/format';
import { FULL_NOTICE, HELP_LINE, HELP_URL } from '@/legal/notices';

interface Props {
  onProfile: () => void;
  onUpgrade: () => void;
  onModel: () => void;
  onCard: () => void;
  /** Data export and account deletion. */
  onPrivacy: () => void;
}

export function AppSettingsScreen({ onProfile, onUpgrade, onModel, onCard, onPrivacy }: Props) {
  const social = useSocial();
  const ent = useEntitlements();
  const eng = useEngagement();
  const { active, all } = useLeague();
  const live = useLive();
  const prefs = usePrefs();
  const [note, setNote] = useState<string | null>(null);

  /**
   * Signing out, said out loud.
   *
   * It is not destructive — everything is still there when you come back — so
   * there is no confirmation to click through. But it should say that it
   * happened, because a screen that silently changes one row is indistinguishable
   * from a button that did nothing.
   */
  const signOut = async () => {
    try {
      await social.signOut();
      setNote('Signed out. Your card, streak and plan stay on this device.');
    } catch (e) {
      setNote(e instanceof Error ? e.message : 'That did not go through. Try again.');
    }
  };

  return (
    <SafeAreaView edges={['top']} style={styles.root}>
      <ScrollView contentContainerStyle={styles.body}>
        <View style={styles.brandRow}>
          <BrandLockup size={34} />
          <TierPill tier={ent.tier} trial={ent.trial.active ? ent.trial.daysLeft : undefined} onPress={onUpgrade} />
        </View>

        {/* ---- account ---- */}
        <TouchableOpacity style={styles.account} activeOpacity={0.85} onPress={onProfile} accessibilityRole="button">
          <Avatar profile={social.me} size={52} />
          <View style={{ flex: 1 }}>
            <Text style={styles.accountName}>{social.me?.displayName ?? 'Not signed in'}</Text>
            <Text style={styles.accountSub}>
              {social.me ? `@${social.me.handle} · ${social.me.followers} follower${social.me.followers === 1 ? '' : 's'}` : 'Sign in to claim a handle and follow people'}
            </Text>
          </View>
          <Ionicons name="chevron-forward" size={17} color={colors.inkGhost} />
        </TouchableOpacity>

        <View style={styles.quick}>
          <Quick label="STREAK" value={`${eng.streak}d`} />
          <Quick label="CARD" value={`${eng.summary.won}-${eng.summary.lost}`} />
          <Quick label="OPEN" value={`${eng.summary.open}`} />
          <Quick label="SIMS" value={ent.simsLeft === Infinity ? '∞' : `${ent.simsLeft}`} />
        </View>

        {/* ---- plan ---- */}
        <Group title="Plan">
          <Row icon="flash" label={ent.paid ? 'Manage plan' : 'Go Pro'} value={ent.tier.name} onPress={onUpgrade} />
          {/* Say plainly whether anybody has checked. A plan the app cannot
              confirm is not the same as one it can, and pretending otherwise is
              how a support queue fills up with people who think they paid. */}
          {ent.paid && (
            <Row
              icon={ent.verified ? 'shield-checkmark' : 'shield-outline'}
              label="Plan status"
              value={ent.verified ? 'Verified' : ent.verifiable ? 'Checking…' : 'Unverified'}
            />
          )}
          <Row icon="bookmark" label="Your card" value={`${eng.summary.open} open`} onPress={onCard} />
        </Group>

        {/* ---- feel ---- */}
        <Group title="Feel" note={hapticsSupported() ? undefined : 'This browser has no vibration API, so haptics stay off here. They work in the installed app.'}>
          <Toggle
            icon="phone-portrait"
            label="Haptics"
            hint="A tick when you change tabs, save a pick or switch league."
            value={prefs.haptics}
            disabled={!hapticsSupported()}
            onChange={(v) => { prefs.setHaptics(v); if (v) haptic('success'); }}
          />
          <Toggle
            icon="pulse"
            label="Live score polling"
            hint="Checks the scoreboard every 20 seconds while a game is in progress."
            value={prefs.livePolling}
            onChange={prefs.setLivePolling}
          />
          <Toggle
            icon="eye-off"
            label="Hide dollar amounts"
            hint="Shows units only. Useful if you read this on a train."
            value={prefs.hideMoney}
            onChange={prefs.setHideMoney}
          />
        </Group>

        {/* ---- data ---- */}
        <Group title="Data">
          {all.filter((v) => v.generatedAt || v.id === active.id).map((v) => (
            <Row
              key={v.id}
              icon={v.sport === 'basketball' ? 'basketball' : v.sport === 'baseball' ? 'baseball' : v.sport === 'soccer' ? 'football' : 'american-football'}
              label={`${v.short} dataset`}
              value={v.generatedAt ? timeAgo(Date.parse(v.generatedAt)) : v.loading ? 'loading…' : 'not loaded'}
              onPress={() => { v.refresh(); setNote(`Refreshing ${v.short}…`); }}
            />
          ))}
          <Row
            icon="radio"
            label="Live scores"
            value={live.connected ? `${live.liveCount} live` : 'idle'}
            onPress={() => { live.refresh(); setNote('Re-checking the scoreboard…'); }}
          />
          <Row icon="options" label="Model weights" value={`${active.short} engine`} onPress={onModel} />
        </Group>

        {/* ---- account ----
             Sign out lived at the bottom of the Record tab of your own profile,
             in twelve-point ghost grey, four taps from anywhere. People
             reasonably concluded the app did not have one. It belongs here,
             where every other app puts it, next to the account it acts on. */}
        {social.live && (
          <Group title="Account">
            {social.signedIn ? (
              <Row
                icon="log-out"
                label="Sign out"
                value={social.me ? `@${social.me.handle}` : undefined}
                onPress={signOut}
                tone="quiet"
              />
            ) : (
              <Row icon="log-in" label="Sign in" value="Email link or code" onPress={onProfile} />
            )}
          </Group>
        )}

        {/* ---- legal ---- */}
        <Group title="The small print">
          <Row icon="shield-checkmark" label="How the model is graded" value="Record tab" onPress={onCard} />
          <Row icon="lock-closed" label="Your data & account" value="Export or delete" onPress={onPrivacy} />
          <Row
            icon="help-buoy"
            label="Responsible gambling"
            value={HELP_LINE}
            onPress={() => Linking.openURL(HELP_URL).catch(() => {})}
          />
        </Group>

        {!!note && <Text style={styles.note}>{note}</Text>}

        <Text style={styles.legal}>
          {FULL_NOTICE}
        </Text>
        <Text style={styles.build}>
          {active.season} season · {ent.tier.name}{ent.trial.active ? ` · trial, ${ent.trial.daysLeft}d left` : ''}
        </Text>
      </ScrollView>
    </SafeAreaView>
  );
}

function Quick({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.quickCell}>
      <Text style={styles.quickLabel}>{label}</Text>
      <Text style={[styles.quickValue, numeric]}>{value}</Text>
    </View>
  );
}

function Group({ title, note, children }: { title: string; note?: string; children: React.ReactNode }) {
  return (
    <View style={styles.group}>
      <Text style={styles.groupTitle}>{title}</Text>
      <View style={styles.groupBody}>{children}</View>
      {!!note && <Text style={styles.groupNote}>{note}</Text>}
    </View>
  );
}

function Row({ icon, label, value, onPress, tone }: {
  icon: keyof typeof Ionicons.glyphMap; label: string; value?: string; onPress?: () => void;
  /** "quiet" reserves the accent for things you want people to do. Leaving is not one. */
  tone?: 'quiet';
}) {
  return (
    <TouchableOpacity style={styles.row} activeOpacity={onPress ? 0.8 : 1} disabled={!onPress} onPress={() => { haptic('light'); onPress?.(); }} accessibilityRole={onPress ? 'button' : 'text'} accessibilityLabel={label}>
      <View style={styles.rowIcon}><Ionicons name={icon} size={15} color={tone === 'quiet' ? colors.inkFaint : colors.green} /></View>
      <Text style={styles.rowLabel}>{label}</Text>
      {!!value && <Text style={styles.rowValue} numberOfLines={1}>{value}</Text>}
      <Ionicons name="chevron-forward" size={15} color={colors.inkGhost} />
    </TouchableOpacity>
  );
}

function Toggle({ icon, label, hint, value, onChange, disabled }: {
  icon: keyof typeof Ionicons.glyphMap; label: string; hint: string; value: boolean; onChange: (v: boolean) => void; disabled?: boolean;
}) {
  return (
    <View style={[styles.row, styles.toggleRow, disabled && { opacity: 0.5 }]}>
      <View style={styles.rowIcon}><Ionicons name={icon} size={15} color={colors.green} /></View>
      <View style={{ flex: 1 }}>
        <Text style={styles.rowLabel}>{label}</Text>
        <Text style={styles.rowHint}>{hint}</Text>
      </View>
      <Switch
        value={value && !disabled}
        onValueChange={onChange}
        disabled={disabled}
        trackColor={{ true: colors.greenDim, false: colors.border }}
        thumbColor={value && !disabled ? colors.green : colors.inkFaint}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  body: { padding: spacing.lg, paddingBottom: clearance.overlay },
  brandRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: spacing.lg },

  account: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, backgroundColor: colors.card, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border, padding: spacing.md },
  accountName: { color: colors.ink, fontSize: 16, fontWeight: '900' },
  accountSub: { color: colors.inkFaint, fontSize: 12, marginTop: 2 },

  quick: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.sm, marginBottom: spacing.lg, padding: spacing.md, borderRadius: radius.lg, backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border },
  quickCell: { flex: 1 },
  quickLabel: { color: colors.inkFaint, fontSize: 8, fontWeight: '900', letterSpacing: 0.8 },
  quickValue: { color: colors.ink, fontSize: 16, fontWeight: '900', marginTop: 3 },

  group: { marginBottom: spacing.lg },
  groupTitle: { ...T.micro, color: colors.inkFaint, marginBottom: spacing.sm },
  groupBody: { backgroundColor: colors.card, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border, overflow: 'hidden' },
  groupNote: { color: colors.inkGhost, fontSize: 11, lineHeight: 16, marginTop: 8 },

  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, paddingHorizontal: spacing.md, paddingVertical: 13, borderBottomWidth: 1, borderBottomColor: colors.divider },
  toggleRow: { alignItems: 'center' },
  rowIcon: { width: 28, height: 28, borderRadius: 9, backgroundColor: colors.greenSoft, alignItems: 'center', justifyContent: 'center' },
  rowLabel: { color: colors.ink, fontSize: 14, fontWeight: '800' },
  rowHint: { color: colors.inkFaint, fontSize: 11, lineHeight: 15, marginTop: 2 },
  rowValue: { color: colors.inkFaint, fontSize: 12, fontWeight: '700', maxWidth: 130, textAlign: 'right' },

  note: { color: colors.green, fontSize: 12, fontWeight: '700', textAlign: 'center', marginBottom: spacing.md },
  legal: { color: colors.inkGhost, fontSize: 10, lineHeight: 15, textAlign: 'center' },
  build: { color: colors.inkGhost, fontSize: 10, textAlign: 'center', marginTop: spacing.sm },
});
