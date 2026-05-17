// ============================================================
// Building Track -- Root App + Routing
// ============================================================
import { useState, useEffect } from 'react'
import { supabase, isConfigured } from './lib/supabase.js'
import Auth     from './components/Auth.jsx'
import Dashboard from './components/Dashboard.jsx'
import JoinProject from './components/JoinProject.jsx'

export default function App() {
  const [user,    setUser]    = useState(null)
  const [loading, setLoading] = useState(true)

  // Check for invite code in URL before rendering
  const inviteCode = new URLSearchParams(window.location.search).get('join')

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

  // Invite join flow -- show join screen even if not logged in
  if (inviteCode && !user) {
    return <Auth inviteCode={inviteCode} onAuth={setUser} />
  }
  if (inviteCode && user) {
    return <JoinProject code={inviteCode} user={user} onJoined={() => {
      window.history.replaceState({}, '', '/')
    }} />
  }

  if (!user) return <Auth onAuth={setUser} />

  return <Dashboard user={user} onLogout={() => setUser(null)} />
}
