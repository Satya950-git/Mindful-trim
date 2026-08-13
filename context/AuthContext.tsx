import React, { createContext, useContext, useState, useEffect, useMemo, ReactNode } from 'react';
import { Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as SecureStore from 'expo-secure-store';
import { router } from 'expo-router';
import { apiRequest, getApiUrl, setUnauthorizedHandler, getAuthToken, setAuthToken, clearAuthToken } from '@/lib/query-client';

function deviceTokenKey(email: string): string {
  return `device_token_${email.toLowerCase().replace(/@/g, '_at_').replace(/\./g, '_')}`;
}

async function getStoredDeviceToken(email: string): Promise<string | null> {
  try {
    if (Platform.OS === 'web') {
      return localStorage.getItem(deviceTokenKey(email));
    }
    return await SecureStore.getItemAsync(deviceTokenKey(email));
  } catch { return null; }
}

async function storeDeviceToken(email: string, token: string): Promise<void> {
  try {
    if (Platform.OS === 'web') {
      localStorage.setItem(deviceTokenKey(email), token);
    } else {
      await SecureStore.setItemAsync(deviceTokenKey(email), token);
    }
  } catch {}
}

async function clearDeviceToken(email: string): Promise<void> {
  try {
    if (Platform.OS === 'web') {
      localStorage.removeItem(deviceTokenKey(email));
    } else {
      await SecureStore.deleteItemAsync(deviceTokenKey(email));
    }
  } catch {}
}

const CACHED_PROFILE_KEY = 'cached_user_profile';

async function getCachedProfile(): Promise<UserProfile | null> {
  try {
    const raw = Platform.OS === 'web'
      ? localStorage.getItem(CACHED_PROFILE_KEY)
      : await AsyncStorage.getItem(CACHED_PROFILE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch { return null; }
}

async function setCachedProfile(profile: UserProfile): Promise<void> {
  try {
    const raw = JSON.stringify(profile);
    if (Platform.OS === 'web') {
      localStorage.setItem(CACHED_PROFILE_KEY, raw);
    } else {
      await AsyncStorage.setItem(CACHED_PROFILE_KEY, raw);
    }
  } catch {}
}

async function clearCachedProfile(): Promise<void> {
  try {
    if (Platform.OS === 'web') {
      localStorage.removeItem(CACHED_PROFILE_KEY);
    } else {
      await AsyncStorage.removeItem(CACHED_PROFILE_KEY);
    }
  } catch {}
}

export interface UserProfile {
  id: string;
  email: string;
  identity: string;
  uniqueTag: string | null;
  gender: string;
  tonePreference: string;
  compass: string;
  isOnboarded: boolean;
  profilePhoto: string;
  countryCode: string | null;
  phoneNumber: string | null;
  whatsappOptIn: boolean;
  isTwoFactorEnabled: boolean;
}

interface AuthContextValue {
  user: UserProfile | null;
  isLoading: boolean;
  isOnboarded: boolean;
  login: (email: string, password: string) => Promise<{ success: boolean; emailNotFound?: boolean; twoFactorRequired?: boolean; userId?: string; email?: string }>;
  register: (email: string, password: string, phoneData?: { countryCode: string; phoneNumber: string; whatsappOptIn: boolean }) => Promise<{ success: boolean; message?: string; code?: string }>;
  logout: () => Promise<void>;
  resetPassword: (email: string, newPassword: string) => Promise<{ success: boolean; message: string }>;
  confirmPasswordReset: (email: string, otp: string, newPassword: string) => Promise<{ success: boolean; message: string }>;
  changePassword: (currentPassword: string, newPassword: string) => Promise<{ success: boolean; message: string; code?: string }>;
  getSecurityQuestion: (email: string) => Promise<{ success: boolean; question?: string; message: string }>;
  getMySecurityQuestion: () => Promise<{ success: boolean; question?: string; message: string }>;
  verifySecurityAnswer: (email: string, answer: string) => Promise<{ success: boolean; resetToken?: string; message: string; code?: string }>;
  setSecurityQuestion: (question: string, answer: string) => Promise<{ success: boolean; message: string }>;
  completeOnboarding: (data: { identity: string; gender: string }) => Promise<void>;
  updateProfile: (data: Partial<UserProfile>) => Promise<void>;
  updatePhone: (data: { countryCode: string | null; phoneNumber: string | null; whatsappOptIn: boolean }) => Promise<{ success: boolean; message?: string }>;
  deleteAccount: () => Promise<{ success: boolean; message: string }>;
  verifyLoginOtp: (userId: string, code: string, options?: { rememberDevice?: boolean; email?: string }) => Promise<{ success: boolean; reason?: string }>;
  resendLoginOtp: (userId: string) => Promise<{ success: boolean; message?: string }>;
  forgetDevice: () => Promise<{ success: boolean }>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<UserProfile | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const isOnboarded = user?.isOnboarded ?? false;

  useEffect(() => {
    setUnauthorizedHandler(() => {
      clearAuthToken();
      clearCachedProfile();
      setUser(null);
      router.replace('/login');
    });
    loadUser();
  }, []);

  async function loadUser() {
    // Load cached profile instantly so the app renders without waiting for the network
    const cached = await getCachedProfile();
    if (cached) {
      setUser(cached);
      setIsLoading(false);
    }

    // Validate (and refresh) in the background
    try {
      const token = await getAuthToken();
      if (!token && !cached) {
        setIsLoading(false);
        return;
      }

      const baseUrl = getApiUrl();
      const url = new URL('/api/auth/me', baseUrl);
      const headers: Record<string, string> = {};
      if (token) headers['Authorization'] = `Bearer ${token}`;

      const res = await fetch(url.toString(), {
        credentials: 'include',
        headers,
        signal: AbortSignal.timeout(15000),
      });

      if (res.ok) {
        const data = await res.json();
        // Server may return a fresh token for sliding-session refresh
        if (data.token) await setAuthToken(data.token);
        const profile: UserProfile = {
          id: data.id,
          email: data.email,
          identity: data.identity,
          uniqueTag: data.uniqueTag ?? null,
          gender: data.gender,
          tonePreference: data.tonePreference,
          compass: data.compass,
          isOnboarded: data.isOnboarded,
          profilePhoto: data.profilePhoto ?? '',
          countryCode: data.countryCode ?? null,
          phoneNumber: data.phoneNumber ?? null,
          whatsappOptIn: data.whatsappOptIn ?? false,
          isTwoFactorEnabled: data.isTwoFactorEnabled ?? false,
        };
        await setCachedProfile(profile);
        setUser(profile);
      } else if (res.status === 401) {
        // Genuine auth failure — clear everything and go to welcome
        await clearAuthToken();
        await clearCachedProfile();
        setUser(null);
      }
      // Any other error (5xx, network issue): keep the cached user as-is
    } catch {
      // Network failure or timeout: stay signed in using cached profile
    } finally {
      setIsLoading(false);
    }
  }

  async function register(
    email: string,
    password: string,
    phoneData?: { countryCode: string; phoneNumber: string; whatsappOptIn: boolean }
  ): Promise<{ success: boolean; message?: string; code?: string }> {
    try {
      const url = new URL('/api/auth/register', getApiUrl());
      const res = await fetch(url.toString(), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password, ...phoneData }),
        credentials: 'include',
      });
      const data = await res.json();
      if (!res.ok) return { success: false, message: data.message, code: data.code };
      if (data.token) await setAuthToken(data.token);
      await setCachedProfile(data);
      setUser(data);
      return { success: true };
    } catch (e) {
      __DEV__ && console.error('Register error:', e);
      return { success: false, message: 'Registration failed. Please try again.' };
    }
  }

  async function login(email: string, password: string): Promise<{ success: boolean; emailNotFound?: boolean; twoFactorRequired?: boolean; userId?: string; email?: string }> {
    try {
      const deviceToken = await getStoredDeviceToken(email);
      const url = new URL('/api/auth/login', getApiUrl());
      const res = await fetch(url.toString(), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password, ...(deviceToken ? { deviceToken } : {}) }),
        credentials: 'include',
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        return { success: false, emailNotFound: data.code === 'EMAIL_NOT_FOUND' };
      }
      const data = await res.json();
      if (data.twoFactorRequired) {
        return { success: false, twoFactorRequired: true, userId: data.userId, email: data.email };
      }
      if (data.token) await setAuthToken(data.token);
      const profile: UserProfile = {
        id: data.id,
        email: data.email,
        identity: data.identity,
        uniqueTag: data.uniqueTag ?? null,
        gender: data.gender,
        tonePreference: data.tonePreference,
        compass: data.compass,
        isOnboarded: data.isOnboarded,
        profilePhoto: data.profilePhoto ?? '',
        countryCode: data.countryCode ?? null,
        phoneNumber: data.phoneNumber ?? null,
        whatsappOptIn: data.whatsappOptIn ?? false,
        isTwoFactorEnabled: data.isTwoFactorEnabled ?? false,
      };
      await setCachedProfile(profile);
      setUser(profile);
      return { success: true };
    } catch (e) {
      __DEV__ && console.error('Login error:', e);
      return { success: false };
    }
  }

  async function verifyLoginOtp(userId: string, code: string, options?: { rememberDevice?: boolean; email?: string }): Promise<{ success: boolean; reason?: string }> {
    try {
      const url = new URL('/api/auth/2fa/verify', getApiUrl());
      const res = await fetch(url.toString(), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId, code, rememberDevice: options?.rememberDevice ?? false }),
        credentials: 'include',
      });
      const data = await res.json();
      if (!res.ok) return { success: false, reason: data.reason ?? 'invalid' };
      if (data.token) await setAuthToken(data.token);
      if (data.deviceToken && options?.email) {
        await storeDeviceToken(options.email, data.deviceToken);
      }
      const profile: UserProfile = {
        id: data.id,
        email: data.email,
        identity: data.identity,
        uniqueTag: data.uniqueTag ?? null,
        gender: data.gender,
        tonePreference: data.tonePreference,
        compass: data.compass,
        isOnboarded: data.isOnboarded,
        profilePhoto: data.profilePhoto ?? '',
        countryCode: data.countryCode ?? null,
        phoneNumber: data.phoneNumber ?? null,
        whatsappOptIn: data.whatsappOptIn ?? false,
        isTwoFactorEnabled: data.isTwoFactorEnabled ?? false,
      };
      await setCachedProfile(profile);
      setUser(profile);
      return { success: true };
    } catch (e) {
      __DEV__ && console.error('verifyLoginOtp error:', e);
      return { success: false, reason: 'invalid' };
    }
  }

  async function resendLoginOtp(userId: string): Promise<{ success: boolean; message?: string }> {
    try {
      const url = new URL('/api/auth/2fa/resend', getApiUrl());
      const res = await fetch(url.toString(), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        return { success: false, message: data.message };
      }
      return { success: true };
    } catch (e) {
      return { success: false, message: 'Failed to resend code.' };
    }
  }

  async function logout() {
    try {
      await apiRequest('POST', '/api/auth/logout');
    } catch (e) {
      // ignore
    }
    await clearAuthToken();
    await clearCachedProfile();
    setUser(null);
  }

  async function forgetDevice(): Promise<{ success: boolean }> {
    try {
      await apiRequest('DELETE', '/api/auth/trusted-devices/me');
      if (user?.email) await clearDeviceToken(user.email);
      return { success: true };
    } catch {
      return { success: false };
    }
  }

  async function resetPassword(email: string, newPassword: string): Promise<{ success: boolean; message: string }> {
    try {
      const res = await apiRequest('PUT', '/api/auth/reset-password', { email: email.toLowerCase(), newPassword });
      const data = await res.json();
      return { success: true, message: data.message };
    } catch (e: any) {
      const msg = e?.message?.includes('404') ? 'No account found with that email.' : 'Failed to reset password.';
      return { success: false, message: msg };
    }
  }

  async function getSecurityQuestion(email: string): Promise<{ success: boolean; question?: string; message: string }> {
    try {
      const url = new URL(`/api/auth/security-question/${encodeURIComponent(email.toLowerCase())}`, getApiUrl());
      const res = await fetch(url.toString());
      const data = await res.json();
      if (!res.ok || !data.question) {
        return { success: false, message: data.message || 'No account found with that email, or no security question set.' };
      }
      return { success: true, question: data.question, message: '' };
    } catch {
      return { success: false, message: 'Something went wrong. Please try again.' };
    }
  }

  async function getMySecurityQuestion(): Promise<{ success: boolean; question?: string; message: string }> {
    try {
      const res = await apiRequest('GET', '/api/auth/my-security-question');
      const data = await res.json();
      if (data.question) {
        return { success: true, question: data.question, message: '' };
      }
      return { success: false, message: 'No security question set.' };
    } catch {
      return { success: false, message: 'Something went wrong. Please try again.' };
    }
  }

  async function verifySecurityAnswer(email: string, answer: string): Promise<{ success: boolean; resetToken?: string; message: string; code?: string }> {
    try {
      const url = new URL('/api/auth/verify-security-answer', getApiUrl());
      const res = await fetch(url.toString(), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: email.toLowerCase(), answer }),
      });
      const data = await res.json();
      if (!res.ok || !data.resetToken) {
        return { success: false, message: '', code: 'WRONG_ANSWER' };
      }
      return { success: true, resetToken: data.resetToken, message: '' };
    } catch {
      return { success: false, message: '', code: 'GENERIC_ERROR' };
    }
  }

  async function confirmPasswordReset(email: string, otp: string, newPassword: string): Promise<{ success: boolean; message: string }> {
    try {
      const res = await apiRequest('POST', '/api/auth/confirm-reset-password', { email, otp, newPassword });
      const data = await res.json();
      if (!res.ok) return { success: false, message: data.message };
      return { success: true, message: data.message };
    } catch (e: any) {
      return { success: false, message: 'Failed to reset password.' };
    }
  }

  async function changePassword(currentPassword: string, newPassword: string): Promise<{ success: boolean; message: string; code?: string }> {
    try {
      const res = await apiRequest('PUT', '/api/auth/change-password', { currentPassword, newPassword });
      const data = await res.json();
      return { success: true, message: data.message };
    } catch (e: any) {
      const code = e?.message?.includes('400') ? 'WRONG_PASSWORD' : 'CHANGE_FAILED';
      return { success: false, message: '', code };
    }
  }

  async function setSecurityQuestion(question: string, answer: string): Promise<{ success: boolean; message: string }> {
    try {
      await apiRequest('PUT', '/api/auth/security-question', { question, answer });
      return { success: true, message: 'Security question saved.' };
    } catch (e: any) {
      const raw: string = e?.message ?? '';
      const jsonStart = raw.indexOf('{');
      if (jsonStart !== -1) {
        try {
          const parsed = JSON.parse(raw.slice(jsonStart));
          return { success: false, message: parsed.message || 'Failed to save security question.' };
        } catch { /* fall through */ }
      }
      return { success: false, message: 'Failed to save security question.' };
    }
  }

  async function completeOnboarding(data: { identity: string; gender: string }) {
    if (!user) return;
    try {
      const res = await apiRequest('PUT', '/api/auth/onboarding', data);
      const updated = await res.json();
      const merged: UserProfile = {
        countryCode: user.countryCode ?? null,
        phoneNumber: user.phoneNumber ?? null,
        whatsappOptIn: user.whatsappOptIn ?? false,
        ...updated,
      };
      await setCachedProfile(merged);
      setUser(merged);
    } catch (e) {
      __DEV__ && console.error('Onboarding error:', e);
    }
  }

  async function updateProfile(data: Partial<UserProfile>) {
    if (!user) return;
    try {
      const res = await apiRequest('PUT', '/api/auth/profile', data);
      const updated = await res.json();
      await setCachedProfile(updated);
      setUser(updated);
    } catch (e) {
      __DEV__ && console.error('Update profile error:', e);
    }
  }

  async function updatePhone(data: { countryCode: string | null; phoneNumber: string | null; whatsappOptIn: boolean }): Promise<{ success: boolean; message?: string }> {
    if (!user) return { success: false, message: 'Not logged in' };
    try {
      const res = await apiRequest('PUT', '/api/auth/phone', data);
      const updated = await res.json();
      const profile: UserProfile = {
        ...user,
        countryCode: updated.countryCode ?? null,
        phoneNumber: updated.phoneNumber ?? null,
        whatsappOptIn: updated.whatsappOptIn ?? false,
      };
      await setCachedProfile(profile);
      setUser(profile);
      return { success: true };
    } catch (e: any) {
      let msg = 'Failed to update phone.';
      try {
        const raw: string = e?.message ?? '';
        const jsonStart = raw.indexOf('{');
        if (jsonStart !== -1) {
          const parsed = JSON.parse(raw.slice(jsonStart));
          if (parsed?.message) msg = parsed.message;
        }
      } catch {}
      return { success: false, message: msg };
    }
  }

  async function deleteAccount(): Promise<{ success: boolean; message: string }> {
    try {
      await apiRequest('DELETE', '/api/account');
      await clearAuthToken();
      setUser(null);
      return { success: true, message: 'Account deleted' };
    } catch (e: any) {
      return { success: false, message: 'Failed to delete account. Please try again.' };
    }
  }

  const value = useMemo(() => ({
    user,
    isLoading,
    isOnboarded,
    login,
    register,
    logout,
    resetPassword,
    confirmPasswordReset,
    changePassword,
    getSecurityQuestion,
    getMySecurityQuestion,
    verifySecurityAnswer,
    setSecurityQuestion,
    completeOnboarding,
    updateProfile,
    updatePhone,
    deleteAccount,
    verifyLoginOtp,
    resendLoginOtp,
    forgetDevice,
  }), [user, isLoading, isOnboarded]);

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used within AuthProvider');
  return context;
}
