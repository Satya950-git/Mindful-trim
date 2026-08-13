import React, { createContext, useContext, useEffect, useRef, useState, useCallback, ReactNode } from 'react';
import { AppState } from 'react-native';
import { useAuth } from './AuthContext';
import { apiRequest } from '@/lib/query-client';

const POLL_INTERVAL_MS = 20000;

type FriendEntry = { friendshipId: string; userId: string; name: string; createdAt: string };
type FriendsSnapshot = { accepted: FriendEntry[]; pending: FriendEntry[]; outgoing: FriendEntry[] };
type CoopGroup = { id: string; name: string; myStatus: 'active' | 'pending'; creatorName: string };

export type FriendToast =
  | { id: string; kind: 'received' | 'accepted'; name: string }
  | { id: string; kind: 'group-invite'; name: string; groupName: string };

interface FriendActivityContextValue {
  pendingCount: number;
  toast: FriendToast | null;
  dismissToast: () => void;
  refresh: () => Promise<void>;
}

const FriendActivityContext = createContext<FriendActivityContextValue | null>(null);

export function FriendActivityProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const userId = user?.id;

  const [pendingCount, setPendingCount] = useState(0);
  const [toast, setToast] = useState<FriendToast | null>(null);
  const seenPendingIds = useRef<Set<string> | null>(null);
  const seenOutgoingIds = useRef<Set<string> | null>(null);
  const seenCoopInviteIds = useRef<Set<string> | null>(null);
  const toastQueue = useRef<FriendToast[]>([]);

  const enqueueToast = useCallback((t: FriendToast) => {
    toastQueue.current.push(t);
    setToast(prev => (prev ? prev : toastQueue.current.shift() ?? null));
  }, []);

  const dismissToast = useCallback(() => {
    setToast(toastQueue.current.shift() ?? null);
  }, []);

  const poll = useCallback(async () => {
    if (!userId) return;
    try {
      const [friendsRes, coopRes] = await Promise.all([
        apiRequest('GET', '/api/friends'),
        apiRequest('GET', '/api/coop'),
      ]);

      // ── Friend requests ──────────────────────────────────────────────────
      if (friendsRes.ok) {
        const data: FriendsSnapshot = await friendsRes.json();
        const pending = data.pending ?? [];
        const outgoing = data.outgoing ?? [];

        setPendingCount(pending.length);

        const currentPendingIds = new Set(pending.map(p => p.friendshipId));
        const currentOutgoingIds = new Set(outgoing.map(o => o.friendshipId));

        if (seenPendingIds.current === null) {
          seenPendingIds.current = currentPendingIds;
          seenOutgoingIds.current = currentOutgoingIds;
        } else {
          for (const p of pending) {
            if (!seenPendingIds.current.has(p.friendshipId)) {
              enqueueToast({ id: `recv-${p.friendshipId}`, kind: 'received', name: p.name });
            }
          }
          for (const o of seenOutgoingIds.current) {
            if (!currentOutgoingIds.has(o)) {
              const wasAccepted = data.accepted.some(a => a.friendshipId === o);
              if (wasAccepted) {
                const match = data.accepted.find(a => a.friendshipId === o)!;
                enqueueToast({ id: `acc-${o}`, kind: 'accepted', name: match.name });
              }
            }
          }
          seenPendingIds.current = currentPendingIds;
          seenOutgoingIds.current = currentOutgoingIds;
        }
      }

      // ── Group invitations ────────────────────────────────────────────────
      if (coopRes.ok) {
        const groups: CoopGroup[] = await coopRes.json();
        const pendingGroups = groups.filter(g => g.myStatus === 'pending');
        const currentCoopIds = new Set(pendingGroups.map(g => g.id));

        if (seenCoopInviteIds.current === null) {
          // Baseline — don't toast for existing invitations on first load
          seenCoopInviteIds.current = currentCoopIds;
        } else {
          for (const g of pendingGroups) {
            if (!seenCoopInviteIds.current.has(g.id)) {
              enqueueToast({ id: `grp-${g.id}`, kind: 'group-invite', name: g.creatorName, groupName: g.name });
            }
          }
          seenCoopInviteIds.current = currentCoopIds;
        }
      }
    } catch {
      // silent — best effort, next poll will retry
    }
  }, [userId, enqueueToast]);

  const refresh = useCallback(async () => {
    await poll();
  }, [poll]);

  useEffect(() => {
    if (!userId) {
      seenPendingIds.current = null;
      seenOutgoingIds.current = null;
      seenCoopInviteIds.current = null;
      toastQueue.current = [];
      setToast(null);
      setPendingCount(0);
      return;
    }

    seenPendingIds.current = null;
    seenOutgoingIds.current = null;
    seenCoopInviteIds.current = null;
    poll();

    const interval = setInterval(poll, POLL_INTERVAL_MS);
    const sub = AppState.addEventListener('change', nextState => {
      if (nextState === 'active') poll();
    });

    return () => {
      clearInterval(interval);
      sub.remove();
    };
  }, [userId, poll]);

  return (
    <FriendActivityContext.Provider value={{ pendingCount, toast, dismissToast, refresh }}>
      {children}
    </FriendActivityContext.Provider>
  );
}

export function useFriendActivity(): FriendActivityContextValue {
  const ctx = useContext(FriendActivityContext);
  if (!ctx) throw new Error('useFriendActivity must be used within FriendActivityProvider');
  return ctx;
}
