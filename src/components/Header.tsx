import { useState } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { motion } from 'framer-motion'
import { useTranslation } from 'react-i18next'
import { Film, Key, Menu, X, FileText, Shield, HelpCircle } from 'lucide-react'
import LanguageSwitcher from './LanguageSwitcher'
import AuthPanel from './AuthPanel'

interface HeaderProps {
  apiKey: string
  onApiKeyChange: (key: string) => void
}

const Header = ({ apiKey, onApiKeyChange }: HeaderProps) => {
  const { t } = useTranslation()
  const [showApiInput, setShowApiInput] = useState(false)
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)
  const location = useLocation();

  const menuItems = [
    { path: '/', label: t('header.nav.home'), icon: Film },
    { path: '/history', label: t('header.nav.history'), icon: null },
    { path: '/faq', label: t('header.nav.faq'), icon: HelpCircle },
    { path: '/contact', label: t('header.nav.contact'), icon: null },
    { path: '/terms', label: t('header.nav.terms'), icon: FileText },
    { path: '/privacy', label: t('header.nav.privacy'), icon: Shield }
  ]

  return (
    <header className="glass-header text-white sticky top-0 z-50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex justify-between items-center py-4">
          {/* לוגו */}
          <Link to="/">
            <motion.div
              className="flex items-center cursor-pointer"
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
            >
              <Film className="h-8 w-8 text-blue-400 ml-3" />
              <div className="text-right">
                <h1 className="text-xl font-bold">{t('common.appName')}</h1>
                <p className="text-sm text-gray-400">{t('common.appTagline')}</p>
              </div>
            </motion.div>
          </Link>

          {/* תפריט דסקטופ */}
          <nav className="hidden md:flex items-center space-x-8 space-x-reverse">
            {menuItems.map((item) => (
              <Link
                key={item.path}
                to={item.path}
                className={`px-3 py-2 rounded-md text-sm font-medium transition-colors ${
                  location.pathname === item.path
                    ? 'bg-blue-600 text-white'
                    : 'text-gray-300 hover:text-white hover:bg-white/10'
                }`}
              >
                {item.label}
              </Link>
            ))}
          </nav>

          {/* כפתור API Key + שפה */}
          <div className="flex items-center space-x-2 space-x-reverse">
            <LanguageSwitcher />
            <AuthPanel />
            <motion.button
              onClick={() => setShowApiInput(!showApiInput)}
              className="flex items-center px-3 py-2 bg-blue-600 rounded-lg hover:bg-blue-700 transition-colors"
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
            >
              <Key className="h-4 w-4 sm:ml-2" />
              <span className="hidden sm:inline text-sm">{t('header.apiKeyButton')}</span>
            </motion.button>

            {/* תפריט מובייל */}
            <button
              className="md:hidden p-2"
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            >
              {mobileMenuOpen ? <X className="h-6 w-6" /> : <Menu className="h-6 w-6" />}
            </button>
          </div>
        </div>

        {/* קלט API Key */}
        {showApiInput && (
          <motion.div
            className="pb-4"
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
          >
            <div className="glass rounded-lg p-4">
              <label className="block text-sm font-medium text-gray-300 mb-2">
                {t('header.apiKeyLabel')}
              </label>
              <input
                type="password"
                value={apiKey}
                onChange={(e) => onApiKeyChange(e.target.value)}
                placeholder={t('header.apiKeyPlaceholder')}
                className="w-full px-3 py-2 glass-input rounded-md text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
                dir="ltr"
              />
              <p className="text-xs text-gray-400 mt-1">
                {t('header.apiKeyHint')}
              </p>
            </div>
          </motion.div>
        )}

        {/* תפריט מובייל */}
        {mobileMenuOpen && (
          <motion.div
            className="md:hidden pb-4"
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
          >
            <div className="glass rounded-lg p-4">
              {menuItems.map((item) => (
                <Link
                  key={item.path}
                  to={item.path}
                  onClick={() => setMobileMenuOpen(false)}
                  className={`block w-full text-right px-3 py-2 rounded-md text-sm font-medium transition-colors mb-2 ${
                    location.pathname === item.path
                      ? 'bg-blue-600 text-white'
                      : 'text-gray-300 hover:text-white hover:bg-white/10'
                  }`}
                >
                  {item.label}
                </Link>
              ))}
            </div>
          </motion.div>
        )}
      </div>
    </header>
  )
}

export default Header
