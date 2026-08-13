import React, { useState, useCallback, useEffect } from 'react';
import {
  View, Text, StyleSheet, ScrollView, Pressable, ActivityIndicator, Platform, Alert,
} from 'react-native';
import Animated, {
  useSharedValue, useAnimatedStyle, withSequence, withSpring, withTiming,
} from 'react-native-reanimated';
import { router, useFocusEffect } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { MaterialIcons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { useTranslation } from 'react-i18next';

import { useThemeColors, ThemeColors } from '@/context/ThemeContext';
import { useQueryClient } from '@tanstack/react-query';
import { apiRequest, getApiUrl } from '@/lib/query-client';

// ─── Types ────────────────────────────────────────────────────────────────────

type InboxNotification = {
  id: string;
  userId: string;
  title: string;
  message: string;
  type: 'GROUP_CHALLENGE' | 'ONE_TO_ONE' | 'GENERAL';
  challengeType: string | null;
  challengeId: string | null;
  isRead: boolean;
  createdAt: string;
  clickedAt: string | null;
};

type InviteKind = '1on1-invite' | 'coop-invite' | 'friend-request';

function isInviteCard(n: InboxNotification): n is InboxNotification & { challengeType: InviteKind } {
  return (
    n.challengeType === '1on1-invite' ||
    n.challengeType === 'coop-invite' ||
    n.challengeType === 'friend-request'
  );
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function inviteAccentColor(kind: InviteKind): string {
  if (kind === '1on1-invite') return '#F2836B';
  if (kind === 'coop-invite') return '#5B8DEF';
  return '#56C596';
}

function inviteIcon(kind: InviteKind): React.ComponentProps<typeof MaterialIcons>['name'] {
  if (kind === '1on1-invite') return 'handshake';
  if (kind === 'coop-invite') return 'groups';
  return 'person-add';
}

function typeBadgeColor(n: InboxNotification, Colors: ThemeColors): string {
  if (n.type === 'GROUP_CHALLENGE') return '#5B8DEF';
  if (n.type === 'ONE_TO_ONE') return '#F2836B';
  return Colors.accent;
}

// ─── Live Counter Badge ───────────────────────────────────────────────────────

function LiveCounter({ count, Colors }: { count: number; Colors: ThemeColors }) {
  const scale = useSharedValue(1);
  useEffect(() => {
    if (count > 0) {
      scale.value = withSequence(
        withSpring(1.35, { damping: 6, stiffness: 260 }),
        withSpring(1, { damping: 10, stiffness: 200 }),
      );
    } else {
      scale.value = withTiming(1, { duration: 150 });
    }
  }, [count]);
  const animStyle = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));
  if (count === 0) return null;
  return (
    <Animated.View style={[animStyle, {
      backgroundColor: Colors.accent, borderRadius: 12,
      minWidth: 24, height: 24, paddingHorizontal: 7,
      justifyContent: 'center', alignItems: 'center', marginLeft: 8,
    }]}>
      <Text style={{ fontSize: 13, fontFamily: 'Inter_700Bold', color: '#fff', lineHeight: 16 }}>
        {count > 99 ? '99+' : String(count)}
      </Text>
    </Animated.View>
  );
}

// ─── Notification Card ────────────────────────────────────────────────────────

