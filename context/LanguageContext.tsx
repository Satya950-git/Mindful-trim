import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { I18nManager, Alert, Platform } from 'react-native';
import { reloadAppAsync } from 'expo';
import i18next, { loadHindi } from '@/lib/i18n';
import { apiRequest } from '@/lib/query-client';
import { syncNotifications } from '@/services/notificationService';

const STORAGE_KEY = '@mindful_trim_language';

export interface Language {
  code: string;
  nativeName: string;
  flag: string;
  isRTL: boolean;
}

export const LANGUAGES: Language[] = [
  { code: 'en', nativeName: 'English',   flag: '🇬🇧', isRTL: false },
  { code: 'hi', nativeName: 'हिन्दी',     flag: '🇮🇳', isRTL: false },
];

interface LanguageContextType {
  language: string;
  setLanguage: (code: string) => Promise<void>;
  isRTL: boolean;
  languageLoaded: boolean;
}

const LanguageContext = createContext<LanguageContextType>({
  language: 'en',
  setLanguage: async () => {},
  isRTL: false,
  languageLoaded: false,
});

export function LanguageProvider({ children }: { children: ReactNode }) {
  const [language, setLanguageState] = useState('en');
  const [isRTL, setIsRTL] = useState(false);
  const [languageLoaded, setLanguageLoaded] = useState(false);

  useEffect(() => {
    AsyncStorage.getItem(STORAGE_KEY).then(async code => {
      if (code) {
        const lang = LANGUAGES.find(l => l.code === code);
        if (lang) {
          if (code === 'hi') await loadHindi();
          i18next.changeLanguage(code);
          setLanguageState(code);
          setIsRTL(lang.isRTL);
        }
      }
      setLanguageLoaded(true);
    }).catch(() => {
      setLanguageLoaded(true);
    });
  }, []);

  const setLanguage = async (code: string) => {
    const lang = LANGUAGES.find(l => l.code === code);
    if (!lang) return;

    if (code === 'hi') await loadHindi();
    await AsyncStorage.setItem(STORAGE_KEY, code);
    await i18next.changeLanguage(code);
    setLanguageState(code);
    setIsRTL(lang.isRTL);

    // Sync to backend so notifications are generated in the user's language
    apiRequest('PUT', '/api/auth/profile', { language: code }).catch(() => {});

    // Reschedule OS reminders immediately in the new language.
    // getUserLanguage() in notificationService reads from the same AsyncStorage key
    // we just wrote, so the next syncNotifications() call will fetch and schedule
    // notifications in the updated language.
    syncNotifications().catch(() => {});

    const willBeRTL = lang.isRTL;
    const currentlyRTL = I18nManager.isRTL;

    if (willBeRTL !== currentlyRTL) {
      I18nManager.allowRTL(willBeRTL);
      I18nManager.forceRTL(willBeRTL);
      if (Platform.OS !== 'web') {
        Alert.alert(
          i18next.t('language.restartTitle'),
          i18next.t('language.restartMsg'),
          [{
            text: i18next.t('language.restart'),
            onPress: () => reloadAppAsync(),
          }]
        );
      }
    }
  };

  return (
    <LanguageContext.Provider value={{ language, setLanguage, isRTL, languageLoaded }}>
      {children}
    </LanguageContext.Provider>
  );
}

export function useLanguage() {
  return useContext(LanguageContext);
}
