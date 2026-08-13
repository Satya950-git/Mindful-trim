import React, { createContext, useContext, useState, useEffect, useCallback, useRef, ReactNode } from 'react';
import { Alert } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useAuth } from './AuthContext';
import { apiRequest, getApiUrl, getAuthToken } from '@/lib/query-client';
import { HABITS, Habit } from '@/data/habitsData';
import { TIMEBLOCK_HABIT_LIMIT, PILLAR_HABIT_LIMIT } from '@/shared/appConfig';

export type TimeBlock = 'Morning' | 'Workday' | 'Evening' | 'Lifestyle';

export interface UserHabit extends Habit {
  isEnabled: boolean;
  completedToday: boolean;
  isCoOp: boolean;
  partnerId: string | null;
  partnerName: string | null;
  journeyStartDate: string | null;
  journeyTargetDays: number | null;
  habitStatus: 'active' | 'maintained';
  notifyEnabled: boolean;
  journeyCompletionCount: number | null;
  pillarVisibility: Record<string, boolean>;
}

export interface IncomingNudge {
  habitId: string;
  senderName: string;
  sentAt: string;
}

/** All values on a 1–10 integer scale */
export interface DailyFuel {
  hydration: number;
  sleep: number;
  energy: number;
}

export interface DualCompleteResult {
  dualComplete: boolean;
  partnerName: string;
  habitMastered: boolean;
}

export interface ConfigureHabitOpts {
  journeyTargetDays?: number;
  isCoOp?: boolean;
  partnerId?: string | null;
}

/** Pending config written to AsyncStorage before the API call */
interface PendingConfig {
  habitId: string;
  opts: ConfigureHabitOpts;
  savedAt: number;
}

/**
 * Storage key is SCOPED BY USER so configs from one account can never
 * bleed into another account on the same device.
 */
function pendingConfigsKey(userId: string | number): string {
  return `habits_pending_configs_v1:${userId}`;
}

async function readPendingConfigs(userId: string | number): Promise<PendingConfig[]> {
  try {
    const raw = await AsyncStorage.getItem(pendingConfigsKey(userId));
    return raw ? (JSON.parse(raw) as PendingConfig[]) : [];
  } catch {
    return [];
  }
}

async function writePendingConfigs(userId: string | number, configs: PendingConfig[]): Promise<void> {
  try {
    await AsyncStorage.setItem(pendingConfigsKey(userId), JSON.stringify(configs));
  } catch {
    // silent — best effort
  }
}

async function removePendingConfig(userId: string | number, habitId: string): Promise<void> {
  const existing = await readPendingConfigs(userId);
  await writePendingConfigs(userId, existing.filter(c => c.habitId !== habitId));
}

interface HabitsContextValue {
  /** Full catalogue merged with per-user enabled/completed state */
  allHabitsState: UserHabit[];
  /** Convenience: only habits where isEnabled === true */
  userHabits: UserHabit[];
  todayFuel: DailyFuel | null;
  recentFuel: DailyFuel[];
  nudge: string | null;
  isLoading: boolean;
  /** Non-null when a pending journey config failed to sync to the server after a boot-time retry */
  configSyncError: string | null;
  dismissConfigSyncError: () => void;
  /** Nudges received from co-op partners in the last 24h */
  incomingNudges: IncomingNudge[];
  dismissIncomingNudge: (habitId: string) => void;
  toggleHabit: (habitId: string) => Promise<void>;
  addHabit: (habitId: string) => Promise<void>;
  removeHabit: (habitId: string) => Promise<void>;
  completeHabit: (habitId: string) => Promise<DualCompleteResult>;
  uncompleteHabit: (habitId: string) => Promise<void>;
  setCoOp: (habitId: string, isCoOp: boolean, partnerId: string | null) => Promise<void>;
  configureHabit: (habitId: string, opts: ConfigureHabitOpts) => Promise<{ success: boolean; error?: string }>;
  saveDailyFuel: (fuel: DailyFuel) => Promise<string | null>;
  dismissNudge: () => void;
  nudgePartner: (habitId: string) => Promise<{ success: boolean; rateLimited?: boolean }>;
  setPillarVisibility: (habitId: string, visibility: Record<string, boolean>) => Promise<void>;
  refresh: () => Promise<void>;
  habitsByBlock: (block: TimeBlock) => UserHabit[];
  completedCountToday: number;
  enabledCount: number;
}

const HabitsContext = createContext<HabitsContextValue | null>(null);

