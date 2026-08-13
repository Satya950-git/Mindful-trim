import React, { useState, useRef, useCallback, useMemo, useEffect } from 'react';
import {
  View, Text, StyleSheet, ScrollView, Pressable, Platform,
  TextInput, Modal, ActivityIndicator, Alert, FlatList,
} from 'react-native';
import { useTranslation } from 'react-i18next';
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { MaterialIcons } from '@expo/vector-icons';
import { GROUP_HABIT_LIMIT } from '@/shared/appConfig';
import { KeyboardAwareScrollViewCompat } from '@/components/KeyboardAwareScrollViewCompat';
import * as Haptics from 'expo-haptics';
import { useQuery, useQueryClient } from '@tanstack/react-query';

import { useThemeColors } from '@/context/ThemeContext';
import { useAuth } from '@/context/AuthContext';
import { useLanguage } from '@/context/LanguageContext';
import { apiRequest, getQueryFn } from '@/lib/query-client';
import { SocialHubModal } from '@/app/habits';
import { HABITS, getLocalHabitName, getLocalHabitNameByEnglish } from '@/data/habitsData';
import { HABIT_DESCRIPTIONS_HI } from '@/data/habitDescriptionsHi';

// ─── Types ────────────────────────────────────────────────────────────────────
type OneOnOneChallenge = {
  id: string;
  habitName: string;
  status: 'pending' | 'active' | 'rejected';
  createdAt: string;
  challengerId: string;
  challengeeId: string;
  challengerName: string;
  challengeeName: string;
  challengerDoneToday: boolean;
  challengeeDoneToday: boolean;
  nudgedTodayByMe: boolean;
};

type HabitMemberCompletion = { userId: string; doneToday: boolean };
type CoopHabit = { id: string; habitName: string; memberCompletion: HabitMemberCompletion[] };
type CoopMember = { id: string; userId: string; status: string; name: string; doneToday: boolean };
type CoopGroup = {
  id: string;
  name: string;
  inviteToken: string;
  createdAt: string;
  myStatus: 'pending' | 'active';
  creatorId: string;
  creatorName: string;
  habits: CoopHabit[];
  members: CoopMember[];
  memberCount?: number;
  nudgedGroupToday?: boolean;
};

type Friend = { friendshipId: string; userId: string; name: string; createdAt: string };
type FriendsData = { accepted: Friend[]; pending: Friend[] };

// ─── Constants ────────────────────────────────────────────────────────────────
const ACCENT = '#9B7DD4';
const GREEN = '#56C596';
const PILLAR_COLORS: Record<string, string> = {
  Mental: '#5B8DEF', Physical: '#56C596', Social: '#F2836B', Spiritual: '#9B7DD4',
};
const BLOCK_COLORS: Record<string, string> = {
  Morning: '#F59E0B', Workday: '#3B82F6', Evening: '#6366F1', Lifestyle: '#10B981',
};

// ─── Error helper ─────────────────────────────────────────────────────────────
function parseApiErr(err: unknown): string {
  if (err instanceof Error) {
    const match = err.message.match(/^\d+:\s*(.+)$/s);
    if (match) {
      try {
        const parsed = JSON.parse(match[1]) as { error?: string };
        return parsed.error ?? match[1];
      } catch {
        return match[1];
      }
    }
    return err.message;
  }
  return 'An unexpected error occurred.';
}

// ─── Toast hook ──────────────────────────────────────────────────────────────
function useToast() {
  const [msg, setMsg] = useState<string | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const show = (m: string) => {
    setMsg(m);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => setMsg(null), 2500);
  };
  return { msg, show };
}

function Toast({ msg }: { msg: string | null }) {
  if (!msg) return null;
  return (
    <View style={toastSt.wrap}>
      <Text style={toastSt.text}>{msg}</Text>
    </View>
  );
}
const toastSt = StyleSheet.create({
  wrap: {
    position: 'absolute', bottom: 84, alignSelf: 'center',
    backgroundColor: '#2D2D3A', paddingHorizontal: 18, paddingVertical: 10, borderRadius: 24,
  },
  text: { color: '#fff', fontSize: 13, fontFamily: 'Inter_500Medium' },
});


// ─── Search Bar (shared) ────────────────────────────────────────────────────────
function SearchBar({ value, onChangeText, placeholder }: {
  value: string;
  onChangeText: (t: string) => void;
  placeholder: string;
}) {
  const C = useThemeColors();
  return (
    <View style={searchSt.wrap}>
      <View style={[searchSt.bar, { backgroundColor: C.cardBackground, borderColor: C.border }]}>
        <MaterialIcons name="search" size={18} color={C.textTertiary} />
        <TextInput
          style={[searchSt.input, { color: C.textPrimary }]}
          placeholder={placeholder}
          placeholderTextColor={C.textTertiary}
          value={value}
          onChangeText={onChangeText}
          returnKeyType="search"
        />
        {value.length > 0 && (
          <Pressable onPress={() => onChangeText('')} hitSlop={8}>
            <MaterialIcons name="close" size={16} color={C.textTertiary} />
          </Pressable>
        )}
      </View>
    </View>
  );
}

// ─── Habit Picker (catalog suggestions — selection required) ──────────────────
function HabitPicker({ value, onSelect, hasError }: {
  value: string;
  onSelect: (name: string) => void;
  hasError?: boolean;
}) {
  const C = useThemeColors();
  const { t } = useTranslation();
  const { language } = useLanguage();
  const [query, setQuery] = useState(value);
  const [focused, setFocused] = useState(false);
  // Always-current ref so timeouts don't capture a stale closure of `value`.
  const valueRef = useRef(value);
  valueRef.current = value;
  // True when this component itself cleared the parent value via onSelect('').
  // Prevents the useEffect from wiping the query the user is actively typing.
  const suppressReset = useRef(false);

  // Keep query in sync when parent clears the value (e.g. after modal close),
  // but skip the reset when the component itself triggered the clear.
  useEffect(() => {
    if (!value) {
      if (suppressReset.current) {
        suppressReset.current = false;
        return;
      }
      setQuery('');
    }
  }, [value]);

  const results = useMemo(() => {
    if (query.trim().length === 0) return [];
    const q = query.toLowerCase();
    const qRaw = query.trim();
    return HABITS.filter(h =>
      h.habitName.toLowerCase().includes(q) ||
      (h.habitNameHi && h.habitNameHi.includes(qRaw)) ||
      h.description.toLowerCase().includes(q) ||
      h.pillar.toLowerCase().includes(q) ||
      h.timeBlock.toLowerCase().includes(q)
    ).slice(0, 6);
  }, [query]);

  // Show dropdown when focused OR when there's an unconfirmed partial query
  // (covers the case where focus was lost mid-edit but the user is still typing).
  const showDropdown = (focused || (!value && query.trim().length > 0)) && results.length > 0;
  const isSelected = !!value;

  const handleSelect = (habitName: string) => {
    const habit = HABITS.find(h => h.habitName === habitName);
    const displayName = habit ? getLocalHabitName(habit, language) : habitName;
    setQuery(displayName);
    setFocused(false);
    Haptics.selectionAsync();
    onSelect(habitName);
  };

  const handleChangeText = (val: string) => {
    setQuery(val);
    if (!focused) setFocused(true);
    // Clear the confirmed selection whenever the user edits the text,
    // but mark that this component triggered the clear so the effect
    // does not immediately blank the query the user is typing.
    if (value) {
      suppressReset.current = true;
      onSelect('');
    }
  };

  const handleBlur = () => {
    setTimeout(() => {
      setFocused(false);
      // Use valueRef (not the stale closure value) to decide whether to clear.
      // If user typed but never selected from dropdown, clear the field.
      if (!valueRef.current) setQuery('');
    }, 150);
  };

  return (
    <View style={pickerSt.wrap}>
      <View style={{ position: 'relative' }}>
        <TextInput
          style={[sheetSt.input, {
            borderColor: isSelected ? ACCENT : hasError ? '#E05252' : focused ? ACCENT + '88' : C.border,
            backgroundColor: C.background,
            color: C.textPrimary,
            marginBottom: 0,
            paddingRight: isSelected ? 36 : 14,
          }]}
          placeholder={t('social.searchHabits')}
          placeholderTextColor={C.textTertiary}
          value={query}
          onChangeText={handleChangeText}
          onFocus={() => setFocused(true)}
          onBlur={handleBlur}
          maxLength={100}
        />
        {isSelected && (
          <View style={pickerSt.selectedIcon}>
            <MaterialIcons name="check-circle" size={18} color={ACCENT} />
          </View>
        )}
      </View>
      {!isSelected && focused && query.trim().length > 0 && results.length === 0 && (
        <View style={[pickerSt.noResults, { backgroundColor: C.cardBackground, borderColor: C.border }]}>
          <Text style={[pickerSt.noResultsText, { color: C.textTertiary }]}>{t('social.noHabitsFound')}</Text>
        </View>
      )}
      {showDropdown && (
        <View style={[pickerSt.dropdown, { backgroundColor: C.cardBackground, borderColor: C.border }]}>
          {results.map((h, i) => {
            const pColor = PILLAR_COLORS[h.pillar] ?? ACCENT;
            const bColor = BLOCK_COLORS[h.timeBlock] ?? '#888';
            return (
              <Pressable
                key={h.habitId}
                style={[pickerSt.row, i < results.length - 1 && { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: C.border }]}
                onPress={() => handleSelect(h.habitName)}
              >
                <View style={{ flex: 1 }}>
                  <Text style={[pickerSt.name, { color: C.textPrimary }]}>{getLocalHabitName(h, language)}</Text>
                  <Text style={[pickerSt.desc, { color: C.textSecondary }]} numberOfLines={1}>
                    {language === 'hi' ? (HABIT_DESCRIPTIONS_HI[h.habitId] ?? h.description) : h.description}
                  </Text>
                  <View style={{ flexDirection: 'row', gap: 5, marginTop: 4 }}>
                    <View style={[pickerSt.tag, { backgroundColor: bColor + '22', borderColor: bColor + '44' }]}>
                      <Text style={[pickerSt.tagText, { color: bColor }]}>{t(`habits.timeBlocks.${h.timeBlock.toLowerCase()}`)}</Text>
                    </View>
                    <View style={[pickerSt.tag, { backgroundColor: pColor + '22', borderColor: pColor + '44' }]}>
                      <Text style={[pickerSt.tagText, { color: pColor }]}>{t(`pillars.${h.pillar.toLowerCase()}`)}</Text>
                    </View>
                  </View>
                </View>
                <MaterialIcons name="chevron-right" size={16} color={C.textTertiary} />
              </Pressable>
            );
          })}
        </View>
      )}
    </View>
  );
}

