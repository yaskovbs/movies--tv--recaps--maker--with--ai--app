import { useState } from 'react'
import { Routes, Route } from 'react-router-dom'
import Header from './components/Header'
import HomePage from './components/HomePage'
import ContactPage from './components/ContactPage'
import FAQPage from './components/FAQPage'
import Footer from './components/Footer'
import TermsOfServicePage from './components/TermsOfServicePage'
import PrivacyPolicyPage from './components/PrivacyPolicyPage'

import HistoryPage from './components/HistoryPage'

function App() {
  const [apiKey, setApiKey] = useState('')

  return (
    <div className="relative min-h-screen bg-gray-950 flex flex-col">
      {/* רקע דקורטיבי קבוע - כתמי צבע מטושטשים שנותנים לפאנלים ה"זכוכית" משהו לשקף */}
      <div className="fixed inset-0 -z-10 overflow-hidden pointer-events-none">
        <div className="absolute -top-40 -right-40 h-[32rem] w-[32rem] rounded-full bg-blue-600/30 blur-[120px]" />
        <div className="absolute top-1/3 -left-40 h-[28rem] w-[28rem] rounded-full bg-purple-600/25 blur-[120px]" />
        <div className="absolute bottom-0 right-1/4 h-[26rem] w-[26rem] rounded-full bg-pink-600/20 blur-[120px]" />
        <div className="absolute inset-0 bg-gray-950/40" />
      </div>

      <Header
        apiKey={apiKey}
        onApiKeyChange={setApiKey}
      />
      <main className="flex-grow">
        <Routes>
          <Route path="/" element={<HomePage apiKey={apiKey} />} />
          <Route path="/history" element={<HistoryPage />} />
          <Route path="/contact" element={<ContactPage />} />
          <Route path="/faq" element={<FAQPage />} />
          <Route path="/terms" element={<TermsOfServicePage />} />
          <Route path="/privacy" element={<PrivacyPolicyPage />} />
        </Routes>
      </main>
      <Footer />
    </div>
  )
}

export default App
