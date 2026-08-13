import React, { useState, useCallback, useRef, useEffect } from 'react';
import {
  View, Text, StyleSheet, ScrollView, Pressable, Switch, FlatList,
  Platform, Animated, ActivityIndicator,
  Alert, Linking, Modal, Share, TextInput,
} from 'react-native';
import { useTranslation } from 'react-i18next';
import Reanimated, { useSharedValue, useAnimatedStyle, withTiming } from 'react-native-reanimated';
import { router, useFocusEffect } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { MaterialIcons, Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';

import { useThemeColors, pillarIcons } from '@/context/ThemeContext';
import { useHabits, TimeBlock, UserHabit, IncomingNudge } from '@/context/HabitsContext';
import { useLanguage } from '@/context/LanguageContext';
import { getLocalHabitName } from '@/data/habitsData';
import { HABIT_DESCRIPTIONS_HI } from '@/data/habitDescriptionsHi';
import { useFriendActivity } from '@/context/FriendActivityContext';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useAuth } from '@/context/AuthContext';
import { apiRequest, getApiUrl } from '@/lib/query-client';

const SHEET_HEIGHT = 520;

function getTodayStr(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

// ─── Time-block config ────────────────────────────────────────────────────────
const BLOCK_CFG: Record<TimeBlock, { emoji: string; label: string; main: string; light: string; darkLight: string }> = {
  Morning:   { emoji: '🌅', label: 'Morning',   main: '#F59E0B', light: '#FEF3C7', darkLight: '#78350F' },
  Workday:   { emoji: '💼', label: 'Workday',   main: '#3B82F6', light: '#DBEAFE', darkLight: '#1E3A8A' },
  Evening:   { emoji: '🌙', label: 'Evening',   main: '#6366F1', light: '#E0E7FF', darkLight: '#312E81' },
  Lifestyle: { emoji: '🌿', label: 'Lifestyle', main: '#10B981', light: '#D1FAE5', darkLight: '#064E3B' },
};

// ─── Dual-Completion Banner (slides down from top) ────────────────────────────
function DualCompletionBanner({ message, onDone, topInset }: {
  message: string;
  onDone: () => void;
  topInset: number;
}) {
  const C = useThemeColors();
  const translateY = useSharedValue(-120);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    translateY.value = withTiming(0, { duration: 380 });
    timerRef.current = setTimeout(() => {
      translateY.value = withTiming(-120, { duration: 300 });
      setTimeout(onDone, 320);
    }, 3000);
    return () => { if (timerRef.current) clearTimeout(timerRef.current); };
  }, [message]);

  const animStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: translateY.value }],
  }));

  return (
    <Reanimated.View style={[banner.wrap, animStyle, { top: topInset + 8, backgroundColor: '#9B7DD4' }]}>
      <Text style={banner.emoji}>🎉</Text>
      <Text style={banner.text} numberOfLines={2}>{message}</Text>
    </Reanimated.View>
  );
}

// ─── Nudge Snackbar ───────────────────────────────────────────────────────────
function NudgeSnackbar({
  message, onDismiss, onAction, actionLabel,
}: {
  message: string;
  onDismiss: () => void;
  onAction?: () => void;
  actionLabel?: string;
}) {
  const C = useThemeColors();
  const opacity = useRef(new Animated.Value(0)).current;
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const startTimer = () => {
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => {
      Animated.timing(opacity, { toValue: 0, duration: 280, useNativeDriver: true }).start(() => onDismiss());
    }, onAction ? 8000 : 3000);
  };

  useEffect(() => {
    Animated.timing(opacity, { toValue: 1, duration: 220, useNativeDriver: true }).start();
    startTimer();
    return () => { if (timerRef.current) clearTimeout(timerRef.current); };
  }, [message]);

  return (
    <Animated.View style={[snack.wrap, { backgroundColor: C.cardBackground, opacity }]}>
      <MaterialIcons name="tips-and-updates" size={16} color="#F59E0B" />
      <Text style={[snack.text, { color: C.textPrimary }]} numberOfLines={3}>{message}</Text>
      {onAction && actionLabel && (
        <Pressable
          hitSlop={8}
          style={snack.actionBtn}
          onPress={() => { if (timerRef.current) clearTimeout(timerRef.current); onAction(); onDismiss(); }}
        >
          <Text style={snack.actionText}>{actionLabel}</Text>
        </Pressable>
      )}
      <Pressable onPress={onDismiss} hitSlop={8}>
        <MaterialIcons name="close" size={16} color={C.textTertiary} />
      </Pressable>
    </Animated.View>
  );
}

// ─── Co-Op Setup Sheet ────────────────────────────────────────────────────────
type FriendEntry = { friendshipId: string; userId: string; name: string; createdAt: string };
type FriendsData = { accepted: FriendEntry[]; pending: FriendEntry[] };

function CoOpSheet({
  visible, habit, onClose, onSave, onPrivacyPress,
}: {
  visible: boolean;
  habit: UserHabit | null;
  onClose: () => void;
  onSave: (habitId: string, isCoOp: boolean, partnerId: string | null) => void;
  onPrivacyPress?: () => void;
}) {
  const C = useThemeColors();
  const { t } = useTranslation();
  const { language } = useLanguage();
  const insets = useSafeAreaInsets();
  const botInset = Platform.OS === 'web' ? 34 : insets.bottom;

  const [mounted, setMounted] = useState(false);
  const slideY = useRef(new Animated.Value(400)).current;
  const backdropAnim = useRef(new Animated.Value(0)).current;

  const [isCoOp, setIsCoOp] = useState(false);
  const [selectedPartnerId, setSelectedPartnerId] = useState<string | null>(null);
  const [friends, setFriends] = useState<FriendEntry[]>([]);
  const [loadingFriends, setLoadingFriends] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (visible && habit) {
      setIsCoOp(habit.isCoOp);
      setSelectedPartnerId(habit.partnerId);
      setMounted(true);
      slideY.setValue(400);
      backdropAnim.setValue(0);
      Animated.parallel([
        Animated.spring(slideY, { toValue: 0, useNativeDriver: true, damping: 22, stiffness: 160 }),
        Animated.timing(backdropAnim, { toValue: 1, duration: 220, useNativeDriver: true }),
      ]).start();
      // Fetch accepted friends
      fetchFriends();
    } else {
      Animated.parallel([
        Animated.timing(slideY, { toValue: 400, duration: 240, useNativeDriver: true }),
        Animated.timing(backdropAnim, { toValue: 0, duration: 200, useNativeDriver: true }),
      ]).start(() => setMounted(false));
    }
  }, [visible, habit]);

  const fetchFriends = async () => {
    setLoadingFriends(true);
    try {
      const res = await apiRequest('GET', '/api/friends');
      const data: FriendsData = await res.json();
      setFriends(data.accepted ?? []);
    } catch { /* silent */ } finally {
      setLoadingFriends(false);
    }
  };

  const handleSave = async () => {
    if (!habit) return;
    setSaving(true);
    const finalPartnerId = isCoOp ? selectedPartnerId : null;
    await onSave(habit.habitId, isCoOp, finalPartnerId);
    setSaving(false);
    onClose();
  };

  if (!mounted) return null;

  return (
    <Modal transparent visible={mounted} onRequestClose={onClose} statusBarTranslucent>
      <View style={StyleSheet.absoluteFill}>
        <Animated.View style={[StyleSheet.absoluteFill, { opacity: backdropAnim }]}>
          <Pressable style={[StyleSheet.absoluteFill, { backgroundColor: 'rgba(0,0,0,0.52)' }]} onPress={onClose} />
        </Animated.View>
        <Animated.View style={[coopSt.sheet, {
          backgroundColor: C.cardBackground,
          paddingBottom: botInset + 8,
          transform: [{ translateY: slideY }],
        }]}>
          <View style={[coopSt.handle, { backgroundColor: C.border }]} />

          <View style={coopSt.header}>
            <Text style={[coopSt.title, { color: C.textPrimary }]}>{t('habits.coop.title')}</Text>
            <Pressable onPress={onClose} hitSlop={8}>
              <MaterialIcons name="close" size={22} color={C.textTertiary} />
            </Pressable>
          </View>

          {habit && (
            <Text style={[coopSt.habitName, { color: C.textSecondary }]} numberOfLines={1}>
              {getLocalHabitName(habit, language)}
            </Text>
          )}

          {/* Solo / Co-Op toggle */}
          <View style={[coopSt.toggle, { backgroundColor: C.background, borderColor: C.border }]}>
            <Pressable
              style={[coopSt.toggleBtn, !isCoOp && { backgroundColor: C.cardBackground }]}
              onPress={() => { setIsCoOp(false); Haptics.selectionAsync(); }}
            >
              <MaterialIcons name="person" size={16} color={!isCoOp ? C.accent : C.textTertiary} />
              <Text style={[coopSt.toggleText, { color: !isCoOp ? C.accent : C.textTertiary }]}>{t('habits.coop.solo')}</Text>
            </Pressable>
            <Pressable
              style={[coopSt.toggleBtn, isCoOp && { backgroundColor: C.cardBackground }]}
              onPress={() => { setIsCoOp(true); Haptics.selectionAsync(); }}
            >
              <Ionicons name="people" size={16} color={isCoOp ? '#9B7DD4' : C.textTertiary} />
              <Text style={[coopSt.toggleText, { color: isCoOp ? '#9B7DD4' : C.textTertiary }]}>{t('habits.coop.coOp')}</Text>
            </Pressable>
          </View>

          {/* Friend picker */}
          {isCoOp && (
            <View style={coopSt.pickerWrap}>
              <Text style={[coopSt.pickerLabel, { color: C.textTertiary }]}>{t('habits.coop.choosePartner')}</Text>
              {loadingFriends ? (
                <ActivityIndicator color={C.accent} style={{ marginVertical: 20 }} />
              ) : friends.length === 0 ? (
                <View style={coopSt.noFriends}>
                  <Ionicons name="people-outline" size={32} color={C.textTertiary} />
                  <Text style={[coopSt.noFriendsText, { color: C.textTertiary }]}>
                    {t('habits.coop.noFriends')}
                  </Text>
                </View>
              ) : (
                <FlatList
                  data={friends}
                  keyExtractor={f => f.userId}
                  style={coopSt.friendList}
                  showsVerticalScrollIndicator={false}
                  renderItem={({ item }) => {
                    const selected = selectedPartnerId === item.userId;
                    return (
                      <Pressable
                        style={[coopSt.friendRow, { borderColor: selected ? '#9B7DD4' : C.border }, selected && coopSt.friendRowSelected]}
                        onPress={() => { setSelectedPartnerId(item.userId); Haptics.selectionAsync(); }}
                      >
                        <View style={[coopSt.avatar, { backgroundColor: selected ? '#9B7DD4' : C.border }]}>
                          <Text style={coopSt.avatarText}>{(item.name[0] || 'F').toUpperCase()}</Text>
                        </View>
                        <Text style={[coopSt.friendName, { color: C.textPrimary }]} numberOfLines={1}>{item.name}</Text>
                        {selected && <MaterialIcons name="check-circle" size={20} color="#9B7DD4" />}
                      </Pressable>
                    );
                  }}
                />
              )}
            </View>
          )}

          {/* Privacy settings link — only when co-op already active */}
          {isCoOp && habit?.isCoOp && onPrivacyPress && (
            <Pressable
              style={coopSt.privacyRow}
              onPress={() => { onClose(); setTimeout(onPrivacyPress, 300); }}
            >
              <MaterialIcons name="lock-outline" size={16} color="#9B7DD4" />
              <Text style={[coopSt.privacyText, { color: '#9B7DD4' }]}>{t('habits.coop.editPrivacy')}</Text>
              <MaterialIcons name="chevron-right" size={16} color="#9B7DD4" />
            </Pressable>
          )}

          <Pressable
            style={[coopSt.saveBtn, { backgroundColor: isCoOp && !selectedPartnerId ? C.border : '#9B7DD4', opacity: saving ? 0.7 : 1 }]}
            onPress={handleSave}
            disabled={saving || (isCoOp && !selectedPartnerId)}
          >
            {saving
              ? <ActivityIndicator size="small" color="#fff" />
              : <Text style={coopSt.saveBtnText}>{isCoOp ? (habit?.isCoOp ? t('habits.coop.saveChanges') : t('habits.coop.activateCoOp')) : t('habits.coop.setToSolo')}</Text>
            }
          </Pressable>
        </Animated.View>
      </View>
    </Modal>
  );
}

