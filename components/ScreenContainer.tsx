import React, { ReactNode } from 'react';
import { View, StyleSheet, Platform } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useThemeColors } from '@/context/ThemeContext';

interface ScreenContainerProps {
  children: ReactNode;
  gradient?: boolean;
  gradientColors?: readonly [string, string, ...string[]];
  noPadding?: boolean;
}

export default function ScreenContainer({ children, gradient, gradientColors, noPadding }: ScreenContainerProps) {
  const Colors = useThemeColors();
  const insets = useSafeAreaInsets();
  const topInset = Platform.OS === 'web' ? 67 : insets.top;
  const bottomInset = Platform.OS === 'web' ? 34 : insets.bottom;

  const containerStyle = [
    styles.container,
    {
      paddingTop: topInset,
      paddingBottom: bottomInset,
      paddingHorizontal: noPadding ? 0 : 20,
    },
  ];

  if (gradient) {
    return (
      <LinearGradient
        colors={gradientColors || [Colors.background, Colors.inputBackground]}
        style={styles.gradient}
      >
        <View style={containerStyle}>{children}</View>
      </LinearGradient>
    );
  }

  return (
    <View style={[containerStyle, { backgroundColor: Colors.background }]}>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  gradient: {
    flex: 1,
  },
  container: {
    flex: 1,
  },
});
