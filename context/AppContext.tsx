import React, { createContext, useContext, useState, useEffect, useMemo, useCallback, ReactNode } from 'react';
import { getUnlockedArtifacts, getNextArtifact, milestoneArtifacts, Artifact } from '@/data/artifacts';

export interface Exercise {
  exerciseId: string;
  pillar: string;
  moodScore: number;
  stateDescriptor: string;
  exerciseName: string;
  durationMinutes: number;
  difficulty?: string;
  description: string;
  xpReward: number;
  insights?: string;
  nameHi?: string;
  descriptionHi?: string;
  insightsHi?: string;
}
import { useAuth } from './AuthContext';
import { apiRequest, getApiUrl, getAuthToken } from '@/lib/query-client';

interface ServerState {
  totalDaysAligned: number;
  lastCompletedTimestamp: string | null;
  lastCompletedDate: string | null;
  lastPillar: string | null;
  totalXp: number;
  currentLevel: number;
  currentPhase: string;
  dailyNextsUsed: number;
  lastNextDate: string | null;
}

interface LocalState {
  currentExercise: Exercise | null;
  currentPillar: string | null;
  moodBefore: number | null;
  contextTags: string[];
}

export interface ProgressionState {
  totalXp: number;
  currentLevel: number;
  currentPhase: string;
  currentPhaseLevelRange: string;
  lastXpGained: number;
  lastLevelUp: boolean;
  nextLevelXpRequired: number;
  currentLevelProgressPercent: number;
  yearProgressPercent: number;
  latestUnlockedMilestone: string | null;
  isMaxLevel: boolean;
  isPrestige: boolean;
}

interface DailyLog {
  id: string;
  date: string;
  pillar: string;
  exerciseId: string;
  exerciseName: string;
  moodBefore: number;
  contextTags: string[];
  completedAt: string;
}

export interface CompletionResult {
  artifact: Artifact | null;
  progression: ProgressionState;
  phaseBefore: string;
  isMaxLevel: boolean;
  isPrestige: boolean;
  phaseTransition: boolean;
  newMilestoneKey: string | null;
  xpAwarded: number;
  isRetry: boolean;
  mode: 'alignment' | 'practice';
}

interface NextStatus {
  nextsUsed: number;
  nextsLimit: number;
  canNext: boolean;
}

interface AppContextValue {
  userState: {
    totalDaysAligned: number;
    lastCompletedTimestamp: number | null;
    lastCompletedDate: string | null;
    lastPillar: string | null;
    currentExercise: Exercise | null;
    currentPillar: string | null;
    moodBefore: number | null;
    contextTags: string[];
  };
  progression: ProgressionState;
  isExerciseAvailable: boolean;
  hasAlignedToday: boolean;
  cooldownRemaining: number;
  unlockedArtifacts: Artifact[];
  nextArtifact: Artifact | null;
  dailyLogs: DailyLog[];
  nextStatus: NextStatus;
  assignExercise: (pillar: string, mood: number, tags: string[]) => Promise<Exercise | null>;
  nextExercise: (pillar: string, mood: number, tags: string[]) => Promise<Exercise | null>;
  completeExercise: () => Promise<CompletionResult>;
  setMoodAndTags: (mood: number, tags: string[]) => void;
  resetState: () => Promise<void>;
  resetToday: () => Promise<void>;
  refreshState: () => Promise<void>;
}

const AppContext = createContext<AppContextValue | null>(null);

