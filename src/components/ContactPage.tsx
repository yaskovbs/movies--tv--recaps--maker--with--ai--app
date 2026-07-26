import { useState } from 'react'
import { motion } from 'framer-motion'
import { useTranslation } from 'react-i18next'
import { Mail, Phone, MapPin, Clock, Send, Loader2 } from 'lucide-react'

const ContactPage = () => {
  const { t } = useTranslation()
  const [formData, setFormData] = useState({
    name: '',
    email: '',
    subject: '',
    message: ''
  })
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [submitStatus, setSubmitStatus] = useState<{ type: 'success' | 'error'; message: string } | null>(null)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setIsSubmitting(true)
    setSubmitStatus(null)

    // Simulate API call delay
    await new Promise(resolve => setTimeout(resolve, 2000))

    setIsSubmitting(false)

    // For local usage, always show success
    setSubmitStatus({ type: 'success', message: t('contactPage.successMessage') })
    setFormData({ name: '', email: '', subject: '', message: '' })

    // In a real implementation, you could store messages locally or send via email
    console.log('Contact form submitted:', formData)
  }

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    setFormData({
      ...formData,
      [e.target.name]: e.target.value
    })
  }

  const contactInfo = [
    {
      icon: Mail,
      title: t('contactPage.email'),
      content: 'yaskovbs2502@gmail.com',
      description: t('contactPage.emailDesc')
    },
    {
      icon: Phone,
      title: t('contactPage.phone'),
      content: '050-818-1948',
      description: t('contactPage.phoneDesc')
    },
    {
      icon: MapPin,
      title: t('contactPage.address'),
      content: 'רחוב רש\'י, אופקים',
      description: t('contactPage.addressDesc')
    }
  ]

  const workingHours = [
    { day: t('contactPage.days.sunThu'), hours: '9:00-18:00' },
    { day: t('contactPage.days.fri'), hours: '9:00-14:00' },
    { day: t('contactPage.days.sat'), hours: t('contactPage.closed') }
  ]

  return (
    <div className="min-h-screen text-white py-20">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
        <motion.div
          className="text-center mb-16"
          initial={{ opacity: 0, y: 30 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6 }}
        >
          <h1 className="text-4xl md:text-5xl font-bold mb-6 bg-gradient-to-r from-blue-400 to-purple-600 bg-clip-text text-transparent">
            {t('contactPage.title')}
          </h1>
          <p className="text-xl text-gray-300 max-w-3xl mx-auto">
            {t('contactPage.subtitle')}
          </p>
        </motion.div>

        <div className="grid lg:grid-cols-2 gap-12">
          <motion.div
            initial={{ opacity: 0, x: -30 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.6, delay: 0.1 }}
          >
            <h2 className="text-2xl font-bold text-white mb-8">{t('contactPage.getInTouch')}</h2>

            <div className="space-y-6 mb-8">
              {contactInfo.map((info, index) => (
                <motion.div
                  key={index}
                  className="glass rounded-lg p-6"
                  whileHover={{ scale: 1.02, borderColor: '#3B82F6' }}
                  transition={{ duration: 0.2 }}
                >
                  <div className="flex items-start space-x-4 space-x-reverse">
                    <div className="bg-blue-600 p-3 rounded-lg">
                      <info.icon className="h-6 w-6 text-white" />
                    </div>
                    <div className="flex-1">
                      <h3 className="font-semibold text-white mb-1">{info.title}</h3>
                      <p className="text-blue-400 font-medium mb-1">{info.content}</p>
                      <p className="text-gray-400 text-sm">{info.description}</p>
                    </div>
                  </div>
                </motion.div>
              ))}
            </div>

            <motion.div
              className="glass rounded-lg p-6"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6, delay: 0.3 }}
            >
              <div className="flex items-center mb-4">
                <Clock className="h-6 w-6 text-blue-400 ml-3" />
                <h3 className="text-xl font-semibold text-white">{t('contactPage.supportHoursTitle')}</h3>
              </div>
              <div className="space-y-2">
                {workingHours.map((time, index) => (
                  <div key={index} className="flex justify-between items-center">
                    <span className="text-gray-300">{time.day}:</span>
                    <span className="text-blue-400 font-medium">{time.hours}</span>
                  </div>
                ))}
              </div>
              <div className="mt-4 p-3 bg-blue-600/10 rounded-lg border border-blue-600/20">
                <p className="text-blue-400 text-sm font-medium">
                  {t('contactPage.avgResponseTime')}
                </p>
              </div>
            </motion.div>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, x: 30 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.6, delay: 0.2 }}
          >
            <div className="glass rounded-lg p-8">
              <h2 className="text-2xl font-bold text-white mb-6">{t('contactPage.formTitle')}</h2>

              <form onSubmit={handleSubmit} className="space-y-6">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div>
                    <label className="block text-sm font-medium text-gray-300 mb-2">
                      {t('contactPage.nameLabel')}
                    </label>
                    <input
                      type="text"
                      name="name"
                      value={formData.name}
                      onChange={handleChange}
                      required
                      disabled={isSubmitting}
                      className="w-full px-4 py-3 glass-input rounded-lg text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent disabled:opacity-50"
                      placeholder={t('contactPage.namePlaceholder')}
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-300 mb-2">
                      {t('contactPage.emailLabel')}
                    </label>
                    <input
                      type="email"
                      name="email"
                      value={formData.email}
                      onChange={handleChange}
                      required
                      disabled={isSubmitting}
                      className="w-full px-4 py-3 glass-input rounded-lg text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent disabled:opacity-50"
                      placeholder="your@email.com"
                      dir="ltr"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-2">
                    {t('contactPage.subjectLabel')}
                  </label>
                  <input
                    type="text"
                    name="subject"
                    value={formData.subject}
                    onChange={handleChange}
                    required
                    disabled={isSubmitting}
                    className="w-full px-4 py-3 glass-input rounded-lg text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent disabled:opacity-50"
                    placeholder={t('contactPage.subjectPlaceholder')}
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-2">
                    {t('contactPage.messageLabel')}
                  </label>
                  <textarea
                    name="message"
                    value={formData.message}
                    onChange={handleChange}
                    required
                    disabled={isSubmitting}
                    rows={6}
                    className="w-full px-4 py-3 glass-input rounded-lg text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent resize-none disabled:opacity-50"
                    placeholder={t('contactPage.messagePlaceholder')}
                  />
                </div>

                {submitStatus && (
                  <div className={`p-4 rounded-lg text-center ${
                    submitStatus.type === 'success' ? 'bg-green-600/20 text-green-400' : 'bg-red-600/20 text-red-400'
                  }`}>
                    {submitStatus.message}
                  </div>
                )}

                <motion.button
                  type="submit"
                  disabled={isSubmitting}
                  className="w-full bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-700 hover:to-purple-700 text-white font-semibold py-3 px-6 rounded-lg transition-all duration-200 flex items-center justify-center disabled:opacity-50 disabled:cursor-not-allowed"
                  whileHover={{ scale: isSubmitting ? 1 : 1.02 }}
                  whileTap={{ scale: isSubmitting ? 1 : 0.98 }}
                >
                  {isSubmitting ? (
                    <Loader2 className="h-5 w-5 animate-spin ml-2" />
                  ) : (
                    <Send className="h-5 w-5 ml-2" />
                  )}
                  {isSubmitting ? t('contactPage.sending') : t('contactPage.sendButton')}
                </motion.button>
              </form>
            </div>
          </motion.div>
        </div>
      </div>
    </div>
  )
}

export default ContactPage
