import React from 'react';
import { Pressable, StyleSheet } from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { useTheme, useThemeColors } from '@/context/ThemeContext';

export default function ThemeToggle() {
  const { theme, setTheme } = useTheme();
  const C = useThemeColors();

  return (
    <Pressable
      onPress={() => {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        setTheme(theme === 'light' ? 'dark' : 'light');
      }}
      style={[styles.btn, { backgroundColor: C.cardBackground, borderColor: C.border }]}
    >
      <MaterialIcons
        name={theme === 'light' ? 'dark-mode' : 'light-mode'}
        size={20}
        color={C.accent}
      />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  btn: {
    width: 40, height: 40, borderRadius: 20, borderWidth: 1,
    justifyContent: 'center', alignItems: 'center',
  },
});
