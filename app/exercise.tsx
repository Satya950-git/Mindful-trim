import React, { useState, useEffect, useRef } from 'react';
import { activateKeepAwakeAsync, deactivateKeepAwake } from 'expo-keep-awake';
import { View, Text, StyleSheet, Platform, Pressable, ViewStyle, Alert, AppState, BackHandler, Modal } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { MaterialIcons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import Animated, {
  useAnimatedStyle, useSharedValue, withTiming, withRepeat, withSpring,
  Easing, withDelay, withSequence,
} from 'react-native-reanimated';
import { useTranslation } from 'react-i18next';
import { useLanguage } from '@/context/LanguageContext';
import { useApp } from '@/context/AppContext';
import { usePillarColors, pillarIcons, useThemeColors, useTheme } from '@/context/ThemeContext';

type ExercisePhase = 'preview' | 'active' | 'done' | 'abandoned';

interface SessionState {
  startTime: number | null;
  endTime: number | null;
  status: 'active' | 'abandoned' | 'completed';
}

function FloatingDeco() {
  const decos = [
    { shape: 'heart', color: '#db3f2c40', size: 44, top: 80,  left: 30 },
    { shape: 'heart', color: '#882cf540', size: 30, top: 130, right: 40 },
    { shape: 'heart', color: '#23de6440', size: 36, top: 220, left: 55 },
    { shape: 'stone', color: '#9B9B8B30', size: 22, top: 180, right: 55 },
    { shape: 'stone', color: '#BCBCAA30', size: 16, top: 260, left: 25 },
    { shape: 'heart', color: '#1f69f235', size: 28, bottom: 160, right: 50 },
  ];

  return (
    <>
      {decos.map((d, i) => (
        <View
          key={i}
          style={[
            styles.decoItem,
            {
              width: d.size,
              height: d.size,
              backgroundColor: d.color,
              borderRadius: d.shape === 'heart' ? d.size / 2 : d.size / 3,
              top: (d as any).top,
              bottom: (d as any).bottom,
              left: (d as any).left,
              right: (d as any).right,
            } as ViewStyle,
          ]}
        />
      ))}
    </>
  );
}

export default function ExerciseScreen() {
  const pillarColors = usePillarColors();
  const Colors = useThemeColors();
  const { isDark } = useTheme();
  const insets = useSafeAreaInsets();
  const topInset = Platform.OS === 'web' ? 67 : insets.top;
  const bottomInset = Platform.OS === 'web' ? 34 : insets.bottom;
  const { t } = useTranslation();
  const params = useLocalSearchParams<{
    pillar: string;
    exerciseId: string;
    exerciseName: string;
    description: string;
    duration: string;
    xpReward: string;
    difficulty: string;
    mood: string;
    tags: string;
    insight: string;
    nameHi: string;
    descriptionHi: string;
    insightsHi: string;
  }>();

  const { completeExercise, nextExercise, nextStatus, hasAlignedToday } = useApp();
  const [phase, setPhase] = useState<ExercisePhase>('preview');
  const [timeElapsed, setTimeElapsed] = useState(0);
  const [isNextLoading, setIsNextLoading] = useState(false);
  const [exitModalVisible, setExitModalVisible] = useState(false);
  const [sessionState, setSessionState] = useState<SessionState>({
    startTime: null,
    endTime: null,
    status: 'active',
  });

  // Local exercise state for when "Try Another" updates it
  const [currentExerciseName, setCurrentExerciseName] = useState(params.exerciseName || '');
  const [currentDescription, setCurrentDescription] = useState(params.description || '');
  const [currentDuration, setCurrentDuration] = useState(parseInt(params.duration || '2') || 2);
  const [currentDifficulty, setCurrentDifficulty] = useState(params.difficulty || 'easy');
  const [currentXpReward, setCurrentXpReward] = useState(parseInt(params.xpReward || '100') || 100);
  const [currentInsight, setCurrentInsight] = useState(params.insight || '');
  const [currentExerciseId, setCurrentExerciseId] = useState(params.exerciseId || '');
  const [currentNameHi, setCurrentNameHi] = useState(params.nameHi || '');
  const [currentDescriptionHi, setCurrentDescriptionHi] = useState(params.descriptionHi || '');
  const [currentInsightsHi, setCurrentInsightsHi] = useState(params.insightsHi || '');

  // Hindi display: use translated fields when language is Hindi and translation exists
  const { language } = useLanguage();
  const isHindi = language === 'hi';
  const displayName = isHindi && currentNameHi ? currentNameHi : currentExerciseName;
  const displayDescription = isHindi && currentDescriptionHi ? currentDescriptionHi : currentDescription;
  const displayInsight = isHindi && currentInsightsHi ? currentInsightsHi : currentInsight;

  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const startTimestampRef = useRef<number | null>(null);
  const totalSecondsRef = useRef(0);
  const phaseRef = useRef<ExercisePhase>('preview');

  // Keep phaseRef current so AppState handler can read it without stale closure
  useEffect(() => { phaseRef.current = phase; }, [phase]);

  // Keep screen awake while timer is running; release when done/abandoned
  useEffect(() => {
    if (phase === 'active') {
      activateKeepAwakeAsync().catch(() => {});
    } else {
      deactivateKeepAwake();
    }
    return () => { deactivateKeepAwake(); };
  }, [phase]);

  const validPillars = ['Mental', 'Physical', 'Social', 'Spiritual'];
  const safePillar = params.pillar && validPillars.includes(params.pillar) ? params.pillar : 'Mental';
  const colors = pillarColors[safePillar];
  const safeDuration = Math.max(1, Math.min(10, currentDuration));
  const icon = (pillarIcons[safePillar] || 'psychology') as keyof typeof MaterialIcons.glyphMap;

  // Estimated XP (backend will recalculate with actual level scaling)
  const estimatedXp = currentXpReward;

  const breatheScale = useSharedValue(1);
  const ripple1 = useSharedValue(0.7);
  const ripple2 = useSharedValue(0.5);
  const doneCheckScale = useSharedValue(0);
  const doneContentOpacity = useSharedValue(0);
  const doneGlowScale = useSharedValue(0.6);

  useEffect(() => {
    if (phase === 'active') {
      breatheScale.value = withRepeat(
        withTiming(1.08, { duration: 3200, easing: Easing.inOut(Easing.ease) }),
        -1, true
      );
      ripple1.value = withRepeat(
        withSequence(withTiming(1.5, { duration: 2000 }), withTiming(0.7, { duration: 0 })),
        -1, false
      );
      ripple2.value = withDelay(1000, withRepeat(
        withSequence(withTiming(1.5, { duration: 2000 }), withTiming(0.5, { duration: 0 })),
        -1, false
      ));
    } else if (phase === 'done') {
      // Enhanced Done micro-interaction: spring-bounce check icon + glow ring + content fade-in
      doneCheckScale.value = withSpring(1, { damping: 10, stiffness: 200, mass: 0.8 });
      doneGlowScale.value = withSequence(
        withTiming(1.4, { duration: 350 }),
        withTiming(1, { duration: 250, easing: Easing.out(Easing.ease) })
      );
      doneContentOpacity.value = withDelay(200, withTiming(1, { duration: 350 }));
    }
  }, [phase]);

  const breatheStyle = useAnimatedStyle(() => ({
    transform: [{ scale: breatheScale.value }],
  }));

  const ripple1Style = useAnimatedStyle(() => ({
    transform: [{ scale: ripple1.value }],
    opacity: (1.5 - ripple1.value) * 0.35,
  }));

  const ripple2Style = useAnimatedStyle(() => ({
    transform: [{ scale: ripple2.value }],
    opacity: (1.5 - ripple2.value) * 0.25,
  }));

  const doneCheckStyle = useAnimatedStyle(() => ({
    transform: [{ scale: doneCheckScale.value }],
  }));

  const doneGlowStyle = useAnimatedStyle(() => ({
    transform: [{ scale: doneGlowScale.value }],
    opacity: 0.18,
  }));

  const doneContentStyle = useAnimatedStyle(() => ({
    opacity: doneContentOpacity.value,
    transform: [{ translateY: (1 - doneContentOpacity.value) * 10 }],
  }));

  // Derive breathing instruction from actual elapsed time (totalSec − remaining)
  const actualElapsed = totalSecondsRef.current - timeElapsed;
  const breatheCyclePos = actualElapsed % 9; // 9s per full breath cycle (3 in, 3 hold, 3 out)
  const breatheLabel = breatheCyclePos < 3
    ? t('exercise.breatheIn')
    : breatheCyclePos < 6
    ? t('exercise.breatheHold')
    : t('exercise.breatheOut');

  // Starts the countdown timer — auto-stops and completes when it reaches 0
  const startTimer = () => {
    const totalSec = safeDuration * 60;
    totalSecondsRef.current = totalSec;
    setTimeElapsed(totalSec);
    startTimestampRef.current = Date.now();
    setPhase('active');
    setSessionState({ startTime: Date.now(), endTime: null, status: 'active' });
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);

    if (timerRef.current) clearInterval(timerRef.current);
    timerRef.current = setInterval(() => {
      if (!startTimestampRef.current) return;
      const elapsed = Math.floor((Date.now() - startTimestampRef.current) / 1000);
      const remaining = Math.max(0, totalSecondsRef.current - elapsed);
      setTimeElapsed(remaining);
      if (remaining === 0) {
        clearInterval(timerRef.current!);
        timerRef.current = null;
        setPhase('done');
        setSessionState({ startTime: Date.now(), endTime: Date.now(), status: 'completed' });
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      }
    }, 1000);
  };

  // Sync remaining time when app returns to foreground; also auto-complete if timer ended while backgrounded
  useEffect(() => {
    const subscription = AppState.addEventListener('change', nextState => {
      if (nextState === 'active' && phaseRef.current === 'active' && startTimestampRef.current) {
        const elapsed = Math.floor((Date.now() - startTimestampRef.current) / 1000);
        const remaining = Math.max(0, totalSecondsRef.current - elapsed);
        setTimeElapsed(remaining);
        if (remaining === 0) {
          if (timerRef.current) {
            clearInterval(timerRef.current);
            timerRef.current = null;
          }
          setPhase('done');
          setSessionState({ startTime: startTimestampRef.current, endTime: Date.now(), status: 'completed' });
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        }
      }
    });
    return () => subscription.remove();
  }, []);

  // Clear interval on unmount
  useEffect(() => () => {
    if (timerRef.current) clearInterval(timerRef.current);
  }, []);

  useEffect(() => {
    if (Platform.OS !== 'android') return;
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      if (phaseRef.current === 'active') {
        setExitModalVisible(true);
        return true;
      }
      if (phaseRef.current === 'done' || phaseRef.current === 'abandoned') {
        return false;
      }
      // preview phase
      router.replace('/(main)');
      return true;
    });
    return () => sub.remove();
  }, []);

  const handleTryAnother = async () => {
    if (!nextStatus.canNext) {
      Alert.alert(
        t('exercise.dailyLimitTitle'),
        t('exercise.dailyLimitMsg', { limit: nextStatus.nextsLimit }),
        [{ text: t('common.ok') }]
      );
      return;
    }

    setIsNextLoading(true);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);

    const mood = parseInt(params.mood || '3') || 3;
    const tags: string[] = params.tags ? JSON.parse(params.tags) : [];
    const newExercise = await nextExercise(safePillar, mood, tags);

    setIsNextLoading(false);

    if (!newExercise) {
      Alert.alert(
        t('exercise.noMoreSkipsTitle'),
        t('exercise.noMoreSkipsMsg', { limit: nextStatus.nextsLimit }),
        [{ text: t('common.ok') }]
      );
      return;
    }

    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    setCurrentExerciseName(newExercise.exerciseName);
    setCurrentDescription(newExercise.description);
    setCurrentDuration(newExercise.durationMinutes);
    setCurrentDifficulty(newExercise.difficulty || 'easy');
    setCurrentXpReward(newExercise.xpReward ?? 100);
    setCurrentInsight(newExercise.insights || '');
    setCurrentExerciseId(newExercise.exerciseId || '');
    setCurrentNameHi(newExercise.nameHi || '');
    setCurrentDescriptionHi(newExercise.descriptionHi || '');
    setCurrentInsightsHi(newExercise.insightsHi || '');
  };

  const handleComplete = async () => {
    const result = await completeExercise();
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);

    if (result.mode === 'practice') {
      router.replace('/(main)');
      return;
    }

    router.replace({
      pathname: '/completion',
      params: {
        pillar: safePillar,
        exerciseName: displayName,
        artifactName: result.artifact?.name || '',
        artifactDesc: result.artifact?.description || '',
        artifactIcon: result.artifact?.icon || '',
        xpGained: String(result.xpAwarded),
        totalXp: String(result.progression.totalXp),
        currentLevel: String(result.progression.currentLevel),
        levelUp: String(result.progression.lastLevelUp),
        phaseBefore: result.phaseBefore,
        currentPhase: result.progression.currentPhase,
        phaseTransition: String(result.phaseTransition),
        isMaxLevel: String(result.isMaxLevel),
        isPrestige: String(result.isPrestige),
        newMilestoneKey: result.newMilestoneKey || '',
        levelProgressPercent: String(result.progression.currentLevelProgressPercent),
        isRetry: String(result.isRetry),
        mood: params.mood || '3',
        tags: params.tags || '[]',
      },
    });
  };

  const formatTime = (s: number) => `${Math.floor(s / 60)}:${(s % 60).toString().padStart(2, '0')}`;

  const nextsLeft = nextStatus.nextsLimit - nextStatus.nextsUsed;

  /* ─── PREVIEW ─── */
  if (phase === 'preview') {
    return (
      <View style={[styles.previewContainer, { backgroundColor: Colors.background, paddingTop: topInset }]}>
        {/* Close */}
        <Pressable
          onPress={() => router.replace('/(main)')}
          style={[styles.closeBtn, { top: topInset + 8, backgroundColor: Colors.cardBackground, borderColor: Colors.border }]}
        >
          <MaterialIcons name="close" size={20} color={Colors.textSecondary} />
        </Pressable>

        {/* Pillar badge */}
        <View style={[styles.pillarBanner, { backgroundColor: colors.main + '18', borderColor: colors.main + '40' }]}>
          <MaterialIcons name={icon} size={18} color={colors.main} />
          <Text style={[styles.pillarBannerText, { color: colors.main }]}>{t(`pillars.${safePillar.toLowerCase()}`)}</Text>
        </View>

        <Text style={[styles.previewTitle, { color: Colors.textPrimary }]}>{displayName}</Text>
        <Text style={[styles.previewDesc, { color: Colors.textSecondary }]}>{displayDescription}</Text>

        <View style={styles.previewMeta}>
          <MaterialIcons name="timer" size={16} color={Colors.textSecondary} />
          <Text style={[styles.previewMetaText, { color: Colors.textSecondary }]}>{safeDuration} min</Text>
        </View>

        <View style={[styles.previewButtons, { paddingBottom: bottomInset + 24 }]}>
          {!hasAlignedToday && (
            <View style={[styles.xpPill, { backgroundColor: Colors.cardBackground, borderColor: Colors.border }]}>
              <MaterialIcons name="bolt" size={16} color={colors.main} />
              <Text style={[styles.xpPillText, { color: Colors.textSecondary }]}>~{estimatedXp}+ XP</Text>
            </View>
          )}

          {hasAlignedToday && (
            <View style={[styles.practiceBadge, { backgroundColor: Colors.cardBackground, borderColor: Colors.border }]}>
              <MaterialIcons name="self-improvement" size={15} color={Colors.textSecondary} />
              <Text style={[styles.xpPillText, { color: Colors.textSecondary }]}>{t('exercise.freeFlow')}</Text>
            </View>
          )}

          <Pressable
            onPress={startTimer}
            style={({ pressed }) => [
              hasAlignedToday ? styles.startBtnOutline : styles.startBtn,
              hasAlignedToday
                ? { borderColor: colors.main, opacity: pressed ? 0.8 : 1 }
                : { backgroundColor: colors.main, opacity: pressed ? 0.8 : 1 },
            ]}
          >
            <Text style={[styles.startBtnText, hasAlignedToday && { color: colors.main }]}>
              {hasAlignedToday ? t('exercise.startPractice') : t('exercise.beginDailyAlignment')}
            </Text>
          </Pressable>

          {/* Try Another button */}
          <Pressable
            onPress={handleTryAnother}
            disabled={isNextLoading || !nextStatus.canNext}
            style={({ pressed }) => [
              styles.tryAnotherBtn,
              {
                borderColor: nextStatus.canNext ? colors.main : Colors.border,
                opacity: isNextLoading ? 0.6 : (!nextStatus.canNext ? 0.4 : (pressed ? 0.7 : 1)),
              },
            ]}
          >
            <MaterialIcons
              name="shuffle"
              size={16}
              color={nextStatus.canNext ? colors.main : Colors.textSecondary}
            />
            <Text style={[styles.tryAnotherText, { color: nextStatus.canNext ? colors.main : Colors.textSecondary }]}>
              {isNextLoading
                ? t('exercise.findingAnother')
                : !nextStatus.canNext
                ? t('exercise.tryAnother')
                : `${t('exercise.tryAnother')}  ·  ${t('exercise.skipsLeft', { count: nextsLeft })}`}
            </Text>
          </Pressable>
        </View>
      </View>
    );
  }

  /* ─── ACTIVE / DONE ─── */
  const warmGradient: readonly [string, string, string] = isDark
    ? ['#0D0820', '#041208', '#100820']
    : ['#EEF0FF', '#E8F8F4', '#F3EEFF'];

  return (
    <LinearGradient colors={warmGradient} style={StyleSheet.absoluteFill} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}>
      <FloatingDeco />

      {/* Close + XP badge */}
      <View style={[styles.lightHeader, { top: topInset + 6 }]}>
        {phase === 'active' && (
          <Pressable
            onPress={() => setExitModalVisible(true)}
            style={[styles.closeBtnLight, { backgroundColor: isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.06)' }]}
          >
            <MaterialIcons name="close" size={20} color={Colors.textSecondary} />
          </Pressable>
        )}
        {phase === 'active' && (
          <View style={[styles.xpLightBadge, { backgroundColor: colors.main + '20', borderColor: colors.main + '40' }]}>
            <MaterialIcons name="bolt" size={14} color={colors.main} />
            <Text style={[styles.xpLightText, { color: colors.main }]}>~{estimatedXp}+ XP</Text>
          </View>
        )}
      </View>

      {phase === 'active' && (
        <View style={[styles.lightContent, { paddingTop: topInset + 60, paddingBottom: bottomInset + 16 }]}>
          <Text style={[styles.activeTitle, { color: Colors.textPrimary }]}>{displayName}</Text>
          <Text style={[styles.activeDesc, { color: Colors.textPrimary }]}>{displayDescription}</Text>

          <View style={styles.timerWrap}>
            <Animated.View style={[styles.rippleRing, { borderColor: colors.main + '30' }, ripple1Style]} />
            <Animated.View style={[styles.rippleRing, { borderColor: colors.main + '20' }, ripple2Style]} />
            <Animated.View style={[styles.timerCircle, { backgroundColor: isDark ? 'rgba(255,255,255,0.06)' : 'rgba(255,255,255,0.8)', borderColor: colors.main + '30' }, breatheStyle]}>
              <MaterialIcons
                name={timeElapsed % 2 === 0 ? 'hourglass-top' : 'hourglass-bottom'}
                size={56}
                color={colors.main}
              />
              <Text style={[styles.timerLabel, { marginTop: 4, fontSize: 13, color: Colors.textSecondary }]}>{formatTime(timeElapsed)}</Text>
            </Animated.View>
          </View>

          <View style={styles.breatheRow}>
            <Text style={[styles.breatheText, { color: Colors.textSecondary }]}>
              {phase === 'active' ? breatheLabel : t('exercise.breathe')}
            </Text>
            <MaterialIcons name="air" size={18} color={Colors.textSecondary} />
          </View>

          {!!currentInsight && (
            <View style={[styles.insightCard, { backgroundColor: isDark ? 'rgba(255,255,255,0.05)' : 'rgba(255,255,255,0.8)' }]}>
              <View style={styles.insightHeader}>
                <MaterialIcons name="science" size={14} color={Colors.textSecondary} />
                <Text style={[styles.insightLabel, { color: Colors.textSecondary }]}>{t('exercise.scienceNote')}</Text>
              </View>
              <Text style={[styles.insightText, { color: Colors.textPrimary }]}>{displayInsight}</Text>
            </View>
          )}

        </View>
      )}

      {/* Exit confirmation modal */}
      <Modal
        visible={exitModalVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setExitModalVisible(false)}
      >
        <View style={[styles.modalOverlay, { backgroundColor: 'rgba(0,0,0,0.45)' }]}>
          <View style={[styles.modalCard, { backgroundColor: Colors.cardBackground }]}>
            <Text style={[styles.modalTitle, { color: Colors.textPrimary }]}>{t('exercise.endEarly')}</Text>
            <Text style={[styles.modalBody, { color: Colors.textSecondary }]}>{t('exercise.endEarlyMsg')}</Text>
            <View style={styles.modalActions}>
              <Pressable
                onPress={() => setExitModalVisible(false)}
                style={({ pressed }) => [
                  styles.modalBtn,
                  { backgroundColor: Colors.cardBackground, borderColor: Colors.border, opacity: pressed ? 0.8 : 1 },
                ]}
              >
                <Text style={[styles.modalBtnText, { color: Colors.textPrimary }]}>{t('common.cancel')}</Text>
              </Pressable>
              <Pressable
                onPress={() => {
                  setExitModalVisible(false);
                  if (timerRef.current) {
                    clearInterval(timerRef.current);
                    timerRef.current = null;
                  }
                  setPhase('abandoned');
                  setSessionState({ startTime: sessionState.startTime, endTime: Date.now(), status: 'abandoned' });
                  Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
                }}
                style={({ pressed }) => [
                  styles.modalBtn,
                  { backgroundColor: Colors.error, opacity: pressed ? 0.8 : 1 },
                ]}
              >
                <Text style={[styles.modalBtnText, { color: '#fff' }]}>{t('exercise.endSession')}</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>

      {phase === 'abandoned' && (
        <View style={[styles.lightContent, { paddingTop: topInset + 60, paddingBottom: bottomInset + 16 }]}>
          <View style={styles.abandonedWrap}>
            <MaterialIcons name="close" size={48} color={Colors.textSecondary} />
          </View>
          <Text style={[styles.abandonedTitle, { color: Colors.textPrimary }]}>{t('exercise.sessionEnded')}</Text>
          <Text style={[styles.abandonedDesc, { color: Colors.textSecondary }]}>{t('exercise.abandonedMsg')}</Text>
          <Pressable
            onPress={() => router.replace('/(main)')}
            style={({ pressed }) => [
              styles.abandonedBtn,
              { backgroundColor: Colors.textSecondary, opacity: pressed ? 0.8 : 1 },
            ]}
          >
            <Text style={[styles.abandonedBtnText, { color: '#fff' }]}>{t('common.continue')}</Text>
          </Pressable>
        </View>
      )}

      {phase === 'done' && (
        <View style={[styles.lightContent, { paddingTop: topInset + 60, paddingBottom: bottomInset + 16 }]}>
          {/* Animated check icon with glow ring */}
          <View style={styles.doneCheckWrap}>
            <Animated.View style={[styles.doneGlowRing, { backgroundColor: colors.main + '20' }, doneGlowStyle]} />
            <Animated.View style={[styles.doneCheck, { backgroundColor: colors.main + '25' }, doneCheckStyle]}>
              <MaterialIcons name="check" size={40} color={colors.main} />
            </Animated.View>
          </View>

          {/* Animated content below */}
          <Animated.View style={[styles.doneContent, doneContentStyle]}>
            <Text style={[styles.doneTitle, { color: Colors.textPrimary }]}>{t('exercise.wellDone')}</Text>
            <Text style={[styles.doneDesc, { color: Colors.textSecondary }]}>
              {t('exercise.completedAlignment', { pillar: t(`pillars.${safePillar.toLowerCase()}`) })}
            </Text>

            <Pressable
              onPress={handleComplete}
              style={({ pressed }) => [
                styles.continueBtn,
                { backgroundColor: colors.main, opacity: pressed ? 0.8 : 1 },
              ]}
            >
              <Text style={styles.continueBtnText}>{t('common.continue')}</Text>
            </Pressable>

            <View style={styles.breatheRow}>
              <Text style={[styles.breatheText, { color: Colors.textSecondary }]}>{t('exercise.breathe')}</Text>
              <MaterialIcons name="air" size={18} color={Colors.textSecondary} />
            </View>
          </Animated.View>
        </View>
      )}
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  previewContainer: {
    flex: 1,
    paddingHorizontal: 24,
  },
  closeBtn: {
    position: 'absolute',
    left: 20,
    width: 38,
    height: 38,
    borderRadius: 19,
    borderWidth: 1,
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 10,
  },
  pillarBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    alignSelf: 'flex-start',
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 16,
    borderWidth: 1,
    marginTop: 62,
    marginBottom: 28,
  },
  pillarBannerText: {
    fontSize: 14,
    fontFamily: 'Inter_700Bold',
  },
  previewTitle: {
    fontSize: 32,
    fontFamily: 'Inter_700Bold',
    marginBottom: 14,
    lineHeight: 38,
    textAlign: 'left',
  },
  previewDesc: {
    fontSize: 16,
    fontFamily: 'Inter_400Regular',
    lineHeight: 26,
    marginBottom: 18,
    textAlign: 'left',
  },
  previewMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 40,
  },
  previewMetaText: {
    fontSize: 14,
    fontFamily: 'Inter_500Medium',
  },
  difficultyBadge: {
    paddingHorizontal: 10,
    paddingVertical: 3,
    borderRadius: 8,
  },
  difficultyText: {
    fontSize: 12,
    fontFamily: 'Inter_600SemiBold',
  },
  previewButtons: {
    gap: 12,
    marginTop: 'auto' as const,
  },
  xpPill: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 16,
    borderRadius: 16,
    borderWidth: 1,
  },
  xpPillText: {
    fontSize: 16,
    fontFamily: 'Inter_600SemiBold',
  },
  startBtn: {
    paddingVertical: 18,
    borderRadius: 16,
    alignItems: 'center',
  },
  startBtnOutline: {
    paddingVertical: 18,
    borderRadius: 16,
    alignItems: 'center',
    borderWidth: 2,
    backgroundColor: 'transparent',
  },
  startBtnText: {
    fontSize: 18,
    fontFamily: 'Inter_700Bold',
    color: '#fff',
  },
  practiceBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 12,
    borderRadius: 14,
    borderWidth: 1,
  },
  tryAnotherBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 14,
    borderRadius: 16,
    borderWidth: 1.5,
    backgroundColor: 'transparent',
  },
  tryAnotherText: {
    fontSize: 15,
    fontFamily: 'Inter_500Medium',
  },
  lightHeader: {
    position: 'absolute',
    left: 20,
    right: 20,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    zIndex: 10,
  },
  closeBtnLight: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: 'rgba(0,0,0,0.06)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  xpLightBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
    borderWidth: 1,
  },
  xpLightText: {
    fontSize: 13,
    fontFamily: 'Inter_600SemiBold',
  },
  lightContent: {
    flex: 1,
    alignItems: 'center',
    paddingHorizontal: 24,
    gap: 18,
  },
  activeTitle: {
    fontSize: 26,
    fontFamily: 'Inter_700Bold',
    textAlign: 'left',
    alignSelf: 'stretch',
  },
  activeDesc: {
    fontSize: 16,
    fontFamily: 'Inter_400Regular',
    textAlign: 'left',
    lineHeight: 24,
    alignSelf: 'stretch',
  },
  timerWrap: {
    width: 200,
    height: 200,
    justifyContent: 'center',
    alignItems: 'center',
  },
  rippleRing: {
    position: 'absolute',
    width: 200,
    height: 200,
    borderRadius: 100,
    borderWidth: 1.5,
  },
  timerCircle: {
    width: 160,
    height: 160,
    borderRadius: 80,
    borderWidth: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  timerLabel: {
    fontSize: 12,
    fontFamily: 'Inter_400Regular',
    color: '#9B9BA8',
    marginTop: -2,
  },
  progressBarWrap: {
    width: '100%',
    paddingHorizontal: 4,
  },
  progressTrack: {
    height: 5,
    borderRadius: 3,
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    borderRadius: 3,
  },
  breatheRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 4,
  },
  breatheText: {
    fontSize: 14,
    fontFamily: 'Inter_500Medium',
    color: 'rgba(0,0,0,0.35)',
  },
  doneBtn: {
    marginTop: 32,
    paddingVertical: 16,
    paddingHorizontal: 48,
    borderRadius: 28,
    alignSelf: 'center',
  },
  doneBtnText: {
    fontSize: 18,
    fontFamily: 'Inter_600SemiBold',
    color: '#fff',
    letterSpacing: 0.3,
  },
  doneCheckWrap: {
    alignItems: 'center',
    justifyContent: 'center',
    width: 120,
    height: 120,
    marginBottom: 4,
  },
  doneGlowRing: {
    position: 'absolute',
    width: 120,
    height: 120,
    borderRadius: 60,
  },
  doneCheck: {
    width: 90,
    height: 90,
    borderRadius: 45,
    justifyContent: 'center',
    alignItems: 'center',
  },
  doneContent: {
    width: '100%',
    alignItems: 'center',
    gap: 14,
  },
  doneTitle: {
    fontSize: 32,
    fontFamily: 'Inter_700Bold',
    color: '#2D2D3A',
  },
  doneDesc: {
    fontSize: 16,
    fontFamily: 'Inter_400Regular',
    color: '#6B6B7A',
    textAlign: 'center',
    lineHeight: 23,
  },
  continueBtn: {
    width: '100%',
    paddingVertical: 18,
    borderRadius: 28,
    alignItems: 'center',
    marginTop: 8,
  },
  continueBtnText: {
    fontSize: 17,
    fontFamily: 'Inter_700Bold',
    color: '#fff',
  },
  decoItem: {
    position: 'absolute',
  },
  insightCard: {
    width: '100%',
    backgroundColor: 'rgba(255,255,255,0.8)',
    borderRadius: 16,
    paddingHorizontal: 16,
    paddingVertical: 14,
    gap: 6,
  },
  insightHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  insightLabel: {
    fontSize: 11,
    fontFamily: 'Inter_600SemiBold',
    color: 'rgba(80,60,120,0.6)',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  insightText: {
    fontSize: 13,
    fontFamily: 'Inter_400Regular',
    color: 'rgba(0,0,0,0.5)',
    lineHeight: 19,
  },
  modalOverlay: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 32,
  },
  modalCard: {
    width: '100%',
    maxWidth: 340,
    borderRadius: 24,
    padding: 28,
    gap: 18,
    borderWidth: 1,
  },
  modalTitle: {
    fontSize: 22,
    fontFamily: 'Inter_700Bold',
    textAlign: 'center',
  },
  modalBody: {
    fontSize: 15,
    fontFamily: 'Inter_400Regular',
    textAlign: 'center',
    lineHeight: 22,
  },
  modalActions: {
    flexDirection: 'row',
    gap: 12,
  },
  modalBtn: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 16,
    borderWidth: 1,
    alignItems: 'center',
  },
  modalBtnText: {
    fontSize: 15,
    fontFamily: 'Inter_700Bold',
  },
  abandonedWrap: {
    width: 100,
    height: 100,
    borderRadius: 50,
    backgroundColor: 'rgba(255,255,255,0.1)',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 8,
  },
  abandonedTitle: {
    fontSize: 28,
    fontFamily: 'Inter_700Bold',
    textAlign: 'center',
  },
  abandonedDesc: {
    fontSize: 15,
    fontFamily: 'Inter_400Regular',
    textAlign: 'center',
    lineHeight: 22,
    paddingHorizontal: 16,
  },
  abandonedBtn: {
    width: '100%',
    paddingVertical: 18,
    borderRadius: 28,
    alignItems: 'center',
    marginTop: 8,
  },
  abandonedBtnText: {
    fontSize: 17,
    fontFamily: 'Inter_700Bold',
  },
});
