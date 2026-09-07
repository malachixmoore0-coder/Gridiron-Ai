import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { colors, radius } from '@/theme';

interface Props {
  awayPct: number;
  homePct: number;
  awayAbbr: string;
  homeAbbr: string;
  height?: number;
  /**
   * Soccer's third outcome. Passing it puts a real segment in the bar rather
   * than quietly renormalising it away — a bar that reads 41/59 on a match the
   * model gives a 22% chance of ending level is telling the wrong story.
   */
  drawPct?: number;
}

/** Win-probability bar: away on the left, home on the right, draws in between. */
export function ProbBar({ awayPct, homePct, awayAbbr, homeAbbr, height = 14, drawPct = 0 }: Props) {
  const draw = Math.max(0, drawPct);
  const total = Math.max(awayPct + homePct + draw, 1);
  return (
    <View>
      <View style={[styles.track, { height }]}>
        <View style={[styles.away, { flex: awayPct / total }]} />
        {draw > 0 && <View style={[styles.draw, { flex: draw / total }]} />}
        <View style={[styles.home, { flex: homePct / total }]} />
      </View>
      <View style={styles.labels}>
        <Text style={[styles.label, { color: colors.away }]}>{awayAbbr} {awayPct.toFixed(1)}%</Text>
        {draw > 0 && <Text style={[styles.label, { color: colors.gold }]}>Draw {draw.toFixed(1)}%</Text>}
        <Text style={[styles.label, { color: colors.home }]}>{homePct.toFixed(1)}% {homeAbbr}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  track: { flexDirection: 'row', borderRadius: radius.pill, overflow: 'hidden', backgroundColor: colors.cardAlt },
  away: { backgroundColor: colors.away },
  draw: { backgroundColor: colors.gold },
  home: { backgroundColor: colors.home },
  labels: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 6 },
  label: { fontSize: 12, fontWeight: '800' },
});