// ─── Pillar Privacy Modal ─────────────────────────────────────────────────────
const PILLARS = ['Mental', 'Physical', 'Social', 'Spiritual'] as const;
type Pillar = typeof PILLARS[number];
const PILLAR_COLORS: Record<Pillar, string> = {
  Mental: '#5B8DEF', Physical: '#56C596', Social: '#F2836B', Spiritual: '#9B7DD4',
};
const PILLAR_EMOJI: Record<Pillar, string> = {
  Mental: '🧠', Physical: '💪', Social: '🤝', Spiritual: '✨',
};

function PillarPrivacyModal({
  visible, habitName, onClose, onSave,
}: {
  visible: boolean;
  habitName: string;
  onClose: () => void;
  onSave: (visibility: Record<string, boolean>) => void;
}) {
  const C = useThemeColors();
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const botInset = Platform.OS === 'web' ? 34 : insets.bottom;
  const [mounted, setMounted] = useState(false);
  const slideY = useRef(new Animated.Value(480)).current;
  const backdropAnim = useRef(new Animated.Value(0)).current;

  const [visibility, setVisibility] = useState<Record<Pillar, boolean>>({
    Mental: false, Physical: false, Social: false, Spiritual: false,
  });

  useEffect(() => {
    if (visible) {
      setVisibility({ Mental: false, Physical: false, Social: false, Spiritual: false });
      setMounted(true);
      slideY.setValue(480);
      backdropAnim.setValue(0);
      Animated.parallel([
        Animated.spring(slideY, { toValue: 0, useNativeDriver: true, damping: 22, stiffness: 160 }),
        Animated.timing(backdropAnim, { toValue: 1, duration: 220, useNativeDriver: true }),
      ]).start();
    } else {
      Animated.parallel([
        Animated.timing(slideY, { toValue: 480, duration: 240, useNativeDriver: true }),
        Animated.timing(backdropAnim, { toValue: 0, duration: 200, useNativeDriver: true }),
      ]).start(() => setMounted(false));
    }
  }, [visible]);

  if (!mounted) return null;

  const handleSave = () => {
    onSave(visibility as Record<string, boolean>);
    onClose();
  };

  return (
    <Modal transparent visible={mounted} onRequestClose={onClose} statusBarTranslucent>
      <View style={StyleSheet.absoluteFill}>
        <Animated.View style={[StyleSheet.absoluteFill, { opacity: backdropAnim }]}>
          <Pressable style={[StyleSheet.absoluteFill, { backgroundColor: 'rgba(0,0,0,0.55)' }]} onPress={handleSave} />
        </Animated.View>
        <Animated.View style={[ppSt.sheet, { backgroundColor: C.cardBackground, paddingBottom: botInset + 12, transform: [{ translateY: slideY }] }]}>
          <View style={[ppSt.handle, { backgroundColor: C.border }]} />
          <View style={ppSt.header}>
            <Text style={[ppSt.title, { color: C.textPrimary }]}>{t('habits.privacy.title')}</Text>
            <Pressable onPress={handleSave} hitSlop={8}>
              <MaterialIcons name="close" size={22} color={C.textTertiary} />
            </Pressable>
          </View>
          <Text style={[ppSt.subtitle, { color: C.textSecondary }]} numberOfLines={1}>
            {habitName}
          </Text>
          <Text style={[ppSt.desc, { color: C.textTertiary }]}>
            {t('habits.privacy.desc')}
          </Text>
          {PILLARS.map(p => {
            const isOn = visibility[p];
            const color = PILLAR_COLORS[p];
            return (
              <Pressable
                key={p}
                style={[ppSt.pillarRow, { borderBottomColor: C.border }, isOn && { backgroundColor: color + '12' }]}
                onPress={() => { Haptics.selectionAsync(); setVisibility(prev => ({ ...prev, [p]: !prev[p] })); }}
              >
                <Text style={ppSt.pillarEmoji}>{PILLAR_EMOJI[p]}</Text>
                <Text style={[ppSt.pillarName, { color: isOn ? color : C.textPrimary }]}>{p}</Text>
                <View style={[ppSt.pill, { backgroundColor: isOn ? color : C.border }]}>
                  <Text style={[ppSt.pillText, { color: isOn ? '#fff' : C.textTertiary }]}>
                    {isOn ? t('habits.privacy.visible') : t('habits.privacy.private')}
                  </Text>
                </View>
              </Pressable>
            );
          })}
          <Pressable style={[ppSt.saveBtn, { backgroundColor: '#9B7DD4' }]} onPress={handleSave}>
            <Text style={ppSt.saveBtnText}>{t('habits.privacy.saveBtn')}</Text>
          </Pressable>
        </Animated.View>
      </View>
    </Modal>
  );
}

// ─── Daily Fuel Card ──────────────────────────────────────────────────────────
const FUEL_STEPS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];

function FuelDots({ value, color, onChange }: { value: number; color: string; onChange: (v: number) => void }) {
  return (
    <View style={fs.dotsRow}>
      {FUEL_STEPS.map(s => (
        <Pressable key={s} onPress={() => { onChange(s); Haptics.selectionAsync(); }} hitSlop={4} style={fs.dotHit}>
          <View style={[fs.dot, {
            backgroundColor: s <= value ? color : '#CBD5E1',
            transform: [{ scale: s === value ? 1.5 : 1 }],
          }]} />
        </Pressable>
      ))}
    </View>
  );
}

function DailyFuelCard() {
  const C = useThemeColors();
  const { t } = useTranslation();
  const { todayFuel, saveDailyFuel } = useHabits();

  const [hydration, setHydration] = useState(todayFuel?.hydration ?? 5);
  const [sleep, setSleep] = useState(todayFuel?.sleep ?? 5);
  const [energy, setEnergy] = useState(todayFuel?.energy ?? 5);

  useEffect(() => {
    if (todayFuel) {
      setHydration(todayFuel.hydration);
      setSleep(todayFuel.sleep);
      setEnergy(todayFuel.energy);
    }
  }, [todayFuel]);

  const [syncState, setSyncState] = useState<'idle' | 'saving' | 'saved'>('idle');
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const scheduleSave = useCallback((h: number, s: number, e: number) => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    setSyncState('saving');
    debounceRef.current = setTimeout(async () => {
      try {
        await saveDailyFuel({ hydration: h, sleep: s, energy: e });
        setSyncState('saved');
        setTimeout(() => setSyncState('idle'), 2000);
      } catch {
        setSyncState('idle');
      }
    }, 600);
  }, [saveDailyFuel]);

  const onChangeHydration = (v: number) => {
    setHydration(v);
    scheduleSave(v, sleep, energy);
  };
  const onChangeSleep = (v: number) => {
    setSleep(v);
    scheduleSave(hydration, v, energy);
  };
  const onChangeEnergy = (v: number) => {
    setEnergy(v);
    scheduleSave(hydration, sleep, v);
  };

  return (
    <View style={[fuelSt.card, { backgroundColor: C.cardBackground, borderColor: C.border }]}>
      <View style={fuelSt.cardHeader}>
        <View>
          <Text style={[fuelSt.title, { color: C.textPrimary }]}>{t('habits.fuel.title')}</Text>
          <Text style={[fuelSt.sub, { color: C.textSecondary }]}>{t('habits.fuel.subtitle')}</Text>
        </View>
        {syncState !== 'idle' && (
          <View style={fuelSt.syncBadge}>
            {syncState === 'saving' ? (
              <ActivityIndicator size="small" color={C.accent} />
            ) : (
              <>
                <MaterialIcons name="check-circle" size={14} color="#22C55E" />
                <Text style={fuelSt.syncText}>{t('habits.fuel.saved')}</Text>
              </>
            )}
          </View>
        )}
      </View>

      <View style={fuelSt.row}>
        <MaterialIcons name="water-drop" size={16} color="#3B82F6" />
        <Text style={[fuelSt.label, { color: C.textSecondary }]}>{t('habits.fuel.hydration')}</Text>
        <FuelDots value={hydration} color="#3B82F6" onChange={onChangeHydration} />
        <Text style={[fuelSt.val, { color: '#3B82F6' }]}>{hydration}</Text>
      </View>
      <View style={fuelSt.row}>
        <MaterialIcons name="bedtime" size={16} color="#6366F1" />
        <Text style={[fuelSt.label, { color: C.textSecondary }]}>{t('habits.fuel.sleep')}</Text>
        <FuelDots value={sleep} color="#6366F1" onChange={onChangeSleep} />
        <Text style={[fuelSt.val, { color: '#6366F1' }]}>{sleep}</Text>
      </View>
      <View style={fuelSt.row}>
        <MaterialIcons name="bolt" size={16} color="#F59E0B" />
        <Text style={[fuelSt.label, { color: C.textSecondary }]}>{t('habits.fuel.energy')}</Text>
        <FuelDots value={energy} color="#F59E0B" onChange={onChangeEnergy} />
        <Text style={[fuelSt.val, { color: '#F59E0B' }]}>{energy}</Text>
      </View>
    </View>
  );
}

// ─── Habit row inside an expanded quadrant ────────────────────────────────────
interface PartnerStatus {
  partnerCompleted: boolean;
  partnerName: string | null;
}

