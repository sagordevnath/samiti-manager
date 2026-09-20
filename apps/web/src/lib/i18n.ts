import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import LanguageDetector from 'i18next-browser-languagedetector';
import { DEFAULT_LOCALE } from '@samity/shared';
import bn from '@/locales/bn.json';
import en from '@/locales/en.json';

/** Bangla is the default; English available via the header toggle. */
void i18n.use(LanguageDetector).use(initReactI18next).init({
  resources: { bn: { translation: bn }, en: { translation: en } },
  // Resources are bundled inline → init synchronously (no first-render flash).
  initImmediate: false,
  fallbackLng: DEFAULT_LOCALE,
  supportedLngs: ['bn', 'en'],
  interpolation: { escapeValue: false },
  returnEmptyString: false,
});

// Keep <html lang> in sync with the active locale (a11y + font selection).
i18n.on('languageChanged', (lng) => {
  document.documentElement.lang = lng;
});

export default i18n;
