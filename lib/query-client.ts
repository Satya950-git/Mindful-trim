import { QueryClient, QueryFunction } from "@tanstack/react-query";
import * as SecureStore from "expo-secure-store";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { Platform } from "react-native";

const TOKEN_KEY = "auth_token";
// AsyncStorage key — separate namespace so it doesn't clash with cached profile keys
const ASYNC_TOKEN_KEY = "auth_token_v2";

/**
 * Token storage strategy:
 * - Web: localStorage
 * - Native: AsyncStorage (primary, always reliable) + SecureStore (best-effort extra security)
 *
 * SecureStore can fail silently on some Expo Go / OS configurations.
 * AsyncStorage is the source-of-truth for native; SecureStore is opportunistic.
 */
export async function getAuthToken(): Promise<string | null> {
  try {
    if (Platform.OS === "web") {
      return localStorage.getItem(TOKEN_KEY);
    }
    // Try AsyncStorage first (primary)
    const asyncToken = await AsyncStorage.getItem(ASYNC_TOKEN_KEY);
    if (asyncToken) return asyncToken;

    // Fall back to SecureStore in case the user has an older token stored there
    try {
      const secureToken = await SecureStore.getItemAsync(TOKEN_KEY);
      if (secureToken) {
        // Migrate: write to AsyncStorage so future reads are reliable
        await AsyncStorage.setItem(ASYNC_TOKEN_KEY, secureToken);
        return secureToken;
      }
    } catch {
      // SecureStore unavailable — that's fine, AsyncStorage is primary
    }
    return null;
  } catch {
    return null;
  }
}

export async function setAuthToken(token: string): Promise<void> {
  try {
    if (Platform.OS === "web") {
      localStorage.setItem(TOKEN_KEY, token);
      return;
    }
    // Primary: AsyncStorage
    await AsyncStorage.setItem(ASYNC_TOKEN_KEY, token);
    // Best-effort: also write to SecureStore for extra security where supported
    try {
      await SecureStore.setItemAsync(TOKEN_KEY, token);
    } catch {
      // SecureStore failure is non-fatal; AsyncStorage already has it
    }
  } catch {
    // ignore storage errors
  }
}

export async function clearAuthToken(): Promise<void> {
  try {
    if (Platform.OS === "web") {
      localStorage.removeItem(TOKEN_KEY);
      return;
    }
    await AsyncStorage.removeItem(ASYNC_TOKEN_KEY);
    try {
      await SecureStore.deleteItemAsync(TOKEN_KEY);
    } catch {
      // ignore
    }
  } catch {
    // ignore
  }
}

/**
 * Gets the base URL for the Express API server (e.g., "http://localhost:3000")
 * @returns {string} The API base URL
 */
export function getApiUrl(): string {
  let host = process.env.EXPO_PUBLIC_DOMAIN;

  if (!host) {
    throw new Error("EXPO_PUBLIC_DOMAIN is not set");
  }

  // Strip port if present — Replit's proxy routes via domain only (no port needed)
  const domainOnly = host.split(":")[0];

  return `https://${domainOnly}`;
}

let _onUnauthorized: (() => void) | null = null;

export function setUnauthorizedHandler(handler: () => void) {
  _onUnauthorized = handler;
}

async function throwIfResNotOk(res: Response) {
  if (!res.ok) {
    if (res.status === 401) {
      _onUnauthorized?.();
    }
    const text = (await res.text()) || res.statusText;
    throw new Error(`${res.status}: ${text}`);
  }
}

export async function apiRequest(
  method: string,
  route: string,
  data?: unknown | undefined,
): Promise<Response> {
  const baseUrl = getApiUrl();
  const url = new URL(route, baseUrl);

  const headers: Record<string, string> = {};
  if (data) headers["Content-Type"] = "application/json";

  const token = await getAuthToken();
  if (token) headers["Authorization"] = `Bearer ${token}`;

  const res = await fetch(url.toString(), {
    method,
    headers,
    body: data ? JSON.stringify(data) : undefined,
    credentials: "include",
  });

  await throwIfResNotOk(res);
  return res;
}

type UnauthorizedBehavior = "returnNull" | "throw";
export const getQueryFn: <T>(options: {
  on401: UnauthorizedBehavior;
}) => QueryFunction<T> =
  ({ on401: unauthorizedBehavior }) =>
  async ({ queryKey }) => {
    const baseUrl = getApiUrl();
    const url = new URL(queryKey.join("/") as string, baseUrl);

    const headers: Record<string, string> = {};
    const token = await getAuthToken();
    if (token) headers["Authorization"] = `Bearer ${token}`;

    const res = await fetch(url.toString(), {
      credentials: "include",
      headers,
    });

    if (unauthorizedBehavior === "returnNull" && res.status === 401) {
      return null;
    }

    await throwIfResNotOk(res);
    return await res.json();
  };

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      queryFn: getQueryFn({ on401: "throw" }),
      refetchInterval: false,
      refetchOnWindowFocus: false,
      staleTime: Infinity,
      retry: false,
    },
    mutations: {
      retry: false,
    },
  },
});