function HabitRow({
  habit, blockColor, partnerStatus, onCoOpPress, onDualComplete, onConfigurePress, onMastered,
  isExpanded, onToggleExpand,
}: {
  habit: UserHabit;
  blockColor: string;
  partnerStatus?: PartnerStatus;
  onCoOpPress: () => void;
  onDualComplete: (partnerName: string) => void;
  onConfigurePress: () => void;
  onMastered: (habitName: string) => void;
  isExpanded: boolean;
  onToggleExpand: () => void;
}) {
  const C = useThemeColors();
  const { toggleHabit, completeHabit, uncompleteHabit, nudgePartner } = useHabits();
  const { language } = useLanguage();
  const scale = useRef(new Animated.Value(1)).current;
  const [nudgeSent, setNudgeSent] = useState(false);
  const [nudgeRateLimited, setNudgeRateLimited] = useState(false);

  const tapComplete = async () => {
    if (!habit.isEnabled) return;
    Animated.sequence([
      Animated.timing(scale, { toValue: 0.88, duration: 70, useNativeDriver: true }),
      Animated.timing(scale, { toValue: 1,    duration: 110, useNativeDriver: true }),
    ]).start();
    Haptics.selectionAsync();
    if (habit.completedToday) {
      await uncompleteHabit(habit.habitId);
    } else {
      const result = await completeHabit(habit.habitId);
      if (result.habitMastered) {
        onMastered(getLocalHabitName(habit, language));
      } else if (result.dualComplete && result.partnerName) {
        onDualComplete(result.partnerName);
      }
    }
  };

  const partnerInitial = (habit.partnerName?.[0] || 'P').toUpperCase();
  const partnerDone = partnerStatus?.partnerCompleted ?? false;
  const isMaintained = habit.habitStatus === 'maintained';

  return (
    <Animated.View style={[hrow.wrap, { borderTopColor: C.border, transform: [{ scale }] }]}>
      <Switch
        value={habit.isEnabled}
        onValueChange={() => { Haptics.selectionAsync(); toggleHabit(habit.habitId); }}
        trackColor={{ false: C.border, true: blockColor + '99' }}
        thumbColor={habit.isEnabled ? blockColor : C.textTertiary}
        style={hrow.switch}
      />
      {/* Tap name to complete — original interaction preserved */}
      <Pressable style={hrow.nameWrap} onPress={tapComplete} disabled={!habit.isEnabled}>
        <View style={hrow.nameRow}>
          <View style={{ flex: 1 }}>
            <Text
              style={[
                hrow.name,
                { color: habit.isEnabled ? C.textPrimary : C.textTertiary },
                habit.isEnabled && habit.completedToday && hrow.struck,
              ]}
              numberOfLines={2}
            >
              {getLocalHabitName(habit, language)}
            </Text>
            {isMaintained && (
              <Text style={[hrow.masteredTag, { color: blockColor }]}>🏆 Mastered</Text>
            )}
            {!isMaintained && habit.journeyTargetDays && habit.isEnabled && (
              <Text style={[hrow.journeyTag, { color: C.textTertiary }]}>
                {habit.journeyTargetDays}d journey
              </Text>
            )}
          </View>
          {/* Co-Op partner avatar + status dot */}
          {habit.isEnabled && habit.isCoOp && habit.partnerId && (
            <View style={hrow.partnerWrap}>
              <View style={[hrow.partnerAvatar, { backgroundColor: blockColor }]}>
                <Text style={hrow.partnerInitial}>{partnerInitial}</Text>
              </View>
              <View style={[hrow.statusDot, { backgroundColor: partnerDone ? '#22C55E' : '#CBD5E1' }]} />
            </View>
          )}
        </View>
      </Pressable>

      {/* Dedicated expand/collapse toggle — separate affordance from completion */}
      <Pressable onPress={onToggleExpand} hitSlop={8} style={hrow.coopBtn}>
        <MaterialIcons
          name={isExpanded ? 'expand-less' : 'expand-more'}
          size={15}
          color={isExpanded ? blockColor : C.textTertiary}
        />
      </Pressable>


      {/* Nudge button — shown when user done, partner not yet */}
      {habit.isEnabled && habit.isCoOp && habit.completedToday && !partnerDone && (
        <Pressable
          hitSlop={8}
          style={[hrow.nudgeBtn, nudgeSent && { opacity: 0.55 }]}
          onPress={async () => {
            if (nudgeSent || nudgeRateLimited) return;
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
            const result = await nudgePartner(habit.habitId);
            if (result.rateLimited) {
              setNudgeRateLimited(true);
              setTimeout(() => setNudgeRateLimited(false), 4000);
            } else if (result.success) {
              setNudgeSent(true);
              setTimeout(() => setNudgeSent(false), 5000);
            }
          }}
        >
          {nudgeRateLimited
            ? <MaterialIcons name="schedule" size={13} color="#F59E0B" />
            : nudgeSent
              ? <MaterialIcons name="check" size={13} color="#22C55E" />
              : <Text style={hrow.nudgeBtnText}>👋</Text>
          }
        </Pressable>
      )}

    </Animated.View>
  );
}


// ─── Habit expanded panel (shown below a time-block card when selected) ───────
// Description + "Configure Habit" CTA rendered inline below an expanded row
function HabitDescriptionExpansion({ habit, blockColor, onConfigurePress }: {
  habit: UserHabit;
  blockColor: string;
  onConfigurePress: () => void;
}) {
  const C = useThemeColors();
  const { t } = useTranslation();
  const { language } = useLanguage();
  return (
    <View style={[cloverSt.descExpansion, { backgroundColor: blockColor + '0C', borderTopColor: C.border }]}>
      <Text style={[cloverSt.descText, { color: C.textSecondary }]}>
        {language === 'hi' ? (HABIT_DESCRIPTIONS_HI[habit.habitId] ?? habit.description) : habit.description}
      </Text>
      <Pressable
        style={[cloverSt.configureBtn, { borderColor: blockColor, backgroundColor: blockColor + '14' }]}
        onPress={() => { Haptics.selectionAsync(); onConfigurePress(); }}
      >
        <MaterialIcons name="flag" size={13} color={blockColor} />
        <Text style={[cloverSt.configureBtnText, { color: blockColor }]}>{t('habits.configureBtnLabel')}</Text>
      </Pressable>
    </View>
  );
}

function HabitExpandedPanel({ block, partnerStatuses, onCoOpPress, onDualComplete, onConfigurePress, onMastered }: {
  block: TimeBlock;
  partnerStatuses: Record<string, PartnerStatus>;
  onCoOpPress: (habit: UserHabit) => void;
  onDualComplete: (partnerName: string) => void;
  onConfigurePress: (habit: UserHabit) => void;
  onMastered: (habitName: string) => void;
}) {
  const C = useThemeColors();
  const { t } = useTranslation();
  const isDark = C.background === '#000000' || C.background === '#121218';
  const { allHabitsState } = useHabits();
  const allInBlock = allHabitsState.filter(h => h.timeBlock === block);
  const cfg = BLOCK_CFG[block];
  const bgLight = isDark ? cfg.darkLight : cfg.light;
  const doneCnt = allInBlock.filter(h => h.isEnabled && h.completedToday).length;
  const enaCnt  = allInBlock.filter(h => h.isEnabled).length;

  const [expandedId, setExpandedId] = useState<string | null>(null);

  // Separate maintained from active
  const activeHabits     = allInBlock.filter(h => h.habitStatus !== 'maintained');
  const maintainedHabits = allInBlock.filter(h => h.habitStatus === 'maintained');

  const renderHabitRow = (h: UserHabit) => (
    <View key={h.habitId}>
      <HabitRow
        habit={h}
        blockColor={cfg.main}
        partnerStatus={partnerStatuses[h.habitId]}
        onCoOpPress={() => onCoOpPress(h)}
        onDualComplete={onDualComplete}
        onConfigurePress={() => onConfigurePress(h)}
        onMastered={onMastered}
        isExpanded={expandedId === h.habitId}
        onToggleExpand={() => {
          Haptics.selectionAsync();
          setExpandedId(prev => prev === h.habitId ? null : h.habitId);
        }}
      />
      {expandedId === h.habitId && (
        <HabitDescriptionExpansion
          habit={h}
          blockColor={cfg.main}
          onConfigurePress={() => onConfigurePress(h)}
        />
      )}
    </View>
  );

  return (
    <View style={[cloverSt.expandedCard, { backgroundColor: C.cardBackground, borderColor: C.border }]}>
      <View style={[cloverSt.expandedHeader, { backgroundColor: bgLight }]}>
        <Text style={cloverSt.expandedEmoji}>{cfg.emoji}</Text>
        <Text style={[cloverSt.expandedLabel, { color: cfg.main }]}>{t(`habits.timeBlocks.${block.toLowerCase()}`)}</Text>
        <Text style={[cloverSt.expandedSub, { color: cfg.main }]}>
          {enaCnt > 0 ? t('habits.doneOf', { done: doneCnt, total: enaCnt }) : t('habits.noneEnabled')}
        </Text>
      </View>

      {activeHabits.length === 0 && maintainedHabits.length === 0 ? (
        <View style={cloverSt.expandedEmpty}>
          <Text style={[cloverSt.expandedEmptyText, { color: C.textTertiary }]}>
            {t('habits.noHabitsInBlock')}
          </Text>
        </View>
      ) : (
        <>
          {activeHabits.map(renderHabitRow)}

          {maintainedHabits.length > 0 && (
            <>
              <View style={[cloverSt.maintainedDivider, { borderTopColor: C.border }]}>
                <Text style={[cloverSt.maintainedLabel, { color: C.textTertiary }]}>
                  {t('habits.maintained')}
                </Text>
              </View>
              {maintainedHabits.map(renderHabitRow)}
            </>
          )}
        </>
      )}
    </View>
  );
}

// ─── Search Bar ───────────────────────────────────────────────────────────────
const PILLAR_COLORS_SEARCH: Record<string, string> = {
  Mental: '#5B8DEF', Physical: '#56C596', Social: '#F2836B', Spiritual: '#9B7DD4',
};

function HabitSearchBar({ habits, onSelect }: {
  habits: UserHabit[];
  onSelect: (habitId: string) => void;
}) {
  const C = useThemeColors();
  const { t } = useTranslation();
  const { language } = useLanguage();
  const [query, setQuery] = useState('');
  const [focused, setFocused] = useState(false);
  const fadeAnim = useRef(new Animated.Value(0)).current;

  const results = query.length > 0
    ? habits.filter(h =>
        h.habitName.toLowerCase().includes(query.toLowerCase()) ||
        h.description.toLowerCase().includes(query.toLowerCase()) ||
        h.pillar.toLowerCase().includes(query.toLowerCase()) ||
        h.timeBlock.toLowerCase().includes(query.toLowerCase())
      ).slice(0, 8)
    : [];

  const showDropdown = focused && results.length > 0;

  useEffect(() => {
    Animated.timing(fadeAnim, {
      toValue: showDropdown ? 1 : 0,
      duration: 150,
      useNativeDriver: true,
    }).start();
  }, [showDropdown]);

  return (
    <View style={searchSt.wrap}>
      <View style={[searchSt.bar, { backgroundColor: C.cardBackground, borderColor: focused ? C.accent : C.border }]}>
        <MaterialIcons name="search" size={18} color={C.textTertiary} />
        <TextInput
          style={[searchSt.input, { color: C.textPrimary }]}
          placeholder={t('habits.searchPlaceholder')}
          placeholderTextColor={C.textTertiary}
          value={query}
          onChangeText={setQuery}
          onFocus={() => setFocused(true)}
          onBlur={() => setTimeout(() => setFocused(false), 150)}
          returnKeyType="search"
        />
        {query.length > 0 && (
          <Pressable onPress={() => setQuery('')} hitSlop={8}>
            <MaterialIcons name="close" size={16} color={C.textTertiary} />
          </Pressable>
        )}
      </View>

      {showDropdown && (
        <Animated.View style={[searchSt.dropdown, { backgroundColor: C.cardBackground, borderColor: C.border, opacity: fadeAnim }]}>
          {results.map((h, i) => {
            const pillarColor = PILLAR_COLORS_SEARCH[h.pillar] ?? '#9B7DD4';
            const blockColor = BLOCK_CFG[h.timeBlock as TimeBlock]?.main ?? '#888';
            return (
              <Pressable
                key={h.habitId}
                style={[searchSt.resultRow, i < results.length - 1 && { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: C.border }]}
                onPress={() => {
                  Haptics.selectionAsync();
                  if (h.isEnabled) {
                    Alert.alert(
                      t('habits.alreadyInRoutineTitle'),
                      t('habits.alreadyInRoutineMsg', { name: getLocalHabitName(h, language), block: h.timeBlock }),
                      [{ text: 'OK' }]
                    );
                    setQuery('');
                    setFocused(false);
                    return;
                  }
                  setQuery('');
                  setFocused(false);
                  onSelect(h.habitId);
                }}
              >
                <View style={searchSt.resultLeft}>
                  <Text style={[searchSt.resultName, { color: C.textPrimary }]} numberOfLines={1}>{getLocalHabitName(h, language)}</Text>
                  <View style={searchSt.resultTags}>
                    <View style={[searchSt.tag, { backgroundColor: blockColor + '22', borderColor: blockColor + '44' }]}>
                      <Text style={[searchSt.tagText, { color: blockColor }]}>{h.timeBlock}</Text>
                    </View>
                    <View style={[searchSt.tag, { backgroundColor: pillarColor + '22', borderColor: pillarColor + '44' }]}>
                      <Text style={[searchSt.tagText, { color: pillarColor }]}>{h.pillar}</Text>
                    </View>
                  </View>
                </View>
                <MaterialIcons name="chevron-right" size={16} color={C.textTertiary} />
              </Pressable>
            );
          })}
        </Animated.View>
      )}
    </View>
  );
}

