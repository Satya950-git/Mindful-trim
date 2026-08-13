export interface Artifact {
  id: string;
  name: string;
  description: string;
  icon: string;
  dayMilestone?: number;
  levelMilestone?: number;
}

export const milestoneArtifacts: Artifact[] = [
  // ── Day-based achievements ──────────────────────────────────────────────────
  { id: 'a1',  name: 'First Spark',        description: 'You showed up for 7 days. The journey has begun.',              dayMilestone: 7,   icon: 'local-fire-department' },
  { id: 'a2',  name: 'Growing Flame',      description: '14 days of alignment. Your dedication is building.',            dayMilestone: 14,  icon: 'whatshot' },
  { id: 'a3',  name: 'Inner Light',        description: '21 days. You have formed a habit of presence.',                  dayMilestone: 21,  icon: 'lightbulb' },
  { id: 'a4',  name: 'Steady Glow',        description: '28 days aligned. One full cycle of growth.',                    dayMilestone: 28,  icon: 'auto-awesome' },
  { id: 'a5',  name: 'Rising Dawn',        description: '35 days. Your practice is part of who you are.',                dayMilestone: 35,  icon: 'wb-twilight' },
  { id: 'a6',  name: 'Golden Hour',        description: '42 days of commitment. Radiance from within.',                  dayMilestone: 42,  icon: 'wb-sunny' },
  { id: 'a7',  name: 'Full Moon',          description: '49 days. Completeness in your daily rhythm.',                   dayMilestone: 49,  icon: 'nightlight-round' },
  { id: 'a8',  name: 'Northern Star',      description: '56 days. A guiding light for yourself and others.',             dayMilestone: 56,  icon: 'star' },
  { id: 'a9',  name: 'Solar Eclipse',      description: '63 days aligned. Rare and extraordinary.',                      dayMilestone: 63,  icon: 'brightness-3' },
  { id: 'a10', name: 'Cosmic Alignment',   description: '70 days. All pillars in harmony.',                              dayMilestone: 70,  icon: 'all-inclusive' },
  { id: 'a11', name: 'The Wanderer',       description: '77 days venturing deeper into your own landscape.',             dayMilestone: 77,  icon: 'explore' },
  { id: 'a12', name: 'Quiet Storm',        description: '84 days. Twelve weeks of quiet, consistent power.',             dayMilestone: 84,  icon: 'air' },
  { id: 'a13', name: 'The Pilgrim',        description: '91 days. You walk with intention and arrive transformed.',      dayMilestone: 91,  icon: 'terrain' },
  { id: 'a14', name: 'The Centurion',      description: '100 days of showing up for yourself. A century of courage.',   dayMilestone: 100, icon: 'military-tech' },
  { id: 'a15', name: 'Ancient Root',       description: '120 days deep. Your roots cannot be shaken by any storm.',     dayMilestone: 120, icon: 'park' },
  { id: 'a16', name: 'The Devoted',        description: '150 alignments. Devotion has become your deepest nature.',     dayMilestone: 150, icon: 'spa' },
  { id: 'a17', name: 'Equinox',            description: '180 days. Six months of balance — you are in full harmony.',   dayMilestone: 180, icon: 'balance' },
  { id: 'a18', name: 'The Unbroken',       description: '200 days strong. Nothing can interrupt who you are becoming.', dayMilestone: 200, icon: 'verified-user' },
  { id: 'a19', name: 'Diamond Spirit',     description: '250 days. Forged under pressure into something extraordinary.', dayMilestone: 250, icon: 'diamond' },
  { id: 'a20', name: 'Eternal Flame',      description: '300 days lit. You are the fire that never goes out.',          dayMilestone: 300, icon: 'flare' },
  { id: 'a21', name: 'Year of the Axis',   description: '365 days. A complete revolution. You have truly transformed.', dayMilestone: 365, icon: 'public' },

  // ── Level-based achievements ────────────────────────────────────────────────
  { id: 'l1',  name: 'Awakening',          description: 'Level 5 reached. XP is flowing and your practice deepens.',    levelMilestone: 5,   icon: 'trending-up' },
  { id: 'l2',  name: 'Veil Lifted',        description: 'Level 10. You have completed The Arriving. The path is clear.', levelMilestone: 10,  icon: 'visibility' },
  { id: 'l3',  name: "Seeker's Depth",     description: 'Level 20. You are reaching into the deeper layers of the self.', levelMilestone: 20, icon: 'psychology' },
  { id: 'l4',  name: 'Path Revealed',      description: 'Level 30. The Seeker phase complete. You know what you seek.',  levelMilestone: 30,  icon: 'search' },
  { id: 'l5',  name: 'The Midpoint',       description: 'Level 50. Halfway to prestige. The mountain is half climbed.',  levelMilestone: 50,  icon: 'adjust' },
  { id: 'l6',  name: 'Deeply Anchored',    description: 'Level 60. The Anchored phase complete. You are immovable.',     levelMilestone: 60,  icon: 'foundation' },
  { id: 'l7',  name: 'The Aligned Path',   description: 'Level 75. Three-quarters there. Alignment is drawing near.',   levelMilestone: 75,  icon: 'center-focus-strong' },
  { id: 'l8',  name: 'Near the Summit',    description: 'Level 90. Only ten levels stand between you and the peak.',    levelMilestone: 90,  icon: 'show-chart' },
  { id: 'l9',  name: 'The Threshold',      description: 'Level 99. One step before The Axis. You stand at the gate.',   levelMilestone: 99,  icon: 'account-balance' },
  { id: 'l10', name: 'The Axis Achieved',  description: 'Level 100. Prestige unlocked. You have become The Axis.',      levelMilestone: 100, icon: 'workspace-premium' },
];

export function getUnlockedArtifacts(totalDays: number, currentLevel: number = 0): Artifact[] {
  return milestoneArtifacts.filter(a => {
    if (a.dayMilestone !== undefined && totalDays >= a.dayMilestone) return true;
    if (a.levelMilestone !== undefined && currentLevel >= a.levelMilestone) return true;
    return false;
  });
}

export function getNextArtifact(totalDays: number, currentLevel: number = 0): Artifact | null {
  return milestoneArtifacts.find(a => {
    if (a.dayMilestone !== undefined && totalDays < a.dayMilestone) return true;
    if (a.levelMilestone !== undefined && currentLevel < a.levelMilestone) return true;
    return false;
  }) || null;
}
