import React, { useState, useCallback } from 'react';
import {
  View, Text, StyleSheet, FlatList, TextInput, Pressable,
  ActivityIndicator, Alert, Modal, Platform, KeyboardAvoidingView,
} from 'react-native';
import * as Clipboard from 'expo-clipboard';
import { useLocalSearchParams, router, useFocusEffect } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { MaterialIcons, Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';

import { useThemeColors } from '@/context/ThemeContext';
import { useAuth } from '@/context/AuthContext';
import { apiRequest, getApiUrl } from '@/lib/query-client';

function parseApiErr(err: unknown): { status: number; message: string } {
  const raw = (err as Error).message ?? '';
  const colonIdx = raw.indexOf(':');
  if (colonIdx === -1) return { status: 0, message: raw };
  const status = parseInt(raw.slice(0, colonIdx), 10) || 0;
  const body = raw.slice(colonIdx + 2);
  try {
    const parsed = JSON.parse(body);
    return { status, message: parsed.error ?? parsed.message ?? body };
  } catch {
    return { status, message: body || raw };
  }
}

const PILLAR_COLORS: Record<string, string> = {
  Mental: '#5B8DEF', Physical: '#56C596', Social: '#F2836B', Spiritual: '#9B7DD4',
};
const PILLAR_EMOJIS: Record<string, string> = {
  Mental: '🧠', Physical: '💪', Social: '🤝', Spiritual: '✨',
};

type Post = {
  id: string; body: string; authorId: string; authorName: string; createdAt: string;
};
type CommunityDetail = {
  id: string; name: string; description: string; pillar: string;
  inviteToken: string; creatorId: string; myRole: 'owner' | 'member';
  posts: Post[]; pendingCount: number; memberCount: number;
};
type PendingMember = { id: string; userId: string; name: string; status: string };

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  return `${days}d ago`;
}

