import React from 'react';
import { View, Text, ScrollView, TouchableOpacity, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useEntitlements } from '@/context/EntitlementsContext';
import { colors, radius, spacing } from '@/theme';
import { useSettings } from '@/context/SettingsContext';
import { NOT_ADVICE } from '@/legal/notices';
import { BrandMark } from '@/components/Brand';

/**
 * What the app actually is, on the one screen where a stranger decides.
 *
 * This used to open with "pick any two NFL teams" and then list the four nodes
 * of the football engine — a faithful description of the app when football was
 * all of it, and a wrong one for eighteen leagues. Worse, it opened by telling
 * a basketball fan the product was not for them, which is the single most
 * expensive sentence in the app.
 *
 * So it describes the method rather than one sport's inputs, and it leads with
 * the two things nobody else in the category will say out loud: that the
 * projection is frozen before the game and graded afterwards whatever happens,
 * and that a single night proves nothing either way.
 */
const POINTS: { icon: keyof typeof Ionicons.glyphMap; title: string; text: string }[] = [
  {
    icon: 'shuffle',
    title: 'Ten thousand times, every game',
    text: 'Football, basketball, baseball, hockey, soccer and golf — eighteen leagues on one engine. Every matchup is simulated ten thousand times, and you get the whole distribution: win probability, a projected score, and the range either side of it.',
  },
  {
    icon: 'lock-closed',
    title: 'Locked before it starts',
    text: 'Every projection is written down before first pitch and never touched again. A game first seen after it began is not scored at all — which is the only way a track record means anything.',
  },
  {
    icon: 'stats-chart',
    title: 'Graded in the open, error bars and all',
    text: 'Wins and losses both, with the confidence interval next to the number. A 10-1 night and a 1-10 night are each about as common as the other, and the app will say so rather than sell you the good one.',
  },
  {
    icon: 'snow',
    title: 'It knows what moves a number',
    text: 'Tonight\'s starting pitcher, the forecast at kick-off, travel and altitude, the market itself. What it refuses to price is a hot streak, because the evidence says a streak is a symptom of a good team rather than information on top of one.',
  },
];

export function OnboardingScreen({ onDone }: { onDone: () => void }) {
  const { setOnboarded } = useSettings();
  const ent = useEntitlements();
  return (
    <SafeAreaView style={styles.root}>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <View style={styles.mark}><BrandMark size={72} radius={20} /></View>
        <Text style={styles.title}>Simtoad</Text>
        <Text style={styles.subtitle}>
          Eighteen leagues, one model. It sits still, ignores almost everything, and tells you when a number is
          actually worth taking.
        </Text>
        {POINTS.map((n) => (
          <View key={n.title} style={styles.node}>
            <View style={styles.nodeIcon}><Ionicons name={n.icon} size={16} color={colors.gold} /></View>
            <View style={{ flex: 1 }}>
              <View style={styles.nodeHead}>
                <Text style={styles.nodeTitle}>{n.title}</Text>
              </View>
              <Text style={styles.nodeText}>{n.text}</Text>
            </View>
          </View>
        ))}
        <View style={styles.note}>
          <Ionicons name="information-circle" size={16} color={colors.inkDim} />
          <Text style={styles.noteText}>Football ships on an editable sample dataset (preseason-2026 estimates); every other league is built from live results. {NOT_ADVICE}</Text>
        </View>
        <TouchableOpacity
          style={styles.trial}
          activeOpacity={0.85}
          onPress={() => { ent.startTrial(); setOnboarded(true); onDone(); }}
        >
          <Ionicons name="gift" size={16} color={colors.bg} />
          <Text style={styles.trialText}>Start with 7 days of Quant free</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.cta} activeOpacity={0.85} onPress={() => { setOnboarded(true); onDone(); }}>
          <Text style={styles.ctaText}>Maybe later — just start</Text>
          <Ionicons name="arrow-forward" size={18} color={colors.bg} />
        </TouchableOpacity>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  trial: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingVertical: 14, borderRadius: 999, backgroundColor: colors.green, marginBottom: 10 },
  trialText: { color: colors.bg, fontSize: 15, fontWeight: '900' },
  root: { flex: 1, backgroundColor: colors.bg },
  content: { padding: spacing.xl, paddingBottom: spacing.xxl },

  mark: { marginBottom: spacing.lg },
  title: { color: colors.ink, fontSize: 32, fontWeight: '900', letterSpacing: -0.5 },
  subtitle: { color: colors.inkDim, fontSize: 14, lineHeight: 21, marginTop: spacing.sm, marginBottom: spacing.xl },
  node: { flexDirection: 'row', gap: 12, backgroundColor: colors.card, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border, padding: spacing.lg, marginBottom: spacing.sm },
  nodeIcon: { width: 32, height: 32, borderRadius: 10, backgroundColor: colors.goldSoft, alignItems: 'center', justifyContent: 'center' },
  nodeHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  nodeTitle: { color: colors.ink, fontWeight: '800', fontSize: 14 },
  nodeWeight: { color: colors.gold, fontWeight: '900', fontSize: 13 },
  nodeText: { color: colors.inkFaint, fontSize: 12, lineHeight: 17, marginTop: 3 },
  note: { flexDirection: 'row', gap: 8, alignItems: 'center', marginTop: spacing.md, marginBottom: spacing.xl },
  noteText: { color: colors.inkDim, fontSize: 12, flex: 1 },
  cta: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10, backgroundColor: colors.gold, borderRadius: radius.lg, paddingVertical: 16 },
  ctaText: { color: colors.bg, fontWeight: '900', fontSize: 16 },
});
