import React, { useState, useMemo } from 'react';
import {
  View, Text, TextInput, StyleSheet, Platform,
  Pressable, Image, KeyboardAvoidingView, ScrollView, Modal, FlatList, Alert,
} from 'react-native';
import { router } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons, MaterialIcons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { useTranslation } from 'react-i18next';
import AsyncStorage from '@react-native-async-storage/async-storage';
import PrimaryButton from '@/components/PrimaryButton';
import { useAuth } from '@/context/AuthContext';
import { useThemeColors, ThemeColors } from '@/context/ThemeContext';
import { apiRequest } from '@/lib/query-client';

const SECURITY_QUESTIONS = [
  "What was the name of your first pet?",
  "What is your mother's maiden name?",
  "What was the name of your first school?",
  "What city were you born in?",
  "What was your childhood nickname?",
  "What is the name of the street you grew up on?",
];

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
  { code: '+55', name: 'Brazil', flag: '🇧🇷' },
  { code: '+52', name: 'Mexico', flag: '🇲🇽' },
  { code: '+27', name: 'South Africa', flag: '🇿🇦' },
  { code: '+234', name: 'Nigeria', flag: '🇳🇬' },
  { code: '+62', name: 'Indonesia', flag: '🇮🇩' },
  { code: '+63', name: 'Philippines', flag: '🇵🇭' },
  { code: '+66', name: 'Thailand', flag: '🇹🇭' },
  { code: '+84', name: 'Vietnam', flag: '🇻🇳' },
];

type PasswordRule = { labelKey: string; met: boolean };

function getPasswordRules(password: string): PasswordRule[] {
  return [
    { labelKey: 'register.rule8Chars', met: password.length >= 8 },
    { labelKey: 'register.ruleLetter', met: /[a-zA-Z]/.test(password) },
    { labelKey: 'register.ruleNumber', met: /\d/.test(password) },
  ];
}

function getStrengthColor(rules: PasswordRule[]): string {
  const met = rules.filter(r => r.met).length;
  if (met === 0) return '#E5E7EB';
  if (met === 1) return '#EF4444';
  if (met === 2) return '#F59E0B';
  return '#22C55E';
}

