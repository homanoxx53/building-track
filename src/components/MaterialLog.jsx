// ============================================================
// Building Track -- Material Log (BOQ vs Actual)
// ============================================================
import { useState, useEffect } from 'react'
import { Package, Plus, X, Loader, TrendingUp, TrendingDown, Minus } from 'lucide-react'
import { getMaterialLogs, addMaterialLog, safeErrorMessage } from '../lib/supabase.js'

const UNITS = ['bags', 'tonnes', 'kg', 'm³', 'm²', 'metres', 'litres', 'pieces', 'sheets', 'rolls', 'other']

function VariancePill({ boq, actual }) {
  if (!boq) return null
  const diff = actual - boq
  const pct  = Math.round((diff / boq) * 100)
  if (Math.abs(pct) < 2) return <span className="text-xs text-gray-400">On track</span>
  const over = diff > 0
  return (
    <span className={`flex items-center gap-0.5 text-xs font-medium ${over ? 'text-red-500' : 'text-green-600'}`}>
      {over ? <TrendingUp size={11} /> : <TrendingDown size={11} />}
      {over ? '+' : ''}{pct}%
    </span>
  )
}

function AddMaterialSheet({ projectId, onAdded, onCancel }) {
  const [form,    setForm]    = useState({ item_name: '', unit: 'bags', boq_quantity: '', actual_quantity: '', notes: '' })
  const [loading, setLoading] = useState(false)
  const [error,   setError]   = useState(null)

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }))

  const handleSave = async () => {
    const name = form.item_name.trim().slice(0, 100)
    if (!name) { setError('Item name required'); return }

    const boqVal    = form.boq_quantity    !== '' ? parseFloat(form.boq_quantity)    : null
    const actualVal = form.actual_quantity !== '' ? parseFloat(form.actual_quantity) : 0

    if (boqVal !== null && (!isFinite(boqVal) || boqVal < 0)) {
      setError('BOQ quantity must be a positive number'); return
    }
    if (!isFinite(actualVal) || actualVal < 0) {
      setError('Actual quantity must be a positive number'); return
    }

    setLoading(true)
    setError(null)
    const { error: err } = await addMaterialLog({
      project_id:       projectId,
      item_name:        name,
      unit:             form.unit,
      boq_quantity:     boqVal,
      actual_quantity:  actualVal,
      notes:            form.notes.trim().slice(0, 500) || null,
    })
    if (err) { setError(safeErrorMessage(err, 'Failed to save. Please try again.')); setLoading(false); return }
    onAdded()
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/50" onClick={onCancel}>
      <div className="w-full max-w-md bg-white rounded-t-3xl p-5 pb-10 animate-slide-up" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-5">
          <h3 className="text-lg font-bold text-gray-900">Log Material</h3>
          <button onClick={onCancel} className="text-gray-400 p-1"><X size={20} /></button>
        </div>

        <div className="space-y-3">
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Material *</label>
            <input
              value={form.item_name}
              onChange={e => set('item_name', e.target.value)}
              placeholder="e.g. Dangote Cement"
              maxLength={100}
              className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm outline-none focus:border-blue-400"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">BOQ Qty</label>
              <input
                type="number"
                value={form.boq_quantity}
                onChange={e => set('boq_quantity', e.target.value)}
                placeholder="Planned"
                className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm outline-none focus:border-blue-400"
                min="0"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Actual Qty</label>
              <input
                type="number"
                value={form.actual_quantity}
                onChange={e => set('actual_quantity', e.target.value)}
                placeholder="Used so far"
                className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm outline-none focus:border-blue-400"
                min="0"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Unit</label>
            <select
              value={form.unit}
              onChange={e => set('unit', e.target.value)}
              className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm outline-none focus:border-blue-400 bg-white"
            >
              {UNITS.map(u => <option key={u} value={u}>{u}</option>)}
            </select>
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Notes</label>
            <textarea
              value={form.notes}
              onChange={e => set('notes', e.target.value)}
              placeholder="Supplier, batch, remarks…"
              rows={2}
              maxLength={500}
              className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm outline-none focus:border-blue-400 resize-none"
            />
          </div>
        </div>

        {error && <p className="mt-3 text-sm text-red-600">{error}</p>}

        <button
          onClick={handleSave}
          disabled={loading}
          className="mt-5 w-full py-3 bg-blue-700 text-white font-semibold rounded-2xl disabled:opacity-50 flex items-center justify-center gap-2"
        >
          {loading ? <><Loader size={16} className="animate-spin" /> Saving…</> : 'Save Material Log'}
        </button>
      </div>
    </div>
  )
}

