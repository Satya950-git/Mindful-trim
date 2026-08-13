import {
  Inter_400Regular,
  Inter_500Medium,
  Inter_600SemiBold,
  Inter_700Bold,
} from "@expo-google-fonts/inter";
import { useFonts } from "expo-font";
import IoniconsFontMap from "@expo/vector-icons/Ionicons";
import MaterialIconsFontMap from "@expo/vector-icons/MaterialIcons";
import MaterialCommunityIconsFontMap from "@expo/vector-icons/MaterialCommunityIcons";
import { QueryClientProvider } from "@tanstack/react-query";
import { Stack, router } from "expo-router";
import * as SplashScreen from "expo-splash-screen";
import React, { useEffect, useRef } from "react";
import { Platform, Linking, Animated, View, Text, Pressable, StyleSheet } from "react-native";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { KeyboardProvider } from "react-native-keyboard-controller";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useTranslation } from "react-i18next";

import "@/lib/i18n";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import { queryClient } from "@/lib/query-client";
import { AuthProvider, useAuth } from "@/context/AuthContext";
import { AppProvider } from "@/context/AppContext";
import { HabitsProvider, useHabits } from "@/context/HabitsContext";
import { ThemeProvider, useThemeColors } from "@/context/ThemeContext";
import { LanguageProvider, useLanguage } from "@/context/LanguageContext";
import { FriendActivityProvider, useFriendActivity } from "@/context/FriendActivityContext";
import { initNotifications, registerPushToken, unregisterPushToken, startInboxPolling, clearSeenInboxIds } from "@/services/notificationService";
import { getApiUrl } from "@/lib/query-client";
import * as Notifications from 'expo-notifications';
import { MaterialIcons } from "@expo/vector-icons";

// ─── Global config-sync error snackbar ───────────────────────────────────────
// Rendered inside HabitsProvider so it can read configSyncError from context.
// Shown at the bottom of the screen on any screen whenever a boot-time
// journey config reconciliation fails.
function ConfigSyncErrorSnackbar() {
  const { configSyncError, dismissConfigSyncError } = useHabits();
  const C = useThemeColors();
  const insets = useSafeAreaInsets();
  const opacity = useRef(new Animated.Value(0)).current;
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const botInset = Platform.OS === 'web' ? 34 : insets.bottom;

  useEffect(() => {
    if (configSyncError) {
      Animated.timing(opacity, { toValue: 1, duration: 220, useNativeDriver: true }).start();
      timerRef.current = setTimeout(() => {
        Animated.timing(opacity, { toValue: 0, duration: 280, useNativeDriver: true })
          .start(() => dismissConfigSyncError());
      }, 5000);
    } else {
      opacity.setValue(0);
    }
    return () => { if (timerRef.current) clearTimeout(timerRef.current); };
  }, [configSyncError]);

  if (!configSyncError) return null;

  return (
    <Animated.View
      style={[
        syncSnackSt.wrap,
        { backgroundColor: C.cardBackground, bottom: botInset + 16, opacity },
      ]}
    >
      <MaterialIcons name="cloud-off" size={16} color="#F59E0B" />
      <Text style={[syncSnackSt.text, { color: C.textPrimary }]} numberOfLines={3}>
        {configSyncError}
      </Text>
      <Pressable onPress={dismissConfigSyncError} hitSlop={8}>
        <MaterialIcons name="close" size={16} color={C.textTertiary} />
      </Pressable>
    </Animated.View>
  );
}

const syncSnackSt = StyleSheet.create({
  wrap: {
    position: 'absolute', left: 16, right: 16,
    flexDirection: 'row', alignItems: 'center', gap: 10,
    borderRadius: 14, padding: 14,
    shadowColor: '#000', shadowOpacity: 0.15, shadowRadius: 8,
    shadowOffset: { width: 0, height: 4 }, elevation: 6,
    zIndex: 999,
  },
  text: { flex: 1, fontSize: 13, fontFamily: 'Inter_400Regular', lineHeight: 18 },
});

