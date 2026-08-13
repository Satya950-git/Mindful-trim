import React, { useState, useEffect, useRef } from 'react';
import {
  View, Text, TextInput, StyleSheet, Platform,
  Pressable, KeyboardAvoidingView, ScrollView,
} from 'react-native';
import { router } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import type { ComponentProps } from 'react';
import * as Haptics from 'expo-haptics';
import { useTranslation } from 'react-i18next';
import { useAuth } from '@/context/AuthContext';
import { useThemeColors, ThemeColors } from '@/context/ThemeContext';
import PrimaryButton from '@/components/PrimaryButton';
import { getApiUrl } from '@/lib/query-client';

type Step = 'email' | 'answer' | 'otp' | 'newPassword' | 'success';
type IonIconName = ComponentProps<typeof Ionicons>['name'];

type PasswordRule = { labelKey: string; met: boolean };

function getPasswordRules(password: string): PasswordRule[] {
  return [
    { labelKey: 'forgotPassword.rule8Chars', met: password.length >= 8 },
    { labelKey: 'forgotPassword.ruleLetter', met: /[a-zA-Z]/.test(password) },
    { labelKey: 'forgotPassword.ruleNumber', met: /\d/.test(password) },
  ];
}

function getStrengthColor(rules: PasswordRule[]): string {
  const met = rules.filter(r => r.met).length;
  if (met === 0) return '#E5E7EB';
  if (met === 1) return '#EF4444';
  if (met === 2) return '#F59E0B';
  return '#22C55E';
}

function normalizeEmail(raw: string): string {
  return raw.trim();
}

function stepIcon(step: Step): IonIconName {
  switch (step) {
    case 'email': return 'mail-outline';
    case 'answer': return 'shield-checkmark-outline';
    case 'otp': return 'keypad-outline';
    case 'newPassword': return 'lock-closed-outline';
    case 'success': return 'checkmark-circle-outline';
  }
}