// ─── Invite Banner ────────────────────────────────────────────────────────────
function InviteBanner({
  text, onAccept, onReject, accepting,
}: {
  text: string; onAccept: () => void; onReject: () => void; accepting: boolean;
}) {
  const C = useThemeColors();
  const { t } = useTranslation();
  return (
    <View style={[invSt.wrap, { backgroundColor: ACCENT + '15', borderColor: ACCENT + '40' }]}>
      <MaterialIcons name="mail" size={18} color={ACCENT} style={{ flexShrink: 0 }} />
      <Text style={[invSt.text, { color: C.textPrimary }]} numberOfLines={4}>{text}</Text>
      <View style={invSt.btns}>
        <Pressable style={[invSt.btn, { backgroundColor: GREEN }]} onPress={onAccept} disabled={accepting}>
          {accepting
            ? <ActivityIndicator size="small" color="#fff" />
            : <Text style={invSt.btnLabel}>{t('social.inviteBanner.accept')}</Text>}
        </Pressable>
        <Pressable style={[invSt.btn, { backgroundColor: '#DDD' }]} onPress={onReject}>
          <Text style={[invSt.btnLabel, { color: '#555' }]}>{t('social.inviteBanner.decline')}</Text>
        </Pressable>
      </View>
    </View>
  );
}
const invSt = StyleSheet.create({
  wrap: { flexDirection: 'row', alignItems: 'center', gap: 8, padding: 12, borderRadius: 12, borderWidth: 1, marginBottom: 10 },
  text: { flex: 1, fontSize: 13, fontFamily: 'Inter_400Regular', lineHeight: 18 },
  btns: { flexDirection: 'column', gap: 6, flexShrink: 0 },
  btn: { borderRadius: 8, paddingVertical: 5, paddingHorizontal: 10, alignItems: 'center' },
  btnLabel: { fontSize: 12, fontFamily: 'Inter_600SemiBold', color: '#fff' },
});

// ─── Create Sheet (shared) ─────────────────────────────────────────────────────
const sheetSt = StyleSheet.create({
  sheet: {
    position: 'absolute', bottom: 0, left: 0, right: 0,
    borderTopLeftRadius: 24, borderTopRightRadius: 24,
    padding: 20, paddingBottom: 40, maxHeight: '85%',
    shadowColor: '#000', shadowOpacity: 0.2, shadowRadius: 20, shadowOffset: { width: 0, height: -4 }, elevation: 12,
  },
  handle: { width: 36, height: 4, borderRadius: 2, backgroundColor: '#DDD', alignSelf: 'center', marginBottom: 16 },
  sheetHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 18 },
  title: { fontSize: 18, fontFamily: 'Inter_700Bold', marginBottom: 18 },
  label: { fontSize: 13, fontFamily: 'Inter_500Medium', marginBottom: 8 },
  input: { borderWidth: 1, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 11, fontSize: 14, fontFamily: 'Inter_400Regular', marginBottom: 16 },
  empty: { fontSize: 13, fontFamily: 'Inter_400Regular', marginBottom: 16 },
  friendChip: { flexDirection: 'column', alignItems: 'center', gap: 4, padding: 10, borderWidth: 1, borderRadius: 14, marginRight: 10, width: 72 },
  friendAvatar: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
  friendInitial: { fontSize: 15, fontFamily: 'Inter_700Bold' },
  friendName: { fontSize: 10, fontFamily: 'Inter_500Medium', textAlign: 'center', width: 60 },
  addHabitBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, padding: 10, borderRadius: 10, borderWidth: 1, marginBottom: 12, alignSelf: 'flex-start' },
  addHabitLabel: { fontSize: 13, fontFamily: 'Inter_500Medium' },
  submitBtn: { borderRadius: 14, padding: 15, alignItems: 'center' },
  submitLabel: { fontSize: 15, fontFamily: 'Inter_600SemiBold', color: '#fff' },
});

const pickerSt = StyleSheet.create({
  wrap: { position: 'relative', zIndex: 10 },
  dropdown: {
    position: 'absolute', top: '100%', left: 0, right: 0, marginTop: 4,
    borderRadius: 14, borderWidth: StyleSheet.hairlineWidth,
    overflow: 'hidden', elevation: 12,
    shadowColor: '#000', shadowOpacity: 0.2, shadowRadius: 10, shadowOffset: { width: 0, height: 4 },
    zIndex: 20,
  },
  row: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    paddingHorizontal: 14, paddingVertical: 12,
  },
  name: { fontSize: 13, fontFamily: 'Inter_600SemiBold' },
  desc: { fontSize: 11, fontFamily: 'Inter_400Regular', marginTop: 1, lineHeight: 15 },
  tag: { paddingHorizontal: 7, paddingVertical: 2, borderRadius: 10, borderWidth: 1 },
  tagText: { fontSize: 10, fontFamily: 'Inter_600SemiBold' },
  selectedIcon: {
    position: 'absolute', right: 12,
    top: 0, bottom: 0, justifyContent: 'center',
  },
  noResults: {
    position: 'absolute', top: '100%', left: 0, right: 0, marginTop: 4,
    borderRadius: 12, borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: 14, paddingVertical: 12, zIndex: 20,
  },
  noResultsText: { fontSize: 12, fontFamily: 'Inter_400Regular', fontStyle: 'italic' },
});