// ─── Global friend-activity toast ────────────────────────────────────────────
// Rendered inside FriendActivityProvider so it can react to newly-arrived
// friend requests and requests that just got accepted, anywhere in the app.
function FriendActivityToast() {
  const { toast, dismissToast } = useFriendActivity();
  const { t } = useTranslation();
  const C = useThemeColors();
  const insets = useSafeAreaInsets();
  const topInset = Platform.OS === 'web' ? 67 : insets.top;
  const translateY = useRef(new Animated.Value(-120)).current;
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (toast) {
      Animated.timing(translateY, { toValue: 0, duration: 320, useNativeDriver: true }).start();
      timerRef.current = setTimeout(() => {
        Animated.timing(translateY, { toValue: -120, duration: 260, useNativeDriver: true })
          .start(() => dismissToast());
      }, 3800);
    } else {
      translateY.setValue(-120);
    }
    return () => { if (timerRef.current) clearTimeout(timerRef.current); };
  }, [toast]);

  if (!toast) return null;

  const message = toast.kind === 'received'
    ? t('social.notifyRequestReceived', { name: toast.name })
    : toast.kind === 'accepted'
    ? t('social.notifyRequestAccepted', { name: toast.name })
    : t('social.notifyGroupInvite', { name: toast.name, groupName: (toast as any).groupName });

  const iconName =
    toast.kind === 'received' ? 'person-add' :
    toast.kind === 'accepted' ? 'how-to-reg' :
    'group-add';

  const iconColor =
    toast.kind === 'group-invite' ? '#56C596' : '#9B7DD4';

  return (
    <Animated.View
      style={[
        friendToastSt.wrap,
        { top: topInset + 8, backgroundColor: C.cardBackground, transform: [{ translateY }] },
      ]}
    >
      <MaterialIcons
        name={iconName}
        size={18}
        color={iconColor}
      />
      <Text style={[friendToastSt.text, { color: C.textPrimary }]} numberOfLines={2}>
        {message}
      </Text>
      <Pressable onPress={dismissToast} hitSlop={8}>
        <MaterialIcons name="close" size={16} color={C.textTertiary} />
      </Pressable>
    </Animated.View>
  );
}

const friendToastSt = StyleSheet.create({
  wrap: {
    position: 'absolute', left: 16, right: 16,
    flexDirection: 'row', alignItems: 'center', gap: 10,
    borderRadius: 14, padding: 14,
    shadowColor: '#000', shadowOpacity: 0.15, shadowRadius: 8,
    shadowOffset: { width: 0, height: 4 }, elevation: 6,
    zIndex: 1000,
  },
  text: { flex: 1, fontSize: 13, fontFamily: 'Inter_500Medium', lineHeight: 18 },
});

if (Platform.OS === 'web' && typeof document !== 'undefined') {
  const link = document.createElement('link');
  link.rel = 'stylesheet';
  link.href = 'https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap';
  document.head.appendChild(link);
}

SplashScreen.preventAutoHideAsync();

