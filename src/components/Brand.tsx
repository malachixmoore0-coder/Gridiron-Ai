/**
 * The brand, in one place.
 *
 * The mark is a toad's head reduced to the two things that make one
 * recognisable at any size: eyes that sit on top of the head rather than in it,
 * and a wide, level, unimpressed mouth. Everything else about a toad is noise
 * below thirty-two pixels.
 *
 * It is flat and two-colour on purpose, and the mouth is deliberately straight.
 * An earlier pass curved it and the whole thing read as a cartoon frog, which
 * is the wrong promise for a product whose argument is that it will show you
 * the error bar rather than the good night.
 */
import React from 'react';
import { View, Text, Image, StyleSheet } from 'react-native';
import { colors, type as T } from '@/theme';

// eslint-disable-next-line @typescript-eslint/no-var-requires
export const MARK = require('../../assets/logo-mark.png');

export function BrandMark({ size = 32, radius }: { size?: number; radius?: number }) {
  return (
    <Image
      source={MARK}
      style={{ width: size, height: size, borderRadius: radius ?? size * 0.225 }}
      resizeMode="contain"
      accessibilityLabel="Simtoad"
    />
  );
}

/** SIM in ink, TOAD in money. The two-tone split is the whole wordmark — and
 *  it lands better here than it did before, because the seam is inside a single
 *  word rather than between a name and an initialism. */
export function Wordmark({ size = 20, style }: { size?: number; style?: object }) {
  return (
    <Text style={[styles.word, { fontSize: size, letterSpacing: -size * 0.02 }, style]} accessibilityRole="header">
      SIM<Text style={{ color: colors.green }}>TOAD</Text>
    </Text>
  );
}

export function BrandLockup({ size = 30, gap = 10 }: { size?: number; gap?: number }) {
  return (
    <View style={[styles.lockup, { gap }]}>
      <BrandMark size={size} />
      <Wordmark size={size * 0.62} />
    </View>
  );
}

const styles = StyleSheet.create({
  word: { ...T.title, color: colors.ink, fontWeight: '900' },
  lockup: { flexDirection: 'row', alignItems: 'center' },
});