export default function ForgotPasswordScreen() {
  const Colors = useThemeColors();
  const styles = makeStyles(Colors);
  const insets = useSafeAreaInsets();
  const topInset = Platform.OS === 'web' ? 67 : insets.top;
  const bottomInset = Platform.OS === 'web' ? 34 : insets.bottom;
  const { t, i18n } = useTranslation();
  const { getSecurityQuestion, verifySecurityAnswer } = useAuth();

  const [step, setStep] = useState<Step>('email');
  const [email, setEmail] = useState('');
  const [securityQuestion, setSecurityQuestion] = useState('');
  const [answer, setAnswer] = useState('');
  const [otp, setOtp] = useState('');
  const [resetToken, setResetToken] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showAnswer, setShowAnswer] = useState(false);
  const [passwordTouched, setPasswordTouched] = useState(false);
  const [loading, setLoading] = useState(false);
  const [resendLoading, setResendLoading] = useState(false);
  const [otpSentMessage, setOtpSentMessage] = useState('');
  const [error, setError] = useState('');
  const [resendCooldown, setResendCooldown] = useState(0);
  const cooldownRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    return () => {
      if (cooldownRef.current) clearInterval(cooldownRef.current);
    };
  }, []);

  const startCooldown = (seconds: number) => {
    if (cooldownRef.current) clearInterval(cooldownRef.current);
    setResendCooldown(seconds);
    cooldownRef.current = setInterval(() => {
      setResendCooldown(prev => {
        if (prev <= 1) {
          clearInterval(cooldownRef.current!);
          cooldownRef.current = null;
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
  };

  const passwordRules = getPasswordRules(newPassword);
  const strengthColor = getStrengthColor(passwordRules);
  const metCount = passwordRules.filter(r => r.met).length;
  const passwordValid = passwordRules.every(r => r.met);

  const normalizedEmail = normalizeEmail(email);

  function stepTitle(s: Step): string {
    switch (s) {
      case 'email': return t('forgotPassword.emailTitle');
      case 'answer': return t('forgotPassword.answerTitle');
      case 'otp': return 'Check your email';
      case 'newPassword': return t('forgotPassword.newPasswordTitle');
      case 'success': return t('forgotPassword.successTitle');
    }
  }

  function stepSubtitle(s: Step): string {
    switch (s) {
      case 'email': return t('forgotPassword.emailSubtitle');
      case 'answer': return t('forgotPassword.answerSubtitle');
      case 'otp': return `We sent a 6-digit code to ${normalizedEmail}`;
      case 'newPassword': return t('forgotPassword.newPasswordSubtitle');
      case 'success': return t('forgotPassword.successSubtitle');
    }
  }

  const handleEmailSubmit = async () => {
    if (!normalizedEmail) {
      setError(t('forgotPassword.emailRequired'));
      return;
    }
    setError('');
    setLoading(true);
    const result = await getSecurityQuestion(normalizedEmail);
    setLoading(false);
    if (!result.success || !result.question) {
      setError(result.message);
      return;
    }
    setSecurityQuestion(result.question);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setStep('answer');
  };

  const handleAnswerSubmit = async () => {
    if (!answer.trim()) {
      setError(t('forgotPassword.answerRequired'));
      return;
    }
    setError('');
    setLoading(true);
    const result = await verifySecurityAnswer(normalizedEmail, answer.trim());
    setLoading(false);
    if (!result.success || !result.resetToken) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      setError(result.code === 'WRONG_ANSWER'
        ? t('forgotPassword.incorrectAnswer')
        : t('forgotPassword.genericError'));
      return;
    }
    setResetToken(result.resetToken);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setStep('newPassword');
  };

  const sendOtp = async (): Promise<{ ok: boolean; retryAfter?: number }> => {
    try {
      const url = new URL('/api/auth/forgot-password-otp', getApiUrl());
      const res = await fetch(url.toString(), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: normalizedEmail, lang: i18n.language }),
      });
      if (res.status === 429) {
        const data = await res.json().catch(() => ({}));
        return { ok: false, retryAfter: data.retryAfter };
      }
      return { ok: res.ok };
    } catch {
      return { ok: false };
    }
  };

  const handleTryAnotherWay = async () => {
    setError('');
    setLoading(true);
    const { ok, retryAfter } = await sendOtp();
    setLoading(false);
    if (!ok) {
      if (retryAfter) {
        startCooldown(retryAfter);
        setError(`Please wait ${retryAfter}s before requesting another code.`);
      } else {
        setError('Failed to send code. Please try again.');
      }
      return;
    }
    setOtp('');
    setOtpSentMessage('Code sent! Check your inbox.');
    startCooldown(60);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setStep('otp');
  };

  const handleOtpSubmit = async () => {
    if (otp.trim().length !== 6) {
      setError('Please enter the 6-digit code.');
      return;
    }
    setError('');
    setLoading(true);
    try {
      const url = new URL('/api/auth/verify-password-otp', getApiUrl());
      const res = await fetch(url.toString(), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: normalizedEmail, otp: otp.trim() }),
      });
      const data = await res.json();
      if (!res.ok || !data.resetToken) {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
        setError(data.message || 'Incorrect code. Please try again.');
        setLoading(false);
        return;
      }
      setResetToken(data.resetToken);
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      setStep('newPassword');
    } catch {
      setError('Something went wrong. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const handleResendOtp = async () => {
    if (resendCooldown > 0) return;
    setError('');
    setResendLoading(true);
    const { ok, retryAfter } = await sendOtp();
    setResendLoading(false);
    if (!ok) {
      if (retryAfter) {
        startCooldown(retryAfter);
        setError(`Please wait ${retryAfter}s before requesting another code.`);
      } else {
        setError('Failed to resend code. Please try again.');
      }
      return;
    }
    setOtpSentMessage('New code sent! Check your inbox.');
    startCooldown(60);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  };

  const handlePasswordSubmit = async () => {
    if (!passwordValid) {
      setError(t('forgotPassword.passwordWeak'));
      return;
    }
    if (newPassword !== confirmPassword) {
      setError(t('forgotPassword.passwordMismatch'));
      return;
    }
    setError('');
    setLoading(true);
    try {
      const url = new URL('/api/auth/confirm-reset-password', getApiUrl());
      const res = await fetch(url.toString(), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token: resetToken, newPassword }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.message || t('forgotPassword.resetFailed'));
        setLoading(false);
        return;
      }
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setStep('success');
    } catch {
      setError(t('forgotPassword.genericError'));
    } finally {
      setLoading(false);
    }
  };

  const handleBack = () => {
    if (step === 'email' || step === 'success') {
      router.back();
    } else if (step === 'answer') {
      setError('');
      setStep('email');
    } else if (step === 'otp') {
      setError('');
      setOtpSentMessage('');
      setStep('answer');
    } else if (step === 'newPassword') {
      setError('');
      setStep('answer');
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
        <Pressable style={styles.backButton} onPress={handleBack}>
          <Ionicons name="arrow-back" size={22} color={Colors.textSecondary} />
        </Pressable>

        <View style={styles.iconWrap}>
          <View style={[styles.iconCircle, { backgroundColor: Colors.accent + '20' }]}>
            <Ionicons
              name={stepIcon(step)}
              size={40}
              color={step === 'success' ? '#22C55E' : Colors.accent}
            />
          </View>
        </View>

        <Text style={[styles.title, { color: Colors.textPrimary }]}>{stepTitle(step)}</Text>
        <Text style={[styles.subtitle, { color: Colors.textSecondary }]}>{stepSubtitle(step)}</Text>

        {step === 'email' && (
          <View style={styles.form}>
            <View style={[
              styles.inputRow,
              { backgroundColor: Colors.inputBackground, borderColor: error ? '#EF4444' : Colors.border },
            ]}>
              <Ionicons name="mail-outline" size={18} color={Colors.textTertiary} />
              <TextInput
                style={[styles.input, { color: Colors.textPrimary }]}
                placeholder={t('forgotPassword.emailPlaceholder')}
                placeholderTextColor={Colors.textTertiary}
                value={email}
                onChangeText={v => { setEmail(v); setError(''); }}
                keyboardType="email-address"
                autoCapitalize="none"
                autoCorrect={false}
                autoFocus
                onSubmitEditing={handleEmailSubmit}
                returnKeyType="go"
              />
            </View>
            {error ? <Text style={styles.errorText}>{error}</Text> : null}
            <PrimaryButton
              title={t('forgotPassword.continueBtn')}
              onPress={handleEmailSubmit}
              loading={loading}
              disabled={!email.trim()}
              gradientColors={Colors.accentGradient}
            />
          </View>
        )}

        {step === 'answer' && (
          <View style={styles.form}>
            <View style={[styles.questionBox, { backgroundColor: Colors.cardBackground, borderColor: Colors.border }]}>
              <Text style={[styles.questionText, { color: Colors.textPrimary }]}>{securityQuestion}</Text>
            </View>
            <View style={[
              styles.inputRow,
              { backgroundColor: Colors.inputBackground, borderColor: error ? '#EF4444' : Colors.border },
            ]}>
              <Ionicons name="key-outline" size={18} color={Colors.textTertiary} />
              <TextInput
                style={[styles.input, { color: Colors.textPrimary }]}
                placeholder={t('forgotPassword.answerPlaceholder')}
                placeholderTextColor={Colors.textTertiary}
                value={answer}
                onChangeText={v => { setAnswer(v); setError(''); }}
                autoCapitalize="none"
                autoCorrect={false}
                autoFocus
                secureTextEntry={!showAnswer}
                onSubmitEditing={handleAnswerSubmit}
                returnKeyType="go"
              />
              <Pressable onPress={() => setShowAnswer(v => !v)} hitSlop={10}>
                <Ionicons name={showAnswer ? 'eye-off-outline' : 'eye-outline'} size={18} color={Colors.textTertiary} />
              </Pressable>
            </View>
            {error ? <Text style={styles.errorText}>{error}</Text> : null}
            <PrimaryButton
              title={t('forgotPassword.verifyBtn')}
              onPress={handleAnswerSubmit}
              loading={loading}
              disabled={!answer.trim()}
              gradientColors={Colors.accentGradient}
            />
            <Pressable
              style={styles.tryAnotherWayRow}
              onPress={handleTryAnotherWay}
              disabled={loading}
            >
              <Ionicons name="mail-outline" size={15} color={Colors.accent} />
              <Text style={[styles.tryAnotherWayText, { color: Colors.accent }]}>
                Try another way — send code to email
              </Text>
            </Pressable>
          </View>
        )}

        {step === 'otp' && (
          <View style={styles.form}>
            {otpSentMessage ? (
              <View style={[styles.sentBadge, { backgroundColor: '#22C55E18', borderColor: '#22C55E40' }]}>
                <Ionicons name="checkmark-circle-outline" size={15} color="#22C55E" />
                <Text style={[styles.sentBadgeText, { color: '#22C55E' }]}>{otpSentMessage}</Text>
              </View>
            ) : null}
            <View style={[
              styles.inputRow,
              { backgroundColor: Colors.inputBackground, borderColor: error ? '#EF4444' : Colors.border },
            ]}>
              <Ionicons name="keypad-outline" size={18} color={Colors.textTertiary} />
              <TextInput
                style={[styles.input, { color: Colors.textPrimary, textAlign: 'center', letterSpacing: 6, fontSize: 20, fontFamily: 'Inter_700Bold' }]}
                placeholder="— — — — — —"
                placeholderTextColor={Colors.textTertiary}
                value={otp}
                onChangeText={v => { setOtp(v.replace(/\D/g, '').slice(0, 6)); setError(''); }}
                keyboardType="number-pad"
                autoFocus
                maxLength={6}
                onSubmitEditing={handleOtpSubmit}
                returnKeyType="go"
              />
            </View>
            {error ? <Text style={styles.errorText}>{error}</Text> : null}
            <PrimaryButton
              title="Verify code"
              onPress={handleOtpSubmit}
              loading={loading}
              disabled={otp.trim().length !== 6}
              gradientColors={Colors.accentGradient}
            />
            <Pressable
              style={[styles.resendRow, (resendLoading || resendCooldown > 0) && styles.resendDisabled]}
              onPress={handleResendOtp}
              disabled={resendLoading || resendCooldown > 0}
            >
              {resendLoading
                ? <Text style={[styles.resendText, { color: Colors.textTertiary }]}>Sending…</Text>
                : resendCooldown > 0
                  ? <Text style={[styles.resendText, { color: Colors.textTertiary }]}>Resend in {resendCooldown}s</Text>
                  : (
                    <>
                      <Ionicons name="refresh-outline" size={14} color={Colors.textSecondary} />
                      <Text style={[styles.resendText, { color: Colors.textSecondary }]}>Resend code</Text>
                    </>
                  )}
            </Pressable>
          </View>
        )}

        {step === 'newPassword' && (
          <View style={styles.form}>
            <View>
              <View style={[
                styles.inputRow,
                { backgroundColor: Colors.inputBackground, borderColor: error ? '#EF4444' : Colors.border },
              ]}>
                <Ionicons name="lock-closed-outline" size={18} color={Colors.textTertiary} />
                <TextInput
                  style={[styles.input, { color: Colors.textPrimary, flex: 1 }]}
                  placeholder={t('forgotPassword.newPasswordPlaceholder')}
                  placeholderTextColor={Colors.textTertiary}
                  value={newPassword}
                  onChangeText={v => { setNewPassword(v); setPasswordTouched(true); setError(''); }}
                  secureTextEntry={!showPassword}
                  autoFocus
                  returnKeyType="next"
                />
                <Pressable onPress={() => setShowPassword(!showPassword)} hitSlop={10}>
                  <Ionicons
                    name={showPassword ? 'eye-off-outline' : 'eye-outline'}
                    size={18}
                    color={Colors.textTertiary}
                  />
                </Pressable>
              </View>

              {passwordTouched && newPassword.length > 0 && (
                <View style={styles.strengthSection}>
                  <View style={styles.strengthBarRow}>
                    {[0, 1, 2].map(i => (
                      <View
                        key={i}
                        style={[
                          styles.strengthSegment,
                          { backgroundColor: i < metCount ? strengthColor : Colors.border },
                        ]}
                      />
                    ))}
                  </View>
                  <View style={styles.rulesGrid}>
                    {passwordRules.map(rule => (
                      <View key={rule.labelKey} style={styles.ruleRow}>
                        <Ionicons
                          name={rule.met ? 'checkmark-circle' : 'ellipse-outline'}
                          size={13}
                          color={rule.met ? '#22C55E' : Colors.textTertiary}
                        />
                        <Text style={[styles.ruleText, { color: rule.met ? '#22C55E' : Colors.textTertiary }]}>
                          {t(rule.labelKey)}
                        </Text>
                      </View>
                    ))}
                  </View>
                </View>
              )}
            </View>

            <View style={[
              styles.inputRow,
              { backgroundColor: Colors.inputBackground, borderColor: error ? '#EF4444' : Colors.border },
            ]}>
              <Ionicons name="lock-closed-outline" size={18} color={Colors.textTertiary} />
              <TextInput
                style={[styles.input, { color: Colors.textPrimary }]}
                placeholder={t('forgotPassword.confirmPasswordPlaceholder')}
                placeholderTextColor={Colors.textTertiary}
                value={confirmPassword}
                onChangeText={v => { setConfirmPassword(v); setError(''); }}
                secureTextEntry={!showPassword}
                onSubmitEditing={handlePasswordSubmit}
                returnKeyType="done"
              />
            </View>
            {error ? <Text style={styles.errorText}>{error}</Text> : null}
            <PrimaryButton
              title={t('forgotPassword.resetBtn')}
              onPress={handlePasswordSubmit}
              loading={loading}
              disabled={!passwordValid || !confirmPassword.trim()}
              gradientColors={Colors.accentGradient}
            />
          </View>
        )}

        {step === 'success' && (
          <View style={styles.form}>
            <PrimaryButton
              title={t('forgotPassword.backToSignIn')}
              onPress={() => router.replace('/login')}
              loading={false}
              disabled={false}
              gradientColors={Colors.accentGradient}
            />
          </View>
        )}

        {step !== 'success' && (
          <Pressable onPress={() => router.back()} style={styles.backRow}>
            <Ionicons name="arrow-back-outline" size={16} color={Colors.textSecondary} />
            <Text style={[styles.backText, { color: Colors.textSecondary }]}>{t('forgotPassword.backToSignIn')}</Text>
          </Pressable>
        )}
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
    marginBottom: 16,
  },
  iconWrap: {
    alignItems: 'center',
    marginBottom: 28,
    marginTop: 12,
  },
  iconCircle: {
    width: 88,
    height: 88,
    borderRadius: 44,
    justifyContent: 'center',
    alignItems: 'center',
  },
  title: {
    fontSize: 26,
    fontFamily: 'Inter_700Bold',
    textAlign: 'center',
    marginBottom: 12,
  },
  subtitle: {
    fontSize: 14,
    fontFamily: 'Inter_400Regular',
    textAlign: 'center',
    lineHeight: 22,
    marginBottom: 8,
  },
  form: {
    marginTop: 28,
    gap: 14,
  },
  questionBox: {
    borderRadius: 14,
    borderWidth: 1,
    padding: 16,
  },
  questionText: {
    fontSize: 15,
    fontFamily: 'Inter_500Medium',
    lineHeight: 22,
    textAlign: 'center',
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
  strengthSection: {
    marginTop: 8,
    gap: 6,
  },
  strengthBarRow: {
    flexDirection: 'row',
    gap: 4,
  },
  strengthSegment: {
    flex: 1,
    height: 4,
    borderRadius: 2,
  },
  rulesGrid: {
    gap: 4,
  },
  ruleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  ruleText: {
    fontSize: 12,
    fontFamily: 'Inter_400Regular',
  },
  errorText: {
    color: '#EF4444',
    fontSize: 13,
    fontFamily: 'Inter_400Regular',
    textAlign: 'center',
  },
  backRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    marginTop: 28,
  },
  backText: {
    fontSize: 14,
    fontFamily: 'Inter_500Medium',
  },
  tryAnotherWayRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 4,
  },
  tryAnotherWayText: {
    fontSize: 14,
    fontFamily: 'Inter_500Medium',
  },
  sentBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    borderRadius: 10,
    borderWidth: 1,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  sentBadgeText: {
    fontSize: 13,
    fontFamily: 'Inter_500Medium',
  },
  resendRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 5,
    paddingVertical: 2,
  },
  resendDisabled: {
    opacity: 0.5,
  },
  resendText: {
    fontSize: 13,
    fontFamily: 'Inter_500Medium',
  },
});
