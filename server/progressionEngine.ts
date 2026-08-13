export const MAX_LEVEL = 100;
export const TOTAL_PRESTIGE_XP = 60000;
export const DAILY_NEXT_LIMIT = 3;

// Cumulative XP thresholds (verified):
// Level 10:  10 × 150                         = 1,500
// Level 30:  1500 + 20 × 300                  = 7,500
// Level 60:  7500 + 30 × 500                  = 22,500
// Level 99:  22500 + 39 × 900                 = 57,600
// Level 100: 57600 + 2400                     = 60,000 ✓

export interface PhaseConfig {
  name: string;
  levelStart: number;
  levelEnd: number;
  xpPerLevel: number;
}

export const PHASES: PhaseConfig[] = [
  { name: 'The Arriving', levelStart: 1,   levelEnd: 10,  xpPerLevel: 150  },
  { name: 'The Seeker',   levelStart: 11,  levelEnd: 30,  xpPerLevel: 300  },
  { name: 'The Anchored', levelStart: 31,  levelEnd: 60,  xpPerLevel: 500  },
  { name: 'The Aligned',  levelStart: 61,  levelEnd: 99,  xpPerLevel: 900  },
  { name: 'The Axis',     levelStart: 100, levelEnd: 100, xpPerLevel: 2400 },
];

export function getBaseXpByDifficulty(difficulty: string): number {
  switch ((difficulty ?? '').toLowerCase()) {
    case 'easy':   return 100;
    case 'medium': return 150;
    case 'hard':   return 200;
    default:       return 100;
  }
}

export function calculateScaledXp(baseXp: number, currentLevel: number): number {
  return Math.round(baseXp + (baseXp * currentLevel * 0.05));
}

export function getLevelThresholdXp(level: number): number {
  if (level <= 0) return 0;
  let xp = 0;
  for (const phase of PHASES) {
    if (level < phase.levelStart) break;
    const levelsInPhase = Math.min(level, phase.levelEnd) - phase.levelStart + 1;
    xp += levelsInPhase * phase.xpPerLevel;
  }
  return xp;
}

export function getXpRequiredForLevel(level: number): number {
  if (level <= 0) return 0;
  return getLevelThresholdXp(level) - getLevelThresholdXp(level - 1);
}

export function calculateLevel(totalXp: number): number {
  let level = 0;
  for (const phase of PHASES) {
    for (let lv = phase.levelStart; lv <= phase.levelEnd; lv++) {
      if (totalXp >= getLevelThresholdXp(lv)) {
        level = lv;
      } else {
        return level;
      }
    }
  }
  return Math.min(level, MAX_LEVEL);
}

export function getPhaseForLevel(level: number): string {
  if (level <= 0) return PHASES[0].name;
  for (const phase of PHASES) {
    if (level >= phase.levelStart && level <= phase.levelEnd) {
      return phase.name;
    }
  }
  return PHASES[PHASES.length - 1].name;
}

export function getTitleForLevel(level: number): string {
  return getPhaseForLevel(level);
}

export function getPhaseConfig(level: number): PhaseConfig {
  for (const phase of PHASES) {
    if (level >= phase.levelStart && level <= phase.levelEnd) {
      return phase;
    }
  }
  return PHASES[0];
}

export function getPhaseRange(level: number): string {
  const phase = getPhaseConfig(level);
  if (phase.levelStart === phase.levelEnd) return `Level ${phase.levelStart}`;
  return `Levels ${phase.levelStart}–${phase.levelEnd}`;
}

export function nextLevelXpRequired(level: number): number {
  if (level >= MAX_LEVEL) return getLevelThresholdXp(MAX_LEVEL);
  return getLevelThresholdXp(level + 1);
}

export function levelProgressPercent(totalXp: number): number {
  const level = calculateLevel(totalXp);
  if (level >= MAX_LEVEL) return 100;
  const levelThreshold = getLevelThresholdXp(level);
  const nextThreshold = getLevelThresholdXp(level + 1);
  const xpIntoLevel = totalXp - levelThreshold;
  const xpNeeded = nextThreshold - levelThreshold;
  if (xpNeeded <= 0) return 100;
  return Math.round((xpIntoLevel / xpNeeded) * 100);
}

export function yearProgressPercent(totalXp: number): number {
  return Math.min(Math.round((totalXp / TOTAL_PRESTIGE_XP) * 100 * 10) / 10, 100);
}

export function recalculateLevelFromTotalXp(totalXp: number): { level: number; phase: string; progressPercent: number } {
  const level = calculateLevel(totalXp);
  const phase = getPhaseForLevel(level);
  const progressPercent = levelProgressPercent(totalXp);
  return { level, phase, progressPercent };
}

export function getProgressToNextLevel(totalXp: number): { xpIntoLevel: number; xpNeeded: number; percent: number } {
  const level = calculateLevel(totalXp);
  if (level >= MAX_LEVEL) return { xpIntoLevel: 0, xpNeeded: 0, percent: 100 };
  const levelThreshold = getLevelThresholdXp(level);
  const nextThreshold = getLevelThresholdXp(level + 1);
  const xpIntoLevel = totalXp - levelThreshold;
  const xpNeeded = nextThreshold - levelThreshold;
  return { xpIntoLevel, xpNeeded, percent: Math.round((xpIntoLevel / xpNeeded) * 100) };
}

export function isPrestigeLevel(level: number): boolean {
  return level >= MAX_LEVEL;
}

export function getMilestoneAtLevel(level: number): string | null {
  if (level === 10)  return 'phase_arriving_complete';
  if (level === 30)  return 'phase_seeker_complete';
  if (level === 60)  return 'phase_anchored_complete';
  if (level === 99)  return 'phase_aligned_complete';
  if (level === 100) return 'prestige_the_axis';
  return null;
}

export function getNextMilestone(currentLevel: number): string | null {
  if (currentLevel < 10)  return 'phase_arriving_complete';
  if (currentLevel < 30)  return 'phase_seeker_complete';
  if (currentLevel < 60)  return 'phase_anchored_complete';
  if (currentLevel < 99)  return 'phase_aligned_complete';
  if (currentLevel < 100) return 'prestige_the_axis';
  return null;
}

// Backwards compatibility
export const YEAR_XP_TARGET = TOTAL_PRESTIGE_XP;
export function calculatePhase(level: number): string { return getPhaseForLevel(level); }
export function getMilestoneKey(level: number): string | null { return getMilestoneAtLevel(level); }