function NotifCard({
  item, Colors, onPress, onAccept, onReject, responding,
}: {
  item: InboxNotification;
  Colors: ThemeColors;
  onPress: (n: InboxNotification) => void;
  onAccept?: (n: InboxNotification) => void;
  onReject?: (n: InboxNotification) => void;
  responding?: boolean;
}) {
  const { t } = useTranslation();
  const isInvite = isInviteCard(item);
  const kind = item.challengeType as InviteKind | null;
  const accent = isInvite && kind ? inviteAccentColor(kind) : typeBadgeColor(item, Colors);
  const st = cardStyles(Colors);

  function getBadgeLabel(): string {
    if (item.challengeType === '1on1-invite') return t('notifCenter.badgeChallenge');
    if (item.challengeType === 'coop-invite') return t('notifCenter.badgeGroupInvite');
    if (item.challengeType === 'friend-request') return t('notifCenter.badgeFriendRequest');
    if (item.type === 'GROUP_CHALLENGE') return t('notifCenter.badgeGroup');
    if (item.type === 'ONE_TO_ONE') return t('notifCenter.badge1on1');
    return t('notifCenter.badgeGeneral');
  }

  function getAcceptLabel(): string {
    if (kind === 'friend-request') return t('notifCenter.acceptFriend');
    return t('notifCenter.acceptChallenge');
  }

  function getRelativeTime(dateStr: string): string {
    const diff = Date.now() - new Date(dateStr).getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return t('notifCenter.timeJustNow');
    if (mins < 60) return t('notifCenter.timeMinAgo', { count: mins });
    const hrs = Math.floor(mins / 60);
    if (hrs < 24) return t('notifCenter.timeHrAgo', { count: hrs });
    const days = Math.floor(hrs / 24);
    if (days === 1) return t('notifCenter.timeYesterday');
    if (days < 7) return t('notifCenter.timeDaysAgo', { count: days });
    return new Date(dateStr).toLocaleDateString();
  }

  return (
    <Pressable
      style={[
        st.card,
        !item.isRead && { borderLeftColor: accent, borderLeftWidth: 3 },
        isInvite && { borderColor: accent + '44' },
      ]}
      onPress={() => !isInvite && onPress(item)}
      android_ripple={!isInvite ? { color: Colors.border } : undefined}
    >
      <View style={st.cardTop}>
        <View style={[st.iconWrap, { backgroundColor: accent + '22' }]}>
          <MaterialIcons
            name={isInvite && kind ? inviteIcon(kind) : 'notifications-none'}
            size={18}
            color={accent}
          />
        </View>
        <View style={{ flex: 1 }}>
          <View style={st.titleRow}>
            <Text style={[st.title, { color: Colors.textPrimary }]} numberOfLines={1}>
              {item.title}
            </Text>
            {!item.isRead && <View style={[st.unreadDot, { backgroundColor: accent }]} />}
          </View>
          <Text style={[st.message, { color: Colors.textSecondary }]} numberOfLines={3}>
            {item.message}
          </Text>
          <View style={st.footerRow}>
            <View style={[st.badge, { backgroundColor: accent + '22', borderColor: accent + '55' }]}>
              <Text style={[st.badgeText, { color: accent }]}>{getBadgeLabel()}</Text>
            </View>
            <Text style={[st.time, { color: Colors.textTertiary }]}>{getRelativeTime(item.createdAt)}</Text>
          </View>
        </View>
      </View>

      {/* ── Inline Accept / Decline for invites ── */}
      {isInvite && kind && item.challengeId && (
        <View style={st.inviteActions}>
          <Pressable
            style={[st.rejectBtn, { borderColor: Colors.border, backgroundColor: Colors.cardBackground }]}
            onPress={() => { Haptics.selectionAsync(); onReject?.(item); }}
            disabled={responding}
          >
            {responding
              ? <ActivityIndicator size="small" color="#9B9BAA" />
              : <Text style={[st.rejectLabel, { color: Colors.textSecondary }]}>{t('notifCenter.decline')}</Text>
            }
          </Pressable>
          <Pressable
            style={[st.acceptBtn, { backgroundColor: accent }]}
            onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium); onAccept?.(item); }}
            disabled={responding}
          >
            {responding
              ? <ActivityIndicator size="small" color="#fff" />
              : <Text style={st.acceptLabel}>{getAcceptLabel()}</Text>
            }
          </Pressable>
        </View>
      )}
    </Pressable>
  );
}

function cardStyles(Colors: ThemeColors) {
  return StyleSheet.create({
    card: {
      backgroundColor: Colors.cardBackground, borderRadius: 14,
      borderWidth: 1, borderColor: Colors.border, padding: 14, marginBottom: 10,
    },
    cardTop: { flexDirection: 'row', gap: 12 },
    iconWrap: {
      width: 36, height: 36, borderRadius: 18,
      justifyContent: 'center', alignItems: 'center', marginTop: 1,
    },
    titleRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 4 },
    title: { fontSize: 14, fontFamily: 'Inter_600SemiBold', flex: 1 },
    unreadDot: { width: 7, height: 7, borderRadius: 4 },
    message: { fontSize: 13, fontFamily: 'Inter_400Regular', lineHeight: 19, marginBottom: 8 },
    footerRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
    badge: { paddingHorizontal: 8, paddingVertical: 2, borderRadius: 10, borderWidth: 1 },
    badgeText: { fontSize: 11, fontFamily: 'Inter_600SemiBold' },
    time: { fontSize: 12, fontFamily: 'Inter_400Regular', marginLeft: 'auto' },
    inviteActions: { flexDirection: 'row', gap: 10, marginTop: 12 },
    rejectBtn: {
      flex: 1, paddingVertical: 9, borderRadius: 20,
      alignItems: 'center', justifyContent: 'center', borderWidth: 1,
    },
    rejectLabel: { fontSize: 13, fontFamily: 'Inter_600SemiBold' },
    acceptBtn: {
      flex: 2, paddingVertical: 9, borderRadius: 20,
      alignItems: 'center', justifyContent: 'center',
    },
    acceptLabel: { fontSize: 13, fontFamily: 'Inter_600SemiBold', color: '#fff' },
  });
}