// ─── 1-on-1 invite pop-up modal ───────────────────────────────────────────────
function ChallengeInviteModal({
  challenge,
  onAccept,
  onReject,
  accepting,
}: {
  challenge: OneOnOneChallenge;
  onAccept: () => void;
  onReject: () => void;
  accepting: boolean;
}) {
  const C = useThemeColors();
  const { t } = useTranslation();
  const { language } = useLanguage();
  return (
    <Modal visible transparent animationType="fade" onRequestClose={onReject}>
      <View style={invModalSt.overlay}>
        <View style={[invModalSt.card, { backgroundColor: C.cardBackground }]}>
          <View style={[invModalSt.iconWrap, { backgroundColor: ACCENT + '18' }]}>
            <MaterialIcons name="handshake" size={36} color={ACCENT} />
          </View>
          <Text style={[invModalSt.title, { color: C.textPrimary }]}>
            {t('social.challengeInvite.title')}
          </Text>
          <Text style={[invModalSt.body, { color: C.textSecondary }]}>
            <Text style={{ fontFamily: 'Inter_600SemiBold', color: C.textPrimary }}>{challenge.challengerName}</Text>
            {' '}{t('social.challengeInvite.body')}
          </Text>
          <View style={[invModalSt.habitBadge, { backgroundColor: ACCENT + '14', borderColor: ACCENT + '40' }]}>
            <Text style={[invModalSt.habitName, { color: ACCENT }]}>{getLocalHabitNameByEnglish(challenge.habitName, language)}</Text>
          </View>
          <Text style={[invModalSt.question, { color: C.textSecondary }]}>{t('social.challengeInvite.question')}</Text>
          <Pressable
            style={[invModalSt.acceptBtn, { backgroundColor: GREEN }]}
            onPress={onAccept}
            disabled={accepting}
          >
            {accepting
              ? <ActivityIndicator color="#fff" />
              : <Text style={invModalSt.acceptLabel}>{t('social.challengeInvite.accept')}</Text>}
          </Pressable>
          <Pressable
            style={[invModalSt.rejectBtn, { borderColor: C.border }]}
            onPress={onReject}
            disabled={accepting}
          >
            <Text style={[invModalSt.rejectLabel, { color: C.textTertiary }]}>{t('social.challengeInvite.decline')}</Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

const invModalSt = StyleSheet.create({
  overlay: {
    flex: 1, backgroundColor: 'rgba(0,0,0,0.55)',
    alignItems: 'center', justifyContent: 'center', padding: 32,
  },
  card: {
    width: '100%', borderRadius: 24, padding: 24,
    alignItems: 'center', gap: 10,
    shadowColor: '#000', shadowOpacity: 0.2, shadowRadius: 24, shadowOffset: { width: 0, height: 8 }, elevation: 16,
  },
  iconWrap: { width: 68, height: 68, borderRadius: 34, alignItems: 'center', justifyContent: 'center', marginBottom: 4 },
  title: { fontSize: 20, fontFamily: 'Inter_700Bold', textAlign: 'center' },
  body: { fontSize: 14, fontFamily: 'Inter_400Regular', textAlign: 'center', lineHeight: 20 },
  habitBadge: { borderRadius: 12, borderWidth: 1, paddingHorizontal: 16, paddingVertical: 8, marginTop: 2 },
  habitName: { fontSize: 16, fontFamily: 'Inter_600SemiBold', textAlign: 'center' },
  question: { fontSize: 14, fontFamily: 'Inter_400Regular', marginBottom: 4 },
  acceptBtn: { width: '100%', borderRadius: 14, paddingVertical: 14, alignItems: 'center', marginTop: 4 },
  acceptLabel: { fontSize: 15, fontFamily: 'Inter_600SemiBold', color: '#fff' },
  rejectBtn: { width: '100%', borderRadius: 14, paddingVertical: 12, alignItems: 'center', borderWidth: 1 },
  rejectLabel: { fontSize: 14, fontFamily: 'Inter_500Medium' },
});

// ─── 1-on-1 Tab ──────────────────────────────────────────────────────────────
function OneOnOneTab({ userId }: { userId: string }) {
  const C = useThemeColors();
  const { t } = useTranslation();
  const { language } = useLanguage();
  const qc = useQueryClient();
  const { msg: toastMsg, show: showToast } = useToast();

  const [createVisible, setCreateVisible] = useState(false);
  const [newHabitName, setNewHabitName] = useState('');
  const [selectedFriendId, setSelectedFriendId] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [respondingId, setRespondingId] = useState<string | null>(null);
  const [nudgingId, setNudgingId] = useState<string | null>(null);
  const [nudgedIds, setNudgedIds] = useState<Set<string>>(new Set());
  const [completingId, setCompletingId] = useState<string | null>(null);
  const [leavingId, setLeavingId] = useState<string | null>(null);
  const [inviteModalIdx, setInviteModalIdx] = useState<number>(0);
  const [inviteModalDismissed, setInviteModalDismissed] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');

  useFocusEffect(useCallback(() => {
    qc.invalidateQueries({ queryKey: ['/api/1on1'] });
    setInviteModalIdx(0);
    setInviteModalDismissed(false);
  }, [qc]));

  const { data: challenges = [], isLoading } = useQuery<OneOnOneChallenge[]>({
    queryKey: ['/api/1on1'],
    queryFn: getQueryFn({ on401: 'throw' }),
    staleTime: 0,
  });

  useEffect(() => {
    if (challenges.length === 0) return;
    const serverNudged = challenges
      .filter(c => c.nudgedTodayByMe)
      .map(c => c.id);
    if (serverNudged.length > 0) {
      setNudgedIds(prev => {
        const next = new Set(prev);
        serverNudged.forEach(id => next.add(id));
        return next;
      });
    }
  }, [challenges]);

  const { data: friendsData } = useQuery<FriendsData>({
    queryKey: ['/api/friends'],
    queryFn: getQueryFn({ on401: 'throw' }),
    staleTime: 60000,
    enabled: createVisible,
  });

  const q = searchQuery.trim().toLowerCase();

  const invites = useMemo(() => challenges.filter(c => c.status === 'pending' && c.challengeeId === userId), [challenges, userId]);
  const outgoing = useMemo(() => challenges.filter(c => c.status === 'pending' && c.challengerId === userId), [challenges, userId]);
  const active = useMemo(() => challenges.filter(c => c.status === 'active'), [challenges]);

  const matchesHabit = (habitName: string): boolean => {
    const habit = HABITS.find(h => h.habitName === habitName);
    if (!habit) return habitName.toLowerCase().includes(q);
    return (
      habit.habitName.toLowerCase().includes(q) ||
      habit.description.toLowerCase().includes(q) ||
      habit.pillar.toLowerCase().includes(q) ||
      habit.timeBlock.toLowerCase().includes(q)
    );
  };

  const filteredInvites = q ? invites.filter(c =>
    matchesHabit(c.habitName) ||
    c.challengerName.toLowerCase().includes(q)
  ) : invites;
  const filteredOutgoing = q ? outgoing.filter(c =>
    matchesHabit(c.habitName) ||
    c.challengeeName.toLowerCase().includes(q)
  ) : outgoing;
  const filteredActive = q ? active.filter(c =>
    matchesHabit(c.habitName) ||
    c.challengerName.toLowerCase().includes(q) ||
    c.challengeeName.toLowerCase().includes(q)
  ) : active;

  const currentInvite = !inviteModalDismissed && filteredInvites.length > inviteModalIdx ? filteredInvites[inviteModalIdx] : null;

  const handleRespond = async (id: string, action: 'accept' | 'reject') => {
    setRespondingId(id);
    try {
      await apiRequest('POST', `/api/1on1/${id}/respond`, { action });
      qc.invalidateQueries({ queryKey: ['/api/1on1'] });
      showToast(action === 'accept' ? t('social.challengeAccepted') : t('social.challengeDeclined'));
      // Advance to the next invite in the modal queue
      setInviteModalIdx(prev => prev + 1);
    } catch (err) {
      showToast(parseApiErr(err));
    } finally {
      setRespondingId(null);
    }
  };

  const handleNudge = async (id: string) => {
    setNudgingId(id);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    try {
      await apiRequest('POST', `/api/1on1/${id}/nudge`, {});
      setNudgedIds(prev => new Set(prev).add(id));
      showToast(t('social.nudgeSent'));
    } catch (err) {
      showToast(parseApiErr(err));
    } finally {
      setNudgingId(null);
    }
  };

  const handleToggleDone = async (id: string, done: boolean) => {
    setCompletingId(id);
    Haptics.selectionAsync();
    try {
      if (done) {
        await apiRequest('DELETE', `/api/1on1/${id}/complete`, undefined);
      } else {
        await apiRequest('POST', `/api/1on1/${id}/complete`, {});
      }
      qc.invalidateQueries({ queryKey: ['/api/1on1'] });
      showToast(done ? t('social.unmarked') : t('social.markedDone'));
    } catch (err) {
      showToast(parseApiErr(err));
    } finally {
      setCompletingId(null);
    }
  };

  const handleLeave1on1 = (c: OneOnOneChallenge) => {
    const isChallenger = c.challengerId === userId;
    const isPending = c.status === 'pending';
    const label = isPending && isChallenger ? t('social.challenge.cancelTitle') : t('social.challenge.leaveTitle');
    const description = isPending && isChallenger
      ? t('social.challenge.cancelMsg', { name: c.habitName })
      : t('social.challenge.leaveMsg', { name: c.habitName, partner: isChallenger ? c.challengeeName : c.challengerName });

    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
    Alert.alert(label, description, [
      { text: t('social.challenge.noBtn'), style: 'cancel' },
      {
        text: isPending && isChallenger ? t('social.challenge.cancelIt') : t('social.challenge.leaveBtn'),
        style: 'destructive',
        onPress: async () => {
          setLeavingId(c.id);
          try {
            await apiRequest('DELETE', `/api/1on1/${c.id}`, undefined);
            qc.invalidateQueries({ queryKey: ['/api/1on1'] });
            showToast(isPending && isChallenger ? t('social.challenge.cancelled') : t('social.challenge.left'));
          } catch (err) {
            showToast(parseApiErr(err));
          } finally {
            setLeavingId(null);
          }
        },
      },
    ]);
  };

  const handleCreate = async () => {
    if (!selectedFriendId || !newHabitName.trim()) return;
    // Validate habit is from the library
    const isLibraryHabit = HABITS.some(h => h.habitName === newHabitName.trim());
    if (!isLibraryHabit) {
      Alert.alert(t('social.selectFromListTitle'), t('social.selectFromListMsg'));
      return;
    }
    // Frontend duplicate guard: same habit already active/pending with this friend
    const dup = challenges.find(c =>
      c.status !== 'rejected' &&
      c.challengeeId === selectedFriendId &&
      c.habitName.trim().toLowerCase() === newHabitName.trim().toLowerCase()
    );
    if (dup) {
      Alert.alert(t('social.duplicateChallengeTitle'), t('social.duplicateChallengeMsg'));
      return;
    }
    // Frontend limit guard: max 5 active/pending with same friend
    const pairCount = challenges.filter(c =>
      c.status !== 'rejected' &&
      (c.challengerId === selectedFriendId || c.challengeeId === selectedFriendId)
    ).length;
    if (pairCount >= 5) {
      Alert.alert(t('social.limitReachedTitle'), t('social.limitReachedMsg'));
      return;
    }
    setCreating(true);
    try {
      await apiRequest('POST', '/api/1on1', { challengeeId: selectedFriendId, habitName: newHabitName.trim() });
      qc.invalidateQueries({ queryKey: ['/api/1on1'] });
      setCreateVisible(false);
      setNewHabitName('');
      setSelectedFriendId(null);
      showToast(t('social.challenge.sent'));
    } catch (err) {
      Alert.alert(t('social.couldNotSend'), parseApiErr(err));
    } finally {
      setCreating(false);
    }
  };

  const closeChallenge1on1Modal = () => {
    setCreateVisible(false);
    setNewHabitName('');
    setSelectedFriendId(null);
  };

  const friends = friendsData?.accepted ?? [];

  return (
    <View style={{ flex: 1 }}>
      {/* Center-screen challenge invite pop-up */}
      {currentInvite && (
        <ChallengeInviteModal
          challenge={currentInvite}
          accepting={respondingId === currentInvite.id}
          onAccept={() => handleRespond(currentInvite.id, 'accept')}
          onReject={() => {
            handleRespond(currentInvite.id, 'reject');
          }}
        />
      )}

      <SearchBar value={searchQuery} onChangeText={setSearchQuery} placeholder={t('social.searchChallenges')} />

      <ScrollView style={{ flex: 1 }} contentContainerStyle={[oneOnSt.scroll, { paddingBottom: 100 }]} showsVerticalScrollIndicator={false}>

        {isLoading ? (
          <ActivityIndicator color={ACCENT} style={{ marginTop: 40 }} />
        ) : filteredActive.length === 0 && filteredOutgoing.length === 0 && filteredInvites.length === 0 ? (
          <View style={oneOnSt.empty}>
            <MaterialIcons name="handshake" size={52} color={ACCENT + '55'} />
            <Text style={[oneOnSt.emptyTitle, { color: ACCENT }]}>{searchQuery.trim() ? t('social.noMatches') : t('social.noChallengesYet')}</Text>
            <Text style={[oneOnSt.emptyText, { color: '#9B9BAA' }]}>
              {searchQuery.trim() ? t('social.tryDifferent') : t('social.challengeDesc')}
            </Text>
          </View>
        ) : (
          <>
            {/* ── Outgoing pending challenges ── */}
            {filteredOutgoing.length > 0 && (
              <>
                <Text style={[oneOnSt.sectionLabel, { color: '#9B9BAA' }]}>{t('social.sentAwaitingReply')}</Text>
                {filteredOutgoing.map(c => (
                  <Pressable
                    key={c.id}
                    onLongPress={() => handleLeave1on1(c)}
                    delayLongPress={400}
                    style={[oneOnSt.outgoingRow, { backgroundColor: C.cardBackground, opacity: leavingId === c.id ? 0.5 : 1 }]}
                  >
                    <MaterialIcons name="schedule" size={16} color={ACCENT} />
                    <Text style={[oneOnSt.outgoingText, { color: C.textPrimary }]} numberOfLines={1}>
                      {getLocalHabitNameByEnglish(c.habitName, language)}
                    </Text>
                    <Text style={[oneOnSt.outgoingPartner, { color: '#9B9BAA' }]}>→ {c.challengeeName}</Text>
                    <Text style={[oneOnSt.outgoingHint, { color: '#9B9BAA' }]}>{t('social.holdToCancel')}</Text>
                  </Pressable>
                ))}
              </>
            )}

            {/* ── Active challenges ── */}
            {filteredActive.length > 0 && (
              <>
                <Text style={[oneOnSt.sectionLabel, { color: '#9B9BAA', marginTop: filteredOutgoing.length > 0 ? 14 : 0 }]}>{t('social.activeChallenges')}</Text>
                <View style={oneOnSt.cardRail}>
                  {filteredActive.map(c => {
                    const iAmChallenger = c.challengerId === userId;
                    const partnerName = iAmChallenger ? c.challengeeName : c.challengerName;
                    const partnerDone = iAmChallenger ? c.challengeeDoneToday : c.challengerDoneToday;
                    const myDone = iAmChallenger ? c.challengerDoneToday : c.challengeeDoneToday;

                    return (
                      <Pressable
                        key={c.id}
                        onLongPress={() => handleLeave1on1(c)}
                        delayLongPress={400}
                        style={[oneOnSt.card, { backgroundColor: C.cardBackground, opacity: leavingId === c.id ? 0.5 : 1 }]}
                      >
                        {/* Partner avatar */}
                        <View style={[oneOnSt.cardAvatar, { backgroundColor: ACCENT + '22' }]}>
                          <Text style={[oneOnSt.cardAvatarText, { color: ACCENT }]}>{partnerName.charAt(0).toUpperCase()}</Text>
                        </View>
                        <Text style={[oneOnSt.cardHabit, { color: C.textPrimary }]} numberOfLines={2}>{getLocalHabitNameByEnglish(c.habitName, language)}</Text>
                        <Text style={[oneOnSt.cardPartner, { color: '#9B9BAA' }]}>vs {partnerName}</Text>

                        {/* Per-member progress chips */}
                        <View style={oneOnSt.progressRow}>
                          <View style={[oneOnSt.progressChip, { backgroundColor: (myDone ? GREEN : '#FFB74D') + '1A' }]}>
                            <MaterialIcons name={myDone ? 'check-circle' : 'radio-button-unchecked'} size={13} color={myDone ? GREEN : '#FFB74D'} />
                            <Text style={[oneOnSt.progressLabel, { color: myDone ? GREEN : '#FFB74D' }]}>{t('social.youLabel')}{myDone ? ' ✓' : ''}</Text>
                          </View>
                          <View style={[oneOnSt.progressChip, { backgroundColor: (partnerDone ? GREEN : '#FFB74D') + '1A' }]}>
                            <MaterialIcons name={partnerDone ? 'check-circle' : 'radio-button-unchecked'} size={13} color={partnerDone ? GREEN : '#FFB74D'} />
                            <Text style={[oneOnSt.progressLabel, { color: partnerDone ? GREEN : '#FFB74D' }]}>{partnerName.split(' ')[0]}{partnerDone ? ' ✓' : ''}</Text>
                          </View>
                        </View>

                        {/* Mark done + Nudge row */}
                        <View style={oneOnSt.actionRow}>
                          <Pressable
                            style={[oneOnSt.doneBtn, { backgroundColor: myDone ? GREEN + '18' : C.border + '40' }]}
                            onPress={() => handleToggleDone(c.id, myDone)}
                            disabled={completingId === c.id}
                          >
                            {completingId === c.id
                              ? <ActivityIndicator size="small" color={myDone ? GREEN : C.accent} />
                              : <>
                                <MaterialIcons name={myDone ? 'check-circle' : 'check-circle-outline'} size={16} color={myDone ? GREEN : C.accent} />
                                <Text style={[oneOnSt.doneBtnLabel, { color: myDone ? GREEN : C.accent }]}>{myDone ? t('social.done') : t('social.markDone')}</Text>
                              </>}
                          </Pressable>

                          {myDone && partnerDone ? (
                            <View style={[oneOnSt.nudgeBtn, { backgroundColor: GREEN + '18' }]}>
                              <MaterialIcons name="check-circle" size={16} color={GREEN} />
                              <Text style={[oneOnSt.nudgeBtnLabel, { color: GREEN }]}>{t('social.bothDone')}</Text>
                            </View>
                          ) : iAmChallenger && !partnerDone ? (
                            // Only the challenge creator can nudge, once per day
                            nudgedIds.has(c.id) ? (
                              <View style={[oneOnSt.nudgeBtn, { backgroundColor: GREEN + '18' }]}>
                                <MaterialIcons name="check-circle" size={16} color={GREEN} />
                                <Text style={[oneOnSt.nudgeBtnLabel, { color: GREEN }]}>{t('social.nudgedDone')}</Text>
                              </View>
                            ) : (
                              <Pressable
                                style={[oneOnSt.nudgeBtn, { backgroundColor: ACCENT + '18' }]}
                                onPress={() => handleNudge(c.id)}
                                disabled={nudgingId === c.id}
                              >
                                {nudgingId === c.id
                                  ? <ActivityIndicator size="small" color={ACCENT} />
                                  : <>
                                    <MaterialIcons name="notifications" size={16} color={ACCENT} />
                                    <Text style={[oneOnSt.nudgeBtnLabel, { color: ACCENT }]}>{t('social.nudgeBtn')}</Text>
                                  </>}
                              </Pressable>
                            )
                          ) : !myDone ? (
                            <View style={[oneOnSt.nudgeBtn, { backgroundColor: C.border + '40' }]}>
                              <MaterialIcons name="hourglass-empty" size={16} color="#9B9BAA" />
                              <Text style={[oneOnSt.nudgeBtnLabel, { color: '#9B9BAA' }]}>{t('social.waitingOnYou')}</Text>
                            </View>
                          ) : (
                            // Challengee sees static label — cannot nudge
                            <View style={[oneOnSt.nudgeBtn, { backgroundColor: C.border + '40' }]}>
                              <MaterialIcons name="schedule" size={16} color="#9B9BAA" />
                              <Text style={[oneOnSt.nudgeBtnLabel, { color: '#9B9BAA' }]}>{t('social.partnerPending')}</Text>
                            </View>
                          )}
                        </View>

                        {/* Long-press hint */}
                        <Text style={[oneOnSt.longPressHint, { color: '#9B9BAA' }]}>{t('social.holdToLeave')}</Text>
                      </Pressable>
                    );
                  })}
                </View>
              </>
            )}
          </>
        )}
      </ScrollView>

      {/* + New FAB */}
      <Pressable
        style={[tabSt.fab, { backgroundColor: ACCENT }]}
        onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium); setCreateVisible(true); }}
      >
        <MaterialIcons name="add" size={26} color="#fff" />
      </Pressable>

      <Toast msg={toastMsg} />

      {/* Create modal */}
      <Modal visible={createVisible} transparent animationType="slide" onRequestClose={closeChallenge1on1Modal}>
        <Pressable style={StyleSheet.absoluteFill} onPress={closeChallenge1on1Modal} />
        <View style={[sheetSt.sheet, { backgroundColor: C.cardBackground }]}>
          <KeyboardAwareScrollViewCompat showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
            <View style={sheetSt.handle} />
            <View style={sheetSt.sheetHeader}>
              <Text style={[sheetSt.title, { color: C.textPrimary, marginBottom: 0 }]}>{t('social.create1on1Title')}</Text>
              <Pressable onPress={closeChallenge1on1Modal} hitSlop={8}>
                <MaterialIcons name="close" size={22} color={C.textTertiary} />
              </Pressable>
            </View>

            <Text style={[sheetSt.label, { color: C.textSecondary }]}>{t('social.habitNameLabel')}</Text>
            <HabitPicker value={newHabitName} onSelect={setNewHabitName} />

            <Text style={[sheetSt.label, { color: C.textSecondary }]}>{t('social.challengeFriendLabel')}</Text>
            {friends.length === 0 ? (
              <Text style={[sheetSt.empty, { color: C.textTertiary }]}>{t('social.noFriendsYet')}</Text>
            ) : (
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 16 }}>
                {friends.map(f => {
                  const sel = selectedFriendId === f.userId;
                  return (
                    <Pressable
                      key={f.userId}
                      style={[sheetSt.friendChip, { borderColor: sel ? ACCENT : C.border }, sel && { backgroundColor: ACCENT + '18' }]}
                      onPress={() => { setSelectedFriendId(f.userId); Haptics.selectionAsync(); }}
                    >
                      <View style={[sheetSt.friendAvatar, { backgroundColor: ACCENT + '22' }]}>
                        <Text style={[sheetSt.friendInitial, { color: ACCENT }]}>{f.name.charAt(0).toUpperCase()}</Text>
                      </View>
                      <Text style={[sheetSt.friendName, { color: C.textPrimary }]} numberOfLines={1}>{f.name}</Text>
                      {sel && <MaterialIcons name="check-circle" size={13} color={ACCENT} />}
                    </Pressable>
                  );
                })}
              </ScrollView>
            )}

            <Pressable
              style={[sheetSt.submitBtn, { backgroundColor: (selectedFriendId && newHabitName.trim()) ? ACCENT : C.border, opacity: creating ? 0.7 : 1, marginBottom: 20 }]}
              onPress={handleCreate}
              disabled={!selectedFriendId || !newHabitName.trim() || creating}
            >
              {creating ? <ActivityIndicator color="#fff" /> : <Text style={sheetSt.submitLabel}>{t('social.sendChallenge')}</Text>}
            </Pressable>
          </KeyboardAwareScrollViewCompat>
        </View>
      </Modal>
    </View>
  );
}

