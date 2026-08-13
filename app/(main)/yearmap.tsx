import React, { useMemo, useCallback } from 'react';
import {
  View, Text, StyleSheet, ScrollView, Platform, BackHandler,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { MaterialIcons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { useApp } from '@/context/AppContext';
import { useThemeColors } from '@/context/ThemeContext';
import { useFocusEffect, router } from 'expo-router';

const PILLAR_COLORS: Record<string, string> = {
  Mental:    '#1f69f2',
  Physical:  '#23de64',
  Social:    '#db3f2c',
  Spiritual: '#882cf5',
};

const DAY_KEYS = ['days.sun', 'days.mon', 'days.tue', 'days.wed', 'days.thu', 'days.fri', 'days.sat'] as const;
const MONTH_KEYS = ['months.jan', 'months.feb', 'months.mar', 'months.apr', 'months.may', 'months.jun', 'months.jul', 'months.aug', 'months.sep', 'months.oct', 'months.nov', 'months.dec'] as const;

function toDateStr(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function buildLast15Days() {
  const days: { dateStr: string; dayIndex: number; dayNum: number; monthIndex: number; isToday: boolean }[] = [];
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  for (let i = 14; i >= 0; i--) {
    const d = new Date(today);
    d.setDate(today.getDate() - i);
    days.push({
      dateStr: toDateStr(d),
      dayIndex: d.getDay(),
      dayNum: d.getDate(),
      monthIndex: d.getMonth(),
      isToday: i === 0,
    });
  }
  return days;
}

function calcStreak(logDates: Set<string>): number {
  let streak = 0;
  const d = new Date();
  if (!logDates.has(toDateStr(d))) d.setDate(d.getDate() - 1);
  while (logDates.has(toDateStr(d))) {
    streak++;
    d.setDate(d.getDate() - 1);
  }
  return streak;
}

export default function YearMapScreen() {
  const Colors = useThemeColors();
  const insets = useSafeAreaInsets();
  const topInset = Platform.OS === 'web' ? 67 : insets.top;
  const bottomInset = Platform.OS === 'web' ? 34 : insets.bottom;
  const { t } = useTranslation();
  const { dailyLogs, progression } = useApp();

  const last15Days = useMemo(() => buildLast15Days(), []);

  const logMap = useMemo(() => {
    const m: Record<string, string> = {};
    dailyLogs.forEach(l => { m[l.date] = l.pillar; });
    return m;
  }, [dailyLogs]);

  const logDates = useMemo(() => new Set(Object.keys(logMap)), [logMap]);
  const streak = useMemo(() => calcStreak(logDates), [logDates]);

  const thisMonthCount = useMemo(() => {
    const now = new Date();
    const prefix = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
    return dailyLogs.filter(l => l.date.startsWith(prefix)).length;
  }, [dailyLogs]);

  useFocusEffect(
    useCallback(() => {
      if (Platform.OS !== 'android') return;
      const sub = BackHandler.addEventListener('hardwareBackPress', () => {
        router.navigate('/(main)');
        return true;
      });
      return () => sub.remove();
    }, [])
  );

  const pillarCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    dailyLogs.forEach(l => { counts[l.pillar] = (counts[l.pillar] || 0) + 1; });
    return counts;
  }, [dailyLogs]);

  const last15Completed = useMemo(
    () => last15Days.filter(d => logMap[d.dateStr]).length,
    [last15Days, logMap],
  );

  const totalCheckins = dailyLogs.length;
  const S = makeStyles(Colors);

  const rows: typeof last15Days[] = [
    last15Days.slice(0, 5),
    last15Days.slice(5, 10),
    last15Days.slice(10, 15),
  ];

  return (
    <ScrollView
      style={[S.screen, { backgroundColor: Colors.background }]}
      contentContainerStyle={{ paddingTop: topInset + 16, paddingBottom: bottomInset + 100 }}
      showsVerticalScrollIndicator={false}
    >
      {/* ── Header ── */}
      <View style={S.titleRow}>
        <Text style={S.title}>{t('yearmap.title')}</Text>
        <View style={[S.levelPill, { backgroundColor: Colors.accent + '18' }]}>
          <MaterialIcons name="bolt" size={14} color={Colors.accent} />
          <Text style={[S.levelPillText, { color: Colors.accent }]}>{t('yearmap.level', { level: progression.currentLevel })}</Text>
        </View>
      </View>

      {/* ── Stats row ── */}
      <View style={[S.statsCard, { backgroundColor: Colors.cardBackground, borderColor: Colors.border }]}>
        <View style={S.statItem}>
          <Text style={[S.statValue, { color: Colors.textPrimary }]}>{totalCheckins}</Text>
          <Text style={[S.statLabel, { color: Colors.textTertiary }]}>{t('yearmap.total')}</Text>
        </View>
        <View style={[S.statDivider, { backgroundColor: Colors.border }]} />
        <View style={S.statItem}>
          <Text style={[S.statValue, { color: Colors.textPrimary }]}>{streak}</Text>
          <Text style={[S.statLabel, { color: Colors.textTertiary }]}>{t('yearmap.streak')}</Text>
        </View>
        <View style={[S.statDivider, { backgroundColor: Colors.border }]} />
        <View style={S.statItem}>
          <Text style={[S.statValue, { color: Colors.textPrimary }]}>{thisMonthCount}</Text>
          <Text style={[S.statLabel, { color: Colors.textTertiary }]}>{t('yearmap.thisMonth')}</Text>
        </View>
        <View style={[S.statDivider, { backgroundColor: Colors.border }]} />
        <View style={S.statItem}>
          <Text style={[S.statValue, { color: Colors.textPrimary }]}>{progression.totalXp.toLocaleString()}</Text>
          <Text style={[S.statLabel, { color: Colors.textTertiary }]}>XP</Text>
        </View>
      </View>

      {/* ── 15-Day Report ── */}
      <View style={[S.reportCard, { backgroundColor: Colors.cardBackground, borderColor: Colors.border }]}>
        <View style={S.reportHeader}>
          <Text style={[S.reportTitle, { color: Colors.textPrimary }]}>{t('yearmap.last15Days')}</Text>
          <View style={[S.reportBadge, { backgroundColor: Colors.accent + '18' }]}>
            <Text style={[S.reportBadgeText, { color: Colors.accent }]}>{last15Completed} / 15</Text>
          </View>
        </View>

        {rows.map((row, ri) => (
          <View key={ri} style={S.dayRow}>
            {row.map(day => {
              const pillar = logMap[day.dateStr];
              const completed = !!pillar;
              const color = completed ? PILLAR_COLORS[pillar] : null;
              return (
                <View
                  key={day.dateStr}
                  style={[
                    S.dayCell,
                    {
                      backgroundColor: completed ? color! + '22' : Colors.inputBackground,
                      borderColor: day.isToday ? Colors.accent : completed ? color! + '66' : Colors.border,
                      borderWidth: day.isToday ? 1.5 : 1,
                    },
                  ]}
                >
                  <Text style={[S.dayCellName, { color: day.isToday ? Colors.accent : Colors.textTertiary }]}>
                    {t(DAY_KEYS[day.dayIndex])}
                  </Text>
                  <Text style={[
                    S.dayCellNum,
                    { color: completed ? color! : day.isToday ? Colors.accent : Colors.textSecondary },
                  ]}>
                    {day.dayNum}
                  </Text>
                  <Text style={[S.dayCellMonth, { color: Colors.textTertiary }]}>
                    {t(MONTH_KEYS[day.monthIndex])}
                  </Text>
                  {completed && (
                    <View style={[S.dayCellDot, { backgroundColor: color! }]} />
                  )}
                </View>
              );
            })}
          </View>
        ))}

        {/* Pillar legend */}
        <View style={S.legend}>
          {Object.entries(PILLAR_COLORS).map(([pillar, color]) => (
            <View key={pillar} style={S.legendItem}>
              <View style={[S.legendDot, { backgroundColor: color }]} />
              <Text style={[S.legendText, { color: Colors.textSecondary }]}>{t(`pillars.${pillar.toLowerCase()}`)}</Text>
            </View>
          ))}
        </View>
      </View>

      {/* ── Pillar breakdown ── */}
      {totalCheckins > 0 && (
        <View style={[S.breakdownCard, { backgroundColor: Colors.cardBackground, borderColor: Colors.border }]}>
          <Text style={[S.breakdownTitle, { color: Colors.textSecondary }]}>{t('yearmap.pillarBreakdown')}</Text>
          {Object.entries(PILLAR_COLORS).map(([pillar, color]) => {
            const count = pillarCounts[pillar] || 0;
            const pct = totalCheckins > 0 ? count / totalCheckins : 0;
            return (
              <View key={pillar} style={S.breakdownRow}>
                <View style={[S.breakdownDot, { backgroundColor: color }]} />
                <Text style={[S.breakdownPillar, { color: Colors.textPrimary }]}>{t(`pillars.${pillar.toLowerCase()}`)}</Text>
                <View style={S.breakdownBarWrap}>
                  <View style={[S.breakdownTrack, { backgroundColor: Colors.border }]}>
                    <View style={[S.breakdownFill, { width: `${pct * 100}%` as `${number}%`, backgroundColor: color + 'CC' }]} />
                  </View>
                </View>
                <Text style={[S.breakdownCount, { color: Colors.textTertiary }]}>{count}</Text>
              </View>
            );
          })}
        </View>
      )}

      {totalCheckins === 0 && (
        <View style={[S.emptyCard, { backgroundColor: Colors.cardBackground, borderColor: Colors.border }]}>
          <MaterialIcons name="calendar-today" size={32} color={Colors.textTertiary} />
          <Text style={[S.emptyTitle, { color: Colors.textPrimary }]}>{t('yearmap.emptyTitle')}</Text>
          <Text style={[S.emptyDesc, { color: Colors.textSecondary }]}>{t('yearmap.emptyDesc')}</Text>
        </View>
      )}
    </ScrollView>
  );
}

const makeStyles = (Colors: ReturnType<typeof useThemeColors>) => StyleSheet.create({
  screen: { flex: 1 },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 14,
    paddingHorizontal: 20,
  },
  title: {
    fontSize: 28,
    fontFamily: 'Inter_700Bold',
    color: Colors.textPrimary,
  },
  levelPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderRadius: 12,
  },
  levelPillText: {
    fontSize: 13,
    fontFamily: 'Inter_700Bold',
  },

  statsCard: {
    marginHorizontal: 20,
    marginBottom: 14,
    borderRadius: 18,
    borderWidth: 1,
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 14,
  },
  statItem: {
    flex: 1,
    alignItems: 'center',
    gap: 2,
  },
  statValue: {
    fontSize: 20,
    fontFamily: 'Inter_700Bold',
  },
  statLabel: {
    fontSize: 10,
    fontFamily: 'Inter_500Medium',
  },
  statDivider: {
    width: 1,
    height: 28,
  },

  reportCard: {
    marginHorizontal: 20,
    marginBottom: 14,
    borderRadius: 18,
    borderWidth: 1,
    padding: 16,
    gap: 10,
  },
  reportHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 4,
  },
  reportTitle: {
    fontSize: 16,
    fontFamily: 'Inter_700Bold',
  },
  reportBadge: {
    paddingHorizontal: 10,
    paddingVertical: 3,
    borderRadius: 10,
  },
  reportBadgeText: {
    fontSize: 12,
    fontFamily: 'Inter_600SemiBold',
  },
  dayRow: {
    flexDirection: 'row',
    gap: 6,
  },
  dayCell: {
    flex: 1,
    borderRadius: 12,
    paddingVertical: 10,
    alignItems: 'center',
    gap: 2,
    minHeight: 72,
    justifyContent: 'center',
  },
  dayCellName: {
    fontSize: 9,
    fontFamily: 'Inter_600SemiBold',
    letterSpacing: 0.3,
  },
  dayCellNum: {
    fontSize: 18,
    fontFamily: 'Inter_700Bold',
    lineHeight: 22,
  },
  dayCellMonth: {
    fontSize: 8,
    fontFamily: 'Inter_400Regular',
  },
  dayCellDot: {
    width: 5,
    height: 5,
    borderRadius: 3,
    marginTop: 2,
  },

  legend: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
    marginTop: 4,
  },
  legendItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  legendDot: {
    width: 8,
    height: 8,
    borderRadius: 2,
  },
  legendText: {
    fontSize: 11,
    fontFamily: 'Inter_400Regular',
  },

  breakdownCard: {
    marginHorizontal: 20,
    marginBottom: 14,
    borderRadius: 18,
    borderWidth: 1,
    padding: 16,
    gap: 12,
  },
  breakdownTitle: {
    fontSize: 10,
    fontFamily: 'Inter_600SemiBold',
    letterSpacing: 1.2,
    marginBottom: 2,
  },
  breakdownRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  breakdownDot: {
    width: 8,
    height: 8,
    borderRadius: 2,
  },
  breakdownPillar: {
    fontSize: 13,
    fontFamily: 'Inter_500Medium',
    width: 68,
  },
  breakdownBarWrap: {
    flex: 1,
  },
  breakdownTrack: {
    height: 6,
    borderRadius: 3,
    overflow: 'hidden',
  },
  breakdownFill: {
    height: '100%',
    borderRadius: 3,
  },
  breakdownCount: {
    fontSize: 13,
    fontFamily: 'Inter_600SemiBold',
    width: 24,
    textAlign: 'right',
  },

  emptyCard: {
    marginHorizontal: 20,
    borderRadius: 18,
    borderWidth: 1,
    padding: 32,
    alignItems: 'center',
    gap: 10,
  },
  emptyTitle: {
    fontSize: 17,
    fontFamily: 'Inter_700Bold',
    marginTop: 4,
  },
  emptyDesc: {
    fontSize: 14,
    fontFamily: 'Inter_400Regular',
    textAlign: 'center',
    lineHeight: 21,
  },
});