// ─── Habit Mastered Overlay ───────────────────────────────────────────────────
function HabitMasteredOverlay({ habitName, onDismiss }: { habitName: string; onDismiss: () => void }) {
  const C = useThemeColors();
  const { t } = useTranslation();
  const scaleAnim = useRef(new Animated.Value(0.5)).current;
  const opacityAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    Animated.parallel([
      Animated.spring(scaleAnim, { toValue: 1, useNativeDriver: true, damping: 16, stiffness: 200 }),
      Animated.timing(opacityAnim, { toValue: 1, duration: 250, useNativeDriver: true }),
    ]).start();
  }, []);

  return (
    <Modal transparent visible statusBarTranslucent onRequestClose={onDismiss}>
      <Pressable style={[StyleSheet.absoluteFill, masteredSt.backdrop]} onPress={onDismiss}>
        <Animated.View style={[masteredSt.card, { backgroundColor: C.cardBackground, opacity: opacityAnim, transform: [{ scale: scaleAnim }] }]}>
          <Text style={masteredSt.trophy}>🏆</Text>
          <Text style={[masteredSt.title, { color: C.textPrimary }]}>{t('habits.masteredTitle')}</Text>
          <Text style={[masteredSt.subtitle, { color: C.textSecondary }]} numberOfLines={2}>{habitName}</Text>
          <Text style={[masteredSt.body, { color: C.textTertiary }]}>
            {t('habits.masteredBody')}
          </Text>
          <Pressable style={[masteredSt.btn, { backgroundColor: '#9B7DD4' }]} onPress={onDismiss}>
            <Text style={masteredSt.btnText}>{t('habits.masteredBtn')}</Text>
          </Pressable>
        </Animated.View>
      </Pressable>
    </Modal>
  );
}

// ─── Time-block cards with tap-to-expand panel ─────────────
const BLOCK_ORDER: TimeBlock[] = ['Morning', 'Workday', 'Evening', 'Lifestyle'];

/** Compute journey progress (0–1) for a set of habits in a block */
function blockJourneyProgress(habits: UserHabit[]): { pct: number; hasJourney: boolean; allMastered: boolean } {
  const journeyHabits = habits.filter(h => h.isEnabled && h.journeyTargetDays != null && h.journeyTargetDays > 0);
  if (journeyHabits.length === 0) return { pct: 0, hasJourney: false, allMastered: false };
  let total = 0;
  for (const h of journeyHabits) {
    if (h.habitStatus === 'maintained') {
      total += 1;
    } else {
      const count = h.journeyCompletionCount ?? 0;
      total += Math.min(1, count / h.journeyTargetDays!);
    }
  }
  const allMastered = journeyHabits.every(h => h.habitStatus === 'maintained');
  return { pct: total / journeyHabits.length, hasJourney: true, allMastered };
}

function TimeBlockGrid({ partnerStatuses, onCoOpPress, onDualComplete, onConfigurePress, onMastered }: {
  partnerStatuses: Record<string, PartnerStatus>;
  onCoOpPress: (habit: UserHabit) => void;
  onDualComplete: (partnerName: string) => void;
  onConfigurePress: (habit: UserHabit) => void;
  onMastered: (habitName: string) => void;
}) {
  const C = useThemeColors();
  const { t } = useTranslation();
  const { allHabitsState } = useHabits();
  const [selectedBlock, setSelectedBlock] = useState<TimeBlock | null>(null);

  return (
    <View style={{ paddingHorizontal: 16, gap: 10 }}>
      {BLOCK_ORDER.map(block => {
        const cfg = BLOCK_CFG[block];
        const habits = allHabitsState.filter(h => h.timeBlock === block);
        const done = habits.filter(h => h.isEnabled && h.completedToday).length;
        const enabled = habits.filter(h => h.isEnabled).length;
        const { pct, hasJourney, allMastered } = blockJourneyProgress(habits);
        const isSelected = selectedBlock === block;

        return (
          <View key={block}>
            <Pressable
              onPress={() => {
                Haptics.selectionAsync();
                setSelectedBlock(prev => (prev === block ? null : block));
              }}
              style={({ pressed }) => [
                blockSt.card,
                {
                  backgroundColor: isSelected ? cfg.main + '15' : C.cardBackground,
                  borderColor: isSelected ? cfg.main : C.border,
                  opacity: pressed ? 0.85 : 1,
                },
              ]}
            >
              <View style={[blockSt.leftStripe, { backgroundColor: cfg.main }]} />
              <Text style={{ fontSize: 22 }}>{cfg.emoji}</Text>
              <View style={{ flex: 1 }}>
                <Text style={[blockSt.title, { color: C.textPrimary }]}>{t(`habits.timeBlocks.${block.toLowerCase()}`)}</Text>
                <Text style={[blockSt.subtitle, { color: C.textTertiary }]}>
                  {enabled > 0 ? t('habits.doneOf', { done, total: enabled }) : t('habits.noneEnabled')}
                </Text>
              </View>
              {hasJourney && (
                <View style={blockSt.progressWrap}>
                  <View style={[blockSt.progressTrack, { backgroundColor: C.border }]}>
                    <View style={[blockSt.progressFill, {
                      backgroundColor: allMastered ? '#F59E0B' : cfg.main,
                      width: `${Math.round(pct * 100)}%` as any,
                    }]} />
                  </View>
                  <Text style={[blockSt.progressText, { color: allMastered ? '#F59E0B' : cfg.main }]}>
                    {allMastered ? t('habits.mastered') : `${Math.round(pct * 100)}%`}
                  </Text>
                </View>
              )}
              <MaterialIcons
                name={isSelected ? 'expand-less' : 'expand-more'}
                size={20}
                color={C.textTertiary}
              />
            </Pressable>

            {isSelected && (
              <HabitExpandedPanel
                block={block}
                partnerStatuses={partnerStatuses}
                onCoOpPress={onCoOpPress}
                onDualComplete={onDualComplete}
                onConfigurePress={onConfigurePress}
                onMastered={onMastered}
              />
            )}
          </View>
        );
      })}
    </View>
  );
}

// ─── Social Hub Modal ─────────────────────────────────────────────────────────
type SearchResult = { id: string; username: string; uniqueTag: string; profilePhoto?: string; relationship?: 'none' | 'pending' | 'accepted' };
type SendStatus = 'idle' | 'loading' | 'sent' | 'already_friends' | 'already_requested' | 'error';
type DiscoverUser = { id: string; username: string; uniqueTag: string; profilePhoto?: string };
type DiscoverSendStatus = 'idle' | 'loading' | 'sent' | 'already_friends' | 'already_requested' | 'error';