const searchSt = StyleSheet.create({
  wrap: { paddingHorizontal: 16, paddingTop: 6, paddingBottom: 4, position: 'relative', zIndex: 10 },
  bar: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    paddingHorizontal: 12, paddingVertical: 10,
    borderRadius: 14, borderWidth: StyleSheet.hairlineWidth,
  },
  input: { flex: 1, fontSize: 14, fontFamily: 'Inter_400Regular', paddingVertical: 0 },
});

const oneOnSt = StyleSheet.create({
  scroll: { padding: 16 },
  sectionLabel: { fontSize: 11, fontFamily: 'Inter_600SemiBold', letterSpacing: 1, marginBottom: 10 },
  empty: { alignItems: 'center', paddingTop: 60, paddingHorizontal: 24, gap: 12 },
  emptyTitle: { fontSize: 18, fontFamily: 'Inter_600SemiBold' },
  emptyText: { fontSize: 14, fontFamily: 'Inter_400Regular', textAlign: 'center', lineHeight: 20 },
  // Outgoing pending row
  outgoingRow: {
    flexDirection: 'row', alignItems: 'center', gap: 8, padding: 12, borderRadius: 12, marginBottom: 8,
    shadowColor: '#000', shadowOpacity: 0.05, shadowRadius: 4, shadowOffset: { width: 0, height: 1 }, elevation: 1,
  },
  outgoingText: { flex: 1, fontSize: 13, fontFamily: 'Inter_500Medium' },
  outgoingPartner: { fontSize: 12, fontFamily: 'Inter_400Regular' },
  outgoingHint: { fontSize: 10, fontFamily: 'Inter_400Regular', fontStyle: 'italic' },
  // Vertical list
  cardRail: { gap: 10, paddingBottom: 4 },
  card: {
    borderRadius: 16, padding: 16,
    shadowColor: '#000', shadowOpacity: 0.07, shadowRadius: 8, shadowOffset: { width: 0, height: 2 }, elevation: 2,
    gap: 6,
  },
  cardAvatar: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center', marginBottom: 2 },
  cardAvatarText: { fontSize: 18, fontFamily: 'Inter_700Bold' },
  cardHabit: { fontSize: 15, fontFamily: 'Inter_600SemiBold', lineHeight: 20 },
  cardPartner: { fontSize: 12, fontFamily: 'Inter_400Regular' },
  progressRow: { flexDirection: 'row', gap: 6, flexWrap: 'wrap', marginTop: 2 },
  progressChip: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 8, paddingVertical: 3, borderRadius: 20 },
  progressLabel: { fontSize: 11, fontFamily: 'Inter_500Medium' },
  actionRow: { flexDirection: 'row', gap: 8, marginTop: 4 },
  doneBtn: { flexDirection: 'row', alignItems: 'center', gap: 5, paddingVertical: 7, paddingHorizontal: 12, borderRadius: 20, flex: 1, justifyContent: 'center' },
  doneBtnLabel: { fontSize: 12, fontFamily: 'Inter_500Medium' },
  nudgeBtn: { flexDirection: 'row', alignItems: 'center', gap: 5, paddingVertical: 7, paddingHorizontal: 12, borderRadius: 20, flex: 1, justifyContent: 'center' },
  nudgeBtnLabel: { fontSize: 12, fontFamily: 'Inter_500Medium' },
  longPressHint: { fontSize: 10, fontFamily: 'Inter_400Regular', fontStyle: 'italic', alignSelf: 'flex-end', marginTop: 2 },
});