export default function RegisterScreen() {
  const Colors = useThemeColors();
  const styles = makeStyles(Colors);
  const insets = useSafeAreaInsets();
  const topInset = Platform.OS === 'web' ? 67 : insets.top;
  const bottomInset = Platform.OS === 'web' ? 34 : insets.bottom;
  const { t } = useTranslation();
  const { register, setSecurityQuestion } = useAuth();

  const [email, setEmail] = useState('');
  const [emailError, setEmailError] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [confirmError, setConfirmError] = useState('');
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [passwordTouched, setPasswordTouched] = useState(false);

  const [step, setStep] = useState<1 | 2>(1);

  const [countryCode, setCountryCode] = useState('+91');
  const [phoneNumber, setPhoneNumber] = useState('');
  const [whatsappOptIn, setWhatsappOptIn] = useState(false);
  const [phoneError, setPhoneError] = useState('');
  const [countryPickerVisible, setCountryPickerVisible] = useState(false);
  const [countrySearch, setCountrySearch] = useState('');

  const [securityQuestion, setSecurityQuestion_] = useState('');
  const [securityAnswer, setSecurityAnswer] = useState('');
  const [securityAnswerError, setSecurityAnswerError] = useState('');
  const [showSecurityAnswer, setShowSecurityAnswer] = useState(false);
  const [questionPickerVisible, setQuestionPickerVisible] = useState(false);

  const filteredCountries = useMemo(() => {
    if (!countrySearch.trim()) return COUNTRY_CODES;
    const q = countrySearch.toLowerCase();
    return COUNTRY_CODES.filter(c => c.name.toLowerCase().includes(q) || c.code.includes(q));
  }, [countrySearch]);

  const selectedCountry = COUNTRY_CODES.find(c => c.code === countryCode) ?? COUNTRY_CODES[0];

  const handlePhoneChange = (v: string) => {
    const digits = v.replace(/\D/g, '');
    setPhoneNumber(digits);
    if (digits && !whatsappOptIn) setWhatsappOptIn(true);
    if (!digits) setWhatsappOptIn(false);
    if (digits.length > 0 && digits.length !== 10) {
      setPhoneError(t('register.phoneTenDigits'));
    } else {
      setPhoneError('');
    }
  };

  const passwordRules = getPasswordRules(password);
  const strengthColor = getStrengthColor(passwordRules);
  const metCount = passwordRules.filter(r => r.met).length;
  const passwordValid = passwordRules.every(r => r.met);

  const handleConfirmChange = (v: string) => {
    setConfirmPassword(v);
    if (v && v !== password) {
      setConfirmError(t('register.passwordsMustMatch'));
    } else {
      setConfirmError('');
    }
  };

  const handleContinue = () => {
    if (!email.trim() || !passwordValid || !confirmPassword.trim() || confirmError || phoneError) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setStep(2);
  };

  const handleRegister = async () => {
    if (!securityQuestion) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      return;
    }
    if (securityAnswer.trim().length < 2) {
      setSecurityAnswerError(t('register.securityAnswerTooShort'));
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      return;
    }
    setLoading(true);
    const result = await register(
      email.trim().toLowerCase(),
      password,
      phoneNumber.trim()
        ? { countryCode, phoneNumber, whatsappOptIn }
        : undefined
    );
    if (!result.success) {
      setLoading(false);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      if (result.code === 'PHONE_IN_USE') {
        setPhoneError(t('register.phoneDuplicate'));
        setStep(1);
      } else {
        setEmailError(t('register.emailInUse'));
        setStep(1);
      }
      return;
    }
    await setSecurityQuestion(securityQuestion, securityAnswer.trim().toLowerCase());

    try {
      const stored = await AsyncStorage.getItem('pending_referral');
      if (stored) {
        const ref = JSON.parse(stored);
        if (ref?.refUserId) {
          await apiRequest('POST', '/api/friends/request', { toUserId: ref.refUserId });
          await AsyncStorage.removeItem('pending_referral');
          Alert.alert('Connected! 🎉', `You\'re now connected with ${ref.refName || 'a friend'}!`);
        }
      }
    } catch { /* silent */ }

    setLoading(false);
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    router.replace('/onboarding');
  };

  const canContinue =
    !!email.trim() && passwordValid && !!confirmPassword.trim() && !confirmError && !phoneError;

  const canSubmit =
    !!securityQuestion && securityAnswer.trim().length >= 2;

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
        <Pressable
          style={styles.backButton}
          onPress={() => step === 2 ? setStep(1) : (router.canGoBack() ? router.back() : router.replace('/welcome'))}
        >
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

        {/* Step indicator */}
        <View style={styles.stepIndicator}>
          <View style={[styles.stepDot, { backgroundColor: Colors.accent }]} />
          <View style={[styles.stepLine, { backgroundColor: step === 2 ? Colors.accent : Colors.border }]} />
          <View style={[styles.stepDot, { backgroundColor: step === 2 ? Colors.accent : Colors.border }]} />
        </View>
        <Text style={[styles.stepLabel, { color: Colors.textTertiary }]}>
          {step === 1 ? 'Step 1 of 2 — Account Details' : 'Step 2 of 2 — Security Question'}
        </Text>

        {/* ── STEP 1 ── */}
        {step === 1 && (
          <View style={styles.formSection}>
            <Text style={styles.heading}>{t('register.title')}</Text>
            <Text style={styles.subheading}>{t('register.subtitle')}</Text>

            <View style={styles.inputs}>
              {/* Email */}
              <View>
                <View style={[
                  styles.inputRow,
                  { backgroundColor: Colors.inputBackground, borderColor: emailError ? '#EF4444' : Colors.border },
                ]}>
                  <Ionicons
                    name={emailError ? 'alert-circle-outline' : 'mail-outline'}
                    size={18}
                    color={emailError ? '#EF4444' : Colors.textTertiary}
                  />
                  <TextInput
                    style={[styles.input, { color: Colors.textPrimary }]}
                    placeholder={t('common.emailAddress')}
                    placeholderTextColor={Colors.textTertiary}
                    value={email}
                    onChangeText={v => { setEmail(v); setEmailError(''); }}
                    keyboardType="email-address"
                    autoCapitalize="none"
                    autoCorrect={false}
                  />
                </View>
                {emailError ? <Text style={styles.errorText}>{emailError}</Text> : null}
              </View>

              {/* Password */}
              <View>
                <View style={[
                  styles.inputRow,
                  { backgroundColor: Colors.inputBackground, borderColor: Colors.border },
                ]}>
                  <Ionicons name="lock-closed-outline" size={18} color={Colors.textTertiary} />
                  <TextInput
                    style={[styles.input, { color: Colors.textPrimary, flex: 1 }]}
                    placeholder={t('common.password')}
                    placeholderTextColor={Colors.textTertiary}
                    value={password}
                    onChangeText={v => { setPassword(v); setPasswordTouched(true); }}
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
                {passwordTouched && password.length > 0 && (
                  <View style={styles.strengthSection}>
                    <View style={styles.strengthBarRow}>
                      {[0, 1, 2].map(i => (
                        <View
                          key={i}
                          style={[styles.strengthSegment, { backgroundColor: i < metCount ? strengthColor : Colors.border }]}
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

              {/* Confirm Password */}
              <View>
                <View style={[
                  styles.inputRow,
                  { backgroundColor: Colors.inputBackground, borderColor: confirmError ? '#EF4444' : Colors.border },
                ]}>
                  <Ionicons
                    name={confirmError ? 'alert-circle-outline' : 'checkmark-circle-outline'}
                    size={18}
                    color={confirmError ? '#EF4444' : Colors.textTertiary}
                  />
                  <TextInput
                    style={[styles.input, { color: Colors.textPrimary }]}
                    placeholder={t('common.confirmPassword')}
                    placeholderTextColor={Colors.textTertiary}
                    value={confirmPassword}
                    onChangeText={handleConfirmChange}
                    secureTextEntry={!showPassword}
                  />
                </View>
                {confirmError ? <Text style={styles.errorText}>{confirmError}</Text> : null}
              </View>

              {/* WhatsApp (optional) */}
              <View style={[styles.whatsappSection, { backgroundColor: Colors.cardBackground, borderColor: Colors.border }]}>
                <View style={styles.whatsappHeader}>
                  <Ionicons name="logo-whatsapp" size={18} color="#25D366" />
                  <Text style={[styles.whatsappLabel, { color: Colors.textPrimary }]}>{t('register.whatsappNumber')}</Text>
                  <Text style={[styles.whatsappOptional, { color: Colors.textTertiary }]}>{t('register.optional')}</Text>
                </View>
                <View style={styles.phoneRow}>
                  <Pressable
                    style={[styles.countryButton, { backgroundColor: Colors.inputBackground, borderColor: Colors.border }]}
                    onPress={() => { setCountrySearch(''); setCountryPickerVisible(true); }}
                  >
                    <Text style={styles.countryFlag}>{selectedCountry.flag}</Text>
                    <Text style={[styles.countryCodeText, { color: Colors.textPrimary }]}>{countryCode}</Text>
                    <Ionicons name="chevron-down" size={14} color={Colors.textTertiary} />
                  </Pressable>
                  <View style={[styles.phoneInput, { backgroundColor: Colors.inputBackground, borderColor: Colors.border }]}>
                    <TextInput
                      style={[styles.input, { color: Colors.textPrimary }]}
                      placeholder={t('register.enterPhonePlaceholder')}
                      placeholderTextColor={Colors.textTertiary}
                      value={phoneNumber}
                      onChangeText={handlePhoneChange}
                      keyboardType="phone-pad"
                      maxLength={10}
                    />
                  </View>
                </View>
                <Pressable
                  style={styles.consentRow}
                  onPress={() => setWhatsappOptIn(v => !v)}
                  disabled={!phoneNumber}
                >
                  <View style={[
                    styles.checkbox,
                    {
                      borderColor: whatsappOptIn ? '#25D366' : Colors.border,
                      backgroundColor: whatsappOptIn ? '#25D366' : Colors.inputBackground,
                    },
                  ]}>
                    {whatsappOptIn && <Ionicons name="checkmark" size={12} color="#FFFFFF" />}
                  </View>
                  <Text style={[styles.consentText, { color: !phoneNumber ? Colors.textTertiary : Colors.textSecondary }]}>
                    {t('register.whatsappConsent')}
                  </Text>
                </Pressable>
                {!!phoneError && <Text style={styles.errorText}>{phoneError}</Text>}
              </View>
            </View>

            <PrimaryButton
              title="Continue"
              onPress={handleContinue}
              disabled={!canContinue}
              gradientColors={Colors.accentGradient}
            />
          </View>
        )}

        {/* ── STEP 2 ── */}
        {step === 2 && (
          <View style={styles.formSection}>
            <Text style={styles.heading}>Security Question</Text>
            <Text style={styles.subheading}>
              This will be used to verify your identity if you forget your password.
            </Text>

            <View style={styles.inputs}>
              {/* Question picker */}
              <View>
                <Text style={[styles.fieldLabel, { color: Colors.textSecondary }]}>Choose a question</Text>
                <Pressable
                  style={[
                    styles.questionPickerBtn,
                    {
                      backgroundColor: Colors.inputBackground,
                      borderColor: securityQuestion ? Colors.accent + '60' : Colors.border,
                    },
                  ]}
                  onPress={() => { Haptics.selectionAsync(); setQuestionPickerVisible(true); }}
                >
                  <Text
                    style={[
                      styles.questionPickerText,
                      { color: securityQuestion ? Colors.textPrimary : Colors.textTertiary },
                    ]}
                    numberOfLines={2}
                  >
                    {securityQuestion || 'Choose a security question…'}
                  </Text>
                  <Ionicons name="chevron-down" size={18} color={Colors.textTertiary} />
                </Pressable>
              </View>

              {/* Answer */}
              <View>
                <Text style={[styles.fieldLabel, { color: Colors.textSecondary }]}>Your answer</Text>
                <View style={[
                  styles.inputRow,
                  {
                    backgroundColor: Colors.inputBackground,
                    borderColor: securityAnswerError ? '#EF4444' : Colors.border,
                  },
                ]}>
                  <Ionicons name="key-outline" size={18} color={Colors.textTertiary} />
                  <TextInput
                    style={[styles.input, { color: Colors.textPrimary }]}
                    placeholder="Enter your answer"
                    placeholderTextColor={Colors.textTertiary}
                    value={securityAnswer}
                    onChangeText={v => { setSecurityAnswer(v); setSecurityAnswerError(''); }}
                    autoCapitalize="none"
                    autoCorrect={false}
                    secureTextEntry={!showSecurityAnswer}
                  />
                  <Pressable onPress={() => setShowSecurityAnswer(v => !v)} hitSlop={10}>
                    <Ionicons
                      name={showSecurityAnswer ? 'eye-off-outline' : 'eye-outline'}
                      size={18}
                      color={Colors.textTertiary}
                    />
                  </Pressable>
                </View>
                <Text style={[styles.fieldHint, { color: Colors.textTertiary }]}>
                  Answers are case-insensitive and stored securely.
                </Text>
                {securityAnswerError ? <Text style={styles.errorText}>{securityAnswerError}</Text> : null}
              </View>
            </View>

            <PrimaryButton
              title={t('register.createBtn')}
              onPress={handleRegister}
              loading={loading}
              disabled={!canSubmit}
              gradientColors={Colors.accentGradient}
            />
          </View>
        )}

        {/* Footer — only on step 1 */}
        {step === 1 && (
          <View style={styles.footer}>
            <Text style={[styles.footerText, { color: Colors.textSecondary }]}>
              {t('register.haveAccount')}
            </Text>
            <Pressable onPress={() => router.replace('/login')}>
              <Text style={[styles.footerLink, { color: Colors.accent }]}>{t('common.signIn')}</Text>
            </Pressable>
          </View>
        )}
      </ScrollView>

      {/* Country Picker Modal */}
      <Modal visible={countryPickerVisible} animationType="slide" transparent>
        <View style={styles.pickerOverlay}>
          <View style={[styles.pickerContent, { backgroundColor: Colors.cardBackground }]}>
            <View style={styles.pickerHeader}>
              <Text style={[styles.pickerTitle, { color: Colors.textPrimary }]}>Select Country</Text>
              <Pressable onPress={() => setCountryPickerVisible(false)} hitSlop={12}>
                <Ionicons name="close" size={24} color={Colors.textSecondary} />
              </Pressable>
            </View>
            <View style={[styles.searchRow, { backgroundColor: Colors.inputBackground, borderColor: Colors.border }]}>
              <Ionicons name="search-outline" size={16} color={Colors.textTertiary} />
              <TextInput
                style={[styles.searchInput, { color: Colors.textPrimary }]}
                placeholder="Search country..."
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
                  onPress={() => { setCountryCode(item.code); setCountryPickerVisible(false); Haptics.selectionAsync(); }}
                >
                  <Text style={styles.countryOptionFlag}>{item.flag}</Text>
                  <Text style={[styles.countryOptionName, { color: Colors.textPrimary }]}>{item.name}</Text>
                  <Text style={[styles.countryOptionCode, { color: Colors.textSecondary }]}>{item.code}</Text>
                  {item.code === countryCode && <Ionicons name="checkmark" size={18} color={Colors.accent} />}
                </Pressable>
              )}
              style={{ maxHeight: 360 }}
              keyboardShouldPersistTaps="handled"
            />
          </View>
        </View>
      </Modal>

      {/* Security Question Picker Modal */}
      <Modal visible={questionPickerVisible} animationType="slide" transparent>
        <View style={styles.pickerOverlay}>
          <View style={[styles.pickerContent, { backgroundColor: Colors.cardBackground }]}>
            <View style={styles.pickerHeader}>
              <Text style={[styles.pickerTitle, { color: Colors.textPrimary }]}>Choose a Question</Text>
              <Pressable onPress={() => setQuestionPickerVisible(false)} hitSlop={12}>
                <Ionicons name="close" size={24} color={Colors.textSecondary} />
              </Pressable>
            </View>
            {SECURITY_QUESTIONS.map(q => (
              <Pressable
                key={q}
                style={[
                  styles.questionOption,
                  { borderBottomColor: Colors.border },
                  securityQuestion === q && { backgroundColor: Colors.accent + '12' },
                ]}
                onPress={() => {
                  setSecurityQuestion_(q);
                  setQuestionPickerVisible(false);
                  Haptics.selectionAsync();
                }}
              >
                <Text style={[
                  styles.questionOptionText,
                  { color: securityQuestion === q ? Colors.accent : Colors.textPrimary },
                ]}>
                  {q}
                </Text>
                {securityQuestion === q && (
                  <Ionicons name="checkmark" size={20} color={Colors.accent} />
                )}
              </Pressable>
            ))}
          </View>
        </View>
      </Modal>

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
    marginBottom: 32,
  },
  logoWrap: {
    width: 80,
    height: 80,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 4,
  },
  logo: { width: 80, height: 80 },
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
  inputs: { gap: 12 },
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
  rulesGrid: { gap: 4 },
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
    fontSize: 12,
    fontFamily: 'Inter_400Regular',
    color: '#EF4444',
    marginTop: 5,
    marginLeft: 4,
  },
  stepIndicator: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 0,
    marginBottom: 6,
    marginTop: 8,
  },
  stepDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },
  stepLine: {
    width: 48,
    height: 2,
    borderRadius: 1,
    marginHorizontal: 6,
  },
  stepLabel: {
    fontSize: 12,
    fontFamily: 'Inter_500Medium',
    textAlign: 'center',
    marginBottom: 20,
  },
  fieldLabel: {
    fontSize: 13,
    fontFamily: 'Inter_600SemiBold',
    marginBottom: 8,
  },
  fieldHint: {
    fontSize: 11,
    fontFamily: 'Inter_400Regular',
    marginTop: 6,
    marginBottom: 4,
  },
  questionPickerBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    borderRadius: 14,
    borderWidth: 1,
    paddingHorizontal: 16,
    paddingVertical: 14,
    minHeight: 54,
  },
  questionPickerText: {
    flex: 1,
    fontSize: 15,
    fontFamily: 'Inter_400Regular',
    lineHeight: 21,
  },
  questionOption: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 14,
    paddingHorizontal: 4,
    borderBottomWidth: 1,
  },
  questionOptionText: {
    flex: 1,
    fontSize: 15,
    fontFamily: 'Inter_400Regular',
    lineHeight: 22,
  },
  whatsappSection: {
    borderRadius: 14,
    borderWidth: 1,
    padding: 14,
    gap: 10,
  },
  whatsappHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  whatsappLabel: {
    fontSize: 14,
    fontFamily: 'Inter_600SemiBold',
    flex: 1,
  },
  whatsappOptional: {
    fontSize: 11,
    fontFamily: 'Inter_400Regular',
  },
  phoneRow: {
    flexDirection: 'row',
    gap: 8,
  },
  countryButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    borderRadius: 12,
    borderWidth: 1,
    paddingHorizontal: 10,
    height: 48,
  },
  countryFlag: { fontSize: 18 },
  countryCodeText: { fontSize: 14, fontFamily: 'Inter_600SemiBold' },
  phoneInput: {
    flex: 1,
    borderRadius: 12,
    borderWidth: 1,
    paddingHorizontal: 14,
    height: 48,
    justifyContent: 'center',
  },
  consentRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  checkbox: {
    width: 20,
    height: 20,
    borderRadius: 5,
    borderWidth: 1.5,
    justifyContent: 'center',
    alignItems: 'center',
  },
  consentText: {
    fontSize: 12,
    fontFamily: 'Inter_400Regular',
    flex: 1,
  },
  searchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    borderRadius: 12,
    borderWidth: 1,
    paddingHorizontal: 12,
    height: 44,
    marginBottom: 12,
  },
  searchInput: {
    flex: 1,
    fontSize: 15,
    fontFamily: 'Inter_400Regular',
  },
  countryOption: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 12,
    borderBottomWidth: 1,
  },
  countryOptionFlag: { fontSize: 22 },
  countryOptionName: {
    flex: 1,
    fontSize: 15,
    fontFamily: 'Inter_500Medium',
  },
  countryOptionCode: {
    fontSize: 14,
    fontFamily: 'Inter_400Regular',
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
  pickerOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'flex-end',
  },
  pickerContent: {
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingTop: 20,
    paddingHorizontal: 20,
    paddingBottom: Platform.OS === 'web' ? 34 : 32,
  },
  pickerHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  pickerTitle: {
    fontSize: 20,
    fontFamily: 'Inter_700Bold',
  },
});
