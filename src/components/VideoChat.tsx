import { useState, useRef, useEffect } from 'react'
import type { KeyboardEvent } from 'react'
import { motion } from 'framer-motion'
import { useTranslation } from 'react-i18next'
import { Send, Loader2, MessageCircle } from 'lucide-react'
import type { GeminiFileRef } from '../types'
import { GEMINI_SAFETY_SETTINGS } from '../lib/gemini'

interface ChatMessage {
  role: 'user' | 'model'
  text: string
}

interface VideoChatProps {
  apiKey: string
  fileRef: GeminiFileRef
}

const CHAT_MODEL = 'gemini-3.7-flash'
const CHAT_TIMEOUT_MS = 60_000

// Gemini's REST API is stateless - every turn resends the full conversation
// so far. The video file only needs to be attached once, on the very first
// user turn (index 0 in history); every later turn is plain text.
async function askGeminiAboutVideo(
  apiKey: string,
  fileRef: GeminiFileRef,
  history: ChatMessage[]
): Promise<string> {
  const API_URL = `https://generativelanguage.googleapis.com/v1beta/models/${CHAT_MODEL}:generateContent?key=${apiKey}`

  const contents = history.map((msg, i) => ({
    role: msg.role,
    parts: i === 0
      ? [{ file_data: { mime_type: fileRef.mimeType, file_uri: fileRef.uri } }, { text: msg.text }]
      : [{ text: msg.text }],
  }))

  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), CHAT_TIMEOUT_MS)

  let response: Response
  try {
    response = await fetch(API_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ contents, safetySettings: GEMINI_SAFETY_SETTINGS }),
      signal: controller.signal,
    })
  } catch (e) {
    if (controller.signal.aborted) {
      throw new Error('Gemini took too long to respond.')
    }
    throw e
  } finally {
    clearTimeout(timeoutId)
  }

  if (!response.ok) {
    const errorData = await response.json().catch(() => null)
    throw new Error(errorData?.error?.message || 'Gemini chat request failed.')
  }

  const data = await response.json()
  const text: string | undefined = data.candidates?.[0]?.content?.parts?.[0]?.text
  if (!text) {
    const blockReason = data.promptFeedback?.blockReason
    throw new Error(
      blockReason
        ? `Gemini blocked the response (reason: ${blockReason}).`
        : 'Gemini returned no answer.'
    )
  }
  return text.trim()
}

const VideoChat = ({ apiKey, fileRef }: VideoChatProps) => {
  const { t } = useTranslation()
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [input, setInput] = useState('')
  const [isSending, setIsSending] = useState(false)
  const [error, setError] = useState('')
  const messagesEndRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  const handleSend = async () => {
    const question = input.trim()
    if (!question || isSending) return

    const nextHistory = [...messages, { role: 'user' as const, text: question }]
    setMessages(nextHistory)
    setInput('')
    setError('')
    setIsSending(true)

    try {
      const answer = await askGeminiAboutVideo(apiKey, fileRef, nextHistory)
      setMessages(prev => [...prev, { role: 'model', text: answer }])
    } catch (e) {
      setError(e instanceof Error ? e.message : t('videoChat.error'))
    } finally {
      setIsSending(false)
    }
  }

  const handleKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSend()
    }
  }

  return (
    <motion.div
      className="glass rounded-lg p-6"
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
    >
      <div className="flex items-center gap-2 mb-2">
        <MessageCircle className="h-5 w-5 text-blue-400" />
        <h3 className="text-xl font-semibold text-white">{t('videoChat.title')}</h3>
      </div>
      <p className="text-sm text-gray-400 mb-4">{t('videoChat.subtitle')}</p>

      <div className="space-y-3 max-h-80 overflow-y-auto mb-4 pr-1">
        {messages.length === 0 && (
          <p className="text-sm text-gray-500 italic">{t('videoChat.placeholder')}</p>
        )}
        {messages.map((msg, i) => (
          <div key={i} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
            <div
              className={`max-w-[85%] rounded-lg px-4 py-2 text-sm whitespace-pre-wrap ${
                msg.role === 'user'
                  ? 'bg-blue-600 text-white'
                  : 'glass-bg text-gray-200 border border-white/10'
              }`}
            >
              {msg.text}
            </div>
          </div>
        ))}
        {isSending && (
          <div className="flex justify-start">
            <div className="glass-bg border border-white/10 rounded-lg px-4 py-2 text-sm text-gray-400 flex items-center gap-2">
              <Loader2 className="h-4 w-4 animate-spin" />
              {t('videoChat.thinking')}
            </div>
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      {error && (
        <p className="text-sm text-red-400 mb-3">{error}</p>
      )}

      <div className="flex gap-2">
        <input
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={t('videoChat.inputPlaceholder')}
          disabled={isSending}
          className="flex-1 px-3 py-2 glass-input rounded-md text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-50"
        />
        <button
          onClick={handleSend}
          disabled={isSending || !input.trim()}
          className="px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed text-white rounded-md transition-colors flex items-center justify-center"
        >
          <Send className="h-4 w-4" />
        </button>
      </div>
    </motion.div>
  )
}

export default VideoChat
