import { useState } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { motion } from 'framer-motion'
import { Film, Key, Menu, X, FileText, Shield, HelpCircle } from 'lucide-react'

interface HeaderProps {
  apiKey: string
  onApiKeyChange: (key: string) => void
}

const Header = ({ apiKey, onApiKeyChange }: HeaderProps) => {
  const [showApiInput, setShowApiInput] = useState(false)
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)
  const location = useLocation();

  const menuItems = [
    { path: '/', label: 'בית', icon: Film },
    { path: '/history', label: 'היסטוריה', icon: null },
    { path: '/faq', label: 'שאלות נפוצות', icon: HelpCircle },
    { path: '/contact', label: 'צור קשר', icon: null },
    { path: '/terms', label: 'תנאי שימוש', icon: FileText },
    { path: '/privacy', label: 'מדיניות פרטיות', icon: Shield }
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
                <h1 className="text-xl font-bold">Movies & TV Recaps</h1>
                <p className="text-sm text-gray-400">יוצר סיכומי סרטים וסדרות</p>
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

          {/* כפתור API Key */}
          <div className="flex items-center space-x-2 space-x-reverse">
            <motion.button
              onClick={() => setShowApiInput(!showApiInput)}
              className="flex items-center px-3 py-2 bg-blue-600 rounded-lg hover:bg-blue-700 transition-colors"
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
            >
              <Key className="h-4 w-4 ml-2" />
              <span className="text-sm">API Key</span>
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
                מפתח Gemini AI API
              </label>
              <input
                type="password"
                value={apiKey}
                onChange={(e) => onApiKeyChange(e.target.value)}
                placeholder="הכנס את מפתח ה-API שלך..."
                className="w-full px-3 py-2 glass-input rounded-md text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
                dir="ltr"
              />
              <p className="text-xs text-gray-400 mt-1">
                קבל מפתח API בחינם מ-Google AI Studio
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
