import React, { useState, useCallback, useMemo, useEffect, useRef } from 'react';
import { View, Text, StyleSheet, ScrollView, Platform, Pressable, Alert, TextInput, Modal, KeyboardAvoidingView, Image, FlatList, Switch, Linking, BackHandler, Animated } from 'react-native';
import * as Clipboard from 'expo-clipboard';
import {
  requestPermissions,
  scheduleDailyReminders,
  scheduleWeeklyReminder,
  cancelAllNotifications,
  saveNotificationPreference,
  getNotificationPreference,
} from '@/services/notificationService';
import { router, useFocusEffect } from 'expo-router';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { MaterialIcons, Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import * as ImagePicker from 'expo-image-picker';
import { useTranslation } from 'react-i18next';
import i18next from '@/lib/i18n';
import { useAuth } from '@/context/AuthContext';
import { useApp } from '@/context/AppContext';
import { useThemeColors, ThemeColors } from '@/context/ThemeContext';
import { useLanguage, LANGUAGES } from '@/context/LanguageContext';
import XPBar from '@/components/XPBar';
import ThemeToggle from '@/components/ThemeToggle';
import { apiRequest, getApiUrl } from '@/lib/query-client';

const COUNTRY_CODES = [
  { code: '+91', name: 'India', flag: '🇮🇳' },
  { code: '+1', name: 'United States', flag: '🇺🇸' },
  { code: '+44', name: 'United Kingdom', flag: '🇬🇧' },
  { code: '+61', name: 'Australia', flag: '🇦🇺' },
  { code: '+971', name: 'UAE', flag: '🇦🇪' },
  { code: '+966', name: 'Saudi Arabia', flag: '🇸🇦' },
  { code: '+65', name: 'Singapore', flag: '🇸🇬' },
  { code: '+60', name: 'Malaysia', flag: '🇲🇾' },
  { code: '+92', name: 'Pakistan', flag: '🇵🇰' },
  { code: '+880', name: 'Bangladesh', flag: '🇧🇩' },
  { code: '+94', name: 'Sri Lanka', flag: '🇱🇰' },
  { code: '+977', name: 'Nepal', flag: '🇳🇵' },
  { code: '+81', name: 'Japan', flag: '🇯🇵' },
  { code: '+82', name: 'South Korea', flag: '🇰🇷' },
  { code: '+86', name: 'China', flag: '🇨🇳' },
  { code: '+49', name: 'Germany', flag: '🇩🇪' },
  { code: '+33', name: 'France', flag: '🇫🇷' },
  { code: '+39', name: 'Italy', flag: '🇮🇹' },
  { code: '+34', name: 'Spain', flag: '🇪🇸' },
  { code: '+55', name: 'Brazil', flag: '🇧🇷' },
  { code: '+52', name: 'Mexico', flag: '🇲🇽' },
  { code: '+27', name: 'South Africa', flag: '🇿🇦' },
  { code: '+234', name: 'Nigeria', flag: '🇳🇬' },
  { code: '+62', name: 'Indonesia', flag: '🇮🇩' },
  { code: '+63', name: 'Philippines', flag: '🇵🇭' },
  { code: '+66', name: 'Thailand', flag: '🇹🇭' },
  { code: '+84', name: 'Vietnam', flag: '🇻🇳' },
];

function confirmAction(title: string, message: string, onConfirm: () => void) {
  if (Platform.OS === 'web') {
    if (window.confirm(`${title}\n\n${message}`)) onConfirm();
  } else {
    Alert.alert(title, message, [
      { text: i18next.t('common.cancel'), style: 'cancel' },
      { text: i18next.t('common.confirm'), style: 'destructive', onPress: onConfirm },
    ]);
  }
}

const FEEDBACK_CATEGORIES = [
  { key: 'general',  labelKey: 'profile.feedbackCatGeneral',  icon: 'chat-bubble-outline' as const },
  { key: 'bug',      labelKey: 'profile.feedbackCatBug',      icon: 'bug-report' as const },
  { key: 'feature',  labelKey: 'profile.feedbackCatFeature',  icon: 'lightbulb-outline' as const },
  { key: 'content',  labelKey: 'profile.feedbackCatContent',  icon: 'fitness-center' as const },
];

function StarRating({ value, onChange }: { value: number; onChange: (v: number) => void }) {
  return (
    <View style={{ flexDirection: 'row', gap: 8, justifyContent: 'center', marginVertical: 4 }}>
      {[1, 2, 3, 4, 5].map(star => (
        <Pressable key={star} onPress={() => { onChange(star); Haptics.selectionAsync(); }} hitSlop={6}>
          <MaterialIcons
            name={star <= value ? 'star' : 'star-border'}
            size={36}
            color={star <= value ? '#F59E0B' : '#D1D5DB'}
          />
        </Pressable>
      ))}
    </View>
  );
}

export default function ProfileScreen() {
  const insets = useSafeAreaInsets();
  const topInset = Platform.OS === 'web' ? 67 : insets.top;
  const { user, logout, updateProfile, updatePhone, changePassword, deleteAccount } = useAuth();
  const { userState, progression, dailyLogs, unlockedArtifacts, resetToday } = useApp();
  const Colors = useThemeColors();
  const { t } = useTranslation();
  const { language, setLanguage } = useLanguage();
  const [langVisible, setLangVisible] = useState(false);

  // Edit profile
  const [editVisible, setEditVisible] = useState(false);
  const [editName, setEditName] = useState('');
  const [editPhoto, setEditPhoto] = useState('');
  const [saving, setSaving] = useState(false);

  // Change password
  const [pwVisible, setPwVisible] = useState(false);
  const [currentPw, setCurrentPw] = useState('');
  const [newPw, setNewPw] = useState('');
  const [confirmPw, setConfirmPw] = useState('');
  const [showCurrentPw, setShowCurrentPw] = useState(false);
  const [showNewPw, setShowNewPw] = useState(false);
  const [pwSaving, setPwSaving] = useState(false);

  // Inbox unread count
  const { data: inboxCountData, refetch: refetchInboxCount } = useQuery<{ count: number }>({
    queryKey: ['/api/inbox/unread-count'],
    queryFn: async () => {
      const url = new URL('/api/inbox/unread-count', getApiUrl());
      const res = await fetch(url.toString(), { credentials: 'include' });
      if (!res.ok) throw new Error('Failed');
      return res.json();
    },
    staleTime: 0,
    refetchInterval: 10000,
  });
  const inboxUnreadCount = inboxCountData?.count ?? 0;

  useFocusEffect(
    useCallback(() => {
      refetchInboxCount();
    }, [refetchInboxCount])
  );

  // Feedback
  const [fbVisible, setFbVisible] = useState(false);
  const [fbRating, setFbRating] = useState(0);
  const [fbCategory, setFbCategory] = useState('general');
  const [fbMessage, setFbMessage] = useState('');
  const [fbSending, setFbSending] = useState(false);
  const [fbSent, setFbSent] = useState(false);

  // Push notifications
  const [notificationsEnabled, setNotificationsEnabled] = useState(true);
  const [notifLoading, setNotifLoading] = useState(false);

  useEffect(() => {
    getNotificationPreference().then(setNotificationsEnabled).catch(() => {});
  }, []);

  const handleToggleNotifications = async (value: boolean) => {
    if (Platform.OS === 'web') {
      Alert.alert('Not supported', 'Push notifications are not available on web.');
      return;
    }
    setNotifLoading(true);
    try {
      if (value) {
        const status = await requestPermissions();
        if (status !== 'granted') {
          Alert.alert(
            t('profile.notifPermDeniedTitle'),
            t('profile.notifPermDeniedMsg'),
          );
          setNotifLoading(false);
          return;
        }
        await scheduleDailyReminders();
        await scheduleWeeklyReminder();
        await saveNotificationPreference(true);
        setNotificationsEnabled(true);
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      } else {
        await cancelAllNotifications();
        await saveNotificationPreference(false);
        setNotificationsEnabled(false);
        Haptics.selectionAsync();
      }
    } catch {
      Alert.alert(t('common.error'), t('profile.notifToggleError'));
    } finally {
      setNotifLoading(false);
    }
  };

  // Phone / WhatsApp
  const [phoneVisible, setPhoneVisible] = useState(false);
  const [editCountryCode, setEditCountryCode] = useState('+91');
  const [editPhoneNumber, setEditPhoneNumber] = useState('');
  const [editWhatsappOptIn, setEditWhatsappOptIn] = useState(false);
  const [phoneSaving, setPhoneSaving] = useState(false);
  const [phoneError, setPhoneError] = useState('');
  const [countryPickerVisible, setCountryPickerVisible] = useState(false);
  const [countrySearch, setCountrySearch] = useState('');

  const filteredCountries = useMemo(() => {
    if (!countrySearch.trim()) return COUNTRY_CODES;
    const q = countrySearch.toLowerCase();
    return COUNTRY_CODES.filter(c => c.name.toLowerCase().includes(q) || c.code.includes(q));
  }, [countrySearch]);

  const openPhoneModal = () => {
    setEditCountryCode(user?.countryCode || '+91');
    setEditPhoneNumber(user?.phoneNumber || '');
    setEditWhatsappOptIn(user?.whatsappOptIn || false);
    setPhoneError('');
    setPhoneVisible(true);
  };

  const handlePhoneNumberChange = (v: string) => {
    const digits = v.replace(/\D/g, '');
    setEditPhoneNumber(digits);
    if (digits && !editWhatsappOptIn) setEditWhatsappOptIn(true);
    if (!digits) setEditWhatsappOptIn(false);
    if (digits.length > 0 && digits.length !== 10) {
      setPhoneError(t('profile.phoneTenDigits'));
    } else {
      setPhoneError('');
    }
  };

  const handleSavePhone = async () => {
    setPhoneError('');
    if (editPhoneNumber && editPhoneNumber.length !== 10) {
      setPhoneError(t('profile.phoneTenDigits'));
      return;
    }
    setPhoneSaving(true);
    const result = await updatePhone({
      countryCode: editPhoneNumber ? editCountryCode : null,
      phoneNumber: editPhoneNumber || null,
      whatsappOptIn: editPhoneNumber ? editWhatsappOptIn : false,
    });
    setPhoneSaving(false);
    if (result.success) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setPhoneVisible(false);
    } else {
      setPhoneError(result.message || t('profile.phoneUpdateFailed'));
    }
  };

  const handleDeletePhone = () => {
    confirmAction(t('profile.removePhone'), t('profile.removePhoneMsg'), async () => {
      setPhoneSaving(true);
      await updatePhone({ countryCode: null, phoneNumber: null, whatsappOptIn: false });
      setPhoneSaving(false);
      setPhoneVisible(false);
    });
  };

  const selectedEditCountry = COUNTRY_CODES.find(c => c.code === editCountryCode) ?? COUNTRY_CODES[0];

  // Tag copy toast
  const [tagCopied, setTagCopied] = useState(false);
  const tagToastOpacity = useRef(new Animated.Value(0)).current;
  const tagToastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const handleCopyTag = async () => {
    if (!user?.identity || !user?.uniqueTag) return;
    const fullTag = `${user.identity}#${user.uniqueTag}`;
    await Clipboard.setStringAsync(fullTag);
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    if (tagToastTimer.current) clearTimeout(tagToastTimer.current);
    setTagCopied(true);
    Animated.sequence([
      Animated.timing(tagToastOpacity, { toValue: 1, duration: 180, useNativeDriver: true }),
      Animated.delay(1600),
      Animated.timing(tagToastOpacity, { toValue: 0, duration: 280, useNativeDriver: true }),
    ]).start(() => setTagCopied(false));
    tagToastTimer.current = setTimeout(() => setTagCopied(false), 2200);
  };

  // Security question status
  const queryClient = useQueryClient();
  const { data: securityQuestionData, isLoading: sqLoading } = useQuery<{ hasSecurityQuestion: boolean }>({
    queryKey: ['/api/auth/has-security-question'],
  });
  const hasSecurityQuestion = securityQuestionData?.hasSecurityQuestion ?? false;

  useFocusEffect(
    useCallback(() => {
      queryClient.invalidateQueries({ queryKey: ['/api/auth/has-security-question'] });
    }, [queryClient])
  );

  useFocusEffect(
    useCallback(() => {
      if (Platform.OS !== 'android') return;
      const sub = BackHandler.addEventListener('hardwareBackPress', () => {
        router.navigate('/(main)');
        return true;
      });
      return () => sub.remove();
    }, [])
  );

  const handleLogout = () => {
    confirmAction(t('profile.signOutTitle'), t('profile.signOutMsg'), async () => {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
      await logout();
      router.replace('/login');
    });
  };

  const [deleteConfirmStep, setDeleteConfirmStep] = useState(0);
  const [deleteLoading, setDeleteLoading] = useState(false);

  const handleDeleteAccount = () => {
    if (deleteConfirmStep === 0) {
      confirmAction(
        t('profile.deleteTitle'),
        t('profile.deleteMsg'),
        () => setDeleteConfirmStep(1)
      );
    }
  };

  const handleFinalDelete = async () => {
    setDeleteLoading(true);
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
    const result = await deleteAccount();
    setDeleteLoading(false);
    setDeleteConfirmStep(0);
    if (result.success) {
      const AsyncStorage = (await import('@react-native-async-storage/async-storage')).default;
      await AsyncStorage.multiRemove([
        '@mindful_trim_theme',
      ]).catch(() => {});
      router.replace('/welcome');
    } else {
      Alert.alert(t('common.error'), result.message);
    }
  };

  const openPrivacy = () => {
    const domain = process.env.EXPO_PUBLIC_DOMAIN ?? '';
    Linking.openURL(`https://${domain}/privacy`).catch(() => {});
  };

  const openTerms = () => {
    const domain = process.env.EXPO_PUBLIC_DOMAIN ?? '';
    Linking.openURL(`https://${domain}/terms`).catch(() => {});
  };

  const handleReset = () => {
    confirmAction(
      t('profile.resetTitle'),
      t('profile.resetMsg'),
      async () => {
        await resetToday();
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
      }
    );
  };

  const openEdit = () => {
    setEditName(user?.identity || '');
    setEditPhoto(user?.profilePhoto || '');
    setEditVisible(true);
  };

  const pickPhoto = async () => {
    try {
      const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert(t('common.permission'), t('profile.permissionPhotoMsg'));
        return;
      }
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'] as ImagePicker.MediaType[],
        allowsEditing: true,
        aspect: [1, 1],
        quality: 0.4,
        base64: true,
      });
      if (!result.canceled && result.assets[0]) {
        const asset = result.assets[0];
        const base64 = asset.base64;
        const mimeType = asset.mimeType ?? 'image/jpeg';
        if (base64) {
          setEditPhoto(`data:${mimeType};base64,${base64}`);
          Haptics.selectionAsync();
        }
      }
    } catch {
      Alert.alert(t('common.error'), t('profile.photoError'));
    }
  };

  const handleSaveProfile = async () => {
    setSaving(true);
    await updateProfile({ identity: editName, profilePhoto: editPhoto });
    setSaving(false);
    setEditVisible(false);
  };

  const openChangePw = () => {
    setCurrentPw(''); setNewPw(''); setConfirmPw('');
    setShowCurrentPw(false); setShowNewPw(false);
    setPwVisible(true);
  };

  const pwRules = {
    length: newPw.length >= 8,
    upper: /[A-Z]/.test(newPw),
    lower: /[a-z]/.test(newPw),
    number: /[0-9]/.test(newPw),
  };
  const pwMatch = confirmPw.length > 0 && newPw === confirmPw;
  const pwAllValid = pwRules.length && pwRules.upper && pwRules.lower && pwRules.number;

  const handleChangePassword = async () => {
    if (!currentPw || !newPw || !confirmPw) { Alert.alert(t('profile.missingFields'), t('profile.missingFieldsMsg')); return; }
    if (!pwAllValid) { Alert.alert(t('profile.pwWeakAlert'), t('profile.pwWeakAlertMsg')); return; }
    if (newPw !== confirmPw) { Alert.alert(t('profile.mismatch'), t('profile.mismatchMsg')); return; }
    setPwSaving(true);
    const result = await changePassword(currentPw, newPw);
    setPwSaving(false);
    if (result.success) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setPwVisible(false);
      Alert.alert(t('common.success'), t('profile.pwSuccessMsg'));
    } else {
      const errMsg = result.code === 'WRONG_PASSWORD'
        ? t('profile.currentPasswordIncorrect')
        : t('profile.passwordChangeFailed');
      Alert.alert(t('common.error'), errMsg);
    }
  };

  const openFeedback = () => {
    setFbRating(0); setFbCategory('general'); setFbMessage(''); setFbSent(false);
    setFbVisible(true);
  };

  const handleSendFeedback = async () => {
    if (fbRating === 0) { Alert.alert(t('common.ratingRequired'), t('common.ratingRequiredMsg')); return; }
    if (!fbMessage.trim()) { Alert.alert(t('common.messageRequired'), t('common.messageRequiredMsg')); return; }
    setFbSending(true);
    try {
      await apiRequest('POST', '/api/feedback', {
        rating: fbRating,
        category: fbCategory,
        message: fbMessage.trim(),
      });
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setFbSent(true);
    } catch {
      Alert.alert(t('common.error'), t('profile.feedbackErrorMsg'));
    } finally {
      setFbSending(false);
    }
  };

  const styles = makeStyles(Colors);

  return (
    <View style={{ flex: 1, backgroundColor: Colors.background }}>
      {tagCopied && (
        <Animated.View style={[styles.tagToast, { opacity: tagToastOpacity }]} pointerEvents="none">
          <MaterialIcons name="check-circle" size={16} color="#22C55E" />
          <Text style={styles.tagToastText}>Copied to clipboard</Text>
        </Animated.View>
      )}
      <View style={[styles.topBar, { paddingTop: topInset }]}>
        <Text style={styles.title}>{t('profile.title')}</Text>
        <View style={styles.topBarRight}>
          <ThemeToggle />
          <Pressable
            style={[styles.signOutButton, { borderColor: Colors.error + '40', backgroundColor: Colors.error + '12' }]}
            onPress={handleLogout}
            testID="logout-btn"
          >
            <Ionicons name="log-out-outline" size={16} color={Colors.error} />
            <Text style={[styles.signOutText, { color: Colors.error }]}>{t('common.signOut')}</Text>
          </Pressable>
        </View>
      </View>

      <ScrollView style={styles.container} contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>

        <View style={styles.profileCard}>
          <View style={[styles.avatar, { backgroundColor: Colors.accent }]}>
            {user?.profilePhoto ? (
              <Image source={{ uri: user.profilePhoto }} style={styles.avatarImage} />
            ) : (
              <Text style={styles.avatarText}>
                {user?.identity?.charAt(0)?.toUpperCase() || user?.email?.charAt(0)?.toUpperCase() || '?'}
              </Text>
            )}
          </View>
          <Text style={styles.profileName}>{user?.identity || t('common.friend')}</Text>
          {user?.uniqueTag ? (
            <Pressable onPress={handleCopyTag} style={styles.tagRow} hitSlop={8}>
              <Text style={[styles.tagText, { color: Colors.textTertiary }]}>
                {user.identity || t('common.friend')} <Text style={{ color: Colors.accent }}>#{user.uniqueTag}</Text>
              </Text>
              <MaterialIcons name="content-copy" size={13} color={Colors.textTertiary} style={{ marginLeft: 4 }} />
            </Pressable>
          ) : null}
          <Text style={styles.profileEmail}>{user?.email}</Text>
          <Pressable style={[styles.editButton, { borderColor: Colors.accent }]} onPress={openEdit} testID="edit-profile-btn">
            <MaterialIcons name="edit" size={16} color={Colors.accent} />
            <Text style={[styles.editButtonText, { color: Colors.accent }]}>{t('profile.editProfile')}</Text>
          </Pressable>
        </View>

        <View style={styles.statsSection}>
          <Text style={styles.sectionTitle}>{t('profile.yourJourney')}</Text>
          <View style={styles.statsGrid}>
            <View style={styles.statItem}>
              <Text style={styles.statValue}>{userState.totalDaysAligned}</Text>
              <Text style={styles.statLabel}>{t('profile.daysAligned')}</Text>
            </View>
            <View style={styles.statItem}>
              <Text style={styles.statValue}>{unlockedArtifacts.length}</Text>
              <Text style={styles.statLabel}>{t('profile.artifacts')}</Text>
            </View>
            <View style={styles.statItem}>
              <Text style={styles.statValue}>{dailyLogs.length}</Text>
              <Text style={styles.statLabel}>{t('profile.exercises')}</Text>
            </View>
          </View>
        </View>

        <View style={[styles.progressionSection, { backgroundColor: Colors.cardBackground, borderColor: Colors.border }]}>
          <Text style={styles.sectionTitle}>{t('profile.yearOfAlignment')}</Text>
          <View style={styles.progressionBody}>
            <XPBar progression={progression} />
          </View>
          <View style={styles.xpStatsRow}>
            <View style={styles.xpStat}>
              <Text style={[styles.xpStatValue, { color: Colors.accent }]}>{progression.totalXp}</Text>
              <Text style={styles.xpStatLabel}>{t('profile.totalXp')}</Text>
            </View>
            <View style={styles.xpStat}>
              <Text style={[styles.xpStatValue, { color: Colors.accent }]}>{progression.currentLevel}</Text>
              <Text style={styles.xpStatLabel}>{t('profile.level')}</Text>
            </View>
            <View style={styles.xpStat}>
              <Text style={[styles.xpStatValue, { color: Colors.accent }]}>{progression.yearProgressPercent.toFixed(1)}%</Text>
              <Text style={styles.xpStatLabel}>{t('profile.yearDone')}</Text>
            </View>
          </View>
        </View>

        <View style={styles.actionsSection}>
          <Pressable style={styles.actionRow} onPress={openPrivacy} testID="privacy-btn">
            <MaterialIcons name="privacy-tip" size={22} color={Colors.textSecondary} />
            <Text style={[styles.actionText, { color: Colors.textPrimary }]}>{t('profile.privacyPolicy')}</Text>
            <MaterialIcons name="open-in-new" size={18} color={Colors.textTertiary} style={{ marginStart: 'auto' }} />
          </Pressable>
          <Pressable style={styles.actionRow} onPress={openTerms} testID="terms-btn">
            <MaterialIcons name="description" size={22} color={Colors.textSecondary} />
            <Text style={[styles.actionText, { color: Colors.textPrimary }]}>{t('profile.termsOfService')}</Text>
            <MaterialIcons name="open-in-new" size={18} color={Colors.textTertiary} style={{ marginStart: 'auto' }} />
          </Pressable>
          <Pressable style={styles.actionRow} onPress={() => { Haptics.selectionAsync(); setLangVisible(true); }} testID="language-btn">
            <MaterialIcons name="language" size={22} color={Colors.textSecondary} />
            <Text style={[styles.actionText, { color: Colors.textPrimary }]}>{t('profile.language')}</Text>
            <Text style={[styles.actionBadge, { color: Colors.accent, backgroundColor: Colors.accent + '18' }]}>
              {LANGUAGES.find(l => l.code === language)?.flag ?? '🌐'} {LANGUAGES.find(l => l.code === language)?.nativeName ?? language.toUpperCase()}
            </Text>
            <MaterialIcons name="chevron-right" size={20} color={Colors.textTertiary} />
          </Pressable>
          <Pressable style={styles.actionRow} onPress={openChangePw} testID="change-pw-btn">
            <MaterialIcons name="lock-outline" size={22} color={Colors.textSecondary} />
            <Text style={[styles.actionText, { color: Colors.textPrimary }]}>{t('profile.changePassword')}</Text>
            <MaterialIcons name="chevron-right" size={20} color={Colors.textTertiary} style={{ marginStart: 'auto' }} />
          </Pressable>
          <Pressable style={styles.actionRow} onPress={() => router.push('/setup-security-question?from=profile')} testID="security-question-btn">
            <MaterialIcons name="security" size={22} color={Colors.textSecondary} />
            <Text style={[styles.actionText, { color: Colors.textPrimary }]}>{t('profile.securityQuestion')}</Text>
            {!sqLoading && (
              <Text style={[styles.actionBadge, hasSecurityQuestion
                ? { color: Colors.accent, backgroundColor: Colors.accent + '18' }
                : { color: Colors.textTertiary, backgroundColor: Colors.border }]}>
                {hasSecurityQuestion ? t('profile.statusSet') : t('profile.statusNotSet')}
              </Text>
            )}
            <MaterialIcons name="chevron-right" size={20} color={Colors.textTertiary} />
          </Pressable>
          <View style={styles.actionRow} testID="notifications-row">
            <MaterialIcons name="notifications-none" size={22} color={Colors.textSecondary} />
            <Text style={[styles.actionText, { color: Colors.textPrimary }]}>{t('profile.pushNotifications')}</Text>
            <Switch
              value={notificationsEnabled}
              onValueChange={handleToggleNotifications}
              disabled={notifLoading || Platform.OS === 'web'}
              trackColor={{ false: Colors.border, true: Colors.accent + '80' }}
              thumbColor={notificationsEnabled ? Colors.accent : Colors.textTertiary}
              style={{ marginStart: 'auto' }}
            />
          </View>
          <Pressable style={styles.actionRow} onPress={openPhoneModal} testID="whatsapp-phone-btn">
            <Ionicons name="logo-whatsapp" size={22} color="#25D366" />
            <Text style={[styles.actionText, { color: Colors.textPrimary }]}>WhatsApp Notifications</Text>
            <Text style={[styles.actionBadge, user?.phoneNumber
              ? { color: Colors.accent, backgroundColor: Colors.accent + '18' }
              : { color: Colors.textTertiary, backgroundColor: Colors.border }]}>
              {user?.phoneNumber ? `${user.countryCode} ${user.phoneNumber}` : t('profile.addNumber')}
            </Text>
            <MaterialIcons name="chevron-right" size={20} color={Colors.textTertiary} />
          </Pressable>
          <Pressable style={styles.actionRow} onPress={openFeedback} testID="feedback-btn">
            <MaterialIcons name="rate-review" size={22} color={Colors.textSecondary} />
            <Text style={[styles.actionText, { color: Colors.textPrimary }]}>{t('profile.sendFeedback')}</Text>
            <MaterialIcons name="chevron-right" size={20} color={Colors.textTertiary} style={{ marginStart: 'auto' }} />
          </Pressable>
          <Pressable
            style={styles.actionRow}
            onPress={() => router.push('/notification-center' as any)}
            testID="notifications-btn"
          >
            <MaterialIcons name="notifications-none" size={22} color={Colors.textSecondary} />
            <Text style={[styles.actionText, { color: Colors.textPrimary }]}>{t('notifCenter.title')}</Text>
            <View style={{ flexDirection: 'row', alignItems: 'center', marginStart: 'auto', gap: 6 }}>
              {inboxUnreadCount > 0 && (
                <View style={[styles.inboxBadge, { backgroundColor: Colors.accent }]}>
                  <Text style={styles.inboxBadgeText}>
                    {inboxUnreadCount > 99 ? '99+' : String(inboxUnreadCount)}
                  </Text>
                </View>
              )}
              <MaterialIcons name="chevron-right" size={20} color={Colors.textTertiary} />
            </View>
          </Pressable>
          <Pressable style={styles.actionRow} onPress={handleReset} testID="reset-btn">
            <MaterialIcons name="refresh" size={22} color={Colors.warning} />
            <Text style={[styles.actionText, { color: Colors.warning }]}>{t('profile.resetToday')}</Text>
          </Pressable>
          <Pressable style={[styles.actionRow, { borderBottomWidth: 0 }]} onPress={handleDeleteAccount} testID="delete-account-btn">
            <MaterialIcons name="delete-forever" size={22} color={Colors.error} />
            <Text style={[styles.actionText, { color: Colors.error }]}>{t('profile.deleteAccount')}</Text>
          </Pressable>
        </View>

        {deleteConfirmStep === 1 && (
          <View style={[styles.deleteConfirmCard, { backgroundColor: Colors.error + '14', borderColor: Colors.error + '40' }]}>
            <MaterialIcons name="warning" size={20} color={Colors.error} />
            <Text style={[styles.deleteConfirmText, { color: Colors.textPrimary }]}>
              {t('profile.deleteWarning')}
            </Text>
            <View style={styles.deleteConfirmButtons}>
              <Pressable
                style={[styles.deleteConfirmCancel, { borderColor: Colors.border }]}
                onPress={() => setDeleteConfirmStep(0)}
              >
                <Text style={[styles.deleteConfirmCancelText, { color: Colors.textSecondary }]}>{t('common.cancel')}</Text>
              </Pressable>
              <Pressable
                style={[styles.deleteConfirmProceed, { backgroundColor: Colors.error }, deleteLoading && { opacity: 0.6 }]}
                onPress={handleFinalDelete}
                disabled={deleteLoading}
              >
                <Text style={styles.deleteConfirmProceedText}>{deleteLoading ? t('profile.deletingText') : t('profile.deleteConfirmBtn')}</Text>
              </Pressable>
            </View>
          </View>
        )}

      </ScrollView>

      {/* ── Language Modal ── */}
      <Modal visible={langVisible} animationType="slide" transparent>
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContent, { backgroundColor: Colors.cardBackground }]}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>{t('profile.language')}</Text>
              <Pressable onPress={() => setLangVisible(false)} hitSlop={12}>
                <MaterialIcons name="close" size={24} color={Colors.textSecondary} />
              </Pressable>
            </View>
            <ScrollView style={{ maxHeight: 380 }} showsVerticalScrollIndicator={false}>
              {LANGUAGES.map(lang => {
                const isSelected = language === lang.code;
                return (
                  <Pressable
                    key={lang.code}
                    style={[
                      styles.langOptionRow,
                      isSelected && { backgroundColor: Colors.accent + '14' },
                      { borderBottomColor: Colors.border },
                    ]}
                    onPress={async () => {
                      Haptics.selectionAsync();
                      setLangVisible(false);
                      await setLanguage(lang.code);
                    }}
                  >
                    <Text style={styles.langOptionFlag}>{lang.flag}</Text>
                    <Text style={[styles.langOptionName, { color: isSelected ? Colors.accent : Colors.textPrimary }]}>
                      {lang.nativeName}
                    </Text>
                    {isSelected && (
                      <MaterialIcons name="check" size={20} color={Colors.accent} style={{ marginLeft: 'auto' }} />
                    )}
                  </Pressable>
                );
              })}
            </ScrollView>
          </View>
        </View>
      </Modal>

      {/* ── Edit Profile Modal ── */}
      <Modal visible={editVisible} animationType="slide" transparent>
        <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
          <View style={styles.modalOverlay}>
            <View style={[styles.modalContent, { backgroundColor: Colors.cardBackground }]}>
              <View style={styles.modalHeader}>
                <Text style={styles.modalTitle}>{t('profile.editProfile')}</Text>
                <Pressable onPress={() => setEditVisible(false)} hitSlop={12}>
                  <MaterialIcons name="close" size={24} color={Colors.textSecondary} />
                </Pressable>
              </View>

              {/* Photo picker */}
              <View style={styles.editAvatarRow}>
                <Pressable style={styles.editAvatarWrap} onPress={pickPhoto} testID="pick-photo-btn">
                  <View style={[styles.editAvatar, { backgroundColor: Colors.accent }]}>
                    {editPhoto ? (
                      <Image source={{ uri: editPhoto }} style={styles.editAvatarImage} />
                    ) : (
                      <Text style={styles.editAvatarText}>
                        {user?.identity?.charAt(0)?.toUpperCase() || user?.email?.charAt(0)?.toUpperCase() || '?'}
                      </Text>
                    )}
                  </View>
                  <View style={[styles.editAvatarBadge, { backgroundColor: Colors.accent }]}>
                    <MaterialIcons name="photo-camera" size={14} color="#FFFFFF" />
                  </View>
                </Pressable>
                <Text style={[styles.editPhotoHint, { color: Colors.textTertiary }]}>{t('profile.tapToChangePhoto')}</Text>
              </View>

              <Text style={styles.fieldLabel}>{t('profile.nameLabel')}</Text>
              <TextInput
                style={[styles.textInput, { backgroundColor: Colors.inputBackground, color: Colors.textPrimary }]}
                value={editName}
                onChangeText={setEditName}
                placeholder={t('profile.namePlaceholder')}
                placeholderTextColor={Colors.textTertiary}
                testID="edit-name-input"
                autoFocus
              />
              <Pressable
                style={[styles.saveButton, { backgroundColor: Colors.accent }, saving && { opacity: 0.6 }]}
                onPress={handleSaveProfile}
                disabled={saving}
                testID="save-profile-btn"
              >
                <Text style={styles.saveButtonText}>{saving ? t('profile.saving') : t('profile.saveChanges')}</Text>
              </Pressable>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* ── Change Password Modal ── */}
      <Modal visible={pwVisible} animationType="slide" transparent>
        <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContent, { backgroundColor: Colors.cardBackground }]}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>{t('profile.changePasswordTitle')}</Text>
              <Pressable onPress={() => setPwVisible(false)} hitSlop={12}>
                <MaterialIcons name="close" size={24} color={Colors.textSecondary} />
              </Pressable>
            </View>
            <Text style={styles.fieldLabel}>{t('profile.currentPwLabel')}</Text>
            <View style={[styles.pwRow, { backgroundColor: Colors.inputBackground }]}>
              <TextInput
                style={[styles.pwInput, { color: Colors.textPrimary }]}
                value={currentPw} onChangeText={setCurrentPw}
                placeholder={t('profile.currentPwPlaceholder')} placeholderTextColor={Colors.textTertiary}
                secureTextEntry={!showCurrentPw} autoCapitalize="none" testID="current-pw-input"
              />
              <Pressable onPress={() => setShowCurrentPw(v => !v)} hitSlop={8}>
                <Ionicons name={showCurrentPw ? 'eye-off-outline' : 'eye-outline'} size={20} color={Colors.textTertiary} />
              </Pressable>
            </View>
            <Text style={styles.fieldLabel}>{t('profile.newPwLabel')}</Text>
            <View style={[styles.pwRow, { backgroundColor: Colors.inputBackground }]}>
              <TextInput
                style={[styles.pwInput, { color: Colors.textPrimary }]}
                value={newPw} onChangeText={setNewPw}
                placeholder={t('profile.newPwPlaceholder')} placeholderTextColor={Colors.textTertiary}
                secureTextEntry={!showNewPw} autoCapitalize="none" testID="new-pw-input"
              />
              <Pressable onPress={() => setShowNewPw(v => !v)} hitSlop={8}>
                <Ionicons name={showNewPw ? 'eye-off-outline' : 'eye-outline'} size={20} color={Colors.textTertiary} />
              </Pressable>
            </View>
            {newPw.length > 0 && (
              <View style={styles.pwRulesBox}>
                {([
                  [pwRules.length,  t('profile.pwRule8Chars')],
                  [pwRules.upper,   t('profile.pwRuleUppercase')],
                  [pwRules.lower,   t('profile.pwRuleLowercase')],
                  [pwRules.number,  t('profile.pwRuleNumber')],
                ] as [boolean, string][]).map(([ok, label]) => (
                  <View key={label} style={styles.pwHintRow}>
                    <Ionicons
                      name={ok ? 'checkmark-circle' : 'ellipse-outline'}
                      size={14}
                      color={ok ? '#22C55E' : Colors.textTertiary}
                    />
                    <Text style={[styles.pwHintText, { color: ok ? '#22C55E' : Colors.textTertiary }]}>
                      {label}
                    </Text>
                  </View>
                ))}
              </View>
            )}
            <Text style={styles.fieldLabel}>{t('profile.confirmPwLabel')}</Text>
            <View style={[styles.pwRow, { backgroundColor: Colors.inputBackground, marginBottom: confirmPw.length > 0 ? 6 : 24 }]}>
              <TextInput
                style={[styles.pwInput, { color: Colors.textPrimary }]}
                value={confirmPw} onChangeText={setConfirmPw}
                placeholder={t('profile.confirmPwPlaceholder')} placeholderTextColor={Colors.textTertiary}
                secureTextEntry={!showNewPw} autoCapitalize="none" testID="confirm-pw-input"
              />
            </View>
            {confirmPw.length > 0 && (
              <View style={[styles.pwHintRow, { marginBottom: 24 }]}>
                <Ionicons
                  name={pwMatch ? 'checkmark-circle' : 'close-circle'}
                  size={14}
                  color={pwMatch ? '#22C55E' : '#EF4444'}
                />
                <Text style={[styles.pwHintText, { color: pwMatch ? '#22C55E' : '#EF4444' }]}>
                  {t('profile.pwRuleMatch')}
                </Text>
              </View>
            )}
            <Pressable
              style={[styles.saveButton, { backgroundColor: Colors.accent }, pwSaving && { opacity: 0.6 }]}
              onPress={handleChangePassword} disabled={pwSaving} testID="save-pw-btn"
            >
              <Text style={styles.saveButtonText}>{pwSaving ? t('profile.updating') : t('profile.updatePassword')}</Text>
            </Pressable>
          </View>
        </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* ── WhatsApp Phone Modal ── */}
      <Modal visible={phoneVisible} animationType="slide" transparent>
        <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
          <View style={styles.modalOverlay}>
            <View style={[styles.modalContent, { backgroundColor: Colors.cardBackground }]}>
              <View style={styles.modalHeader}>
                <Text style={styles.modalTitle}>WhatsApp Notifications</Text>
                <Pressable onPress={() => setPhoneVisible(false)} hitSlop={12}>
                  <MaterialIcons name="close" size={24} color={Colors.textSecondary} />
                </Pressable>
              </View>
              <View style={[styles.whatsappInfoRow, { backgroundColor: '#25D36614', borderColor: '#25D36630' }]}>
                <Ionicons name="logo-whatsapp" size={20} color="#25D366" />
                <Text style={[styles.whatsappInfoText, { color: Colors.textSecondary }]}>
                  Your number will only be used for WhatsApp notifications when available.
                </Text>
              </View>
              <Text style={styles.fieldLabel}>Country Code</Text>
              <Pressable
                style={[styles.countryPickerBtn, { backgroundColor: Colors.inputBackground, borderColor: Colors.border }]}
                onPress={() => { setCountrySearch(''); setCountryPickerVisible(true); }}
              >
                <Text style={styles.countryPickerFlag}>{selectedEditCountry.flag}</Text>
                <Text style={[styles.countryPickerName, { color: Colors.textPrimary }]}>{selectedEditCountry.name}</Text>
                <Text style={[styles.countryPickerCode, { color: Colors.textSecondary }]}>{editCountryCode}</Text>
                <Ionicons name="chevron-down" size={16} color={Colors.textTertiary} />
              </Pressable>
              <Text style={[styles.fieldLabel, { marginTop: 14 }]}>Phone Number</Text>
              <TextInput
                style={[styles.textInput, { backgroundColor: Colors.inputBackground, color: Colors.textPrimary }]}
                value={editPhoneNumber}
                onChangeText={handlePhoneNumberChange}
                placeholder={t('profile.enterPhonePlaceholder')}
                placeholderTextColor={Colors.textTertiary}
                keyboardType="phone-pad"
                maxLength={10}
              />
              <View style={[styles.whatsappToggleRow, { borderColor: Colors.border }]}>
                <Ionicons name="logo-whatsapp" size={20} color={editPhoneNumber ? '#25D366' : Colors.textTertiary} />
                <Text style={[styles.whatsappToggleLabel, { color: editPhoneNumber ? Colors.textPrimary : Colors.textTertiary }]}>
                  {t('profile.whatsappOptinLabel')}
                </Text>
                <Switch
                  value={editWhatsappOptIn}
                  onValueChange={v => { if (!editPhoneNumber) return; setEditWhatsappOptIn(v); }}
                  disabled={!editPhoneNumber}
                  trackColor={{ false: Colors.border, true: '#25D366' }}
                  thumbColor="#FFFFFF"
                />
              </View>
              {phoneError ? <Text style={[styles.phoneErrorText, { color: Colors.error }]}>{phoneError}</Text> : null}
              <Pressable
                style={[styles.saveButton, { backgroundColor: Colors.accent, marginTop: 16 }, phoneSaving && { opacity: 0.6 }]}
                onPress={handleSavePhone}
                disabled={phoneSaving}
              >
                <Text style={styles.saveButtonText}>{phoneSaving ? 'Saving...' : 'Save'}</Text>
              </Pressable>
              {user?.phoneNumber ? (
                <Pressable
                  style={[styles.deletePhoneBtn, { borderColor: Colors.error + '40' }]}
                  onPress={handleDeletePhone}
                  disabled={phoneSaving}
                >
                  <MaterialIcons name="delete-outline" size={18} color={Colors.error} />
                  <Text style={[styles.deletePhoneBtnText, { color: Colors.error }]}>Remove phone number</Text>
                </Pressable>
              ) : null}
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* ── Country Picker ── */}
      <Modal visible={countryPickerVisible} animationType="slide" transparent>
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContent, { backgroundColor: Colors.cardBackground }]}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Select Country</Text>
              <Pressable onPress={() => setCountryPickerVisible(false)} hitSlop={12}>
                <MaterialIcons name="close" size={24} color={Colors.textSecondary} />
              </Pressable>
            </View>
            <View style={[styles.searchRow, { backgroundColor: Colors.inputBackground, borderColor: Colors.border }]}>
              <Ionicons name="search-outline" size={16} color={Colors.textTertiary} />
              <TextInput
                style={[styles.searchInput, { color: Colors.textPrimary }]}
                placeholder={t('profile.searchCountryPlaceholder')}
                placeholderTextColor={Colors.textTertiary}
                value={countrySearch}
                onChangeText={setCountrySearch}
                autoFocus
              />
            </View>
            <FlatList
              data={filteredCountries}
              keyExtractor={(item, index) => `${item.code}-${item.name}-${index}`}
              renderItem={({ item }) => (
                <Pressable
                  style={[styles.countryOption, { borderBottomColor: Colors.border }]}
                  onPress={() => { setEditCountryCode(item.code); setCountryPickerVisible(false); Haptics.selectionAsync(); }}
                >
                  <Text style={styles.countryOptionFlag}>{item.flag}</Text>
                  <Text style={[styles.countryOptionName, { color: Colors.textPrimary }]}>{item.name}</Text>
                  <Text style={[styles.countryOptionCode, { color: Colors.textSecondary }]}>{item.code}</Text>
                  {item.code === editCountryCode && <Ionicons name="checkmark" size={18} color={Colors.accent} />}
                </Pressable>
              )}
              style={{ maxHeight: 380 }}
              keyboardShouldPersistTaps="handled"
            />
          </View>
        </View>
      </Modal>

      {/* ── Feedback Modal ── */}
      <Modal visible={fbVisible} animationType="slide" transparent>
        <KeyboardAvoidingView
          style={{ flex: 1 }}
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        >
          <View style={styles.modalOverlay}>
            <View style={[styles.modalContent, { backgroundColor: Colors.cardBackground }]}>
              <View style={styles.modalHeader}>
                <Text style={styles.modalTitle}>{t('profile.feedbackTitle')}</Text>
                <Pressable onPress={() => setFbVisible(false)} hitSlop={12}>
                  <MaterialIcons name="close" size={24} color={Colors.textSecondary} />
                </Pressable>
              </View>

              {fbSent ? (
                /* ── Thank-you state ── */
                <View style={styles.fbThankYou}>
                  <View style={[styles.fbThankYouIcon, { backgroundColor: Colors.accent + '18' }]}>
                    <MaterialIcons name="favorite" size={36} color={Colors.accent} />
                  </View>
                  <Text style={[styles.fbThankTitle, { color: Colors.textPrimary }]}>{t('profile.feedbackThankYou')}</Text>
                  <Text style={[styles.fbThankSub, { color: Colors.textSecondary }]}>
                    {t('profile.feedbackThankSub')}
                  </Text>
                  <Pressable
                    style={[styles.saveButton, { backgroundColor: Colors.accent, marginTop: 20 }]}
                    onPress={() => setFbVisible(false)}
                  >
                    <Text style={styles.saveButtonText}>{t('common.close')}</Text>
                  </Pressable>
                </View>
              ) : (
                /* ── Form state ── */
                <ScrollView
                  showsVerticalScrollIndicator={false}
                  keyboardShouldPersistTaps="handled"
                  contentContainerStyle={{ paddingBottom: 8 }}
                >
                  {/* Rating */}
                  <Text style={styles.fieldLabel}>{t('profile.ratingLabel')}</Text>
                  <StarRating value={fbRating} onChange={setFbRating} />

                  {/* Category */}
                  <Text style={[styles.fieldLabel, { marginTop: 18 }]}>{t('profile.feedbackCategory')}</Text>
                  <View style={styles.fbCatGrid}>
                    {FEEDBACK_CATEGORIES.map(cat => {
                      const active = fbCategory === cat.key;
                      return (
                        <Pressable
                          key={cat.key}
                          style={[
                            styles.fbCatChip,
                            { borderColor: active ? Colors.accent : Colors.border, backgroundColor: active ? Colors.accent + '14' : Colors.inputBackground },
                          ]}
                          onPress={() => { setFbCategory(cat.key); Haptics.selectionAsync(); }}
                        >
                          <MaterialIcons name={cat.icon} size={16} color={active ? Colors.accent : Colors.textSecondary} />
                          <Text style={[styles.fbCatText, { color: active ? Colors.accent : Colors.textSecondary }]}>{t(cat.labelKey)}</Text>
                        </Pressable>
                      );
                    })}
                  </View>

                  {/* Message */}
                  <Text style={[styles.fieldLabel, { marginTop: 18 }]}>{t('profile.yourMessage')}</Text>
                  <TextInput
                    style={[styles.fbTextArea, { backgroundColor: Colors.inputBackground, color: Colors.textPrimary, borderColor: Colors.border }]}
                    value={fbMessage}
                    onChangeText={setFbMessage}
                    placeholder={t('profile.feedbackMessagePlaceholder')}
                    placeholderTextColor={Colors.textTertiary}
                    multiline
                    numberOfLines={4}
                    maxLength={500}
                    textAlignVertical="top"
                    testID="feedback-message-input"
                  />
                  <Text style={[styles.fbCharCount, { color: Colors.textTertiary }]}>{fbMessage.length}/500</Text>

                  <Pressable
                    style={[styles.saveButton, { backgroundColor: Colors.accent, marginTop: 16 }, fbSending && { opacity: 0.6 }]}
                    onPress={handleSendFeedback}
                    disabled={fbSending}
                    testID="send-feedback-btn"
                  >
                    <Text style={styles.saveButtonText}>{fbSending ? t('profile.feedbackSending') : t('profile.feedbackSend')}</Text>
                  </Pressable>
                </ScrollView>
              )}
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </View>
  );
}

