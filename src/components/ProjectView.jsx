// ============================================================
// Building Track -- Project View (tabs: Progress / Materials / Team)
// ============================================================
import { useState, useEffect } from 'react'
import { ArrowLeft, Share2, LayoutList, Package, Users2, Copy, Check } from 'lucide-react'
import { getProjectDetail, generateInviteCode } from '../lib/supabase.js'
import StageList    from './StageList.jsx'
import MaterialLog  from './MaterialLog.jsx'
import ProgressFeed from './ProgressFeed.jsx'

const TABS = [
  { id: 'stages',    label: 'Stages',    Icon: LayoutList },
  { id: 'materials', label: 'Materials', Icon: Package },
  { id: 'feed',      label: 'Feed',      Icon: Users2 },
]

export default function ProjectView({ project: initial, role, user, onBack }) {
  const [project,   setProject]   = useState(initial)
  const [tab,       setTab]       = useState('stages')
  const [shareOpen, setShareOpen] = useState(false)
  const [invite,    setInvite]    = useState(null)
  const [copied,    setCopied]    = useState(false)
  const [loading,   setLoading]   = useState(false)

  // Refresh full project detail (with stages + member list)
  const refresh = async () => {
    const { data } = await getProjectDetail(project.id)
    if (data) setProject(data)
  }

  useEffect(() => { refresh() }, [])  // eslint-disable-line

  // Generate invite link
  const handleShare = async () => {
    setShareOpen(true)
    if (!invite) {
      setLoading(true)
      const { data } = await generateInviteCode(project.id)
      setInvite(data?.invite_code || null)
      setLoading(false)
    }
  }

  const handleCopy = () => {
    const base = window.location.origin
    const text = invite
      ? `Join my Building Track project "${project.title}":\n${base}/?join=${invite}`
      : ''
    navigator.clipboard.writeText(text).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    })
  }

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      {/* Top bar */}
      <div className="bg-white border-b border-gray-100 px-4 py-3 flex items-center gap-3 sticky top-0 z-10">
        <button onClick={onBack} className="text-gray-400 hover:text-gray-600 p-1 -ml-1">
          <ArrowLeft size={20} />
        </button>
        <div className="flex-1 min-w-0">
          <h1 className="font-bold text-gray-900 truncate">{project.title}</h1>
          <p className="text-xs text-gray-400 truncate">{project.address}</p>
        </div>
        {(role === 'owner' || role === 'manager') && (
          <button onClick={handleShare} className="text-gray-400 hover:text-blue-600 transition-colors p-1">
            <Share2 size={18} />
          </button>
        )}
      </div>

      {/* Tabs */}
      <div className="bg-white border-b border-gray-100 flex">
        {TABS.map(({ id, label, Icon }) => (
          <button
            key={id}
            onClick={() => setTab(id)}
            className={`flex-1 flex items-center justify-center gap-1.5 py-3 text-xs font-semibold transition-colors border-b-2 ${
              tab === id
                ? 'border-blue-600 text-blue-600'
                : 'border-transparent text-gray-400 hover:text-gray-600'
            }`}
          >
            <Icon size={14} /> {label}
          </button>
        ))}
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto">
        {tab === 'stages'    && <StageList    project={project} role={role} user={user} onRefresh={refresh} />}
        {tab === 'materials' && <MaterialLog  project={project} role={role} />}
        {tab === 'feed'      && <ProgressFeed project={project} role={role} user={user} />}
      </div>

      {/* Share sheet */}
      {shareOpen && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/50" onClick={() => setShareOpen(false)}>
          <div
            className="w-full max-w-md bg-white rounded-t-3xl p-6 pb-10 animate-slide-up"
            onClick={e => e.stopPropagation()}
          >
            <h3 className="text-lg font-bold text-gray-900 mb-1">Invite Team Members</h3>
            <p className="text-sm text-gray-400 mb-5">Share this code or link so contractors and site managers can join.</p>

            {loading ? (
              <div className="h-14 bg-gray-100 rounded-xl animate-pulse" />
            ) : invite ? (
              <>
                <div className="bg-blue-50 border-2 border-blue-200 rounded-xl p-4 text-center mb-4">
                  <p className="text-2xl font-bold font-mono tracking-widest text-blue-700">{invite}</p>
                  <p className="text-xs text-blue-400 mt-1">Invite Code</p>
                </div>
                <button
                  onClick={handleCopy}
                  className="w-full flex items-center justify-center gap-2 py-3 bg-blue-700 text-white font-semibold rounded-2xl hover:bg-blue-800 transition-colors"
                >
                  {copied ? <><Check size={16} /> Copied!</> : <><Copy size={16} /> Copy Link for WhatsApp</>}
                </button>
              </>
            ) : (
              <p className="text-sm text-red-500 text-center">Failed to generate code. Try again.</p>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
