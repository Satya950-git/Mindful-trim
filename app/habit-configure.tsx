import React, { useState, useEffect, useRef } from 'react';
import {
  View, Text, StyleSheet, ScrollView, Pressable,
  TextInput, ActivityIndicator, Platform,
  Animated, KeyboardAvoidingView, PanResponder,
} from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { MaterialIcons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';

import { useTranslation } from 'react-i18next';
import { useThemeColors } from '@/context/ThemeContext';
import { useHabits } from '@/context/HabitsContext';
import { useLanguage } from '@/context/LanguageContext';
import { getLocalHabitName } from '@/data/habitsData';
import { HABIT_DESCRIPTIONS_HI } from '@/data/habitDescriptionsHi';
import { apiRequest } from '@/lib/query-client';

// ─── Sync-error snackbar ──────────────────────────────────────────────────────
function SyncErrorSnackbar({ message, onDismiss }: { message: string; onDismiss: () => void }) {
  const C = useThemeColors();
  const opacity = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.timing(opacity, { toValue: 1, duration: 220, useNativeDriver: true }).start();
    const t = setTimeout(() => {
      Animated.timing(opacity, { toValue: 0, duration: 280, useNativeDriver: true })
        .start(() => onDismiss());
    }, 4500);
    return () => clearTimeout(t);
  }, [message]);

  return (
    <Animated.View style={[snackSt.wrap, { backgroundColor: C.cardBackground, opacity }]}>
      <MaterialIcons name="cloud-off" size={16} color="#F59E0B" />
      <Text style={[snackSt.text, { color: C.textPrimary }]} numberOfLines={3}>{message}</Text>
      <Pressable onPress={onDismiss} hitSlop={8}>
        <MaterialIcons name="close" size={16} color={C.textTertiary} />
      </Pressable>
    </Animated.View>
  );
}

const snackSt = StyleSheet.create({
  wrap: {
    position: 'absolute', bottom: 100, left: 16, right: 16,
    flexDirection: 'row', alignItems: 'center', gap: 10,
    borderRadius: 14, padding: 14,
    shadowColor: '#000', shadowOpacity: 0.15, shadowRadius: 8,
    shadowOffset: { width: 0, height: 4 }, elevation: 6,
  },
  text: { flex: 1, fontSize: 13, fontFamily: 'Inter_400Regular', lineHeight: 18 },
});

// ─── Pillar colour map ────────────────────────────────────────────────────────
const PILLAR_COLORS: Record<string, string> = {
  Mental:   '#5B8DEF',
  Physical: '#56C596',
  Social:   '#F2836B',
  Spiritual:'#9B7DD4',
};

const BLOCK_COLORS: Record<string, string> = {
  Morning:   '#F59E0B',
  Workday:   '#3B82F6',
  Evening:   '#6366F1',
  Lifestyle: '#10B981',
};

const BLOCK_EMOJIS: Record<string, string> = {
  Morning: '🌅', Workday: '💼', Evening: '🌙', Lifestyle: '🌿',
};

const MIN_DAYS = 18;
const MAX_DAYS = 365;

// ─── Science copy key map ─────────────────────────────────────────────────────
function scienceKey(days: number): string {
  if (days < MIN_DAYS) return '';
  if (days <= 21) return 'habits.configure.science21';
  if (days <= 42) return 'habits.configure.science42';
  if (days <= 66) return 'habits.configure.science66';
  return 'habits.configure.science180';
}


