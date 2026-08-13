import React, { useEffect, useRef, useState } from 'react';
import {
  View, Text, StyleSheet, Platform, Pressable,
  ScrollView, ActivityIndicator, Share, BackHandler,
} from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { MaterialIcons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import * as Linking from 'expo-linking';
import { LinearGradient } from 'expo-linear-gradient';
import Animated, {
  useSharedValue, useAnimatedStyle, withSpring, withDelay, withTiming,
} from 'react-native-reanimated';
import { useTranslation } from 'react-i18next';
import PrimaryButton from '@/components/PrimaryButton';
import { usePillarColors, useThemeColors, useTheme } from '@/context/ThemeContext';
import * as Sharing from 'expo-sharing';
import * as FileSystem from 'expo-file-system';
import * as IntentLauncher from 'expo-intent-launcher';
import { useShareUrl } from '@/hooks/useAppConfig';

const WARM_BG_LIGHT: readonly [string, string, string] = ['#EEF0FF', '#E8F8F4', '#F3EEFF'];
const WARM_BG_DARK: readonly [string, string, string] = ['#0D0820', '#041208', '#100820'];

export default function LevelUpScreen() {
  const pillarColors = usePillarColors();
  const C = useThemeColors();
  const { isDark } = useTheme();
  const insets = useSafeAreaInsets();
  const topInset = Platform.OS === 'web' ? 67 : insets.top;
  const bottomInset = Platform.OS === 'web' ? 34 : insets.bottom;
  const { t } = useTranslation();
  const shareCardRef = useRef<View>(null);
  const [shareLoading, setShareLoading] = useState(false);

  useEffect(() => {
    if (Platform.OS !== 'android') return;
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      router.replace('/(main)');
      return true;
    });
    return () => sub.remove();
  }, []);

  const appUrl = useShareUrl();

  const params = useLocalSearchParams<{
    pillar: string;
    exerciseName: string;
    artifactName: string;
    artifactDesc: string;
    artifactIcon: string;
    xpGained: string;
    currentLevel: string;
    phaseBefore: string;
    currentPhase: string;
    levelUp: string;
    phaseTransition: string;
    newMilestoneKey: string;
  }>();

  const colors = params.pillar ? pillarColors[params.pillar] : pillarColors.Mental;
  const xpGained = parseInt(params.xpGained || '0');
  const currentLevel = parseInt(params.currentLevel || '0');
  const levelUp = params.levelUp === 'true';
  const phaseTransition = params.phaseTransition === 'true';
  const hasArtifact = !!params.artifactName;
  const showMilestoneCard =
    params.newMilestoneKey === 'phase_arriving_complete' ||
    params.newMilestoneKey === 'phase_seeker_complete' ||
    params.newMilestoneKey === 'phase_anchored_complete' ||
    params.newMilestoneKey === 'phase_aligned_complete';

  // ── Animations ──
  const levelUpScale = useSharedValue(0);
  const levelUpOpacity = useSharedValue(0);
  const phaseScale = useSharedValue(0);
  const phaseOpacity = useSharedValue(0);
  const milestoneScale = useSharedValue(0);
  const milestoneOpacity = useSharedValue(0);
  const artifactScale = useSharedValue(0);
  const artifactOpacity = useSharedValue(0);
  const shareScale = useSharedValue(0);
  const shareOpacity = useSharedValue(0);

  useEffect(() => {
    let nextDelay = 100;

    if (levelUp) {
      levelUpScale.value = withDelay(nextDelay, withSpring(1, { damping: 9, stiffness: 120 }));
      levelUpOpacity.value = withDelay(nextDelay, withTiming(1, { duration: 300 }));
      setTimeout(() => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy), nextDelay + 30);
      setTimeout(() => Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success), nextDelay + 200);
      setTimeout(() => Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success), nextDelay + 420);
      nextDelay += 450;
    }

    if (phaseTransition) {
      phaseScale.value = withDelay(nextDelay, withSpring(1, { damping: 9, stiffness: 100 }));
      phaseOpacity.value = withDelay(nextDelay, withTiming(1, { duration: 350 }));
      setTimeout(() => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy), nextDelay + 30);
      nextDelay += 400;
    }

    if (showMilestoneCard) {
      milestoneScale.value = withDelay(nextDelay, withSpring(1, { damping: 9, stiffness: 100 }));
      milestoneOpacity.value = withDelay(nextDelay, withTiming(1, { duration: 350 }));
      setTimeout(() => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy), nextDelay + 30);
      nextDelay += 400;
    }

    if (hasArtifact) {
      artifactScale.value = withDelay(nextDelay, withSpring(1, { damping: 10 }));
      artifactOpacity.value = withDelay(nextDelay, withTiming(1, { duration: 400 }));
      setTimeout(() => Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success), nextDelay + 100);
      nextDelay += 400;
    }

    shareScale.value = withDelay(nextDelay, withSpring(1, { damping: 12 }));
    shareOpacity.value = withDelay(nextDelay, withTiming(1, { duration: 350 }));
  }, []);

  const levelUpStyle = useAnimatedStyle(() => ({
    transform: [{ scale: levelUpScale.value }],
    opacity: levelUpOpacity.value,
  }));
  const phaseStyle = useAnimatedStyle(() => ({
    transform: [{ scale: phaseScale.value }],
    opacity: phaseOpacity.value,
  }));
  const milestoneStyle = useAnimatedStyle(() => ({
    transform: [{ scale: milestoneScale.value }],
    opacity: milestoneOpacity.value,
  }));
  const artifactStyle = useAnimatedStyle(() => ({
    transform: [{ scale: artifactScale.value }],
    opacity: artifactOpacity.value,
  }));
  const shareStyle = useAnimatedStyle(() => ({
    transform: [{ scale: shareScale.value }],
    opacity: shareOpacity.value,
  }));

  const warmBg = isDark ? WARM_BG_DARK : WARM_BG_LIGHT;

  return (
    <LinearGradient colors={warmBg} style={styles.root} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}>
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={[styles.container, { paddingTop: topInset + 28, paddingBottom: bottomInset + 32 }]}
        showsVerticalScrollIndicator={false}
      >

        {/* Level up card */}
        {levelUp && (
          <Animated.View style={levelUpStyle}>
            <LinearGradient
              colors={['#2D1B00', '#5C3100', '#3A2000']}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={styles.levelUpCard}
            >
              <Text style={[styles.starDeco, { top: 14, left: 18 }]}>✦</Text>
              <Text style={[styles.starDeco, { top: 20, right: 22, fontSize: 9, opacity: 0.4 }]}>✦</Text>
              <Text style={[styles.starDeco, { bottom: 20, left: 26, fontSize: 9, opacity: 0.4 }]}>✦</Text>
              <Text style={[styles.starDeco, { bottom: 14, right: 18 }]}>✦</Text>

              <View style={styles.trophyGlowOuter}>
                <View style={styles.trophyGlowMid}>
                  <View style={styles.trophyCircle}>
                    <MaterialIcons name="emoji-events" size={42} color="#FFD27F" />
                  </View>
                </View>
              </View>

              <View style={styles.levelBadge}>
                <Text style={styles.levelBadgeLabel}>LEVEL</Text>
                <Text style={styles.levelBadgeNumber}>{currentLevel}</Text>
              </View>

              <Text style={styles.levelUpReached}>{t('completion.youveReached')}</Text>
              <Text style={styles.levelUpName}>Level {currentLevel}</Text>
              <View style={styles.phasePill}>
                <Text style={styles.phasePillText}>{params.currentPhase}</Text>
              </View>
            </LinearGradient>
          </Animated.View>
        )}

        {/* Phase transition */}
        {phaseTransition && (
          <Animated.View
            style={[
              styles.genericCard,
              { backgroundColor: isDark ? '#0A1226' : '#EEF4FF', borderColor: '#1f69f240' },
              phaseStyle,
            ]}
          >
            <View style={[styles.genericIconCircle, { backgroundColor: '#1f69f220' }]}>
              <MaterialIcons name="auto-awesome" size={28} color="#1f69f2" />
            </View>
            <Text style={[styles.genericCardTitle, { color: C.textPrimary }]}>{t('completion.newPhaseUnlocked')}</Text>
            <View style={styles.phaseTransitionRow}>
              <View style={[styles.phaseBadge, { backgroundColor: isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.06)' }]}>
                <Text style={[styles.phaseBadgeText, { color: C.textTertiary }]}>{params.phaseBefore}</Text>
              </View>
              <MaterialIcons name="arrow-forward" size={14} color="#1f69f2" />
              <View style={[styles.phaseBadge, { backgroundColor: '#1f69f220' }]}>
                <Text style={[styles.phaseBadgeText, { color: '#1f69f2' }]}>{params.currentPhase}</Text>
              </View>
            </View>
            <Text style={[styles.genericCardSubtitle, { color: C.textSecondary }]}>{t('completion.practiceDeepeningMsg')}</Text>
          </Animated.View>
        )}

        {/* Milestone card */}
        {showMilestoneCard && (
          <Animated.View
            style={[
              styles.genericCard,
              { backgroundColor: isDark ? '#1A1206' : '#FFFAEE', borderColor: '#C8973A40' },
              milestoneStyle,
            ]}
          >
            <View style={[styles.genericIconCircle, { backgroundColor: '#C8973A20' }]}>
              <MaterialIcons name="route" size={32} color="#C8873A" />
            </View>
            <Text style={[styles.genericCardTitle, { color: C.textPrimary }]}>{t('completion.phaseComplete')}</Text>
            <Text style={[styles.genericCardSubtitle, { color: C.textSecondary }]}>
              {params.newMilestoneKey === 'phase_arriving_complete' && t('completion.milestoneArriving')}
              {params.newMilestoneKey === 'phase_seeker_complete' && t('completion.milestoneSeeker')}
              {params.newMilestoneKey === 'phase_anchored_complete' && t('completion.milestoneAnchored')}
              {params.newMilestoneKey === 'phase_aligned_complete' && t('completion.milestoneAligned')}
            </Text>
          </Animated.View>
        )}

        {/* Artifact */}
        {hasArtifact && (
          <Animated.View
            style={[
              styles.artifactCard,
              { backgroundColor: isDark ? C.cardBackground : 'rgba(255,255,255,0.82)' },
              artifactStyle,
            ]}
          >
            <View style={styles.artifactHeader}>
              <MaterialIcons name="auto-awesome" size={15} color="#C8973A" />
              <Text style={styles.artifactLabel}>{t('completion.newArtifactUnlocked')}</Text>
            </View>
            <View style={styles.artifactContent}>
              <View style={[styles.artifactIconBg, { backgroundColor: '#C8973A20' }]}>
                <MaterialIcons
                  name={(params.artifactIcon || 'star') as keyof typeof MaterialIcons.glyphMap}
                  size={32}
                  color="#C8873A"
                />
              </View>
              <Text style={[styles.artifactName, { color: C.textPrimary }]}>{params.artifactName}</Text>
              <Text style={[styles.artifactDesc, { color: C.textSecondary }]}>{params.artifactDesc}</Text>
            </View>
          </Animated.View>
        )}

        {/* Share button */}
        {xpGained > 0 && (
          <Animated.View style={shareStyle}>
            <Pressable
              style={({ pressed }) => [styles.whatsappBtn, { opacity: pressed || shareLoading ? 0.75 : 1 }]}
              disabled={shareLoading}
              onPress={async () => {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                const msg = t('share.message', {
                  exerciseName: params.exerciseName,
                  xp: xpGained,
                  appUrl,
                });
                if (Platform.OS === 'web') {
                  Linking.openURL(`https://wa.me/?text=${encodeURIComponent(msg)}`);
                  return;
                }
                try {
                  setShareLoading(true);
                  const { captureRef } = await import('react-native-view-shot');
                  const uri = await captureRef(shareCardRef, {
                    format: 'png',
                    quality: 1.0,
                    result: 'tmpfile',
                  });
                  if (Platform.OS === 'ios') {
                    // iOS: Share.share sends image as attachment + text as caption together
                    await Share.share({ message: msg, url: uri });
                  } else {
                    // Android: fire ACTION_SEND intent with image stream + text caption
                    // WhatsApp receives both and pre-fills the caption automatically
                    try {
                      const contentUri = await FileSystem.getContentUriAsync(uri);
                      await IntentLauncher.startActivityAsync('android.intent.action.SEND', {
                        type: 'image/png',
                        extra: {
                          'android.intent.extra.STREAM': contentUri,
                          'android.intent.extra.TEXT': msg,
                        },
                        flags: 1, // FLAG_GRANT_READ_URI_PERMISSION
                      });
                    } catch {
                      // Fallback: text-only via WhatsApp deep link
                      Linking.openURL(`whatsapp://send?text=${encodeURIComponent(msg)}`).catch(() => {
                        Linking.openURL(`https://wa.me/?text=${encodeURIComponent(msg)}`);
                      });
                    }
                  }
                } catch {
                  Linking.openURL(`whatsapp://send?text=${encodeURIComponent(msg)}`).catch(() => {
                    Linking.openURL(`https://wa.me/?text=${encodeURIComponent(msg)}`);
                  });
                } finally {
                  setShareLoading(false);
                }
              }}
            >
              {shareLoading
                ? <ActivityIndicator size="small" color="#25D366" />
                : <MaterialIcons name="share" size={18} color="#25D366" />}
              <Text style={styles.whatsappBtnText}>{t('share.whatsappBtn')}</Text>
            </Pressable>
          </Animated.View>
        )}

        {/* Footer */}
        <View style={styles.footer}>
          <PrimaryButton
            title={t('completion.returnHome')}
            onPress={() => router.replace('/(main)')}
            gradientColors={[colors.gradient[0], colors.gradient[1]]}
          />
        </View>
      </ScrollView>

      {/* Hidden share card — captured for image share */}
      <View
        ref={shareCardRef}
        collapsable={false}
        style={styles.shareCardOuter}
      >
        <LinearGradient
          colors={[colors.main + 'F0', colors.light + 'F0']}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.shareCardGradient}
        >
          <Text style={styles.shareAppName}>Mindful Trim</Text>
          <View style={[styles.sharePillarBadge, { backgroundColor: colors.main + '30', borderColor: colors.main + '60' }]}>
            <View style={[styles.sharePillarDot, { backgroundColor: colors.main }]} />
            <Text style={[styles.sharePillarText, { color: colors.main }]}>{params.pillar}</Text>
          </View>
          <Text style={styles.shareExerciseName}>{params.exerciseName}</Text>
          <View style={styles.shareXpRow}>
            <MaterialIcons name="bolt" size={24} color={colors.main} />
            <Text style={[styles.shareXpText, { color: colors.main }]}>+{xpGained} XP</Text>
          </View>
          {levelUp && (
            <View style={styles.shareLevelUpBadge}>
              <MaterialIcons name="emoji-events" size={14} color="#FFD27F" />
              <Text style={styles.shareLevelUpText}>Level {currentLevel} reached!</Text>
            </View>
          )}
          <Text style={styles.shareLevel}>Level {currentLevel} · {params.currentPhase}</Text>
          <Text style={styles.shareFooter}>#MindfulTrim</Text>
        </LinearGradient>
      </View>
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

  /* ── Level up card ── */
  levelUpCard: {
    borderRadius: 24,
    padding: 28,
    alignItems: 'center',
    gap: 8,
    overflow: 'hidden',
  },
  starDeco: {
    position: 'absolute',
    fontSize: 13,
    color: '#FFD27F',
    opacity: 0.55,
  },
  trophyGlowOuter: {
    width: 110,
    height: 110,
    borderRadius: 55,
    backgroundColor: 'rgba(255,210,127,0.08)',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 4,
  },
  trophyGlowMid: {
    width: 86,
    height: 86,
    borderRadius: 43,
    backgroundColor: 'rgba(255,210,127,0.14)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  trophyCircle: {
    width: 68,
    height: 68,
    borderRadius: 34,
    backgroundColor: 'rgba(255,210,127,0.22)',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1.5,
    borderColor: 'rgba(255,210,127,0.35)',
  },
  levelBadge: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: 5,
    backgroundColor: 'rgba(255,210,127,0.15)',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(255,210,127,0.25)',
    paddingHorizontal: 14,
    paddingVertical: 5,
    marginTop: 2,
  },
  levelBadgeLabel: {
    fontSize: 10,
    fontFamily: 'Inter_700Bold',
    color: '#FFD27F',
    letterSpacing: 2,
    opacity: 0.7,
  },
  levelBadgeNumber: {
    fontSize: 22,
    fontFamily: 'Inter_700Bold',
    color: '#FFD27F',
  },
  levelUpReached: {
    fontSize: 13,
    fontFamily: 'Inter_400Regular',
    color: 'rgba(255,210,127,0.6)',
    textAlign: 'center',
    letterSpacing: 0.3,
    marginTop: 4,
  },
  levelUpName: {
    fontSize: 30,
    fontFamily: 'Inter_700Bold',
    color: '#FFD27F',
    textAlign: 'center',
    letterSpacing: -0.5,
  },
  phasePill: {
    marginTop: 4,
    paddingHorizontal: 16,
    paddingVertical: 6,
    borderRadius: 20,
    backgroundColor: 'rgba(255,255,255,0.07)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
  },
  phasePillText: {
    fontSize: 13,
    fontFamily: 'Inter_500Medium',
    color: 'rgba(255,210,127,0.75)',
    letterSpacing: 0.3,
  },

  /* ── Generic card (phase, milestone) ── */
  genericCard: {
    borderRadius: 20,
    borderWidth: 1.5,
    padding: 24,
    alignItems: 'center',
    gap: 10,
  },
  genericIconCircle: {
    width: 60,
    height: 60,
    borderRadius: 30,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 4,
  },
  genericCardTitle: {
    fontSize: 20,
    fontFamily: 'Inter_700Bold',
    textAlign: 'center',
  },
  genericCardSubtitle: {
    fontSize: 14,
    fontFamily: 'Inter_400Regular',
    textAlign: 'center',
    lineHeight: 21,
  },
  phaseTransitionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  phaseBadge: {
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderRadius: 12,
  },
  phaseBadgeText: {
    fontSize: 13,
    fontFamily: 'Inter_600SemiBold',
  },

  /* ── Artifact ── */
  artifactCard: {
    borderRadius: 20,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: 'rgba(200,151,58,0.35)',
  },
  artifactHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 16,
    paddingVertical: 10,
    backgroundColor: 'rgba(200,151,58,0.08)',
  },
  artifactLabel: {
    fontSize: 13,
    fontFamily: 'Inter_600SemiBold',
    color: '#C8873A',
  },
  artifactContent: {
    alignItems: 'center',
    padding: 20,
    gap: 8,
  },
  artifactIconBg: {
    width: 56,
    height: 56,
    borderRadius: 16,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 4,
  },
  artifactName: {
    fontSize: 20,
    fontFamily: 'Inter_700Bold',
  },
  artifactDesc: {
    fontSize: 14,
    fontFamily: 'Inter_400Regular',
    textAlign: 'center',
    lineHeight: 20,
  },

  /* ── Share ── */
  whatsappBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 12,
    paddingHorizontal: 24,
    borderRadius: 24,
    borderWidth: 1.5,
    borderColor: '#25D36640',
    backgroundColor: '#25D36610',
  },
  whatsappBtnText: {
    fontSize: 15,
    fontFamily: 'Inter_600SemiBold',
    color: '#1A9C50',
  },

  footer: { marginTop: 4 },

  /* ── Hidden share card ── */
  shareCardOuter: {
    position: 'absolute',
    top: 0,
    left: 0,
    width: 340,
    opacity: 0,
    pointerEvents: 'none',
  },
  shareCardGradient: {
    padding: 32,
    alignItems: 'center',
    gap: 14,
    borderRadius: 24,
  },
  shareAppName: {
    fontSize: 13,
    fontFamily: 'Inter_600SemiBold',
    color: '#FFFFFF99',
    letterSpacing: 1.5,
    textTransform: 'uppercase',
  },
  sharePillarBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 20,
    borderWidth: 1,
  },
  sharePillarDot: {
    width: 7,
    height: 7,
    borderRadius: 4,
  },
  sharePillarText: {
    fontSize: 12,
    fontFamily: 'Inter_600SemiBold',
    textTransform: 'uppercase',
    letterSpacing: 0.8,
  },
  shareExerciseName: {
    fontSize: 26,
    fontFamily: 'Inter_700Bold',
    color: '#FFFFFF',
    textAlign: 'center',
    lineHeight: 32,
  },
  shareXpRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: 'rgba(255,255,255,0.25)',
    paddingHorizontal: 18,
    paddingVertical: 8,
    borderRadius: 20,
  },
  shareXpText: {
    fontSize: 22,
    fontFamily: 'Inter_700Bold',
  },
  shareLevelUpBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: 'rgba(255,210,127,0.25)',
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderRadius: 14,
  },
  shareLevelUpText: {
    fontSize: 13,
    fontFamily: 'Inter_700Bold',
    color: '#FFD27F',
  },
  shareLevel: {
    fontSize: 14,
    fontFamily: 'Inter_500Medium',
    color: 'rgba(255,255,255,0.75)',
  },
  shareFooter: {
    fontSize: 11,
    fontFamily: 'Inter_400Regular',
    color: 'rgba(255,255,255,0.35)',
    marginTop: 2,
  },
});
