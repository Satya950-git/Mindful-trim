import React from 'react';
import { View, Text, StyleSheet, Pressable } from 'react-native';
import * as Haptics from 'expo-haptics';
import { useTranslation } from 'react-i18next';
import { useThemeColors } from '@/context/ThemeContext';

const TAGS = [
  { key: 'Tired',    tKey: 'tagTired',    color: '#6E99C4', bg: '#6E99C420' },
  { key: 'Stressed', tKey: 'tagStressed', color: '#D4845A', bg: '#D4845A20' },
  { key: 'Hopeful',  tKey: 'tagHopeful',  color: '#6DB87A', bg: '#6DB87A20' },
  { key: 'Calm',     tKey: 'tagCalm',     color: '#5BB0A8', bg: '#5BB0A820' },
  { key: 'Anxious',  tKey: 'tagAnxious',  color: '#C96A7A', bg: '#C96A7A20' },
  { key: 'Grateful', tKey: 'tagGrateful', color: '#C9A84C', bg: '#C9A84C20' },
  { key: 'Restless', tKey: 'tagRestless', color: '#882cf5', bg: '#882cf520' },
  { key: 'Focused',  tKey: 'tagFocused',  color: '#1f69f2', bg: '#1f69f220' },
];
const MAX_SELECTIONS = 2;

interface ContextTagsProps {
  selected: string[];
  onChange: (tags: string[]) => void;
}

export default function ContextTags({ selected, onChange }: ContextTagsProps) {
  const C = useThemeColors();
  const { t } = useTranslation();

  const toggle = (key: string) => {
    if (selected.includes(key)) {
      Haptics.selectionAsync();
      onChange(selected.filter(k => k !== key));
    } else if (selected.length < MAX_SELECTIONS) {
      Haptics.selectionAsync();
      onChange([...selected, key]);
    } else {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    }
  };

  const atLimit = selected.length >= MAX_SELECTIONS;

  return (
    <View style={styles.container}>
      <Text style={[styles.label, { color: C.textPrimary }]}>{t('checkin.stateLabel')}</Text>
      <Text style={[styles.subtitle, { color: C.textSecondary }]}>{t('checkin.stateSubtitle')}</Text>
      <View style={styles.tagsRow}>
        {TAGS.map(({ key, tKey, color, bg }) => {
          const isSelected = selected.includes(key);
          const isDisabled = atLimit && !isSelected;
          return (
            <Pressable
              key={key}
              onPress={() => toggle(key)}
              style={({ pressed }) => [
                styles.tag,
                {
                  backgroundColor: isSelected ? bg : C.cardBackground,
                  borderColor: isSelected ? color : C.border,
                },
                isDisabled && { opacity: 0.35 },
                pressed && { opacity: 0.7 },
              ]}
            >
              <Text style={[styles.tagText, { color: isSelected ? color : C.textSecondary }]}>
                {t(`checkin.${tKey}`)}
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
    marginBottom: 4,
  },
  subtitle: {
    fontSize: 13,
    fontFamily: 'Inter_400Regular',
    marginBottom: 18,
  },
  tagsRow: {
    flexDirection: 'row' as const,
    flexWrap: 'wrap' as const,
    gap: 10,
  },
  tag: {
    paddingHorizontal: 18,
    paddingVertical: 11,
    borderRadius: 24,
    borderWidth: 1.5,
  },
  tagText: {
    fontSize: 14,
    fontFamily: 'Inter_600SemiBold',
  },
});
