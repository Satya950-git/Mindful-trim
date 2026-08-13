import React, { useState, useCallback, useEffect } from 'react';
import {
  View, Text, StyleSheet, ScrollView, Platform, Pressable, Alert, Dimensions, Image,
  Modal, TextInput, KeyboardAvoidingView, ActivityIndicator, BackHandler,
} from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { MaterialIcons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import Svg, { Path, Defs, LinearGradient as SvgGrad, Stop } from 'react-native-svg';
import { useQuery } from '@tanstack/react-query';
import Animated, {
  useSharedValue, useAnimatedStyle, withSequence, withSpring,
} from 'react-native-reanimated';

import { useTranslation } from 'react-i18next';

import { useAuth } from '@/context/AuthContext';
import { useApp } from '@/context/AppContext';
import { useFriendActivity } from '@/context/FriendActivityContext';
import { useTheme, useThemeColors, usePillarColors, pillarIcons } from '@/context/ThemeContext';
import { useLanguage } from '@/context/LanguageContext';
import { apiRequest, getApiUrl, getAuthToken } from '@/lib/query-client';

const SCREEN_W = Dimensions.get('window').width;
const CL = Math.min(SCREEN_W - 24, 340); // clover container px

/* ─── Heart geometry ──────────────────────────────────────────────────────────
 *
 * The canonical heart has its TIP at (0, 0) and bumps extending in the −y
 * direction (up on screen).  Control points are all in "unit" coordinates
 * where the heart is ~104 units tall.
 *
 * For each petal we:
 *   1. Rotate every control point by θ degrees (clockwise on screen).
 *   2. Scale by S = (CL × 0.46) / 104  so the heart fills ~46 % of CL.
 *   3. Translate by (CL/2, CL/2) so the rotated tip lands at the exact centre.
 *
 * Because the tip is at (0, 0) it is unaffected by rotation and scale, so the
 * translate always places it precisely at the clover centre.
 *
 * Rotation verification (SVG/screen y-down, positive θ = clockwise):
 *   rotate(θ):  x′ = x·cosθ − y·sinθ
 *               y′ = x·sinθ + y·cosθ
 *
 *   For bump direction (0, −1) rotated by θ to go NW (top-left) = (−0.707, −0.707):
 *     x′ = 0·cosθ − (−1)·sinθ = sinθ = −0.707  →  θ = −45°
 *     y′ = 0·sinθ + (−1)·cosθ = −cosθ = −0.707  →  θ = −45°  ✓ for TL
 *
 *   TL: θ = −45°   (bumps → NW, tip → SE = centre)
 *   TR: θ = +45°   (bumps → NE, tip → SW = centre)
 *   BL: θ = −135°  (bumps → SW, tip → NE = centre)
 *   BR: θ = +135°  (bumps → SE, tip → NW = centre)
 */

/** Scale: map 104-unit heart height to ~46 % of the clover */
const S = (CL * 0.46) / 104;

/*
 * GAP: each heart's tip is offset this many px from the exact centre,
 * moving toward its own quadrant — creating visible breathing room.
 * The offset direction is (±cos45, ±sin45) = (±0.707, ±0.707).
 */
const GAP = 10; // px
const D = GAP * 0.7071; // component along each axis

type Position = 'tl' | 'tr' | 'bl' | 'br';

/** Per-petal tip centres (shifted away from clover centre into each quadrant) */
const TIP: Record<Position, { cx: number; cy: number }> = {
  tl: { cx: CL / 2 - D, cy: CL / 2 - D },
  tr: { cx: CL / 2 + D, cy: CL / 2 - D },
  bl: { cx: CL / 2 - D, cy: CL / 2 + D },
  br: { cx: CL / 2 + D, cy: CL / 2 + D },
};

/** Rotate a unit point, scale, translate to tip centre, return SVG coord string */
function rp(x: number, y: number, cosT: number, sinT: number, cx: number, cy: number): string {
  const xr = (x * cosT - y * sinT) * S + cx;
  const yr = (x * sinT + y * cosT) * S + cy;
  return `${xr.toFixed(2)},${yr.toFixed(2)}`;
}

/**
 * Build a pre-rotated heart SVG path with tip at the given (cx, cy).
 * θ is in degrees, clockwise on screen (SVG y-down convention).
 */
function heartPath(thetaDeg: number, cx: number, cy: number): string {
  const t = (thetaDeg * Math.PI) / 180;
  const c = Math.cos(t);
  const s = Math.sin(t);
  const p = (x: number, y: number) => rp(x, y, c, s, cx, cy);

  return [
    `M ${p(0, 0)}`,
    `C ${p(-30, -18)} ${p(-52, -36)} ${p(-52, -62)}`,
    `C ${p(-52, -90)} ${p(-28, -104)} ${p(-12, -104)}`,
    `C ${p(-4, -104)} ${p(0, -92)} ${p(0, -92)}`,
    `C ${p(0, -92)} ${p(4, -104)} ${p(12, -104)}`,
    `C ${p(28, -104)} ${p(52, -90)} ${p(52, -62)}`,
    `C ${p(52, -36)} ${p(30, -18)} ${p(0, 0)}`,
    'Z',
  ].join(' ');
}

const PILLAR_ORDER: Array<{ pillar: string; position: Position; theta: number }> = [
  { pillar: 'Mental',    position: 'tl', theta: -45  },
  { pillar: 'Physical',  position: 'tr', theta:  45  },
  { pillar: 'Social',    position: 'bl', theta: -135 },
  { pillar: 'Spiritual', position: 'br', theta:  135 },
];

/* Pre-compute all 4 paths (module-level, computed once) */
const HEART_PATHS: Record<Position, string> = {
  tl: heartPath(-45,  TIP.tl.cx, TIP.tl.cy),
  tr: heartPath( 45,  TIP.tr.cx, TIP.tr.cy),
  bl: heartPath(-135, TIP.bl.cx, TIP.bl.cy),
  br: heartPath( 135, TIP.br.cx, TIP.br.cy),
};

/** Icon clover-space centres (27 % / 73 % of CL) */
const ICON_CL: Record<Position, { x: number; y: number }> = {
  tl: { x: CL * 0.27, y: CL * 0.27 },
  tr: { x: CL * 0.73, y: CL * 0.27 },
  bl: { x: CL * 0.27, y: CL * 0.73 },
  br: { x: CL * 0.73, y: CL * 0.73 },
};

const LABEL_POS: Record<Position, object> = {
  tl: { top: 6,  left: 8  },
  tr: { top: 6,  right: 8 },
  bl: { bottom: 6, left: 8  },
  br: { bottom: 6, right: 8 },
};
const LABEL_ALIGN: Record<Position, 'left' | 'right'> = {
  tl: 'left', tr: 'right', bl: 'left', br: 'right',
};

/** Quadrant pressable hit areas */
const QUAD_POS: Record<Position, object> = {
  tl: { left: 0,  top: 0,    width: CL / 2, height: CL / 2 },
  tr: { right: 0, top: 0,    width: CL / 2, height: CL / 2 },
  bl: { left: 0,  bottom: 0, width: CL / 2, height: CL / 2 },
  br: { right: 0, bottom: 0, width: CL / 2, height: CL / 2 },
};


// ─── Friend-request badge dot on the social icon button ─────────────────────
function FriendBadge() {
  const { pendingCount } = useFriendActivity();
  const C = useThemeColors();
  if (pendingCount === 0) return null;
  return (
    <View
      style={{
        position: 'absolute',
        top: -4,
        right: -4,
        minWidth: 18,
        height: 18,
        borderRadius: 9,
        backgroundColor: '#F2836B',
        alignItems: 'center',
        justifyContent: 'center',
        paddingHorizontal: 3,
        borderWidth: 1.5,
        borderColor: C.cardBackground,
      }}
    >
      <Text style={{ fontSize: 10, fontFamily: 'Inter_700Bold', color: '#fff', lineHeight: 13 }}>
        {pendingCount > 9 ? '9+' : pendingCount}
      </Text>
    </View>
  );
}

/* ── Main screen ── */
export default function HomeScreen() {
  const insets = useSafeAreaInsets();
  const topInset = Platform.OS === 'web' ? 67 : insets.top;
  const C = useThemeColors();
  const { theme, setTheme } = useTheme();
  const pillarColors = usePillarColors();
  const { user, logout } = useAuth();
  const { userState, progression, isExerciseAvailable, hasAlignedToday } = useApp();

  const { data: activityData } = useQuery<Array<{ date: string; alignment: number; practice: number }>>({
    queryKey: ['/api/activity/last-3-days'],
    queryFn: async () => {
      const baseUrl = getApiUrl();
      const token = await getAuthToken();
      const headers: Record<string, string> = { ...(token ? { 'Authorization': `Bearer ${token}` } : {}) };
      const res = await fetch(new URL('/api/activity/last-3-days', baseUrl).toString(), { credentials: 'include', headers });
      if (!res.ok) return [];
      return res.json();
    },
    staleTime: 30000,
  });

  const { t } = useTranslation();
  const { language } = useLanguage();

  const { data: inboxCountData, refetch: refetchInboxCount } = useQuery<{ count: number }>({
    queryKey: ['/api/inbox/unread-count'],
    queryFn: async () => {
      const baseUrl = getApiUrl();
      const res = await fetch(new URL('/api/inbox/unread-count', baseUrl).toString(), { credentials: 'include' });
      if (!res.ok) return { count: 0 };
      return res.json();
    },
    staleTime: 0,
    refetchInterval: 10000,
  });
  const inboxUnread = inboxCountData?.count ?? 0;

  // Animate badge when count changes
  const badgeScale = useSharedValue(1);
  useEffect(() => {
    if (inboxUnread > 0) {
      badgeScale.value = withSequence(
        withSpring(1.4, { damping: 5, stiffness: 300 }),
        withSpring(1, { damping: 10, stiffness: 200 }),
      );
    }
  }, [inboxUnread]);
  const badgeAnimStyle = useAnimatedStyle(() => ({ transform: [{ scale: badgeScale.value }] }));

  useFocusEffect(useCallback(() => { refetchInboxCount(); }, [refetchInboxCount]));

  const [feedbackVisible, setFeedbackVisible] = useState(false);
  const [fbRating, setFbRating] = useState(0);
  const [fbCategory, setFbCategory] = useState('General');
  const [fbMessage, setFbMessage] = useState('');
  const [fbSubmitting, setFbSubmitting] = useState(false);
  const [fbDone, setFbDone] = useState(false);
  const [xpExpanded, setXpExpanded] = useState(false);

  // social hub now lives at /social route

  const CATEGORIES = [
    t('home.feedbackGeneral'),
    t('home.feedbackBug'),
    t('home.feedbackSuggestion'),
    t('home.feedbackOther'),
  ];

  const openFeedback = () => {
    setFbRating(0);
    setFbCategory(t('home.feedbackGeneral'));
    setFbMessage('');
    setFbDone(false);
    setFeedbackVisible(true);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  };

  const submitFeedback = async () => {
    if (fbRating === 0) {
      Alert.alert(t('common.ratingRequired'), t('common.ratingRequiredMsg'));
      return;
    }
    if (!fbMessage.trim()) {
      Alert.alert(t('common.messageRequired'), t('common.messageRequiredMsg'));
      return;
    }
    setFbSubmitting(true);
    try {
      await apiRequest('POST', '/api/feedback', {
        rating: fbRating,
        category: fbCategory,
        message: fbMessage.trim(),
      });
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setFbDone(true);
    } catch {
      Alert.alert(t('common.error'), t('home.feedbackErrorMsg'));
    } finally {
      setFbSubmitting(false);
    }
  };

  const handleLogout = useCallback(() => {
    if (Platform.OS === 'web') {
      if (window.confirm(`${t('home.signOutTitle')}\n${t('home.signOutMsg')}`)) {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
        logout().then(() => router.replace('/login'));
      }
    } else {
      Alert.alert(t('home.signOutTitle'), t('home.signOutMsg'), [
        { text: t('common.cancel'), style: 'cancel' },
        {
          text: t('common.signOut'), style: 'destructive', onPress: async () => {
            Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
            await logout();
            router.replace('/login');
          },
        },
      ]);
    }
  }, [t, logout]);

  useFocusEffect(
    useCallback(() => {
      if (Platform.OS !== 'android') return;
      const sub = BackHandler.addEventListener('hardwareBackPress', () => {
        BackHandler.exitApp();
        return true;
      });
      return () => sub.remove();
    }, [])
  );

  const greeting = () => {
    const h = new Date().getHours();
    if (h < 12) return t('home.morning');
    if (h < 17) return t('home.afternoon');
    return t('home.evening');
  };

  const todayDate = new Date().toLocaleDateString(language, {
    weekday: 'long', month: 'short', day: 'numeric',
  });

  const xpProgress = progression.currentLevelProgressPercent / 100;

  return (
    <>
    <ScrollView
      style={[styles.container, { backgroundColor: C.background }]}
      contentContainerStyle={[styles.scrollContent, { paddingTop: topInset + 10 }]}
      showsVerticalScrollIndicator={false}
    >
      {/* ── Header ── */}
      <View style={styles.header}>
        <View style={styles.headerLeft}>
          <Pressable
            style={[styles.avatarCircle, { backgroundColor: C.cardBackground, borderColor: C.border }]}
            onPress={() => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              router.navigate('/profile');
            }}
          >
            {user?.profilePhoto ? (
              <Image source={{ uri: user.profilePhoto }} style={styles.avatarImage} />
            ) : user?.identity ? (
              <Text style={[styles.avatarInitial, { color: C.accent }]}>
                {user.identity.charAt(0).toUpperCase()}
              </Text>
            ) : (
              <MaterialIcons name="person" size={22} color={C.textSecondary} />
            )}
          </Pressable>
          <View>
            <Text style={[styles.greeting, { color: C.textSecondary }]}>{greeting()}</Text>
            <Text style={[styles.name, { color: C.textPrimary }]}>{user?.identity || t('common.friend')}</Text>
          </View>
        </View>
        <View style={styles.headerRight}>
          <Pressable
            style={[styles.iconBtn, { backgroundColor: C.cardBackground, borderColor: C.border }]}
            onPress={() => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              setTheme(theme === 'light' ? 'dark' : 'light');
            }}
          >
            <MaterialIcons
              name={theme === 'light' ? 'dark-mode' : 'light-mode'}
              size={20}
              color={C.accent}
            />
          </Pressable>
          <Pressable
            style={[styles.iconBtn, { backgroundColor: C.cardBackground, borderColor: C.border }]}
            onPress={openFeedback}
          >
            <MaterialIcons name="feedback" size={20} color={C.accent} />
          </Pressable>
          <Pressable
            style={[styles.iconBtn, { backgroundColor: C.cardBackground, borderColor: C.border }]}
            onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); router.push('/notification-center' as any); }}
          >
            <MaterialIcons name="notifications-none" size={20} color={C.accent} />
            {inboxUnread > 0 && (
              <Animated.View style={[styles.notifBadge, { backgroundColor: C.accent }, badgeAnimStyle]}>
                <Text style={styles.notifBadgeText}>{inboxUnread > 9 ? '9+' : String(inboxUnread)}</Text>
              </Animated.View>
            )}
          </Pressable>
          <Pressable
            style={[styles.iconBtn, { backgroundColor: C.cardBackground, borderColor: C.border }]}
            onPress={handleLogout}
          >
            <MaterialIcons name="logout" size={20} color="#F2836B" />
          </Pressable>
        </View>
      </View>

      {/* ── Today Progression Card ── */}
      {progression.currentLevel > 0 && (
        <Pressable
          style={({ pressed }) => [
            styles.xpCard,
            { backgroundColor: C.cardBackground, borderColor: C.border, opacity: pressed ? 0.85 : 1 },
          ]}
          onPress={() => {
            Haptics.selectionAsync();
            setXpExpanded(v => !v);
          }}
        >
          {/* Header row */}
          <View style={styles.xpHeader}>
            <View style={styles.xpLeft}>
              <View style={[styles.lvChip, { backgroundColor: C.accent + '22' }]}>
                <Text style={[styles.lvText, { color: C.accent }]}>{t('yearmap.level', { level: progression.currentLevel })}</Text>
              </View>
              <Text style={[styles.xpPhase, { color: C.textSecondary }]}>{progression.currentPhase}</Text>
            </View>
            <MaterialIcons
              name={xpExpanded ? 'expand-less' : 'expand-more'}
              size={20}
              color={C.textTertiary}
            />
          </View>

          {/* Progress track — under header */}
          <View style={[styles.xpTrackLine, { backgroundColor: C.border }]}>
            <View style={[styles.xpTrackFill, { backgroundColor: C.accent + '55', width: `${Math.min(xpProgress * 100, 100)}%` }]} />
          </View>

          {/* Expanded panel */}
          {xpExpanded && (
            <View style={[styles.xpExpanded, { borderTopColor: C.border }]}>
              <View style={styles.xpStatRow}>
                <View style={styles.xpStat}>
                  <Text style={[styles.xpStatNum, { color: C.textPrimary }]}>{progression.totalXp}</Text>
                  <Text style={[styles.xpStatLabel, { color: C.textTertiary }]}>{t('exercise.xp')}</Text>
                </View>
                <View style={[styles.xpStatDivider, { backgroundColor: C.border }]} />
                <View style={styles.xpStat}>
                  <Text style={[styles.xpStatNum, { color: C.textPrimary }]}>{progression.nextLevelXpRequired}</Text>
                  <Text style={[styles.xpStatLabel, { color: C.textTertiary }]}>{t('home.xpToNext')}</Text>
                </View>
                <View style={[styles.xpStatDivider, { backgroundColor: C.border }]} />
                <View style={styles.xpStat}>
                  <Text style={[styles.xpStatNum, { color: C.textPrimary }]}>{Math.round(progression.yearProgressPercent)}%</Text>
                  <Text style={[styles.xpStatLabel, { color: C.textTertiary }]}>{t('tabs.yearMap')}</Text>
                </View>
              </View>

              {/* Next milestone hint */}
              {progression.latestUnlockedMilestone && (
                <View style={[styles.xpMilestone, { backgroundColor: C.accent + '12' }]}>
                  <MaterialIcons name="emoji-events" size={14} color={C.accent} />
                  <Text style={[styles.xpMilestoneText, { color: C.accent }]} numberOfLines={1}>
                    {t('home.latest')}: {progression.latestUnlockedMilestone}
                  </Text>
                </View>
              )}
            </View>
          )}
        </Pressable>
      )}

      {/* ── Date pill ── */}
      <View style={styles.datePillWrap}>
        <View style={[styles.datePill, { backgroundColor: C.cardBackground, borderColor: C.border }]}>
          <Text style={[styles.datePillText, { color: C.textPrimary }]}>{todayDate}</Text>
        </View>
      </View>

      {/* ── Motivation ── */}
      <Text style={[styles.motivText, { color: C.textSecondary }]}>
        {hasAlignedToday
          ? 'Free Flow — keep going'
          : t('home.alignmentAwaits')}
      </Text>

      {userState.totalDaysAligned > 0 && (
        <View style={styles.daysRow}>
          <Text style={styles.daysEmoji}>🪨</Text>
          <Text style={[styles.daysText, { color: C.textSecondary }]}>
            {userState.totalDaysAligned} {userState.totalDaysAligned === 1 ? t('home.daysSingular') : t('home.daysPlural')}
          </Text>
        </View>
      )}

      {/* ── Habits Entry ── */}
      <Pressable
        style={({ pressed }) => [
          habitsBtn.btn,
          { backgroundColor: C.cardBackground, borderColor: C.border, opacity: pressed ? 0.75 : 1 },
        ]}
        onPress={() => {
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
          router.push('/habits');
        }}
      >
        <View style={[habitsBtn.iconWrap, { backgroundColor: C.accent + '18' }]}>
          <MaterialIcons name="checklist" size={20} color={C.accent} />
        </View>
        <View style={habitsBtn.textWrap}>
          <Text style={[habitsBtn.label, { color: C.textPrimary }]}>{t('habits.homeLabel')}</Text>
          <Text style={[habitsBtn.sub, { color: C.textSecondary }]}>{t('habits.homeSubtitle')}</Text>
        </View>
        <MaterialIcons name="chevron-right" size={20} color={C.textTertiary} />
      </Pressable>

      {/* ── Clover ── */}
      <View style={styles.cloverSection}>
        <View style={[styles.cloverContainer, { width: CL, height: CL }]}>

          {/* Single SVG — all 4 hearts, zero SVG transforms */}
          <Svg width={CL} height={CL} viewBox={`0 0 ${CL} ${CL}`} style={StyleSheet.absoluteFill}>
            <Defs>
              {PILLAR_ORDER.map(({ pillar }) => {
                const col = pillarColors[pillar];
                return (
                  <SvgGrad key={pillar} id={`g-${pillar}`} x1="0%" y1="0%" x2="100%" y2="100%">
                    <Stop offset="0%"   stopColor={col.gradient[0]} stopOpacity={hasAlignedToday ? '0.6' : '1'} />
                    <Stop offset="100%" stopColor={col.gradient[1]} stopOpacity={hasAlignedToday ? '0.5' : '0.9'} />
                  </SvgGrad>
                );
              })}
            </Defs>

            {PILLAR_ORDER.map(({ pillar, position }) => (
              <Path key={pillar} d={HEART_PATHS[position]} fill={`url(#g-${pillar})`} />
            ))}
          </Svg>

          {/* Pressable quadrant overlays */}
          {PILLAR_ORDER.map(({ pillar, position }) => (
            <Pressable
              key={`press-${pillar}`}
              onPress={() => {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
                router.replace({ pathname: '/checkin', params: { pillar } });
              }}
              style={({ pressed }) => [
                { position: 'absolute' },
                QUAD_POS[position] as object,
                { opacity: pressed ? 0.7 : 1 },
              ]}
            />
          ))}

          {/* Icons */}
          {PILLAR_ORDER.map(({ pillar, position }) => {
            const icon = (pillarIcons[pillar] || 'psychology') as keyof typeof MaterialIcons.glyphMap;
            const { x, y } = ICON_CL[position];
            const R = 26;
            return (
              <View
                key={`icon-${pillar}`}
                pointerEvents="none"
                style={{
                  position: 'absolute',
                  left: x - R, top: y - R,
                  width: R * 2, height: R * 2, borderRadius: R,
                  backgroundColor: 'rgba(0,0,0,0.20)',
                  justifyContent: 'center', alignItems: 'center',
                }}
              >
                <MaterialIcons name={icon} size={28} color="rgba(255,255,255,0.94)" />
              </View>
            );
          })}

          {/* Labels */}
          {PILLAR_ORDER.map(({ pillar, position }) => (
            <View
              key={`lbl-${pillar}`}
              pointerEvents="none"
              style={[cloverStyles.labelWrap, LABEL_POS[position] as object]}
            >
              <Text style={[cloverStyles.labelText, { color: C.textTertiary, textAlign: LABEL_ALIGN[position] }]}>
                {t('pillars.' + pillar.toLowerCase()).toUpperCase()}
              </Text>
            </View>
          ))}
        </View>

      </View>


    </ScrollView>

    {/* ── Feedback Modal ── */}
    <Modal
      visible={feedbackVisible}
      transparent
      animationType="slide"
      onRequestClose={() => setFeedbackVisible(false)}
    >
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={styles.fbOverlay}
      >
        <Pressable style={StyleSheet.absoluteFill} onPress={() => setFeedbackVisible(false)} />
        <View style={[styles.fbSheet, { backgroundColor: C.cardBackground }]}>
          {fbDone ? (
            <View style={styles.fbDoneWrap}>
              <MaterialIcons name="check-circle" size={52} color={C.accent} />
              <Text style={[styles.fbDoneTitle, { color: C.textPrimary }]}>{t('home.feedbackThankYou')}</Text>
              <Text style={[styles.fbDoneText, { color: C.textSecondary }]}>
                {t('home.feedbackThankYouMsg')}
              </Text>
              <Pressable
                style={[styles.fbSubmitBtn, { backgroundColor: C.accent }]}
                onPress={() => setFeedbackVisible(false)}
              >
                <Text style={styles.fbSubmitLabel}>{t('home.feedbackClose')}</Text>
              </Pressable>
            </View>
          ) : (
            <>
              <View style={styles.fbHandle} />
              <Text style={[styles.fbTitle, { color: C.textPrimary }]}>{t('home.feedbackTitle')}</Text>
              <Text style={[styles.fbSub, { color: C.textSecondary }]}>
                {t('home.feedbackSubtitle')}
              </Text>

              <View style={styles.fbStarsRow}>
                {[1, 2, 3, 4, 5].map(star => (
                  <Pressable
                    key={star}
                    onPress={() => {
                      setFbRating(star);
                      Haptics.selectionAsync();
                    }}
                  >
                    <MaterialIcons
                      name={star <= fbRating ? 'star' : 'star-border'}
                      size={36}
                      color={star <= fbRating ? '#F4C542' : C.textTertiary}
                    />
                  </Pressable>
                ))}
              </View>

              <View style={styles.fbCategoryRow}>
                {CATEGORIES.map(cat => (
                  <Pressable
                    key={cat}
                    style={[
                      styles.fbChip,
                      { borderColor: fbCategory === cat ? C.accent : C.border },
                      fbCategory === cat && { backgroundColor: C.accent + '18' },
                    ]}
                    onPress={() => {
                      setFbCategory(cat);
                      Haptics.selectionAsync();
                    }}
                  >
                    <Text style={[styles.fbChipText, { color: fbCategory === cat ? C.accent : C.textSecondary }]}>
                      {cat}
                    </Text>
                  </Pressable>
                ))}
              </View>

              <TextInput
                style={[styles.fbInput, { backgroundColor: C.background, borderColor: C.border, color: C.textPrimary }]}
                placeholder={t('home.feedbackPlaceholder')}
                placeholderTextColor={C.textTertiary}
                value={fbMessage}
                onChangeText={setFbMessage}
                multiline
                numberOfLines={4}
                maxLength={500}
                textAlignVertical="top"
              />
              <Text style={[styles.fbCharCount, { color: C.textTertiary }]}>
                {fbMessage.length}/500
              </Text>

              <Pressable
                style={[styles.fbSubmitBtn, { backgroundColor: C.accent, opacity: fbSubmitting ? 0.6 : 1 }]}
                onPress={submitFeedback}
                disabled={fbSubmitting}
              >
                {fbSubmitting
                  ? <ActivityIndicator color="#fff" size="small" />
                  : <Text style={styles.fbSubmitLabel}>{t('home.feedbackSend')}</Text>}
              </Pressable>
            </>
          )}
        </View>
      </KeyboardAvoidingView>
    </Modal>

    </>
  );
}

