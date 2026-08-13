import React, { useState, useRef, useMemo, useCallback, useEffect } from 'react';
import {
  View, Text, StyleSheet, FlatList, TextInput, Pressable,
  ActivityIndicator, RefreshControl, Platform, Image, Modal, Alert,
  ScrollView, KeyboardAvoidingView,
} from 'react-native';
import { useLocalSearchParams, router } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { MaterialIcons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { useInfiniteQuery, useQuery, useQueryClient } from '@tanstack/react-query';

import { useThemeColors } from '@/context/ThemeContext';
import { useAuth } from '@/context/AuthContext';
import { useLanguage } from '@/context/LanguageContext';
import { apiRequest, getQueryFn } from '@/lib/query-client';
import { GROUP_HABIT_LIMIT } from '@/shared/appConfig';
import { getLocalHabitNameByEnglish } from '@/data/habitsData';

type Friend = { friendshipId: string; userId: string; name: string; createdAt: string };
type FriendsData = { accepted: Friend[]; pending: Friend[] };

// ─── Types ────────────────────────────────────────────────────────────────────
type HabitMemberCompletion = { userId: string; doneToday: boolean };
type CoopHabit = { id: string; habitName: string; memberCompletion: HabitMemberCompletion[] };
type CoopGroupMember = { userId: string; status: string };
type CoopGroupData = { id: string; name: string; members: CoopGroupMember[]; habits: CoopHabit[] };

type CoopMemberRow = {
  userId: string;
  name: string;
  avatarUrl: string;
  role: 'owner' | 'member';
  joinedAt: string;
  completedToday: number;
  totalHabits: number;
  status: string;
};

type CommunityMemberRow = {
  id: string;
  userId: string;
  name: string;
  avatarUrl: string;
  role: 'owner' | 'member';
  joinedAt: string;
  status: string;
};

type MemberRow = CoopMemberRow | CommunityMemberRow;

type PagedResponse = {
  members: MemberRow[];
  total: number;
  page: number;
  pageSize: number;
  hasMore: boolean;
  nudgedMemberIds?: string[];
};

// ─── Helpers ──────────────────────────────────────────────────────────────────
const ACCENT = '#9B7DD4';
const GREEN = '#56C596';
const PILLAR_COLORS: Record<string, string> = {
  Mental: '#5B8DEF',
  Physical: '#56C596',
  Social: '#F2836B',
  Spiritual: '#9B7DD4',
};

type UserHabit = { habitId: string; habitName: string; pillar: string; timeBlock: string };

function formatDate(iso: string): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '';
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
}

// ─── Skeleton row ─────────────────────────────────────────────────────────────
function SkeletonRow({ C }: { C: ReturnType<typeof useThemeColors> }) {
  return (
    <View style={[sk.row, { backgroundColor: C.cardBackground, borderColor: C.border }]}>
      <View style={[sk.avatar, { backgroundColor: C.border }]} />
      <View style={{ flex: 1, gap: 6 }}>
        <View style={[sk.line, { width: '55%', backgroundColor: C.border }]} />
        <View style={[sk.line, { width: '35%', backgroundColor: C.border }]} />
        <View style={[sk.bar, { backgroundColor: C.border }]} />
      </View>
    </View>
  );
}
const sk = StyleSheet.create({
  row: { flexDirection: 'row', gap: 12, padding: 14, borderRadius: 14, borderWidth: StyleSheet.hairlineWidth, marginBottom: 8 },
  avatar: { width: 44, height: 44, borderRadius: 22 },
  line: { height: 11, borderRadius: 6 },
  bar: { height: 7, borderRadius: 4, width: '75%' },
});

// ─── Progress Bar ─────────────────────────────────────────────────────────────
function ProgressBar({ completed, total, color }: { completed: number; total: number; color: string }) {
  const pct = total > 0 ? Math.min(1, completed / total) : 0;
  return (
    <View style={pb.track}>
      <View style={[pb.fill, { width: `${Math.round(pct * 100)}%`, backgroundColor: color }]} />
    </View>
  );
}
const pb = StyleSheet.create({
  track: { height: 6, borderRadius: 3, backgroundColor: '#E5E7EB', overflow: 'hidden' },
  fill: { height: 6, borderRadius: 3 },
});