// ─── Group Tab ─────────────────────────────────────────────────────────────────
function GroupTab({ userId }: { userId: string }) {
  const C = useThemeColors();
  const { t } = useTranslation();
  const { language } = useLanguage();
  const qc = useQueryClient();
  const { msg: toastMsg, show: showToast } = useToast();

  const [createVisible, setCreateVisible] = useState(false);
  const [groupName, setGroupName] = useState('');
  const [groupNameError, setGroupNameError] = useState('');
  const [habitInputs, setHabitInputs] = useState<{ id: string; value: string }[]>([{ id: '0', value: '' }]);
  const [habitInputErrors, setHabitInputErrors] = useState<Set<string>>(new Set());
  const [selectedFriendIds, setSelectedFriendIds] = useState<string[]>([]);
  const [creating, setCreating] = useState(false);
  const [respondingId, setRespondingId] = useState<string | null>(null);
  const [nudgingKey, setNudgingKey] = useState<string | null>(null);
  const [nudgingMemberKey, setNudgingMemberKey] = useState<string | null>(null);
  const [nudgedKeys, setNudgedKeys] = useState<Set<string>>(new Set());
  const [togglingKey, setTogglingKey] = useState<string | null>(null);
  const [leavingGroupId, setLeavingGroupId] = useState<string | null>(null);
  const [deletingHabitKey, setDeletingHabitKey] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');

  useFocusEffect(useCallback(() => {
    qc.invalidateQueries({ queryKey: ['/api/coop'] });
  }, [qc]));

  const { data: groups = [], isLoading } = useQuery<CoopGroup[]>({
    queryKey: ['/api/coop'],
    queryFn: getQueryFn({ on401: 'throw' }),
    staleTime: 0,
  });

  // Seed nudgedKeys from server data so buttons stay disabled after navigation.
  // Both group-level and per-habit nudge buttons share the same rate limit,
  // so mark all keys (group + per-habit) disabled when the group was nudged today.
  useEffect(() => {
    if (!groups.length) return;
    setNudgedKeys(prev => {
      const next = new Set(prev);
      for (const g of groups) {
        if (g.nudgedGroupToday) {
          next.add(g.id);
          for (const h of g.habits) next.add(`${g.id}:${h.id}`);
        }
      }
      return next;
    });
  }, [groups]);

  const { data: friendsData } = useQuery<FriendsData>({
    queryKey: ['/api/friends'],
    queryFn: getQueryFn({ on401: 'throw' }),
    staleTime: 60000,
    enabled: createVisible,
  });

  const q = searchQuery.trim().toLowerCase();

  const invites = useMemo(() => groups.filter(g => g.myStatus === 'pending'), [groups]);
  const active = useMemo(() => groups.filter(g => g.myStatus === 'active'), [groups]);

  const matchesHabit = (habitName: string): boolean => {
    const habit = HABITS.find(h => h.habitName === habitName);
    if (!habit) return habitName.toLowerCase().includes(q);
    return (
      habit.habitName.toLowerCase().includes(q) ||
      habit.description.toLowerCase().includes(q) ||
      habit.pillar.toLowerCase().includes(q) ||
      habit.timeBlock.toLowerCase().includes(q)
    );
  };

  const filteredInvites = q ? invites.filter(g =>
    g.name.toLowerCase().includes(q) ||
    g.creatorName.toLowerCase().includes(q) ||
    g.members.some(m => m.name.toLowerCase().includes(q)) ||
    g.habits.some(h => matchesHabit(h.habitName))
  ) : invites;
  const filteredActive = q ? active.filter(g =>
    g.name.toLowerCase().includes(q) ||
    g.creatorName.toLowerCase().includes(q) ||
    g.members.some(m => m.name.toLowerCase().includes(q)) ||
    g.habits.some(h => matchesHabit(h.habitName))
  ) : active;

  const handleRespond = async (id: string, action: 'accept' | 'reject') => {
    setRespondingId(id);
    try {
      await apiRequest('POST', `/api/coop/${id}/respond`, { action });
      qc.invalidateQueries({ queryKey: ['/api/coop'] });
      showToast(action === 'accept' ? t('social.joinedGroup') : t('social.invitationDeclined'));
    } catch (err) {
      showToast(parseApiErr(err));
    } finally {
      setRespondingId(null);
    }
  };

  // key = `${groupId}:${habitId}` for per-habit row nudge, or `${groupId}` for header nudge
  const handleNudge = async (groupId: string, nudgeKey: string) => {
    setNudgingKey(nudgeKey);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    try {
      const res = await apiRequest('POST', `/api/coop/${groupId}/nudge`, {});
      const data = (await res.json()) as { nudgedCount?: number };
      const count = data.nudgedCount ?? 0;
      // Rate limit is per-group-per-day, so disable ALL nudge buttons for this group immediately
      setNudgedKeys(prev => {
        const next = new Set(prev);
        next.add(groupId);
        const grp = groups.find(g => g.id === groupId);
        if (grp) {
          for (const h of grp.habits) next.add(`${groupId}:${h.id}`);
        }
        return next;
      });
      showToast(count > 0 ? t('social.nudgeSentCount', { count }) : t('social.everyoneDone'));
    } catch (err) {
      showToast(parseApiErr(err));
    } finally {
      setNudgingKey(null);
    }
  };

  // Per-member nudge: tap an individual's bell icon
  const handleNudgeMember = async (groupId: string, memberId: string, memberName: string) => {
    const key = `${groupId}:${memberId}`;
    setNudgingMemberKey(key);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    try {
      await apiRequest('POST', `/api/coop/${groupId}/nudge/${memberId}`, {});
      setNudgedKeys(prev => new Set(prev).add(key));
      showToast(t('social.nudgedMember', { name: memberName.split(' ')[0] }));
    } catch (err) {
      showToast(parseApiErr(err));
    } finally {
      setNudgingMemberKey(null);
    }
  };

  // Toggle current user's per-habit completion
  const handleToggleHabit = async (groupId: string, habitId: string, currentlyDone: boolean) => {
    const key = `${groupId}:${habitId}`;
    setTogglingKey(key);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    try {
      if (currentlyDone) {
        await apiRequest('DELETE', `/api/coop/${groupId}/habits/${habitId}/complete`, undefined);
      } else {
        await apiRequest('POST', `/api/coop/${groupId}/habits/${habitId}/complete`, {});
      }
      qc.invalidateQueries({ queryKey: ['/api/coop'] });
      qc.invalidateQueries({ queryKey: ['/api/coop', groupId] });
      qc.invalidateQueries({ queryKey: ['/api/coop', groupId, 'members'] });
    } catch (err) {
      showToast(parseApiErr(err));
    } finally {
      setTogglingKey(null);
    }
  };

  const handleLeaveGroup = (g: CoopGroup) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
    Alert.alert(t('social.group.leaveTitle'), t('social.group.leaveMsg', { name: g.name }), [
      { text: t('social.group.cancelBtn'), style: 'cancel' },
      {
        text: t('social.group.leaveBtn'),
        style: 'destructive',
        onPress: async () => {
          setLeavingGroupId(g.id);
          try {
            await apiRequest('DELETE', `/api/coop/${g.id}`, undefined);
            qc.invalidateQueries({ queryKey: ['/api/coop'] });
            showToast(t('social.group.left'));
          } catch (err) {
            showToast(parseApiErr(err));
          } finally {
            setLeavingGroupId(null);
          }
        },
      },
    ]);
  };

  const handleDeleteHabit = (groupId: string, habitId: string, habitName: string) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
    Alert.alert(
      t('social.removeHabitTitle'),
      t('social.removeHabitMsg', { name: habitName }),
      [
        { text: t('common.cancel'), style: 'cancel' },
        {
          text: t('social.removeHabitBtn'),
          style: 'destructive',
          onPress: async () => {
            const key = `${groupId}:${habitId}`;
            setDeletingHabitKey(key);
            try {
              await apiRequest('DELETE', `/api/coop/${groupId}/habits/${habitId}`, undefined);
              qc.invalidateQueries({ queryKey: ['/api/coop'] });
              showToast(t('social.habitRemovedToast'));
            } catch (err) {
              showToast(parseApiErr(err));
            } finally {
              setDeletingHabitKey(null);
            }
          },
        },
      ]
    );
  };

  const handleCreate = async () => {
    let hasErrors = false;

    // Validate group name
    if (!groupName.trim()) {
      setGroupNameError(t('social.groupNameBlankError'));
      hasErrors = true;
    }

    // Validate each habit input is filled
    const blankIds = new Set(habitInputs.filter(h => !h.value.trim()).map(h => h.id));
    if (blankIds.size > 0) {
      setHabitInputErrors(blankIds);
      hasErrors = true;
    }

    if (hasErrors) return;

    const validHabits = habitInputs.map(h => h.value.trim()).filter(Boolean);
    if (validHabits.length === 0) return;
    if (validHabits.length > GROUP_HABIT_LIMIT) {
      Alert.alert(t('social.tooManyHabitsTitle'), t('social.tooManyHabitsMsg', { limit: GROUP_HABIT_LIMIT }));
      return;
    }
    // Validate all habits are from the library
    const nonLibraryHabit = validHabits.find(h => !HABITS.some(lib => lib.habitName === h));
    if (nonLibraryHabit) {
      Alert.alert(t('social.selectFromListTitle'), t('social.selectFromListMsg'));
      return;
    }
    // Frontend duplicate guard: no duplicate habit names within the group
    const lowerHabits = validHabits.map(h => h.toLowerCase());
    const uniqueHabits = new Set(lowerHabits);
    if (uniqueHabits.size !== lowerHabits.length) {
      Alert.alert(t('social.duplicateHabitsTitle'), t('social.duplicateHabitsMsg'));
      return;
    }
    setCreating(true);
    try {
      await apiRequest('POST', '/api/coop', { name: groupName.trim(), habitNames: validHabits, friendIds: selectedFriendIds });
      qc.invalidateQueries({ queryKey: ['/api/coop'] });
      setCreateVisible(false);
      setGroupName('');
      setGroupNameError('');
      setHabitInputs([{ id: Date.now().toString(), value: '' }]);
      setHabitInputErrors(new Set());
      setSelectedFriendIds([]);
      showToast(t('social.groupCreatedToast'));
    } catch (err: any) {
      const msg = parseApiErr(err);
      if (err?.status === 409 || msg === 'You already have a group with this name.') {
        setGroupNameError(msg);
      } else {
        Alert.alert(t('social.couldNotCreateGroup'), msg);
      }
    } finally {
      setCreating(false);
    }
  };

  const closeCreateModal = () => {
    setCreateVisible(false);
    setGroupName('');
    setGroupNameError('');
    setHabitInputs([{ id: '0', value: '' }]);
    setHabitInputErrors(new Set());
    setSelectedFriendIds([]);
  };

  const toggleFriend = (id: string) => {
    Haptics.selectionAsync();
    setSelectedFriendIds(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);
  };

  const friends = friendsData?.accepted ?? [];

  return (
    <View style={{ flex: 1 }}>
      <SearchBar value={searchQuery} onChangeText={setSearchQuery} placeholder={t('social.searchGroups')} />

      <ScrollView style={{ flex: 1 }} contentContainerStyle={[grpSt.scroll, { paddingBottom: 100 }]} showsVerticalScrollIndicator={false}>
        {/* Pending invites */}
        {filteredInvites.map(g => (
          <InviteBanner
            key={g.id}
            text={t('social.group.inviteText', { creator: g.creatorName, name: g.name })}
            accepting={respondingId === g.id}
            onAccept={() => handleRespond(g.id, 'accept')}
            onReject={() => handleRespond(g.id, 'reject')}
          />
        ))}

        {isLoading ? (
          <ActivityIndicator color={ACCENT} style={{ marginTop: 40 }} />
        ) : filteredActive.length === 0 && filteredInvites.length === 0 ? (
          <View style={grpSt.empty}>
            <MaterialIcons name="groups" size={52} color={ACCENT + '55'} />
            <Text style={[grpSt.emptyTitle, { color: ACCENT }]}>{searchQuery.trim() ? t('social.noMatches') : t('social.noGroupsYet')}</Text>
            <Text style={[grpSt.emptyText, { color: '#9B9BAA' }]}>
              {searchQuery.trim() ? t('social.tryDifferent') : t('social.groupDesc')}
            </Text>
          </View>
        ) : (
          filteredActive.map(g => {
            const activeMembers = g.members.filter(m => m.status === 'active');
            const pendingMembers = g.members.filter(m => m.status === 'pending');
            const hasPendingMembers = pendingMembers.length > 0;
            const isGroupAdmin = userId === g.creatorId;
            const otherActiveMembers = activeMembers.filter(m => m.userId !== userId);
            const canNudgeGroup = isGroupAdmin && otherActiveMembers.length > 0;
            const groupAllDone = !hasPendingMembers && g.habits.length > 0 && g.habits.every(h => {
              const mc = h.memberCompletion ?? [];
              return activeMembers.every(m => mc.find(c => c.userId === m.userId)?.doneToday ?? false);
            });
            const groupNudgeKey = g.id;

            return (
              <View
                key={g.id}
                style={[grpSt.card, { backgroundColor: C.cardBackground, opacity: leavingGroupId === g.id ? 0.5 : 1 }]}
              >
                {/* Group header */}
                <View style={grpSt.cardHeader}>
                  <View style={[grpSt.groupIcon, { backgroundColor: ACCENT + '18' }]}>
                    <MaterialIcons name="groups" size={22} color={ACCENT} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={[grpSt.groupName, { color: C.textPrimary }]} numberOfLines={1}>{g.name}</Text>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 2 }}>
                      <Text style={[grpSt.groupMeta, { color: C.textTertiary }]} numberOfLines={1}>
                        {t('social.byCreator', { name: g.creatorName })}
                      </Text>
                      <View style={[grpSt.ownerBadge, { backgroundColor: ACCENT + '14', borderColor: ACCENT + '35' }]}>
                        <Text style={[grpSt.ownerBadgeText, { color: ACCENT }]}>{t('social.group.owner')}</Text>
                      </View>
                    </View>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 2 }}>
                      <Pressable
                        style={[grpSt.memberCountBadge, { backgroundColor: ACCENT + '14', borderColor: ACCENT + '35' }]}
                        onPress={() => {
                          Haptics.selectionAsync();
                          router.push({ pathname: '/group-members/[id]', params: { id: g.id, type: 'coop', name: g.name, color: ACCENT } } as any);
                        }}
                        hitSlop={6}
                      >
                        <MaterialIcons name="people" size={12} color={ACCENT} />
                        <Text style={[grpSt.memberCountText, { color: ACCENT }]}>
                          {(g.memberCount ?? activeMembers.length)} {t('social.group.members', { count: g.memberCount ?? activeMembers.length })}
                        </Text>
                        <MaterialIcons name="chevron-right" size={11} color={ACCENT + '99'} />
                      </Pressable>
                      <Text style={[grpSt.groupMeta, { color: C.textTertiary }]}>
                        · {g.habits.length} {t('social.group.habits', { count: g.habits.length })}
                      </Text>
                    </View>
                  </View>
                  {/* Group-level nudge — only visible to group admin with other members */}
                  {canNudgeGroup && (
                    groupAllDone ? (
                      <View style={[grpSt.nudgeBtn, { backgroundColor: GREEN + '18' }]}>
                        <MaterialIcons name="check-circle" size={14} color={GREEN} />
                        <Text style={[grpSt.nudgeBtnLabel, { color: GREEN }]}>{t('social.allDone')}</Text>
                      </View>
                    ) : nudgedKeys.has(groupNudgeKey) ? (
                      <View style={[grpSt.nudgeBtn, { backgroundColor: C.border }]}>
                        <MaterialIcons name="notifications-active" size={14} color={C.textTertiary} />
                        <Text style={[grpSt.nudgeBtnLabel, { color: C.textTertiary }]}>{t('social.nudgedLabel')}</Text>
                      </View>
                    ) : (
                      <Pressable
                        style={[grpSt.nudgeBtn, { backgroundColor: ACCENT + '18' }]}
                        onPress={() => handleNudge(g.id, groupNudgeKey)}
                        disabled={nudgingKey === groupNudgeKey}
                      >
                        {nudgingKey === groupNudgeKey
                          ? <ActivityIndicator size="small" color={ACCENT} />
                          : <>
                              <MaterialIcons name="notifications" size={14} color={ACCENT} />
                              <Text style={[grpSt.nudgeBtnLabel, { color: ACCENT }]}>{t('social.remindLabel')}</Text>
                            </>
                        }
                      </Pressable>
                    )
                  )}
                </View>

                {/* ── Per-habit rows with per-member status ── */}
                {g.habits.map((habit, hIdx) => {
                  const mc: HabitMemberCompletion[] = habit.memberCompletion ?? [];
                  const habitNudgeKey = `${g.id}:${habit.id}`;
                  const habitAllDone = !hasPendingMembers && activeMembers.length > 0 && activeMembers.every(m => mc.find(c => c.userId === m.userId)?.doneToday ?? false);
                  const myCompletion = mc.find(c => c.userId === userId);
                  const myDoneForHabit = myCompletion?.doneToday ?? false;
                  const toggleKey = `${g.id}:${habit.id}`;
                  const doneMemberCount = activeMembers.filter(m => mc.find(c => c.userId === m.userId)?.doneToday ?? false).length;

                  return (
                    <View
                      key={habit.id}
                      style={[
                        grpSt.habitRow,
                        hIdx === 0 && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: C.border, marginTop: 8, paddingTop: 10 },
                      ]}
                    >
                      {/* Habit name */}
                      <Text style={[grpSt.habitName, { color: C.textPrimary, textDecorationLine: myDoneForHabit ? 'line-through' : 'none' }]} numberOfLines={2}>
                        {getLocalHabitNameByEnglish(habit.habitName, language)}
                      </Text>

                      {/* X/Y completion badge */}
                      <View style={[grpSt.progressPill, { backgroundColor: habitAllDone ? GREEN + '22' : ACCENT + '18' }]}>
                        <Text style={[grpSt.progressPillText, { color: habitAllDone ? GREEN : ACCENT }]}>
                          {doneMemberCount}/{activeMembers.length}
                        </Text>
                      </View>

                      {/* Own completion checkbox */}
                      <Pressable
                        onPress={() => handleToggleHabit(g.id, habit.id, myDoneForHabit)}
                        disabled={togglingKey === toggleKey}
                        hitSlop={6}
                        style={grpSt.habitCheckbox}
                      >
                        {togglingKey === toggleKey
                          ? <ActivityIndicator size="small" color={ACCENT} />
                          : <MaterialIcons
                              name={myDoneForHabit ? 'check-box' : 'check-box-outline-blank'}
                              size={20}
                              color={myDoneForHabit ? GREEN : ACCENT + '99'}
                            />}
                      </Pressable>

                      {/* Per-habit nudge bell — only visible to group admin with other members */}
                      {canNudgeGroup && (
                        habitAllDone ? (
                          <View style={[grpSt.habitBell, { backgroundColor: GREEN + '12' }]}>
                            <MaterialIcons name="check-circle" size={15} color={GREEN} />
                          </View>
                        ) : nudgedKeys.has(habitNudgeKey) ? (
                          <View style={[grpSt.habitBell, { backgroundColor: ACCENT + '0a' }]}>
                            <MaterialIcons name="notifications-off" size={15} color={ACCENT + '88'} />
                          </View>
                        ) : (
                          <Pressable
                            style={[grpSt.habitBell, { backgroundColor: ACCENT + '12' }]}
                            onPress={() => handleNudge(g.id, habitNudgeKey)}
                            disabled={nudgingKey === habitNudgeKey}
                            hitSlop={6}
                          >
                            {nudgingKey === habitNudgeKey
                              ? <ActivityIndicator size="small" color={ACCENT} />
                              : <MaterialIcons name="notifications" size={15} color={ACCENT} />}
                          </Pressable>
                        )
                      )}

                      {/* Delete habit button — only visible to group owner */}
                      {isGroupAdmin && (
                        deletingHabitKey === `${g.id}:${habit.id}` ? (
                          <ActivityIndicator size="small" color="#EF4444" />
                        ) : (
                          <Pressable
                            style={[grpSt.habitBell, { backgroundColor: '#EF444412' }]}
                            onPress={() => handleDeleteHabit(g.id, habit.id, habit.habitName)}
                            hitSlop={6}
                          >
                            <MaterialIcons name="delete-outline" size={15} color="#EF4444" />
                          </Pressable>
                        )
                      )}
                    </View>
                  );
                })}

                {/* ── Group Overview footer ── */}
                {g.habits.length > 0 && (
                  <View style={[grpSt.overviewRow, { borderTopColor: C.border }]}>
                    {(() => {
                      const fullyDoneCount = activeMembers.filter(m =>
                        g.habits.every(h => {
                          const mc = h.memberCompletion ?? [];
                          return mc.find(c => c.userId === m.userId)?.doneToday ?? false;
                        })
                      ).length;
                      return (
                        <View style={grpSt.overviewLeft}>
                          <MaterialIcons
                            name={fullyDoneCount === activeMembers.length ? 'check-circle' : 'radio-button-unchecked'}
                            size={13}
                            color={fullyDoneCount === activeMembers.length ? GREEN : '#9B9BAA'}
                          />
                          <Text style={[grpSt.overviewText, { color: C.textSecondary }]}>
                            {t('social.group.fullyDoneToday', { done: fullyDoneCount, total: activeMembers.length })}
                          </Text>
                        </View>
                      );
                    })()}
                    <Pressable
                      style={grpSt.viewMembersBtn}
                      onPress={() => {
                        Haptics.selectionAsync();
                        router.push({ pathname: '/group-members/[id]', params: { id: g.id, type: 'coop', name: g.name, color: ACCENT } } as any);
                      }}
                      hitSlop={6}
                    >
                      <Text style={[grpSt.viewMembersText, { color: ACCENT }]}>{t('social.group.viewMembers')}</Text>
                    </Pressable>
                  </View>
                )}

                {/* Leave / Manage row */}
                <View style={[grpSt.manageRow, { borderTopColor: C.border }]}>
                  <Pressable
                    style={[grpSt.leaveBtn, { borderColor: '#EF444430' }]}
                    onPress={() => handleLeaveGroup(g)}
                    disabled={leavingGroupId === g.id}
                  >
                    {leavingGroupId === g.id
                      ? <ActivityIndicator size="small" color="#EF4444" />
                      : <>
                          <MaterialIcons name="exit-to-app" size={14} color="#EF4444" />
                          <Text style={[grpSt.leaveBtnText, { color: '#EF4444' }]}>
                            {t('social.leaveGroupBtn')}
                          </Text>
                        </>
                    }
                  </Pressable>
                </View>
              </View>
            );
          })
        )}
      </ScrollView>

      {/* + New COOP FAB */}
      <Pressable
        style={[tabSt.fab, { backgroundColor: ACCENT }]}
        onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium); setCreateVisible(true); }}
      >
        <MaterialIcons name="add" size={26} color="#fff" />
      </Pressable>

      <Toast msg={toastMsg} />

      {/* Create COOP modal */}
      <Modal visible={createVisible} transparent animationType="slide" onRequestClose={closeCreateModal}>
        <Pressable style={StyleSheet.absoluteFill} onPress={closeCreateModal} />
        <View style={[sheetSt.sheet, { backgroundColor: C.cardBackground }]}>
          <KeyboardAwareScrollViewCompat showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
            <View style={sheetSt.handle} />
            <View style={sheetSt.sheetHeader}>
              <Text style={[sheetSt.title, { color: C.textPrimary, marginBottom: 0 }]}>{t('social.group.createTitle')}</Text>
              <Pressable onPress={closeCreateModal} hitSlop={8}>
                <MaterialIcons name="close" size={22} color={C.textTertiary} />
              </Pressable>
            </View>

            <Text style={[sheetSt.label, { color: C.textSecondary }]}>{t('social.group.nameLabel')}</Text>
            <TextInput
              style={[sheetSt.input, { borderColor: groupNameError ? '#E05252' : C.border, backgroundColor: C.background, color: C.textPrimary }]}
              placeholder={t('social.group.namePlaceholder')}
              placeholderTextColor={C.textTertiary}
              value={groupName}
              onChangeText={v => { setGroupName(v); if (groupNameError) setGroupNameError(''); }}
              maxLength={100}
            />
            {!!groupNameError && (
              <Text style={{ color: '#E05252', fontSize: 13, marginTop: 4, marginBottom: 2 }}>{groupNameError}</Text>
            )}

            <Text style={[sheetSt.label, { color: C.textSecondary }]}>{t('social.group.habitsLabel', { limit: GROUP_HABIT_LIMIT })}</Text>
            {habitInputs.map((item, index) => (
              <View key={item.id} style={{ marginBottom: 8, zIndex: habitInputs.length - index }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                  <View style={{ flex: 1 }}>
                    <HabitPicker
                      value={item.value}
                      hasError={habitInputErrors.has(item.id)}
                      onSelect={v => {
                        setHabitInputs(prev => prev.map(h => h.id === item.id ? { ...h, value: v } : h));
                        if (v.trim()) setHabitInputErrors(prev => { const next = new Set(prev); next.delete(item.id); return next; });
                      }}
                    />
                  </View>
                  {habitInputs.length > 1 && (
                    <Pressable onPress={() => {
                      setHabitInputs(prev => prev.filter(h => h.id !== item.id));
                      setHabitInputErrors(prev => { const next = new Set(prev); next.delete(item.id); return next; });
                    }}>
                      <MaterialIcons name="remove-circle-outline" size={22} color={C.textTertiary} />
                    </Pressable>
                  )}
                </View>
                {habitInputErrors.has(item.id) && (
                  <Text style={{ color: '#E05252', fontSize: 12, marginTop: 3 }}>{t('social.selectHabitFirst')}</Text>
                )}
              </View>
            ))}
            {habitInputs.length < GROUP_HABIT_LIMIT && (
              <Pressable
                style={[sheetSt.addHabitBtn, { borderColor: ACCENT + '55' }]}
                onPress={() => setHabitInputs(prev => [...prev, { id: Date.now().toString() + Math.random().toString(36).slice(2, 7), value: '' }])}
              >
                <MaterialIcons name="add" size={16} color={ACCENT} />
                <Text style={[sheetSt.addHabitLabel, { color: ACCENT }]}>{t('social.group.addHabit')}</Text>
              </Pressable>
            )}

            <Text style={[sheetSt.label, { color: C.textSecondary, marginTop: 8 }]}>{t('social.group.inviteFriendsLabel')}</Text>
            {friends.length === 0 ? (
              <Text style={[sheetSt.empty, { color: C.textTertiary }]}>{t('social.group.noFriendsFirst')}</Text>
            ) : (
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 16 }}>
                {friends.map(f => {
                  const sel = selectedFriendIds.includes(f.userId);
                  return (
                    <Pressable
                      key={f.userId}
                      style={[sheetSt.friendChip, { borderColor: sel ? ACCENT : C.border }, sel && { backgroundColor: ACCENT + '18' }]}
                      onPress={() => toggleFriend(f.userId)}
                    >
                      <View style={[sheetSt.friendAvatar, { backgroundColor: ACCENT + '22' }]}>
                        <Text style={[sheetSt.friendInitial, { color: ACCENT }]}>{f.name.charAt(0).toUpperCase()}</Text>
                      </View>
                      <Text style={[sheetSt.friendName, { color: C.textPrimary }]} numberOfLines={1}>{f.name}</Text>
                      {sel && <MaterialIcons name="check-circle" size={13} color={ACCENT} />}
                    </Pressable>
                  );
                })}
              </ScrollView>
            )}

            <Pressable
              style={[sheetSt.submitBtn, { backgroundColor: ACCENT, opacity: creating ? 0.7 : 1, marginBottom: 20 }]}
              onPress={handleCreate}
              disabled={creating}
            >
              {creating ? <ActivityIndicator color="#fff" /> : <Text style={sheetSt.submitLabel}>{t('social.group.createBtn')}</Text>}
            </Pressable>
          </KeyboardAwareScrollViewCompat>
        </View>
      </Modal>
    </View>
  );
}

