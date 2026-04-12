import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import en from './locales/en';
import zhCN from './locales/zh-CN';

const LANGUAGE_STORAGE_KEY = 'firewood:language';

function detectLanguage(): string {
  // 1. Check persisted preference
  try {
    const saved = localStorage.getItem(LANGUAGE_STORAGE_KEY);
    if (saved && (saved === 'en' || saved === 'zh-CN')) {
      return saved;
    }
  } catch {
    // ignore
  }

  // 2. Detect from browser/system
  const browserLang = navigator.language || (navigator as never)['userLanguage'] || '';
  if (browserLang.startsWith('zh')) {
    return 'zh-CN';
  }

  return 'en';
}

export function getStoredLanguage(): string | null {
  try {
    return localStorage.getItem(LANGUAGE_STORAGE_KEY);
  } catch {
    return null;
  }
}

export function setStoredLanguage(lang: string) {
  try {
    localStorage.setItem(LANGUAGE_STORAGE_KEY, lang);
  } catch {
    // ignore
  }
}

i18n.use(initReactI18next).init({
  resources: {
    en: { translation: en },
    'zh-CN': { translation: zhCN },
  },
  lng: detectLanguage(),
  fallbackLng: 'en',
  interpolation: {
    escapeValue: false,
  },
});

export default i18n;
