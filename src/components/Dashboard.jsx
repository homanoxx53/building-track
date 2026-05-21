// ============================================================
// Building Track -- Owner Dashboard
// ============================================================
import { useState, useEffect } from 'react'
import { getMyProjects, signOut, joinByCode } from '../lib/supabase.js'
import { Plus, LogOut, HardHat, Building2, ChevronRight, Users, CheckCircle2, Clock, AlertCircle } from 'lucide-react'
import NewProject  from './NewProject.jsx'
import ProjectView from './ProjectView.jsx'

const STATUS_CONFIG = {
  pending:     { label: 'Not Started', color: 'text-gray-400',  bg: 'bg-gray-100',  icon: Clock },
  in_progress: { label: 'In Progress', color: 'text-blue-600',  bg: 'bg-blue-100',  icon: AlertCircle },
  submitted:   { label: 'For Review',  color: 'text-amber-600', bg: 'bg-amber-100', icon: AlertCircle },
  approved:    { label: 'Approved',    color: 'text-green-600', bg: 'bg-green-100', icon: CheckCircle2 },
  completed:   { label: 'Complete',    color: 'text-green-700', bg: 'bg-green-100', icon: CheckCircle2 },
}

function ProjectCard({ project, role, onClick }) {
  const stages = project.stages || []
  const done   = stages.filter(s => s.status === 'approved' || s.status === 'completed').length
  const total  = stages.length
  const pct    = total > 0 ? Math.round((done / total) * 100) : 0
  const active = stages.find(s => s.status === 'in_progress' || s.status === 'submitted')
  const cfg    = active ? STATUS_CONFIG[active.status] : STATUS_CONFIG['pending']
  const Icon   = cfg.icon

  return (
    <button
      onClick={onClick}
      className="w-full bg-white border border-gray-100 rounded-2xl p-4 text-left hover:border-blue-200 hover:shadow-sm transition-all group"
    >
      <div className="flex items-start justify-between mb-3">
        <div className="flex-1 min-w-0">
          <h3 className="font-semibold text-gray-900 truncate">{project.title}</h3>
          <p className="text-xs text-gray-400 mt-0.5 truncate">{project.address}</p>
        </div>
        <div className={`flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium ml-2 shrink-0 ${cfg.bg} ${cfg.color}`}>
          <Icon size={11} />
          {active ? active.name : 'Not started'}
        </div>
      </div>

      {/* Progress bar */}
      <div className="mb-3">
        <div className="flex justify-between text-xs text-gray-400 mb-1">
          <span>{done} of {total} stages done</span>
          <span>{pct}%</span>
        </div>
        <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
          <div
            className="h-full bg-blue-600 rounded-full transition-all"
            style={{ width: `${pct}%` }}
          />
        </div>
      </div>

      <div className="flex items-center justify-between">
        <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
          role === 'owner' ? 'bg-blue-50 text-blue-700' : 'bg-green-50 text-green-700'
        }`}>
          {role === 'owner' ? 'Owner' : role === 'contractor' ? 'Contractor' : 'Site Manager'}
        </span>
        <ChevronRight size={16} className="text-gray-300 group-hover:text-blue-500 transition-colors" />
      </div>
    </button>
  )
}

export default function Dashboard({ user, onLogout }) {
  const [projects,    setProjects]    = useState([])
  const [loading,     setLoading]     = useState(true)
  const [showNew,     setShowNew]     = useState(false)
  const [activeProject, setActiveProject] = useState(null)
  const [activeRole,  setActiveRole]  = useState(null)

  const loadProjects = async () => {
    setLoading(true)
    const { data } = await getMyProjects()
    setProjects(data || [])
    setLoading(false)
  }

  useEffect(() => { loadProjects() }, [])

  const handleLogout = async () => {
    await signOut()
    onLogout()
  }

  // Project detail view
  if (activeProject) {
    return (
      <ProjectView
        project={activeProject}
        role={activeRole}
        user={user}
        onBack={() => { setActiveProject(null); loadProjects() }}
      />
    )
  }

  // New project flow
  if (showNew) {
    return (
      <NewProject
        user={user}
        onCreated={(p) => { setShowNew(false); loadProjects() }}
        onCancel={() => setShowNew(false)}
      />
    )
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Top bar */}
      <div className="bg-white border-b border-gray-100 px-4 py-3 flex items-center justify-between sticky top-0 z-10">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 bg-blue-700 rounded-lg flex items-center justify-center">
            <HardHat size={16} className="text-white" />
          </div>
          <span className="font-bold text-gray-900">Building Track</span>
        </div>
        <button onClick={handleLogout} className="text-gray-400 hover:text-gray-600 transition-colors p-1">
          <LogOut size={18} />
        </button>
      </div>

      <div className="max-w-lg mx-auto px-4 py-6">
        {/* Greeting */}
        <div className="mb-6">
          <h2 className="text-xl font-bold text-gray-900">
            {user?.user_metadata?.full_name?.split(' ')[0]
              ? `Hello, ${user.user_metadata.full_name.split(' ')[0]}`
              : 'My Projects'}
          </h2>
          <p className="text-sm text-gray-400 mt-0.5">
            {projects.length > 0 ? `${projects.length} project${projects.length !== 1 ? 's' : ''} active` : 'No projects yet'}
          </p>
        </div>

        {/* Projects list */}
        {loading ? (
          <div className="space-y-3">
            {[1,2].map(i => (
              <div key={i} className="bg-white border border-gray-100 rounded-2xl p-4 animate-pulse">
                <div className="h-4 bg-gray-100 rounded w-2/3 mb-2" />
                <div className="h-3 bg-gray-100 rounded w-1/2 mb-3" />
                <div className="h-1.5 bg-gray-100 rounded" />
              </div>
            ))}
          </div>
        ) : projects.length > 0 ? (
          <div className="space-y-3 mb-6">
            {projects.map(({ role, project: p }) => (
              p && <ProjectCard
                key={p.id}
                project={p}
                role={role}
                onClick={() => { setActiveProject(p); setActiveRole(role) }}
              />
            ))}
          </div>
        ) : (
          <div className="text-center py-14">
            <div className="w-16 h-16 bg-blue-50 rounded-2xl flex items-center justify-center mx-auto mb-4">
              <Building2 size={28} className="text-blue-400" />
            </div>
            <h3 className="font-semibold text-gray-700 mb-1">No projects yet</h3>
            <p className="text-sm text-gray-400 mb-6">Create your first project or ask the site manager to share an invite code.</p>
          </div>
        )}

        {/* New project button */}
        <button
          onClick={() => setShowNew(true)}
          className="w-full flex items-center justify-center gap-2 py-3 bg-blue-700 text-white font-semibold rounded-2xl hover:bg-blue-800 transition-colors text-sm"
        >
          <Plus size={18} /> New Project
        </button>

        {/* Invite code join */}
        <JoinCodeEntry onJoined={loadProjects} />
      </div>
    </div>
  )
}

function JoinCodeEntry({ onJoined }) {
  const [code, setCode]       = useState('')
  const [open, setOpen]       = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError]     = useState(null)
  const handleJoin = async () => {
    if (!code.trim()) return
    setLoading(true)
    setError(null)
    const result = await joinByCode(code.trim().toUpperCase())
    if (result.error) { setError(result.error); setLoading(false); return }
    setLoading(false)
    setOpen(false)
    setCode('')
    onJoined()
  }

  if (!open) {
    return (
      <button onClick={() => setOpen(true)} className="w-full mt-3 py-3 text-sm text-gray-400 hover:text-blue-600 transition-colors">
        Have an invite code? Join a project →
      </button>
    )
  }

  return (
    <div className="mt-3 bg-white border border-gray-100 rounded-2xl p-4">
      <p className="text-sm font-medium text-gray-700 mb-2">Enter invite code</p>
      <div className="flex gap-2">
        <input
          value={code}
          onChange={e => setCode(e.target.value.toUpperCase().replace(/[^A-Z0-9-]/g, ''))}
          placeholder="e.g. TRACK-4X7K"
          className="flex-1 border border-gray-200 rounded-xl px-3 py-2 text-sm font-mono outline-none focus:border-blue-400"
          maxLength={12}
        />
        <button
          onClick={handleJoin}
          disabled={loading || !code.trim()}
          className="px-4 py-2 bg-blue-700 text-white text-sm font-medium rounded-xl disabled:opacity-50"
        >
          {loading ? '...' : 'Join'}
        </button>
      </div>
      {error && <p className="text-xs text-red-600 mt-2">{error}</p>}
    </div>
  )
}
