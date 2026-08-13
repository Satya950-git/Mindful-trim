import React, { useState, useEffect } from 'react';
import {
  View, Text, TextInput, StyleSheet, Platform,
  Pressable, KeyboardAvoidingView, ScrollView, Modal, ActivityIndicator,
} from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons, MaterialIcons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { useThemeColors, ThemeColors } from '@/context/ThemeContext';
import PrimaryButton from '@/components/PrimaryButton';
import { useAuth } from '@/context/AuthContext';

export const SECURITY_QUESTIONS = [
  "What was the name of your first pet?",
  "What is your mother's maiden name?",
  "What was the name of your first school?",
  "What city were you born in?",
  "What was your childhood nickname?",
  "What is the name of the street you grew up on?",
];

export default function SetupSecurityQuestionScreen() {
  const { from } = useLocalSearchParams<{ from?: string }>();
  const { setSecurityQuestion, getMySecurityQuestion } = useAuth();
  const Colors = useThemeColors();
  const styles = makeStyles(Colors);
  const insets = useSafeAreaInsets();
  const topInset = Platform.OS === 'web' ? 67 : insets.top;
  const bottomInset = Platform.OS === 'web' ? 34 : insets.bottom;

  const fromProfile = from === 'profile';

  const [currentQuestion, setCurrentQuestion] = useState<string | null>(null);
  const [fetchingCurrent, setFetchingCurrent] = useState(fromProfile);

  const [selectedQuestion, setSelectedQuestion] = useState('');
  const [answer, setAnswer] = useState('');
  const [showAnswer, setShowAnswer] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [pickerVisible, setPickerVisible] = useState(false);

  useEffect(() => {
    if (!fromProfile) return;
    (async () => {
      const result = await getMySecurityQuestion();
      if (result.success && result.question) {
        setCurrentQuestion(result.question);
      }
      setFetchingCurrent(false);
    })();
  }, [fromProfile]);

  const canSubmit = !!selectedQuestion && answer.trim().length >= 2;

  const doSave = async () => {
    setError('');
    setLoading(true);
    const result = await setSecurityQuestion(selectedQuestion, answer.trim().toLowerCase());
    setLoading(false);
    if (!result.success) {
      setError(result.message);
      return;
    }
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    if (fromProfile) {
      router.back();
    } else {
      router.replace('/onboarding');
    }
  };

  const handleSkip = () => {
    if (fromProfile) {
      router.back();
    } else {
      router.replace('/onboarding');
    }
  };

  const isUpdating = fromProfile && !!currentQuestion;

  if (fromProfile && fetchingCurrent) {
    return (
      <KeyboardAvoidingView style={{ flex: 1, backgroundColor: Colors.background }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
          <ActivityIndicator color={Colors.accent} />
        </View>
      </KeyboardAvoidingView>
    );
  }

  // ── Set new question ───────────────────────────────────────────────────────
  const screenTitle = isUpdating ? 'Change Security Question' : 'Set a Security Question';
  const screenSubtitle = isUpdating
    ? 'Choose a new question and answer to replace your current one.'
    : 'This will be used to verify your identity if you ever forget your password.';

  return (
    <KeyboardAvoidingView
      style={{ flex: 1, backgroundColor: Colors.background }}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView
        contentContainerStyle={[styles.scroll, { paddingTop: topInset, paddingBottom: bottomInset + 24 }]}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.iconWrap}>
          <View style={[styles.iconCircle, { backgroundColor: Colors.accent + '20' }]}>
            <Ionicons name="shield-checkmark-outline" size={40} color={Colors.accent} />
          </View>
        </View>

        <Text style={[styles.title, { color: Colors.textPrimary }]}>{screenTitle}</Text>
        <Text style={[styles.subtitle, { color: Colors.textSecondary }]}>{screenSubtitle}</Text>

        <View style={styles.form}>
          <Text style={[styles.label, { color: Colors.textSecondary }]}>
            {isUpdating ? 'New Security Question' : 'Security Question'}
          </Text>
          <Pressable
            style={[styles.pickerBtn, { backgroundColor: Colors.inputBackground, borderColor: Colors.border }]}
            onPress={() => setPickerVisible(true)}
          >
            <Text
              style={[styles.pickerBtnText, { color: selectedQuestion ? Colors.textPrimary : Colors.textTertiary }]}
              numberOfLines={2}
            >
              {selectedQuestion || 'Choose a question…'}
            </Text>
            <MaterialIcons name="expand-more" size={22} color={Colors.textTertiary} />
          </Pressable>

          <Text style={[styles.label, { color: Colors.textSecondary, marginTop: 16 }]}>Your Answer</Text>
          <View style={[
            styles.inputRow,
            { backgroundColor: Colors.inputBackground, borderColor: error ? '#EF4444' : Colors.border },
          ]}>
            <Ionicons name="key-outline" size={18} color={Colors.textTertiary} />
            <TextInput
              style={[styles.input, { color: Colors.textPrimary }]}
              placeholder="Enter your answer"
              placeholderTextColor={Colors.textTertiary}
              value={answer}
              onChangeText={v => { setAnswer(v); setError(''); }}
              autoCapitalize="none"
              autoCorrect={false}
              secureTextEntry={!showAnswer}
              returnKeyType="done"
              onSubmitEditing={doSave}
            />
            <Pressable onPress={() => setShowAnswer(v => !v)} hitSlop={10}>
              <Ionicons name={showAnswer ? 'eye-off-outline' : 'eye-outline'} size={18} color={Colors.textTertiary} />
            </Pressable>
          </View>
          <Text style={[styles.hint, { color: Colors.textTertiary }]}>
            Answers are case-insensitive and stored securely.
          </Text>

          {error ? <Text style={styles.errorText}>{error}</Text> : null}

          <PrimaryButton
            title={isUpdating ? 'Update Security Question' : 'Save Security Question'}
            onPress={doSave}
            loading={loading}
            disabled={!canSubmit}
            gradientColors={Colors.accentGradient}
          />

          {fromProfile && (
            <Pressable style={styles.skipRow} onPress={handleSkip}>
              <Text style={[styles.skipText, { color: Colors.textTertiary }]}>Cancel</Text>
            </Pressable>
          )}
        </View>
      </ScrollView>

      <Modal visible={pickerVisible} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContent, { backgroundColor: Colors.cardBackground }]}>
            <View style={styles.modalHeader}>
              <Text style={[styles.modalTitle, { color: Colors.textPrimary }]}>Choose a Question</Text>
              <Pressable onPress={() => setPickerVisible(false)} hitSlop={12}>
                <MaterialIcons name="close" size={24} color={Colors.textSecondary} />
              </Pressable>
            </View>
            {SECURITY_QUESTIONS.map((q) => {
              const isSelected = selectedQuestion === q;
              return (
                <Pressable
                  key={q}
                  style={[
                    styles.questionOption,
                    { borderBottomColor: Colors.border },
                    isSelected && { backgroundColor: Colors.accent + '14' },
                  ]}
                  onPress={() => {
                    setSelectedQuestion(q);
                    setPickerVisible(false);
                    Haptics.selectionAsync();
                  }}
                >
                  <Text style={[styles.questionText, { color: isSelected ? Colors.accent : Colors.textPrimary }]}>
                    {q}
                  </Text>
                  {isSelected && <MaterialIcons name="check" size={20} color={Colors.accent} />}
                </Pressable>
              );
            })}
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
  iconWrap: {
    alignItems: 'center',
    marginBottom: 24,
    marginTop: 40,
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
  loadingWrap: {
    marginTop: 40,
    alignItems: 'center',
  },
  currentQuestionBox: {
    borderRadius: 14,
    borderWidth: 1,
    paddingHorizontal: 16,
    paddingVertical: 14,
    marginTop: 16,
    marginBottom: 4,
  },
  currentQuestionLabel: {
    fontSize: 11,
    fontFamily: 'Inter_600SemiBold',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 6,
  },
  currentQuestionText: {
    fontSize: 14,
    fontFamily: 'Inter_400Regular',
    lineHeight: 20,
  },
  form: {
    marginTop: 24,
    gap: 4,
  },
  label: {
    fontSize: 13,
    fontFamily: 'Inter_600SemiBold',
    marginBottom: 8,
  },
  pickerBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    borderRadius: 14,
    borderWidth: 1,
    paddingHorizontal: 16,
    paddingVertical: 14,
    minHeight: 54,
  },
  pickerBtnText: {
    flex: 1,
    fontSize: 15,
    fontFamily: 'Inter_400Regular',
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
  hint: {
    fontSize: 11,
    fontFamily: 'Inter_400Regular',
    marginTop: 6,
    marginBottom: 8,
  },
  errorText: {
    color: '#EF4444',
    fontSize: 13,
    fontFamily: 'Inter_400Regular',
    textAlign: 'center',
    marginBottom: 4,
  },
  skipRow: {
    alignItems: 'center',
    paddingTop: 12,
  },
  skipText: {
    fontSize: 13,
    fontFamily: 'Inter_400Regular',
    textAlign: 'center',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingTop: 20,
    paddingHorizontal: 20,
    paddingBottom: Platform.OS === 'web' ? 34 : 32,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  modalTitle: {
    fontSize: 18,
    fontFamily: 'Inter_700Bold',
  },
  questionOption: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 16,
    borderBottomWidth: 1,
    gap: 12,
  },
  questionText: {
    flex: 1,
    fontSize: 15,
    fontFamily: 'Inter_400Regular',
    lineHeight: 22,
  },
  confirmBox: {
    marginHorizontal: 28,
    borderRadius: 20,
    padding: 28,
    alignItems: 'center',
    alignSelf: 'center',
    width: '100%',
  },
  confirmIconWrap: {
    width: 64,
    height: 64,
    borderRadius: 32,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 16,
  },
  confirmTitle: {
    fontSize: 18,
    fontFamily: 'Inter_700Bold',
    textAlign: 'center',
    marginBottom: 10,
  },
  confirmBody: {
    fontSize: 14,
    fontFamily: 'Inter_400Regular',
    textAlign: 'center',
    lineHeight: 20,
    marginBottom: 24,
  },
  confirmBtn: {
    width: '100%',
    paddingVertical: 14,
    borderRadius: 14,
    alignItems: 'center',
    marginBottom: 10,
  },
  confirmBtnText: {
    color: '#fff',
    fontSize: 15,
    fontFamily: 'Inter_600SemiBold',
  },
  cancelBtn: {
    paddingVertical: 10,
    alignItems: 'center',
  },
  cancelBtnText: {
    fontSize: 14,
    fontFamily: 'Inter_400Regular',
  },
});
