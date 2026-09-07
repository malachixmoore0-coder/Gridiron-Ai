/**
 * Chrome for anything pushed on top of a tab.
 *
 * The old header-only back arrow sat under the status bar in the far top-left —
 * the one place a thumb cannot reach on a large phone, and the place iOS puts
 * its own back gesture. So every overlay now carries a back control at the
 * *bottom*, full width, inside the safe area: the easiest target on the screen.
 * The header arrow stays for people who reach for it, with a much larger hit
 * area than before.
 */
import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { colors, radius, spacing } from '@/theme';

interface Props {
  onBack: () => void;
  /** What tapping back returns to, e.g. "Buffalo Bills". */
  backLabel?: string;
  /** Optional extra control beside the back bar. */
  action?: { label: string; icon: keyof typeof Ionicons.glyphMap; onPress: () => void };
  children: React.ReactNode;
}

export function OverlayShell({ onBack, backLabel = 'Back', action, children }: Props) {
  return (
    <View style={styles.root}>
      <View style={styles.content}>{children}</View>
      <SafeAreaView edges={['bottom']} style={styles.barSafe}>
        <View style={styles.bar}>
          <TouchableOpacity
            style={styles.back}
            activeOpacity={0.8}
            onPress={onBack}
            accessibilityRole="button"
            accessibilityLabel={backLabel}
            hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
          >
            <Ionicons name="chevron-back" size={18} color={colors.ink} />
            <Text style={styles.backText}>{backLabel}</Text>
          </TouchableOpacity>
          {!!action && (
            <TouchableOpacity style={styles.action} activeOpacity={0.85} onPress={action.onPress} accessibilityRole="button" accessibilityLabel={action.label}>
              <Ionicons name={action.icon} size={16} color={colors.bg} />
              <Text style={styles.actionText}>{action.label}</Text>
            </TouchableOpacity>
          )}
        </View>
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  content: { flex: 1 },
  barSafe: { backgroundColor: colors.bgAlt, borderTopWidth: 1, borderTopColor: colors.border },
  bar: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingHorizontal: spacing.md, paddingVertical: 9 },
  back: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 12, borderRadius: radius.pill, backgroundColor: colors.cardAlt, borderWidth: 1, borderColor: colors.border },
  backText: { color: colors.ink, fontSize: 14, fontWeight: '800' },
  action: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: spacing.lg, paddingVertical: 12, borderRadius: radius.pill, backgroundColor: colors.green },
  actionText: { color: colors.bg, fontSize: 13, fontWeight: '900' },
});
