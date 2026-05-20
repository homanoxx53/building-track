// ============================================================
// Building Track -- Root App + Auth Routing
// ============================================================
import { useState, useEffect } from 'react'
import { supabase, isConfigured } from './lib/supabase.js'
import Auth        from './components/Auth.jsx'
import Dashboard   from './components/Dashboard.jsx'
import JoinProject from './components/JoinProject.jsx'

export default function App() {
  const [user,       setUser]       = useState(null)
  const [loading,    setLoading]    = useState(true)
  // FIX BUG 15: store invite code in state so it can be cleared after join
  const [inviteCode, setInviteCode] = useState(
    () => new URLSearchParams(window.location.search).get('join')
  )

  useEffect(() => {
    if (!isConfigured) { setLoading(false); return }

    supabase.auth.getSession().then(({ data: { session } }) => {
      setUser(session?.user ?? null)
      setLoading(false)
    })

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null)
    })
    return () => subscription.unsubscribe()
  }, [])

  // Clear invite code from URL without a page reload
  const clearInvite = () => {
    window.history.replaceState({}, '', '/')
    setInviteCode(null)
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-white">
        <div className="flex flex-col items-center gap-3">
          <div className="w-10 h-10 bg-blue-700 rounded-xl flex items-center justify-center">
            <span className="text-white font-black text-sm">BT</span>
          </div>
          <div className="w-5 h-5 border-2 border-blue-700 border-t-transparent rounded-full animate-spin" />
        </div>
      </div>
    )
  }

  // Not logged in + invite code → show auth with invite context
  if (inviteCode && !user) {
    return <Auth inviteCode={inviteCode} onAuth={setUser} />
  }

  // Logged in + invite code → process the join, then go to dashboard
  if (inviteCode && user) {
    return (
      <JoinProject
        code={inviteCode}
        onJoined={clearInvite}   // clears code → falls through to Dashboard
        onCancel={clearInvite}
      />
    )
  }

  if (!user) return <Auth onAuth={setUser} />

  return <Dashboard user={user} onLogout={() => setUser(null)} />
}
