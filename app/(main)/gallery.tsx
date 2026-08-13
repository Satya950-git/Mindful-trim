import React, { useState, useCallback } from 'react';
import {
  View, Text, StyleSheet, ScrollView, Platform, Pressable,
  Modal, Share, Linking, BackHandler,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { MaterialIcons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { useTranslation } from 'react-i18next';
import { useFocusEffect, router } from 'expo-router';
import { useApp } from '@/context/AppContext';
import { useThemeColors } from '@/context/ThemeContext';
import { milestoneArtifacts, Artifact } from '@/data/artifacts';
import { useShareUrl } from '@/hooks/useAppConfig';
const ICON_COLORS = [
  '#E8936B', '#882cf5', '#E8936B', '#882cf5',
  '#db3f2c', '#C4A44A', '#1f69f2', '#db3f2c',
  '#23de64', '#1f69f2',
];

interface TooltipData {
  name: string;
  description: string;
  milestoneLabel: string;
  color: string;
  isUnlocked: boolean;
}

export default function GalleryScreen() {
  const insets = useSafeAreaInsets();
  const topInset = Platform.OS === 'web' ? 67 : insets.top;
  const { t } = useTranslation();
  const { unlockedArtifacts, refreshState } = useApp();
  const C = useThemeColors();
  const APP_SHARE_URL = useShareUrl();
  const unlockedIds = new Set(unlockedArtifacts.map(a => a.id));

  const [selected, setSelected] = useState<{ artifact: Artifact; color: string } | null>(null);
  const [tooltip, setTooltip] = useState<TooltipData | null>(null);

  useFocusEffect(
    React.useCallback(() => {
      refreshState();
    }, [refreshState])
  );

  useFocusEffect(
    React.useCallback(() => {
      if (Platform.OS !== 'android') return;
      const sub = BackHandler.addEventListener('hardwareBackPress', () => {
        router.navigate('/(main)');
        return true;
      });
      return () => sub.remove();
    }, [])
  );

  // Sort completed newest-first (highest position in master list = hardest = most recently earned)
  const completed = milestoneArtifacts
    .filter(a => unlockedIds.has(a.id))
    .sort((a, b) => milestoneArtifacts.indexOf(b) - milestoneArtifacts.indexOf(a));
  const locked = milestoneArtifacts.filter(a => !unlockedIds.has(a.id));

  function artifactName(artifact: Artifact): string {
    return t(`artifacts.${artifact.id}_name`, { defaultValue: artifact.name });
  }

  function artifactDesc(artifact: Artifact): string {
    return t(`artifacts.${artifact.id}_desc`, { defaultValue: artifact.description });
  }

  function milestoneBadge(artifact: Artifact): string {
    if (artifact.levelMilestone !== undefined) {
      return t('gallery.levelMilestone', { level: artifact.levelMilestone });
    }
    return t('gallery.dayMilestone', { day: artifact.dayMilestone });
  }

  const handleShare = async (artifact: Artifact) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    const milestone = artifact.levelMilestone !== undefined
      ? t('gallery.levelLabel', { level: artifact.levelMilestone })
      : t('gallery.dayLabel', { day: artifact.dayMilestone });
    const name = artifactName(artifact);
    const desc = artifactDesc(artifact);
    const msg = t('gallery.shareMessage', { name, desc, milestone, appUrl: APP_SHARE_URL });

    if (Platform.OS === 'web') {
      Linking.openURL(`https://wa.me/?text=${encodeURIComponent(msg)}`);
    } else {
      try {
        await Share.share({ message: msg });
      } catch {
        Linking.openURL(`whatsapp://send?text=${encodeURIComponent(msg)}`).catch(() =>
          Linking.openURL(`https://wa.me/?text=${encodeURIComponent(msg)}`)
        );
      }
    }
  };

  const showTooltip = (artifact: Artifact, idx: number, isUnlocked: boolean) => {
    const color = ICON_COLORS[idx % ICON_COLORS.length];
    const description = isUnlocked
      ? artifactDesc(artifact)
      : artifact.levelMilestone !== undefined
        ? t('gallery.reachLevel', { level: artifact.levelMilestone })
        : t('gallery.unlockAtDay', { day: artifact.dayMilestone });

    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setTooltip({
      name: isUnlocked ? artifactName(artifact) : t('gallery.lockedAchievement'),
      description,
      milestoneLabel: milestoneBadge(artifact),
      color,
      isUnlocked,
    });
  };

  const renderCard = (artifact: Artifact, idx: number, isUnlocked: boolean) => {
    const iconColor = ICON_COLORS[idx % ICON_COLORS.length];

    const inner = (
      <View
        style={[
          styles.card,
          { backgroundColor: C.cardBackground, borderColor: C.border },
          !isUnlocked && styles.cardLocked,
        ]}
      >
        <View style={[styles.iconWrap, { backgroundColor: iconColor + '22' }]}>
          <MaterialIcons
            name={artifact.icon as keyof typeof MaterialIcons.glyphMap}
            size={32}
            color={isUnlocked ? iconColor : C.textTertiary}
          />
        </View>

        <Text style={[styles.artifactName, { color: isUnlocked ? C.textPrimary : C.textSecondary }]}>
          {isUnlocked ? artifactName(artifact) : '???'}
        </Text>

        <Text style={[styles.artifactDesc, { color: C.textSecondary }]} numberOfLines={2}>
          {isUnlocked
            ? artifactDesc(artifact)
            : artifact.levelMilestone !== undefined
              ? t('gallery.reachLevel', { level: artifact.levelMilestone })
              : t('gallery.unlockAtDay', { day: artifact.dayMilestone })}
        </Text>

        <Text style={[styles.dayLabel, { color: C.textTertiary }]}>
          {artifact.levelMilestone !== undefined
            ? t('gallery.levelLabel', { level: artifact.levelMilestone })
            : t('gallery.dayLabel', { day: artifact.dayMilestone })}
        </Text>
      </View>
    );

    if (!isUnlocked) {
      return (
        <Pressable
          key={artifact.id}
          style={({ pressed }) => [styles.cardWrap, { opacity: pressed ? 0.85 : 1 }]}
          onLongPress={() => showTooltip(artifact, idx, false)}
          delayLongPress={400}
        >
          {inner}
        </Pressable>
      );
    }

    return (
      <Pressable
        key={artifact.id}
        style={({ pressed }) => [styles.cardWrap, { opacity: pressed ? 0.8 : 1 }]}
        onPress={() => {
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
          setSelected({ artifact, color: iconColor });
        }}
        onLongPress={() => showTooltip(artifact, idx, true)}
        delayLongPress={400}
      >
        {inner}
      </Pressable>
    );
  };

  return (
    <>
      <ScrollView
        style={[styles.container, { backgroundColor: C.background }]}
        contentContainerStyle={[styles.scrollContent, { paddingTop: topInset + 16 }]}
        showsVerticalScrollIndicator={false}
      >
        <Text style={[styles.title, { color: C.textPrimary }]}>{t('gallery.title')}</Text>
        <Text style={[styles.subtitle, { color: C.textSecondary }]}>
          {t('gallery.unlockedCount', { count: completed.length, total: milestoneArtifacts.length })}
        </Text>

        {completed.length > 0 && (
          <>
            <Text style={[styles.sectionHeader, { color: C.textPrimary }]}>{t('gallery.completed')}</Text>
            <View style={styles.grid}>
              {completed.map((artifact, idx) => renderCard(artifact, milestoneArtifacts.indexOf(artifact), true))}
            </View>
          </>
        )}

        {completed.length === 0 && (
          <View style={[styles.emptyState, { backgroundColor: C.cardBackground, borderColor: C.border }]}>
            <MaterialIcons name="lock" size={38} color={C.textTertiary} />
            <Text style={[styles.emptyTitle, { color: C.textPrimary }]}>{t('gallery.emptyTitle')}</Text>
            <Text style={[styles.emptyText, { color: C.textSecondary }]}>{t('gallery.emptyDesc')}</Text>
          </View>
        )}

        {locked.length > 0 && (
          <>
            <Text style={[styles.sectionHeader, { color: C.textSecondary, marginTop: completed.length > 0 ? 28 : 20 }]}>
              {t('gallery.locked')}
            </Text>
            <View style={styles.grid}>
              {locked.map((artifact) => renderCard(artifact, milestoneArtifacts.indexOf(artifact), false))}
            </View>
          </>
        )}
      </ScrollView>

      {/* ── Tooltip Modal ── */}
      <Modal
        visible={!!tooltip}
        transparent
        animationType="fade"
        onRequestClose={() => setTooltip(null)}
      >
        <Pressable style={styles.overlay} onPress={() => setTooltip(null)} />
        {tooltip && (
          <View style={styles.dialogWrapper} pointerEvents="box-none">
            <View style={[styles.tooltipCard, { backgroundColor: C.cardBackground, borderColor: tooltip.color + '50' }]}>
              <View style={[styles.tooltipBar, { backgroundColor: tooltip.color }]} />

              <View style={styles.tooltipBody}>
                <View style={[styles.tooltipBadge, { backgroundColor: tooltip.color + '18' }]}>
                  <MaterialIcons
                    name={tooltip.isUnlocked ? 'emoji-events' : 'lock'}
                    size={12}
                    color={tooltip.color}
                  />
                  <Text style={[styles.tooltipBadgeText, { color: tooltip.color }]}>
                    {tooltip.milestoneLabel}
                  </Text>
                </View>

                <Text style={[styles.tooltipName, { color: C.textPrimary }]}>{tooltip.name}</Text>
                <Text style={[styles.tooltipDesc, { color: C.textSecondary }]}>{tooltip.description}</Text>

                <Text style={[styles.tooltipHint, { color: C.textTertiary }]}>
                  {tooltip.isUnlocked ? t('gallery.tapToViewShare') : t('gallery.keepGoing')}
                </Text>
              </View>

              <Pressable
                style={[styles.tooltipDismiss, { backgroundColor: C.inputBackground }]}
                onPress={() => setTooltip(null)}
              >
                <MaterialIcons name="close" size={16} color={C.textSecondary} />
              </Pressable>
            </View>
          </View>
        )}
      </Modal>

      {/* ── Achievement Detail Modal ── */}
      <Modal
        visible={!!selected}
        transparent
        animationType="fade"
        onRequestClose={() => setSelected(null)}
      >
        <Pressable style={styles.overlay} onPress={() => setSelected(null)} />

        {selected && (() => {
          const { artifact, color } = selected;
          const milestoneLabel = milestoneBadge(artifact);

          return (
            <View style={styles.dialogWrapper} pointerEvents="box-none">
              <View style={[styles.dialog, { backgroundColor: C.cardBackground, borderColor: C.border }]}>
                <Pressable
                  style={[styles.dialogClose, { backgroundColor: C.inputBackground }]}
                  onPress={() => setSelected(null)}
                >
                  <MaterialIcons name="close" size={18} color={C.textSecondary} />
                </Pressable>

                <View style={[styles.dialogIconOuter, { backgroundColor: color + '18' }]}>
                  <View style={[styles.dialogIconInner, { backgroundColor: color + '30' }]}>
                    <MaterialIcons
                      name={artifact.icon as keyof typeof MaterialIcons.glyphMap}
                      size={40}
                      color={color}
                    />
                  </View>
                </View>

                <View style={[styles.dialogBadge, { backgroundColor: color + '18', borderColor: color + '40' }]}>
                  <MaterialIcons name="emoji-events" size={12} color={color} />
                  <Text style={[styles.dialogBadgeText, { color }]}>{milestoneLabel}</Text>
                </View>

                <Text style={[styles.dialogName, { color: C.textPrimary }]}>{artifactName(artifact)}</Text>
                <Text style={[styles.dialogDesc, { color: C.textSecondary }]}>{artifactDesc(artifact)}</Text>

                <Pressable
                  style={({ pressed }) => [styles.shareBtn, { opacity: pressed ? 0.75 : 1 }]}
                  onPress={() => handleShare(artifact)}
                >
                  <MaterialIcons name="share" size={16} color="#25D366" />
                  <Text style={styles.shareBtnText}>{t('gallery.shareWhatsApp')}</Text>
                </Pressable>
              </View>
            </View>
          );
        })()}
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  scrollContent: {
    paddingHorizontal: 18,
    paddingBottom: 110,
  },
  title: {
    fontSize: 28,
    fontFamily: 'Inter_700Bold',
    marginBottom: 2,
  },
  subtitle: {
    fontSize: 14,
    fontFamily: 'Inter_400Regular',
    marginBottom: 22,
  },
  sectionHeader: {
    fontSize: 13,
    fontFamily: 'Inter_600SemiBold',
    textTransform: 'uppercase',
    letterSpacing: 1,
    marginBottom: 12,
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
  },
  cardWrap: {
    width: '47.5%',
  },
  card: {
    width: '100%',
    borderRadius: 20,
    borderWidth: 1,
    padding: 16,
    gap: 7,
    shadowColor: '#A090D0',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.10,
    shadowRadius: 6,
    elevation: 2,
  },
  cardLocked: { opacity: 0.65 },
  iconWrap: {
    width: 56,
    height: 56,
    borderRadius: 16,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 4,
  },
  artifactName: {
    fontSize: 14,
    fontFamily: 'Inter_700Bold',
  },
  artifactDesc: {
    fontSize: 12,
    fontFamily: 'Inter_400Regular',
    lineHeight: 16,
  },
  dayLabel: {
    fontSize: 11,
    fontFamily: 'Inter_500Medium',
    marginTop: 2,
  },
  emptyState: {
    alignItems: 'center',
    gap: 10,
    marginTop: 48,
    paddingHorizontal: 24,
    paddingVertical: 32,
    borderRadius: 20,
    borderWidth: 1,
  },
  emptyTitle: {
    fontSize: 18,
    fontFamily: 'Inter_600SemiBold',
  },
  emptyText: {
    fontSize: 14,
    fontFamily: 'Inter_400Regular',
    textAlign: 'center',
    lineHeight: 21,
  },

  overlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.5)',
  },
  dialogWrapper: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 28,
  },

  tooltipCard: {
    width: '100%',
    borderRadius: 20,
    borderWidth: 1.5,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.15,
    shadowRadius: 16,
    elevation: 10,
  },
  tooltipBar: {
    height: 4,
    width: '100%',
  },
  tooltipBody: {
    padding: 20,
    gap: 8,
  },
  tooltipBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    alignSelf: 'flex-start',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 10,
  },
  tooltipBadgeText: {
    fontSize: 11,
    fontFamily: 'Inter_600SemiBold',
  },
  tooltipName: {
    fontSize: 18,
    fontFamily: 'Inter_700Bold',
  },
  tooltipDesc: {
    fontSize: 14,
    fontFamily: 'Inter_400Regular',
    lineHeight: 21,
  },
  tooltipHint: {
    fontSize: 12,
    fontFamily: 'Inter_400Regular',
    marginTop: 4,
    fontStyle: 'italic',
  },
  tooltipDismiss: {
    position: 'absolute',
    top: 14,
    right: 14,
    width: 28,
    height: 28,
    borderRadius: 14,
    justifyContent: 'center',
    alignItems: 'center',
  },

  dialog: {
    width: '100%',
    borderRadius: 24,
    borderWidth: 1,
    padding: 24,
    alignItems: 'center',
    gap: 10,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.18,
    shadowRadius: 24,
    elevation: 12,
  },
  dialogClose: {
    position: 'absolute',
    top: 14,
    right: 14,
    width: 32,
    height: 32,
    borderRadius: 16,
    justifyContent: 'center',
    alignItems: 'center',
  },
  dialogIconOuter: {
    width: 90,
    height: 90,
    borderRadius: 24,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 2,
  },
  dialogIconInner: {
    width: 68,
    height: 68,
    borderRadius: 18,
    justifyContent: 'center',
    alignItems: 'center',
  },
  dialogBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 10,
    borderWidth: 1,
  },
  dialogBadgeText: {
    fontSize: 11,
    fontFamily: 'Inter_600SemiBold',
  },
  dialogName: {
    fontSize: 22,
    fontFamily: 'Inter_700Bold',
    textAlign: 'center',
  },
  dialogDesc: {
    fontSize: 14,
    fontFamily: 'Inter_400Regular',
    textAlign: 'center',
    lineHeight: 21,
    paddingHorizontal: 4,
  },
  shareBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 7,
    width: '100%',
    marginTop: 6,
    paddingVertical: 13,
    borderRadius: 14,
    borderWidth: 1.5,
    borderColor: '#25D36640',
    backgroundColor: '#25D36612',
  },
  shareBtnText: {
    fontSize: 14,
    fontFamily: 'Inter_600SemiBold',
    color: '#1A9C50',
  },
});
