import React, { useEffect, useRef } from 'react';
import { View, Text, StyleSheet, Animated } from 'react-native';
import { useThemeColors, ThemeColors } from '@/context/ThemeContext';
import { ProgressionState } from '@/context/AppContext';

interface XPBarProps {
  progression: ProgressionState;
  compact?: boolean;
}

export default function XPBar({ progression, compact = false }: XPBarProps) {
  const Colors = useThemeColors();
  const styles = makeStyles(Colors);
  const fillAnim = useRef(new Animated.Value(0)).current;

  const pct = Math.max(0, Math.min(1, progression.currentLevelProgressPercent / 100));

  useEffect(() => {
    Animated.timing(fillAnim, {
      toValue: pct,
      duration: 600,
      useNativeDriver: false,
    }).start();
  }, [pct]);

  const widthInterp = fillAnim.interpolate({
    inputRange: [0, 1],
    outputRange: ['0%', '100%'],
  });

  if (compact) {
    return (
      <View style={styles.compactContainer}>
        <View style={styles.compactTopRow}>
          <View style={styles.compactLevelRow}>
            <View style={[styles.compactLevelBadge, { backgroundColor: Colors.accent }]}>
              <Text style={styles.compactLevelText}>Lv {progression.currentLevel}</Text>
            </View>
            <Text style={[styles.compactPhase, { color: Colors.textSecondary }]}>
              {progression.currentPhase}
            </Text>
          </View>
          <Text style={[styles.compactXp, { color: Colors.textTertiary }]}>
            {progression.totalXp} XP
          </Text>
        </View>
        <View style={styles.compactTrack}>
          <Animated.View style={[styles.compactFill, { width: widthInterp }]} />
        </View>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.row}>
        <View style={styles.levelBadge}>
          <Text style={styles.levelText}>Lv {progression.currentLevel}</Text>
        </View>
        <Text style={styles.phase}>{progression.currentPhase}</Text>
        <Text style={styles.xpTotal}>{progression.totalXp} XP</Text>
      </View>
      <View style={styles.track}>
        <Animated.View style={[styles.fill, { width: widthInterp }]} />
      </View>
      <View style={styles.footer}>
        <Text style={styles.footerText}>{progression.currentPhaseLevelRange}</Text>
        <Text style={styles.footerText}>{progression.currentLevelProgressPercent}% to Lv {progression.currentLevel + 1}</Text>
        <Text style={styles.footerText}>{progression.yearProgressPercent.toFixed(1)}% Year</Text>
      </View>
    </View>
  );
}

const makeStyles = (Colors: ThemeColors) => StyleSheet.create({
  container: {
    gap: 8,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  levelBadge: {
    backgroundColor: Colors.accent,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
  },
  levelText: {
    fontSize: 12,
    fontFamily: 'Inter_700Bold',
    color: '#fff',
  },
  phase: {
    flex: 1,
    fontSize: 13,
    fontFamily: 'Inter_500Medium',
    color: Colors.textSecondary,
  },
  xpTotal: {
    fontSize: 12,
    fontFamily: 'Inter_600SemiBold',
    color: Colors.accent,
  },
  track: {
    height: 7,
    backgroundColor: Colors.border,
    borderRadius: 4,
    overflow: 'hidden',
  },
  fill: {
    height: '100%',
    backgroundColor: Colors.accent,
    borderRadius: 4,
  },
  footer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  footerText: {
    fontSize: 11,
    fontFamily: 'Inter_400Regular',
    color: Colors.textTertiary,
  },

  compactContainer: {
    gap: 5,
  },
  compactTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  compactLevelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
  },
  compactLevelBadge: {
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 7,
  },
  compactLevelText: {
    fontSize: 11,
    fontFamily: 'Inter_700Bold',
    color: '#fff',
  },
  compactPhase: {
    fontSize: 12,
    fontFamily: 'Inter_500Medium',
  },
  compactTrack: {
    height: 5,
    backgroundColor: Colors.border,
    borderRadius: 3,
    overflow: 'hidden',
  },
  compactFill: {
    height: '100%',
    backgroundColor: Colors.accent,
    borderRadius: 3,
  },
  compactXp: {
    fontSize: 11,
    fontFamily: 'Inter_500Medium',
  },
});
