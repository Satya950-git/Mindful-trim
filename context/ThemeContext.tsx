import React, { createContext, useContext, useState, useEffect, useMemo, ReactNode } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';

export type ThemeName = 'light' | 'dark';

export interface ThemeColors {
  background: string;
  cardBackground: string;
  textPrimary: string;
  textSecondary: string;
  textTertiary: string;
  border: string;
  inputBackground: string;

  mental: string;
  mentalLight: string;
  mentalGradient: readonly [string, string];

  physical: string;
  physicalLight: string;
  physicalGradient: readonly [string, string];

  social: string;
  socialLight: string;
  socialGradient: readonly [string, string];

  spiritual: string;
  spiritualLight: string;
  spiritualGradient: readonly [string, string];

  accent: string;
  accentGradient: readonly [string, string];
  success: string;
  warning: string;
  error: string;

  white: string;
  black: string;

  tabBarBg: string;
  tabBarBlurTint: 'light' | 'dark';
}

/* ── Light: rich jewels on a soft lavender-cream canvas ── */
const lightTheme: ThemeColors = {
  background: '#F5F2FF',
  cardBackground: '#FFFFFF',
  textPrimary: '#1C1440',
  textSecondary: '#6B6888',
  textTertiary: '#6B5E9E',
  border: '#E2DCFA',
  inputBackground: '#EDE8FB',

  /* Sapphire */
  mental: '#2563EB',
  mentalLight: '#DBEAFE',
  mentalGradient: ['#2563EB', '#1D4ED8'],

  /* Emerald */
  physical: '#059669',
  physicalLight: '#D1FAE5',
  physicalGradient: ['#059669', '#047857'],

  /* Ruby */
  social: '#DC2626',
  socialLight: '#FEE2E2',
  socialGradient: ['#DC2626', '#B91C1C'],

  /* Amethyst */
  spiritual: '#7C3AED',
  spiritualLight: '#EDE9FE',
  spiritualGradient: ['#7C3AED', '#6D28D9'],

  accent: '#7C3AED',
  accentGradient: ['#7C3AED', '#6D28D9'],
  success: '#059669',
  warning: '#D97706',
  error: '#DC2626',

  white: '#FFFFFF',
  black: '#000000',

  tabBarBg: '#FFFFFF',
  tabBarBlurTint: 'light',
};

/* ── Dark mode: maximum-saturation jewels on pure black ── */
const darkTheme: ThemeColors = {
  background: '#000000',
  cardBackground: '#080416',
  textPrimary: '#FFFFFF',
  textSecondary: '#D4D0F0',
  textTertiary: '#9090C0',
  border: '#2A2050',
  inputBackground: '#100830',

  /* Sapphire */
  mental: '#93C5FD',
  mentalLight: '#1E3A8A',
  mentalGradient: ['#93C5FD', '#60A5FA'],

  /* Emerald */
  physical: '#6EE7B7',
  physicalLight: '#064E3B',
  physicalGradient: ['#6EE7B7', '#34D399'],

  /* Ruby */
  social: '#FCA5A5',
  socialLight: '#7F1D1D',
  socialGradient: ['#FCA5A5', '#F87171'],

  /* Amethyst */
  spiritual: '#C4B5FD',
  spiritualLight: '#4C1D95',
  spiritualGradient: ['#C4B5FD', '#A78BFA'],

  accent: '#C4B5FD',
  accentGradient: ['#C4B5FD', '#A78BFA'],
  success: '#6EE7B7',
  warning: '#FCD34D',
  error: '#FCA5A5',

  white: '#080416',
  black: '#FFFFFF',

  tabBarBg: '#000000',
  tabBarBlurTint: 'dark',
};

const themes: Record<ThemeName, ThemeColors> = {
  light: lightTheme,
  dark: darkTheme,
};

interface ThemeContextValue {
  theme: ThemeName;
  colors: ThemeColors;
  setTheme: (theme: ThemeName) => void;
  isDark: boolean;
}

const ThemeContext = createContext<ThemeContextValue>({
  theme: 'light',
  colors: lightTheme,
  setTheme: () => {},
  isDark: false,
});

const THEME_KEY = '@mindful_trim_theme';

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setThemeState] = useState<ThemeName>('light');

  useEffect(() => {
    AsyncStorage.getItem(THEME_KEY).then(saved => {
      if (saved && (saved === 'light' || saved === 'dark')) {
        setThemeState(saved);
      }
    });
  }, []);

  const setTheme = (newTheme: ThemeName) => {
    setThemeState(newTheme);
    AsyncStorage.setItem(THEME_KEY, newTheme);
  };

  const value = useMemo(() => ({
    theme,
    colors: themes[theme],
    setTheme,
    isDark: theme !== 'light',
  }), [theme]);

  return (
    <ThemeContext.Provider value={value}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  return useContext(ThemeContext);
}

export function useThemeColors(): ThemeColors {
  const { colors } = useContext(ThemeContext);
  return colors;
}

export function usePillarColors(): Record<string, { main: string; light: string; gradient: readonly [string, string] }> {
  const colors = useThemeColors();
  return {
    Mental:   { main: colors.mental,   light: colors.mentalLight,   gradient: colors.mentalGradient   },
    Physical: { main: colors.physical, light: colors.physicalLight, gradient: colors.physicalGradient },
    Social:   { main: colors.social,   light: colors.socialLight,   gradient: colors.socialGradient   },
    Spiritual:{ main: colors.spiritual,light: colors.spiritualLight,gradient: colors.spiritualGradient},
  };
}

export { pillarIcons } from '@/constants/colors';