// ─── Group Habits Panel ───────────────────────────────────────────────────────
function GroupHabitsPanel({
  habits,
  activeMemberCount,
  color,
  C,
  language,
}: {
  habits: CoopHabit[];
  activeMemberCount: number;
  color: string;
  C: ReturnType<typeof useThemeColors>;
  language: string;
}) {
  if (habits.length === 0) return null;
  return (
    <View style={hp.wrap}>
      <Text style={[hp.sectionLabel, { color: C.textTertiary }]}>GROUP HABITS</Text>
      {habits.map((habit, idx) => {
        const mc = habit.memberCompletion ?? [];
        const done = mc.filter(c => c.doneToday).length;
        const total = activeMemberCount;
        const allDone = total > 0 && done >= total;
        const someDone = done > 0 && !allDone;
        const pillColor = allDone ? GREEN : someDone ? '#F59E0B' : C.textTertiary;
        const pillBg = allDone ? GREEN + '22' : someDone ? '#F59E0B18' : C.border;
        return (
          <View
            key={habit.id}
            style={[
              hp.row,
              idx === 0 && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: C.border, marginTop: 6, paddingTop: 10 },
            ]}
          >
            <MaterialIcons
              name={allDone ? 'check-circle' : 'radio-button-unchecked'}
              size={14}
              color={pillColor}
              style={{ marginTop: 1 }}
            />
            <Text style={[hp.habitName, { color: C.textPrimary }]} numberOfLines={1}>
              {getLocalHabitNameByEnglish(habit.habitName, language)}
            </Text>
            <View style={[hp.pill, { backgroundColor: pillBg }]}>
              <Text style={[hp.pillText, { color: pillColor }]}>{done}/{total}</Text>
            </View>
          </View>
        );
      })}
    </View>
  );
}
const hp = StyleSheet.create({
  wrap: { marginBottom: 12 },
  sectionLabel: { fontSize: 10, fontFamily: 'Inter_600SemiBold', letterSpacing: 0.8, marginBottom: 4 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingVertical: 6 },
  habitName: { flex: 1, fontSize: 13, fontFamily: 'Inter_500Medium' },
  pill: {
    paddingHorizontal: 8, paddingVertical: 3,
    borderRadius: 20, flexShrink: 0,
  },
  pillText: { fontSize: 11, fontFamily: 'Inter_600SemiBold' },
});

// ─── Avatar ───────────────────────────────────────────────────────────────────
function MemberAvatar({ name, avatarUrl, color }: { name: string; avatarUrl: string; color: string }) {
  const [imgErr, setImgErr] = useState(false);
  const initial = (name || 'M').charAt(0).toUpperCase();
  if (avatarUrl && !imgErr) {
    return (
      <Image
        source={{ uri: avatarUrl }}
        style={[av.img, { borderColor: color + '40' }]}
        onError={() => setImgErr(true)}
      />
    );
  }
  return (
    <View style={[av.fallback, { backgroundColor: color + '22', borderColor: color + '40' }]}>
      <Text style={[av.initial, { color }]}>{initial}</Text>
    </View>
  );
}
const av = StyleSheet.create({
  img: { width: 44, height: 44, borderRadius: 22, borderWidth: 1.5 },
  fallback: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center', borderWidth: 1.5 },
  initial: { fontSize: 17, fontFamily: 'Inter_700Bold' },
});

// ─── COOP Member Row ──────────────────────────────────────────────────────────
type NudgeProps = { canNudge?: boolean; nudged?: boolean; nudging?: boolean; onNudge?: () => void };
type RemoveProps = { canRemove?: boolean; removing?: boolean; onRemove?: () => void };

function CoopMemberCard({ member, color, C, canNudge, nudged, nudging, onNudge, canRemove, removing, onRemove }: { member: CoopMemberRow; color: string; C: ReturnType<typeof useThemeColors> } & NudgeProps & RemoveProps) {
  const total = member.totalHabits;
  const done = member.completedToday;
  const pct = total > 0 ? Math.round((done / total) * 100) : 0;
  const isComplete = total > 0 && done >= total;
  const statusColor = isComplete ? GREEN : done > 0 ? '#F59E0B' : C.textTertiary;
  const showNudge = canNudge && member.status !== 'pending' && !isComplete;

  return (
    <View style={[s.memberCard, { backgroundColor: C.cardBackground, borderColor: C.border }]}>
      <MemberAvatar name={member.name} avatarUrl={member.avatarUrl} color={color} />
      <View style={{ flex: 1, gap: 4 }}>
        <View style={s.nameRow}>
          <Text style={[s.memberName, { color: C.textPrimary }]} numberOfLines={1}>{member.name}</Text>
          {member.role === 'owner' && (
            <View style={[s.rolePill, { backgroundColor: ACCENT + '18', borderColor: ACCENT + '40' }]}>
              <Text style={[s.rolePillText, { color: ACCENT }]}>Owner</Text>
            </View>
          )}
          {member.status === 'pending' && (
            <View style={[s.rolePill, { backgroundColor: '#F59E0B18', borderColor: '#F59E0B40' }]}>
              <Text style={[s.rolePillText, { color: '#F59E0B' }]}>Invited</Text>
            </View>
          )}
        </View>
        {member.status === 'pending' ? (
          <Text style={[s.progressLabel, { color: C.textTertiary }]}>Waiting to accept invite</Text>
        ) : total > 0 ? (
          <>
            <View style={s.progressRow}>
              <MaterialIcons
                name={isComplete ? 'check-circle' : 'radio-button-unchecked'}
                size={13}
                color={statusColor}
              />
              <Text style={[s.progressLabel, { color: statusColor }]}>
                {done} of {total} Done · {pct}%
              </Text>
            </View>
            <ProgressBar completed={done} total={total} color={statusColor} />
          </>
        ) : (
          <Text style={[s.progressLabel, { color: C.textTertiary }]}>No habits assigned</Text>
        )}
      </View>
      {showNudge && (
        nudged ? (
          <View style={[s.nudgeBtn, { backgroundColor: C.border }]}>
            <MaterialIcons name="notifications-active" size={14} color={C.textTertiary} />
            <Text style={[s.nudgeBtnLabel, { color: C.textTertiary }]}>Nudged</Text>
          </View>
        ) : (
          <Pressable
            style={[s.nudgeBtn, { backgroundColor: ACCENT + '18' }]}
            onPress={onNudge}
            disabled={nudging}
          >
            {nudging
              ? <ActivityIndicator size="small" color={ACCENT} />
              : <>
                  <MaterialIcons name="notifications" size={14} color={ACCENT} />
                  <Text style={[s.nudgeBtnLabel, { color: ACCENT }]}>Remind</Text>
                </>
            }
          </Pressable>
        )
      )}
      {canRemove && (
        removing ? (
          <ActivityIndicator size="small" color="#EF4444" />
        ) : (
          <Pressable
            style={[s.nudgeBtn, { backgroundColor: '#EF444412' }]}
            onPress={onRemove}
          >
            <MaterialIcons name="person-remove" size={14} color="#EF4444" />
            <Text style={[s.nudgeBtnLabel, { color: '#EF4444' }]}>Remove</Text>
          </Pressable>
        )
      )}
    </View>
  );
}

