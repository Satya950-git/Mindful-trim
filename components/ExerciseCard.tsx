import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { useThemeColors, usePillarColors, pillarIcons } from '@/context/ThemeContext';
import { Exercise } from '@/context/AppContext';

interface ExerciseCardProps {
  exercise: Exercise;
}

export default function ExerciseCard({ exercise }: ExerciseCardProps) {
  const Colors = useThemeColors();
  const pillarColors = usePillarColors();
  const colors = pillarColors[exercise.pillar] || pillarColors.Mental;
  const iconName = (pillarIcons[exercise.pillar] || 'psychology') as keyof typeof MaterialIcons.glyphMap;

  return (
    <View style={[styles.container, { backgroundColor: Colors.white, borderColor: colors.main + '30' }]}>
      <View style={[styles.header, { backgroundColor: colors.light }]}>
        <View style={[styles.iconBg, { backgroundColor: colors.main + '20' }]}>
          <MaterialIcons name={iconName} size={24} color={colors.main} />
        </View>
        <View style={styles.headerText}>
          <Text style={[styles.pillarLabel, { color: Colors.textPrimary }]}>{exercise.pillar}</Text>
        </View>
      </View>
      <View style={styles.body}>
        <Text style={[styles.exerciseName, { color: Colors.textPrimary }]}>{exercise.exerciseName}</Text>
        <Text style={[styles.description, { color: Colors.textSecondary }]}>{exercise.description}</Text>
        <View style={styles.meta}>
          <MaterialIcons name="timer" size={16} color={Colors.textSecondary} />
          <Text style={[styles.metaText, { color: Colors.textSecondary }]}>{exercise.durationMinutes} min</Text>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    borderRadius: 20,
    overflow: 'hidden',
    borderWidth: 1,
  },
  header: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    padding: 16,
    gap: 12,
  },
  iconBg: {
    width: 44,
    height: 44,
    borderRadius: 12,
    justifyContent: 'center' as const,
    alignItems: 'center' as const,
  },
  headerText: {
    flex: 1,
  },
  pillarLabel: {
    fontSize: 14,
    fontFamily: 'Inter_600SemiBold',
  },
  body: {
    padding: 16,
    paddingTop: 4,
    gap: 8,
  },
  exerciseName: {
    fontSize: 20,
    fontFamily: 'Inter_700Bold',
  },
  description: {
    fontSize: 15,
    fontFamily: 'Inter_400Regular',
    lineHeight: 22,
  },
  meta: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: 4,
    marginTop: 4,
  },
  metaText: {
    fontSize: 13,
    fontFamily: 'Inter_500Medium',
  },
});