export default function HabitConfigureScreen() {
  const { habitId } = useLocalSearchParams<{ habitId: string }>();
  const insets = useSafeAreaInsets();
  const topInset = Platform.OS === 'web' ? 67 : insets.top;
  const botInset = Platform.OS === 'web' ? 34 : insets.bottom;
  const C = useThemeColors();
  const { language } = useLanguage();
  const { t } = useTranslation();

  const { allHabitsState, configureHabit, configSyncError, dismissConfigSyncError } = useHabits();
  const habit = allHabitsState.find(h => h.habitId === habitId) ?? null;

  // ─── Local form state ─────────────────────────────────────────────────────
  const [daysInput, setDaysInput] = useState(String(habit?.journeyTargetDays ?? 21));
  const [showSnapTooltip, setShowSnapTooltip] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  // Local offline-save snackbar (shows when the network was down during save)
  const [offlineSnack, setOfflineSnack] = useState<string | null>(null);


  const tooltipAnim = useRef(new Animated.Value(0)).current;

  // ─── PanResponder slider ──────────────────────────────────────────────────
  const sliderWidthRef = useRef(0);
  const [sliderWidthPx, setSliderWidthPx] = useState(0);

  // Derived slider position from daysInput (pixel-based for accuracy in RN absolute layout)
  const currentDaysForSlider = parseInt(daysInput, 10) || MIN_DAYS;
  const sliderFraction = (Math.min(Math.max(currentDaysForSlider, MIN_DAYS), MAX_DAYS) - MIN_DAYS) / (MAX_DAYS - MIN_DAYS);
  const thumbLeft = sliderFraction * sliderWidthPx;

  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderGrant: (evt) => {
        if (sliderWidthRef.current <= 0) return;
        const x = evt.nativeEvent.locationX;
        const frac = Math.min(Math.max(x / sliderWidthRef.current, 0), 1);
        const days = Math.round(MIN_DAYS + frac * (MAX_DAYS - MIN_DAYS));
        setDaysInput(String(days));
        setShowSnapTooltip(false);
        Haptics.selectionAsync();
      },
      onPanResponderMove: (evt) => {
        if (sliderWidthRef.current <= 0) return;
        const x = evt.nativeEvent.locationX;
        const frac = Math.min(Math.max(x / sliderWidthRef.current, 0), 1);
        const days = Math.round(MIN_DAYS + frac * (MAX_DAYS - MIN_DAYS));
        setDaysInput(String(days));
      },
      onPanResponderRelease: () => {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      },
    })
  ).current;

  useEffect(() => {
    if (habit) {
      setDaysInput(String(habit.journeyTargetDays ?? 21));
    }
    // Re-run if habitId changes (e.g. navigation reuse) or habit arrives late from context load
  }, [habitId, habit?.journeyTargetDays]);

  // ─── Days input handling ──────────────────────────────────────────────────
  const handleDaysChange = (val: string) => {
    setDaysInput(val.replace(/[^0-9]/g, ''));
    setShowSnapTooltip(false);
  };

  const handleDaysBlur = () => {
    const n = parseInt(daysInput, 10);
    if (!n || n < MIN_DAYS) {
      setDaysInput(String(MIN_DAYS));
      setShowSnapTooltip(true);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
      Animated.sequence([
        Animated.timing(tooltipAnim, { toValue: 1, duration: 200, useNativeDriver: true }),
        Animated.delay(2500),
        Animated.timing(tooltipAnim, { toValue: 0, duration: 300, useNativeDriver: true }),
      ]).start(() => setShowSnapTooltip(false));
    } else if (n > MAX_DAYS) {
      setDaysInput(String(MAX_DAYS));
    }
  };

  // ─── Slider-style preset buttons ─────────────────────────────────────────
  const presets = [18, 30, 66, 90, 180];

  // ─── Save ─────────────────────────────────────────────────────────────────
  const handleSave = async () => {
    const days = parseInt(daysInput, 10);
    const safeDays = !days || days < MIN_DAYS ? MIN_DAYS : Math.min(days, MAX_DAYS);
    setSaving(true);
    setSaveError(null);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    const result = await configureHabit(habitId!, {
      journeyTargetDays: safeDays,
      isCoOp: false,
      partnerId: null,
    });
    setSaving(false);
    if (!result.success) {
      const isOfflineSave = result.error?.includes('locally');
      if (isOfflineSave) {
        // Config was written to AsyncStorage — treat as success but show snackbar
        setSaved(true);
        setOfflineSnack(t('habits.configure.savedLocallyMsg'));
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
        setTimeout(() => router.back(), 1200);
      } else {
        setSaveError(result.error ?? t('habits.configure.saveFailed'));
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      }
      return;
    }
    setSaved(true);
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    setTimeout(() => router.back(), 800);
  };

  if (!habit) {
    return (
      <View style={[st.root, { backgroundColor: C.background }]}>
        <View style={[st.header, { paddingTop: topInset + 12, borderBottomColor: C.border }]}>
          <Pressable style={st.backBtn} onPress={() => router.back()}>
            <MaterialIcons name="arrow-back" size={22} color={C.textPrimary} />
          </Pressable>
          <Text style={[st.title, { color: C.textPrimary }]}>{t('habits.configure.title')}</Text>
        </View>
        <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
          <Text style={{ color: C.textTertiary }}>{t('habits.configure.habitNotFound')}</Text>
        </View>
      </View>
    );
  }

  const blockColor = BLOCK_COLORS[habit.timeBlock] ?? '#9B7DD4';
  const pillarColor = PILLAR_COLORS[habit.pillar] ?? '#9B7DD4';
  const currentDays = parseInt(daysInput, 10) || MIN_DAYS;
  const isJourneyActive = habit.journeyStartDate !== null;

  return (
    <KeyboardAvoidingView
      style={[st.root, { backgroundColor: C.background }]}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      {/* Header */}
      <View style={[st.header, { paddingTop: topInset + 12, borderBottomColor: C.border, backgroundColor: C.background }]}>
        <Pressable style={st.backBtn} onPress={() => router.back()}>
          <MaterialIcons name="arrow-back" size={22} color={C.textPrimary} />
        </Pressable>
        <Text style={[st.title, { color: C.textPrimary }]}>{t('habits.configure.title')}</Text>
      </View>

      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={[st.content, { paddingBottom: botInset + 80 }]}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        {/* Habit card */}
        <View style={[st.habitCard, { backgroundColor: C.cardBackground, borderColor: C.border }]}>
          <View style={st.habitCardTop}>
            <View style={[st.blockBadge, { backgroundColor: blockColor + '22', borderColor: blockColor + '44' }]}>
              <Text style={st.blockBadgeEmoji}>{BLOCK_EMOJIS[habit.timeBlock]}</Text>
              <Text style={[st.blockBadgeText, { color: blockColor }]}>{t(`habits.timeBlocks.${habit.timeBlock.toLowerCase()}`)}</Text>
            </View>
            <View style={[st.pillarBadge, { backgroundColor: pillarColor + '22', borderColor: pillarColor + '44' }]}>
              <Text style={[st.pillarBadgeText, { color: pillarColor }]}>{t(`pillars.${habit.pillar.toLowerCase()}`)}</Text>
            </View>
            {habit.habitStatus === 'maintained' && (
              <View style={[st.masteredBadge]}>
                <Text style={st.masteredBadgeText}>{t('habits.mastered')}</Text>
              </View>
            )}
          </View>
          <Text style={[st.habitName, { color: C.textPrimary }]}>{getLocalHabitName(habit, language)}</Text>
          <Text style={[st.habitDesc, { color: C.textSecondary }]}>
            {language === 'hi' ? (HABIT_DESCRIPTIONS_HI[habit.habitId] ?? habit.description) : habit.description}
          </Text>
          {isJourneyActive && (
            <View style={[st.journeyBanner, { backgroundColor: blockColor + '18' }]}>
              <MaterialIcons name="flag" size={14} color={blockColor} />
              <Text style={[st.journeyBannerText, { color: blockColor }]}>
                {t('habits.configure.journeyStarted', { date: habit.journeyStartDate, days: habit.journeyTargetDays })}
              </Text>
            </View>
          )}
        </View>

        {/* ── Journey Duration ───────────────────────────────────────────── */}
        <View style={[st.section, { backgroundColor: C.cardBackground, borderColor: C.border }]}>
          <Text style={[st.sectionTitle, { color: C.textPrimary }]}>{t('habits.configure.journeyLength')}</Text>
          <Text style={[st.sectionSub, { color: C.textTertiary }]}>{t('habits.configure.journeyLengthSub')}</Text>

          {/* Preset chips */}
          <View style={st.presetRow}>
            {presets.map(p => {
              const active = parseInt(daysInput, 10) === p;
              return (
                <Pressable
                  key={p}
                  style={[st.presetChip, { borderColor: active ? blockColor : C.border, backgroundColor: active ? blockColor + '18' : 'transparent' }]}
                  onPress={() => { setDaysInput(String(p)); Haptics.selectionAsync(); setShowSnapTooltip(false); }}
                >
                  <Text style={[st.presetChipText, { color: active ? blockColor : C.textSecondary }]}>{p}d</Text>
                </Pressable>
              );
            })}
          </View>

          {/* Drag slider */}
          <View
            style={[st.sliderTrack, { backgroundColor: C.border }]}
            onLayout={e => {
              sliderWidthRef.current = e.nativeEvent.layout.width;
              setSliderWidthPx(e.nativeEvent.layout.width);
            }}
            {...panResponder.panHandlers}
          >
            <View style={[st.sliderFill, { width: sliderFraction * sliderWidthPx, backgroundColor: blockColor }]} />
            <View style={[st.sliderThumb, { left: thumbLeft - 11, backgroundColor: blockColor, borderColor: C.background }]} />
          </View>

          {/* Manual input */}
          <View style={[st.daysRow, { borderColor: C.border, backgroundColor: C.background }]}>
            <Pressable hitSlop={8} onPress={() => {
              const n = Math.max(MIN_DAYS, (parseInt(daysInput, 10) || MIN_DAYS) - 1);
              setDaysInput(String(n));
            }}>
              <MaterialIcons name="remove-circle-outline" size={26} color={C.textTertiary} />
            </Pressable>
            <TextInput
              style={[st.daysInput, { color: C.textPrimary }]}
              value={daysInput}
              onChangeText={handleDaysChange}
              onBlur={handleDaysBlur}
              keyboardType="number-pad"
              maxLength={3}
              selectTextOnFocus
            />
            <Text style={[st.daysLabel, { color: C.textSecondary }]}>{t('habits.configure.days')}</Text>
            <Pressable hitSlop={8} onPress={() => {
              const n = Math.min(MAX_DAYS, (parseInt(daysInput, 10) || MIN_DAYS) + 1);
              setDaysInput(String(n));
            }}>
              <MaterialIcons name="add-circle-outline" size={26} color={C.textTertiary} />
            </Pressable>
          </View>

          {/* Snap tooltip */}
          {showSnapTooltip && (
            <Animated.View style={[st.tooltip, { backgroundColor: '#F59E0B', opacity: tooltipAnim }]}>
              <MaterialIcons name="science" size={13} color="#fff" />
              <Text style={st.tooltipText}>{t('habits.configure.snapTooltip')}</Text>
            </Animated.View>
          )}

          {/* Science line */}
          {currentDays >= MIN_DAYS && scienceKey(currentDays) && (
            <Text style={[st.scienceLine, { color: blockColor }]}>
              💡 {t(scienceKey(currentDays))}
            </Text>
          )}
        </View>

      </ScrollView>

      {/* Save button */}
      <View style={[st.footer, { paddingBottom: botInset + 16, backgroundColor: C.background, borderTopColor: C.border }]}>
        {saveError ? (
          <View style={st.saveErrorRow}>
            <MaterialIcons name="error-outline" size={14} color="#EF4444" />
            <Text style={st.saveErrorText}>{saveError}</Text>
          </View>
        ) : null}
        <Pressable
          style={[
            st.saveBtn,
            { backgroundColor: saved ? '#22C55E' : blockColor },
            saving && { opacity: 0.7 },
          ]}
          onPress={handleSave}
          disabled={saving}
        >
          {saving
            ? <ActivityIndicator size="small" color="#fff" />
            : <Text style={st.saveBtnText}>{saved ? t('habits.saved') : t('habits.configure.startJourney')}</Text>
          }
        </Pressable>
      </View>

      {/* Offline-save snackbar — shown when network was down during save */}
      {offlineSnack && (
        <SyncErrorSnackbar message={offlineSnack} onDismiss={() => setOfflineSnack(null)} />
      )}

      {/* Boot-time reconciliation error — shown when a pending config still can't reach the server */}
      {configSyncError && (
        <SyncErrorSnackbar message={configSyncError} onDismiss={dismissConfigSyncError} />
      )}
    </KeyboardAvoidingView>
  );
}