export function SocialHubModal({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const C = useThemeColors();
  const { t } = useTranslation();
  const { user } = useAuth();
  const insets = useSafeAreaInsets();
  const botInset = Platform.OS === 'web' ? 34 : insets.bottom;

  const [mounted, setMounted] = useState(false);
  const slideY = useRef(new Animated.Value(SHEET_HEIGHT)).current;
  const backdropAnim = useRef(new Animated.Value(0)).current;

  const [friends, setFriends] = useState<FriendsData | null>(null);
  const [loading, setLoading] = useState(false);
  const [inviting, setInviting] = useState(false);

  const [searchQuery, setSearchQuery] = useState('');
  const [searchResult, setSearchResult] = useState<SearchResult | null>(null);
  const [searchLoading, setSearchLoading] = useState(false);
  const [searchError, setSearchError] = useState('');
  const [sendStatus, setSendStatus] = useState<SendStatus>('idle');

  const [discoverUsers, setDiscoverUsers] = useState<DiscoverUser[]>([]);
  const [discoverLoading, setDiscoverLoading] = useState(false);
  const [discoverStatus, setDiscoverStatus] = useState<Record<string, DiscoverSendStatus>>({});

  const fetchFriends = async () => {
    setLoading(true);
    try {
      const res = await apiRequest('GET', '/api/friends');
      const data: FriendsData = await res.json();
      setFriends(data);
    } catch { /* silent */ } finally {
      setLoading(false);
    }
  };

  const fetchDiscover = async () => {
    setDiscoverLoading(true);
    try {
      const res = await apiRequest('GET', '/api/friends/discover');
      const data = await res.json();
      setDiscoverUsers(data.users ?? []);
    } catch { /* silent */ } finally {
      setDiscoverLoading(false);
    }
  };

  const isEmailQuery = (q: string) => q.includes('@');

  const handleSearch = async () => {
    const q = searchQuery.trim();
    if (!q) return;

    if (isEmailQuery(q)) {
      const emailValid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(q);
      if (!emailValid) {
        setSearchError('Enter a valid email address');
        setSearchResult(null);
        return;
      }
      setSearchLoading(true);
      setSearchError('');
      setSearchResult(null);
      setSendStatus('idle');
      try {
        const res = await apiRequest('GET', `/api/friends/search-email?email=${encodeURIComponent(q)}`);
        if (!res.ok) {
          const body = await res.json().catch(() => ({}));
          setSearchError(body.error || 'User not found');
        } else {
          const data: SearchResult = await res.json();
          setSearchResult(data);
          if (data.relationship === 'accepted') setSendStatus('already_friends');
          else if (data.relationship === 'pending') setSendStatus('already_requested');
          else setSendStatus('idle');
        }
      } catch {
        setSearchError('Search failed. Please try again.');
      } finally {
        setSearchLoading(false);
      }
      return;
    }

    if (!q.includes('#')) {
      setSearchError('Search by email, or Username#Code (e.g. Ojas#A7X2)');
      setSearchResult(null);
      return;
    }
    const hashIdx = q.lastIndexOf('#');
    const username = q.slice(0, hashIdx).trim();
    const tag = q.slice(hashIdx + 1).trim().toUpperCase();
    if (!username || tag.length !== 4) {
      setSearchError('Search by email, or Username#Code (e.g. Ojas#A7X2)');
      setSearchResult(null);
      return;
    }
    setSearchLoading(true);
    setSearchError('');
    setSearchResult(null);
    setSendStatus('idle');
    try {
      const res = await apiRequest('GET', `/api/friends/search?username=${encodeURIComponent(username)}&tag=${encodeURIComponent(tag)}`);
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        setSearchError(body.error || 'User not found');
      } else {
        const data: SearchResult = await res.json();
        setSearchResult(data);
      }
    } catch {
      setSearchError('Search failed. Please try again.');
    } finally {
      setSearchLoading(false);
    }
  };

  const handleSendDiscoverRequest = async (toUserId: string) => {
    setDiscoverStatus(prev => ({ ...prev, [toUserId]: 'loading' }));
    Haptics.selectionAsync();
    try {
      const res = await apiRequest('POST', '/api/friends/pending-request', { toUserId });
      if (!res.ok) {
        setDiscoverStatus(prev => ({ ...prev, [toUserId]: 'error' }));
        return;
      }
      const data = await res.json().catch(() => ({}));
      if (data.alreadyFriends) setDiscoverStatus(prev => ({ ...prev, [toUserId]: 'already_friends' }));
      else if (data.alreadyRequested) setDiscoverStatus(prev => ({ ...prev, [toUserId]: 'already_requested' }));
      else setDiscoverStatus(prev => ({ ...prev, [toUserId]: 'sent' }));
      fetchFriends();
    } catch {
      setDiscoverStatus(prev => ({ ...prev, [toUserId]: 'error' }));
    }
  };

  const handleSendRequest = async () => {
    if (!searchResult) return;
    setSendStatus('loading');
    try {
      const res = await apiRequest('POST', '/api/friends/pending-request', { toUserId: searchResult.id });
      if (!res.ok) {
        setSendStatus('error');
        return;
      }
      const data = await res.json();
      if (data.alreadyFriends) setSendStatus('already_friends');
      else if (data.alreadyRequested) setSendStatus('already_requested');
      else { setSendStatus('sent'); fetchFriends(); }
    } catch {
      setSendStatus('error');
    }
  };

  useEffect(() => {
    if (visible) {
      setMounted(true);
      fetchFriends();
      fetchDiscover();
      setSearchQuery('');
      setSearchResult(null);
      setSearchError('');
      setSendStatus('idle');
      setDiscoverStatus({});
      slideY.setValue(SHEET_HEIGHT);
      backdropAnim.setValue(0);
      Animated.parallel([
        Animated.spring(slideY, { toValue: 0, useNativeDriver: true, damping: 22, stiffness: 160 }),
        Animated.timing(backdropAnim, { toValue: 1, duration: 220, useNativeDriver: true }),
      ]).start();
    } else {
      Animated.parallel([
        Animated.timing(slideY, { toValue: SHEET_HEIGHT, duration: 240, useNativeDriver: true }),
        Animated.timing(backdropAnim, { toValue: 0, duration: 200, useNativeDriver: true }),
      ]).start(() => setMounted(false));
    }
  }, [visible]);

  const handleRespond = async (friendshipId: string, action: 'accept' | 'decline') => {
    Haptics.selectionAsync();
    try {
      await apiRequest('PUT', `/api/friends/${friendshipId}/respond`, { action });
      fetchFriends();
    } catch { /* silent */ }
  };

  const handleRemove = async (friendshipId: string) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    try {
      await apiRequest('DELETE', `/api/friends/${friendshipId}`);
      fetchFriends();
    } catch { /* silent */ }
  };

  const handleInvite = async () => {
    if (!user) return;
    setInviting(true);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    try {
      const shortUrl = 'https://bit.ly/4fBlnVh';
      const message = t('habits.network.inviteMessage', { link: shortUrl });
      const waUrl = `https://wa.me/?text=${encodeURIComponent(message)}`;
      const canOpen = await Linking.canOpenURL(waUrl);
      if (canOpen) {
        await Linking.openURL(waUrl);
      } else {
        await Share.share({ message });
      }
    } catch {
      Alert.alert('Error', 'Could not open WhatsApp.');
    } finally {
      setInviting(false);
    }
  };

  if (!mounted) return null;

  const hasPending = (friends?.pending?.length ?? 0) > 0;
  const hasAccepted = (friends?.accepted?.length ?? 0) > 0;
  const isEmpty = !loading && !hasPending && !hasAccepted;

  return (
    <Modal transparent visible={mounted} onRequestClose={onClose} statusBarTranslucent>
      <View style={StyleSheet.absoluteFill}>
        <Animated.View style={[StyleSheet.absoluteFill, { opacity: backdropAnim }]}>
          <Pressable style={[StyleSheet.absoluteFill, socialSt.backdrop]} onPress={onClose} />
        </Animated.View>
        <Animated.View style={[socialSt.sheet, {
          backgroundColor: C.cardBackground,
          paddingBottom: botInset + 8,
          transform: [{ translateY: slideY }],
        }]}>
          <View style={[socialSt.handle, { backgroundColor: C.border }]} />

          {/* ── Sheet header ── */}
          <View style={socialSt.sheetHeader}>
            <Text style={[socialSt.sheetTitle, { color: C.textPrimary, flex: 1 }]}>
              {t('habits.network.title')}
            </Text>
            <Pressable onPress={onClose} hitSlop={8}>
              <MaterialIcons name="close" size={22} color={C.textTertiary} />
            </Pressable>
          </View>

          {/* ══ NETWORK TAB ══════════════════════════════════════════════════ */}
            <>
              <View style={[socialSt.searchRow, { borderColor: C.border, backgroundColor: C.background }]}>
                <MaterialIcons name="search" size={18} color={C.textTertiary} style={{ marginLeft: 10 }} />
                <TextInput
                  style={[socialSt.searchInput, { color: C.textPrimary }]}
                  placeholder={t('habits.network.searchPlaceholder')}
                  placeholderTextColor={C.textTertiary}
                  value={searchQuery}
                  onChangeText={val => { setSearchQuery(val); setSearchError(''); setSearchResult(null); setSendStatus('idle'); }}
                  autoCapitalize="none"
                  autoCorrect={false}
                  returnKeyType="search"
                  onSubmitEditing={handleSearch}
                />
                <Pressable
                  style={[socialSt.searchBtn, { backgroundColor: C.accent, opacity: searchLoading ? 0.6 : 1 }]}
                  onPress={handleSearch}
                  disabled={searchLoading}
                >
                  {searchLoading
                    ? <ActivityIndicator size="small" color="#fff" />
                    : <Text style={socialSt.searchBtnText}>{t('habits.network.findBtn')}</Text>
                  }
                </Pressable>
              </View>

              {!!searchError && (
                <Text style={[socialSt.searchError, { color: C.error ?? '#F87171' }]}>{searchError}</Text>
              )}

              {searchResult && (
                <View style={[socialSt.searchResultCard, { backgroundColor: C.background, borderColor: C.border }]}>
                  <View style={[socialSt.avatar, { backgroundColor: '#5B8DEF' }]}>
                    <Text style={socialSt.avatarText}>{(searchResult.username[0] || 'U').toUpperCase()}</Text>
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={[socialSt.friendName, { color: C.textPrimary }]} numberOfLines={1}>
                      {searchResult.username}
                      <Text style={{ color: C.accent }}> #{searchResult.uniqueTag}</Text>
                    </Text>
                  </View>
                  {sendStatus === 'sent' ? (
                    <View style={[socialSt.sentBadge, { backgroundColor: '#22C55E20', borderColor: '#22C55E40' }]}>
                      <MaterialIcons name="check" size={14} color="#22C55E" />
                      <Text style={[socialSt.sentText, { color: '#22C55E' }]}>{t('habits.network.sent')}</Text>
                    </View>
                  ) : sendStatus === 'already_friends' ? (
                    <Text style={[socialSt.sentText, { color: C.textTertiary }]}>{t('habits.network.alreadyFriends')}</Text>
                  ) : sendStatus === 'already_requested' ? (
                    <Text style={[socialSt.sentText, { color: C.textTertiary }]}>{t('habits.network.requested')}</Text>
                  ) : (
                    <Pressable
                      style={[socialSt.sendReqBtn, { backgroundColor: C.accent, opacity: sendStatus === 'loading' ? 0.6 : 1 }]}
                      onPress={handleSendRequest}
                      disabled={sendStatus === 'loading'}
                    >
                      {sendStatus === 'loading'
                        ? <ActivityIndicator size="small" color="#fff" />
                        : <><Text style={socialSt.sendReqText}>{t('habits.network.addBtn')}</Text><MaterialIcons name="person-add" size={14} color="#fff" /></>
                      }
                    </Pressable>
                  )}
                </View>
              )}

              <ScrollView style={socialSt.listScroll} contentContainerStyle={socialSt.listContent} showsVerticalScrollIndicator={false}>
                {loading && <ActivityIndicator style={{ marginVertical: 32 }} color={C.accent} />}

                {!loading && hasPending && (
                  <>
                    <Text style={[socialSt.sectionLabel, { color: C.textTertiary }]}>{t('habits.network.sectionRequests')}</Text>
                    {friends!.pending.map(f => (
                      <View key={f.friendshipId} style={[socialSt.friendRow, { borderBottomColor: C.border }]}>
                        <View style={[socialSt.avatar, { backgroundColor: '#F2836B' }]}>
                          <Text style={socialSt.avatarText}>{(f.name[0] || 'F').toUpperCase()}</Text>
                        </View>
                        <Text style={[socialSt.friendName, { color: C.textPrimary }]} numberOfLines={1}>{f.name}</Text>
                        <Pressable style={[socialSt.respondBtn, { backgroundColor: '#9B7DD4' }]} onPress={() => handleRespond(f.friendshipId, 'accept')}>
                          <Text style={socialSt.respondBtnText}>{t('habits.network.acceptBtn')}</Text>
                        </Pressable>
                        <Pressable style={[socialSt.respondBtn, { backgroundColor: C.border }]} onPress={() => handleRespond(f.friendshipId, 'decline')}>
                          <Text style={[socialSt.respondBtnText, { color: C.textSecondary }]}>{t('habits.network.declineBtn')}</Text>
                        </Pressable>
                      </View>
                    ))}
                  </>
                )}

                {!loading && hasAccepted && (
                  <>
                    <Text style={[socialSt.sectionLabel, { color: C.textTertiary, marginTop: hasPending ? 12 : 0 }]}>{t('habits.network.sectionFriends')}</Text>
                    {friends!.accepted.map(f => (
                      <View key={f.friendshipId} style={[socialSt.friendRow, { borderBottomColor: C.border }]}>
                        <View style={[socialSt.avatar, { backgroundColor: '#56C596' }]}>
                          <Text style={socialSt.avatarText}>{(f.name[0] || 'F').toUpperCase()}</Text>
                        </View>
                        <Text style={[socialSt.friendName, { color: C.textPrimary }]} numberOfLines={1}>{f.name}</Text>
                        <Pressable onPress={() => handleRemove(f.friendshipId)} hitSlop={10} style={socialSt.removeBtn}>
                          <MaterialIcons name="person-remove" size={18} color={C.textTertiary} />
                        </Pressable>
                      </View>
                    ))}
                  </>
                )}

                {isEmpty && !discoverLoading && discoverUsers.length === 0 && (
                  <View style={socialSt.empty}>
                    <Ionicons name="people-outline" size={40} color={C.textTertiary} />
                    <Text style={[socialSt.emptyTitle, { color: C.textPrimary }]}>{t('habits.network.emptyTitle')}</Text>
                    <Text style={[socialSt.emptyDesc, { color: C.textTertiary }]}>
                      {t('habits.network.emptyDesc')}
                    </Text>
                  </View>
                )}

                {discoverLoading && (
                  <ActivityIndicator style={{ marginVertical: 16 }} color={C.accent} />
                )}

                {!discoverLoading && discoverUsers.length > 0 && (
                  <>
                    <Text style={[socialSt.sectionLabel, { color: C.textTertiary, marginTop: (hasPending || hasAccepted) ? 16 : 0 }]}>
                      {t('habits.network.sectionDiscover')}
                    </Text>
                    {discoverUsers.map(u => {
                      const status = discoverStatus[u.id] ?? 'idle';
                      return (
                        <View key={u.id} style={[socialSt.friendRow, { borderBottomColor: C.border }]}>
                          <View style={[socialSt.avatar, { backgroundColor: '#9B7DD4' }]}>
                            <Text style={socialSt.avatarText}>{(u.username[0] || 'M').toUpperCase()}</Text>
                          </View>
                          <Text style={[socialSt.friendName, { color: C.textPrimary }]} numberOfLines={1}>
                            {u.username}
                            <Text style={{ color: C.accent }}> #{u.uniqueTag}</Text>
                          </Text>
                          {status === 'sent' ? (
                            <View style={[socialSt.sentBadge, { backgroundColor: '#22C55E20', borderColor: '#22C55E40' }]}>
                              <MaterialIcons name="check" size={14} color="#22C55E" />
                              <Text style={[socialSt.sentText, { color: '#22C55E' }]}>{t('habits.network.sent')}</Text>
                            </View>
                          ) : status === 'already_friends' ? (
                            <Text style={[socialSt.sentText, { color: C.textTertiary }]}>{t('habits.network.alreadyFriends')}</Text>
                          ) : status === 'already_requested' ? (
                            <Text style={[socialSt.sentText, { color: C.textTertiary }]}>{t('habits.network.requested')}</Text>
                          ) : (
                            <Pressable
                              style={[socialSt.sendReqBtn, { backgroundColor: C.accent, opacity: status === 'loading' ? 0.6 : 1 }]}
                              onPress={() => handleSendDiscoverRequest(u.id)}
                              disabled={status === 'loading'}
                            >
                              {status === 'loading'
                                ? <ActivityIndicator size="small" color="#fff" />
                                : <><Text style={socialSt.sendReqText}>{t('habits.network.addBtn')}</Text><MaterialIcons name="person-add" size={14} color="#fff" /></>
                              }
                            </Pressable>
                          )}
                        </View>
                      );
                    })}
                  </>
                )}
              </ScrollView>

              <Pressable style={[socialSt.waBtn, { opacity: inviting ? 0.75 : 1 }]} onPress={handleInvite} disabled={inviting}>
                <Ionicons name="logo-whatsapp" size={20} color="#fff" />
                <Text style={socialSt.waBtnText}>{t('habits.network.inviteWhatsApp')}</Text>
              </Pressable>
            </>

        </Animated.View>
      </View>
    </Modal>
  );
}