const makeStyles = (Colors: ThemeColors) => StyleSheet.create({
  topBar: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    justifyContent: 'space-between' as const,
    paddingHorizontal: 20,
    paddingBottom: 12,
    backgroundColor: Colors.background,
  },
  topBarRight: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: 8,
  },
  signOutButton: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: 6,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 20,
    borderWidth: 1,
  },
  signOutText: { fontSize: 13, fontFamily: 'Inter_600SemiBold' },
  container: { flex: 1, backgroundColor: Colors.background },
  scrollContent: { paddingHorizontal: 20, paddingTop: 8, paddingBottom: 100 },
  title: { fontSize: 28, fontFamily: 'Inter_700Bold', color: Colors.textPrimary, marginTop: 12 },
  profileCard: {
    backgroundColor: Colors.cardBackground,
    borderRadius: 20, padding: 24,
    alignItems: 'center' as const, gap: 8,
    borderWidth: 1, borderColor: Colors.border, marginBottom: 20,
  },
  avatar: { width: 64, height: 64, borderRadius: 32, justifyContent: 'center' as const, alignItems: 'center' as const, marginBottom: 4, overflow: 'hidden' as const },
  avatarImage: { width: 64, height: 64, borderRadius: 32 },
  avatarText: { fontSize: 26, fontFamily: 'Inter_700Bold', color: '#FFFFFF' },
  editAvatarRow: { alignItems: 'center' as const, marginBottom: 20 },
  editAvatarWrap: { position: 'relative' as const },
  editAvatar: { width: 80, height: 80, borderRadius: 40, justifyContent: 'center' as const, alignItems: 'center' as const, overflow: 'hidden' as const },
  editAvatarImage: { width: 80, height: 80, borderRadius: 40 },
  editAvatarText: { fontSize: 32, fontFamily: 'Inter_700Bold', color: '#FFFFFF' },
  editAvatarBadge: {
    position: 'absolute' as const, bottom: 0, right: 0,
    width: 26, height: 26, borderRadius: 13,
    justifyContent: 'center' as const, alignItems: 'center' as const,
    borderWidth: 2, borderColor: Colors.cardBackground,
  },
  editPhotoHint: { fontSize: 12, fontFamily: 'Inter_400Regular', marginTop: 8 },
  profileName: { fontSize: 22, fontFamily: 'Inter_700Bold', color: Colors.textPrimary },
  tagRow: { flexDirection: 'row' as const, alignItems: 'center' as const, marginTop: -2 },
  tagText: { fontSize: 13, fontFamily: 'Inter_500Medium' },
  tagToast: {
    position: 'absolute' as const, top: 60, alignSelf: 'center' as const,
    flexDirection: 'row' as const, alignItems: 'center' as const, gap: 6,
    paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20,
    backgroundColor: '#1A1A2E', zIndex: 999,
  },
  tagToastText: { fontSize: 13, fontFamily: 'Inter_500Medium', color: '#FFFFFF' },
  profileEmail: { fontSize: 14, fontFamily: 'Inter_400Regular', color: Colors.textSecondary },
  editButton: {
    flexDirection: 'row' as const, alignItems: 'center' as const, gap: 6,
    marginTop: 8, paddingHorizontal: 16, paddingVertical: 8, borderRadius: 20, borderWidth: 1,
  },
  editButtonText: { fontSize: 13, fontFamily: 'Inter_600SemiBold' },
  statsSection: { marginBottom: 20 },
  progressionSection: { borderRadius: 16, borderWidth: 1, padding: 16, marginBottom: 20, gap: 14 },
  progressionBody: { gap: 4 },
  xpStatsRow: { flexDirection: 'row' as const, justifyContent: 'space-around' as const, borderTopWidth: 1, borderTopColor: Colors.border, paddingTop: 14 },
  xpStat: { alignItems: 'center' as const, gap: 2 },
  xpStatValue: { fontSize: 20, fontFamily: 'Inter_700Bold' },
  xpStatLabel: { fontSize: 11, fontFamily: 'Inter_400Regular', color: Colors.textTertiary },
  sectionTitle: { fontSize: 18, fontFamily: 'Inter_700Bold', color: Colors.textPrimary, marginBottom: 12 },
  statsGrid: {
    flexDirection: 'row' as const, backgroundColor: Colors.cardBackground,
    borderRadius: 16, padding: 16, borderWidth: 1, borderColor: Colors.border,
  },
  statItem: { flex: 1, alignItems: 'center' as const, gap: 4 },
  statValue: { fontSize: 24, fontFamily: 'Inter_700Bold', color: Colors.textPrimary },
  statLabel: { fontSize: 12, fontFamily: 'Inter_400Regular', color: Colors.textSecondary },
  actionsSection: {
    backgroundColor: Colors.cardBackground, borderRadius: 16,
    overflow: 'hidden' as const, borderWidth: 1, borderColor: Colors.border, marginTop: 8,
  },
  actionRow: {
    flexDirection: 'row' as const, alignItems: 'center' as const, gap: 12,
    padding: 16, borderBottomWidth: 1, borderBottomColor: Colors.border,
  },
  actionText: { fontSize: 15, fontFamily: 'Inter_500Medium' },
  actionBadge: {
    fontSize: 12, fontFamily: 'Inter_600SemiBold',
    paddingHorizontal: 8, paddingVertical: 3,
    borderRadius: 12, marginLeft: 'auto' as const, overflow: 'hidden' as const,
  },
  langOptionRow: {
    flexDirection: 'row' as const, alignItems: 'center' as const,
    paddingVertical: 14, paddingHorizontal: 4, gap: 14,
    borderBottomWidth: 1,
  },
  langOptionFlag: { fontSize: 22 },
  langOptionName: { fontSize: 16, fontFamily: 'Inter_500Medium', flex: 1 },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' as const },
  modalContent: {
    borderTopLeftRadius: 24, borderTopRightRadius: 24,
    paddingTop: 20, paddingHorizontal: 20,
    paddingBottom: Platform.OS === 'web' ? 34 : 32,
  },
  modalHeader: {
    flexDirection: 'row' as const, justifyContent: 'space-between' as const,
    alignItems: 'center' as const, marginBottom: 20,
  },
  modalTitle: { fontSize: 20, fontFamily: 'Inter_700Bold', color: Colors.textPrimary },
  fieldLabel: { fontSize: 13, fontFamily: 'Inter_600SemiBold', color: Colors.textSecondary, marginBottom: 8 },
  textInput: { borderRadius: 12, paddingHorizontal: 16, paddingVertical: 14, fontSize: 16, fontFamily: 'Inter_400Regular', marginBottom: 20 },
  saveButton: { borderRadius: 14, paddingVertical: 16, alignItems: 'center' as const },
  saveButtonText: { fontSize: 16, fontFamily: 'Inter_700Bold', color: '#FFFFFF' },
  pwRow: { flexDirection: 'row' as const, alignItems: 'center' as const, borderRadius: 12, paddingHorizontal: 16, paddingVertical: 4, marginBottom: 6 },
  pwInput: { flex: 1, fontSize: 16, fontFamily: 'Inter_400Regular', paddingVertical: 10 },
  pwRulesBox: { marginBottom: 12, paddingHorizontal: 4, gap: 6 },
  pwHintRow: { flexDirection: 'row' as const, alignItems: 'center' as const, gap: 5, marginBottom: 2, paddingHorizontal: 4 },
  pwHintText: { fontSize: 12, fontFamily: 'Inter_400Regular' },
  // Feedback
  fbCatGrid: { flexDirection: 'row' as const, flexWrap: 'wrap' as const, gap: 8 },
  fbCatChip: {
    flexDirection: 'row' as const, alignItems: 'center' as const, gap: 6,
    paddingHorizontal: 12, paddingVertical: 8, borderRadius: 20, borderWidth: 1.5,
  },
  fbCatText: { fontSize: 13, fontFamily: 'Inter_500Medium' },
  fbTextArea: {
    borderRadius: 12, paddingHorizontal: 14, paddingVertical: 12,
    fontSize: 15, fontFamily: 'Inter_400Regular',
    minHeight: 110, borderWidth: 1,
  },
  fbCharCount: { fontSize: 11, fontFamily: 'Inter_400Regular', textAlign: 'right' as const, marginTop: 4 },
  fbThankYou: { alignItems: 'center' as const, paddingVertical: 16, gap: 10 },
  fbThankYouIcon: { width: 72, height: 72, borderRadius: 36, justifyContent: 'center' as const, alignItems: 'center' as const, marginBottom: 4 },
  fbThankTitle: { fontSize: 24, fontFamily: 'Inter_700Bold' },
  fbThankSub: { fontSize: 15, fontFamily: 'Inter_400Regular', textAlign: 'center' as const, lineHeight: 22 },
  deleteConfirmCard: {
    borderRadius: 14, borderWidth: 1, padding: 16, marginTop: 12,
    gap: 12, alignItems: 'center' as const,
  },
  deleteConfirmText: { fontSize: 14, fontFamily: 'Inter_400Regular', textAlign: 'center' as const, lineHeight: 20 },
  deleteConfirmButtons: { flexDirection: 'row' as const, gap: 10, width: '100%' as const },
  deleteConfirmCancel: {
    flex: 1, paddingVertical: 12, borderRadius: 12, borderWidth: 1,
    alignItems: 'center' as const,
  },
  deleteConfirmCancelText: { fontSize: 14, fontFamily: 'Inter_600SemiBold' },
  deleteConfirmProceed: { flex: 2, paddingVertical: 12, borderRadius: 12, alignItems: 'center' as const },
  deleteConfirmProceedText: { fontSize: 14, fontFamily: 'Inter_700Bold', color: '#FFFFFF' },
  whatsappInfoRow: {
    flexDirection: 'row' as const, alignItems: 'flex-start' as const, gap: 10,
    borderRadius: 10, borderWidth: 1, padding: 12, marginBottom: 16,
  },
  whatsappInfoText: { flex: 1, fontSize: 13, fontFamily: 'Inter_400Regular', lineHeight: 19 },
  countryPickerBtn: {
    flexDirection: 'row' as const, alignItems: 'center' as const, gap: 10,
    borderRadius: 12, borderWidth: 1, paddingHorizontal: 14, paddingVertical: 14, marginBottom: 4,
  },
  countryPickerFlag: { fontSize: 22 },
  countryPickerName: { flex: 1, fontSize: 15, fontFamily: 'Inter_500Medium' },
  countryPickerCode: { fontSize: 14, fontFamily: 'Inter_400Regular' },
  whatsappToggleRow: {
    flexDirection: 'row' as const, alignItems: 'center' as const, gap: 10,
    borderRadius: 12, borderWidth: 1, padding: 14, marginBottom: 4,
  },
  whatsappToggleLabel: { flex: 1, fontSize: 14, fontFamily: 'Inter_500Medium' },
  phoneErrorText: { fontSize: 12, fontFamily: 'Inter_400Regular', marginTop: 4 },
  deletePhoneBtn: {
    flexDirection: 'row' as const, alignItems: 'center' as const, justifyContent: 'center' as const,
    gap: 8, borderRadius: 12, borderWidth: 1, paddingVertical: 12, marginTop: 10,
  },
  deletePhoneBtnText: { fontSize: 14, fontFamily: 'Inter_600SemiBold' },
  searchRow: {
    flexDirection: 'row' as const, alignItems: 'center' as const, gap: 10,
    borderRadius: 12, borderWidth: 1, paddingHorizontal: 12, height: 44, marginBottom: 12,
  },
  searchInput: { flex: 1, fontSize: 15, fontFamily: 'Inter_400Regular' },
  countryOption: {
    flexDirection: 'row' as const, alignItems: 'center' as const, gap: 12,
    paddingVertical: 12, borderBottomWidth: 1,
  },
  countryOptionFlag: { fontSize: 22 },
  countryOptionName: { flex: 1, fontSize: 15, fontFamily: 'Inter_500Medium' },
  countryOptionCode: { fontSize: 14, fontFamily: 'Inter_400Regular' },
  inboxBadge: {
    minWidth: 20, height: 20, borderRadius: 10,
    paddingHorizontal: 5, justifyContent: 'center' as const, alignItems: 'center' as const,
  },
  inboxBadgeText: { fontSize: 11, fontFamily: 'Inter_700Bold', color: '#FFFFFF' },
});
