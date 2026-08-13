import React, { useState } from 'react';
import { View, Text, TextInput, StyleSheet, Platform, Pressable, ScrollView, FlatList } from 'react-native';
import { router } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as Haptics from 'expo-haptics';
import { useTranslation } from 'react-i18next';
import PrimaryButton from '@/components/PrimaryButton';
import { useAuth } from '@/context/AuthContext';
import { useThemeColors, ThemeColors } from '@/context/ThemeContext';
import { useLanguage, LANGUAGES } from '@/context/LanguageContext';

export default function OnboardingScreen() {
  const Colors = useThemeColors();
  const styles = makeStyles(Colors);
  const insets = useSafeAreaInsets();
  const topInset = Platform.OS === 'web' ? 67 : insets.top;
  const bottomInset = Platform.OS === 'web' ? 34 : insets.bottom;
  const { completeOnboarding, user } = useAuth();
  const { language, setLanguage } = useLanguage();
  const { t } = useTranslation();
  const [step, setStep] = useState(0);
  const [selectedLang, setSelectedLang] = useState(language);
  const [identity, setIdentity] = useState('');
  const [gender, setGender] = useState('');
  const [loading, setLoading] = useState(false);

  const GENDERS = [
    { key: 'Male',              label: t('onboarding.male') },
    { key: 'Female',            label: t('onboarding.female') },
    { key: 'Non-binary',        label: t('onboarding.nonBinary') },
    { key: 'Prefer not to say', label: t('onboarding.preferNotToSay') },
  ];

  const canContinue = () => {
    if (step === 0) return true;
    if (step === 1) return identity.trim().length > 0;
    if (step === 2) return gender.length > 0;
    return false;
  };

  const handleNext = async () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    if (step === 0) {
      if (selectedLang !== language) {
        await setLanguage(selectedLang);
      }
      setStep(1);
    } else if (step === 1) {
      setStep(2);
    } else {
      setLoading(true);
      await completeOnboarding({ identity: identity.trim(), gender });
      setLoading(false);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      router.replace('/(main)');
    }
  };

  return (
    <View style={[styles.container, { paddingTop: topInset + 20, paddingBottom: bottomInset + 20 }]}>
      <View style={styles.progressBar}>
        {[0, 1, 2].map(i => (
          <View key={i} style={[styles.progressDot, i <= step && styles.progressDotActive]} />
        ))}
      </View>

      <ScrollView style={styles.scrollContent} contentContainerStyle={styles.scrollInner} showsVerticalScrollIndicator={false}>
        {step === 0 && (
          <>
            <Text style={styles.title}>{t('onboarding.langTitle')}</Text>
            <Text style={styles.subtitle}>{t('onboarding.langSubtitle')}</Text>
            <View style={styles.langList}>
              {LANGUAGES.map(lang => {
                const isSelected = selectedLang === lang.code;
                return (
                  <Pressable
                    key={lang.code}
                    onPress={() => {
                      Haptics.selectionAsync();
                      setSelectedLang(lang.code);
                    }}
                    style={[
                      styles.langCard,
                      isSelected && styles.langCardSelected,
                      { borderColor: isSelected ? Colors.accent : Colors.border },
                    ]}
                  >
                    <Text style={styles.langFlag}>{lang.flag}</Text>
                    <Text style={[styles.langName, { color: isSelected ? Colors.accent : Colors.textPrimary }]}>
                      {lang.nativeName}
                    </Text>
                    {isSelected && (
                      <View style={[styles.langCheck, { backgroundColor: Colors.accent }]} />
                    )}
                  </Pressable>
                );
              })}
            </View>
          </>
        )}

        {step === 1 && (
          <>
            <Text style={styles.title}>{t('onboarding.nameTitle')}</Text>
            <Text style={styles.subtitle}>{t('onboarding.nameSubtitle')}</Text>
            <View style={styles.inputWrapper}>
              <View style={styles.nameRow}>
                <TextInput
                  style={[styles.nameInput, { flex: 1 }]}
                  placeholder={t('onboarding.namePlaceholder')}
                  placeholderTextColor={Colors.textTertiary}
                  value={identity}
                  onChangeText={setIdentity}
                  autoFocus
                  autoCapitalize="words"
                />
                {user?.uniqueTag ? (
                  <View style={[styles.tagBadge, { backgroundColor: Colors.accent + '18', borderColor: Colors.accent + '40' }]}>
                    <Text style={[styles.tagBadgeText, { color: Colors.accent }]}>#{user.uniqueTag}</Text>
                  </View>
                ) : null}
              </View>
              {user?.uniqueTag ? (
                <Text style={[styles.tagHint, { color: Colors.textTertiary }]}>
                  Your unique ID · {identity.trim() || '...'} #{user.uniqueTag}
                </Text>
              ) : null}
            </View>
          </>
        )}

        {step === 2 && (
          <>
            <Text style={styles.title}>{t('onboarding.genderTitle')}</Text>
            <Text style={styles.subtitle}>{t('onboarding.genderSubtitle')}</Text>
            <View style={styles.optionsGrid}>
              {GENDERS.map(g => (
                <Pressable
                  key={g.key}
                  onPress={() => { Haptics.selectionAsync(); setGender(g.key); }}
                  style={[styles.optionCard, gender === g.key && styles.optionCardSelected]}
                >
                  <Text style={[styles.optionText, gender === g.key && styles.optionTextSelected]}>{g.label}</Text>
                </Pressable>
              ))}
            </View>
          </>
        )}
      </ScrollView>

      <View style={styles.footer}>
        {step > 0 && (
          <PrimaryButton
            title={t('common.back')}
            onPress={() => setStep(step - 1)}
            variant="ghost"
            color={Colors.textSecondary}
          />
        )}
        <PrimaryButton
          title={step === 2 ? t('common.getStarted') : t('common.continue')}
          onPress={handleNext}
          disabled={!canContinue()}
          loading={loading}
          gradientColors={Colors.accentGradient}
          style={{ flex: 1 }}
        />
      </View>
    </View>
  );
}

