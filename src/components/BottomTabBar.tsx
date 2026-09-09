/**
 * The dock.
 *
 * Five destinations, evenly weighted, and no action button competing with them
 * — Simulate is a floating control instead, because it is something you do, not
 * somewhere you go. Icons sit above short labels so the bar reads at a glance
 * on a phone in a dark room.
 */
import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { colors, spacing } from '@/theme';

export type TabKey = 'home' | 'slate' | 'record' | 'teams' | 'social';

const TABS: { key: TabKey; label: string; icon: keyof typeof Ionicons.glyphMap; on: keyof typeof Ionicons.glyphMap }[] = [
  { key: 'home', label: 'Pond', icon: 'water-outline', on: 'water' },
  { key: 'slate', label: 'Slate', icon: 'calendar-outline', on: 'calendar' },
  { key: 'record', label: 'Record', icon: 'ribbon-outline', on: 'ribbon' },
  { key: 'teams', label: 'Teams', icon: 'shield-outline', on: 'shield' },
  { key: 'social', label: 'Social', icon: 'people-outline', on: 'people' },
];

interface Props { active: TabKey; onChange: (t: TabKey) => void; badge?: number; }

export function BottomTabBar({ active, onChange, badge }: Props) {
  return (
    <SafeAreaView edges={['bottom']} style={styles.safe}>
      <View style={styles.bar}>
        {TABS.map((tab) => {
          const on = tab.key === active;
          return (
            <TouchableOpacity
              key={tab.key}
              style={styles.tab}
              activeOpacity={0.7}
              onPress={() => onChange(tab.key)}
              accessibilityRole="tab"
              accessibilityState={{ selected: on }}
              accessibilityLabel={tab.label}
            >
              <View style={[styles.iconWrap, on && styles.iconWrapOn]}>
                <Ionicons name={on ? tab.on : tab.icon} size={20} color={on ? colors.green : colors.inkFaint} />
                {tab.key === 'teams' && !!badge && <View style={styles.badge}><Text style={styles.badgeText}>{badge}</Text></View>}
              </View>
              <Text style={[styles.label, on && styles.labelOn]}>{tab.label}</Text>
            </TouchableOpacity>
          );
        })}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { backgroundColor: colors.bgAlt, borderTopWidth: 1, borderTopColor: colors.border },
  bar: { flexDirection: 'row', alignItems: 'center', paddingTop: 6, paddingBottom: 2, paddingHorizontal: spacing.xs },
  tab: { flex: 1, alignItems: 'center', gap: 2, paddingVertical: 4 },
  iconWrap: { width: 46, height: 26, borderRadius: 999, alignItems: 'center', justifyContent: 'center' },
  iconWrapOn: { backgroundColor: colors.greenSoft },
  label: { color: colors.inkFaint, fontSize: 9.5, fontWeight: '800', letterSpacing: 0.2 },
  labelOn: { color: colors.green },
  badge: { position: 'absolute', top: -2, right: 6, minWidth: 15, height: 15, borderRadius: 8, paddingHorizontal: 4, backgroundColor: colors.gold, alignItems: 'center', justifyContent: 'center' },
  badgeText: { color: colors.bg, fontSize: 9, fontWeight: '900' },
});