// ─── Shared tab styles ────────────────────────────────────────────────────────
const tabSt = StyleSheet.create({
  fab: {
    position: 'absolute', right: 20, bottom: 20,
    width: 52, height: 52, borderRadius: 26,
    alignItems: 'center', justifyContent: 'center',
    shadowColor: ACCENT, shadowOpacity: 0.4, shadowRadius: 10, shadowOffset: { width: 0, height: 4 }, elevation: 6,
  },
});

const grpSt = StyleSheet.create({
  scroll: { padding: 16 },
  empty: { alignItems: 'center', paddingTop: 60, paddingHorizontal: 24, gap: 12 },
  emptyTitle: { fontSize: 18, fontFamily: 'Inter_600SemiBold' },
  emptyText: { fontSize: 14, fontFamily: 'Inter_400Regular', textAlign: 'center', lineHeight: 20 },
  card: {
    borderRadius: 16, padding: 14, marginBottom: 12,
    shadowColor: '#000', shadowOpacity: 0.06, shadowRadius: 8, shadowOffset: { width: 0, height: 2 }, elevation: 2,
  },
  cardHeader: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  groupIcon: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
  groupName: { fontSize: 15, fontFamily: 'Inter_600SemiBold' },
  groupMeta: { fontSize: 12, fontFamily: 'Inter_400Regular' },
  ownerBadge: {
    flexDirection: 'row', alignItems: 'center', gap: 3,
    paddingHorizontal: 6, paddingVertical: 1.5, borderRadius: 12, borderWidth: 1,
  },
  ownerBadgeText: { fontSize: 10, fontFamily: 'Inter_600SemiBold' },
  memberCountBadge: {
    flexDirection: 'row', alignItems: 'center', gap: 3,
    paddingHorizontal: 8, paddingVertical: 3, borderRadius: 20, borderWidth: 1,
  },
  memberCountText: { fontSize: 11, fontFamily: 'Inter_600SemiBold' },
  nudgeBtn: { flexDirection: 'row', alignItems: 'center', gap: 5, paddingVertical: 7, paddingHorizontal: 12, borderRadius: 20, justifyContent: 'center' },
  nudgeBtnLabel: { fontSize: 11, fontFamily: 'Inter_600SemiBold' },
  // Per-habit rows
  habitRow: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingVertical: 5 },
  habitCheckbox: { flexShrink: 0 },
  habitName: { flex: 1, fontSize: 13, fontFamily: 'Inter_400Regular', lineHeight: 17 },
  progressPill: { flexShrink: 0, borderRadius: 8, paddingHorizontal: 6, paddingVertical: 2 },
  progressPillText: { fontSize: 11, fontFamily: 'Inter_600SemiBold' },
  habitBell: { width: 28, height: 28, borderRadius: 14, alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  manageRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-end',
    marginTop: 8, paddingTop: 8, borderTopWidth: StyleSheet.hairlineWidth,
  },
  leaveBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    paddingHorizontal: 10, paddingVertical: 5,
    borderRadius: 20, borderWidth: 1,
  },
  leaveBtnText: { fontSize: 12, fontFamily: 'Inter_500Medium' },
  overviewRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    marginTop: 10, paddingTop: 8, borderTopWidth: StyleSheet.hairlineWidth,
  },
  overviewLeft: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  overviewText: { fontSize: 11, fontFamily: 'Inter_400Regular' },
  viewMembersBtn: { paddingHorizontal: 2 },
  viewMembersText: { fontSize: 12, fontFamily: 'Inter_600SemiBold' },
});