function getTodayDateStr(): string {
  const d = new Date();
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function getMsUntilMidnight(): number {
  const now = new Date();
  const midnight = new Date(now);
  midnight.setHours(24, 0, 0, 0);
  return midnight.getTime() - now.getTime();
}

const DEFAULT_PHASE = 'The Arriving';

const defaultServerState: ServerState = {
  totalDaysAligned: 0,
  lastCompletedTimestamp: null,
  lastCompletedDate: null,
  lastPillar: null,
  totalXp: 0,
  currentLevel: 0,
  currentPhase: DEFAULT_PHASE,
  dailyNextsUsed: 0,
  lastNextDate: null,
};

const defaultLocalState: LocalState = {
  currentExercise: null,
  currentPillar: null,
  moodBefore: null,
  contextTags: [],
};

const defaultProgression: ProgressionState = {
  totalXp: 0,
  currentLevel: 0,
  currentPhase: DEFAULT_PHASE,
  currentPhaseLevelRange: 'Levels 1–10',
  lastXpGained: 0,
  lastLevelUp: false,
  nextLevelXpRequired: 150,
  currentLevelProgressPercent: 0,
  yearProgressPercent: 0,
  latestUnlockedMilestone: null,
  isMaxLevel: false,
  isPrestige: false,
};

const defaultNextStatus: NextStatus = {
  nextsUsed: 0,
  nextsLimit: 3,
  canNext: true,
};

export function AppProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const [serverState, setServerState] = useState<ServerState>(defaultServerState);
  const [localState, setLocalState] = useState<LocalState>(defaultLocalState);
  const [dailyLogs, setDailyLogs] = useState<DailyLog[]>([]);
  const [cooldownRemaining, setCooldownRemaining] = useState(0);
  const [historyCache, setHistoryCache] = useState<Record<string, string[]>>({});
  const [exerciseCache, setExerciseCache] = useState<Record<string, Exercise[]>>({});
  const [progression, setProgression] = useState<ProgressionState>(defaultProgression);
  const [nextStatus, setNextStatus] = useState<NextStatus>(defaultNextStatus);

  const userId = user?.id;

  useEffect(() => {
    if (userId) {
      loadState();
    } else {
      setServerState(defaultServerState);
      setLocalState(defaultLocalState);
      setDailyLogs([]);
      setHistoryCache({});
      setExerciseCache({});
      setProgression(defaultProgression);
      setNextStatus(defaultNextStatus);
    }
  }, [userId]);

  useEffect(() => {
    if (!serverState.lastCompletedDate) {
      setCooldownRemaining(0);
      return;
    }
    const updateCooldown = () => {
      const today = getTodayDateStr();
      if (serverState.lastCompletedDate !== today) {
        setCooldownRemaining(0);
      } else {
        setCooldownRemaining(getMsUntilMidnight());
      }
    };
    updateCooldown();
    const interval = setInterval(updateCooldown, 1000);
    return () => clearInterval(interval);
  }, [serverState.lastCompletedDate]);

  async function loadState() {
    const baseUrl = getApiUrl();
    const token = await getAuthToken();
    const authHeaders: Record<string, string> = { ...(token ? { 'Authorization': `Bearer ${token}` } : {}) };

    const safeFetch = async (path: string) => {
      try {
        const res = await fetch(new URL(path, baseUrl).toString(), { credentials: 'include', headers: authHeaders });
        return res.ok ? res : null;
      } catch {
        return null;
      }
    };

    const [stateRes, progressionRes, logsRes, historyRes] = await Promise.all([
      safeFetch('/api/state'),
      safeFetch('/api/progression/status'),
      safeFetch('/api/logs'),
      safeFetch('/api/history'),
    ]);

    if (stateRes) {
      try {
        const state = await stateRes.json();
        setServerState({
          totalDaysAligned: state.totalDaysAligned || 0,
          lastCompletedTimestamp: state.lastCompletedTimestamp || null,
          lastCompletedDate: state.lastCompletedDate || null,
          lastPillar: state.lastPillar || null,
          totalXp: state.totalXp ?? 0,
          currentLevel: state.currentLevel ?? 0,
          currentPhase: state.currentPhase ?? DEFAULT_PHASE,
          dailyNextsUsed: state.dailyNextsUsed ?? 0,
          lastNextDate: state.lastNextDate || null,
        });
        setNextStatus({
          nextsUsed: state.nextsUsed ?? 0,
          nextsLimit: state.nextsLimit ?? 3,
          canNext: state.canNext ?? true,
        });
      } catch {
        console.warn('[AppContext] Failed to parse state response');
      }
    }

    if (progressionRes) {
      try {
        const prog = await progressionRes.json();
        setProgression(prev => ({
          ...prev,
          totalXp: prog.totalXp ?? prev.totalXp,
          currentLevel: prog.currentLevel ?? prev.currentLevel,
          currentPhase: prog.currentPhase ?? prev.currentPhase,
          currentPhaseLevelRange: prog.currentPhaseLevelRange ?? 'Levels 1–10',
          nextLevelXpRequired: prog.xpForNextLevel ?? prev.nextLevelXpRequired,
          currentLevelProgressPercent: prog.currentLevelProgressPercent ?? prev.currentLevelProgressPercent,
          yearProgressPercent: prog.yearProgressPercent ?? prev.yearProgressPercent,
          latestUnlockedMilestone: prog.latestUnlockedMilestone ?? null,
          isMaxLevel: !!(prog.isMaxLevel),
          isPrestige: !!(prog.isPrestige),
        }));
      } catch {
        console.warn('[AppContext] Failed to parse progression response');
      }
    }

    if (logsRes) {
      try {
        const logs = await logsRes.json();
        setDailyLogs(logs);
      } catch {
        console.warn('[AppContext] Failed to parse logs response');
      }
    }

    if (historyRes) {
      try {
        const history = await historyRes.json();
        setHistoryCache(history);
      } catch {
        console.warn('[AppContext] Failed to parse history response');
      }
    }
  }

  const hasAlignedToday = serverState.lastCompletedDate === getTodayDateStr();
  const isExerciseAvailable = true;

  // Fetch exercises for a pillar from the DB, caching per pillar in memory
  const loadExercisesForPillar = useCallback(async (pillar: string): Promise<Exercise[]> => {
    if (exerciseCache[pillar]) return exerciseCache[pillar];
    try {
      const baseUrl = getApiUrl();
      const url = new URL(`/api/exercises`, baseUrl);
      url.searchParams.set('pillar', pillar);
      const res = await fetch(url.toString());
      if (res.ok) {
        const data: Exercise[] = await res.json();
        setExerciseCache(prev => ({ ...prev, [pillar]: data }));
        return data;
      }
    } catch (e) {
      __DEV__ && console.error('Failed to load exercises for pillar:', e);
    }
    return [];
  }, [exerciseCache]);

  // Core exercise selection logic (shared by assign and next)
  const selectExercise = useCallback((pillarExercises: Exercise[], pillar: string, mood: number, tags: string[], exclude: string[] = []): Exercise | null => {
    if (!pillarExercises.length) return null;

    const moodScore = mood - 3;
    const usedIds = historyCache[pillar] || [];
    const allExcluded = [...usedIds, ...exclude];

    const notUsed = pillarExercises.filter(e => !allExcluded.includes(e.exerciseId));
    const pool = notUsed.length > 0 ? notUsed : pillarExercises.filter(e => !exclude.includes(e.exerciseId));
    const finalPool = pool.length > 0 ? pool : pillarExercises;

    const pickRandom = (arr: Exercise[]) => arr[Math.floor(Math.random() * arr.length)];

    let selected: Exercise | undefined;

    if (tags.length > 0) {
      const tagAndMood = finalPool.filter(e => tags.includes(e.stateDescriptor) && e.moodScore === moodScore);
      if (tagAndMood.length > 0) selected = pickRandom(tagAndMood);
    }
    if (!selected && tags.length > 0) {
      const tagOnly = finalPool.filter(e => tags.includes(e.stateDescriptor));
      if (tagOnly.length > 0) selected = pickRandom(tagOnly);
    }
    if (!selected) {
      const moodOnly = finalPool.filter(e => e.moodScore === moodScore);
      if (moodOnly.length > 0) selected = pickRandom(moodOnly);
    }
    if (!selected) {
      const sorted = [...finalPool].sort((a, b) =>
        Math.abs(a.moodScore - moodScore) - Math.abs(b.moodScore - moodScore)
      );
      selected = sorted[0];
    }

    return selected || null;
  }, [historyCache]);

  const assignExercise = useCallback(async (pillar: string, mood: number, tags: string[]): Promise<Exercise | null> => {
    if (!userId) return null;

    const pillarExercises = await loadExercisesForPillar(pillar);
    const selected = selectExercise(pillarExercises, pillar, mood, tags);
    if (!selected) return null;

    const usedIds = historyCache[pillar] || [];
    const isReset = !usedIds.length || usedIds.length >= pillarExercises.length;
    const newUsedIds = isReset ? [selected.exerciseId] : [...usedIds, selected.exerciseId];

    try {
      await apiRequest('PUT', '/api/history', { pillar, usedExerciseIds: newUsedIds });
      setHistoryCache(prev => ({ ...prev, [pillar]: newUsedIds }));
    } catch (e) {
      __DEV__ && console.error('Failed to update history:', e);
    }

    setLocalState({
      currentExercise: selected,
      currentPillar: pillar,
      moodBefore: mood,
      contextTags: tags,
    });

    return selected;
  }, [userId, serverState, historyCache, selectExercise, loadExercisesForPillar]);

  // Next Exercise — uses daily limit, skips current exercise
  const nextExercise = useCallback(async (pillar: string, mood: number, tags: string[]): Promise<Exercise | null> => {
    if (!userId) return null;

    // Check and record next usage on backend
    try {
      const res = await apiRequest('POST', '/api/exercise/next', {});
      const data = await res.json();
      if (!data.wasRecorded) {
        return null; // Limit was already reached before this call
      }
      setNextStatus(data);
    } catch (e) {
      __DEV__ && console.error('Failed to record next:', e);
      return null;
    }

    // Select a different exercise (exclude current)
    const pillarExercises = await loadExercisesForPillar(pillar);
    const currentId = localState.currentExercise?.exerciseId;
    const selected = selectExercise(pillarExercises, pillar, mood, tags, currentId ? [currentId] : []);
    if (!selected) return null;

    setLocalState(prev => ({
      ...prev,
      currentExercise: selected,
      currentPillar: pillar,
      moodBefore: mood,
      contextTags: tags,
    }));

    return selected;
  }, [userId, localState.currentExercise, selectExercise, loadExercisesForPillar]);

  const completeExercise = useCallback(async (): Promise<CompletionResult> => {
    const nullResult: CompletionResult = {
      artifact: null,
      progression,
      phaseBefore: progression.currentPhase,
      isMaxLevel: progression.isMaxLevel,
      isPrestige: progression.isPrestige,
      phaseTransition: false,
      newMilestoneKey: null,
      xpAwarded: 0,
      isRetry: false,
      mode: 'alignment',
    };

    if (!localState.currentExercise || !localState.currentPillar || !userId) return nullResult;

    const today = getTodayDateStr();

    const newTotalDays = serverState.totalDaysAligned + 1;
    const now = Date.now();

    try {
      const completeRes = await apiRequest('POST', '/api/complete', {
        totalDaysAligned: newTotalDays,
        lastCompletedTimestamp: now.toString(),
        lastCompletedDate: today,
        lastPillar: localState.currentPillar,
        exerciseId: localState.currentExercise.exerciseId,
        exerciseName: localState.currentExercise.exerciseName,
        exerciseDifficulty: localState.currentExercise.difficulty || 'easy',
        pillar: localState.currentPillar,
        moodBefore: localState.moodBefore ?? 3,
        contextTags: localState.contextTags,
      });

      const completeData = await completeRes.json();
      const savedLog = completeData.log;
      const prog = completeData.progression;
      const xpAwarded: number = completeData.xpAwarded ?? 0;
      const isRetry: boolean = !!(completeData.isRetry);
      const mode: 'alignment' | 'practice' = completeData.mode === 'practice' ? 'practice' : 'alignment';

      setDailyLogs(prev => savedLog ? [savedLog, ...prev] : prev);

      let newProgression = progression;
      const capturedPhaseBefore = prog?.phaseBefore ?? progression.currentPhase;

      if (prog) {
        const newMilestone = prog.newMilestoneKey ?? null;
        const isMax = !!(prog.isMaxLevel);
        newProgression = {
          totalXp: prog.totalXp,
          currentLevel: prog.currentLevel,
          currentPhase: prog.currentPhase,
          currentPhaseLevelRange: prog.currentPhaseLevelRange ?? progression.currentPhaseLevelRange,
          lastXpGained: prog.xpGained,
          lastLevelUp: prog.levelUp,
          nextLevelXpRequired: prog.nextLevelXpRequired,
          currentLevelProgressPercent: prog.currentLevelProgressPercent,
          yearProgressPercent: prog.yearProgressPercent,
          latestUnlockedMilestone: newMilestone ?? progression.latestUnlockedMilestone,
          isMaxLevel: isMax,
          isPrestige: isMax,
        };
        setProgression(newProgression);
      } else if (xpAwarded === 0) {
        // Retry — no XP change, progression stays the same
        newProgression = { ...progression, lastXpGained: 0, lastLevelUp: false };
      }

      setServerState({
        totalDaysAligned: mode === 'alignment' ? newTotalDays : serverState.totalDaysAligned,
        lastCompletedTimestamp: mode === 'alignment' ? now.toString() : serverState.lastCompletedTimestamp,
        lastCompletedDate: mode === 'alignment' ? today : serverState.lastCompletedDate,
        lastPillar: localState.currentPillar,
        totalXp: prog?.totalXp ?? serverState.totalXp,
        currentLevel: prog?.currentLevel ?? serverState.currentLevel,
        currentPhase: prog?.currentPhase ?? serverState.currentPhase,
        dailyNextsUsed: serverState.dailyNextsUsed,
        lastNextDate: serverState.lastNextDate,
      });

      setLocalState(defaultLocalState);

      const prevLevel = serverState.currentLevel;
      const newLevel = prog?.currentLevel ?? serverState.currentLevel;
      const prevDays = mode === 'alignment' ? newTotalDays - 1 : serverState.totalDaysAligned;
      const artifact =
        milestoneArtifacts.find(a =>
          a.levelMilestone !== undefined &&
          a.levelMilestone > prevLevel &&
          a.levelMilestone <= newLevel
        ) ??
        milestoneArtifacts.find(a =>
          a.dayMilestone !== undefined &&
          a.dayMilestone > prevDays &&
          a.dayMilestone <= newTotalDays
        ) ??
        null;

      return {
        artifact,
        progression: newProgression,
        phaseBefore: capturedPhaseBefore,
        isMaxLevel: !!(prog?.isMaxLevel),
        isPrestige: !!(prog?.isMaxLevel),
        phaseTransition: !!(prog?.phaseTransition),
        newMilestoneKey: prog?.newMilestoneKey ?? null,
        xpAwarded,
        isRetry,
        mode,
      };
    } catch (e) {
      __DEV__ && console.error('Failed to complete exercise:', e);
    }

    return nullResult;
  }, [localState, serverState, userId, progression]);

  const setMoodAndTags = useCallback((_mood: number, _tags: string[]) => {}, []);

  const resetState = useCallback(async () => {
    try {
      await apiRequest('POST', '/api/reset');
    } catch (e) {
      __DEV__ && console.error('Failed to reset:', e);
    }
    setServerState(defaultServerState);
    setLocalState(defaultLocalState);
    setDailyLogs([]);
    setHistoryCache({});
    setExerciseCache({});
    setProgression(defaultProgression);
    setNextStatus(defaultNextStatus);
  }, []);

  const resetToday = useCallback(async () => {
    const todayDate = getTodayDateStr();
    try {
      await apiRequest('POST', '/api/reset-today', { todayDate });
    } catch (e) {
      __DEV__ && console.error('Failed to reset today:', e);
    }
    setLocalState(defaultLocalState);
    // Re-fetch all server state so XP, level, phase, and logs are up to date
    await loadState();
  }, []);

  const refreshState = useCallback(async () => {
    await loadState();
  }, []);

  const userState = useMemo(() => ({
    totalDaysAligned: serverState.totalDaysAligned,
    lastCompletedTimestamp: serverState.lastCompletedTimestamp ? parseInt(serverState.lastCompletedTimestamp) : null,
    lastCompletedDate: serverState.lastCompletedDate,
    lastPillar: serverState.lastPillar,
    currentExercise: localState.currentExercise,
    currentPillar: localState.currentPillar,
    moodBefore: localState.moodBefore,
    contextTags: localState.contextTags,
  }), [serverState, localState]);

  const unlockedArtifacts = useMemo(() => getUnlockedArtifacts(serverState.totalDaysAligned, serverState.currentLevel), [serverState.totalDaysAligned, serverState.currentLevel]);
  const nextArtifact = useMemo(() => getNextArtifact(serverState.totalDaysAligned, serverState.currentLevel), [serverState.totalDaysAligned, serverState.currentLevel]);

  const value = useMemo(() => ({
    userState,
    progression,
    isExerciseAvailable,
    hasAlignedToday,
    cooldownRemaining,
    unlockedArtifacts,
    nextArtifact,
    dailyLogs,
    nextStatus,
    assignExercise,
    nextExercise,
    completeExercise,
    setMoodAndTags,
    resetState,
    resetToday,
    refreshState,
  }), [userState, progression, isExerciseAvailable, hasAlignedToday, cooldownRemaining, unlockedArtifacts, nextArtifact, dailyLogs, nextStatus, assignExercise, nextExercise, completeExercise, setMoodAndTags, resetState, resetToday, refreshState]);

  return (
    <AppContext.Provider value={value}>
      {children}
    </AppContext.Provider>
  );
}

export function useApp() {
  const context = useContext(AppContext);
  if (!context) throw new Error('useApp must be used within AppProvider');
  return context;
}
