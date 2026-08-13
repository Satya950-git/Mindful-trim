import React, { useState, useEffect } from 'react';
import {
  View, Text, StyleSheet, Pressable, ActivityIndicator, Platform,
} from 'react-native';
import { useLocalSearchParams, router } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { MaterialIcons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';

import { useThemeColors } from '@/context/ThemeContext';
import { apiRequest } from '@/lib/query-client';

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

type CommunityInfo = {
  id: string; name: string; description: string; pillar: string; memberCount: number;
  myStatus: 'active' | 'pending' | null;
};

export default function CommunityJoinScreen() {
  const { token } = useLocalSearchParams<{ token: string }>();
  const C = useThemeColors();
  const insets = useSafeAreaInsets();
  const topInset = Platform.OS === 'web' ? 67 : insets.top;
  const botInset = Platform.OS === 'web' ? 34 : insets.bottom;

  const [info, setInfo] = useState<CommunityInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [joining, setJoining] = useState(false);
  const [joinStatus, setJoinStatus] = useState<'idle' | 'pending' | 'active'>('idle');

  useEffect(() => {
    if (!token) { setError('Invalid invite link'); setLoading(false); return; }
    apiRequest('GET', `/api/communities/join/${token}`)
      .then(async res => {
        const data: CommunityInfo = await res.json();
        setInfo(data);
        if (data.myStatus === 'active') setJoinStatus('active');
        else if (data.myStatus === 'pending') setJoinStatus('pending');
      })
      .catch((err) => {
        const { status, message } = parseApiErr(err);
        setError(status === 404 ? 'Community not found' : (message || 'Could not load community'));
      })
      .finally(() => setLoading(false));
  }, [token]);

  const handleJoin = async () => {
    if (!token) return;
    setJoining(true);
    try {
      const res = await apiRequest('POST', `/api/communities/join/${token}`);
      const data = await res.json();
      setJoinStatus(data.status === 'active' ? 'active' : 'pending');
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch (err) {
      const { message } = parseApiErr(err);
      setError(message || 'Failed to join. Please try again.');
    } finally {
      setJoining(false);
    }
  };

  const pillarColor = PILLAR_COLORS[info?.pillar ?? 'Spiritual'] ?? '#9B7DD4';
  const pillarEmoji = PILLAR_EMOJIS[info?.pillar ?? 'Spiritual'] ?? '🏆';

  return (
    <View style={[s.root, { backgroundColor: C.background, paddingTop: topInset, paddingBottom: botInset }]}>
      <Pressable onPress={() => router.back()} style={s.backBtn} hitSlop={10}>
        <MaterialIcons name="arrow-back" size={22} color={C.textPrimary} />
      </Pressable>

      {loading && (
        <View style={s.center}>
          <ActivityIndicator size="large" color="#9B7DD4" />
        </View>
      )}

      {!loading && !!error && (
        <View style={s.center}>
          <MaterialIcons name="error-outline" size={48} color={C.textTertiary} />
          <Text style={[s.errorText, { color: C.textPrimary }]}>{error}</Text>
          <Pressable style={[s.btn, { backgroundColor: '#9B7DD4', marginTop: 20 }]} onPress={() => router.back()}>
            <Text style={s.btnText}>Go Back</Text>
          </Pressable>
        </View>
      )}

      {!loading && !error && info && (
        <View style={s.content}>
          <View style={[s.pillarBadge, { backgroundColor: pillarColor + '20' }]}>
            <Text style={{ fontSize: 40 }}>{pillarEmoji}</Text>
          </View>

          <Text style={[s.inviteLabel, { color: C.textTertiary }]}>You've been invited to</Text>
          <Text style={[s.communityName, { color: C.textPrimary }]}>{info.name}</Text>

          {!!info.description && (
            <Text style={[s.description, { color: C.textSecondary }]}>{info.description}</Text>
          )}

          <View style={[s.metaRow, { backgroundColor: C.cardBackground, borderColor: C.border }]}>
            <View style={s.metaItem}>
              <Text style={{ fontSize: 18 }}>{pillarEmoji}</Text>
              <Text style={[s.metaLabel, { color: C.textTertiary }]}>{info.pillar}</Text>
            </View>
            <View style={[s.metaDivider, { backgroundColor: C.border }]} />
            <View style={s.metaItem}>
              <Text style={{ fontSize: 18 }}>👥</Text>
              <Text style={[s.metaLabel, { color: C.textTertiary }]}>
                {info.memberCount} {info.memberCount === 1 ? 'member' : 'members'}
              </Text>
            </View>
          </View>

          {joinStatus === 'idle' && (
            <Pressable
              style={[s.btn, { backgroundColor: pillarColor, opacity: joining ? 0.7 : 1 }]}
              onPress={handleJoin}
              disabled={joining}
            >
              {joining
                ? <ActivityIndicator size="small" color="#fff" />
                : <Text style={s.btnText}>Request to Join</Text>
              }
            </Pressable>
          )}

          {joinStatus === 'pending' && (
            <View style={[s.statusCard, { backgroundColor: '#FEF3C720', borderColor: '#FDE68A' }]}>
              <MaterialIcons name="schedule" size={22} color="#F59E0B" />
              <View style={{ flex: 1 }}>
                <Text style={[s.statusTitle, { color: '#92400E' }]}>Request sent</Text>
                <Text style={[s.statusDesc, { color: '#A16207' }]}>
                  Waiting for owner approval. You'll be able to join once approved.
                </Text>
              </View>
            </View>
          )}

          {joinStatus === 'active' && (
            <>
              <View style={[s.statusCard, { backgroundColor: '#D1FAE520', borderColor: '#6EE7B7' }]}>
                <MaterialIcons name="check-circle" size={22} color="#059669" />
                <View style={{ flex: 1 }}>
                  <Text style={[s.statusTitle, { color: '#065F46' }]}>You're a member!</Text>
                  <Text style={[s.statusDesc, { color: '#047857' }]}>You can now view and post in this community.</Text>
                </View>
              </View>
              <Pressable
                style={[s.btn, { backgroundColor: pillarColor, marginTop: 16 }]}
                onPress={() => router.replace(`/community/${info.id}` as any)}
              >
                <Text style={s.btnText}>Open Community</Text>
              </Pressable>
            </>
          )}
        </View>
      )}
    </View>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, paddingHorizontal: 24 },
  backBtn: { padding: 4, alignSelf: 'flex-start', marginBottom: 20 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12 },
  errorText: { fontSize: 16, fontFamily: 'Inter_500Medium', textAlign: 'center' },
  content: { flex: 1, alignItems: 'center', paddingTop: 20 },
  pillarBadge: {
    width: 90, height: 90, borderRadius: 45,
    alignItems: 'center', justifyContent: 'center', marginBottom: 20,
  },
  inviteLabel: { fontSize: 14, fontFamily: 'Inter_400Regular', marginBottom: 6 },
  communityName: { fontSize: 26, fontFamily: 'Inter_700Bold', textAlign: 'center', marginBottom: 10 },
  description: {
    fontSize: 14, fontFamily: 'Inter_400Regular', textAlign: 'center',
    lineHeight: 20, marginBottom: 24, paddingHorizontal: 16,
  },
  metaRow: {
    flexDirection: 'row', alignItems: 'center', borderWidth: 1,
    borderRadius: 16, padding: 16, gap: 0, marginBottom: 28, alignSelf: 'stretch',
  },
  metaItem: { flex: 1, alignItems: 'center', gap: 4 },
  metaLabel: { fontSize: 12, fontFamily: 'Inter_500Medium' },
  metaDivider: { width: 1, height: 28 },
  btn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 8, paddingVertical: 15, borderRadius: 14,
    alignSelf: 'stretch',
  },
  btnText: { color: '#fff', fontSize: 16, fontFamily: 'Inter_600SemiBold' },
  statusCard: {
    flexDirection: 'row', alignItems: 'flex-start', gap: 12,
    padding: 16, borderRadius: 14, borderWidth: 1, alignSelf: 'stretch',
  },
  statusTitle: { fontSize: 14, fontFamily: 'Inter_700Bold', marginBottom: 3 },
  statusDesc: { fontSize: 13, fontFamily: 'Inter_400Regular', lineHeight: 18 },
});
