import React, { useEffect, useState } from 'react';
import {
  View, Text, TextInput, StyleSheet, Platform,
  Pressable, ActivityIndicator, KeyboardAvoidingView, ScrollView,
} from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { getApiUrl } from '@/lib/query-client';
import { useThemeColors, ThemeColors } from '@/context/ThemeContext';

type Step = 'verifying' | 'invalid' | 'form' | 'success';

type PasswordRule = { label: string; met: boolean };

function getPasswordRules(password: string): PasswordRule[] {
  return [
    { label: 'At least 8 characters', met: password.length >= 8 },
    { label: 'Contains a letter', met: /[a-zA-Z]/.test(password) },
    { label: 'Contains a number', met: /\d/.test(password) },
  ];
}

function getStrengthColor(rules: PasswordRule[]): string {
  const met = rules.filter(r => r.met).length;
  if (met === 0) return '#E5E7EB';
  if (met === 1) return '#EF4444';
  if (met === 2) return '#F59E0B';
  return '#22C55E';
}

export default function ResetPasswordScreen() {
  const Colors = useThemeColors();
  const styles = makeStyles(Colors);
  const insets = useSafeAreaInsets();
  const topInset = Platform.OS === 'web' ? 67 : insets.top;
  const bottomInset = Platform.OS === 'web' ? 34 : insets.bottom;
  const { token } = useLocalSearchParams<{ token: string }>();

  const [step, setStep] = useState<Step>('verifying');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showNew, setShowNew] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [passwordTouched, setPasswordTouched] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  const passwordRules = getPasswordRules(newPassword);
  const strengthColor = getStrengthColor(passwordRules);
  const metCount = passwordRules.filter(r => r.met).length;
  const passwordValid = passwordRules.every(r => r.met);

  useEffect(() => {
    if (!token) { setStep('invalid'); return; }
    (async () => {
      try {
        const res = await fetch(new URL(`/api/auth/verify-reset-token/${token}`, getApiUrl()).toString());
        const data = await res.json();
        setStep(data.valid ? 'form' : 'invalid');
      } catch {
        setStep('invalid');
      }
    })();
  }, [token]);

  const handleSubmit = async () => {
    setError('');
    if (!passwordValid) { setError('Password must be at least 8 characters, contain a letter and a number.'); return; }
    if (newPassword !== confirmPassword) { setError('Passwords do not match.'); return; }
    setSubmitting(true);
    try {
      const res = await fetch(new URL('/api/auth/confirm-reset-password', getApiUrl()).toString(), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, newPassword }),
      });
      const data = await res.json();
      if (res.ok) {
        setStep('success');
      } else {
        setError(data.message || 'Failed to reset password.');
      }
    } catch {
      setError('Something went wrong. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <KeyboardAvoidingView
      style={{ flex: 1, backgroundColor: Colors.background }}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView
        contentContainerStyle={[styles.scroll, { paddingTop: topInset + 20, paddingBottom: bottomInset + 24 }]}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        {/* Header */}
        <View style={styles.iconWrap}>
          <View style={[styles.iconCircle, { backgroundColor: Colors.accent + '20' }]}>
            <Ionicons name="lock-closed" size={36} color={Colors.accent} />
          </View>
        </View>

        {step === 'verifying' && (
          <View style={styles.center}>
            <ActivityIndicator size="large" color={Colors.accent} />
            <Text style={[styles.subtitle, { color: Colors.textSecondary, marginTop: 16 }]}>
              Verifying your link…
            </Text>
          </View>
        )}

        {step === 'invalid' && (
          <View style={styles.center}>
            <Ionicons name="warning-outline" size={48} color="#EF4444" style={{ marginBottom: 16 }} />
            <Text style={[styles.title, { color: Colors.textPrimary }]}>Link Expired</Text>
            <Text style={[styles.subtitle, { color: Colors.textSecondary }]}>
              This reset link is invalid or has expired. Please request a new one.
            </Text>
            <Pressable
              style={[styles.button, { backgroundColor: Colors.accent, marginTop: 28 }]}
              onPress={() => router.replace('/login')}
            >
              <Text style={styles.buttonText}>Back to Login</Text>
            </Pressable>
          </View>
        )}

        {step === 'form' && (
          <>
            <Text style={[styles.title, { color: Colors.textPrimary }]}>New Password</Text>
            <Text style={[styles.subtitle, { color: Colors.textSecondary }]}>
              Choose a strong password for your account.
            </Text>

            <View style={styles.inputs}>
              <View>
                <View style={[styles.inputRow, { backgroundColor: Colors.inputBackground, borderColor: Colors.border }]}>
                  <Ionicons name="lock-closed-outline" size={18} color={Colors.textTertiary} />
                  <TextInput
                    style={[styles.input, { color: Colors.textPrimary }]}
                    placeholder="New password"
                    placeholderTextColor={Colors.textTertiary}
                    value={newPassword}
                    onChangeText={v => { setNewPassword(v); setPasswordTouched(true); }}
                    secureTextEntry={!showNew}
                  />
                  <Pressable onPress={() => setShowNew(!showNew)} hitSlop={10}>
                    <Ionicons name={showNew ? 'eye-off-outline' : 'eye-outline'} size={18} color={Colors.textTertiary} />
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
                        <View key={rule.label} style={styles.ruleRow}>
                          <Ionicons
                            name={rule.met ? 'checkmark-circle' : 'ellipse-outline'}
                            size={13}
                            color={rule.met ? '#22C55E' : Colors.textTertiary}
                          />
                          <Text style={[styles.ruleText, { color: rule.met ? '#22C55E' : Colors.textTertiary }]}>
                            {rule.label}
                          </Text>
                        </View>
                      ))}
                    </View>
                  </View>
                )}
              </View>

              <View style={[styles.inputRow, { backgroundColor: Colors.inputBackground, borderColor: Colors.border }]}>
                <Ionicons name="lock-closed-outline" size={18} color={Colors.textTertiary} />
                <TextInput
                  style={[styles.input, { color: Colors.textPrimary }]}
                  placeholder="Confirm password"
                  placeholderTextColor={Colors.textTertiary}
                  value={confirmPassword}
                  onChangeText={setConfirmPassword}
                  secureTextEntry={!showConfirm}
                />
                <Pressable onPress={() => setShowConfirm(!showConfirm)} hitSlop={10}>
                  <Ionicons name={showConfirm ? 'eye-off-outline' : 'eye-outline'} size={18} color={Colors.textTertiary} />
                </Pressable>
              </View>

              {error ? (
                <Text style={styles.errorText}>{error}</Text>
              ) : null}
            </View>

            <Pressable
              style={[styles.button, { backgroundColor: Colors.accent }, (!passwordValid || submitting) && { opacity: 0.6 }]}
              onPress={handleSubmit}
              disabled={!passwordValid || submitting}
            >
              {submitting
                ? <ActivityIndicator color="#fff" />
                : <Text style={styles.buttonText}>Reset Password</Text>
              }
            </Pressable>
          </>
        )}

        {step === 'success' && (
          <View style={styles.center}>
            <Ionicons name="checkmark-circle" size={64} color="#22C55E" style={{ marginBottom: 16 }} />
            <Text style={[styles.title, { color: Colors.textPrimary }]}>Password Updated!</Text>
            <Text style={[styles.subtitle, { color: Colors.textSecondary }]}>
              Your password has been reset successfully. You can now sign in.
            </Text>
            <Pressable
              style={[styles.button, { backgroundColor: Colors.accent, marginTop: 28 }]}
              onPress={() => router.replace('/login')}
            >
              <Text style={styles.buttonText}>Sign In</Text>
            </Pressable>
          </View>
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
  iconWrap: {
    alignItems: 'center',
    marginBottom: 28,
  },
  iconCircle: {
    width: 88,
    height: 88,
    borderRadius: 44,
    justifyContent: 'center',
    alignItems: 'center',
  },
  center: {
    alignItems: 'center',
    paddingHorizontal: 8,
  },
  title: {
    fontSize: 26,
    fontFamily: 'Inter_700Bold',
    textAlign: 'center',
    marginBottom: 10,
  },
  subtitle: {
    fontSize: 14,
    fontFamily: 'Inter_400Regular',
    textAlign: 'center',
    lineHeight: 21,
    marginBottom: 8,
  },
  inputs: {
    gap: 12,
    marginTop: 8,
    marginBottom: 20,
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
  button: {
    borderRadius: 14,
    paddingVertical: 16,
    alignItems: 'center',
    width: '100%',
  },
  buttonText: {
    fontSize: 16,
    fontFamily: 'Inter_700Bold',
    color: '#FFFFFF',
  },
});
