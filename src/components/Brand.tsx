/**
 * The brand, in one place.
 *
 * The mark is a tilted football with a rising bar chart for laces — football
 * and market in one glyph — on an emerald tile. It is deliberately flat and
 * two-colour so it survives being 20 pixels tall on a tab bar, which is where a
 * logo actually has to work.
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
      accessibilityLabel="Gridiron AI"
    />
  );
}

/** GRIDIRON in ink, AI in money. The two-tone split is the whole wordmark. */
export function Wordmark({ size = 20, style }: { size?: number; style?: object }) {
  return (
    <Text style={[styles.word, { fontSize: size, letterSpacing: -size * 0.02 }, style]} accessibilityRole="header">
      GRIDIRON<Text style={{ color: colors.green }}> AI</Text>
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
