import React from 'react';
import { View, Text, StyleSheet, Pressable } from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { useTranslation } from 'react-i18next';
import { useThemeColors } from '@/context/ThemeContext';

interface MoodSliderProps {
  value: number;
  onChange: (value: number) => void;
}

const MOOD_ICONS = [
  'sentiment-very-dissatisfied',
  'sentiment-dissatisfied',
  'sentiment-neutral',
  'sentiment-satisfied',
  'sentiment-very-satisfied',
] as const;

const MOOD_KEYS = ['mood1', 'mood2', 'mood3', 'mood4', 'mood5'] as const;

export default function MoodSlider({ value, onChange }: MoodSliderProps) {
  const C = useThemeColors();
  const { t } = useTranslation();

  const selectedColor = '#5EB8A0';
  const selectedBg = '#5EB8A018';

  return (
    <View style={styles.container}>
      <Text style={[styles.label, { color: C.textPrimary }]}>{t('checkin.moodLabel')}</Text>
      <View style={styles.moodRow}>
        {MOOD_ICONS.map((icon, i) => {
          const moodValue = i + 1;
          const isSelected = value === moodValue;
          return (
            <Pressable
              key={moodValue}
              onPress={() => {
                Haptics.selectionAsync();
                onChange(moodValue);
              }}
              style={({ pressed }) => [
                styles.moodItem,
                { backgroundColor: isSelected ? selectedBg : C.cardBackground, borderColor: isSelected ? selectedColor + '60' : C.border },
                { opacity: pressed ? 0.7 : 1 },
              ]}
            >
              <MaterialIcons
                name={icon}
                size={30}
                color={isSelected ? selectedColor : C.textSecondary}
              />
              <Text style={[styles.moodLabel, { color: isSelected ? selectedColor : C.textSecondary }]}>
                {t(`checkin.${MOOD_KEYS[i]}`)}
              </Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    marginVertical: 8,
  },
  label: {
    fontSize: 18,
    fontFamily: 'Inter_700Bold',
    marginBottom: 16,
  },
  moodRow: {
    flexDirection: 'row' as const,
    justifyContent: 'space-between' as const,
    gap: 6,
  },
  moodItem: {
    alignItems: 'center' as const,
    paddingVertical: 12,
    paddingHorizontal: 6,
    borderRadius: 16,
    flex: 1,
    borderWidth: 1,
  },
  moodLabel: {
    fontSize: 11,
    fontFamily: 'Inter_500Medium',
    marginTop: 5,
  },
});