// ─── Main Screen ──────────────────────────────────────────────────────────────
export default function SocialScreen() {
  const insets = useSafeAreaInsets();
  const topInset = Platform.OS === 'web' ? 67 : insets.top;
  const C = useThemeColors();
  const { t } = useTranslation();
  const { user } = useAuth();
  const { tab: tabParam } = useLocalSearchParams<{ tab?: string }>();
  const [tab, setTab] = useState<'1on1' | 'group'>('1on1');

  // Switch to the tab requested via navigation params (e.g. from notification center)
  useEffect(() => {
    if (tabParam === 'group' || tabParam === '1on1') {
      setTab(tabParam);
    }
  }, [tabParam]);
  const [friendsVisible, setFriendsVisible] = useState(false);

  const { data: friendsData } = useQuery<FriendsData>({
    queryKey: ['/api/friends'],
    queryFn: getQueryFn({ on401: 'throw' }),
    staleTime: 60000,
  });

  const pendingCount = friendsData?.pending?.length ?? 0;

  return (
    <View style={[s.container, { backgroundColor: C.background }]}>
      {/* ── Header ── */}
      <View style={[s.header, { paddingTop: topInset + 8 }]}>
        <View style={s.backBtn} />
        <Text style={[s.headerTitle, { color: C.textPrimary }]}>{t('social.screenTitle')}</Text>
        <Pressable
          style={[s.friendsBtn, { backgroundColor: C.cardBackground, borderColor: C.border }]}
          onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); setFriendsVisible(true); }}
        >
          <MaterialIcons name="person-add" size={20} color={C.textPrimary} />
          {pendingCount > 0 && (
            <View style={s.badge}>
              <Text style={s.badgeText}>{pendingCount > 99 ? '99+' : pendingCount}</Text>
            </View>
          )}
        </Pressable>
      </View>

      {/* ── Top tab bar ── */}
      <View style={[s.tabBar, { backgroundColor: C.cardBackground, borderBottomColor: C.border }]}>
        {(['1on1', 'group'] as const).map(tabKey => (
          <Pressable
            key={tabKey}
            style={[s.tabBtn, tab === tabKey && { borderBottomColor: ACCENT, borderBottomWidth: 2.5 }]}
            onPress={() => { setTab(tabKey); Haptics.selectionAsync(); }}
          >
            <Text style={[s.tabText, { color: tab === tabKey ? ACCENT : C.textTertiary }]}>
              {tabKey === '1on1' ? t('social.tab1on1') : t('social.tabGroup')}
            </Text>
          </Pressable>
        ))}
      </View>

      {/* ── Tab content ── */}
      <View style={{ flex: 1 }}>
        {tab === '1on1' ? (
          <OneOnOneTab userId={user?.id ?? ''} />
        ) : (
          <GroupTab userId={user?.id ?? ''} />
        )}
      </View>

      {/* Friends / Network sheet */}
      <SocialHubModal visible={friendsVisible} onClose={() => setFriendsVisible(false)} />
    </View>
  );
}

const s = StyleSheet.create({
  container: { flex: 1 },
  header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingBottom: 12 },
  backBtn: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
  headerTitle: { flex: 1, fontSize: 20, fontFamily: 'Inter_700Bold', marginLeft: 4 },
  friendsBtn: {
    width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center',
    borderWidth: StyleSheet.hairlineWidth,
    position: 'relative',
  },
  badge: {
    position: 'absolute',
    top: -5,
    right: -5,
    backgroundColor: '#FF3B30',
    minWidth: 18,
    height: 18,
    borderRadius: 9,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 4,
    borderWidth: 2,
    borderColor: '#FAF8F5',
  },
  badgeText: {
    color: '#fff',
    fontSize: 10,
    fontFamily: 'Inter_700Bold',
    lineHeight: 14,
  },
  tabBar: { flexDirection: 'row', borderBottomWidth: StyleSheet.hairlineWidth },
  tabBtn: { flex: 1, paddingVertical: 14, alignItems: 'center' },
  tabText: { fontSize: 14, fontFamily: 'Inter_600SemiBold' },
});