async function authedFetch(path: string): Promise<Response | null> {
  try {
    const baseUrl = getApiUrl();
    const token = await getAuthToken();
    const headers: Record<string, string> = token ? { Authorization: `Bearer ${token}` } : {};
    const res = await fetch(new URL(path, baseUrl).toString(), { credentials: 'include', headers });
    return res;
  } catch {
    return null;
  }
}

/** Merge HABITS catalogue with server-returned user prefs/completions */
function mergeHabits(serverHabits: {
  habitId: string;
  isEnabled: boolean;
  completedToday: boolean;
  isCoOp?: boolean;
  partnerId?: string | null;
  partnerName?: string | null;
  journeyStartDate?: string | null;
  journeyTargetDays?: number | null;
  habitStatus?: string;
  notifyEnabled?: boolean;
  journeyCompletionCount?: number | null;
  pillarVisibility?: Record<string, boolean>;
}[]): UserHabit[] {
  const prefMap = new Map(serverHabits.map(h => [h.habitId, h]));
  return HABITS.map(h => {
    const pref = prefMap.get(h.habitId);
    return {
      ...h,
      isEnabled: pref?.isEnabled ?? false,
      completedToday: pref?.completedToday ?? false,
      isCoOp: pref?.isCoOp ?? false,
      partnerId: pref?.partnerId ?? null,
      partnerName: pref?.partnerName ?? null,
      journeyStartDate: pref?.journeyStartDate ?? null,
      journeyTargetDays: pref?.journeyTargetDays ?? null,
      habitStatus: (pref?.habitStatus as 'active' | 'maintained') ?? 'active',
      notifyEnabled: pref?.notifyEnabled ?? true,
      journeyCompletionCount: pref?.journeyCompletionCount ?? null,
      pillarVisibility: (pref?.pillarVisibility as Record<string, boolean>) ?? {},
    };
  });
}

/** Apply a pending config optimistically to in-memory habits state */
function applyPendingConfig(habits: UserHabit[], habitId: string, opts: ConfigureHabitOpts): UserHabit[] {
  return habits.map(h => {
    if (h.habitId !== habitId) return h;
    return {
      ...h,
      isEnabled: true,
      journeyTargetDays: opts.journeyTargetDays ?? h.journeyTargetDays,
      isCoOp: opts.isCoOp ?? h.isCoOp,
      partnerId: opts.isCoOp ? (opts.partnerId ?? h.partnerId) : null,
      journeyStartDate: h.journeyStartDate ?? new Date().toISOString().slice(0, 10),
    };
  });
}

const BLANK_HABITS = (): UserHabit[] =>
  HABITS.map(h => ({
    ...h,
    isEnabled: false,
    completedToday: false,
    isCoOp: false,
    partnerId: null,
    partnerName: null,
    journeyStartDate: null,
    journeyTargetDays: null,
    habitStatus: 'active' as const,
    notifyEnabled: true,
    journeyCompletionCount: null,
    pillarVisibility: {} as Record<string, boolean>,
  }));