export default function MaterialLog({ project, role }) {
  const [logs,     setLogs]     = useState([])
  const [loading,  setLoading]  = useState(true)
  const [showAdd,  setShowAdd]  = useState(false)

  const loadLogs = async () => {
    setLoading(true)
    const { data } = await getMaterialLogs(project.id)
    setLogs(data || [])
    setLoading(false)
  }

  useEffect(() => { loadLogs() }, [project.id])  // eslint-disable-line

  if (loading) {
    return (
      <div className="p-4 space-y-3">
        {[1,2,3].map(i => (
          <div key={i} className="bg-white border border-gray-100 rounded-2xl p-4 animate-pulse">
            <div className="h-4 bg-gray-100 rounded w-1/2 mb-2" />
            <div className="h-3 bg-gray-100 rounded w-1/3" />
          </div>
        ))}
      </div>
    )
  }

  return (
    <div className="p-4">
      {logs.length === 0 ? (
        <div className="text-center py-12">
          <div className="w-16 h-16 bg-blue-50 rounded-2xl flex items-center justify-center mx-auto mb-4">
            <Package size={24} className="text-blue-400" />
          </div>
          <h3 className="font-semibold text-gray-700 mb-1">No materials logged</h3>
          <p className="text-sm text-gray-400 mb-6">Track cement, steel, blocks and other materials against your BOQ.</p>
        </div>
      ) : (
        <div className="space-y-2 mb-4">
          {/* Header */}
          <div className="grid grid-cols-[1fr_auto_auto_auto] gap-2 px-1 pb-1">
            <span className="text-xs font-medium text-gray-400">Material</span>
            <span className="text-xs font-medium text-gray-400 text-right">BOQ</span>
            <span className="text-xs font-medium text-gray-400 text-right">Actual</span>
            <span className="text-xs font-medium text-gray-400 text-right">±</span>
          </div>

          {logs.map(log => (
            <div key={log.id} className="bg-white border border-gray-100 rounded-2xl p-4">
              <div className="grid grid-cols-[1fr_auto_auto_auto] gap-2 items-center">
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-gray-900 truncate">{log.item_name}</p>
                  <p className="text-xs text-gray-400">{log.unit}</p>
                </div>
                <div className="text-right">
                  <p className="text-sm text-gray-500">{log.boq_quantity ?? '—'}</p>
                </div>
                <div className="text-right">
                  <p className="text-sm font-semibold text-gray-900">{log.actual_quantity ?? 0}</p>
                </div>
                <div className="text-right min-w-[3.5rem]">
                  <VariancePill boq={log.boq_quantity} actual={log.actual_quantity || 0} />
                </div>
              </div>
              {log.notes && <p className="text-xs text-gray-400 mt-2">{log.notes}</p>}
            </div>
          ))}
        </div>
      )}

      {/* Add button — contractors + managers */}
      {role !== 'owner' && (
        <button
          onClick={() => setShowAdd(true)}
          className="w-full flex items-center justify-center gap-2 py-3 bg-blue-700 text-white font-semibold rounded-2xl hover:bg-blue-800 transition-colors text-sm"
        >
          <Plus size={18} /> Log Material
        </button>
      )}

      {showAdd && (
        <AddMaterialSheet
          projectId={project.id}
          onAdded={() => { setShowAdd(false); loadLogs() }}
          onCancel={() => setShowAdd(false)}
        />
      )}
    </div>
  )
}
