import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { useThemeColors } from '@/context/ThemeContext';

interface CooldownTimerProps {
  remainingMs: number;
}

export default function CooldownTimer({ remainingMs }: CooldownTimerProps) {
  const Colors = useThemeColors();
  const hours = Math.floor(remainingMs / (1000 * 60 * 60));
  const minutes = Math.floor((remainingMs % (1000 * 60 * 60)) / (1000 * 60));
  const seconds = Math.floor((remainingMs % (1000 * 60)) / 1000);

  const pad = (n: number) => n.toString().padStart(2, '0');

  return (
    <View style={[styles.container, { backgroundColor: Colors.white, borderColor: Colors.border }]}>
      <View style={styles.iconRow}>
        <MaterialIcons name="nightlight-round" size={20} color={Colors.textSecondary} />
        <Text style={[styles.label, { color: Colors.textSecondary }]}>Come back tomorrow</Text>
      </View>
      <View style={styles.timerRow}>
        <View style={styles.timeUnit}>
          <Text style={[styles.timeValue, { color: Colors.textPrimary }]}>{pad(hours)}</Text>
          <Text style={[styles.timeLabel, { color: Colors.textTertiary }]}>hrs</Text>
        </View>
        <Text style={[styles.colon, { color: Colors.textTertiary }]}>:</Text>
        <View style={styles.timeUnit}>
          <Text style={[styles.timeValue, { color: Colors.textPrimary }]}>{pad(minutes)}</Text>
          <Text style={[styles.timeLabel, { color: Colors.textTertiary }]}>min</Text>
        </View>
        <Text style={[styles.colon, { color: Colors.textTertiary }]}>:</Text>
        <View style={styles.timeUnit}>
          <Text style={[styles.timeValue, { color: Colors.textPrimary }]}>{pad(seconds)}</Text>
          <Text style={[styles.timeLabel, { color: Colors.textTertiary }]}>sec</Text>
        </View>
      </View>
      <Text style={[styles.hint, { color: Colors.textTertiary }]}>Resets at midnight</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    borderRadius: 20,
    padding: 20,
    alignItems: 'center' as const,
    gap: 12,
    borderWidth: 1,
  },
  iconRow: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: 8,
  },
  label: {
    fontSize: 14,
    fontFamily: 'Inter_500Medium',
  },
  timerRow: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: 4,
  },
  timeUnit: {
    alignItems: 'center' as const,
    minWidth: 48,
  },
  timeValue: {
    fontSize: 32,
    fontFamily: 'Inter_700Bold',
  },
  timeLabel: {
    fontSize: 11,
    fontFamily: 'Inter_400Regular',
    marginTop: -2,
  },
  colon: {
    fontSize: 28,
    fontFamily: 'Inter_700Bold',
    marginBottom: 12,
  },
  hint: {
    fontSize: 12,
    fontFamily: 'Inter_400Regular',
  },
});
