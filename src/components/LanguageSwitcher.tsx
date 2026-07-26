import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Globe } from 'lucide-react'
import { supportedLanguages } from '../i18n/config'

const LanguageSwitcher = () => {
  const { i18n, t } = useTranslation()
  const [open, setOpen] = useState(false)

  const current = supportedLanguages.find((lang) => lang.code === i18n.resolvedLanguage) || supportedLanguages[0]

  return (
    <div className="relative">
      <button
        onClick={() => setOpen((prev) => !prev)}
        className="flex items-center gap-1.5 px-3 py-2 glass-input rounded-lg text-sm text-gray-200 hover:text-white transition-colors"
        title={t('header.language')}
      >
        <Globe className="h-4 w-4" />
        <span>{current.label}</span>
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div className="absolute top-full mt-2 end-0 z-50 glass-strong rounded-lg py-1 min-w-[140px] overflow-hidden">
            {supportedLanguages.map((lang) => (
              <button
                key={lang.code}
                onClick={() => {
                  i18n.changeLanguage(lang.code)
                  setOpen(false)
                }}
                className={`w-full text-start px-4 py-2 text-sm transition-colors ${
                  lang.code === current.code
                    ? 'text-blue-400 bg-white/5'
                    : 'text-gray-200 hover:bg-white/10 hover:text-white'
                }`}
              >
                {lang.label}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  )
}

export default LanguageSwitcher
