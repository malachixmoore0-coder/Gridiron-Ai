/**
 * A sport mark, drawn rather than shipped.
 *
 * Eighteen leagues across six sports need a way to tell themselves apart at a
 * glance, and six images would have meant six assets to keep in sync with the
 * palette and six more things to get wrong on a high-density screen. These are
 * vector paths on a shared 24-unit grid, so they take a league's accent colour
 * directly and stay sharp at any size.
 *
 * The rule that decided every one of them: only the strokes that survive at
 * thirteen points. A basketball is a circle with a meridian, an equator and two
 * bowed seams — the four lines that make a circle read as *that* ball. Add the
 * fifth and it turns to mud in the sport chip bar, which is where these are
 * mostly seen. The stroke thickens on the small sizes for the same reason: a
 * hairline at 13pt is a smudge, not a line.
 */
import React from 'react';
import { View, StyleSheet } from 'react-native';
import Svg, { Circle, Ellipse, G, Path, Polygon } from 'react-native-svg';
import { colors } from '@/theme';
import type { SportId } from '@/sports/types';

interface Props {
  sport: SportId;
  size?: number;
  color?: string;
  /** Draw the tile behind it — off inside rows that already have a background. */
  tile?: boolean;
}

/** Marks are authored on a 24-unit grid and scaled by the Svg viewBox. */
const BOX = 24;

export function SportGlyph({ sport, size = 22, color = colors.green, tile }: Props) {
  // Small marks need a heavier line or the strokes disappear between pixels.
  const w = size <= 16 ? 2.2 : size <= 24 ? 1.9 : 1.7;
  const line = { stroke: color, strokeWidth: w, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const, fill: 'none' };

  const body = (
    <Svg width={size} height={size} viewBox={`0 0 ${BOX} ${BOX}`} accessibilityLabel={`${sport} icon`}>
      {sport === 'football' && (
        // A prolate spheroid is an ellipse on its side. The laces are the only
        // detail that says "football" rather than "egg", so they stay.
        <G rotation={-22} origin="12, 12">
          <Ellipse cx={12} cy={12} rx={9} ry={5.6} {...line} />
          <Path d="M9.3 12 H14.7" {...line} strokeWidth={w * 0.85} />
          <Path d="M10.4 10.9 V13.1 M12 10.7 V13.3 M13.6 10.9 V13.1" {...line} strokeWidth={w * 0.75} />
        </G>
      )}

      {sport === 'basketball' && (
        <>
          <Circle cx={12} cy={12} r={9} {...line} />
          <Path d="M12 3 V21 M3 12 H21" {...line} />
          <Path d="M5.1 5.4 C8.3 8.6 8.3 15.4 5.1 18.6" {...line} />
          <Path d="M18.9 5.4 C15.7 8.6 15.7 15.4 18.9 18.6" {...line} />
        </>
      )}

      {sport === 'baseball' && (
        <>
          <Circle cx={12} cy={12} r={9} {...line} />
          {/* Two seams bowed toward the middle, plus the stitches that stop it
              reading as a volleyball. */}
          <Path d="M6.3 4.7 C9.1 8.1 9.1 15.9 6.3 19.3" {...line} />
          <Path d="M17.7 4.7 C14.9 8.1 14.9 15.9 17.7 19.3" {...line} />
          <Path
            d="M7.1 8.4 H8.9 M7.5 12 H9.3 M7.1 15.6 H8.9 M15.1 8.4 H16.9 M14.7 12 H16.5 M15.1 15.6 H16.9"
            {...line}
            strokeWidth={w * 0.7}
          />
        </>
      )}

      {sport === 'soccer' && (
        <>
          <Circle cx={12} cy={12} r={9} {...line} />
          {/* The centre pentagon is drawn open, not filled, and its seams run
              all the way to the rim: filled, with five even spokes stopping
              short, the whole mark reads as a wheel. */}
          <Polygon points="12,7.8 15.99,10.7 14.47,15.4 9.53,15.4 8.01,10.7" {...line} />
          <Path
            d="M12 7.8 V3.2 M15.99 10.7 L20.37 9.28 M14.47 15.4 L17.17 19.12 M9.53 15.4 L6.83 19.12 M8.01 10.7 L3.63 9.28"
            {...line}
            strokeWidth={w * 0.85}
          />
        </>
      )}

      {sport === 'hockey' && (
        <>
          {/* Stick and puck. Crossed sticks are unreadable below twenty points,
              and an outlined puck reads as a hoop — so the puck is solid. */}
          <Path d="M6.6 3.4 L13.2 14.8 C14 16.2 15.2 16.9 16.8 16.9 L20.2 16.9" {...line} />
          <Ellipse cx={6.4} cy={18.8} rx={3.6} ry={2} fill={color} />
        </>
      )}

      {sport === 'golf' && (
        <>
          {/* A pin in the cup reads at any size; a dimpled ball does not. */}
          <Path d="M9 19.6 V3.6" {...line} />
          <Path d="M9 4.1 L18.4 7.4 L9 10.7 Z" fill={color} />
          <Ellipse cx={9} cy={20} rx={4.2} ry={1.6} {...line} />
        </>
      )}
    </Svg>
  );

  if (!tile) return body;
  return (
    <View style={[styles.tile, { width: size * 1.5, height: size * 1.5, borderRadius: size * 0.34 }]}>{body}</View>
  );
}

const styles = StyleSheet.create({
  tile: { alignItems: 'center', justifyContent: 'center', backgroundColor: colors.cardAlt, borderWidth: 1, borderColor: colors.border },
});
