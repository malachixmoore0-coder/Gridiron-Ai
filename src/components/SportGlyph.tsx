/**
 * A sport mark, drawn rather than shipped.
 *
 * Nine leagues need a way to tell themselves apart at a glance, and four small
 * images would have meant four assets to keep in sync with the palette and four
 * more things to get wrong on a high-density screen. These are built from plain
 * views — a ball and its markings, reduced to the two or three strokes that
 * survive at twenty pixels — so they take a league's accent colour directly and
 * stay sharp at any size.
 *
 * The geometry is the same idea as the app mark: the ball, and a rising line
 * through it. Nothing decorative that a tab bar would throw away anyway.
 */
import React from 'react';
import { View, StyleSheet } from 'react-native';
import { colors } from '@/theme';
import type { SportId } from '@/sports/types';

interface Props {
  sport: SportId;
  size?: number;
  color?: string;
  /** Draw the tile behind it — off inside rows that already have a background. */
  tile?: boolean;
}

export function SportGlyph({ sport, size = 22, color = colors.green, tile }: Props) {
  const s = size;
  const stroke = Math.max(1, Math.round(s * 0.085));
  // The ball sits in the upper three-quarters; the rising rule takes the rest.
  const ball = Math.round(s * 0.64);
  const inset = (s - ball) / 2;
  const top = s * 0.04;

  const body = (
    <View style={{ width: s, height: s }} accessibilityLabel={`${sport} icon`}>
      {sport === 'football' ? (
        // A prolate spheroid is an ellipse on its side; borderRadius does the rest.
        <View style={[
          styles.abs,
          {
            left: (s - ball * 1.34) / 2, top: top + ball * 0.16, width: ball * 1.34, height: ball * 0.72,
            borderWidth: stroke, borderColor: color, borderRadius: ball * 0.42,
            transform: [{ rotate: '-19deg' }],
          },
        ]}>
          <View style={{ position: 'absolute', left: '30%', right: '30%', top: '46%', height: stroke, backgroundColor: color, borderRadius: stroke }} />
        </View>
      ) : (
        <View style={[
          styles.abs,
          { left: inset, top, width: ball, height: ball, borderWidth: stroke, borderColor: color, borderRadius: ball / 2, overflow: 'hidden' },
        ]}>
          {sport === 'basketball' && (
            <>
              {/* One meridian and one seam: any more and it turns to mud at 20px. */}
              <View style={{ position: 'absolute', left: ball / 2 - stroke / 2 - stroke, top: -stroke, bottom: -stroke, width: stroke, backgroundColor: color }} />
              <View style={{ position: 'absolute', top: ball / 2 - stroke / 2 - stroke, left: -stroke, right: -stroke, height: stroke, backgroundColor: color }} />
            </>
          )}
          {sport === 'baseball' && (
            <>
              {/* Two seams, drawn as arcs of a much larger circle. */}
              <View style={{ position: 'absolute', left: -ball * 0.62, top: -stroke, width: ball, height: ball + stroke * 2, borderWidth: stroke, borderColor: color, borderRadius: ball / 2, backgroundColor: 'transparent' }} />
              <View style={{ position: 'absolute', right: -ball * 0.62, top: -stroke, width: ball, height: ball + stroke * 2, borderWidth: stroke, borderColor: color, borderRadius: ball / 2, backgroundColor: 'transparent' }} />
            </>
          )}
          {sport === 'soccer' && (
            <View style={{
              position: 'absolute', left: ball * 0.22, top: ball * 0.22, width: ball * 0.42, height: ball * 0.42,
              backgroundColor: color, transform: [{ rotate: '15deg' }],
            }} />
          )}
        </View>
      )}

      {/* The rising rule: the market half of the mark, in every sport. */}
      <View style={[styles.abs, { left: s * 0.12, right: s * 0.12, bottom: 0, height: s * 0.16, flexDirection: 'row', alignItems: 'flex-end', gap: Math.max(1, s * 0.05) }]}>
        {[0.4, 0.68, 1].map((h) => (
          <View key={h} style={{ flex: 1, height: `${h * 100}%`, backgroundColor: color, opacity: 0.55 + h * 0.45, borderRadius: stroke / 2 }} />
        ))}
      </View>
    </View>
  );

  if (!tile) return body;
  return (
    <View style={[styles.tile, { width: s * 1.5, height: s * 1.5, borderRadius: s * 0.34 }]}>{body}</View>
  );
}

const styles = StyleSheet.create({
  abs: { position: 'absolute' },
  tile: { alignItems: 'center', justifyContent: 'center', backgroundColor: colors.cardAlt, borderWidth: 1, borderColor: colors.border },
});
