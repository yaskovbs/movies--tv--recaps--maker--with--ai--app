import { useState } from 'react'
import { Link } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { ChevronDown, HelpCircle } from 'lucide-react'
import type { FAQ } from '../types'

const FAQPage = () => {
  const [openItems, setOpenItems] = useState<number[]>([])

  const faqs: FAQ[] = [
    {
      question: 'איך אני מקבל מפתח API של Gemini?',
      answer: 'עליך להירשם לשירות Google AI Studio ולקבל מפתח API בחינם. המפתח מאפשר לך להשתמש בשירותי הבינה המלאכותית של Google. פשוט עבור לאתר Google AI Studio, צור חשבון והפק מפתח API חדש.'
    },
    {
      question: 'מה הגודל המקסימלי של קובץ שאני יכול להעלות?',
      answer: 'כרגע אנחנו תומכים בקבצים עד 4GB ובאורך של עד 3 שעות. אם יש לך קובץ גדול יותר, תוכל לדחוס אותו באמצעות תוכנות דחיסת וידאו או לפנות אלינו לפתרון מותאם. אנו עובדים על הגדלת מגבלות אלו בעתיד.'
    },
    {
      question: 'כמה זמן לוקח ליצור סיכום?',
      answer: 'זמן העיבוד תלוי באורך הווידאו המקורי ובאורך הסיכום המבוקש. בדרך כלל התהליך לוקח בין 2-15 דקות. וידאו באורך של שעה יעובד תוך כ-8 דקות בממוצע, ווידאו של שעתיים יכול לקחת עד 15 דקות.'
    },
    {
      question: 'האם המידע שלי מאובטח?',
      answer: 'כן, אנחנו משתמשים בהצפנה מתקדמת ולא שומרים את מפתחות ה-API שלכם. כל הקבצים נמחקים אוטומטית לאחר העיבוד. אנו מקפידים על פרטיות המשתמשים ועל אבטחת המידע לפי סטנדרטים בינלאומיים.'
    },
    {
      question: 'אילו פורמטים של וידאו נתמכים?',
      answer: 'אנו תומכים בפורמטים הנפוצים ביותר: MP4, AVI, MOV, ו-MKV. אלו פורמטים שמכסים את רוב הווידאו המיוצרים כיום. אם יש לכם קובץ בפורמט אחר, אתם יכולים להמיר אותו באמצעות כלים מקוונים בחינם.'
    },
    {
      question: 'האם אני יכול לערוך את הסיכום אחרי היצירה?',
      answer: 'כרגע הסיכום מיוצר אוטומטית על בסיס ההגדרות שבחרתם. אנו עובדים על תכונות עריכה מתקדמות שיאפשרו התאמה אישית של הסיכום, כולל החלפת קטעים וכוונון הטקסט.'
    },
    {
      question: 'מה קורה אם יש בעיה בעיבוד הווידאו?',
      answer: 'במקרה של שגיאה, המערכת תיידע אתכם מיד ותציע פתרונות. השגיאות הנפוצות קשורות לגודל קובץ או לפורמט לא נתמך. הצוות שלנו זמין לסיוע טכני בכל בעיה.'
    },
    {
      question: 'האם השירות בחינם?',
      answer: 'השירות הבסיסי זמין בחינם עם מגבלות מסוימות. אתם משתמשים במפתח ה-API שלכם עצמכם, כך שהעלויות תלויות בשימוש שלכם ב-Google Gemini. יש לנו גם תוכניות מתקדמות למשתמשים מקצועיים.'
    }
  ]

  const toggleItem = (index: number) => {
    setOpenItems(prev => 
      prev.includes(index)
        ? prev.filter(i => i !== index)
        : [...prev, index]
    )
  }

  return (
    <div className="min-h-screen bg-gray-900 text-white py-20">
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
              שאלות נפוצות
            </h1>
          </div>
          <p className="text-xl text-gray-300 max-w-3xl mx-auto">
            מצאו תשובות לשאלות הנפוצות ביותר על השירות שלנו
          </p>
        </motion.div>

        {/* FAQ Items */}
        <div className="space-y-4">
          {faqs.map((faq, index) => (
            <motion.div
              key={index}
              className="bg-gray-800 rounded-lg border border-gray-700 overflow-hidden"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6, delay: index * 0.1 }}
            >
              <motion.button
                className="w-full px-6 py-4 text-right flex items-center justify-between hover:bg-gray-750 transition-colors"
                onClick={() => toggleItem(index)}
                whileHover={{ backgroundColor: 'rgba(55, 65, 81, 0.8)' }}
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
                    <div className="px-6 pb-4 border-t border-gray-700">
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
              לא מצאתם את התשובה שחיפשתם?
            </h2>
            <p className="text-gray-300 mb-6">
              הצוות שלנו כאן כדי לעזור! צרו קשר איתנו ונחזור אליכם במהירות
            </p>
            <Link to="/contact">
              <motion.button
                className="bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-700 hover:to-purple-700 text-white font-semibold py-3 px-8 rounded-lg transition-all duration-200"
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
              >
                צרו קשר איתנו
              </motion.button>
            </Link>
          </div>
        </motion.div>
      </div>
    </div>
  )
}

export default FAQPage
