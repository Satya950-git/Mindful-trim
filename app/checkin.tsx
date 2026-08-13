import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, Platform, ScrollView, Pressable, BackHandler } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { MaterialIcons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { useTranslation } from 'react-i18next';
import MoodSlider from '@/components/MoodSlider';
import ContextTags from '@/components/ContextTags';
import { useApp } from '@/context/AppContext';
import { usePillarColors, useThemeColors } from '@/context/ThemeContext';

export default function CheckInScreen() {
  const pillarColors = usePillarColors();
  const Colors = useThemeColors();
  const insets = useSafeAreaInsets();
  const topInset = Platform.OS === 'web' ? 67 : insets.top;
  const bottomInset = Platform.OS === 'web' ? 34 : insets.bottom;
  const { t } = useTranslation();
  const { pillar } = useLocalSearchParams<{ pillar: string }>();
  const { assignExercise } = useApp();
  const [mood, setMood] = useState(3);
  const [tags, setTags] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);

  const colors = pillar ? pillarColors[pillar] : pillarColors.Mental;

  useEffect(() => {
    if (Platform.OS !== 'android') return;
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      router.replace('/(main)');
      return true;
    });
    return () => sub.remove();
  }, []);

  const handleContinue = async () => {
    if (!pillar) return;
    setLoading(true);
    const exercise = await assignExercise(pillar, mood, tags);
    setLoading(false);
    if (exercise) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      router.replace({
        pathname: '/exercise',
        params: {
          pillar,
          exerciseId: exercise.exerciseId,
          exerciseName: exercise.exerciseName,
          description: exercise.description,
          duration: exercise.durationMinutes.toString(),
          xpReward: (exercise.xpReward ?? 100).toString(),
          difficulty: exercise.difficulty || 'easy',
          mood: mood.toString(),
          tags: JSON.stringify(tags),
          insight: exercise.insights || '',
          nameHi: exercise.nameHi || '',
          descriptionHi: exercise.descriptionHi || '',
          insightsHi: exercise.insightsHi || '',
        },
      });
    }
  };

  return (
    <View style={[styles.container, { backgroundColor: Colors.background, paddingTop: topInset, paddingBottom: bottomInset + 20 }]}>
      {/* Header */}
      <View style={styles.header}>
        <Pressable
          onPress={() => router.replace('/(main)')}
          style={[styles.backButton, { backgroundColor: Colors.cardBackground, borderColor: Colors.border }]}
        >
          <MaterialIcons name="close" size={22} color={Colors.textSecondary} />
        </Pressable>
        <View style={[styles.pillarBadge, { backgroundColor: colors.main + '18', borderColor: colors.main + '50' }]}>
          <View style={[styles.pillarDot, { backgroundColor: colors.main }]} />
          <Text style={[styles.pillarText, { color: colors.main }]}>{t(`pillars.${pillar?.toLowerCase() ?? 'mental'}`)}</Text>
        </View>
      </View>

      <ScrollView style={styles.scrollContent} showsVerticalScrollIndicator={false}>
        <Text style={[styles.title, { color: Colors.textPrimary }]}>{t('checkin.title')}</Text>
        <Text style={[styles.subtitle, { color: Colors.textSecondary }]}>{t('checkin.subtitle')}</Text>

        <View style={styles.section}>
          <MoodSlider value={mood} onChange={setMood} />
        </View>

        <View style={styles.section}>
          <ContextTags selected={tags} onChange={setTags} />
        </View>
      </ScrollView>

      {/* CTA */}
      <Pressable
        onPress={handleContinue}
        disabled={loading}
        style={({ pressed }) => [
          styles.ctaButton,
          { backgroundColor: colors.main, opacity: pressed || loading ? 0.75 : 1 },
        ]}
      >
        <Text style={styles.ctaText}>{loading ? t('checkin.findingExercise') : t('checkin.beginExercise')}</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    paddingHorizontal: 22,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 28,
  },
  backButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    borderWidth: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  pillarBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 20,
    borderWidth: 1.5,
  },
  pillarDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  pillarText: {
    fontSize: 13,
    fontFamily: 'Inter_700Bold',
  },
  scrollContent: {
    flex: 1,
  },
  title: {
    fontSize: 30,
    fontFamily: 'Inter_700Bold',
    marginBottom: 6,
  },
  subtitle: {
    fontSize: 15,
    fontFamily: 'Inter_400Regular',
    marginBottom: 36,
  },
  section: {
    marginBottom: 28,
  },
  ctaButton: {
    height: 56,
    borderRadius: 28,
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 8,
  },
  ctaText: {
    fontSize: 17,
    fontFamily: 'Inter_700Bold',
    color: '#fff',
  },
});
