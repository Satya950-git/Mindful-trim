import React from 'react';
import { View, Text, StyleSheet, Platform, Image } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { router } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import PrimaryButton from '@/components/PrimaryButton';
import { useThemeColors, ThemeColors } from '@/context/ThemeContext';
import ThemeToggle from '@/components/ThemeToggle';

const PILLARS = [
  { key: 'mental',   emoji: '🧠' },
  { key: 'physical', emoji: '💪' },
  { key: 'social',   emoji: '🤝' },
  { key: 'spiritual',emoji: '✨' },
];

export default function WelcomeScreen() {
  const Colors = useThemeColors();
  const styles = makeStyles(Colors);
  const insets = useSafeAreaInsets();
  const topInset = Platform.OS === 'web' ? 67 : insets.top;
  const bottomInset = Platform.OS === 'web' ? 34 : insets.bottom;
  const { t } = useTranslation();

  return (
    <View style={[styles.root, { backgroundColor: Colors.background }]}>

      {/* Soft top glow */}
      <LinearGradient
        colors={[Colors.accent + '30', Colors.background + '00']}
        style={styles.topGlow}
        pointerEvents="none"
      />

      {/* Theme toggle – top-right corner */}
      <View style={[styles.toggleCorner, { top: topInset + 12 }]}>
        <ThemeToggle />
      </View>

      <View style={[styles.container, { paddingTop: topInset + 20, paddingBottom: bottomInset + 24 }]}>

        {/* ── Brand ── */}
        <View style={styles.brandSection}>
          <View style={styles.logoWrap}>
            <Image
              source={require('@/assets/images/logo.png')}
              style={styles.logo}
              resizeMode="contain"
            />
          </View>
          <Text style={styles.appName}>Mindful Trim</Text>
          <Text style={styles.taglineSmall}>O J A S</Text>
        </View>

        {/* ── Hero copy ── */}
        <View style={styles.heroSection}>
          <Text style={styles.heroHeading}>{t('welcome.heroHeading')}</Text>
          <Text style={styles.heroBody}>{t('welcome.heroBody')}</Text>
        </View>

        {/* ── Pillar chips ── */}
        <View style={styles.pillarsRow}>
          {PILLARS.map(p => (
            <View
              key={p.key}
              style={[styles.pillarChip, { backgroundColor: Colors.cardBackground, borderColor: Colors.border }]}
            >
              <Text style={styles.pillarEmoji}>{p.emoji}</Text>
              <Text style={[styles.pillarLabel, { color: Colors.textSecondary }]}>{t(`pillars.${p.key}`)}</Text>
            </View>
          ))}
        </View>

        {/* ── CTAs ── */}
        <View style={styles.buttons}>
          <PrimaryButton
            title={t('common.getStarted')}
            onPress={() => router.push('/register')}
            gradientColors={Colors.accentGradient}
          />
          <PrimaryButton
            title={t('welcome.alreadyHaveAccount')}
            onPress={() => router.push('/login')}
            variant="ghost"
            color={Colors.textSecondary}
          />
        </View>
      </View>
    </View>
  );
}

const makeStyles = (Colors: ThemeColors) => StyleSheet.create({
  root: {
    flex: 1,
  },
  topGlow: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: 340,
  },
  toggleCorner: {
    position: 'absolute',
    right: 20,
    zIndex: 10,
  },
  container: {
    flex: 1,
    paddingHorizontal: 28,
    justifyContent: 'space-between',
  },

  /* Brand */
  brandSection: {
    alignItems: 'center',
    gap: 10,
  },
  logoWrap: {
    width: 96,
    height: 96,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 4,
  },
  logo: {
    width: 96,
    height: 96,
  },
  appName: {
    fontSize: 28,
    fontFamily: 'Inter_700Bold',
    color: Colors.textPrimary,
    letterSpacing: 0.2,
  },
  taglineSmall: {
    fontSize: 11,
    fontFamily: 'Inter_500Medium',
    color: Colors.textTertiary,
    letterSpacing: 4,
  },

  /* Hero */
  heroSection: {
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 8,
  },
  heroHeading: {
    fontSize: 30,
    fontFamily: 'Inter_700Bold',
    color: Colors.textPrimary,
    textAlign: 'center',
    lineHeight: 40,
    letterSpacing: -0.5,
  },
  heroBody: {
    fontSize: 15,
    fontFamily: 'Inter_400Regular',
    color: Colors.textSecondary,
    textAlign: 'center',
    lineHeight: 22,
  },

  /* Pillar chips */
  pillarsRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 10,
    flexWrap: 'wrap',
  },
  pillarChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 14,
    paddingVertical: 9,
    borderRadius: 14,
    borderWidth: 1,
  },
  pillarEmoji: {
    fontSize: 15,
  },
  pillarLabel: {
    fontSize: 13,
    fontFamily: 'Inter_500Medium',
  },

  /* Buttons */
  buttons: {
    gap: 4,
  },
});
