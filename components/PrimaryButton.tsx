import React from 'react';
import { Pressable, Text, StyleSheet, ActivityIndicator, ViewStyle } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import * as Haptics from 'expo-haptics';
import { useThemeColors } from '@/context/ThemeContext';

interface PrimaryButtonProps {
  title: string;
  onPress: () => void;
  loading?: boolean;
  disabled?: boolean;
  variant?: 'filled' | 'outline' | 'ghost';
  color?: string;
  gradientColors?: readonly [string, string];
  style?: ViewStyle;
}

export default function PrimaryButton({
  title,
  onPress,
  loading,
  disabled,
  variant = 'filled',
  color,
  gradientColors,
  style,
}: PrimaryButtonProps) {
  const Colors = useThemeColors();
  const buttonColor = color || Colors.accent;

  const handlePress = () => {
    if (disabled || loading) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    onPress();
  };

  if (variant === 'outline') {
    return (
      <Pressable
        onPress={handlePress}
        disabled={disabled || loading}
        style={({ pressed }) => [
          styles.button,
          styles.outline,
          { borderColor: buttonColor, opacity: pressed ? 0.8 : disabled ? 0.5 : 1 },
          style,
        ]}
      >
        {loading ? (
          <ActivityIndicator color={buttonColor} size="small" />
        ) : (
          <Text style={[styles.text, { color: buttonColor }]}>{title}</Text>
        )}
      </Pressable>
    );
  }

  if (variant === 'ghost') {
    return (
      <Pressable
        onPress={handlePress}
        disabled={disabled || loading}
        style={({ pressed }) => [
          styles.ghost,
          { opacity: pressed ? 0.6 : disabled ? 0.4 : 1 },
          style,
        ]}
      >
        <Text style={[styles.ghostText, { color: buttonColor }]}>{title}</Text>
      </Pressable>
    );
  }

  return (
    <Pressable
      onPress={handlePress}
      disabled={disabled || loading}
      style={({ pressed }) => [{ opacity: pressed ? 0.9 : disabled ? 0.5 : 1, transform: [{ scale: pressed ? 0.98 : 1 }] }, style]}
    >
      <LinearGradient
        colors={gradientColors || [buttonColor, buttonColor]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 0 }}
        style={styles.button}
      >
        {loading ? (
          <ActivityIndicator color="#fff" size="small" />
        ) : (
          <Text style={[styles.text, { color: '#fff' }]}>{title}</Text>
        )}
      </LinearGradient>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: {
    height: 52,
    borderRadius: 16,
    justifyContent: 'center' as const,
    alignItems: 'center' as const,
    paddingHorizontal: 24,
  },
  outline: {
    borderWidth: 1.5,
    backgroundColor: 'transparent',
  },
  ghost: {
    height: 44,
    justifyContent: 'center' as const,
    alignItems: 'center' as const,
  },
  text: {
    fontSize: 16,
    fontFamily: 'Inter_600SemiBold',
  },
  ghostText: {
    fontSize: 15,
    fontFamily: 'Inter_500Medium',
  },
});
