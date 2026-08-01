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
    <div className="relative isolate min-h-screen bg-gray-950 flex flex-col">
      {/* Fixed ambient background - saturated color blobs the glass panels can
          actually refract. Glass only reads as glass when there's something
          colorful behind it to blur/distort; a plain dark backdrop just makes
          a blurred panel look like a flat gray box. */}
      <div className="fixed inset-0 -z-10 overflow-hidden pointer-events-none">
        <div className="absolute -top-40 -right-40 h-[34rem] w-[34rem] rounded-full bg-blue-500/60 blur-[110px]" />
        <div className="absolute top-1/3 -left-48 h-[30rem] w-[30rem] rounded-full bg-purple-500/50 blur-[110px]" />
        <div className="absolute bottom-0 right-1/4 h-[28rem] w-[28rem] rounded-full bg-pink-500/45 blur-[110px]" />
        <div className="absolute top-2/3 left-1/3 h-[24rem] w-[24rem] rounded-full bg-cyan-500/35 blur-[110px]" />
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
