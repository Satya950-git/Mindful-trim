import React from 'react';
import { Tabs } from "expo-router";
import { BlurView } from "expo-blur";
import { Platform, StyleSheet, View } from "react-native";
import { Ionicons, MaterialIcons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { useThemeColors } from '@/context/ThemeContext';
import { useQuery } from '@tanstack/react-query';
import { getQueryFn } from '@/lib/query-client';

type FriendsData = { accepted: { friendshipId: string; userId: string; name: string }[]; pending: { friendshipId: string; userId: string; name: string }[]; outgoing: any[] };

function TabLayout() {
  const Colors = useThemeColors();
  const { t } = useTranslation();
  const isWeb = Platform.OS === 'web';
  const isIOS = Platform.OS === 'ios';
  const isAndroid = Platform.OS === 'android';

  const { data: friendsData } = useQuery<FriendsData>({
    queryKey: ['/api/friends'],
    queryFn: getQueryFn({ on401: 'throw' }),
    staleTime: 60000,
  });

  const pendingCount = friendsData?.pending?.length ?? 0;

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: Colors.accent,
        tabBarInactiveTintColor: Colors.textTertiary,
        tabBarStyle: {
          ...(isIOS || isWeb ? { position: 'absolute' as const } : {}),
          backgroundColor: isIOS ? 'transparent' : Colors.tabBarBg,
          borderTopWidth: 0,
          borderTopColor: Colors.border,
          elevation: isAndroid ? 8 : 0,
          ...(isWeb ? { height: 84 } : {}),
        },
        tabBarBackground: () =>
          isIOS ? (
            <BlurView intensity={100} tint={Colors.tabBarBlurTint} style={StyleSheet.absoluteFill} />
          ) : isWeb ? (
            <View style={[StyleSheet.absoluteFill, { backgroundColor: Colors.tabBarBg }]} />
          ) : null,
        tabBarLabelStyle: {
          fontFamily: 'Inter_500Medium',
          fontSize: 11,
        },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: t('tabs.home'),
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="home" size={size} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="yearmap"
        options={{
          title: t('tabs.yearMap'),
          tabBarIcon: ({ color, size }) => (
            <MaterialIcons name="map" size={size} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="gallery"
        options={{
          title: t('tabs.artifacts'),
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="trophy" size={size} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="social"
        options={{
          title: t('tabs.social'),
          tabBarBadge: pendingCount > 0 ? (pendingCount > 99 ? '99+' : String(pendingCount)) : undefined,
          tabBarIcon: ({ color, size }) => (
            <MaterialIcons name="groups" size={size} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="profile"
        options={{
          tabBarButton: () => null,
          tabBarItemStyle: { display: 'none' },
        }}
      />
    </Tabs>
  );
}

export default function MainLayout() {
  return <TabLayout />;
}