// ─── Main Screen ──────────────────────────────────────────────────────────────
export default function HabitsScreen() {
  const insets = useSafeAreaInsets();
  const topInset = Platform.OS === 'web' ? 67 : insets.top;
  const botInset = Platform.OS === 'web' ? 34 : insets.bottom;
  const C = useThemeColors();
  const { t } = useTranslation();
  const { language } = useLanguage();
  const {
    completedCountToday, enabledCount, isLoading, refresh,
    nudge, dismissNudge, allHabitsState, setCoOp, removeHabit,
    incomingNudges, dismissIncomingNudge, setPillarVisibility, nudgePartner,
    completeHabit, uncompleteHabit,
  } = useHabits();
  const { pendingCount: pendingFriendRequests } = useFriendActivity();

  const [coopSheetHabit, setCoopSheetHabit] = useState<UserHabit | null>(null);
  const [partnerStatuses, setPartnerStatuses] = useState<Record<string, PartnerStatus>>({});
  const [dualBannerMsg, setDualBannerMsg] = useState<string | null>(null);
  const [masteredHabitName, setMasteredHabitName] = useState<string | null>(null);
  const [pillarPrivacyHabit, setPillarPrivacyHabit] = useState<UserHabit | null>(null);
  /** null = no snackbar; string = passive; { msg, habitId } = actionable (6 PM CTA) */
  const [timeNudge, setTimeNudge] = useState<null | { msg: string; habitId?: string }>(null);
  /** Which incoming nudge is currently displayed (first in queue) */
  const shownNudge: IncomingNudge | null = incomingNudges[0] ?? null;

  // Keep a ref so the polling closure doesn't go stale
  const allHabitsRef = useRef(allHabitsState);
  useEffect(() => { allHabitsRef.current = allHabitsState; }, [allHabitsState]);

  // ── Time-based nudges (6 PM & 8 PM) ────────────────────────────────────────
  const shownTimeNudgesRef = useRef<Set<string>>(new Set());
  useEffect(() => {
    const checkTimeNudge = () => {
      const now = new Date();
      const h = now.getHours();
      const dateKey = getTodayStr();
      const habits = allHabitsRef.current;

      // 6 PM: user done, partner hasn't — show actionable "Send Nudge" CTA
      const key6pm = `6pm:${dateKey}`;
      if (h >= 18 && h < 20 && !shownTimeNudgesRef.current.has(key6pm)) {
        const unfinishedPartners = habits.filter(
          hab => hab.isEnabled && hab.isCoOp && hab.completedToday &&
                 partnerStatuses[hab.habitId] && !partnerStatuses[hab.habitId].partnerCompleted
        );
        if (unfinishedPartners.length > 0) {
          const hab = unfinishedPartners[0];
          const name = partnerStatuses[hab.habitId]?.partnerName ?? 'your partner';
          setTimeNudge({
            msg: `${name} hasn't checked in yet — give them a nudge!`,
            habitId: hab.habitId,
          });
          shownTimeNudgesRef.current.add(key6pm);
        }
      }

      // 8 PM: both user AND partner haven't completed a co-op habit
      const key8pm = `8pm:${dateKey}`;
      if (h >= 20 && h < 22 && !shownTimeNudgesRef.current.has(key8pm)) {
        const bothIncomplete = habits.filter(
          hab => hab.isEnabled && hab.isCoOp && !hab.completedToday &&
                 partnerStatuses[hab.habitId] && !partnerStatuses[hab.habitId].partnerCompleted
        );
        if (bothIncomplete.length > 0) {
          const name = partnerStatuses[bothIncomplete[0].habitId]?.partnerName ?? 'your partner';
          setTimeNudge({
            msg: `Neither you nor ${name} have completed your habit yet — there's still time! 🌿`,
          });
          shownTimeNudgesRef.current.add(key8pm);
        }
      }
    };
    checkTimeNudge();
    const tid = setInterval(checkTimeNudge, 60000);
    return () => clearInterval(tid);
  }, [partnerStatuses]);

  useFocusEffect(useCallback(() => {
    refresh();

    const today = getTodayStr();
    const poll = async () => {
      const coopHabits = allHabitsRef.current.filter(h => h.isEnabled && h.isCoOp && h.partnerId);
      for (const habit of coopHabits) {
        try {
          const res = await apiRequest('GET', `/api/habits/${habit.habitId}/partner-status?date=${today}`);
          if (!res.ok) continue;
          const data = await res.json();
          setPartnerStatuses(prev => ({
            ...prev,
            [habit.habitId]: { partnerCompleted: !!data.partnerCompleted, partnerName: data.partnerName ?? null },
          }));
        } catch { /* silent */ }
      }
    };

    poll();
    const interval = setInterval(poll, 10000);
    return () => { clearInterval(interval); };
  }, []));

  const handleDualComplete = useCallback((partnerName: string) => {
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    setDualBannerMsg(`Congratulations! You and ${partnerName} completed your habit today 🎉`);
  }, []);

  const handleMastered = useCallback((habitName: string) => {
    setMasteredHabitName(habitName);
  }, []);

  const handleConfigure = useCallback((habit: UserHabit) => {
    Haptics.selectionAsync();
    router.push({ pathname: '/habit-configure', params: { habitId: habit.habitId } });
  }, []);

  /** Track whether this co-op activation is new (to trigger privacy modal) */
  const prevCoOpStateRef = useRef<Record<string, boolean>>({});
  const handleCoOpSave = useCallback(async (habitId: string, isCoOp: boolean, partnerId: string | null) => {
    const wasCoOp = prevCoOpStateRef.current[habitId] ?? false;
    await setCoOp(habitId, isCoOp, partnerId);
    if (isCoOp && partnerId && !wasCoOp) {
      // Newly activated co-op — show pillar privacy modal
      const habit = allHabitsRef.current.find(h => h.habitId === habitId);
      if (habit) setTimeout(() => setPillarPrivacyHabit(habit), 400);
    }
    prevCoOpStateRef.current[habitId] = isCoOp;
  }, [setCoOp]);

  // Initialise prevCoOpState from current habits
  useEffect(() => {
    const map: Record<string, boolean> = {};
    allHabitsState.forEach(h => { map[h.habitId] = h.isCoOp; });
    prevCoOpStateRef.current = map;
  }, []);

  const enabledCnt = enabledCount;
  const completedCnt = completedCountToday;
  const progressPct = enabledCnt > 0 ? (completedCnt / enabledCnt) * 100 : 0;

  return (
    <View style={[s.root, { backgroundColor: C.background }]}>
      {/* Dual-completion drop-down banner */}
      {dualBannerMsg && (
        <DualCompletionBanner
          message={dualBannerMsg}
          topInset={topInset}
          onDone={() => setDualBannerMsg(null)}
        />
      )}

      {/* Habit Mastered overlay */}
      {masteredHabitName && (
        <HabitMasteredOverlay
          habitName={masteredHabitName}
          onDismiss={() => setMasteredHabitName(null)}
        />
      )}

      {/* Header */}
      <View style={[s.header, {
        paddingTop: topInset + 12,
        backgroundColor: C.background,
        borderBottomColor: C.border,
      }]}>
        <Pressable style={s.backBtn} onPress={() => router.back()}>
          <MaterialIcons name="arrow-back" size={22} color={C.textPrimary} />
        </Pressable>
        <Text style={[s.title, { color: C.textPrimary }]}>{t('habits.screenTitle')}</Text>
      </View>

      <ScrollView
        style={s.scroll}
        contentContainerStyle={[s.content, { paddingBottom: botInset + 100 }]}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        {/* ── Today's progression ────────────────────────────────────────── */}
        {enabledCnt > 0 && (
          <View style={[s.progressCard, { backgroundColor: C.cardBackground, borderColor: C.border }]}>
            <View style={s.progressRow}>
              <Text style={[s.progressLabel, { color: C.textPrimary }]}>{t('habits.today')}</Text>
              <Text style={[s.progressCount, { color: C.accent }]}>
                {completedCnt}/{enabledCnt}
              </Text>
            </View>
            <View style={[s.track, { backgroundColor: C.border }]}>
              <View style={[s.fill, { width: `${progressPct}%` as any, backgroundColor: C.accent }]} />
            </View>

            <View style={s.activeList}>
              {allHabitsState
                .filter(h => h.isEnabled && h.habitStatus !== 'maintained')
                .map(habit => {
                  const daysDone = habit.journeyCompletionCount ?? 0;
                  const daysTarget = habit.journeyTargetDays;
                  const subtitle = daysTarget
                    ? `${daysDone}/${daysTarget} days`
                    : t('habits.active');
                  const bCfg = BLOCK_CFG[habit.timeBlock];
                  const bColor = bCfg?.main ?? '#888';
                  const bEmoji = bCfg?.emoji ?? '📝';
                  return (
                    <View key={habit.habitId} style={[s.activeRow, { borderBottomColor: C.border }]}>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, flex: 1 }}>
                        <View style={[s.pillarIconWrap, { backgroundColor: bColor + '28', borderColor: bColor + '55' }]}>
                          <Text style={{ fontSize: 18 }}>{bEmoji}</Text>
                        </View>
                        <View style={{ flex: 1 }}>
                          <Text style={[s.activeName, { color: C.textPrimary }]} numberOfLines={1}>{getLocalHabitName(habit, language)}</Text>
                          <Text style={[s.activeSub, { color: C.textTertiary }]}>{subtitle}</Text>
                        </View>
                      </View>
                      <Pressable
                        hitSlop={10}
                        onPress={async () => {
                          Haptics.selectionAsync();
                          if (habit.completedToday) {
                            await uncompleteHabit(habit.habitId);
                          } else {
                            await completeHabit(habit.habitId);
                          }
                        }}
                      >
                        <View style={[s.tickBtn, {
                          borderColor: habit.completedToday ? C.accent : C.border,
                          backgroundColor: habit.completedToday ? C.accent : 'transparent',
                        }]}>
                          <MaterialIcons name="check" size={16} color={habit.completedToday ? '#fff' : C.textTertiary} />
                        </View>
                      </Pressable>
                      <Pressable
                        hitSlop={10}
                        onPress={() => {
                          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                          Alert.alert(
                            t('habits.endHabitTitle'),
                            t('habits.endHabitMsg', { name: getLocalHabitName(habit, language) }),
                            [
                              { text: t('habits.cancelBtn'), style: 'cancel' },
                              {
                                text: t('habits.endHabitConfirm'),
                                style: 'destructive',
                                onPress: () => removeHabit(habit.habitId),
                              },
                            ]
                          );
                        }}
                      >
                        <MaterialIcons name="close" size={18} color="#EF4444" />
                      </Pressable>
                    </View>
                  );
                })}
            </View>
          </View>
        )}

        {/* ── Search bar ─────────────────────────────────────────────────── */}
        <HabitSearchBar
          habits={allHabitsState}
          onSelect={(habitId) => router.push({ pathname: '/habit-configure', params: { habitId } })}
        />

        {isLoading ? (
          <ActivityIndicator style={{ marginTop: 32 }} color={C.accent} />
        ) : (
          <TimeBlockGrid
            partnerStatuses={partnerStatuses}
            onCoOpPress={setCoopSheetHabit}
            onDualComplete={handleDualComplete}
            onConfigurePress={handleConfigure}
            onMastered={handleMastered}
          />
        )}

        <DailyFuelCard />

        <Text style={[s.hint, { color: C.textTertiary }]}>
          {t('habits.hint')}
        </Text>
      </ScrollView>

      {/* Daily-fuel nudge snackbar */}
      {nudge && (
        <View style={[s.snackbarWrap, { bottom: botInset + 88, right: 80 }]}>
          <NudgeSnackbar message={nudge} onDismiss={dismissNudge} />
        </View>
      )}

      {/* Time-based nudge snackbar (6 PM / 8 PM) */}
      {timeNudge && !nudge && (
        <View style={[s.snackbarWrap, { bottom: botInset + 88, right: 80 }]}>
          <NudgeSnackbar
            message={timeNudge.msg}
            onDismiss={() => setTimeNudge(null)}
            {...(timeNudge.habitId
              ? {
                  actionLabel: t('habits.nudgeAction'),
                  onAction: () => nudgePartner(timeNudge.habitId!),
                }
              : {}
            )}
          />
        </View>
      )}

      {/* Incoming nudge from co-op partner */}
      {shownNudge && !nudge && !timeNudge && (
        <View style={[s.snackbarWrap, { bottom: botInset + 88, right: 80 }]}>
          <NudgeSnackbar
            message={`${shownNudge.senderName} is nudging you to complete your habit! 💪`}
            onDismiss={() => dismissIncomingNudge(shownNudge.habitId)}
          />
        </View>
      )}

      {/* Social hub moved to bottom tab bar */}

      {/* Co-Op setup sheet */}
      <CoOpSheet
        visible={!!coopSheetHabit}
        habit={coopSheetHabit}
        onClose={() => setCoopSheetHabit(null)}
        onSave={handleCoOpSave}
        onPrivacyPress={coopSheetHabit
          ? () => setPillarPrivacyHabit(coopSheetHabit)
          : undefined
        }
      />

      {/* Pillar privacy modal — shown after a new co-op activation */}
      <PillarPrivacyModal
        visible={!!pillarPrivacyHabit}
        habitName={pillarPrivacyHabit ? getLocalHabitName(pillarPrivacyHabit, language) : ''}
        onClose={() => setPillarPrivacyHabit(null)}
        onSave={(visibility) => {
          if (pillarPrivacyHabit) {
            setPillarVisibility(pillarPrivacyHabit.habitId, visibility);
          }
        }}
      />
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────
const banner = StyleSheet.create({
  wrap: {
    position: 'absolute', left: 16, right: 16, zIndex: 200,
    flexDirection: 'row', alignItems: 'center', gap: 10,
    borderRadius: 14, paddingHorizontal: 16, paddingVertical: 14,
    elevation: 12,
    shadowColor: '#9B7DD4', shadowOpacity: 0.4, shadowRadius: 12, shadowOffset: { width: 0, height: 4 },
  },
  emoji: { fontSize: 20 },
  text: { flex: 1, fontSize: 14, fontFamily: 'Inter_600SemiBold', color: '#fff', lineHeight: 20 },
});

