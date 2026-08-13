import React, { useEffect } from 'react';
import { View, Text, StyleSheet, Platform, ScrollView, ViewStyle, BackHandler } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { useQueryClient } from '@tanstack/react-query';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { MaterialIcons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { LinearGradient } from 'expo-linear-gradient';
import Animated, { useSharedValue, useAnimatedStyle, withSpring, withDelay, withTiming } from 'react-native-reanimated';
import { useTranslation } from 'react-i18next';
import PrimaryButton from '@/components/PrimaryButton';
import { usePillarColors, useThemeColors, useTheme } from '@/context/ThemeContext';
import { getCompletionMessage } from '@/lib/completionMessages';
import { useLanguage } from '@/context/LanguageContext';

const WARM_BG_LIGHT: readonly [string, string, string] = ['#EEF0FF', '#E8F8F4', '#F3EEFF'];
const WARM_BG_DARK: readonly [string, string, string] = ['#0D0820', '#041208', '#100820'];
const PRESTIGE_BG: readonly [string, string, string] = ['#0D0820', '#1A0A3A', '#0A1A2E'];
const TOTAL_BEADS = 10;

function BeadProgress({ percent }: { percent: number }) {
  const filled = Math.round((percent / 100) * TOTAL_BEADS);
  return (
    <View style={bead.row}>
      {Array.from({ length: TOTAL_BEADS }).map((_, i) => (
        <View
          key={i}
          style={[bead.bead, i < filled ? bead.filled : bead.empty]}
        />
      ))}
    </View>
  );
}

const bead = StyleSheet.create({
  row: { flexDirection: 'row', gap: 5, alignItems: 'center', marginVertical: 8 },
  bead: { flex: 1, height: 10, borderRadius: 5 },
  filled: { backgroundColor: '#7C3AED' },
  empty: { backgroundColor: 'rgba(0,0,0,0.12)' },
});

export default function CompletionScreen() {
  const pillarColors = usePillarColors();
  const C = useThemeColors();
  const { isDark } = useTheme();
  const insets = useSafeAreaInsets();
  const topInset = Platform.OS === 'web' ? 67 : insets.top;
  const bottomInset = Platform.OS === 'web' ? 34 : insets.bottom;
  const { t } = useTranslation();
  const { language } = useLanguage();
  const qc = useQueryClient();

  const params = useLocalSearchParams<{
    pillar: string;
    exerciseName: string;
    artifactName: string;
    artifactDesc: string;
    artifactIcon: string;
    xpGained: string;
    totalXp: string;
    currentLevel: string;
    levelUp: string;
    phaseBefore: string;
    currentPhase: string;
    phaseTransition: string;
    isMaxLevel: string;
    isPrestige: string;
    newMilestoneKey: string;
    levelProgressPercent: string;
    isRetry: string;
    mood: string;
    tags: string;
  }>();

  const colors = params.pillar ? pillarColors[params.pillar] : pillarColors.Mental;
  const xpGained = parseInt(params.xpGained || '0');
  const totalXp = parseInt(params.totalXp || '0');
  const currentLevel = parseInt(params.currentLevel || '0');
  const levelUp = params.levelUp === 'true';
  const phaseTransition = params.phaseTransition === 'true';
  const isMaxLevel = params.isMaxLevel === 'true';
  const isPrestige = params.isPrestige === 'true' || isMaxLevel;
  const isRetry = params.isRetry === 'true';
  const hasArtifact = !!params.artifactName;

  const moodNum = parseInt(params.mood || '3');
  const tagsArr: string[] = (() => { try { return JSON.parse(params.tags || '[]'); } catch { return []; } })();
  const personalMessage = getCompletionMessage(moodNum, tagsArr, language);
  const showMilestoneCard =
    params.newMilestoneKey === 'phase_arriving_complete' ||
    params.newMilestoneKey === 'phase_seeker_complete' ||
    params.newMilestoneKey === 'phase_anchored_complete' ||
    params.newMilestoneKey === 'phase_aligned_complete';
  const levelProgressPercent = parseInt(params.levelProgressPercent || '0');

  // Whether to show the achievements/levelup screen next
  const hasAchievements = levelUp || phaseTransition || showMilestoneCard || hasArtifact;

  const mainScale = useSharedValue(0);
  const xpScale = useSharedValue(0);
  const barFill = useSharedValue(0);
  const prestigeScale = useSharedValue(0);
  const prestigeOpacity = useSharedValue(0);

  useEffect(() => {
    if (Platform.OS !== 'android') return;
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      router.replace('/(main)');
      return true;
    });
    return () => sub.remove();
  }, []);

  useEffect(() => {
    qc.invalidateQueries({ queryKey: ['/api/1on1'] });
    qc.invalidateQueries({ queryKey: ['/api/coop'] });
  }, []);

  useEffect(() => {
    if (isPrestige) {
      prestigeScale.value = withSpring(1, { damping: 8, stiffness: 80 });
      prestigeOpacity.value = withTiming(1, { duration: 600 });
      setTimeout(() => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy), 200);
      setTimeout(() => Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success), 500);
      setTimeout(() => Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success), 900);
      setTimeout(() => Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success), 1300);
      return;
    }

    mainScale.value = withSpring(1, { damping: 12 });
    xpScale.value = withDelay(300, withSpring(1, { damping: 10 }));
    barFill.value = withDelay(500, withTiming(levelProgressPercent / 100, { duration: 800 }));

    if (!levelUp) {
      setTimeout(() => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium), 200);
    }
  }, []);

  const mainStyle = useAnimatedStyle(() => ({
    transform: [{ scale: mainScale.value }],
    opacity: mainScale.value,
  }));

  const xpStyle = useAnimatedStyle(() => ({
    transform: [{ scale: xpScale.value }],
    opacity: xpScale.value,
  }));

  const barWidthStyle = useAnimatedStyle((): ViewStyle => ({
    width: `${barFill.value * 100}%`,
  }));

  const prestigeStyle = useAnimatedStyle(() => ({
    transform: [{ scale: prestigeScale.value }],
    opacity: prestigeOpacity.value,
  }));

  const handleContinue = () => {
    if (hasAchievements) {
      router.replace({
        pathname: '/levelup',
        params: {
          pillar: params.pillar,
          exerciseName: params.exerciseName,
          artifactName: params.artifactName,
          artifactDesc: params.artifactDesc,
          artifactIcon: params.artifactIcon,
          xpGained: params.xpGained,
          currentLevel: params.currentLevel,
          phaseBefore: params.phaseBefore,
          currentPhase: params.currentPhase,
          levelUp: params.levelUp,
          phaseTransition: params.phaseTransition,
          newMilestoneKey: params.newMilestoneKey,
        },
      });
    } else {
      router.replace('/(main)');
    }
  };

  // ─── PRESTIGE MODE (Level 100) ────────────────────────────────────────────────
  if (isPrestige) {
    return (
      <LinearGradient colors={PRESTIGE_BG} style={styles.root} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}>
        <Animated.View
          style={[styles.prestigeContainer, prestigeStyle, { paddingTop: topInset + 40, paddingBottom: bottomInset + 40 }]}
        >
          <Text style={[styles.starDeco, { top: 20, left: 30, fontSize: 18, opacity: 0.6 }]}>✦</Text>
          <Text style={[styles.starDeco, { top: 50, right: 40, fontSize: 12, opacity: 0.4 }]}>✦</Text>
          <Text style={[styles.starDeco, { top: 120, left: 20, fontSize: 10, opacity: 0.3 }]}>✦</Text>
          <Text style={[styles.starDeco, { top: 80, right: 80, fontSize: 8, opacity: 0.25 }]}>✦</Text>

          <View style={styles.prestigeGlowOuter}>
            <View style={styles.prestigeGlowMid}>
              <View style={styles.prestigeCircle}>
                <Text style={styles.prestigeAxisSymbol}>⊕</Text>
              </View>
            </View>
          </View>

          <Text style={styles.prestigeLabel}>{t('completion.prestigeMode')}</Text>
          <Text style={styles.prestigeTitle}>{t('completion.theAxis')}</Text>
          <Text style={styles.prestigeSubtitle}>{t('completion.prestigeSubtitle')}</Text>

          <View style={styles.prestigeLevelBadge}>
            <Text style={styles.prestigeLevelLabel}>{t('completion.level')}</Text>
            <Text style={styles.prestigeLevelNumber}>100</Text>
          </View>

          <Text style={styles.prestigeDesc}>{t('completion.prestigeDesc')}</Text>

          <View style={styles.prestigeXpRow}>
            <MaterialIcons name="bolt" size={18} color="#B8A4FF" />
            <Text style={styles.prestigeXpText}>{totalXp.toLocaleString()} {t('completion.totalXp')}</Text>
          </View>

          <View style={styles.prestigeFooter}>
            <PrimaryButton
              title={t('completion.returnHome')}
              onPress={() => router.replace('/(main)')}
              gradientColors={['#6B21A8', '#4C1D95']}
            />
          </View>
        </Animated.View>
      </LinearGradient>
    );
  }

  // ─── STANDARD COMPLETION ──────────────────────────────────────────────────────
  const warmBg = isDark ? WARM_BG_DARK : WARM_BG_LIGHT;
  return (
    <LinearGradient colors={warmBg} style={styles.root} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}>
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={[styles.container, { paddingTop: topInset + 28, paddingBottom: bottomInset + 32 }]}
        showsVerticalScrollIndicator={false}
      >
        {/* Header emblem */}
        <Animated.View style={[styles.mainContent, mainStyle]}>
          <View style={[styles.emblemOuter, { backgroundColor: colors.main + '20', borderColor: colors.main + '30' }]}>
            <View style={[styles.emblemInner, { backgroundColor: colors.main + '30' }]}>
              <MaterialIcons name="spa" size={40} color={colors.main} />
            </View>
          </View>
          <Text style={[styles.alignedTitle, { color: C.textPrimary }]}>{t('completion.aligned')}</Text>
          <Text style={[styles.alignedSubtitle, { color: C.textSecondary }]}>{t('completion.youCompleted', { exerciseName: params.exerciseName })}</Text>
          <View style={[styles.pillarBadge, { backgroundColor: colors.main + '20', borderColor: colors.main + '40' }]}>
            <View style={[styles.pillarDot, { backgroundColor: colors.main }]} />
            <Text style={[styles.pillarText, { color: colors.main }]}>{params.pillar}</Text>
          </View>
          {isRetry && (
            <View style={[styles.retryBadge, {
              backgroundColor: isDark ? 'rgba(255,255,255,0.07)' : 'rgba(0,0,0,0.05)',
              borderColor: isDark ? 'rgba(255,255,255,0.12)' : 'rgba(0,0,0,0.08)',
            }]}>
              <MaterialIcons name="lock" size={13} color={C.textTertiary} />
              <Text style={[styles.retryText, { color: C.textTertiary }]}>{t('completion.retry')}</Text>
            </View>
          )}
        </Animated.View>

        {/* Personalized message card */}
        {!!personalMessage && (
          <Animated.View style={[styles.messageCard, { backgroundColor: isDark ? C.cardBackground : 'rgba(255,255,255,0.82)' }, xpStyle]}>
            <MaterialIcons name="format-quote" size={18} color={colors.main + '80'} style={{ marginBottom: 6 }} />
            <Text style={[styles.messageText, { color: C.textPrimary }]}>{personalMessage}</Text>
            {tagsArr.length > 0 && (
              <View style={styles.tagsRow}>
                {tagsArr.map(tag => (
                  <View key={tag} style={[styles.tagChip, { backgroundColor: colors.main + '15', borderColor: colors.main + '35' }]}>
                    <Text style={[styles.tagChipText, { color: colors.main }]}>{tag}</Text>
                  </View>
                ))}
              </View>
            )}
          </Animated.View>
        )}

        {/* XP card */}
        {(xpGained > 0 || isRetry) && (
          <Animated.View style={[styles.xpCard, { backgroundColor: isDark ? C.cardBackground : 'rgba(255,255,255,0.82)' }, xpStyle]}>
            <View style={styles.xpTopRow}>
              <MaterialIcons name="bolt" size={20} color={isRetry ? C.textTertiary : '#5EB8A0'} />
              <Text style={[styles.xpGainedText, isRetry && { color: C.textTertiary, fontSize: 18 }]}>
                {isRetry ? '+0 XP (Retry)' : `+${xpGained} XP`}
              </Text>
            </View>
            <View style={styles.xpLevelRow}>
              <View style={styles.xpLevelChip}>
                <Text style={styles.xpLevelChipText}>Lv {currentLevel}</Text>
              </View>
              <Text style={[styles.xpPhaseText, { color: C.textSecondary }]}>{params.currentPhase}</Text>
              <Text style={[styles.xpTotalText, { color: C.textTertiary }]}>{totalXp} XP</Text>
            </View>
            {!isRetry && <BeadProgress percent={levelProgressPercent} />}
            <Animated.View style={[styles.xpProgressBar, barWidthStyle]} />
            <Text style={[styles.xpProgressLabel, { color: C.textTertiary }]}>
              {isMaxLevel
                ? t('completion.maxLevelReached')
                : isRetry
                ? t('completion.xpRetry')
                : t('completion.xpProgressLabel', { percent: levelProgressPercent, nextLevel: currentLevel + 1 })}
            </Text>
          </Animated.View>
        )}

        {/* Continue / Return Home */}
        <View style={styles.footer}>
          <PrimaryButton
            title={hasAchievements ? t('completion.continue') : t('completion.returnHome')}
            onPress={handleContinue}
            gradientColors={[colors.gradient[0], colors.gradient[1]]}
          />
        </View>
      </ScrollView>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  scroll: { flex: 1 },
  container: {
    paddingHorizontal: 22,
    gap: 16,
    alignItems: 'stretch',
  },

  /* ── Prestige ── */
  prestigeContainer: {
    flex: 1,
    alignItems: 'center',
    gap: 16,
    paddingHorizontal: 28,
  },
  starDeco: {
    position: 'absolute',
    fontSize: 13,
    color: '#FFD27F',
    opacity: 0.55,
  },
  prestigeGlowOuter: {
    width: 140,
    height: 140,
    borderRadius: 70,
    backgroundColor: 'rgba(139,92,246,0.08)',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 8,
  },
  prestigeGlowMid: {
    width: 110,
    height: 110,
    borderRadius: 55,
    backgroundColor: 'rgba(139,92,246,0.15)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  prestigeCircle: {
    width: 86,
    height: 86,
    borderRadius: 43,
    backgroundColor: 'rgba(139,92,246,0.25)',
    borderWidth: 1.5,
    borderColor: 'rgba(139,92,246,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  prestigeAxisSymbol: { fontSize: 40, color: '#B8A4FF' },
  prestigeLabel: {
    fontSize: 11,
    fontFamily: 'Inter_700Bold',
    color: 'rgba(184,164,255,0.5)',
    letterSpacing: 3,
  },
  prestigeTitle: {
    fontSize: 42,
    fontFamily: 'Inter_700Bold',
    color: '#B8A4FF',
    textAlign: 'center',
  },
  prestigeSubtitle: {
    fontSize: 15,
    fontFamily: 'Inter_400Regular',
    color: 'rgba(184,164,255,0.65)',
    textAlign: 'center',
    lineHeight: 23,
  },
  prestigeLevelBadge: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: 6,
    backgroundColor: 'rgba(139,92,246,0.15)',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: 'rgba(139,92,246,0.3)',
    paddingHorizontal: 18,
    paddingVertical: 8,
  },
  prestigeLevelLabel: {
    fontSize: 11,
    fontFamily: 'Inter_700Bold',
    color: 'rgba(184,164,255,0.6)',
    letterSpacing: 2,
  },
  prestigeLevelNumber: {
    fontSize: 28,
    fontFamily: 'Inter_700Bold',
    color: '#B8A4FF',
  },
  prestigeDesc: {
    fontSize: 14,
    fontFamily: 'Inter_400Regular',
    color: 'rgba(184,164,255,0.55)',
    textAlign: 'center',
    lineHeight: 22,
    paddingHorizontal: 16,
  },
  prestigeXpRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  prestigeXpText: {
    fontSize: 15,
    fontFamily: 'Inter_600SemiBold',
    color: '#B8A4FF',
  },
  prestigeFooter: {
    width: '100%',
    marginTop: 8,
  },

  /* ── Main emblem ── */
  mainContent: {
    alignItems: 'center',
    gap: 12,
    marginBottom: 4,
  },
  emblemOuter: {
    width: 96,
    height: 96,
    borderRadius: 48,
    borderWidth: 2,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 8,
  },
  emblemInner: {
    width: 72,
    height: 72,
    borderRadius: 36,
    justifyContent: 'center',
    alignItems: 'center',
  },
  alignedTitle: {
    fontSize: 36,
    fontFamily: 'Inter_700Bold',
  },
  alignedSubtitle: {
    fontSize: 15,
    fontFamily: 'Inter_400Regular',
    textAlign: 'center',
  },
  pillarBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 16,
    borderWidth: 1.5,
    marginTop: 2,
  },
  pillarDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  pillarText: {
    fontSize: 14,
    fontFamily: 'Inter_600SemiBold',
  },
  retryBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderRadius: 10,
    borderWidth: 1,
  },
  retryText: {
    fontSize: 12,
    fontFamily: 'Inter_500Medium',
  },

  /* ── XP card ── */
  xpCard: {
    borderRadius: 18,
    padding: 18,
    borderWidth: 1,
    borderColor: 'rgba(124,58,237,0.25)',
    gap: 4,
  },
  xpTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  xpGainedText: {
    fontSize: 22,
    fontFamily: 'Inter_700Bold',
    color: '#7C3AED',
  },
  xpLevelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  xpLevelChip: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
    backgroundColor: 'rgba(124,58,237,0.12)',
  },
  xpLevelChipText: {
    fontSize: 12,
    fontFamily: 'Inter_700Bold',
    color: '#7C3AED',
  },
  xpPhaseText: {
    flex: 1,
    fontSize: 13,
    fontFamily: 'Inter_500Medium',
  },
  xpTotalText: {
    fontSize: 12,
    fontFamily: 'Inter_500Medium',
  },
  xpProgressBar: {
    height: 4,
    backgroundColor: '#5EB8A0',
    borderRadius: 2,
    display: 'none',
  },
  xpProgressLabel: {
    fontSize: 11,
    fontFamily: 'Inter_400Regular',
    textAlign: 'right',
    marginTop: 2,
  },

  footer: { marginTop: 4 },

  /* ── Personalized message ── */
  messageCard: {
    borderRadius: 18,
    padding: 18,
    borderWidth: 1,
    borderColor: 'rgba(94,184,160,0.2)',
    gap: 4,
  },
  messageText: {
    fontSize: 16,
    fontFamily: 'Inter_500Medium',
    lineHeight: 24,
  },
  tagsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 10,
  },
  tagChip: {
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 12,
    borderWidth: 1,
  },
  tagChipText: {
    fontSize: 12,
    fontFamily: 'Inter_600SemiBold',
  },
});
