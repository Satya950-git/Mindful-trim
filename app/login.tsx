import React, { useState, useCallback } from 'react';
import {
  View, Text, TextInput, StyleSheet, Platform, Alert,
  Pressable, Image, KeyboardAvoidingView, ScrollView,
} from 'react-native';
import { router } from 'expo-router';
import { useFocusEffect } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { useTranslation } from 'react-i18next';
import PrimaryButton from '@/components/PrimaryButton';
import { useAuth } from '@/context/AuthContext';
import { useThemeColors, ThemeColors } from '@/context/ThemeContext';

export default function LoginScreen() {
  const Colors = useThemeColors();
  const styles = makeStyles(Colors);
  const insets = useSafeAreaInsets();
  const topInset = Platform.OS === 'web' ? 67 : insets.top;
  const bottomInset = Platform.OS === 'web' ? 34 : insets.bottom;
  const { t } = useTranslation();
  const { login } = useAuth();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [errorType, setErrorType] = useState<'none' | 'emailNotFound' | 'wrongPassword'>('none');

  useFocusEffect(useCallback(() => {
    setErrorType('none');
  }, []));

  const handleLogin = async () => {
    if (!email.trim() || !password.trim()) return;
    const finalEmail = email.trim();
    setErrorType('none');
    setLoading(true);
    const result = await login(finalEmail.toLowerCase(), password);
    setLoading(false);
    if (result.success) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      router.replace('/');
    } else if (result.twoFactorRequired) {
      router.push({
        pathname: '/two-factor',
        params: { userId: result.userId!, email: result.email! },
      });
    } else {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      setErrorType(result.emailNotFound ? 'emailNotFound' : 'wrongPassword');
    }
  };

  return (
    <KeyboardAvoidingView
      style={{ flex: 1, backgroundColor: Colors.background }}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <ScrollView
        contentContainerStyle={[styles.scroll, { paddingTop: topInset, paddingBottom: bottomInset + 24 }]}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        {/* Back */}
        <Pressable style={styles.backButton} onPress={() => router.canGoBack() ? router.back() : router.replace('/welcome')}>
          <Ionicons name="arrow-back" size={22} color={Colors.textSecondary} />
        </Pressable>

        {/* Logo */}
        <View style={styles.logoSection}>
          <View style={styles.logoWrap}>
            <Image
              source={require('@/assets/images/logo.png')}
              style={styles.logo}
              resizeMode="contain"
            />
          </View>
          <Text style={styles.appName}>Mindful Trim</Text>
          <Text style={styles.tagline}>O J A S</Text>
        </View>

        {/* Form */}
        <View style={styles.formSection}>
          <Text style={styles.heading}>{t('login.welcomeBack')}</Text>
          <Text style={styles.subheading}>{t('login.subtitle')}</Text>

          <View style={styles.inputs}>
            <View>
              <View style={[styles.inputRow, { backgroundColor: Colors.inputBackground, borderColor: Colors.border }]}>
                <Ionicons name="mail-outline" size={18} color={Colors.textTertiary} />
                <TextInput
                  style={[styles.input, { color: Colors.textPrimary }]}
                  placeholder={t('common.emailAddress')}
                  placeholderTextColor={Colors.textTertiary}
                  value={email}
                  onChangeText={setEmail}
                  keyboardType="email-address"
                  autoCapitalize="none"
                  autoCorrect={false}
                />
              </View>
            </View>

            <View style={[styles.inputRow, { backgroundColor: Colors.inputBackground, borderColor: Colors.border }]}>
              <Ionicons name="lock-closed-outline" size={18} color={Colors.textTertiary} />
              <TextInput
                style={[styles.input, { color: Colors.textPrimary, flex: 1 }]}
                placeholder={t('common.password')}
                placeholderTextColor={Colors.textTertiary}
                value={password}
                onChangeText={setPassword}
                secureTextEntry={!showPassword}
              />
              <Pressable onPress={() => setShowPassword(!showPassword)} hitSlop={10}>
                <Ionicons
                  name={showPassword ? 'eye-off-outline' : 'eye-outline'}
                  size={18}
                  color={Colors.textTertiary}
                />
              </Pressable>
            </View>

            <Pressable onPress={() => router.push('/forgot-password')} style={styles.forgotRow}>
              <Text style={[styles.forgotText, { color: Colors.accent }]}>{t('login.forgotPassword')}</Text>
            </Pressable>
          </View>

          {errorType === 'emailNotFound' && (
            <View style={[styles.errorBox, { backgroundColor: Colors.error + '12', borderColor: Colors.error + '40' }]}>
              <Text style={[styles.errorText, { color: Colors.error }]}>
                {t('login.emailNotFound')}
              </Text>
              <Pressable onPress={() => router.replace('/register')} style={styles.errorLink}>
                <Text style={[styles.errorLinkText, { color: Colors.accent }]}>
                  {t('login.createAccount')}
                </Text>
              </Pressable>
            </View>
          )}

          {errorType === 'wrongPassword' && (
            <View style={[styles.errorBox, { backgroundColor: Colors.error + '12', borderColor: Colors.error + '40' }]}>
              <Text style={[styles.errorText, { color: Colors.error }]}>
                {t('login.incorrectPassword')}
              </Text>
            </View>
          )}

          <PrimaryButton
            title={t('common.signIn')}
            onPress={handleLogin}
            loading={loading}
            disabled={!email.trim() || !password.trim()}
            gradientColors={Colors.accentGradient}
          />
        </View>

        {/* Footer */}
        <View style={styles.footer}>
          <Text style={[styles.footerText, { color: Colors.textSecondary }]}>
            {t('login.noAccount')}
          </Text>
          <Pressable onPress={() => router.replace('/register')}>
            <Text style={[styles.footerLink, { color: Colors.accent }]}>{t('common.signUp')}</Text>
          </Pressable>
        </View>
      </ScrollView>

    </KeyboardAvoidingView>
  );
}