// ─── Community Member Row ─────────────────────────────────────────────────────
function CommunityMemberCard({ member, color, C }: { member: CommunityMemberRow; color: string; C: ReturnType<typeof useThemeColors> }) {
  return (
    <View style={[s.memberCard, { backgroundColor: C.cardBackground, borderColor: C.border }]}>
      <MemberAvatar name={member.name} avatarUrl={member.avatarUrl} color={color} />
      <View style={{ flex: 1, gap: 4 }}>
        <View style={s.nameRow}>
          <Text style={[s.memberName, { color: C.textPrimary }]} numberOfLines={1}>{member.name}</Text>
          {member.role === 'owner' && (
            <View style={[s.rolePill, { backgroundColor: ACCENT + '18', borderColor: ACCENT + '40' }]}>
              <Text style={[s.rolePillText, { color: ACCENT }]}>Owner</Text>
            </View>
          )}
        </View>
        {member.joinedAt && (
          <Text style={[s.joinDate, { color: C.textTertiary }]}>Joined {formatDate(member.joinedAt)}</Text>
        )}
      </View>
    </View>
  );
}

// ─── Main Screen ──────────────────────────────────────────────────────────────
export default function GroupMembersScreen() {
  const { id, type, name, color: colorParam } = useLocalSearchParams<{
    id: string;
    type: 'coop' | 'community';
    name: string;
    color: string;
  }>();

  const C = useThemeColors();
  const { user } = useAuth();
  const { language } = useLanguage();
  const insets = useSafeAreaInsets();
  const topInset = Platform.OS === 'web' ? 67 : insets.top;
  const botInset = Platform.OS === 'web' ? 34 : insets.bottom;

  const accentColor = colorParam || ACCENT;
  const groupType = type || 'coop';

  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const qc = useQueryClient();
  const [inviteVisible, setInviteVisible] = useState(false);
  const [addHabitVisible, setAddHabitVisible] = useState(false);
  const [newHabitName, setNewHabitName] = useState('');
  const [inviting, setInviting] = useState<string | null>(null);
  const [addingHabit, setAddingHabit] = useState(false);
  const [nudgingMember, setNudgingMember] = useState<string | null>(null);
  const [nudgedMembers, setNudgedMembers] = useState<Set<string>>(new Set());
  const [removingMember, setRemovingMember] = useState<string | null>(null);

  // ── React Query: infinite pages, 30-second live poll ──────────────────────
  const baseKey = groupType === 'coop'
    ? ['/api/coop', id, 'members', debouncedSearch]
    : ['/api/communities', id, 'members', debouncedSearch];

  const membersQuery = useInfiniteQuery<PagedResponse, Error>({
    queryKey: baseKey,
    queryFn: async ({ pageParam = 1 }) => {
      const page = pageParam as number;
      const endpoint = groupType === 'coop'
        ? `/api/coop/${id}/members?page=${page}&search=${encodeURIComponent(debouncedSearch)}`
        : `/api/communities/${id}/members?page=${page}&search=${encodeURIComponent(debouncedSearch)}`;
      const res = await apiRequest('GET', endpoint);
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        const code = res.status;
        if (code === 403) throw Object.assign(new Error('403: Not a member of this group'), { status: 403 });
        throw new Error(`${code}: ${(body as { error?: string }).error ?? 'Failed to load'}`);
      }
      return res.json() as Promise<PagedResponse>;
    },
    getNextPageParam: (lastPage) => lastPage.hasMore ? lastPage.page + 1 : undefined,
    initialPageParam: 1,
    refetchInterval: 30_000,
    enabled: !!id,
    staleTime: 20_000,
  });

  // Flatten pages into a single list
  const members: MemberRow[] = useMemo(
    () => membersQuery.data?.pages.flatMap(p => p.members) ?? [],
    [membersQuery.data]
  );
  const total = membersQuery.data?.pages[0]?.total ?? 0;

  // Seed nudgedMembers from server data so buttons stay disabled after navigation
  useEffect(() => {
    const ids = membersQuery.data?.pages[0]?.nudgedMemberIds;
    if (!ids?.length) return;
    setNudgedMembers(prev => {
      const next = new Set(prev);
      for (const id of ids) next.add(id);
      return next;
    });
  }, [membersQuery.data?.pages]);
  const hasMore = membersQuery.data?.pages.at(-1)?.hasMore ?? false;

  // Current user is owner if their member row has role === 'owner'
  const isOwner = useMemo(
    () => members.some(m => m.userId === user?.id && m.role === 'owner'),
    [members, user?.id]
  );

  const loading = membersQuery.isLoading;
  const refreshing = membersQuery.isRefetching && !membersQuery.isFetchingNextPage;
  const loadingMore = membersQuery.isFetchingNextPage;

  const errorMsg = useMemo(() => {
    if (!membersQuery.error) return '';
    const msg = (membersQuery.error as Error).message ?? '';
    if (msg.startsWith('403')) return "You're not a member of this group.";
    return 'Could not load members. Pull down to retry.';
  }, [membersQuery.error]);

  const is403 = useMemo(() => {
    const msg = (membersQuery.error as Error | null)?.message ?? '';
    return msg.startsWith('403');
  }, [membersQuery.error]);

  const handleSearch = (text: string) => {
    setSearch(text);
    if (searchTimer.current) clearTimeout(searchTimer.current);
    searchTimer.current = setTimeout(() => setDebouncedSearch(text), 350);
  };

  const handleRefresh = useCallback(() => {
    Haptics.selectionAsync();
    membersQuery.refetch();
  }, [membersQuery]);

  const handleLoadMore = useCallback(() => {
    if (!hasMore || loadingMore || loading) return;
    membersQuery.fetchNextPage();
  }, [hasMore, loadingMore, loading, membersQuery]);

  // ── Group data (habits with per-member completion) — COOP only ───────────
  const { data: coopGroups } = useQuery<CoopGroupData[]>({
    queryKey: ['/api/coop'],
    queryFn: getQueryFn({ on401: 'throw' }),
    staleTime: 20_000,
    refetchInterval: 30_000,
    enabled: groupType === 'coop' && !!id,
  });
  const currentGroup = useMemo(
    () => coopGroups?.find(g => g.id === id) ?? null,
    [coopGroups, id]
  );
  const groupHabits: CoopHabit[] = useMemo(
    () => currentGroup?.habits ?? [],
    [currentGroup]
  );
  // Derive from the full group member list (not the paginated/search-filtered list)
  // so the X/Y denominator is always accurate regardless of scroll position or search query.
  const activeMemberCount = useMemo(
    () => currentGroup?.members.filter(m => m.status !== 'pending').length ?? 0,
    [currentGroup]
  );

  // ── User's own habits (for add-habit suggestions) ─────────────────────────
  const { data: userHabits = [] } = useQuery<UserHabit[]>({
    queryKey: ['/api/habits/my'],
    queryFn: getQueryFn({ on401: 'throw' }),
    staleTime: 60000,
    enabled: addHabitVisible,
  });

  const filteredSuggestions = useMemo<UserHabit[]>(() => {
    const q = newHabitName.trim().toLowerCase();
    if (!q) return userHabits.slice(0, 8);
    return userHabits.filter(h => h.habitName?.toLowerCase().includes(q)).slice(0, 8);
  }, [userHabits, newHabitName]);

  // ── Invite friends (COOP only) ─────────────────────────────────────────────
  const { data: friendsData } = useQuery<FriendsData>({
    queryKey: ['/api/friends'],
    queryFn: getQueryFn({ on401: 'throw' }),
    staleTime: 60000,
    enabled: inviteVisible && groupType === 'coop',
  });

  const existingMemberIds = useMemo(
    () => new Set(members.map(m => m.userId)),
    [members]
  );
  const inviteCandidates = useMemo(
    () => (friendsData?.accepted ?? []).filter(f => !existingMemberIds.has(f.userId)),
    [friendsData, existingMemberIds]
  );

  const handleInvite = async (friendId: string, friendName: string) => {
    setInviting(friendId);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    try {
      const res = await apiRequest('POST', `/api/coop/${id}/invite`, { friendId });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error((body as { error?: string }).error ?? 'Failed to invite');
      }
      qc.invalidateQueries({ queryKey: ['/api/coop', id, 'members'] });
      qc.invalidateQueries({ queryKey: ['/api/coop'] });
      Alert.alert('Invited', `${friendName} has been invited to the group.`);
    } catch (err) {
      Alert.alert('Could not invite', err instanceof Error ? err.message : 'Please try again.');
    } finally {
      setInviting(null);
    }
  };

  // ── Add habit (COOP only) ──────────────────────────────────────────────────
  const currentHabitCount = groupType === 'coop'
    ? (members[0] as CoopMemberRow | undefined)?.totalHabits ?? 0
    : 0;

  const handleAddHabit = async () => {
    const trimmed = newHabitName.trim();
    if (!trimmed) return;
    setAddingHabit(true);
    try {
      await apiRequest('POST', `/api/coop/${id}/habits`, { habitName: trimmed });
      qc.invalidateQueries({ queryKey: ['/api/coop', id, 'members'] });
      qc.invalidateQueries({ queryKey: ['/api/coop'] });
      setNewHabitName('');
      setAddHabitVisible(false);
    } catch (err) {
      // apiRequest throws "STATUS: {json body}" — extract the readable message
      let msg = 'Please try again.';
      if (err instanceof Error) {
        const match = err.message.match(/^\d+:\s*(.+)$/s);
        if (match) {
          try { msg = (JSON.parse(match[1]) as { error?: string }).error ?? match[1]; }
          catch { msg = match[1]; }
        } else {
          msg = err.message;
        }
      }
      Alert.alert('Could not add habit', msg);
    } finally {
      setAddingHabit(false);
    }
  };

  const handleRemoveMember = useCallback(async (memberId: string, memberName: string) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
    Alert.alert(
      'Remove Member',
      `Remove ${memberName} from this group?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Remove',
          style: 'destructive',
          onPress: async () => {
            setRemovingMember(memberId);
            try {
              const res = await apiRequest('DELETE', `/api/coop/${id}/members/${memberId}`, undefined);
              if (!res.ok) {
                const body = await res.json().catch(() => ({}));
                throw new Error((body as { error?: string }).error ?? 'Failed to remove member');
              }
              qc.invalidateQueries({ queryKey: ['/api/coop', id, 'members'] });
              qc.invalidateQueries({ queryKey: ['/api/coop'] });
              Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
            } catch (err) {
              Alert.alert('Could not remove', err instanceof Error ? err.message : 'Please try again.');
            } finally {
              setRemovingMember(null);
            }
          },
        },
      ]
    );
  }, [id, qc]);

  const handleNudgeMember = useCallback(async (memberId: string, memberName: string) => {
    setNudgingMember(memberId);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    try {
      const res = await apiRequest('POST', `/api/coop/${id}/nudge/${memberId}`, {});
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        const msg = (body as { error?: string }).error ?? 'Failed to send nudge';
        if (res.status === 429) {
          Alert.alert('Already nudged', msg);
          setNudgedMembers(prev => new Set(prev).add(memberId));
        } else {
          Alert.alert('Could not nudge', msg);
        }
        return;
      }
      setNudgedMembers(prev => new Set(prev).add(memberId));
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch {
      Alert.alert('Could not nudge', 'Please try again.');
    } finally {
      setNudgingMember(null);
    }
  }, [id]);

  const renderMember = useCallback(({ item }: { item: MemberRow }) => {
    if (groupType === 'coop') {
      const member = item as CoopMemberRow;
      const canRemove = isOwner && member.userId !== user?.id && member.role !== 'owner';
      return (
        <CoopMemberCard
          member={member}
          color={accentColor}
          C={C}
          canNudge={isOwner && member.userId !== user?.id}
          nudged={nudgedMembers.has(member.userId)}
          nudging={nudgingMember === member.userId}
          onNudge={() => handleNudgeMember(member.userId, member.name)}
          canRemove={canRemove}
          removing={removingMember === member.userId}
          onRemove={() => handleRemoveMember(member.userId, member.name)}
        />
      );
    }
    return <CommunityMemberCard member={item as CommunityMemberRow} color={accentColor} C={C} />;
  }, [groupType, accentColor, C, isOwner, user?.id, nudgedMembers, nudgingMember, handleNudgeMember, removingMember, handleRemoveMember]);

  const ListHeader = (
    <View>
      {groupType === 'coop' && groupHabits.length > 0 && (
        <GroupHabitsPanel
          habits={groupHabits}
          activeMemberCount={activeMemberCount}
          color={accentColor}
          C={C}
          language={language}
        />
      )}
      <View style={[s.searchWrap, { backgroundColor: C.cardBackground, borderColor: C.border }]}>
        <MaterialIcons name="search" size={18} color={C.textTertiary} />
        <TextInput
          style={[s.searchInput, { color: C.textPrimary }]}
          placeholder="Search members…"
          placeholderTextColor={C.textTertiary}
          value={search}
          onChangeText={handleSearch}
          returnKeyType="search"
        />
        {search.length > 0 && (
          <Pressable onPress={() => handleSearch('')} hitSlop={8}>
            <MaterialIcons name="close" size={16} color={C.textTertiary} />
          </Pressable>
        )}
      </View>
    </View>
  );

  return (
    <View style={[s.root, { backgroundColor: C.background }]}>
      {/* Header */}
      <View style={[s.header, { paddingTop: topInset + 4, borderBottomColor: C.border, backgroundColor: C.background }]}>
        <Pressable onPress={() => router.back()} hitSlop={10} style={s.backBtn}>
          <MaterialIcons name="arrow-back" size={22} color={C.textPrimary} />
        </Pressable>
        <View style={{ flex: 1 }}>
          <Text style={[s.headerTitle, { color: C.textPrimary }]} numberOfLines={1}>
            {name || 'Members'}
          </Text>
          {!loading && !membersQuery.error && (
            <Text style={[s.headerSub, { color: C.textTertiary }]}>
              {total} {total === 1 ? 'member' : 'members'}
            </Text>
          )}
        </View>
        {groupType === 'coop' && isOwner && (
          <Pressable
            onPress={() => { Haptics.selectionAsync(); setAddHabitVisible(true); }}
            hitSlop={10}
            style={[s.headerIconBtn, { borderColor: accentColor + '40' }]}
          >
            <MaterialIcons name="playlist-add" size={20} color={accentColor} />
          </Pressable>
        )}
        {groupType === 'coop' && isOwner && (
          <Pressable
            onPress={() => { Haptics.selectionAsync(); setInviteVisible(true); }}
            hitSlop={10}
            style={[s.headerIconBtn, { borderColor: accentColor + '40' }]}
          >
            <MaterialIcons name="person-add" size={20} color={accentColor} />
          </Pressable>
        )}
        <View style={[s.typePill, { backgroundColor: accentColor + '18', borderColor: accentColor + '40' }]}>
          <MaterialIcons
            name={groupType === 'coop' ? 'groups' : 'people'}
            size={14}
            color={accentColor}
          />
          <Text style={[s.typePillText, { color: accentColor }]}>
            {groupType === 'coop' ? 'COOP' : 'Community'}
          </Text>
        </View>
      </View>

      {/* Loading skeletons */}
      {loading && (
        <View style={[s.list, { paddingTop: 12 }]}>
          {ListHeader}
          {[1, 2, 3, 4, 5].map(i => <SkeletonRow key={i} C={C} />)}
        </View>
      )}

      {/* 403 / error state */}
      {!loading && !!membersQuery.error && (
        <View style={s.center}>
          <MaterialIcons
            name={is403 ? 'lock-outline' : 'error-outline'}
            size={44}
            color={C.textTertiary}
          />
          <Text style={[s.emptyTitle, { color: C.textPrimary }]}>
            {is403 ? 'Access Denied' : 'Something went wrong'}
          </Text>
          <Text style={[s.emptyDesc, { color: C.textTertiary }]}>{errorMsg}</Text>
          {!is403 && (
            <Pressable style={[s.retryBtn, { backgroundColor: accentColor }]} onPress={handleRefresh}>
              <Text style={s.retryLabel}>Retry</Text>
            </Pressable>
          )}
        </View>
      )}

      {/* Member list */}
      {!loading && !membersQuery.error && (
        <FlatList
          data={members}
          keyExtractor={(item, i) => ('userId' in item ? item.userId : String(i))}
          renderItem={renderMember}
          contentContainerStyle={[s.list, members.length === 0 && s.listEmpty]}
          showsVerticalScrollIndicator={false}
          ListHeaderComponent={ListHeader}
          ListEmptyComponent={
            <View style={s.emptyWrap}>
              <MaterialIcons name="person-search" size={44} color={C.textTertiary} />
              <Text style={[s.emptyTitle, { color: C.textPrimary }]}>
                {search ? 'No members found' : 'No members yet'}
              </Text>
              <Text style={[s.emptyDesc, { color: C.textTertiary }]}>
                {search ? 'Try a different name.' : 'Members will appear here once they join.'}
              </Text>
            </View>
          }
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={handleRefresh}
              tintColor={accentColor}
              colors={[accentColor]}
            />
          }
          onEndReached={handleLoadMore}
          onEndReachedThreshold={0.4}
          ListFooterComponent={
            loadingMore ? (
              <ActivityIndicator color={accentColor} style={{ marginVertical: 16 }} />
            ) : null
          }
          contentInsetAdjustmentBehavior="never"
          style={{ flex: 1 }}
        />
      )}

      {/* Bottom padding */}
      <View style={{ height: botInset }} />

      {/* Invite friend modal (COOP only) */}
      <Modal visible={inviteVisible} transparent animationType="slide" onRequestClose={() => setInviteVisible(false)}>
        <Pressable style={StyleSheet.absoluteFill} onPress={() => setInviteVisible(false)} />
        <View style={[s.sheet, { backgroundColor: C.cardBackground, paddingBottom: botInset + 20 }]}>
          <View style={s.sheetHandle} />
          <View style={s.sheetTitleRow}>
            <Text style={[s.sheetTitle, { color: C.textPrimary }]}>Invite a Friend</Text>
            <Pressable onPress={() => setInviteVisible(false)} hitSlop={8}>
              <MaterialIcons name="close" size={22} color={C.textTertiary} />
            </Pressable>
          </View>
          {inviteCandidates.length === 0 ? (
            <Text style={[s.emptyDesc, { color: C.textTertiary, marginTop: 8 }]}>
              All your friends are already in this group, or you have no friends to invite yet.
            </Text>
          ) : (
            <ScrollView style={{ maxHeight: 360 }} showsVerticalScrollIndicator={false}>
              {inviteCandidates.map(f => (
                <View key={f.userId} style={[s.friendRow, { borderColor: C.border }]}>
                  <View style={[av.fallback, { backgroundColor: accentColor + '22', borderColor: accentColor + '40' }]}>
                    <Text style={[av.initial, { color: accentColor }]}>{f.name.charAt(0).toUpperCase()}</Text>
                  </View>
                  <Text style={[s.memberName, { color: C.textPrimary, flex: 1 }]} numberOfLines={1}>{f.name}</Text>
                  <Pressable
                    style={[s.inviteBtn, { backgroundColor: accentColor, opacity: inviting === f.userId ? 0.6 : 1 }]}
                    onPress={() => handleInvite(f.userId, f.name)}
                    disabled={inviting === f.userId}
                  >
                    {inviting === f.userId
                      ? <ActivityIndicator color="#fff" size="small" />
                      : <Text style={s.inviteBtnLabel}>Invite</Text>}
                  </Pressable>
                </View>
              ))}
            </ScrollView>
          )}
        </View>
      </Modal>

      {/* Add habit modal (COOP only) */}
      <Modal visible={addHabitVisible} transparent animationType="slide" onRequestClose={() => { setAddHabitVisible(false); setNewHabitName(''); }}>
        <KeyboardAvoidingView
          style={{ flex: 1, justifyContent: 'flex-end' }}
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        >
          <Pressable style={StyleSheet.absoluteFill} onPress={() => { setAddHabitVisible(false); setNewHabitName(''); }} />
          <View style={[s.sheet, { backgroundColor: C.cardBackground, paddingBottom: botInset + 20 }]}>
            <View style={s.sheetHandle} />
            <View style={s.sheetTitleRow}>
              <Text style={[s.sheetTitle, { color: C.textPrimary }]}>Add a Habit</Text>
              <Pressable onPress={() => { setAddHabitVisible(false); setNewHabitName(''); }} hitSlop={8}>
                <MaterialIcons name="close" size={22} color={C.textTertiary} />
              </Pressable>
            </View>
            <Text style={[s.emptyDesc, { color: C.textTertiary, marginTop: 4, marginBottom: 12 }]}>
              {`Up to ${GROUP_HABIT_LIMIT} habits per group${currentHabitCount ? ` · ${currentHabitCount} currently in this group` : ''}`}
            </Text>

            {/* Search / type input */}
            <View style={[s.habitSearchWrap, { borderColor: C.border, backgroundColor: C.background }]}>
              <MaterialIcons name="search" size={17} color={C.textTertiary} />
              <TextInput
                style={[s.habitSearchInput, { color: C.textPrimary }]}
                placeholder="Search or type a habit name…"
                placeholderTextColor={C.textTertiary}
                value={newHabitName}
                onChangeText={setNewHabitName}
                maxLength={100}
                returnKeyType="done"
                onSubmitEditing={handleAddHabit}
              />
              {newHabitName.length > 0 && (
                <Pressable onPress={() => setNewHabitName('')} hitSlop={8}>
                  <MaterialIcons name="close" size={15} color={C.textTertiary} />
                </Pressable>
              )}
            </View>

            {/* Suggestions from user's habit library */}
            {filteredSuggestions.length > 0 && (
              <ScrollView
                style={[s.suggestionList, { borderColor: C.border }]}
                showsVerticalScrollIndicator={false}
                keyboardShouldPersistTaps="handled"
              >
                {filteredSuggestions.map((h, idx) => {
                  const pc = PILLAR_COLORS[h.pillar] ?? ACCENT;
                  const isSelected = newHabitName === h.habitName;
                  return (
                    <Pressable
                      key={h.habitId}
                      style={[
                        s.suggestionRow,
                        { borderColor: C.border, backgroundColor: isSelected ? pc + '12' : 'transparent' },
                        idx === filteredSuggestions.length - 1 && { borderBottomWidth: 0 },
                      ]}
                      onPress={() => {
                        Haptics.selectionAsync();
                        setNewHabitName(h.habitName);
                      }}
                    >
                      <View style={[s.pillarDot, { backgroundColor: pc }]} />
                      <Text style={[s.suggestionText, { color: C.textPrimary }]} numberOfLines={1}>{getLocalHabitNameByEnglish(h.habitName, language)}</Text>
                      <Text style={[s.suggestionMeta, { color: C.textTertiary }]}>{h.timeBlock}</Text>
                      {isSelected && <MaterialIcons name="check-circle" size={16} color={pc} />}
                    </Pressable>
                  );
                })}
              </ScrollView>
            )}

            <Pressable
              style={[s.inviteBtn, { backgroundColor: newHabitName.trim() ? accentColor : C.border, alignSelf: 'stretch', alignItems: 'center', opacity: addingHabit ? 0.7 : 1, marginTop: 12 }]}
              onPress={handleAddHabit}
              disabled={!newHabitName.trim() || addingHabit}
            >
              {addingHabit ? <ActivityIndicator color="#fff" /> : <Text style={s.inviteBtnLabel}>Add Habit</Text>}
            </Pressable>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </View>
  );
}

const s = StyleSheet.create({
  root: { flex: 1 },
  header: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    paddingHorizontal: 16, paddingBottom: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  backBtn: { padding: 4 },
  headerTitle: { fontSize: 17, fontFamily: 'Inter_700Bold' },
  headerSub: { fontSize: 12, fontFamily: 'Inter_400Regular', marginTop: 1 },
  typePill: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    paddingHorizontal: 10, paddingVertical: 5,
    borderRadius: 20, borderWidth: 1,
  },
  typePillText: { fontSize: 11, fontFamily: 'Inter_600SemiBold' },
  list: { padding: 16, paddingBottom: 24 },
  listEmpty: { flex: 1 },
  searchWrap: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    paddingHorizontal: 12, paddingVertical: 10,
    borderRadius: 14, borderWidth: StyleSheet.hairlineWidth,
    marginBottom: 12,
  },
  searchInput: {
    flex: 1, fontSize: 14, fontFamily: 'Inter_400Regular', paddingVertical: 0,
  },
  memberCard: {
    flexDirection: 'row', gap: 12, padding: 14,
    borderRadius: 14, borderWidth: StyleSheet.hairlineWidth, marginBottom: 8,
  },
  nameRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  memberName: { fontSize: 14, fontFamily: 'Inter_600SemiBold', flex: 1 },
  rolePill: {
    paddingHorizontal: 8, paddingVertical: 2,
    borderRadius: 20, borderWidth: 1, flexShrink: 0,
  },
  rolePillText: { fontSize: 10, fontFamily: 'Inter_600SemiBold' },
  joinDate: { fontSize: 11, fontFamily: 'Inter_400Regular' },
  progressRow: { flexDirection: 'row', alignItems: 'center', gap: 4, marginBottom: 4 },
  progressLabel: { fontSize: 12, fontFamily: 'Inter_500Medium' },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 10, padding: 24 },
  emptyWrap: { alignItems: 'center', paddingTop: 48, gap: 10 },
  emptyTitle: { fontSize: 16, fontFamily: 'Inter_600SemiBold', textAlign: 'center' },
  emptyDesc: { fontSize: 13, fontFamily: 'Inter_400Regular', textAlign: 'center', lineHeight: 18 },
  retryBtn: { paddingHorizontal: 24, paddingVertical: 12, borderRadius: 12, marginTop: 6 },
  retryLabel: { color: '#fff', fontSize: 14, fontFamily: 'Inter_600SemiBold' },
  headerIconBtn: {
    width: 36, height: 36, borderRadius: 18,
    alignItems: 'center', justifyContent: 'center', borderWidth: 1,
  },
  sheet: {
    position: 'absolute', left: 0, right: 0, bottom: 0,
    borderTopLeftRadius: 24, borderTopRightRadius: 24,
    padding: 20,
  },
  sheetHandle: {
    width: 40, height: 4, borderRadius: 2, backgroundColor: '#00000022',
    alignSelf: 'center', marginBottom: 14,
  },
  sheetTitleRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 },
  sheetTitle: { fontSize: 17, fontFamily: 'Inter_700Bold' },
  friendRow: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    paddingVertical: 10, borderBottomWidth: StyleSheet.hairlineWidth,
  },
  inviteBtn: {
    paddingHorizontal: 16, paddingVertical: 8, borderRadius: 20,
    minWidth: 72, alignItems: 'center', justifyContent: 'center',
  },
  inviteBtnLabel: { color: '#fff', fontSize: 13, fontFamily: 'Inter_600SemiBold' },
  habitSearchWrap: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    paddingHorizontal: 12, paddingVertical: 11,
    borderRadius: 14, borderWidth: StyleSheet.hairlineWidth,
  },
  habitSearchInput: {
    flex: 1, fontSize: 14, fontFamily: 'Inter_400Regular', paddingVertical: 0,
  },
  suggestionList: {
    maxHeight: 210, borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth, marginTop: 10, overflow: 'hidden',
  },
  suggestionRow: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    paddingHorizontal: 12, paddingVertical: 11,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  pillarDot: {
    width: 8, height: 8, borderRadius: 4, flexShrink: 0,
  },
  suggestionText: {
    flex: 1, fontSize: 14, fontFamily: 'Inter_500Medium',
  },
  suggestionMeta: {
    fontSize: 11, fontFamily: 'Inter_400Regular', flexShrink: 0,
  },
  nudgeBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    paddingHorizontal: 10, paddingVertical: 6,
    borderRadius: 20, flexShrink: 0, minWidth: 72, justifyContent: 'center',
  },
  nudgeBtnLabel: { fontSize: 11, fontFamily: 'Inter_600SemiBold' },
});
