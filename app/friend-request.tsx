import React, { useState } from 'react';
import {
  View, Text, StyleSheet, Pressable, ActivityIndicator, Platform,
} from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { MaterialIcons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';

import { useThemeColors } from '@/context/ThemeContext';
import { useQueryClient } from '@tanstack/react-query';
import { apiRequest } from '@/lib/query-client';

export default function FriendRequestScreen() {
  const C = useThemeColors();
  const insets = useSafeAreaInsets();
  const { fromUserId, fromName } = useLocalSearchParams<{ fromUserId: string; fromName: string }>();

  const [status, setStatus] = useState<'idle' | 'accepting' | 'accepted' | 'declined'>('idle');
  const [error, setError] = useState('');
  const queryClient = useQueryClient();

  const name = fromName ? decodeURIComponent(fromName as string) : 'A friend';
  const initial = (name[0] || 'F').toUpperCase();

  const topPad = Platform.OS === 'web' ? 67 : insets.top;
  const botPad = Platform.OS === 'web' ? 34 : insets.bottom;

  const handleAccept = async () => {
    if (!fromUserId) {
      setError('Invalid invite link. Please ask your friend to send a new invite.');
      return;
    }
    setStatus('accepting');
    setError('');
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    try {
      await apiRequest('POST', '/api/friends/request', { toUserId: fromUserId });
      queryClient.invalidateQueries({ queryKey: ['/api/friends'] });
      setStatus('accepted');
      setTimeout(() => router.replace('/(main)'), 1800);
    } catch {
      setError('Could not connect. Please try again.');
      setStatus('idle');
    }
  };

  const handleDecline = () => {
    setStatus('declined');
    Haptics.selectionAsync();
    setTimeout(() => router.replace('/(main)'), 600);
  };

  return (
    <View style={[s.root, { backgroundColor: C.background, paddingTop: topPad, paddingBottom: botPad }]}>
      <Pressable style={[s.backBtn, { top: topPad + 8 }]} onPress={() => router.replace('/(main)')}>
        <MaterialIcons name="arrow-back" size={22} color={C.textTertiary} />
      </Pressable>

      <View style={s.card}>
        <View style={[s.avatar, { backgroundColor: '#9B7DD4' }]}>
          <Text style={s.avatarInitial}>{initial}</Text>
        </View>

        <Text style={[s.heading, { color: C.textPrimary }]}>Friend Request</Text>
        <Text style={[s.subText, { color: C.textSecondary }]}>
          <Text style={{ fontFamily: 'Inter_700Bold', color: C.textPrimary }}>{name}</Text>
          {' '}wants to join your{'\n'}Accountability Network
        </Text>

        {error ? (
          <Text style={s.errorText}>{error}</Text>
        ) : null}

        {status === 'accepted' ? (
          <View style={[s.badge, { backgroundColor: '#22C55E18' }]}>
            <MaterialIcons name="check-circle" size={22} color="#22C55E" />
            <Text style={[s.badgeText, { color: '#22C55E' }]}>Connected!</Text>
          </View>
        ) : status === 'declined' ? (
          <View style={[s.badge, { backgroundColor: C.border }]}>
            <Text style={[s.badgeText, { color: C.textTertiary }]}>Request declined</Text>
          </View>
        ) : (
          <View style={s.actions}>
            <Pressable
              style={[s.btn, s.acceptBtn, { opacity: status === 'accepting' ? 0.7 : 1 }]}
              onPress={handleAccept}
              disabled={status === 'accepting'}
            >
              {status === 'accepting'
                ? <ActivityIndicator size="small" color="#fff" />
                : <Text style={s.acceptText}>Accept</Text>
              }
            </Pressable>
            <Pressable
              style={[s.btn, s.declineBtn, { borderColor: C.border }]}
              onPress={handleDecline}
              disabled={status === 'accepting'}
            >
              <Text style={[s.declineText, { color: C.textSecondary }]}>Decline</Text>
            </Pressable>
          </View>
        )}
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 },
  backBtn: {
    position: 'absolute', left: 20, padding: 8,
    zIndex: 10,
  },
  card: { alignItems: 'center', gap: 16, width: '100%', maxWidth: 340 },
  avatar: {
    width: 80, height: 80, borderRadius: 40,
    alignItems: 'center', justifyContent: 'center',
  },
  avatarInitial: { fontSize: 34, color: '#fff', fontFamily: 'Inter_700Bold' },
  heading: { fontSize: 24, fontFamily: 'Inter_700Bold' },
  subText: {
    fontSize: 15, fontFamily: 'Inter_400Regular',
    textAlign: 'center', lineHeight: 22,
  },
  errorText: { fontSize: 13, color: '#EF4444', fontFamily: 'Inter_400Regular', textAlign: 'center' },
  actions: { flexDirection: 'row', gap: 12, marginTop: 8, width: '100%' },
  btn: {
    flex: 1, paddingVertical: 15, borderRadius: 14,
    alignItems: 'center', justifyContent: 'center',
  },
  acceptBtn: { backgroundColor: '#9B7DD4' },
  declineBtn: { borderWidth: 1.5 },
  acceptText: { color: '#fff', fontSize: 16, fontFamily: 'Inter_600SemiBold' },
  declineText: { fontSize: 16, fontFamily: 'Inter_600SemiBold' },
  badge: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    paddingHorizontal: 20, paddingVertical: 12,
    borderRadius: 12, marginTop: 8,
  },
  badgeText: { fontSize: 16, fontFamily: 'Inter_600SemiBold' },
});
