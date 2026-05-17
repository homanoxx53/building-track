// ============================================================
// Building Track -- Stage List + Approval Gate
// ============================================================
import { useState } from 'react'
import { CheckCircle2, Clock, AlertCircle, ChevronDown, ChevronUp, Camera, Loader, ThumbsUp } from 'lucide-react'
import PhotoUpload from './PhotoUpload.jsx'
import { approveStage, updateStageStatus } from '../lib/supabase.js'

const STATUS = {
  pending:     { label: 'Not Started', color: 'text-gray-400',  bg: 'bg-gray-100',  Icon: Clock },
  in_progress: { label: 'In Progress', color: 'text-blue-600',  bg: 'bg-blue-100',  Icon: AlertCircle },
  submitted:   { label: 'For Review',  color: 'text-amber-600', bg: 'bg-amber-100', Icon: AlertCircle },
  approved:    { label: 'Approved',    color: 'text-green-600', bg: 'bg-green-100', Icon: CheckCircle2 },
  completed:   { label: 'Complete',    color: 'text-green-700', bg: 'bg-green-100', Icon: CheckCircle2 },
}

function StageCard({ stage, role, projectId, onRefresh }) {
  const [open,    setOpen]    = useState(false)
  const [loading, setLoading] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [showUpload, setShowUpload] = useState(false)

  const cfg  = STATUS[stage.status] || STATUS.pending
  const Icon = cfg.Icon

  const canStart   = role !== 'owner' && stage.status === 'pending'
  const canSubmit  = role !== 'owner' && stage.status === 'in_progress'
  const canApprove = role === 'owner' && stage.status === 'submitted'

  const handleStart = async () => {
    setLoading(true)
    await updateStageStatus(stage.id, 'in_progress')
    setLoading(false)
    onRefresh()
  }

  const handleSubmit = async () => {
    setLoading(true)
    await updateStageStatus(stage.id, 'submitted')
    setLoading(false)
    onRefresh()
  }

  const handleApprove = async () => {
    setLoading(true)
    await approveStage(stage.id)
    setLoading(false)
    onRefresh()
  }

  return (
    <div className="bg-white border border-gray-100 rounded-2xl overflow-hidden">
      <button
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-center gap-3 p-4 text-left"
      >
        <div className={`w-8 h-8 rounded-xl flex items-center justify-center shrink-0 ${cfg.bg}`}>
          <Icon size={15} className={cfg.color} />
        </div>
        <div className="flex-1 min-w-0">
          <p className="font-semibold text-gray-900 text-sm">{stage.name}</p>
          <p className={`text-xs font-medium ${cfg.color}`}>{cfg.label}</p>
        </div>
        {open ? <ChevronUp size={16} className="text-gray-300" /> : <ChevronDown size={16} className="text-gray-300" />}
      </button>

      {open && (
        <div className="border-t border-gray-50 px-4 py-3 space-y-3">
          {/* Photo thumbnails */}
          {stage.photos?.length > 0 && (
            <div className="flex gap-2 overflow-x-auto pb-1">
              {stage.photos.map((ph, i) => (
                <img
                  key={i}
                  src={ph.url}
                  alt=""
                  className="w-20 h-20 object-cover rounded-xl shrink-0"
                />
              ))}
            </div>
          )}

          {/* Notes */}
          {stage.notes && <p className="text-xs text-gray-500">{stage.notes}</p>}

          {/* Actions */}
          <div className="flex gap-2 flex-wrap">
            {/* Photo upload button (contractor / manager only) */}
            {role !== 'owner' && (stage.status === 'in_progress' || stage.status === 'submitted') && (
              <button
                onClick={() => setShowUpload(true)}
                className="flex items-center gap-1.5 px-3 py-2 bg-gray-100 text-gray-600 text-xs font-medium rounded-xl hover:bg-gray-200 transition-colors"
              >
                <Camera size={13} /> Add Photo
              </button>
            )}

            {canStart && (
              <button
                onClick={handleStart}
                disabled={loading}
                className="flex items-center gap-1.5 px-3 py-2 bg-blue-600 text-white text-xs font-semibold rounded-xl disabled:opacity-60"
              >
                {loading ? <Loader size={13} className="animate-spin" /> : null} Start Stage
              </button>
            )}

            {canSubmit && (
              <button
                onClick={handleSubmit}
                disabled={loading}
                className="flex items-center gap-1.5 px-3 py-2 bg-amber-500 text-white text-xs font-semibold rounded-xl disabled:opacity-60"
              >
                {loading ? <Loader size={13} className="animate-spin" /> : null} Submit for Review
              </button>
            )}

            {canApprove && (
              <button
                onClick={handleApprove}
                disabled={loading}
                className="flex items-center gap-1.5 px-3 py-2 bg-green-600 text-white text-xs font-semibold rounded-xl disabled:opacity-60"
              >
                {loading ? <Loader size={13} className="animate-spin" /> : <ThumbsUp size={13} />}
                Approve Stage
              </button>
            )}
          </div>
        </div>
      )}

      {/* Photo upload sheet */}
      {showUpload && (
        <PhotoUpload
          stageId={stage.id}
          projectId={projectId}
          onDone={() => { setShowUpload(false); onRefresh() }}
          onCancel={() => setShowUpload(false)}
        />
      )}
    </div>
  )
}

export default function StageList({ project, role, user, onRefresh }) {
  const stages = project.stages || []

  if (stages.length === 0) {
    return (
      <div className="p-6 text-center">
        <p className="text-sm text-gray-400">No stages defined for this project yet.</p>
      </div>
    )
  }

  return (
    <div className="p-4 space-y-3">
      {/* Progress summary */}
      <div className="bg-white border border-gray-100 rounded-2xl p-4">
        {(() => {
          const done  = stages.filter(s => s.status === 'approved' || s.status === 'completed').length
          const total = stages.length
          const pct   = total > 0 ? Math.round((done / total) * 100) : 0
          return (
            <>
              <div className="flex justify-between text-sm font-medium mb-2">
                <span className="text-gray-700">Overall Progress</span>
                <span className="text-blue-600">{pct}%</span>
              </div>
              <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                <div className="h-full bg-blue-600 rounded-full transition-all" style={{ width: `${pct}%` }} />
              </div>
              <p className="text-xs text-gray-400 mt-2">{done} of {total} stages approved</p>
            </>
          )
        })()}
      </div>

      {stages.map(stage => (
        <StageCard
          key={stage.id}
          stage={stage}
          role={role}
          projectId={project.id}
          onRefresh={onRefresh}
        />
      ))}
    </div>
  )
}
