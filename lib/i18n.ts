import i18next from 'i18next';
import { initReactI18next } from 'react-i18next';

import en from '../locales/en.json';

i18next.use(initReactI18next).init({
  resources: {
    en: { translation: en },
  },
  lng: 'en',
  fallbackLng: 'en',
  interpolation: {
    escapeValue: false,
  },
  compatibilityJSON: 'v4',
});

let hindiLoaded = false;

export async function loadHindi(): Promise<void> {
  if (hindiLoaded) return;
  try {
    const hi = await import('../locales/hi.json');
    i18next.addResourceBundle('hi', 'translation', hi.default ?? hi, true, true);
    hindiLoaded = true;
  } catch (e) {
    console.warn('[i18n] Failed to load Hindi resources:', e);
  }
}

export default i18next;