function parseInviteUrl(url: string): { fromUserId: string; fromName: string } | null {
  try {
    if (!url.includes('invite')) return null;
    // Normalise: custom scheme → https so URL constructor parses it cleanly
    const normalized = url
      .replace(/^mindfultrim:\/\//, 'https://app/')
      .replace(/^exp:\/\/[^/]+\/--(\/invite)/, 'https://app$1');
    const parsed = new URL(normalized);
    // New format: ?p=base64url(JSON.stringify({ u, n }))
    const p = parsed.searchParams.get('p');
    if (p) {
      // Restore standard base64 from URL-safe encoding (encodeURIComponent was used)
      const b64 = p.replace(/ /g, '+'); // guard against accidental space decode
      const { u, n } = JSON.parse(atob(b64));
      if (!u) return null;
      return { fromUserId: String(u), fromName: n ? decodeURIComponent(String(n)) : 'A friend' };
    }
    // Legacy fallback: ?fromUserId=…&fromName=…
    const fromUserId = parsed.searchParams.get('fromUserId');
    const fromName = parsed.searchParams.get('fromName');
    if (!fromUserId) return null;
    return { fromUserId, fromName: fromName ? decodeURIComponent(fromName) : 'A friend' };
  } catch {
    return null;
  }
}

function parseCommunityJoinUrl(url: string): { token: string } | null {
  try {
    const normalized = url
      .replace(/^mindfultrim:\/\//, 'https://app/')
      .replace(/^exp:\/\/[^/]+\/--/, 'https://app');
    const parsed = new URL(normalized);
    // Match /community/join/<token>
    const match = parsed.pathname.match(/\/community\/join\/([a-f0-9]{32})/);
    if (match) return { token: match[1] };
    return null;
  } catch {
    return null;
  }
}

function parseRefUrl(url: string): { refUserId: string; refName: string } | null {
  try {
    const normalized = url
      .replace(/^mindfultrim:\/\//, 'https://app/')
      .replace(/^exp:\/\/[^/]+\/--/, 'https://app');
    const parsed = new URL(normalized);
    const ref = parsed.searchParams.get('ref');
    if (!ref) return null;
    const rn = parsed.searchParams.get('rn');
    return { refUserId: ref, refName: rn ? decodeURIComponent(rn) : 'A friend' };
  } catch {
    return null;
  }
}

// ─── Push token registration / deregistration ────────────────────────────────
// Sits inside AuthProvider so it can watch the user state.
function PushTokenSync() {
  const { user } = useAuth();
  const prevUserIdRef = useRef<string | null>(null);

  useEffect(() => {
    const prevId = prevUserIdRef.current;
    const currId = user?.id ?? null;

    if (currId && currId !== prevId) {
      // User just logged in or changed — register push token
      registerPushToken().catch(() => {});
    } else if (!currId && prevId) {
      // User just logged out — clear push token
      unregisterPushToken().catch(() => {});
    }

    prevUserIdRef.current = currId;
  }, [user?.id]);

  return null;
}

// Polls the inbox every 30 s and fires a local notification for each new
// invite / request that hasn't been notified yet. Works in Expo Go.
function InboxPoller() {
  const { user } = useAuth();
  const stopRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    if (!user) {
      stopRef.current?.();
      stopRef.current = null;
      clearSeenInboxIds().catch(() => {});
      return;
    }

    const apiBase = getApiUrl();
    stopRef.current = startInboxPolling(apiBase);

    return () => {
      stopRef.current?.();
      stopRef.current = null;
    };
  }, [user?.id]);

  return null;
}

function RootLayoutNav() {
  useEffect(() => {
    function handleUrl({ url }: { url: string }) {
      const community = parseCommunityJoinUrl(url);
      if (community) {
        router.push({ pathname: '/community-join', params: community });
        return;
      }
      const invite = parseInviteUrl(url);
      if (invite) {
        router.push({
          pathname: '/friend-request',
          params: invite,
        });
      }
      const ref = parseRefUrl(url);
      if (ref) {
        AsyncStorage.setItem('pending_referral', JSON.stringify(ref)).catch(() => {});
      }
    }

    // App already open — listen for new URLs
    const sub = Linking.addEventListener('url', handleUrl);

    // Cold start — check initial URL (delay so navigator is ready)
    Linking.getInitialURL().then((url) => {
      if (url) setTimeout(() => handleUrl({ url }), 600);
    });

    // Handle notification taps — foreground, background, and cold-start
    function handleNotificationResponse(response: Notifications.NotificationResponse) {
      const data = response.notification.request.content.data as Record<string, unknown> | undefined;
      const screen = (data?.screen as string | undefined) ?? '';
      // Inbox-based local notifications carry challengeType/challengeId instead of screen
      const challengeType = (data?.challengeType as string | undefined) ?? '';
      const challengeId = (data?.challengeId as string | undefined) ?? '';

      setTimeout(() => {
        // --- Remote push screen routing ---
        if (screen === 'friend-request') {
          const fromUserId = data?.fromUserId as string | undefined;
          const fromName = data?.fromName as string | undefined;
          if (fromUserId) {
            router.push({ pathname: '/friend-request', params: { fromUserId, fromName: fromName ?? 'A friend' } });
          } else {
            router.push('/(main)/social' as any);
          }
        } else if (screen === 'social') {
          router.push('/(main)/social' as any);
        } else if (screen === '1on1-challenge') {
          router.push('/(main)/social' as any);
        } else if (screen === 'coop-group') {
          const groupId = (data?.groupId as string | undefined) ?? challengeId;
          if (groupId) {
            router.push({ pathname: '/community/[id]', params: { id: groupId } } as any);
          } else {
            router.push('/(main)/social' as any);
          }
        // --- Inbox-based local notification routing (Expo Go fallback) ---
        } else if (challengeType === 'friend-request') {
          router.push('/(main)/social' as any);
        } else if (challengeType === 'coop-invite') {
          if (challengeId) {
            router.push({ pathname: '/community/[id]', params: { id: challengeId } } as any);
          } else {
            router.push('/(main)/social' as any);
          }
        } else if (challengeType === 'coop' || challengeType === '1on1') {
          if (challengeId) {
            router.push({ pathname: '/community/[id]', params: { id: challengeId } } as any);
          } else {
            router.push('/(main)/social' as any);
          }
        } else {
          // daily_reminder and any unknown payload
          router.push('/');
        }
      }, 300);
    }

    // Listen for taps while app is open or resumed from background
    const notifSub = Notifications.addNotificationResponseReceivedListener(handleNotificationResponse);

    // Immediately refresh inbox badge when a notification arrives in the foreground
    const notifReceiveSub = Notifications.addNotificationReceivedListener(() => {
      queryClient.invalidateQueries({ queryKey: ['/api/inbox/unread-count'] });
    });

    // Handle tap that cold-started the app
    Notifications.getLastNotificationResponseAsync()
      .then((response) => {
        if (response) handleNotificationResponse(response);
      })
      .catch(() => {});

    return () => {
      sub.remove();
      notifSub.remove();
      notifReceiveSub.remove();
    };
  }, []);

  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="index" />
      <Stack.Screen name="welcome" />
      <Stack.Screen name="login" />
      <Stack.Screen name="register" />
      <Stack.Screen name="forgot-password" />
      <Stack.Screen name="reset-password" />
      <Stack.Screen name="onboarding" />
      <Stack.Screen name="(main)" />
      <Stack.Screen name="checkin" />
      <Stack.Screen name="exercise" />
      <Stack.Screen name="completion" />
      <Stack.Screen name="levelup" />
      <Stack.Screen name="legal" />
      <Stack.Screen name="setup-security-question" />
      <Stack.Screen name="habits" />
      <Stack.Screen name="friend-request" />
      <Stack.Screen name="community-join" />
      <Stack.Screen name="community/[id]" />
    </Stack>
  );
}

