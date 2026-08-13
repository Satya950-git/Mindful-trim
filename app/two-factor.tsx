import React, { useState, useRef, useEffect, useCallback } from 'react';
import {
  View, Text, TextInput, StyleSheet, Platform, Pressable,
  KeyboardAvoidingView, ScrollView,
} from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { useTranslation } from 'react-i18next';
import { useAuth } from '@/context/AuthContext';
import { useThemeColors, ThemeColors } from '@/context/ThemeContext';

export default function TwoFactorScreen() {
  const Colors = useThemeColors();
  const styles = makeStyles(Colors);
  const insets = useSafeAreaInsets();
  const topInset = Platform.OS === 'web' ? 67 : insets.top;
  const bottomInset = Platform.OS === 'web' ? 34 : insets.bottom;
  const { t } = useTranslation();
  const { verifyLoginOtp, resendLoginOtp } = useAuth();

  const params = useLocalSearchParams<{ userId: string; email: string }>();
  const { userId, email } = params;

  const [code, setCode] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [resendCooldown, setResendCooldown] = useState(60);
  const [resendMsg, setResendMsg] = useState('');
  const [rememberDevice, setRememberDevice] = useState(false);
  const inputRef = useRef<TextInput>(null);
  const cooldownRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    inputRef.current?.focus();
    startCooldown();
    return () => { if (cooldownRef.current) clearInterval(cooldownRef.current); };
  }, []);

  function startCooldown() {
    setResendCooldown(60);
    if (cooldownRef.current) clearInterval(cooldownRef.current);
    cooldownRef.current = setInterval(() => {
      setResendCooldown(prev => {
        if (prev <= 1) {
          clearInterval(cooldownRef.current!);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
  }

  const handleVerify = useCallback(async () => {
    if (code.length !== 6 || loading) return;
    setError('');
    setLoading(true);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    const result = await verifyLoginOtp(userId, code, { rememberDevice, email });
    setLoading(false);
    if (result.success) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      router.replace('/');
    } else {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      setCode('');
      const reason = result.reason;
      if (reason === 'expired') setError(t('twoFactor.expiredCode'));
      else if (reason === 'max_attempts') setError(t('twoFactor.tooManyAttempts'));
      else setError(t('twoFactor.invalidCode'));
    }
  }, [code, loading, userId, email, rememberDevice, verifyLoginOtp, t]);

  const handleResend = useCallback(async () => {
    if (resendCooldown > 0 || loading) return;
    setError('');
    setResendMsg('');
    setLoading(true);
    const result = await resendLoginOtp(userId);
    setLoading(false);
    if (result.success) {
      setCode('');
      setResendMsg(t('twoFactor.resendSuccess'));
      startCooldown();
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } else {
      setError(result.message || t('twoFactor.invalidCode'));
    }
  }, [resendCooldown, loading, userId, resendLoginOtp, t]);

  const handleCodeChange = (val: string) => {
    const digits = val.replace(/\D/g, '').slice(0, 6);
    setCode(digits);
    setError('');
    setResendMsg('');
  };

  return (
    <KeyboardAvoidingView
      style={{ flex: 1, backgroundColor: Colors.background }}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView
        contentContainerStyle={[styles.scroll, { paddingTop: topInset + 24, paddingBottom: bottomInset + 24 }]}
        keyboardShouldPersistTaps="handled"
      >
        {/* Back button */}
        <Pressable
          onPress={() => router.replace('/login')}
          style={styles.backBtn}
          hitSlop={12}
        >
          <Ionicons name="arrow-back" size={24} color={Colors.textPrimary} />
        </Pressable>

        {/* Lock icon */}
        <View style={[styles.iconWrap, { backgroundColor: Colors.accent + '18', borderColor: Colors.accent + '30' }]}>
          <Ionicons name="shield-checkmark-outline" size={36} color={Colors.accent} />
        </View>

        <Text style={[styles.title, { color: Colors.textPrimary }]}>{t('twoFactor.title')}</Text>
        <Text style={[styles.subtitle, { color: Colors.textSecondary }]}>
          {t('twoFactor.subtitle')}{'\n'}
          <Text style={{ fontFamily: 'Inter_600SemiBold', color: Colors.textPrimary }}>{email}</Text>
        </Text>

        {/* Code input */}
        <View style={[styles.inputWrap, { borderColor: error ? Colors.error : Colors.border, backgroundColor: Colors.cardBackground }]}>
          <TextInput
            ref={inputRef}
            value={code}
            onChangeText={handleCodeChange}
            placeholder={t('twoFactor.codePlaceholder')}
            placeholderTextColor={Colors.textSecondary + '60'}
            keyboardType="number-pad"
            maxLength={6}
            style={[styles.codeInput, { color: Colors.textPrimary }]}
            onSubmitEditing={handleVerify}
            editable={!loading}
            returnKeyType="done"
            textContentType="oneTimeCode"
            autoComplete="one-time-code"
          />
        </View>

        {/* Error / resend messages */}
        {error ? (
          <Text style={[styles.errorText, { color: Colors.error }]}>{error}</Text>
        ) : null}
        {resendMsg && !error ? (
          <Text style={[styles.successText, { color: '#56C596' }]}>{resendMsg}</Text>
        ) : null}

        {/* Remember this device */}
        <Pressable
          onPress={() => setRememberDevice(v => !v)}
          style={styles.rememberRow}
          hitSlop={8}
        >
          <View style={[styles.checkbox, { borderColor: rememberDevice ? Colors.accent : Colors.border, backgroundColor: rememberDevice ? Colors.accent : 'transparent' }]}>
            {rememberDevice && <Ionicons name="checkmark" size={13} color="#fff" />}
          </View>
          <Text style={[styles.rememberText, { color: Colors.textSecondary }]}>
            {t('twoFactor.rememberDevice')}
          </Text>
        </Pressable>

        {/* Verify button */}
        <Pressable
          onPress={handleVerify}
          disabled={code.length !== 6 || loading}
          style={({ pressed }) => [
            styles.verifyBtn,
            { backgroundColor: Colors.accent, opacity: (code.length !== 6 || loading) ? 0.5 : pressed ? 0.85 : 1 },
          ]}
        >
          <Text style={styles.verifyBtnText}>
            {loading ? t('twoFactor.verifying') : t('twoFactor.verify')}
          </Text>
        </Pressable>

        {/* Resend */}
        <Pressable
          onPress={handleResend}
          disabled={resendCooldown > 0 || loading}
          style={{ marginTop: 16, alignSelf: 'center' }}
        >
          <Text style={[styles.resendText, { color: resendCooldown > 0 ? Colors.textSecondary : Colors.accent }]}>
            {resendCooldown > 0
              ? t('twoFactor.resendIn', { seconds: resendCooldown })
              : t('twoFactor.resend')}
          </Text>
        </Pressable>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

function makeStyles(Colors: ThemeColors) {
  return StyleSheet.create({
    scroll: {
      flexGrow: 1,
      paddingHorizontal: 28,
      alignItems: 'center',
    },
    backBtn: {
      alignSelf: 'flex-start',
      marginBottom: 32,
    },
    iconWrap: {
      width: 80,
      height: 80,
      borderRadius: 40,
      borderWidth: 1.5,
      justifyContent: 'center',
      alignItems: 'center',
      marginBottom: 24,
    },
    title: {
      fontSize: 26,
      fontFamily: 'Inter_700Bold',
      textAlign: 'center',
      marginBottom: 10,
    },
    subtitle: {
      fontSize: 15,
      fontFamily: 'Inter_400Regular',
      textAlign: 'center',
      lineHeight: 22,
      marginBottom: 32,
    },
    inputWrap: {
      width: '100%',
      borderWidth: 1.5,
      borderRadius: 16,
      paddingHorizontal: 20,
      paddingVertical: 14,
      marginBottom: 10,
    },
    codeInput: {
      fontSize: 32,
      fontFamily: 'Inter_700Bold',
      letterSpacing: 10,
      textAlign: 'center',
      width: '100%',
    },
    errorText: {
      fontSize: 14,
      fontFamily: 'Inter_400Regular',
      textAlign: 'center',
      marginBottom: 12,
    },
    successText: {
      fontSize: 14,
      fontFamily: 'Inter_400Regular',
      textAlign: 'center',
      marginBottom: 12,
    },
    verifyBtn: {
      width: '100%',
      paddingVertical: 17,
      borderRadius: 28,
      alignItems: 'center',
      marginTop: 8,
    },
    verifyBtnText: {
      fontSize: 17,
      fontFamily: 'Inter_700Bold',
      color: '#fff',
    },
    rememberRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
      alignSelf: 'flex-start',
      marginBottom: 16,
      marginTop: 4,
    },
    checkbox: {
      width: 20,
      height: 20,
      borderRadius: 5,
      borderWidth: 1.5,
      justifyContent: 'center',
      alignItems: 'center',
    },
    rememberText: {
      fontSize: 14,
      fontFamily: 'Inter_400Regular',
    },
    resendText: {
      fontSize: 15,
      fontFamily: 'Inter_500Medium',
    },
  });
}
