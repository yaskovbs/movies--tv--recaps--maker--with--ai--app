import { useState } from 'react'
import { Link } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { useTranslation } from 'react-i18next'
import { ChevronDown, HelpCircle } from 'lucide-react'
import type { FAQ } from '../types'

const FAQPage = () => {
  const { t } = useTranslation()
  const [openItems, setOpenItems] = useState<number[]>([])

  const faqs = t('faqPage.questions', { returnObjects: true }) as unknown as FAQ[]

  const toggleItem = (index: number) => {
    setOpenItems(prev =>
      prev.includes(index)
        ? prev.filter(i => i !== index)
        : [...prev, index]
    )
  }

  return (
    <div className="min-h-screen text-white py-20">
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* Header */}
        <motion.div
          className="text-center mb-16"
          initial={{ opacity: 0, y: 30 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6 }}
        >
          <div className="flex items-center justify-center mb-6">
            <HelpCircle className="h-12 w-12 text-blue-400 ml-4" />
            <h1 className="text-4xl md:text-5xl font-bold bg-gradient-to-r from-blue-400 to-purple-600 bg-clip-text text-transparent">
              {t('faqPage.title')}
            </h1>
          </div>
          <p className="text-xl text-gray-300 max-w-3xl mx-auto">
            {t('faqPage.subtitle')}
          </p>
        </motion.div>

        {/* FAQ Items */}
        <div className="space-y-4">
          {faqs.map((faq, index) => (
            <motion.div
              key={index}
              className="glass rounded-lg overflow-hidden"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6, delay: index * 0.1 }}
            >
              <motion.button
                className="w-full px-6 py-4 text-right flex items-center justify-between transition-colors"
                onClick={() => toggleItem(index)}
                whileHover={{ backgroundColor: 'rgba(255, 255, 255, 0.06)' }}
              >
                <ChevronDown
                  className={`h-5 w-5 text-blue-400 transition-transform duration-200 ${
                    openItems.includes(index) ? 'transform rotate-180' : ''
                  }`}
                />
                <h3 className="text-lg font-semibold text-white flex-1 ml-4">
                  {faq.question}
                </h3>
              </motion.button>

              <AnimatePresence>
                {openItems.includes(index) && (
                  <motion.div
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: 'auto', opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    transition={{ duration: 0.3, ease: 'easeInOut' }}
                    className="overflow-hidden"
                  >
                    <div className="px-6 pb-4 border-t border-white/10">
                      <p className="text-gray-300 leading-relaxed pt-4">
                        {faq.answer}
                      </p>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </motion.div>
          ))}
        </div>

        {/* Contact Section */}
        <motion.div
          className="mt-16 bg-gradient-to-r from-blue-600/10 to-purple-600/10 rounded-lg p-8 border border-blue-600/20"
          initial={{ opacity: 0, y: 30 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.5 }}
        >
          <div className="text-center">
            <h2 className="text-2xl font-bold text-white mb-4">
              {t('faqPage.notFoundTitle')}
            </h2>
            <p className="text-gray-300 mb-6">
              {t('faqPage.notFoundSubtitle')}
            </p>
            <Link to="/contact">
              <motion.button
                className="bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-700 hover:to-purple-700 text-white font-semibold py-3 px-8 rounded-lg transition-all duration-200"
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
              >
                {t('faqPage.contactUs')}
              </motion.button>
            </Link>
          </div>
        </motion.div>
      </div>
    </div>
  )
}

export default FAQPage
