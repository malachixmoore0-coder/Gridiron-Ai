/**
 * The open.
 *
 * Underdog and PrizePicks both spend about a second on a logo before the app
 * appears, and it is not vanity: a cold start has to load a dataset anyway, and
 * a branded beat is a better use of that second than a white flash. This is the
 * same idea — mark springs in, wordmark rises under it, a line sweeps, then the
 * whole thing lifts away.
 *
 * It runs once per cold start, is tappable to skip, and respects reduce-motion
 * by cutting straight to a static hold.
 */
import React, { useEffect, useRef, useState } from 'react';
import { View, Text, Animated, Easing, StyleSheet, Pressable, AccessibilityInfo } from 'react-native';
import { colors, type as T } from '@/theme';
import { BrandMark } from '@/components/Brand';

const HOLD_MS = 320;

export function SplashGate({ children }: { children: React.ReactNode }) {
  const [done, setDone] = useState(false);
  const mark = useRef(new Animated.Value(0)).current;   // 0 → 1 pop
  const word = useRef(new Animated.Value(0)).current;   // 0 → 1 rise
  const rule = useRef(new Animated.Value(0)).current;   // 0 → 1 sweep
  const out = useRef(new Animated.Value(1)).current;    // 1 → 0 lift
  const finished = useRef(false);

  const finish = () => {
    if (finished.current) return;
    finished.current = true;
    Animated.timing(out, { toValue: 0, duration: 260, easing: Easing.in(Easing.quad), useNativeDriver: true })
      .start(() => setDone(true));
  };

  useEffect(() => {
    let cancelled = false;
    AccessibilityInfo.isReduceMotionEnabled?.().then((reduced) => {
      if (cancelled) return;
      if (reduced) {
        mark.setValue(1); word.setValue(1); rule.setValue(1);
        setTimeout(finish, 500);
        return;
      }
      Animated.sequence([
        Animated.spring(mark, { toValue: 1, useNativeDriver: true, friction: 6, tension: 90 }),
        Animated.parallel([
          Animated.timing(word, { toValue: 1, duration: 240, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
          Animated.timing(rule, { toValue: 1, duration: 420, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
        ]),
        Animated.delay(HOLD_MS),
      ]).start(finish);
    }).catch(() => { mark.setValue(1); word.setValue(1); rule.setValue(1); setTimeout(finish, 600); });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (done) return <>{children}</>;

  return (
    <View style={styles.root}>
      {children}
      <Animated.View style={[StyleSheet.absoluteFill, styles.cover, { opacity: out }]}>
        <Pressable style={styles.press} onPress={finish} accessibilityRole="button" accessibilityLabel="Skip intro">
          <Animated.View
            style={{
              opacity: mark,
              transform: [
                { scale: mark.interpolate({ inputRange: [0, 1], outputRange: [0.72, 1] }) },
                { translateY: mark.interpolate({ inputRange: [0, 1], outputRange: [14, 0] }) },
              ],
            }}
          >
            <BrandMark size={96} />
          </Animated.View>

          <Animated.View
            style={{
              opacity: word,
              transform: [{ translateY: word.interpolate({ inputRange: [0, 1], outputRange: [12, 0] }) }],
              marginTop: 22,
            }}
          >
            <Text style={styles.word}>GRIDIRON<Text style={{ color: colors.green }}> AI</Text></Text>
          </Animated.View>

          <View style={styles.ruleTrack}>
            <Animated.View
              style={[styles.rule, {
                transform: [{ scaleX: rule }],
              }]}
            />
          </View>

          <Animated.Text style={[styles.tag, { opacity: word }]}>
            Two leagues. One model. Graded in public.
          </Animated.Text>
        </Pressable>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  cover: { backgroundColor: colors.bg, alignItems: 'center', justifyContent: 'center' },
  press: { flex: 1, alignSelf: 'stretch', alignItems: 'center', justifyContent: 'center' },
  word: { ...T.title, color: colors.ink, fontSize: 30, fontWeight: '900', letterSpacing: -0.6 },
  ruleTrack: { width: 132, height: 2, marginTop: 16, backgroundColor: colors.divider, overflow: 'hidden' },
  rule: { width: '100%', height: 2, backgroundColor: colors.green },
  tag: { color: colors.inkFaint, fontSize: 12, fontWeight: '700', marginTop: 18, letterSpacing: 0.2 },
});
