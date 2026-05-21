// ============================================================
// Building Track -- Auth (Sign In / Sign Up)
// ============================================================
import { useState } from 'react'
import { signIn, signUp, safeErrorMessage } from '../lib/supabase.js'
import { HardHat, Eye, EyeOff } from 'lucide-react'

export default function Auth({ onAuth, inviteCode = null }) {
  const [mode,     setMode]     = useState('signin')
  const [email,    setEmail]    = useState('')
  const [password, setPassword] = useState('')
  const [name,     setName]     = useState('')
  const [showPw,   setShowPw]   = useState(false)
  const [loading,  setLoading]  = useState(false)
  const [error,    setError]    = useState(null)
  const [done,     setDone]     = useState(false)

  const handleSubmit = async (e) => {
    e.preventDefault()
    setLoading(true)
    setError(null)

    if (mode === 'signup') {
      const { data, error: err } = await signUp(email.trim().slice(0, 254), password, name.trim().slice(0, 100))
      if (err) { setError(safeErrorMessage(err, 'Sign up failed. Please try again.')); setLoading(false); return }
      if (data?.user && !data.session) { setDone(true); setLoading(false); return }
      onAuth(data.user)
    } else {
      const { data, error: err } = await signIn(email.trim().slice(0, 254), password)
      if (err) { setError(safeErrorMessage(err, 'Sign in failed. Please check your credentials.')); setLoading(false); return }
      if (!data?.user) { setError('Sign in failed. Please try again.'); setLoading(false); return }
      onAuth(data.user)
    }
    setLoading(false)
  }

  if (done) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 px-4">
        <div className="bg-white rounded-2xl p-8 max-w-sm w-full text-center shadow-sm border border-gray-100">
          <div className="w-14 h-14 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <span className="text-2xl">📬</span>
          </div>
          <h2 className="font-bold text-lg text-gray-900 mb-2">Check your email</h2>
          <p className="text-sm text-gray-500">We sent a confirmation link to <strong>{email}</strong>. Click it to activate your account.</p>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 px-4">
      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 w-full max-w-sm overflow-hidden">

        {/* Header */}
        <div className="bg-blue-700 px-6 py-8 text-center">
          <div className="w-12 h-12 bg-white/20 rounded-xl flex items-center justify-center mx-auto mb-3">
            <HardHat size={24} className="text-white" />
          </div>
          <h1 className="text-xl font-bold text-white">Building Track</h1>
          <p className="text-blue-200 text-sm mt-1">
            {inviteCode ? 'Create an account to join the project' : 'Remote site monitoring'}
          </p>
        </div>

        {/* Toggle */}
        <div className="flex border-b border-gray-100">
          {['signin', 'signup'].map(m => (
            <button
              key={m}
              onClick={() => { setMode(m); setError(null) }}
              className={`flex-1 py-3 text-sm font-medium transition-colors ${
                mode === m ? 'text-blue-700 border-b-2 border-blue-700' : 'text-gray-400 hover:text-gray-600'
              }`}
            >
              {m === 'signin' ? 'Sign In' : 'Create Account'}
            </button>
          ))}
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          {mode === 'signup' && (
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Full Name</label>
              <input
                type="text"
                value={name}
                onChange={e => setName(e.target.value)}
                required
                maxLength={100}
                placeholder="e.g. Kwame Asante"
                className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-50"
              />
            </div>
          )}
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Email</label>
            <input
              type="email"
              value={email}
              onChange={e => setEmail(e.target.value)}
              required
              maxLength={254}
              placeholder="you@example.com"
              className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-50"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Password</label>
            <div className="relative">
              <input
                type={showPw ? 'text' : 'password'}
                value={password}
                onChange={e => setPassword(e.target.value)}
                required
                minLength={8}
                maxLength={128}
                placeholder="Min. 8 characters"
                className="w-full border border-gray-200 rounded-xl px-3 py-2.5 pr-10 text-sm outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-50"
              />
              <button type="button" onClick={() => setShowPw(p => !p)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">
                {showPw ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>
            </div>
          </div>

          {error && <p className="text-sm text-red-600 bg-red-50 rounded-xl px-3 py-2">{error}</p>}

          <button
            type="submit"
            disabled={loading}
            className="w-full bg-blue-700 text-white font-semibold py-3 rounded-xl hover:bg-blue-800 transition-colors disabled:opacity-60 text-sm"
          >
            {loading ? 'Please wait...' : mode === 'signin' ? 'Sign In' : 'Create Account'}
          </button>
        </form>
      </div>
    </div>
  )
}
