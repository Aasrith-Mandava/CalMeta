import { useEffect, useState } from 'react';
import { AccessibilityInfo, Animated, Easing, StyleSheet, Text, View } from 'react-native';

import { colors } from '@/theme';

/** The two people keep their own rings; a third orbit holds the time they share. */
export function Orbit({ joined = false, complete = false, left = 'You', right = '?' }: {
  joined?: boolean; complete?: boolean; left?: string; right?: string;
}) {
  const [reduceMotion, setReduceMotion] = useState(true);
  const [breathe] = useState(() => new Animated.Value(0));
  const [merge] = useState(() => new Animated.Value(joined ? 1 : 0));
  const [spin] = useState(() => new Animated.Value(0));

  useEffect(() => {
    let alive = true;
    AccessibilityInfo.isReduceMotionEnabled().then((value) => { if (alive) setReduceMotion(value); });
    const subscription = AccessibilityInfo.addEventListener('reduceMotionChanged', setReduceMotion);
    return () => { alive = false; subscription.remove(); };
  }, []);

  useEffect(() => {
    if (reduceMotion) { breathe.setValue(0); spin.setValue(0); return; }
    const pulse = Animated.loop(Animated.sequence([
      Animated.timing(breathe, { toValue: 1, duration: 1600, easing: Easing.inOut(Easing.sin), useNativeDriver: true, isInteraction: false }),
      Animated.timing(breathe, { toValue: 0, duration: 1600, easing: Easing.inOut(Easing.sin), useNativeDriver: true, isInteraction: false }),
    ]));
    const orbit = Animated.loop(Animated.timing(spin, {
      toValue: 1, duration: 16000, easing: Easing.linear, useNativeDriver: true, isInteraction: false,
    }));
    pulse.start(); orbit.start();
    return () => { pulse.stop(); orbit.stop(); };
  }, [breathe, spin, reduceMotion]);

  useEffect(() => {
    const motion = Animated.timing(merge, {
      toValue: joined ? 1 : 0, duration: reduceMotion ? 0 : 850,
      easing: Easing.out(Easing.cubic), useNativeDriver: true,
    });
    motion.start();
    return () => motion.stop();
  }, [joined, merge, reduceMotion]);

  return (
    <View style={styles.stage} accessible accessibilityLabel={complete ? 'A shared memory added to your friendship' : joined ? `${left} and ${right}, connected` : 'Two people ready to meet'}>
      <Animated.View style={[styles.halo, {
        opacity: breathe.interpolate({ inputRange: [0, 1], outputRange: [0.15, 0.4] }),
        transform: [{ scale: breathe.interpolate({ inputRange: [0, 1], outputRange: [0.94, 1.08] }) }],
      }]} />
      <Animated.View style={[styles.orbit, { opacity: merge, transform: [{ rotate: spin.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '360deg'] }) }] }]}>
        <View style={[styles.star, complete && styles.starComplete]} />
        <View style={styles.smallStar} />
      </Animated.View>
      <Animated.View style={[styles.person, styles.left, {
        transform: [{ translateX: merge.interpolate({ inputRange: [0, 1], outputRange: [-26, 7] }) }, { scale: breathe.interpolate({ inputRange: [0, 1], outputRange: [1, 1.035] }) }],
      }]}><Text style={styles.initial}>{left.slice(0, 1).toUpperCase()}</Text></Animated.View>
      <Animated.View style={[styles.person, styles.right, {
        transform: [{ translateX: merge.interpolate({ inputRange: [0, 1], outputRange: [26, -7] }) }, { scale: breathe.interpolate({ inputRange: [0, 1], outputRange: [1.035, 1] }) }],
      }]}><Text style={[styles.initial, styles.rightInitial]}>{right.slice(0, 1).toUpperCase()}</Text></Animated.View>
      <Animated.View style={[styles.spark, { opacity: merge, transform: [{ scale: merge }] }]}>
        <Text style={styles.sparkText}>{complete ? '✓' : '✦'}</Text>
      </Animated.View>
    </View>
  );
}

export function Reveal({ children, delay = 0 }: { children: React.ReactNode; delay?: number }) {
  const [reveal] = useState(() => new Animated.Value(0));
  useEffect(() => {
    let animation: Animated.CompositeAnimation | undefined;
    let alive = true;
    AccessibilityInfo.isReduceMotionEnabled().then((reduced) => {
      if (!alive) return;
      if (reduced) { reveal.setValue(1); return; }
      animation = Animated.timing(reveal, { toValue: 1, delay, duration: 550, easing: Easing.out(Easing.cubic), useNativeDriver: true });
      animation.start();
    });
    return () => { alive = false; animation?.stop(); };
  }, [delay, reveal]);
  return <Animated.View style={{ opacity: reveal, transform: [{ translateY: reveal.interpolate({ inputRange: [0, 1], outputRange: [14, 0] }) }] }}>{children}</Animated.View>;
}

const styles = StyleSheet.create({
  stage: { height: 235, alignItems: 'center', justifyContent: 'center' },
  halo: { position: 'absolute', width: 210, height: 210, borderRadius: 105, backgroundColor: colors.accentSoft },
  orbit: { position: 'absolute', width: 198, height: 198, borderRadius: 99, borderWidth: 1, borderColor: colors.accent },
  star: { position: 'absolute', top: -5, left: 91, width: 10, height: 10, borderRadius: 5, backgroundColor: colors.accent },
  starComplete: { backgroundColor: '#297B5D' },
  smallStar: { position: 'absolute', bottom: 12, right: 33, width: 6, height: 6, borderRadius: 3, backgroundColor: '#D29D48' },
  person: { position: 'absolute', width: 92, height: 92, borderRadius: 46, borderWidth: 2, alignItems: 'center', justifyContent: 'center' },
  left: { marginLeft: -68, backgroundColor: '#EEEBFF', borderColor: colors.accent },
  right: { marginLeft: 68, backgroundColor: '#FFF4E5', borderColor: '#B37B36' },
  initial: { fontSize: 30, fontWeight: '600', color: colors.accent },
  rightInitial: { color: '#946222' },
  spark: { width: 34, height: 34, borderRadius: 17, backgroundColor: colors.dark, alignItems: 'center', justifyContent: 'center' },
  sparkText: { color: '#FFF', fontSize: 20 },
});