const makeStyles = (Colors: ThemeColors) => StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
    paddingHorizontal: 24,
  },
  progressBar: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 32,
  },
  progressDot: {
    flex: 1,
    height: 4,
    borderRadius: 2,
    backgroundColor: Colors.border,
  },
  progressDotActive: {
    backgroundColor: Colors.accent,
  },
  scrollContent: {
    flex: 1,
  },
  scrollInner: {
    paddingBottom: 20,
  },
  title: {
    fontSize: 28,
    fontFamily: 'Inter_700Bold',
    color: Colors.textPrimary,
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 16,
    fontFamily: 'Inter_400Regular',
    color: Colors.textSecondary,
    marginBottom: 24,
  },
  langList: {
    gap: 10,
  },
  langCard: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 14,
    paddingHorizontal: 18,
    borderRadius: 14,
    backgroundColor: Colors.inputBackground,
    borderWidth: 1.5,
    gap: 14,
  },
  langCardSelected: {
    backgroundColor: Colors.mentalLight,
  },
  langFlag: {
    fontSize: 22,
  },
  langName: {
    flex: 1,
    fontSize: 16,
    fontFamily: 'Inter_500Medium',
  },
  langCheck: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  inputWrapper: {
    marginTop: 8,
  },
  nameRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 10,
  },
  nameInput: {
    fontSize: 24,
    fontFamily: 'Inter_600SemiBold',
    color: Colors.textPrimary,
    borderBottomWidth: 2,
    borderBottomColor: Colors.accent,
    paddingBottom: 12,
    paddingTop: 8,
  },
  tagBadge: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
    borderWidth: 1,
    marginBottom: 12,
  },
  tagBadgeText: {
    fontSize: 16,
    fontFamily: 'Inter_700Bold',
    letterSpacing: 1,
  },
  tagHint: {
    fontSize: 12,
    fontFamily: 'Inter_400Regular',
    marginTop: 8,
  },
  optionsGrid: {
    gap: 12,
  },
  optionCard: {
    paddingVertical: 16,
    paddingHorizontal: 20,
    borderRadius: 14,
    backgroundColor: Colors.inputBackground,
    borderWidth: 1.5,
    borderColor: Colors.border,
  },
  optionCardSelected: {
    borderColor: Colors.accent,
    backgroundColor: Colors.mentalLight,
  },
  optionText: {
    fontSize: 16,
    fontFamily: 'Inter_500Medium',
    color: Colors.textPrimary,
  },
  optionTextSelected: {
    color: Colors.accent,
    fontFamily: 'Inter_600SemiBold',
  },
  footer: {
    flexDirection: 'row',
    gap: 12,
    paddingTop: 12,
  },
});