function useAppFonts() {
  return useFonts({
    Inter_400Regular,
    Inter_500Medium,
    Inter_600SemiBold,
    Inter_700Bold,
    ...IoniconsFontMap.font,
    ...MaterialIconsFontMap.font,
    ...MaterialCommunityIconsFontMap.font,
  });
}

function AppContent() {
  const { languageLoaded } = useLanguage();
  const [fontsLoaded, fontError] = useAppFonts();

  useEffect(() => {
    if ((fontsLoaded || fontError) && languageLoaded) {
      SplashScreen.hideAsync();
      // Initialize push notifications after fonts + language are ready
      initNotifications().catch(() => {});
    }
  }, [fontsLoaded, fontError, languageLoaded]);

  if (!fontsLoaded && !fontError) return null;
  if (!languageLoaded) return null;

  return (
    <ThemeProvider>
      <AuthProvider>
        <PushTokenSync />
        <InboxPoller />
        <AppProvider>
          <HabitsProvider>
            <FriendActivityProvider>
              <View style={{ flex: 1 }}>
                <RootLayoutNav />
                <ConfigSyncErrorSnackbar />
                <FriendActivityToast />
              </View>
            </FriendActivityProvider>
          </HabitsProvider>
        </AppProvider>
      </AuthProvider>
    </ThemeProvider>
  );
}

export default function RootLayout() {
  return (
    <ErrorBoundary>
      <QueryClientProvider client={queryClient}>
        <GestureHandlerRootView>
          <KeyboardProvider>
            <LanguageProvider>
              <AppContent />
            </LanguageProvider>
          </KeyboardProvider>
        </GestureHandlerRootView>
      </QueryClientProvider>
    </ErrorBoundary>
  );
}