const s = StyleSheet.create({
  root: { flex: 1 },
  header: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 16, paddingBottom: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  backBtn: { padding: 6, marginRight: 4 },
  title: { flex: 1, fontSize: 20, fontFamily: 'Inter_600SemiBold' },
  scroll: { flex: 1 },
  content: { padding: 16, gap: 14 },
  progressCard: { borderRadius: 14, padding: 14, borderWidth: StyleSheet.hairlineWidth },
  progressRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 10 },
  progressLabel: { fontSize: 14, fontFamily: 'Inter_600SemiBold' },
  progressCount: { fontSize: 14, fontFamily: 'Inter_700Bold' },
  track: { height: 7, borderRadius: 4, overflow: 'hidden' },
  fill: { height: 7, borderRadius: 4 },
  activeList: { marginTop: 10, gap: 0 },
  activeRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 10, borderBottomWidth: StyleSheet.hairlineWidth },
  activeName: { fontSize: 14, fontFamily: 'Inter_500Medium' },
  activeSub: { fontSize: 11, fontFamily: 'Inter_400Regular', marginTop: 2 },
  pillarIconWrap: { width: 36, height: 36, borderRadius: 10, alignItems: 'center', justifyContent: 'center', borderWidth: 1.5 },
  tickBtn: { width: 28, height: 28, borderRadius: 8, borderWidth: 1.5, alignItems: 'center', justifyContent: 'center' },
  grid: { gap: 12 },
  gridRow: { flexDirection: 'row', gap: 12, alignItems: 'flex-start' },
  hint: { fontSize: 11, fontFamily: 'Inter_400Regular', textAlign: 'center', lineHeight: 16, paddingHorizontal: 8 },
  snackbarWrap: { position: 'absolute', left: 16 },
  fab: {
    position: 'absolute', right: 20,
    width: 56, height: 56, borderRadius: 28,
    alignItems: 'center', justifyContent: 'center',
    elevation: 8,
    shadowColor: '#9B7DD4', shadowOpacity: 0.4, shadowRadius: 10, shadowOffset: { width: 0, height: 4 },
  },
  fabBadge: {
    position: 'absolute', top: 0, right: 0,
    minWidth: 20, height: 20, borderRadius: 10,
    backgroundColor: '#EF4444',
    alignItems: 'center', justifyContent: 'center',
    paddingHorizontal: 4,
    borderWidth: 2, borderColor: '#9B7DD4',
  },
  fabBadgeText: {
    fontSize: 10, fontFamily: 'Inter_700Bold', color: '#fff', lineHeight: 13,
  },
});

const snack = StyleSheet.create({
  wrap: {
    flexDirection: 'row', alignItems: 'center', gap: 10, padding: 14,
    borderRadius: 14, elevation: 6,
    shadowColor: '#000', shadowOpacity: 0.18, shadowRadius: 8, shadowOffset: { width: 0, height: 3 },
  },
  text: { flex: 1, fontSize: 13, fontFamily: 'Inter_400Regular', lineHeight: 18 },
  actionBtn: {
    paddingHorizontal: 10, paddingVertical: 5, borderRadius: 10,
    backgroundColor: 'rgba(155,125,212,0.15)', flexShrink: 0,
  },
  actionText: { fontSize: 12, fontFamily: 'Inter_600SemiBold', color: '#9B7DD4' },
});

const fuelSt = StyleSheet.create({
  card: { borderRadius: 14, padding: 16, borderWidth: StyleSheet.hairlineWidth, gap: 10 },
  cardHeader: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8 },
  title: { fontSize: 16, fontFamily: 'Inter_600SemiBold' },
  sub: { fontSize: 12, fontFamily: 'Inter_400Regular', marginTop: -4 },
  syncBadge: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 8, paddingVertical: 4, borderRadius: 20, backgroundColor: 'rgba(34,197,94,0.10)' },
  syncText: { fontSize: 11, fontFamily: 'Inter_600SemiBold', color: '#22C55E' },
  row: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  label: { fontSize: 12, fontFamily: 'Inter_500Medium', width: 60 },
  val: { fontSize: 13, fontFamily: 'Inter_700Bold', width: 20, textAlign: 'right' },
});

const fs = StyleSheet.create({
  dotsRow: { flex: 1, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  dotHit: { padding: 4 },
  dot: { width: 8, height: 8, borderRadius: 4 },
});

const blockSt = StyleSheet.create({
  card: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    paddingVertical: 14, paddingHorizontal: 14,
    borderRadius: 16, borderWidth: StyleSheet.hairlineWidth,
    overflow: 'hidden',
  },
  leftStripe: { width: 4, height: 36, borderRadius: 2, marginLeft: -2 },
  title: { fontSize: 15, fontFamily: 'Inter_700Bold' },
  subtitle: { fontSize: 12, fontFamily: 'Inter_400Regular', marginTop: 2 },
  progressWrap: { alignItems: 'flex-end', gap: 3, minWidth: 56 },
  progressTrack: { width: 48, height: 4, borderRadius: 2, overflow: 'hidden' },
  progressFill: { height: 4, borderRadius: 2 },
  progressText: { fontSize: 10, fontFamily: 'Inter_600SemiBold' },
});

const cloverSt = StyleSheet.create({
  // ── Expanded panel ──
  expandedCard: {
    marginTop: 12, borderRadius: 16,
    overflow: 'hidden', borderWidth: StyleSheet.hairlineWidth,
  },
  expandedHeader: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    paddingHorizontal: 14, paddingVertical: 10,
  },
  expandedEmoji: { fontSize: 16 },
  expandedLabel: { flex: 1, fontSize: 14, fontFamily: 'Inter_700Bold' },
  expandedSub: { fontSize: 12, fontFamily: 'Inter_500Medium' },
  expandedEmpty: { alignItems: 'center', paddingVertical: 20 },
  expandedEmptyText: { fontSize: 13, fontFamily: 'Inter_400Regular' },
  maintainedDivider: { paddingHorizontal: 12, paddingTop: 10, paddingBottom: 4, borderTopWidth: StyleSheet.hairlineWidth },
  maintainedLabel: { fontSize: 10, fontFamily: 'Inter_600SemiBold', letterSpacing: 1 },
  // In-place description expansion
  descExpansion: { paddingHorizontal: 12, paddingTop: 8, paddingBottom: 12, gap: 10, borderTopWidth: StyleSheet.hairlineWidth },
  descText: { fontSize: 12, fontFamily: 'Inter_400Regular', lineHeight: 18 },
  configureBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, alignSelf: 'flex-start', paddingHorizontal: 12, paddingVertical: 7, borderRadius: 20, borderWidth: 1 },
  configureBtnText: { fontSize: 12, fontFamily: 'Inter_600SemiBold' },
});

