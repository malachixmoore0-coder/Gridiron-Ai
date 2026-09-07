import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { colors, spacing } from '@/theme';

interface Props { bins: { from: number; to: number; pct: number }[]; awayAbbr: string; homeAbbr: string; }

/** Margin distribution: left of centre = away wins, right = home wins. */
export function Histogram({ bins, awayAbbr, homeAbbr }: Props) {
  const max = Math.max(...bins.map((b) => b.pct), 1);
  return (
    <View>
      <View style={styles.bars}>
        {bins.map((b) => {
          const homeSide = b.from >= 0;
          return (
            <View key={`${b.from}`} style={styles.col}>
              <View style={[styles.bar, { height: `${(b.pct / max) * 100}%`, backgroundColor: homeSide ? colors.home : colors.away, opacity: 0.5 + (b.pct / max) * 0.5 }]} />
            </View>
          );
        })}
      </View>
      <View style={styles.axis}>
        {/* The edge labels have to come from the bins: a soccer histogram spans
            ten goals, not thirty points, and a hard-coded number would lie. */}
        <Text style={[styles.axisText, { color: colors.away }]}>{awayAbbr} by {Math.abs(bins[0]?.to ?? 30)}+</Text>
        <Text style={styles.axisText}>margin</Text>
        <Text style={[styles.axisText, { color: colors.home }]}>{homeAbbr} by {Math.abs(bins[bins.length - 1]?.from ?? 30)}+</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  bars: { flexDirection: 'row', alignItems: 'flex-end', height: 80, gap: 2, borderBottomWidth: 1, borderBottomColor: colors.border, paddingBottom: 2 },
  col: { flex: 1, height: '100%', justifyContent: 'flex-end' },
  bar: { width: '100%', borderTopLeftRadius: 3, borderTopRightRadius: 3, minHeight: 1 },
  axis: { flexDirection: 'row', justifyContent: 'space-between', marginTop: spacing.xs },
  axisText: { color: colors.inkFaint, fontSize: 10, fontWeight: '700' },
});