// ─── Empty State ──────────────────────────────────────────────────────────────

function EmptyState({ Colors }: { Colors: ThemeColors }) {
  const { t } = useTranslation();
  return (
    <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 32, paddingTop: 80 }}>
      <View style={{
        width: 72, height: 72, borderRadius: 36, backgroundColor: Colors.accent + '18',
        justifyContent: 'center', alignItems: 'center', marginBottom: 20,
      }}>
        <MaterialIcons name="notifications-none" size={34} color={Colors.accent} />
      </View>
      <Text style={{ fontSize: 18, fontFamily: 'Inter_700Bold', color: Colors.textPrimary, marginBottom: 10 }}>
        {t('notifCenter.emptyTitle')}
      </Text>
      <Text style={{ fontSize: 14, fontFamily: 'Inter_400Regular', color: Colors.textSecondary, textAlign: 'center', lineHeight: 21 }}>
        {t('notifCenter.emptyDesc')}
      </Text>
    </View>
  );
}

// ─── Main Screen ──────────────────────────────────────────────────────────────

const PAGE_SIZE = 20;

export default function NotificationCenterScreen() {
  const insets = useSafeAreaInsets();
  const topInset = Platform.OS === 'web' ? 67 : insets.top;
  const Colors = useThemeColors();
  const { t, i18n } = useTranslation();

  const [items, setItems] = useState<InboxNotification[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const [markingAll, setMarkingAll] = useState(false);
  const [respondingId, setRespondingId] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const queryClient = useQueryClient();

  const unreadCount = items.filter(i => !i.isRead).length;

  const fetchPage = useCallback(async (offset: number, reset = false) => {
    if (reset) setLoading(true);
    else setLoadingMore(true);
    try {
      const url = new URL('/api/inbox', getApiUrl());
      url.searchParams.set('limit', String(PAGE_SIZE));
      url.searchParams.set('offset', String(offset));
      url.searchParams.set('lang', i18n.language === 'hi' ? 'hi' : 'en');
      const res = await fetch(url.toString(), { credentials: 'include' });
      const data = await res.json() as { items: InboxNotification[] };
      const incoming = data.items ?? [];
      if (reset) setItems(incoming);
      else setItems(prev => [...prev, ...incoming]);
      setHasMore(incoming.length === PAGE_SIZE);
    } catch (err) {
      console.error('[inbox] fetch failed:', err);
    } finally {
      setLoading(false);
      setLoadingMore(false);
    }
  }, [i18n.language]);

  useFocusEffect(useCallback(() => { fetchPage(0, true); }, [fetchPage]));

  const handleLoadMore = () => {
    if (!hasMore || loadingMore || loading) return;
    fetchPage(items.length);
  };

  const removeItem = (id: string) => {
    setItems(prev => prev.filter(i => i.id !== id));
    apiRequest('DELETE', `/api/inbox/${id}`).catch(() => {});
  };

  const showError = (msg: string) => {
    setErrorMsg(msg);
    setTimeout(() => setErrorMsg(null), 3000);
  };

  const handleTap = async (n: InboxNotification) => {
    Haptics.selectionAsync();
    removeItem(n.id);
    if (n.type === 'ONE_TO_ONE') {
      router.navigate({ pathname: '/(main)/social', params: { tab: '1on1' } } as any);
    } else if (n.type === 'GROUP_CHALLENGE') {
      if (n.challengeType === 'coop' || n.challengeType === 'coop-invite') {
        router.navigate({ pathname: '/(main)/social', params: { tab: 'group' } } as any);
      } else if (n.challengeId) {
        router.push({ pathname: '/community/[id]', params: { id: n.challengeId } } as any);
      }
    }
  };

  const handleRespond = async (
    n: InboxNotification,
    action: 'accept' | 'reject' | 'decline',
  ) => {
    if (!n.challengeId || respondingId) return;
    setRespondingId(n.id);
    try {
      if (n.challengeType === '1on1-invite') {
        await apiRequest('POST', `/api/1on1/${n.challengeId}/respond`, { action });
        queryClient.invalidateQueries({ queryKey: ['/api/1on1'] });
      } else if (n.challengeType === 'coop-invite') {
        await apiRequest('POST', `/api/coop/${n.challengeId}/respond`, { action });
        queryClient.invalidateQueries({ queryKey: ['/api/coop'] });
      } else if (n.challengeType === 'friend-request') {
        await apiRequest('PUT', `/api/friends/${n.challengeId}/respond`, {
          action: action === 'reject' ? 'decline' : action,
        });
        queryClient.invalidateQueries({ queryKey: ['/api/friends'] });
      }
      removeItem(n.id);
    } catch (err: any) {
      const msg: string = err?.message ?? '';
      const isGone =
        msg.toLowerCase().includes('not found') ||
        msg.toLowerCase().includes('not pending') ||
        msg.includes('400') ||
        msg.includes('404');

      if (isGone) {
        if (action === 'accept') {
          Alert.alert(
            t('notifCenter.challengeGoneTitle'),
            t('notifCenter.challengeGoneMsg'),
            [{ text: t('notifCenter.ok'), onPress: () => removeItem(n.id) }],
          );
        } else {
          removeItem(n.id);
        }
      } else {
        showError(msg || t('notifCenter.challengeGoneMsg'));
      }
    } finally {
      setRespondingId(null);
    }
  };

  const handleAccept = (n: InboxNotification) => handleRespond(n, 'accept');
  const handleReject = (n: InboxNotification) => handleRespond(n, 'reject');

  const handleMarkAllRead = async () => {
    if (unreadCount === 0) return;
    Haptics.selectionAsync();
    setMarkingAll(true);
    try {
      await apiRequest('PATCH', '/api/inbox/read-all');
      setItems(prev => prev.map(i => ({ ...i, isRead: true })));
    } catch {}
    setMarkingAll(false);
  };

  const styles = makeStyles(Colors);

  const invites = items.filter(i => isInviteCard(i));
  const oneOnOneReminders = items.filter(i => i.type === 'ONE_TO_ONE' && !isInviteCard(i));
  const groupReminders = items.filter(i => i.type === 'GROUP_CHALLENGE' && !isInviteCard(i));
  const generalItems = items.filter(i => i.type === 'GENERAL' && !isInviteCard(i));

  return (
    <View style={{ flex: 1, backgroundColor: Colors.background }}>
      <View style={[styles.header, { paddingTop: topInset }]}>
        <Pressable onPress={() => router.back()} hitSlop={10} style={styles.backBtn}>
          <MaterialIcons name="arrow-back" size={22} color={Colors.textPrimary} />
        </Pressable>
        <View style={{ flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center' }}>
          <Text style={styles.headerTitle}>{t('notifCenter.title')}</Text>
          <LiveCounter count={unreadCount} Colors={Colors} />
        </View>
        {unreadCount > 0 ? (
          <Pressable onPress={handleMarkAllRead} disabled={markingAll} style={styles.markAllBtn}>
            {markingAll
              ? <ActivityIndicator size={14} color={Colors.accent} />
              : <Text style={[styles.markAllText, { color: Colors.accent }]}>{t('notifCenter.markAllRead')}</Text>
            }
          </Pressable>
        ) : (
          <View style={{ width: 90 }} />
        )}
      </View>

      {errorMsg && (
        <View style={[styles.errorToast, { backgroundColor: '#FF3B30' }]}>
          <Text style={{ color: '#fff', fontSize: 13, fontFamily: 'Inter_500Medium' }}>{errorMsg}</Text>
        </View>
      )}

      {loading ? (
        <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
          <ActivityIndicator size="large" color={Colors.accent} />
        </View>
      ) : items.length === 0 ? (
        <EmptyState Colors={Colors} />
      ) : (
        <ScrollView
          showsVerticalScrollIndicator={false}
          contentContainerStyle={styles.list}
          onScroll={({ nativeEvent }) => {
            const { layoutMeasurement, contentOffset, contentSize } = nativeEvent;
            if (layoutMeasurement.height + contentOffset.y >= contentSize.height - 80) handleLoadMore();
          }}
          scrollEventThrottle={200}
        >
          {/* ── Invites ── */}
          {invites.length > 0 && (
            <>
              <SectionHeader
                icon="mail"
                label={t('notifCenter.sectionInvites')}
                count={invites.length}
                color={Colors.accent}
                Colors={Colors}
              />
              {invites.map(item => (
                <NotifCard
                  key={item.id} item={item} Colors={Colors}
                  onPress={handleTap} onAccept={handleAccept} onReject={handleReject}
                  responding={respondingId === item.id}
                />
              ))}
            </>
          )}

          {/* ── 1-on-1 Reminders ── */}
          {oneOnOneReminders.length > 0 && (
            <>
              <SectionHeader
                icon="person"
                label={t('notifCenter.section1on1')}
                count={oneOnOneReminders.length}
                color="#F2836B"
                Colors={Colors}
                topGap={invites.length > 0}
              />
              {oneOnOneReminders.map(item => (
                <NotifCard key={item.id} item={item} Colors={Colors} onPress={handleTap} />
              ))}
            </>
          )}

          {/* ── Group Reminders ── */}
          {groupReminders.length > 0 && (
            <>
              <SectionHeader
                icon="groups"
                label={t('notifCenter.sectionGroup')}
                count={groupReminders.length}
                color="#5B8DEF"
                Colors={Colors}
                topGap={invites.length > 0 || oneOnOneReminders.length > 0}
              />
              {groupReminders.map(item => (
                <NotifCard key={item.id} item={item} Colors={Colors} onPress={handleTap} />
              ))}
            </>
          )}

          {/* ── General ── */}
          {generalItems.length > 0 && (
            <>
              <SectionHeader
                icon="notifications-none"
                label={t('notifCenter.sectionGeneral')}
                count={generalItems.length}
                color={Colors.textSecondary}
                Colors={Colors}
                topGap={invites.length > 0 || oneOnOneReminders.length > 0 || groupReminders.length > 0}
              />
              {generalItems.map(item => (
                <NotifCard key={item.id} item={item} Colors={Colors} onPress={handleTap} />
              ))}
            </>
          )}

          {loadingMore && (
            <ActivityIndicator size="small" color={Colors.accent} style={{ marginVertical: 16 }} />
          )}
        </ScrollView>
      )}
    </View>
  );
}

// ─── Section Header ───────────────────────────────────────────────────────────

function SectionHeader({
  icon, label, count, color, Colors, topGap,
}: {
  icon: React.ComponentProps<typeof MaterialIcons>['name'];
  label: string;
  count: number;
  color: string;
  Colors: ThemeColors;
  topGap?: boolean;
}) {
  return (
    <View style={[{
      flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 10,
    }, topGap ? { marginTop: 20 } : {}]}>
      <MaterialIcons name={icon} size={14} color={color} />
      <Text style={{
        fontSize: 12, fontFamily: 'Inter_700Bold', letterSpacing: 0.6,
        textTransform: 'uppercase', flex: 1, color,
      }}>
        {label}
      </Text>
      <View style={{ paddingHorizontal: 8, paddingVertical: 2, borderRadius: 10, backgroundColor: color + '18' }}>
        <Text style={{ fontSize: 11, fontFamily: 'Inter_700Bold', color }}>{count}</Text>
      </View>
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

function makeStyles(Colors: ThemeColors) {
  return StyleSheet.create({
    header: {
      flexDirection: 'row', alignItems: 'center',
      paddingHorizontal: 16, paddingBottom: 12,
      backgroundColor: Colors.background,
      borderBottomWidth: 1, borderBottomColor: Colors.border,
    },
    backBtn: {
      width: 38, height: 38, borderRadius: 19,
      justifyContent: 'center', alignItems: 'center',
      backgroundColor: Colors.cardBackground,
    },
    headerTitle: { fontSize: 17, fontFamily: 'Inter_700Bold', color: Colors.textPrimary },
    markAllBtn: { width: 90, alignItems: 'flex-end', justifyContent: 'center', height: 38 },
    markAllText: { fontSize: 13, fontFamily: 'Inter_600SemiBold' },
    list: { padding: 16, paddingBottom: Platform.OS === 'web' ? 34 : 24 },
    errorToast: {
      margin: 12, borderRadius: 10, padding: 12, alignItems: 'center',
    },
  });
}