const st = StyleSheet.create({
  root: { flex: 1 },
  header: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 16, paddingBottom: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  backBtn: { padding: 6, marginRight: 4 },
  title: { flex: 1, fontSize: 20, fontFamily: 'Inter_600SemiBold' },
  content: { padding: 16, gap: 14 },

  habitCard: { borderRadius: 16, padding: 16, borderWidth: StyleSheet.hairlineWidth, gap: 8 },
  habitCardTop: { flexDirection: 'row', gap: 6, flexWrap: 'wrap' },
  blockBadge: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 10, paddingVertical: 4, borderRadius: 20, borderWidth: 1 },
  blockBadgeEmoji: { fontSize: 12 },
  blockBadgeText: { fontSize: 12, fontFamily: 'Inter_600SemiBold' },
  pillarBadge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 20, borderWidth: 1, justifyContent: 'center' },
  pillarBadgeText: { fontSize: 12, fontFamily: 'Inter_600SemiBold' },
  masteredBadge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 20, backgroundColor: '#FEF3C7' },
  masteredBadgeText: { fontSize: 12, fontFamily: 'Inter_600SemiBold', color: '#92400E' },
  habitName: { fontSize: 18, fontFamily: 'Inter_700Bold', lineHeight: 24 },
  habitDesc: { fontSize: 14, fontFamily: 'Inter_400Regular', lineHeight: 20 },
  journeyBanner: { flexDirection: 'row', alignItems: 'center', gap: 6, padding: 10, borderRadius: 10, marginTop: 4 },
  journeyBannerText: { fontSize: 12, fontFamily: 'Inter_500Medium', flex: 1 },

  section: { borderRadius: 16, padding: 16, borderWidth: StyleSheet.hairlineWidth, gap: 12 },
  sectionTitle: { fontSize: 16, fontFamily: 'Inter_600SemiBold' },
  sectionSub: { fontSize: 12, fontFamily: 'Inter_400Regular', lineHeight: 18, marginTop: -6 },

  presetRow: { flexDirection: 'row', gap: 8, flexWrap: 'wrap' },
  presetChip: { paddingHorizontal: 14, paddingVertical: 7, borderRadius: 20, borderWidth: 1 },
  presetChipText: { fontSize: 13, fontFamily: 'Inter_600SemiBold' },

  daysRow: { flexDirection: 'row', alignItems: 'center', gap: 10, borderRadius: 12, borderWidth: StyleSheet.hairlineWidth, padding: 10 },
  daysInput: { fontSize: 28, fontFamily: 'Inter_700Bold', width: 60, textAlign: 'center' },
  daysLabel: { fontSize: 14, fontFamily: 'Inter_500Medium', flex: 1 },

  tooltip: { flexDirection: 'row', alignItems: 'center', gap: 6, padding: 10, borderRadius: 10 },
  tooltipText: { flex: 1, fontSize: 12, fontFamily: 'Inter_500Medium', color: '#fff', lineHeight: 16 },
  scienceLine: { fontSize: 12, fontFamily: 'Inter_400Regular', lineHeight: 18 },

  toggle: { flexDirection: 'row', borderRadius: 12, borderWidth: StyleSheet.hairlineWidth, padding: 3, gap: 2 },
  toggleBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 10, borderRadius: 10 },
  toggleText: { fontSize: 14, fontFamily: 'Inter_600SemiBold' },

  subToggle: { flexDirection: 'row', borderRadius: 10, borderWidth: StyleSheet.hairlineWidth, padding: 3, gap: 2 },
  subToggleBtn: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingVertical: 8, borderRadius: 8 },
  subToggleText: { fontSize: 13, fontFamily: 'Inter_600SemiBold' },

  addToGroupBtn: { borderRadius: 12, paddingVertical: 13, alignItems: 'center', marginTop: 4 },
  addToGroupBtnText: { color: '#fff', fontSize: 14, fontFamily: 'Inter_700Bold' },
  groupAddErrorText: { fontSize: 12, fontFamily: 'Inter_400Regular', color: '#EF4444', lineHeight: 16, marginTop: -2 },

  friendPickerWrap: { gap: 10 },
  pickerLabel: { fontSize: 11, fontFamily: 'Inter_600SemiBold', letterSpacing: 0.5 },
  noFriends: { alignItems: 'center', gap: 8, paddingVertical: 20 },
  noFriendsText: { fontSize: 13, fontFamily: 'Inter_400Regular', textAlign: 'center', lineHeight: 18 },
  friendRow: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 12, borderRadius: 12, borderWidth: 1, marginBottom: 6 },
  friendRowSel: { backgroundColor: '#9B7DD41A' },
  avatar: { width: 36, height: 36, borderRadius: 18, justifyContent: 'center', alignItems: 'center' },
  avatarText: { fontSize: 14, fontFamily: 'Inter_700Bold', color: '#fff' },
  friendName: { flex: 1, fontSize: 14, fontFamily: 'Inter_500Medium' },

  sliderTrack: {
    height: 6, borderRadius: 3, marginVertical: 4,
    position: 'relative', justifyContent: 'center',
  },
  sliderFill: { height: 6, borderRadius: 3, position: 'absolute', left: 0 },
  sliderThumb: {
    position: 'absolute',
    width: 22, height: 22, borderRadius: 11,
    borderWidth: 3,
    marginLeft: -11, top: -8,
    shadowColor: '#000', shadowOpacity: 0.2, shadowRadius: 4, shadowOffset: { width: 0, height: 2 },
    elevation: 4,
  },

  footer: { paddingHorizontal: 16, paddingTop: 12, borderTopWidth: StyleSheet.hairlineWidth },
  saveErrorRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 8, paddingHorizontal: 4 },
  saveErrorText: { flex: 1, fontSize: 13, fontFamily: 'Inter_400Regular', color: '#EF4444', lineHeight: 18 },
  saveBtn: { borderRadius: 14, paddingVertical: 16, alignItems: 'center' },
  saveBtnText: { color: '#fff', fontSize: 16, fontFamily: 'Inter_700Bold' },
});
