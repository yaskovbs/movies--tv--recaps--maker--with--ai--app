import { useState, useEffect } from 'react'
import { motion } from 'framer-motion'
import { useTranslation } from 'react-i18next'
import { User, LogOut, AlertCircle, Loader2 } from 'lucide-react'
import { supabase, ensureSession, isPermanentUser, type SupabaseUser } from '../lib/supabase'
import { Button } from './ui/button'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from './ui/dialog'
import { Input } from './ui/input'

// Optional sign-in - a simple email + password form (no Google/social
// buttons, per an explicit request to keep it minimal). Nothing else in the
// app requires signing in: every visitor already has a real, if anonymous,
// Supabase session (see ensureSession in lib/supabase.ts), so saving/rating
// recaps always works. "Signing up" here upgrades that same anonymous
// session in place (supabase.auth.updateUser) rather than creating a
// separate account, so existing history carries over automatically instead
// of being orphaned. Signing in only matters for following that account
// across devices, and is required for the personalized fine-tuning feature.
const AuthPanel = () => {
  const { t } = useTranslation()
  const [user, setUser] = useState<SupabaseUser | null>(null)
  const [open, setOpen] = useState(false)
  const [mode, setMode] = useState<'signin' | 'signup'>('signin')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    ensureSession().then(setUser)
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null)
    })
    return () => subscription.unsubscribe()
  }, [])

  const resetForm = () => {
    setEmail('')
    setPassword('')
    setError('')
  }

  const handleSubmit = async () => {
    setLoading(true)
    setError('')
    try {
      if (mode === 'signup') {
        // Upgrades the current anonymous session to a real account in place -
        // same user ID, so anything already saved under it stays attached.
        const { error: err } = await supabase.auth.updateUser({ email, password })
        if (err) throw err
      } else {
        const { error: err } = await supabase.auth.signInWithPassword({ email, password })
        if (err) throw err
      }
      setOpen(false)
      resetForm()
    } catch (err) {
      setError(err instanceof Error ? err.message : t('auth.genericError'))
    } finally {
      setLoading(false)
    }
  }

  const handleLogout = async () => {
    await supabase.auth.signOut()
    // Immediately re-establish an anonymous session so saving/rating keeps
    // working without forcing anyone back through the sign-in form.
    setUser(await ensureSession())
  }

  if (isPermanentUser(user)) {
    return (
      <div className="flex items-center gap-1.5">
        <span
          className="hidden sm:inline text-xs text-gray-300 max-w-[140px] truncate"
          title={user!.email}
        >
          {user!.email}
        </span>
        <Button
          variant="ghost"
          size="icon"
          onClick={handleLogout}
          title={t('auth.signOut')}
          className="text-gray-300 hover:text-white hover:bg-white/10"
        >
          <LogOut className="h-4 w-4" />
        </Button>
      </div>
    )
  }

  return (
    <>
      <motion.button
        onClick={() => setOpen(true)}
        className="flex items-center px-3 py-2 bg-white/5 hover:bg-white/10 border border-white/10 rounded-lg transition-colors"
        whileHover={{ scale: 1.05 }}
        whileTap={{ scale: 0.95 }}
      >
        <User className="h-4 w-4 sm:ml-2" />
        <span className="hidden sm:inline text-sm">{t('auth.signInButton')}</span>
      </motion.button>

      <Dialog open={open} onOpenChange={(next) => { setOpen(next); if (!next) resetForm() }}>
        <DialogContent className="glass-strong border-white/15 text-white">
          <DialogHeader>
            <DialogTitle>{mode === 'signin' ? t('auth.signInTitle') : t('auth.signUpTitle')}</DialogTitle>
          </DialogHeader>

          <div className="space-y-4">
            <p className="text-xs text-gray-400">{t('auth.optionalHint')}</p>

            {error && (
              <div className="flex gap-2 p-3 bg-red-900/20 border border-red-600 rounded text-sm text-red-200">
                <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
                {error}
              </div>
            )}

            <div>
              <label className="block text-sm font-medium mb-2">{t('auth.emailLabel')}</label>
              <Input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder={t('auth.emailPlaceholder')}
                className="glass-input text-white"
                dir="ltr"
              />
            </div>

            <div>
              <label className="block text-sm font-medium mb-2">{t('auth.passwordLabel')}</label>
              <Input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder={t('auth.passwordPlaceholder')}
                className="glass-input text-white"
                dir="ltr"
              />
            </div>

            <Button
              onClick={handleSubmit}
              disabled={loading || !email.trim() || !password.trim()}
              className="w-full"
            >
              {loading && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              {mode === 'signin' ? t('auth.signInButton') : t('auth.signUpButton')}
            </Button>

            <button
              type="button"
              onClick={() => { setMode(mode === 'signin' ? 'signup' : 'signin'); setError('') }}
              className="text-xs text-blue-400 hover:text-blue-300 block mx-auto"
            >
              {mode === 'signin' ? t('auth.switchToSignUp') : t('auth.switchToSignIn')}
            </button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  )
}

export default AuthPanel