const hrow = StyleSheet.create({
  wrap: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    paddingHorizontal: 8, paddingVertical: 8,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  switch: { transform: [{ scaleX: 0.75 }, { scaleY: 0.75 }] },
  nameWrap: { flex: 1 },
  nameRow: { flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap' },
  name: { fontSize: 12, fontFamily: 'Inter_500Medium', lineHeight: 16, flexShrink: 1 },
  struck: { textDecorationLine: 'line-through', opacity: 0.45 },
  partnerWrap: { position: 'relative', width: 24, height: 24 },
  partnerAvatar: {
    width: 24, height: 24, borderRadius: 12,
    alignItems: 'center', justifyContent: 'center',
  },
  partnerInitial: { color: '#fff', fontSize: 10, fontFamily: 'Inter_700Bold' },
  statusDot: {
    position: 'absolute', bottom: -1, right: -1,
    width: 10, height: 10, borderRadius: 5,
    borderWidth: 1.5, borderColor: '#fff',
  },
  coopBtn: { padding: 4, marginLeft: 2 },
  nudgeBtn: {
    padding: 4, marginLeft: 2,
    width: 24, height: 24, borderRadius: 12,
    alignItems: 'center', justifyContent: 'center',
    backgroundColor: 'rgba(245,158,11,0.12)',
  },
  nudgeBtnText: { fontSize: 11, lineHeight: 14 },
  check: {
    width: 18, height: 18, borderRadius: 9, borderWidth: 1.5,
    alignItems: 'center', justifyContent: 'center', flexShrink: 0,
  },
  checkPlaceholder: { width: 18, height: 18, flexShrink: 0 },
  masteredTag: { fontSize: 10, fontFamily: 'Inter_600SemiBold', marginTop: 2 },
  journeyTag: { fontSize: 10, fontFamily: 'Inter_400Regular', marginTop: 2 },
});

const coopSt = StyleSheet.create({
  sheet: {
    position: 'absolute', bottom: 0, left: 0, right: 0,
    borderTopLeftRadius: 24, borderTopRightRadius: 24,
    elevation: 20,
    shadowColor: '#000', shadowOpacity: 0.3, shadowRadius: 20, shadowOffset: { width: 0, height: -4 },
  },
  handle: { width: 40, height: 4, borderRadius: 2, alignSelf: 'center', marginTop: 10, marginBottom: 4 },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 20, paddingTop: 8, paddingBottom: 4,
  },
  title: { fontSize: 17, fontFamily: 'Inter_700Bold' },
  habitName: { fontSize: 13, fontFamily: 'Inter_400Regular', paddingHorizontal: 20, marginBottom: 12 },
  toggle: {
    flexDirection: 'row', marginHorizontal: 20, marginBottom: 16,
    borderRadius: 12, borderWidth: StyleSheet.hairlineWidth, overflow: 'hidden',
  },
  toggleBtn: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 6, paddingVertical: 10,
  },
  toggleText: { fontSize: 14, fontFamily: 'Inter_600SemiBold' },
  pickerWrap: { marginHorizontal: 20, marginBottom: 12 },
  pickerLabel: { fontSize: 11, fontFamily: 'Inter_600SemiBold', letterSpacing: 0.8, marginBottom: 8 },
  friendList: { maxHeight: 180 },
  friendRow: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    paddingVertical: 10, paddingHorizontal: 12,
    borderRadius: 12, borderWidth: 1.5, marginBottom: 6,
  },
  friendRowSelected: { },
  avatar: { width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  avatarText: { color: '#fff', fontSize: 13, fontFamily: 'Inter_700Bold' },
  friendName: { flex: 1, fontSize: 14, fontFamily: 'Inter_500Medium' },
  noFriends: { alignItems: 'center', gap: 8, paddingVertical: 20 },
  noFriendsText: { fontSize: 13, fontFamily: 'Inter_400Regular', textAlign: 'center' },
  privacyRow: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    marginHorizontal: 20, marginBottom: 10, paddingVertical: 10,
    paddingHorizontal: 14, borderRadius: 12,
    backgroundColor: 'rgba(155,125,212,0.08)',
  },
  privacyText: { flex: 1, fontSize: 13, fontFamily: 'Inter_500Medium' },
  saveBtn: {
    marginHorizontal: 20, marginTop: 8, paddingVertical: 14,
    borderRadius: 14, alignItems: 'center',
  },
  saveBtnText: { color: '#fff', fontSize: 15, fontFamily: 'Inter_600SemiBold' },
});

const searchSt = StyleSheet.create({
  wrap: { position: 'relative', zIndex: 10 },
  bar: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    paddingHorizontal: 12, paddingVertical: 10,
    borderRadius: 14, borderWidth: StyleSheet.hairlineWidth,
  },
  input: { flex: 1, fontSize: 14, fontFamily: 'Inter_400Regular', paddingVertical: 0 },
  dropdown: {
    position: 'absolute', top: '100%', left: 0, right: 0, marginTop: 4,
    borderRadius: 14, borderWidth: StyleSheet.hairlineWidth,
    overflow: 'hidden', elevation: 12,
    shadowColor: '#000', shadowOpacity: 0.2, shadowRadius: 10, shadowOffset: { width: 0, height: 4 },
    zIndex: 20,
  },
  resultRow: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    paddingHorizontal: 14, paddingVertical: 12,
  },
  resultLeft: { flex: 1, gap: 4 },
  resultName: { fontSize: 13, fontFamily: 'Inter_600SemiBold' },
  resultTags: { flexDirection: 'row', gap: 5, flexWrap: 'wrap' },
  tag: { paddingHorizontal: 7, paddingVertical: 2, borderRadius: 10, borderWidth: 1 },
  tagText: { fontSize: 10, fontFamily: 'Inter_600SemiBold' },
});

const masteredSt = StyleSheet.create({
  backdrop: { backgroundColor: 'rgba(0,0,0,0.65)', alignItems: 'center', justifyContent: 'center' },
  card: {
    width: 300, borderRadius: 24, padding: 28, alignItems: 'center', gap: 10,
    elevation: 20,
    shadowColor: '#9B7DD4', shadowOpacity: 0.4, shadowRadius: 20, shadowOffset: { width: 0, height: 8 },
  },
  trophy: { fontSize: 56 },
  title: { fontSize: 22, fontFamily: 'Inter_700Bold', textAlign: 'center' },
  subtitle: { fontSize: 15, fontFamily: 'Inter_600SemiBold', textAlign: 'center' },
  body: { fontSize: 13, fontFamily: 'Inter_400Regular', textAlign: 'center', lineHeight: 19, marginTop: 4 },
  btn: { marginTop: 8, paddingVertical: 14, paddingHorizontal: 32, borderRadius: 14, alignSelf: 'stretch', alignItems: 'center' },
  btnText: { color: '#fff', fontSize: 16, fontFamily: 'Inter_700Bold' },
});

const socialSt = StyleSheet.create({
  backdrop: { backgroundColor: 'rgba(0,0,0,0.52)' },
  sheet: {
    position: 'absolute', bottom: 0, left: 0, right: 0,
    borderTopLeftRadius: 24, borderTopRightRadius: 24,
    maxHeight: SHEET_HEIGHT + 60,
    elevation: 20,
    shadowColor: '#000', shadowOpacity: 0.3, shadowRadius: 20, shadowOffset: { width: 0, height: -4 },
  },
  handle: { width: 40, height: 4, borderRadius: 2, alignSelf: 'center', marginTop: 10, marginBottom: 4 },
  sheetHeader: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 20, paddingVertical: 12,
  },
  sheetTitle: { fontSize: 17, fontFamily: 'Inter_700Bold' },
  listScroll: { maxHeight: SHEET_HEIGHT - 140 },
  listContent: { paddingHorizontal: 20, paddingBottom: 8 },
  sectionLabel: { fontSize: 11, fontFamily: 'Inter_600SemiBold', letterSpacing: 0.8, marginBottom: 6, marginTop: 4 },
  friendRow: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    paddingVertical: 10, borderBottomWidth: StyleSheet.hairlineWidth,
  },
  avatar: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  avatarText: { color: '#fff', fontSize: 14, fontFamily: 'Inter_700Bold' },
  friendName: { flex: 1, fontSize: 14, fontFamily: 'Inter_500Medium' },
  respondBtn: { paddingHorizontal: 10, paddingVertical: 6, borderRadius: 8 },
  respondBtnText: { fontSize: 12, fontFamily: 'Inter_600SemiBold', color: '#fff' },
  removeBtn: { padding: 4 },
  empty: { alignItems: 'center', gap: 8, paddingVertical: 32, paddingHorizontal: 20 },
  emptyTitle: { fontSize: 16, fontFamily: 'Inter_600SemiBold' },
  emptyDesc: { fontSize: 13, fontFamily: 'Inter_400Regular', textAlign: 'center', lineHeight: 19 },
  searchRow: {
    flexDirection: 'row', alignItems: 'center', gap: 0,
    marginHorizontal: 20, marginBottom: 4, marginTop: 2,
    borderRadius: 12, borderWidth: 1, overflow: 'hidden',
  },
  searchInput: {
    flex: 1, paddingHorizontal: 10, paddingVertical: 10,
    fontSize: 14, fontFamily: 'Inter_400Regular',
  },
  searchBtn: {
    paddingHorizontal: 14, paddingVertical: 10, alignItems: 'center', justifyContent: 'center', minWidth: 52,
  },
  searchBtnText: { color: '#fff', fontSize: 13, fontFamily: 'Inter_600SemiBold' },
  searchError: { fontSize: 12, fontFamily: 'Inter_400Regular', marginHorizontal: 20, marginBottom: 6 },
  searchResultCard: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    marginHorizontal: 20, marginBottom: 8, padding: 12,
    borderRadius: 12, borderWidth: 1,
  },
  sentBadge: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    paddingHorizontal: 10, paddingVertical: 6, borderRadius: 8, borderWidth: 1,
  },
  sentText: { fontSize: 12, fontFamily: 'Inter_500Medium' },
  sendReqBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    paddingHorizontal: 10, paddingVertical: 7, borderRadius: 8,
  },
  sendReqText: { color: '#fff', fontSize: 12, fontFamily: 'Inter_600SemiBold' },
  waBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 10, marginHorizontal: 20, marginTop: 12,
    paddingVertical: 14, borderRadius: 14,
    backgroundColor: '#25D366',
  },
  waBtnText: { color: '#fff', fontSize: 15, fontFamily: 'Inter_600SemiBold' },
});

const ppSt = StyleSheet.create({
  sheet: {
    position: 'absolute', bottom: 0, left: 0, right: 0,
    borderTopLeftRadius: 24, borderTopRightRadius: 24,
    elevation: 22,
    shadowColor: '#9B7DD4', shadowOpacity: 0.3, shadowRadius: 20, shadowOffset: { width: 0, height: -4 },
  },
  handle: { width: 40, height: 4, borderRadius: 2, alignSelf: 'center', marginTop: 10, marginBottom: 4 },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 20, paddingTop: 8, paddingBottom: 4,
  },
  title: { fontSize: 17, fontFamily: 'Inter_700Bold' },
  subtitle: { fontSize: 13, fontFamily: 'Inter_400Regular', paddingHorizontal: 20, marginBottom: 4 },
  desc: { fontSize: 12, fontFamily: 'Inter_400Regular', paddingHorizontal: 20, marginBottom: 12, lineHeight: 17 },
  pillarRow: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    paddingHorizontal: 20, paddingVertical: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  pillarEmoji: { fontSize: 18 },
  pillarName: { flex: 1, fontSize: 14, fontFamily: 'Inter_500Medium' },
  pill: {
    paddingHorizontal: 10, paddingVertical: 4, borderRadius: 20,
    alignItems: 'center', justifyContent: 'center', minWidth: 52,
  },
  pillText: { fontSize: 11, fontFamily: 'Inter_600SemiBold' },
  saveBtn: {
    margin: 20, marginTop: 16, paddingVertical: 14,
    borderRadius: 14, alignItems: 'center',
  },
  saveBtnText: { color: '#fff', fontSize: 15, fontFamily: 'Inter_600SemiBold' },
});
