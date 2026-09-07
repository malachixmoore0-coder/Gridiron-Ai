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
import { colors, numeric, radius, spacing, type as T } from '@/theme';
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

interface Props {
  onProfile: () => void;
  onUpgrade: () => void;
  onModel: () => void;
  onCard: () => void;
}

export function AppSettingsScreen({ onProfile, onUpgrade, onModel, onCard }: Props) {
  const social = useSocial();
  const ent = useEntitlements();
  const eng = useEngagement();
  const { active, nfl, cfb } = useLeague();
  const live = useLive();
  const prefs = usePrefs();
  const [note, setNote] = useState<string | null>(null);

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
          <Row
            icon="american-football"
            label="NFL dataset"
            value={nfl.generatedAt ? timeAgo(Date.parse(nfl.generatedAt)) : 'not loaded'}
            onPress={() => { nfl.refresh(); setNote('Refreshing the NFL dataset…'); }}
          />
          <Row
            icon="school"
            label="College dataset"
            value={cfb.generatedAt ? timeAgo(Date.parse(cfb.generatedAt)) : 'not loaded'}
            onPress={() => { cfb.refresh(); setNote('Refreshing the college dataset…'); }}
          />
          <Row
            icon="radio"
            label="Live scores"
            value={live.connected ? `${live.liveCount} live` : 'idle'}
            onPress={() => { live.refresh(); setNote('Re-checking the scoreboard…'); }}
          />
          <Row icon="options" label="Model weights" value={`${active.short} engine`} onPress={onModel} />
        </Group>

        {/* ---- legal ---- */}
        <Group title="The small print">
          <Row icon="shield-checkmark" label="How the model is graded" value="Record tab" onPress={onCard} />
          <Row
            icon="help-buoy"
            label="Responsible gambling"
            value="1-800-GAMBLER"
            onPress={() => Linking.openURL('https://www.ncpgambling.org/help-treatment/').catch(() => {})}
          />
        </Group>

        {!!note && <Text style={styles.note}>{note}</Text>}

        <Text style={styles.legal}>
          Gridiron AI publishes projections, not advice. Every number is produced by a model that is graded in the
          open, and no model beats a sportsbook every week. 21+ where sports betting is legal. If betting stops being
          fun, stop.
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

function Row({ icon, label, value, onPress }: { icon: keyof typeof Ionicons.glyphMap; label: string; value?: string; onPress: () => void }) {
  return (
    <TouchableOpacity style={styles.row} activeOpacity={0.8} onPress={() => { haptic('light'); onPress(); }} accessibilityRole="button" accessibilityLabel={label}>
      <View style={styles.rowIcon}><Ionicons name={icon} size={15} color={colors.green} /></View>
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
  body: { padding: spacing.lg, paddingBottom: 40 },
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