export function HabitsProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const [allHabitsState, setAllHabitsState] = useState<UserHabit[]>(BLANK_HABITS);
  const [todayFuel, setTodayFuel] = useState<DailyFuel | null>(null);
  const [recentFuel, setRecentFuel] = useState<DailyFuel[]>([]);
  const [nudge, setNudge] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [configSyncError, setConfigSyncError] = useState<string | null>(null);
  const [incomingNudges, setIncomingNudges] = useState<IncomingNudge[]>([]);
  /** Track which nudges have been dismissed this session (by habitId) */
  const dismissedNudgeIds = useRef<Set<string>>(new Set());

  const userId = user?.id;

  const dismissConfigSyncError = useCallback(() => setConfigSyncError(null), []);

  const refresh = useCallback(async () => {
    if (!userId) {
      setAllHabitsState(BLANK_HABITS());
      setTodayFuel(null);
      setRecentFuel([]);
      return;
    }
    setIsLoading(true);
    try {
      const [myRes, fuelRes] = await Promise.all([
        authedFetch('/api/habits/my'),
        authedFetch('/api/daily-fuel'),
      ]);

      if (myRes?.ok) {
        const data = await myRes.json();
        const serverHabits = mergeHabits(data);

        // ── Reconcile pending configs (scoped to this user) ────────────────
        const pending = await readPendingConfigs(userId);
        if (pending.length > 0) {
          let updated = serverHabits;
          const retryErrors: string[] = [];

          await Promise.all(pending.map(async (pc) => {
            const serverHabit = serverHabits.find(h => h.habitId === pc.habitId);

            // Server already reflects this journey config — clear it
            if (
              serverHabit?.journeyStartDate !== null &&
              serverHabit?.journeyTargetDays === pc.opts.journeyTargetDays
            ) {
              await removePendingConfig(userId, pc.habitId);
              return;
            }

            // Server doesn't have it yet — retry
            try {
              const res = await apiRequest('PATCH', `/api/habits/${pc.habitId}/configure`, pc.opts);
              const resData = await res.json();

              if (res.ok && resData.success) {
                // Confirmed — apply server values and remove pending entry
                updated = updated.map(h =>
                  h.habitId === pc.habitId
                    ? {
                        ...h,
                        isEnabled: true,
                        isCoOp: resData.isCoOp ?? h.isCoOp,
                        partnerId: resData.partnerId ?? h.partnerId,
                        partnerName: resData.partnerName ?? h.partnerName,
                        journeyStartDate: resData.journeyStartDate ?? h.journeyStartDate,
                        journeyTargetDays: resData.journeyTargetDays ?? h.journeyTargetDays,
                        habitStatus: (resData.habitStatus as 'active' | 'maintained') ?? h.habitStatus,
                        notifyEnabled: resData.notifyEnabled ?? h.notifyEnabled,
                      }
                    : h
                );
                await removePendingConfig(userId, pc.habitId);
              } else if (res.status >= 400 && res.status < 500) {
                // 4xx validation/business-rule failure — do NOT retry forever
                // Roll back optimistic state and discard the pending entry
                updated = updated.map(h =>
                  h.habitId === pc.habitId
                    ? { ...h, journeyStartDate: null, journeyTargetDays: null, isEnabled: h.isEnabled }
                    : h
                );
                await removePendingConfig(userId, pc.habitId);
                retryErrors.push(pc.habitId);
              } else {
                // 5xx or server unreachable — keep pending, apply optimistic state
                updated = applyPendingConfig(updated, pc.habitId, pc.opts);
                retryErrors.push(pc.habitId);
              }
            } catch {
              // Network failure — keep pending, apply optimistic state
              updated = applyPendingConfig(updated, pc.habitId, pc.opts);
              retryErrors.push(pc.habitId);
            }
          }));

          setAllHabitsState(updated);

          if (retryErrors.length > 0) {
            setConfigSyncError(
              `Journey config for ${retryErrors.length} habit${retryErrors.length > 1 ? 's' : ''} couldn't sync — check your connection`
            );
          }
        } else {
          setAllHabitsState(serverHabits);
        }
      }

      if (fuelRes?.ok) {
        const data = await fuelRes.json();
        if (data.today) setTodayFuel(data.today);
        if (data.recent) setRecentFuel(data.recent);
      }

      // Fetch incoming nudges from co-op partners
      const nudgesRes = await authedFetch('/api/habits/nudges');
      if (nudgesRes?.ok) {
        const nudgesData: Array<{ habitId: string; senderName: string; sentAt: string }> = await nudgesRes.json();
        setIncomingNudges(
          nudgesData.filter(n => !dismissedNudgeIds.current.has(n.habitId))
        );
      }
    } catch (e) {
      __DEV__ && console.error('[HabitsContext] refresh error:', e);
    } finally {
      setIsLoading(false);
    }
  }, [userId]);

  useEffect(() => {
    if (userId) {
      refresh();
    } else {
      setAllHabitsState(BLANK_HABITS());
      setTodayFuel(null);
      setRecentFuel([]);
      setNudge(null);
      setIncomingNudges([]);
      dismissedNudgeIds.current = new Set();
      // Clear any sync error when logging out so the next user starts clean
      setConfigSyncError(null);
    }
  }, [userId]);

  const toggleHabit = useCallback(async (habitId: string) => {
    const habit = allHabitsState.find(h => h.habitId === habitId);
    if (!habit) return;
    const willEnable = !habit.isEnabled;
    if (willEnable) {
      const blockCount = allHabitsState.filter(
        h => h.timeBlock === habit.timeBlock && h.isEnabled
      ).length;
      if (blockCount >= TIMEBLOCK_HABIT_LIMIT) {
        Alert.alert(
          'Time block limit reached',
          `You can only enable ${TIMEBLOCK_HABIT_LIMIT} habits per time block. You already have ${TIMEBLOCK_HABIT_LIMIT} ${habit.timeBlock} habits.`
        );
        return;
      }
      const pillarCount = allHabitsState.filter(
        h => h.timeBlock === habit.timeBlock && h.pillar === habit.pillar && h.isEnabled
      ).length;
      if (pillarCount >= PILLAR_HABIT_LIMIT) {
        Alert.alert(
          'Pillar limit reached',
          `You can only add ${PILLAR_HABIT_LIMIT} ${habit.pillar} habits per time block. You already have ${PILLAR_HABIT_LIMIT} in ${habit.timeBlock}.`
        );
        return;
      }
    }
    setAllHabitsState(prev => prev.map(h =>
      h.habitId === habitId ? { ...h, isEnabled: !h.isEnabled } : h
    ));
    try {
      const res = await apiRequest('PUT', `/api/habits/${habitId}/toggle`, {});
      const data = await res.json();
      if (data && data.success === false) {
        setAllHabitsState(prev => prev.map(h =>
          h.habitId === habitId ? { ...h, isEnabled: !willEnable } : h
        ));
        if (data.message) {
          Alert.alert(
            data.pillar ? 'Pillar limit reached' : 'Time block limit reached',
            data.message
          );
        }
      }
    } catch (e) {
      setAllHabitsState(prev => prev.map(h =>
        h.habitId === habitId ? { ...h, isEnabled: !h.isEnabled } : h
      ));
      __DEV__ && console.error('[HabitsContext] toggleHabit error:', e);
    }
  }, [allHabitsState]);

  const addHabit = useCallback(async (habitId: string) => {
    const habit = allHabitsState.find(h => h.habitId === habitId);
    if (!habit) return;
    const blockCount = allHabitsState.filter(
      h => h.timeBlock === habit.timeBlock && h.isEnabled
    ).length;
    if (blockCount >= TIMEBLOCK_HABIT_LIMIT) {
      Alert.alert(
        'Time block limit reached',
        `You can only enable ${TIMEBLOCK_HABIT_LIMIT} habits per time block. You already have ${TIMEBLOCK_HABIT_LIMIT} ${habit.timeBlock} habits.`
      );
      return;
    }
    const pillarCount = allHabitsState.filter(
      h => h.timeBlock === habit.timeBlock && h.pillar === habit.pillar && h.isEnabled
    ).length;
    if (pillarCount >= PILLAR_HABIT_LIMIT) {
      Alert.alert(
        'Pillar limit reached',
        `You can only add ${PILLAR_HABIT_LIMIT} ${habit.pillar} habits per time block. You already have ${PILLAR_HABIT_LIMIT} in ${habit.timeBlock}.`
      );
      return;
    }
    setAllHabitsState(prev => prev.map(h =>
      h.habitId === habitId ? { ...h, isEnabled: true } : h
    ));
    try {
      const res = await apiRequest('POST', `/api/habits/${habitId}/add`, {});
      const data = await res.json();
      if (data && data.success === false) {
        setAllHabitsState(prev => prev.map(h =>
          h.habitId === habitId ? { ...h, isEnabled: false } : h
        ));
        if (data.message) {
          Alert.alert(
            data.pillar ? 'Pillar limit reached' : 'Time block limit reached',
            data.message
          );
        }
      }
    } catch (e) {
      setAllHabitsState(prev => prev.map(h =>
        h.habitId === habitId ? { ...h, isEnabled: false } : h
      ));
      __DEV__ && console.error('[HabitsContext] addHabit error:', e);
    }
  }, [allHabitsState]);

  const removeHabit = useCallback(async (habitId: string) => {
    setAllHabitsState(prev => prev.map(h =>
      h.habitId === habitId ? { ...h, isEnabled: false } : h
    ));
    try {
      await apiRequest('DELETE', `/api/habits/${habitId}/add`);
    } catch (e) {
      setAllHabitsState(prev => prev.map(h =>
        h.habitId === habitId ? { ...h, isEnabled: true } : h
      ));
      __DEV__ && console.error('[HabitsContext] removeHabit error:', e);
    }
  }, []);

  const completeHabit = useCallback(async (habitId: string): Promise<DualCompleteResult> => {
    setAllHabitsState(prev => prev.map(h => {
      if (h.habitId !== habitId) return h;
      const nextCount = h.journeyTargetDays
        ? Math.min((h.journeyCompletionCount ?? 0) + 1, h.journeyTargetDays)
        : h.journeyCompletionCount;
      return { ...h, completedToday: true, journeyCompletionCount: nextCount };
    }));
    try {
      const res = await apiRequest('POST', `/api/habits/${habitId}/complete`, {});
      const data = await res.json();
      const mastered = data.habitMastered ?? false;
      if (mastered) {
        setAllHabitsState(prev => prev.map(h =>
          h.habitId === habitId ? { ...h, habitStatus: 'maintained' } : h
        ));
      }
      return {
        dualComplete: data.dualComplete ?? false,
        partnerName: data.partnerName ?? '',
        habitMastered: mastered,
      };
    } catch (e) {
      setAllHabitsState(prev => prev.map(h =>
        h.habitId === habitId ? { ...h, completedToday: false } : h
      ));
      return { dualComplete: false, partnerName: '', habitMastered: false };
    }
  }, []);

  const uncompleteHabit = useCallback(async (habitId: string) => {
    setAllHabitsState(prev => prev.map(h => {
      if (h.habitId !== habitId) return h;
      const nextCount = h.journeyTargetDays
        ? Math.max((h.journeyCompletionCount ?? 0) - 1, 0)
        : h.journeyCompletionCount;
      return { ...h, completedToday: false, journeyCompletionCount: nextCount };
    }));
    try {
      await apiRequest('DELETE', `/api/habits/${habitId}/complete`);
    } catch (e) {
      setAllHabitsState(prev => prev.map(h =>
        h.habitId === habitId ? { ...h, completedToday: true } : h
      ));
    }
  }, []);

  const setCoOp = useCallback(async (habitId: string, isCoOp: boolean, partnerId: string | null) => {
    setAllHabitsState(prev => prev.map(h =>
      h.habitId === habitId ? { ...h, isCoOp, partnerId } : h
    ));
    try {
      const res = await apiRequest('PUT', `/api/habits/${habitId}/coop`, { isCoOp, partnerId });
      const data = await res.json();
      setAllHabitsState(prev => prev.map(h =>
        h.habitId === habitId
          ? { ...h, isCoOp: data.isCoOp, partnerId: data.partnerId, partnerName: data.partnerName }
          : h
      ));
    } catch (e) {
      setAllHabitsState(prev => prev.map(h =>
        h.habitId === habitId ? { ...h, isCoOp: !isCoOp, partnerId: null } : h
      ));
      __DEV__ && console.error('[HabitsContext] setCoOp error:', e);
    }
  }, []);

  const configureHabit = useCallback(async (habitId: string, opts: ConfigureHabitOpts): Promise<{ success: boolean; error?: string }> => {
    if (!userId) return { success: false, error: 'Not authenticated' };

    const habit = allHabitsState.find(h => h.habitId === habitId);
    if (habit && !habit.isEnabled) {
      const blockCount = allHabitsState.filter(
        h => h.timeBlock === habit.timeBlock && h.isEnabled
      ).length;
      if (blockCount >= TIMEBLOCK_HABIT_LIMIT) {
        Alert.alert(
          'Time block limit reached',
          `You can only enable ${TIMEBLOCK_HABIT_LIMIT} habits per time block. You already have ${TIMEBLOCK_HABIT_LIMIT} ${habit.timeBlock} habits.`
        );
        return { success: false, error: 'Time block limit reached' };
      }
      const pillarCount = allHabitsState.filter(
        h => h.timeBlock === habit.timeBlock && h.pillar === habit.pillar && h.isEnabled
      ).length;
      if (pillarCount >= PILLAR_HABIT_LIMIT) {
        Alert.alert(
          'Pillar limit reached',
          `You can only add ${PILLAR_HABIT_LIMIT} ${habit.pillar} habits per time block. You already have ${PILLAR_HABIT_LIMIT} in ${habit.timeBlock}.`
        );
        return { success: false, error: 'Pillar limit reached' };
      }
    }

    // 1. Persist to AsyncStorage (scoped by userId) before the API call
    //    so a force-close cannot lose the config.
    const pending = await readPendingConfigs(userId);
    const newPending: PendingConfig[] = [
      ...pending.filter(c => c.habitId !== habitId),
      { habitId, opts, savedAt: Date.now() },
    ];
    await writePendingConfigs(userId, newPending);

    // 2. Apply optimistic state so the UI reflects the change immediately
    setAllHabitsState(prev => applyPendingConfig(prev, habitId, opts));

    // 3. Send to server
    try {
      const res = await apiRequest('PATCH', `/api/habits/${habitId}/configure`, opts);
      const data = await res.json();

      if (!res.ok) {
        if (res.status >= 400 && res.status < 500) {
          // Validation / business-rule failure — discard pending, revert optimistic state
          await removePendingConfig(userId, habitId);
          setAllHabitsState(prev => prev.map(h =>
            h.habitId === habitId
              ? { ...h, journeyStartDate: null, journeyTargetDays: null }
              : h
          ));
        }
        // For 5xx we keep the pending entry so boot reconciliation can retry
        return { success: false, error: data.message ?? 'Failed to save journey config' };
      }

      if (data.success) {
        // Server confirmed — remove the pending entry and apply server response
        await removePendingConfig(userId, habitId);
        setAllHabitsState(prev => prev.map(h =>
          h.habitId === habitId
            ? {
                ...h,
                isEnabled: true,
                isCoOp: data.isCoOp ?? h.isCoOp,
                partnerId: data.partnerId ?? h.partnerId,
                partnerName: data.partnerName ?? h.partnerName,
                journeyStartDate: data.journeyStartDate ?? h.journeyStartDate,
                journeyTargetDays: data.journeyTargetDays ?? h.journeyTargetDays,
                habitStatus: (data.habitStatus as 'active' | 'maintained') ?? h.habitStatus,
                notifyEnabled: data.notifyEnabled ?? h.notifyEnabled,
              }
            : h
        ));
        return { success: true };
      }

      return { success: false, error: 'Unexpected server response' };
    } catch (e) {
      __DEV__ && console.error('[HabitsContext] configureHabit error:', e);
      // Network failure — pending entry already written, optimistic UI is up
      return { success: false, error: 'Saved locally — will sync when connection is restored' };
    }
  }, [userId]);

  const saveDailyFuel = useCallback(async (fuel: DailyFuel): Promise<string | null> => {
    try {
      const res = await apiRequest('POST', '/api/daily-fuel', fuel);
      const data = await res.json();
      setTodayFuel(fuel);
      if (data.nudge) {
        setNudge(data.nudge);
        return data.nudge;
      }
      setNudge(null);
      return null;
    } catch (e) {
      __DEV__ && console.error('[HabitsContext] saveDailyFuel error:', e);
      return null;
    }
  }, []);

  const dismissNudge = useCallback(() => setNudge(null), []);

  const dismissIncomingNudge = useCallback((habitId: string) => {
    dismissedNudgeIds.current.add(habitId);
    setIncomingNudges(prev => prev.filter(n => n.habitId !== habitId));
  }, []);

  const nudgePartner = useCallback(async (habitId: string): Promise<{ success: boolean; rateLimited?: boolean }> => {
    try {
      const res = await apiRequest('POST', `/api/habits/${habitId}/nudge`, {});
      if (res.status === 429) return { success: false, rateLimited: true };
      if (!res.ok) return { success: false };
      return { success: true };
    } catch {
      return { success: false };
    }
  }, []);

  const setPillarVisibility = useCallback(async (habitId: string, visibility: Record<string, boolean>) => {
    setAllHabitsState(prev => prev.map(h =>
      h.habitId === habitId ? { ...h, pillarVisibility: visibility } : h
    ));
    try {
      await apiRequest('PUT', `/api/habits/${habitId}/pillar-visibility`, { visibility });
    } catch (e) {
      __DEV__ && console.error('[HabitsContext] setPillarVisibility error:', e);
    }
  }, []);

  const habitsByBlock = useCallback(
    (block: TimeBlock) => allHabitsState.filter(h => h.timeBlock === block),
    [allHabitsState]
  );

  const userHabits = allHabitsState.filter(h => h.isEnabled);
  const completedCountToday = allHabitsState.filter(h => h.isEnabled && h.completedToday).length;
  const enabledCount = allHabitsState.filter(h => h.isEnabled).length;

  const value: HabitsContextValue = {
    allHabitsState,
    userHabits,
    todayFuel,
    recentFuel,
    nudge,
    isLoading,
    configSyncError,
    dismissConfigSyncError,
    incomingNudges,
    dismissIncomingNudge,
    toggleHabit,
    addHabit,
    removeHabit,
    completeHabit,
    uncompleteHabit,
    setCoOp,
    configureHabit,
    saveDailyFuel,
    dismissNudge,
    nudgePartner,
    setPillarVisibility,
    refresh,
    habitsByBlock,
    completedCountToday,
    enabledCount,
  };

  return <HabitsContext.Provider value={value}>{children}</HabitsContext.Provider>;
}

export function useHabits(): HabitsContextValue {
  const ctx = useContext(HabitsContext);
  if (!ctx) throw new Error('useHabits must be used within HabitsProvider');
  return ctx;
}
