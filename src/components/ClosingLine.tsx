/**
 * Beat the close.
 *
 * The same panel wherever a track record is shown, because the question is the
 * same in every league and the answer has to be computed the same way. It is
 * free at every tier on purpose: it is the argument for the rest of the app,
 * and an argument you have to pay to hear is not an argument.
 */
import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { colors, numeric, radius, spacing } from '@/theme';
import type { ClvSummary } from '@/utils/clv';

interface Props {
  clv: ClvSummary;
  /** What a point of handicap is called here: point, run, goal. */
  unit: string;
}

export function ClosingLine({ clv, unit }: Props) {
  if (!clv.graded) return null;
  const good = (clv.hitRate ?? 0) >= 50;

  return (
    <View style={styles.card}>
      <View style={styles.head}>
        <View style={{ flex: 1 }}>
          <Text style={styles.title}>Beat the close</Text>
          <Text style={styles.muted}>
            How often the number got worse after the model called it. The closing line is the market&apos;s last word,
            so beating it is evidence of an edge before any game has landed.
          </Text>
        </View>
        <Text style={[styles.big, numeric, { color: good ? colors.green : colors.ink }]}>
          {clv.hitRate?.toFixed(0)}%
        </Text>
      </View>

      <View style={styles.row}>
        <Cell label="CALLS SCORED" value={`${clv.graded}`} />
        <Cell label="BEAT THE CLOSE" value={`${clv.beat}`} />
        {clv.avgPoints !== null && (
          <Cell
            label={`AVG ${unit.toUpperCase()}S`}
            value={`${clv.avgPoints > 0 ? '+' : ''}${clv.avgPoints.toFixed(2)}`}
            tone={clv.avgPoints > 0 ? colors.green : colors.inkDim}
          />
        )}
        {clv.avgPct !== null && (
          <Cell
            label="AVG VS PRICE"
            value={`${clv.avgPct > 0 ? '+' : ''}${clv.avgPct.toFixed(1)}%`}
            tone={clv.avgPct > 0 ? colors.green : colors.inkDim}
          />
        )}
      </View>

      <Text style={styles.fine}>
        Measured from the first number we published on a game to the last one before it started. Games the market never
        priced, and games priced only after kickoff, are not counted.
      </Text>
    </View>
  );
}

function Cell({ label, value, tone }: { label: string; value: string; tone?: string }) {
  return (
    <View style={{ flex: 1 }}>
      <Text style={styles.label}>{label}</Text>
      <Text style={[styles.val, numeric, !!tone && { color: tone }]}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  card: { backgroundColor: colors.card, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border, padding: spacing.lg, marginBottom: spacing.lg },
  head: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.md },
  title: { color: colors.ink, fontSize: 16, fontWeight: '800' },
  muted: { color: colors.inkFaint, fontSize: 11.5, lineHeight: 16, marginTop: 3 },
  big: { fontSize: 30, fontWeight: '900' },
  row: { flexDirection: 'row', marginTop: spacing.md, gap: spacing.md },
  label: { color: colors.inkFaint, fontSize: 8.5, fontWeight: '900', letterSpacing: 0.6 },
  val: { color: colors.ink, fontSize: 17, fontWeight: '900', marginTop: 2 },
  fine: { color: colors.inkGhost, fontSize: 10, lineHeight: 14, marginTop: spacing.md },
});