const makeStyles = (Colors: ThemeColors) => StyleSheet.create({
  scroll: {
    flexGrow: 1,
    paddingHorizontal: 28,
  },
  backButton: {
    width: 40,
    height: 40,
    justifyContent: 'center',
    marginBottom: 8,
  },
  logoSection: {
    alignItems: 'center',
    gap: 8,
    marginBottom: 36,
  },
  logoWrap: {
    width: 90,
    height: 90,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 6,
  },
  logo: {
    width: 90,
    height: 90,
  },
  appName: {
    fontSize: 22,
    fontFamily: 'Inter_700Bold',
    color: Colors.textPrimary,
    letterSpacing: 0.2,
  },
  tagline: {
    fontSize: 10,
    fontFamily: 'Inter_500Medium',
    color: Colors.textTertiary,
    letterSpacing: 4,
  },
  formSection: {
    flex: 1,
    justifyContent: 'center',
    gap: 16,
  },
  heading: {
    fontSize: 26,
    fontFamily: 'Inter_700Bold',
    color: Colors.textPrimary,
  },
  subheading: {
    fontSize: 14,
    fontFamily: 'Inter_400Regular',
    color: Colors.textSecondary,
    marginTop: -8,
  },
  inputs: {
    gap: 12,
  },
  inputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    borderRadius: 14,
    borderWidth: 1,
    paddingHorizontal: 16,
    height: 54,
  },
  input: {
    flex: 1,
    fontSize: 15,
    fontFamily: 'Inter_400Regular',
  },
  hintText: {
    fontSize: 11,
    fontFamily: 'Inter_400Regular',
    marginTop: 5,
    marginLeft: 4,
  },
  forgotRow: {
    alignSelf: 'flex-end',
    marginTop: -4,
  },
  forgotText: {
    fontSize: 13,
    fontFamily: 'Inter_500Medium',
  },
  errorBox: {
    borderRadius: 12,
    borderWidth: 1,
    paddingHorizontal: 14,
    paddingVertical: 12,
    gap: 6,
  },
  errorText: {
    fontSize: 13,
    fontFamily: 'Inter_500Medium',
  },
  errorLink: {
    alignSelf: 'flex-start',
  },
  errorLinkText: {
    fontSize: 13,
    fontFamily: 'Inter_700Bold',
  },
  footer: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 5,
    paddingTop: 28,
  },
  footerText: {
    fontSize: 14,
    fontFamily: 'Inter_400Regular',
  },
  footerLink: {
    fontSize: 14,
    fontFamily: 'Inter_700Bold',
  },
});
