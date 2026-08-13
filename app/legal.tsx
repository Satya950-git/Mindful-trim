import React, { useEffect } from 'react';
import { View, Text, ActivityIndicator, StyleSheet, Linking, Platform, Pressable } from 'react-native';
import { useLocalSearchParams, router } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useThemeColors } from '@/context/ThemeContext';
import { getApiUrl } from '@/lib/query-client';

export default function LegalScreen() {
  const { type } = useLocalSearchParams<{ type?: string }>();
  const Colors = useThemeColors();
  const insets = useSafeAreaInsets();
  const topInset = Platform.OS === 'web' ? 67 : insets.top;

  const isTerms = type === 'terms';
  const title = isTerms ? 'Terms of Service' : 'Privacy Policy';
  const path = isTerms ? '/terms' : '/privacy';

  useEffect(() => {
    const url = `${getApiUrl()}${path}`;
    Linking.openURL(url).catch(() => {});
    router.canGoBack() ? router.back() : router.replace('/(main)/profile');
  }, []);

  return (
    <View style={[styles.container, { backgroundColor: Colors.background, paddingTop: topInset }]}>
      <View style={styles.header}>
        <Pressable onPress={() => router.canGoBack() ? router.back() : router.replace('/(main)/profile')} hitSlop={12}>
          <Ionicons name="chevron-back" size={24} color={Colors.textPrimary} />
        </Pressable>
        <Text style={[styles.title, { color: Colors.textPrimary }]}>{title}</Text>
        <View style={{ width: 24 }} />
      </View>
      <View style={styles.body}>
        <ActivityIndicator size="large" color={Colors.accent} />
        <Text style={[styles.hint, { color: Colors.textSecondary }]}>Opening in browser…</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  title: { fontSize: 17, fontFamily: 'Inter_600SemiBold' },
  body: { flex: 1, justifyContent: 'center', alignItems: 'center', gap: 16 },
  hint: { fontSize: 14, fontFamily: 'Inter_400Regular' },
});
