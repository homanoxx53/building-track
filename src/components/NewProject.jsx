// ============================================================
// Building Track -- New Project Wizard
// ============================================================
import { useState } from 'react'
import { ArrowLeft, Building2, MapPin, Loader } from 'lucide-react'
import { createProject } from '../lib/supabase.js'

const DEFAULT_STAGES = [
  'Foundation',
  'Block Work / Walling',
  'Roofing',
  'Electrical Rough-In',
  'Plumbing Rough-In',
  'Plastering',
  'Tiling',
  'Painting',
  'Final Finishing',
]

export default function NewProject({ user, onCreated, onCancel }) {
  const [step,    setStep]    = useState(1)   // 1 = details, 2 = stages
  const [form,    setForm]    = useState({ title: '', address: '', description: '' })
  const [stages,  setStages]  = useState(DEFAULT_STAGES.map(name => ({ name, include: true })))
  const [loading, setLoading] = useState(false)
  const [error,   setError]   = useState(null)

  const handleNext = () => {
    if (!form.title.trim()) { setError('Project name is required'); return }
    setError(null)
    setStep(2)
  }

  const toggleStage = (i) => {
    setStages(prev => prev.map((s, idx) => idx === i ? { ...s, include: !s.include } : s))
  }

  const handleCreate = async () => {
    const selectedStages = stages.filter(s => s.include).map((s, i) => ({ name: s.name, order_index: i }))
    if (selectedStages.length === 0) { setError('Select at least one stage'); return }
    setLoading(true)
    setError(null)
    const result = await createProject({
      title:       form.title.trim(),
      address:     form.address.trim(),
      description: form.description.trim(),
      stages:      selectedStages,
      owner_id:    user.id,
    })
    if (result.error) { setError(result.error.message || 'Failed to create project'); setLoading(false); return }
    setLoading(false)
    onCreated(result.data)
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Top bar */}
      <div className="bg-white border-b border-gray-100 px-4 py-3 flex items-center gap-3 sticky top-0 z-10">
        <button onClick={step === 1 ? onCancel : () => setStep(1)} className="text-gray-400 hover:text-gray-600 transition-colors p-1 -ml-1">
          <ArrowLeft size={20} />
        </button>
        <div>
          <h1 className="font-bold text-gray-900 leading-tight">New Project</h1>
          <p className="text-xs text-gray-400">Step {step} of 2</p>
        </div>
      </div>

      {/* Progress */}
      <div className="h-1 bg-gray-100">
        <div className="h-full bg-blue-600 transition-all" style={{ width: step === 1 ? '50%' : '100%' }} />
      </div>

      <div className="max-w-lg mx-auto px-4 py-6">
        {step === 1 ? (
          <>
            <div className="mb-6">
              <h2 className="text-lg font-bold text-gray-900 mb-1">Project Details</h2>
              <p className="text-sm text-gray-400">Give your project a name so your team can identify it.</p>
            </div>

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Project Name *</label>
                <div className="relative">
                  <Building2 size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                  <input
                    value={form.title}
                    onChange={e => setForm(f => ({ ...f, title: e.target.value }))}
                    placeholder="e.g. Accra Family House"
                    className="w-full pl-9 pr-4 py-3 border border-gray-200 rounded-xl text-sm outline-none focus:border-blue-400 bg-white"
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Site Address</label>
                <div className="relative">
                  <MapPin size={16} className="absolute left-3 top-3 text-gray-400" />
                  <textarea
                    value={form.address}
                    onChange={e => setForm(f => ({ ...f, address: e.target.value }))}
                    placeholder="Full address or plot description"
                    rows={2}
                    className="w-full pl-9 pr-4 py-3 border border-gray-200 rounded-xl text-sm outline-none focus:border-blue-400 bg-white resize-none"
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Description <span className="text-gray-400 font-normal">(optional)</span></label>
                <textarea
                  value={form.description}
                  onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
                  placeholder="Brief notes about the project scope"
                  rows={3}
                  className="w-full px-4 py-3 border border-gray-200 rounded-xl text-sm outline-none focus:border-blue-400 bg-white resize-none"
                />
              </div>
            </div>

            {error && <p className="mt-3 text-sm text-red-600">{error}</p>}

            <button
              onClick={handleNext}
              className="mt-6 w-full py-3 bg-blue-700 text-white font-semibold rounded-2xl hover:bg-blue-800 transition-colors"
            >
              Next: Set Stages →
            </button>
          </>
        ) : (
          <>
            <div className="mb-6">
              <h2 className="text-lg font-bold text-gray-900 mb-1">Construction Stages</h2>
              <p className="text-sm text-gray-400">Select the stages that apply to your project. You can add more later.</p>
            </div>

            <div className="space-y-2 mb-6">
              {stages.map((s, i) => (
                <button
                  key={s.name}
                  onClick={() => toggleStage(i)}
                  className={`w-full flex items-center justify-between px-4 py-3 rounded-xl border-2 transition-all text-sm font-medium text-left ${
                    s.include
                      ? 'border-blue-500 bg-blue-50 text-blue-700'
                      : 'border-gray-100 bg-white text-gray-500'
                  }`}
                >
                  <span>{i + 1}. {s.name}</span>
                  <span className={`w-5 h-5 rounded-full border-2 flex items-center justify-center shrink-0 ${
                    s.include ? 'border-blue-500 bg-blue-500' : 'border-gray-300'
                  }`}>
                    {s.include && <span className="text-white text-xs">✓</span>}
                  </span>
                </button>
              ))}
            </div>

            <p className="text-xs text-gray-400 mb-4 text-center">
              {stages.filter(s => s.include).length} stages selected
            </p>

            {error && <p className="mb-3 text-sm text-red-600 text-center">{error}</p>}

            <button
              onClick={handleCreate}
              disabled={loading}
              className="w-full py-3 bg-blue-700 text-white font-semibold rounded-2xl hover:bg-blue-800 transition-colors disabled:opacity-60 flex items-center justify-center gap-2"
            >
              {loading ? <><Loader size={16} className="animate-spin" /> Creating…</> : 'Create Project'}
            </button>
          </>
        )}
      </div>
    </div>
  )
}
