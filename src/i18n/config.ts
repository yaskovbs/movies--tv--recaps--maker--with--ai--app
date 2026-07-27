import i18n from 'i18next'
import { initReactI18next } from 'react-i18next'
import LanguageDetector from 'i18next-browser-languagedetector'

import en from '../locales/en.json'
import he from '../locales/he.json'
import es from '../locales/es.json'
import fr from '../locales/fr.json'
import ru from '../locales/ru.json'
import ar from '../locales/ar.json'

export interface SupportedLanguage {
  code: string
  label: string
  dir: 'ltr' | 'rtl'
}

export const supportedLanguages: SupportedLanguage[] = [
  { code: 'en', label: 'English', dir: 'ltr' },
  { code: 'he', label: 'עברית', dir: 'rtl' },
  { code: 'ru', label: 'Русский', dir: 'ltr' },
  { code: 'ar', label: 'العربية', dir: 'rtl' },
  { code: 'es', label: 'Español', dir: 'ltr' },
  { code: 'fr', label: 'Français', dir: 'ltr' },
]

const rtlLanguageCodes = new Set(
  supportedLanguages.filter((lang) => lang.dir === 'rtl').map((lang) => lang.code)
)

function applyDocumentDirection(language: string) {
  const dir = rtlLanguageCodes.has(language) ? 'rtl' : 'ltr'
  document.documentElement.dir = dir
  document.documentElement.lang = language
}

i18n
  .use(LanguageDetector)
  .use(initReactI18next)
  .init({
    resources: {
      en: { translation: en },
      he: { translation: he },
      es: { translation: es },
      fr: { translation: fr },
      ru: { translation: ru },
      ar: { translation: ar },
    },
    fallbackLng: 'en',
    supportedLngs: supportedLanguages.map((lang) => lang.code),
    interpolation: {
      escapeValue: false,
    },
    detection: {
      // Default language is English; only a language the user explicitly
      // picked before (saved to localStorage) overrides that default.
      order: ['localStorage'],
      caches: ['localStorage'],
      lookupLocalStorage: 'appLanguage',
    },
  })
  .then(() => applyDocumentDirection(i18n.resolvedLanguage || 'en'))

i18n.on('languageChanged', applyDocumentDirection)

export default i18n
