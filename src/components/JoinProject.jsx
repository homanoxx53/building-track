// ============================================================
// Building Track -- Join Project via Invite Code (full screen)
// ============================================================
import { useState, useEffect } from 'react'
import { HardHat, Loader, CheckCircle2 } from 'lucide-react'
import { joinByCode } from '../lib/supabase.js'

export default function JoinProject({ code: initialCode, onJoined, onCancel }) {
  const [code,    setCode]    = useState(initialCode || '')
  const [loading, setLoading] = useState(false)
  const [success, setSuccess] = useState(false)
  const [error,   setError]   = useState(null)

  // Auto-submit if code came in via URL param
  useEffect(() => {
    if (initialCode && initialCode.length >= 5) handleJoin(initialCode)
  }, [])  // eslint-disable-line

  const handleJoin = async (codeToUse = code) => {
    if (!codeToUse.trim()) return
    setLoading(true)
    setError(null)
    const result = await joinByCode(codeToUse.trim().toUpperCase())
    if (result.error) {
      // joinByCode already returns a sanitised string via safeErrorMessage
      setError(typeof result.error === 'string' ? result.error : 'Invalid or expired invite code')
      setLoading(false)
      return
    }
    setSuccess(true)
    setTimeout(() => onJoined(), 1500)
  }

  if (success) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-6">
        <div className="text-center">
          <div className="w-16 h-16 bg-green-100 rounded-2xl flex items-center justify-center mx-auto mb-4">
            <CheckCircle2 size={32} className="text-green-600" />
          </div>
          <h2 className="text-xl font-bold text-gray-900 mb-1">You're in!</h2>
          <p className="text-sm text-gray-400">Taking you to the project…</p>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      {/* Header */}
      <div className="bg-blue-700 px-6 pt-12 pb-10 text-white text-center">
        <div className="w-14 h-14 bg-white/20 rounded-2xl flex items-center justify-center mx-auto mb-4">
          <HardHat size={28} className="text-white" />
        </div>
        <h1 className="text-2xl font-bold mb-1">Join a Project</h1>
        <p className="text-blue-200 text-sm">Enter the invite code your site manager or owner shared with you</p>
      </div>

      <div className="flex-1 max-w-sm mx-auto w-full px-6 py-8">
        <div className="mb-4">
          <label className="block text-sm font-medium text-gray-700 mb-2">Invite Code</label>
          <input
            value={code}
            onChange={e => setCode(e.target.value.toUpperCase().replace(/[^A-Z0-9-]/g, ''))}
            onKeyDown={e => e.key === 'Enter' && handleJoin()}
            placeholder="e.g. TRACK-4X7K"
            className="w-full border-2 border-gray-200 rounded-xl px-4 py-3 text-center text-xl font-mono font-bold tracking-widest outline-none focus:border-blue-500 bg-white"
            maxLength={12}
            autoFocus
          />
          {error && <p className="mt-2 text-sm text-red-600 text-center">{error}</p>}
        </div>

        <button
          onClick={() => handleJoin()}
          disabled={loading || !code.trim()}
          className="w-full py-3.5 bg-blue-700 text-white font-bold rounded-2xl hover:bg-blue-800 transition-colors disabled:opacity-50 flex items-center justify-center gap-2 text-base"
        >
          {loading ? <><Loader size={18} className="animate-spin" /> Joining…</> : 'Join Project'}
        </button>

        <button
          onClick={onCancel}
          className="w-full mt-3 py-3 text-sm text-gray-400 hover:text-gray-600 transition-colors"
        >
          Cancel
        </button>
      </div>
    </div>
  )
}