const habitsBtn = StyleSheet.create({
  btn: {
    width: '100%', flexDirection: 'row', alignItems: 'center', gap: 12,
    borderRadius: 14, borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: 14, paddingVertical: 12, marginTop: 14,
  },
  iconWrap: { width: 38, height: 38, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  textWrap: { flex: 1 },
  label: { fontSize: 15, fontFamily: 'Inter_600SemiBold' },
  sub: { fontSize: 12, fontFamily: 'Inter_400Regular', marginTop: 1 },
});

const cloverStyles = StyleSheet.create({
  labelWrap: { position: 'absolute' },
  labelText: { fontSize: 9, fontFamily: 'Inter_600SemiBold', letterSpacing: 1.5 },
});

const actStyles = StyleSheet.create({
  card: {
    width: '100%', borderRadius: 16, borderWidth: 1,
    paddingHorizontal: 16, paddingVertical: 14, marginTop: 16, gap: 10,
  },
  title: { fontSize: 11, fontFamily: 'Inter_600SemiBold', letterSpacing: 1.5, textTransform: 'uppercase', marginBottom: 2 },
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  dateLabel: { fontSize: 13, fontFamily: 'Inter_500Medium' },
  counts: { flexDirection: 'row', gap: 8, alignItems: 'center' },
  badge: {
    flexDirection: 'row', alignItems: 'center', gap: 3,
    paddingHorizontal: 8, paddingVertical: 3, borderRadius: 10,
  },
  badgeText: { fontSize: 12, fontFamily: 'Inter_600SemiBold' },
  emptyText: { fontSize: 13, fontFamily: 'Inter_400Regular', textAlign: 'center', paddingVertical: 4 },
});

const styles = StyleSheet.create({
  container: { flex: 1 },
  scrollContent: { paddingHorizontal: 18, paddingBottom: 120, alignItems: 'center' },
  header: {
    width: '100%', flexDirection: 'row', justifyContent: 'space-between',
    alignItems: 'center', marginBottom: 14,
  },
  headerLeft: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  avatarCircle: {
    width: 46, height: 46, borderRadius: 23, borderWidth: 1.5,
    justifyContent: 'center', alignItems: 'center', overflow: 'hidden',
  },
  avatarImage: { width: 46, height: 46, borderRadius: 23 },
  avatarInitial: { fontSize: 18, fontFamily: 'Inter_700Bold' },
  greeting: { fontSize: 12, fontFamily: 'Inter_400Regular' },
  name:     { fontSize: 20, fontFamily: 'Inter_700Bold', marginTop: 1 },
  headerRight: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  iconBtn: {
    width: 40, height: 40, borderRadius: 20, borderWidth: 1,
    justifyContent: 'center', alignItems: 'center',
  },
  notifBadge: {
    position: 'absolute' as const, top: 0, right: 0,
    minWidth: 16, height: 16, borderRadius: 8,
    justifyContent: 'center' as const, alignItems: 'center' as const,
    paddingHorizontal: 3,
  },
  notifBadgeText: { fontSize: 9, fontFamily: 'Inter_700Bold', color: '#FFFFFF' },
  xpCard: {
    width: '100%', borderRadius: 12, borderWidth: 1,
    paddingHorizontal: 12, paddingVertical: 10, marginBottom: 18,
    overflow: 'hidden',
  },
  xpHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', width: '100%' },
  xpTrackLine: { width: '100%', height: 3, borderRadius: 2, marginTop: 8, overflow: 'hidden' },
  xpTrackFill: { height: '100%', borderRadius: 2 },
  xpLeft:  { flexDirection: 'row', alignItems: 'center', gap: 8, flex: 1 },
  lvChip:  { borderRadius: 8, paddingHorizontal: 8, paddingVertical: 3 },
  lvText:  { fontSize: 12, fontFamily: 'Inter_700Bold' },
  xpPhase: { fontSize: 13, fontFamily: 'Inter_500Medium' },
  xpTotal: { fontSize: 12, fontFamily: 'Inter_500Medium' },
  xpExpanded: {
    width: '100%', borderTopWidth: StyleSheet.hairlineWidth,
    paddingTop: 12, marginTop: 10,
  },
  xpStatRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-around', marginBottom: 10 },
  xpStat: { alignItems: 'center', gap: 2, minWidth: 60 },
  xpStatNum: { fontSize: 16, fontFamily: 'Inter_700Bold' },
  xpStatLabel: { fontSize: 11, fontFamily: 'Inter_400Regular' },
  xpStatDivider: { width: 1, height: 28, borderRadius: 1 },
  xpMilestone: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    paddingHorizontal: 12, paddingVertical: 7,
    borderRadius: 20, alignSelf: 'center',
  },
  xpMilestoneText: { fontSize: 12, fontFamily: 'Inter_500Medium' },
  datePillWrap: { alignItems: 'center', marginBottom: 12 },
  datePill: { borderRadius: 20, paddingHorizontal: 20, paddingVertical: 8, borderWidth: 1 },
  datePillText: { fontSize: 14, fontFamily: 'Inter_500Medium' },
  motivText: {
    fontSize: 14, fontFamily: 'Inter_400Regular',
    textAlign: 'center', lineHeight: 21, paddingHorizontal: 16,
  },
  daysRow:   { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 8, marginBottom: 2 },
  daysEmoji: { fontSize: 16 },
  daysText:  { fontSize: 14, fontFamily: 'Inter_600SemiBold' },
  cloverSection:   { alignItems: 'center', marginTop: 22, marginBottom: 8 },
  cloverContainer: { position: 'relative' },
  fbOverlay: { flex: 1, justifyContent: 'flex-end' },
  fbSheet: {
    borderTopLeftRadius: 28, borderTopRightRadius: 28,
    paddingHorizontal: 24, paddingBottom: 40, paddingTop: 12,
    shadowColor: '#000', shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.12, shadowRadius: 16, elevation: 16,
  },
  fbHandle: {
    width: 40, height: 4, borderRadius: 2, backgroundColor: '#ccc',
    alignSelf: 'center', marginBottom: 20,
  },
  fbTitle: { fontSize: 22, fontFamily: 'Inter_700Bold', marginBottom: 4 },
  fbSub:   { fontSize: 14, fontFamily: 'Inter_400Regular', marginBottom: 22, lineHeight: 20 },
  fbStarsRow: { flexDirection: 'row', gap: 6, marginBottom: 20 },
  fbCategoryRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 18 },
  fbChip: {
    borderRadius: 20, borderWidth: 1.5,
    paddingHorizontal: 14, paddingVertical: 7,
  },
  fbChipText: { fontSize: 13, fontFamily: 'Inter_500Medium' },
  fbInput: {
    borderRadius: 14, borderWidth: 1,
    padding: 14, fontSize: 14, fontFamily: 'Inter_400Regular',
    minHeight: 100, marginBottom: 6,
  },
  fbCharCount: { fontSize: 11, fontFamily: 'Inter_400Regular', textAlign: 'right', marginBottom: 18 },
  fbSubmitBtn: {
    borderRadius: 16, paddingVertical: 15,
    alignItems: 'center', justifyContent: 'center',
  },
  fbSubmitLabel: { fontSize: 15, fontFamily: 'Inter_600SemiBold', color: '#fff' },
  fbDoneWrap: { alignItems: 'center', paddingVertical: 20, gap: 12 },
  fbDoneTitle: { fontSize: 22, fontFamily: 'Inter_700Bold' },
  fbDoneText: { fontSize: 14, fontFamily: 'Inter_400Regular', textAlign: 'center', lineHeight: 20, marginBottom: 8 },
});