export default function CommunityFeedScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const C = useThemeColors();
  const { user } = useAuth();
  const insets = useSafeAreaInsets();
  const topInset = Platform.OS === 'web' ? 67 : insets.top;
  const botInset = Platform.OS === 'web' ? 34 : insets.bottom;

  const [community, setCommunity] = useState<CommunityDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [posts, setPosts] = useState<Post[]>([]);

  const [body, setBody] = useState('');
  const [posting, setPosting] = useState(false);
  const [postError, setPostError] = useState('');

  const [showApproval, setShowApproval] = useState(false);
  const [pendingMembers, setPendingMembers] = useState<PendingMember[]>([]);
  const [approvalLoading, setApprovalLoading] = useState(false);

  const [copiedLink, setCopiedLink] = useState(false);
  const [leaving, setLeaving] = useState(false);

  const fetchCommunity = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    try {
      const res = await apiRequest('GET', `/api/communities/${id}`);
      const data: CommunityDetail = await res.json();
      setCommunity(data);
      setPosts(data.posts ?? []);
    } catch (err) {
      const { status, message } = parseApiErr(err);
      Alert.alert('Error', status === 403 ? 'You are not a member of this community.' : (message || 'Could not load community'));
      router.back();
    } finally {
      setLoading(false);
    }
  }, [id]);

  useFocusEffect(useCallback(() => { fetchCommunity(); }, [fetchCommunity]));

  const fetchPendingMembers = async () => {
    if (!id) return;
    setApprovalLoading(true);
    try {
      const res = await apiRequest('GET', `/api/communities/${id}/members?pending=true`);
      const data: { members: PendingMember[] } = await res.json();
      setPendingMembers(data.members ?? []);
    } catch { /* silent */ } finally {
      setApprovalLoading(false);
    }
  };

  const openApproval = () => {
    setShowApproval(true);
    fetchPendingMembers();
    Haptics.selectionAsync();
  };

  const handleApprove = async (memberId: string, action: 'approve' | 'decline') => {
    Haptics.selectionAsync();
    try {
      await apiRequest('PUT', `/api/communities/${id}/members/${memberId}`, { action });
      setPendingMembers(prev => prev.filter(m => m.id !== memberId));
      setCommunity(prev => prev ? { ...prev, pendingCount: Math.max(0, prev.pendingCount - 1) } : prev);
    } catch { /* silent */ }
  };

  const handlePost = async () => {
    if (!body.trim() || posting) return;
    setPosting(true);
    setPostError('');
    try {
      const res = await apiRequest('POST', `/api/communities/${id}/posts`, { body: body.trim() });
      const newPost: Post = await res.json();
      setPosts(prev => [newPost, ...prev]);
      setBody('');
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch (err) {
      const { status, message } = parseApiErr(err);
      if (status === 422) {
        setPostError(message || 'Your post violates community guidelines and could not be published.');
      } else {
        setPostError('Failed to post. Please try again.');
      }
    } finally {
      setPosting(false);
    }
  };

  const handleDeletePost = (postId: string) => {
    Alert.alert('Delete Post', 'Remove this post from the community?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete', style: 'destructive',
        onPress: async () => {
          try {
            await apiRequest('DELETE', `/api/communities/${id}/posts/${postId}`);
            setPosts(prev => prev.filter(p => p.id !== postId));
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
          } catch { /* silent */ }
        },
      },
    ]);
  };

  const handleLeave = () => {
    if (!community || leaving) return;
    Haptics.selectionAsync();
    Alert.alert(
      'Leave Community',
      `Are you sure you want to leave "${community.name}"? You will need to request access again to rejoin.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Leave', style: 'destructive',
          onPress: async () => {
            setLeaving(true);
            try {
              await apiRequest('DELETE', `/api/communities/${id}/leave`);
              Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
              router.replace('/(main)');
            } catch (err) {
              const { message } = parseApiErr(err);
              Alert.alert('Cannot Leave', message || 'Failed to leave community. Please try again.');
            } finally {
              setLeaving(false);
            }
          },
        },
      ]
    );
  };

  const copyInviteLink = async () => {
    if (!community) return;
    const link = `${getApiUrl()}/community/join/${community.inviteToken}`;
    await Clipboard.setStringAsync(link);
    setCopiedLink(true);
    setTimeout(() => setCopiedLink(false), 2000);
    Haptics.selectionAsync();
  };

  const pillarColor = PILLAR_COLORS[community?.pillar ?? 'Spiritual'] ?? '#9B7DD4';

  if (loading) {
    return (
      <View style={[s.loadingWrap, { backgroundColor: C.background }]}>
        <ActivityIndicator color={pillarColor} size="large" />
      </View>
    );
  }

  if (!community) return null;

  const isOwner = community.myRole === 'owner';

  return (
    <View style={[s.root, { backgroundColor: C.background }]}>
      {/* Header */}
      <View style={[s.header, { paddingTop: topInset + 4, backgroundColor: C.background, borderBottomColor: C.border }]}>
        <Pressable onPress={() => router.back()} hitSlop={10} style={s.backBtn}>
          <MaterialIcons name="arrow-back" size={22} color={C.textPrimary} />
        </Pressable>
        <View style={{ flex: 1 }}>
          <Text style={[s.headerTitle, { color: C.textPrimary }]} numberOfLines={1}>{community.name}</Text>
          <View style={s.headerSubRow}>
            <Text style={{ fontSize: 12 }}>{PILLAR_EMOJIS[community.pillar] ?? '🏆'}</Text>
            <Text style={[s.headerSub, { color: C.textTertiary }]}>{community.pillar}</Text>
          </View>
        </View>
        {/* Member count badge — tappable for all active members */}
        <Pressable
          style={[s.memberCountBtn, { backgroundColor: pillarColor + '14', borderColor: pillarColor + '35' }]}
          onPress={() => {
            Haptics.selectionAsync();
            router.push({ pathname: '/group-members/[id]', params: { id, type: 'community', name: community.name, color: pillarColor } } as any);
          }}
          hitSlop={6}
        >
          <MaterialIcons name="people" size={13} color={pillarColor} />
          <Text style={[s.memberCountText, { color: pillarColor }]}>{community.memberCount ?? 0}</Text>
        </Pressable>
        {isOwner && community.pendingCount > 0 && (
          <Pressable style={[s.pendingBtn, { backgroundColor: '#FEF3C7', borderColor: '#FDE68A' }]} onPress={openApproval}>
            <MaterialIcons name="person-add" size={15} color="#F59E0B" />
            <Text style={s.pendingBtnText}>{community.pendingCount}</Text>
          </Pressable>
        )}
        {isOwner && community.pendingCount === 0 && (
          <Pressable style={[s.pendingBtn, { backgroundColor: C.background, borderColor: C.border }]} onPress={openApproval}>
            <MaterialIcons name="people" size={15} color={C.textTertiary} />
          </Pressable>
        )}
        <Pressable
          style={[s.inviteBtn, { backgroundColor: pillarColor + '18', borderColor: pillarColor + '40' }]}
          onPress={copyInviteLink}
          hitSlop={6}
        >
          <MaterialIcons name={copiedLink ? 'check' : 'link'} size={15} color={pillarColor} />
          <Text style={[s.inviteBtnText, { color: pillarColor }]}>{copiedLink ? 'Copied!' : 'Invite'}</Text>
        </Pressable>
        <Pressable
          onPress={handleLeave}
          hitSlop={10}
          style={s.leaveBtn}
          disabled={leaving}
        >
          <MaterialIcons name="exit-to-app" size={22} color={C.textTertiary} />
        </Pressable>
      </View>

      {/* Posts */}
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={topInset + 56}
      >
        <FlatList
          data={posts}
          keyExtractor={p => p.id}
          contentContainerStyle={[s.feedContent, { paddingBottom: botInset + 80 }]}
          showsVerticalScrollIndicator={false}
          ListEmptyComponent={
            <View style={s.empty}>
              <Text style={{ fontSize: 36, marginBottom: 8 }}>💬</Text>
              <Text style={[s.emptyTitle, { color: C.textPrimary }]}>No posts yet</Text>
              <Text style={[s.emptyDesc, { color: C.textTertiary }]}>Be the first to share something!</Text>
            </View>
          }
          renderItem={({ item }) => {
            const isMine = item.authorId === user?.id;
            return (
              <View style={[s.postCard, { backgroundColor: C.cardBackground, borderColor: C.border }]}>
                <View style={s.postHeader}>
                  <View style={[s.avatar, { backgroundColor: pillarColor }]}>
                    <Text style={s.avatarText}>{(item.authorName[0] || 'M').toUpperCase()}</Text>
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={[s.authorName, { color: C.textPrimary }]} numberOfLines={1}>{item.authorName}</Text>
                    <Text style={[s.postTime, { color: C.textTertiary }]}>{timeAgo(item.createdAt)}</Text>
                  </View>
                  {(isMine || isOwner) && (
                    <Pressable hitSlop={8} onPress={() => handleDeletePost(item.id)}>
                      <MaterialIcons name="delete-outline" size={17} color={C.textTertiary} />
                    </Pressable>
                  )}
                </View>
                <Text style={[s.postBody, { color: C.textPrimary }]}>{item.body}</Text>
              </View>
            );
          }}
        />

        {/* Compose bar */}
        <View style={[s.composeBar, {
          backgroundColor: C.cardBackground,
          borderTopColor: C.border,
          paddingBottom: botInset + 8,
        }]}>
          {!!postError && (
            <Text style={[s.postError, { color: '#EF4444' }]}>{postError}</Text>
          )}
          <View style={s.composeRow}>
            <TextInput
              style={[s.composeInput, { color: C.textPrimary, borderColor: C.border, backgroundColor: C.background }]}
              placeholder="Share with your community…"
              placeholderTextColor={C.textTertiary}
              value={body}
              onChangeText={t => { setBody(t.slice(0, 500)); setPostError(''); }}
              multiline
              maxLength={500}
              returnKeyType="default"
            />
            <View style={s.composeRight}>
              <Text style={[s.charCount, { color: body.length > 450 ? '#EF4444' : C.textTertiary }]}>
                {500 - body.length}
              </Text>
              <Pressable
                style={[s.postBtn, { backgroundColor: body.trim() ? pillarColor : C.border, opacity: posting ? 0.7 : 1 }]}
                onPress={handlePost}
                disabled={!body.trim() || posting}
              >
                {posting
                  ? <ActivityIndicator size="small" color="#fff" />
                  : <MaterialIcons name="send" size={18} color="#fff" />
                }
              </Pressable>
            </View>
          </View>
        </View>
      </KeyboardAvoidingView>

      {/* Owner Approval Sheet */}
      {isOwner && (
        <Modal transparent visible={showApproval} onRequestClose={() => setShowApproval(false)} statusBarTranslucent animationType="slide">
          <View style={StyleSheet.absoluteFill}>
            <Pressable style={[StyleSheet.absoluteFill, { backgroundColor: 'rgba(0,0,0,0.5)' }]} onPress={() => setShowApproval(false)} />
            <View style={[s.approvalSheet, { backgroundColor: C.cardBackground, paddingBottom: botInset + 12 }]}>
              <View style={[s.approvalHandle, { backgroundColor: C.border }]} />
              <View style={s.approvalHeader}>
                <Text style={[s.approvalTitle, { color: C.textPrimary }]}>Join Requests</Text>
                <Pressable onPress={() => setShowApproval(false)} hitSlop={8}>
                  <MaterialIcons name="close" size={22} color={C.textTertiary} />
                </Pressable>
              </View>
              {approvalLoading && <ActivityIndicator color={pillarColor} style={{ marginVertical: 32 }} />}
              {!approvalLoading && pendingMembers.length === 0 && (
                <View style={{ padding: 32, alignItems: 'center' }}>
                  <Ionicons name="checkmark-circle-outline" size={40} color={C.textTertiary} />
                  <Text style={[s.emptyTitle, { color: C.textPrimary, marginTop: 10 }]}>All caught up!</Text>
                  <Text style={[s.emptyDesc, { color: C.textTertiary }]}>No pending requests</Text>
                </View>
              )}
              {!approvalLoading && pendingMembers.map(m => (
                <View key={m.id} style={[s.approvalRow, { borderBottomColor: C.border }]}>
                  <View style={[s.avatar, { backgroundColor: pillarColor }]}>
                    <Text style={s.avatarText}>{(m.name[0] || 'M').toUpperCase()}</Text>
                  </View>
                  <Text style={[s.authorName, { color: C.textPrimary, flex: 1 }]} numberOfLines={1}>{m.name}</Text>
                  <Pressable style={[s.approvalBtn, { backgroundColor: '#9B7DD4' }]} onPress={() => handleApprove(m.id, 'approve')}>
                    <Text style={s.approvalBtnText}>Approve</Text>
                  </Pressable>
                  <Pressable style={[s.approvalBtn, { backgroundColor: C.border }]} onPress={() => handleApprove(m.id, 'decline')}>
                    <Text style={[s.approvalBtnText, { color: C.textSecondary }]}>Decline</Text>
                  </Pressable>
                </View>
              ))}
            </View>
          </View>
        </Modal>
      )}
    </View>
  );
}

const s = StyleSheet.create({
  root: { flex: 1 },
  loadingWrap: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  header: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    paddingHorizontal: 16, paddingBottom: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  backBtn: { padding: 4 },
  headerTitle: { fontSize: 16, fontFamily: 'Inter_700Bold' },
  headerSubRow: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 1 },
  headerSub: { fontSize: 12, fontFamily: 'Inter_400Regular' },
  memberCountBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    paddingHorizontal: 9, paddingVertical: 5, borderRadius: 20, borderWidth: 1,
  },
  memberCountText: { fontSize: 11, fontFamily: 'Inter_600SemiBold' },
  pendingBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    paddingHorizontal: 10, paddingVertical: 6, borderRadius: 20, borderWidth: 1,
  },
  pendingBtnText: { fontSize: 12, fontFamily: 'Inter_700Bold', color: '#F59E0B' },
  inviteBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    paddingHorizontal: 10, paddingVertical: 6, borderRadius: 20, borderWidth: 1,
  },
  inviteBtnText: { fontSize: 12, fontFamily: 'Inter_600SemiBold' },
  leaveBtn: { padding: 4 },
  feedContent: { padding: 16, gap: 10 },
  empty: { alignItems: 'center', paddingTop: 60 },
  emptyTitle: { fontSize: 16, fontFamily: 'Inter_600SemiBold', marginBottom: 4 },
  emptyDesc: { fontSize: 13, fontFamily: 'Inter_400Regular', textAlign: 'center' },
  postCard: {
    borderRadius: 14, padding: 14, borderWidth: StyleSheet.hairlineWidth,
  },
  postHeader: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 8 },
  avatar: { width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  avatarText: { color: '#fff', fontSize: 13, fontFamily: 'Inter_700Bold' },
  authorName: { fontSize: 13, fontFamily: 'Inter_600SemiBold' },
  postTime: { fontSize: 11, fontFamily: 'Inter_400Regular', marginTop: 1 },
  postBody: { fontSize: 14, fontFamily: 'Inter_400Regular', lineHeight: 20 },
  composeBar: {
    borderTopWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: 16, paddingTop: 10,
  },
  postError: {
    fontSize: 12, fontFamily: 'Inter_400Regular',
    marginBottom: 6, lineHeight: 17,
  },
  composeRow: { flexDirection: 'row', alignItems: 'flex-end', gap: 10 },
  composeInput: {
    flex: 1, borderWidth: 1, borderRadius: 14,
    paddingHorizontal: 14, paddingVertical: 10,
    fontSize: 14, fontFamily: 'Inter_400Regular',
    maxHeight: 100, minHeight: 44,
  },
  composeRight: { alignItems: 'center', gap: 4 },
  charCount: { fontSize: 10, fontFamily: 'Inter_400Regular' },
  postBtn: {
    width: 42, height: 42, borderRadius: 21,
    alignItems: 'center', justifyContent: 'center',
  },
  approvalSheet: {
    position: 'absolute', bottom: 0, left: 0, right: 0,
    borderTopLeftRadius: 24, borderTopRightRadius: 24,
    maxHeight: 480,
    elevation: 20,
    shadowColor: '#000', shadowOpacity: 0.25, shadowRadius: 20,
  },
  approvalHandle: { width: 40, height: 4, borderRadius: 2, alignSelf: 'center', marginTop: 10, marginBottom: 4 },
  approvalHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, paddingVertical: 12 },
  approvalTitle: { fontSize: 17, fontFamily: 'Inter_700Bold' },
  approvalRow: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    paddingHorizontal: 20, paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  approvalBtn: { paddingHorizontal: 12, paddingVertical: 7, borderRadius: 8 },
  approvalBtnText: { fontSize: 12, fontFamily: 'Inter_600SemiBold', color: '#fff' },
});
