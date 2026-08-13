import React from 'react';
import { Pressable, Text, StyleSheet, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { MaterialIcons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { usePillarColors, pillarIcons } from '@/context/ThemeContext';

interface PillarCardProps {
  pillar: string;
  onPress: () => void;
  disabled?: boolean;
  exercisesRemaining?: number;
}

export default function PillarCard({ pillar, onPress, disabled, exercisesRemaining }: PillarCardProps) {
  const pillarColors = usePillarColors();
  const colors = pillarColors[pillar] || pillarColors.Mental;
  const iconName = (pillarIcons[pillar] || 'psychology') as keyof typeof MaterialIcons.glyphMap;

  const handlePress = () => {
    if (disabled) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    onPress();
  };

  return (
    <Pressable
      onPress={handlePress}
      disabled={disabled}
      style={({ pressed }) => [
        styles.container,
        { opacity: pressed ? 0.9 : disabled ? 0.5 : 1, transform: [{ scale: pressed ? 0.97 : 1 }] },
      ]}
    >
      <LinearGradient
        colors={[colors.gradient[0], colors.gradient[1]]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={styles.gradient}
      >
        <View style={styles.iconContainer}>
          <MaterialIcons name={iconName} size={28} color="rgba(255,255,255,0.95)" />
        </View>
        <Text style={styles.pillarName}>{pillar}</Text>
        {typeof exercisesRemaining === 'number' && (
          <Text style={styles.remaining}>{exercisesRemaining} left</Text>
        )}
      </LinearGradient>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  container: {
    width: '48%',
    aspectRatio: 1.1,
    borderRadius: 20,
    overflow: 'hidden',
    marginBottom: 12,
  },
  gradient: {
    flex: 1,
    padding: 16,
    justifyContent: 'space-between' as const,
  },
  iconContainer: {
    width: 48,
    height: 48,
    borderRadius: 14,
    backgroundColor: 'rgba(255,255,255,0.2)',
    justifyContent: 'center' as const,
    alignItems: 'center' as const,
  },
  pillarName: {
    fontSize: 18,
    fontFamily: 'Inter_700Bold',
    color: '#fff',
  },
  remaining: {
    fontSize: 12,
    fontFamily: 'Inter_400Regular',
    color: 'rgba(255,255,255,0.7)',
    marginTop: -4,
  },
});
