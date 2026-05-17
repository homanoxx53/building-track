// ============================================================
// Building Track -- Photo Upload Sheet
// ============================================================
import { useState, useRef } from 'react'
import { Camera, X, Upload, Loader, Image } from 'lucide-react'
import { uploadPhoto, addProgressUpdate } from '../lib/supabase.js'

export default function PhotoUpload({ stageId, projectId, onDone, onCancel }) {
  const [files,   setFiles]   = useState([])   // [{file, preview}]
  const [caption, setCaption] = useState('')
  const [loading, setLoading] = useState(false)
  const [error,   setError]   = useState(null)
  const inputRef = useRef(null)

  const handleFileChange = (e) => {
    const picked = Array.from(e.target.files || []).slice(0, 5)
    const items = picked.map(file => ({
      file,
      preview: URL.createObjectURL(file),
    }))
    setFiles(prev => [...prev, ...items].slice(0, 5))
  }

  const removeFile = (i) => {
    setFiles(prev => {
      const copy = [...prev]
      URL.revokeObjectURL(copy[i].preview)
      copy.splice(i, 1)
      return copy
    })
  }

  const handleUpload = async () => {
    if (files.length === 0) { setError('Add at least one photo'); return }
    setLoading(true)
    setError(null)

    try {
      const uploadedUrls = []
      for (const { file } of files) {
        const { publicUrl, error: upErr } = await uploadPhoto(file, projectId, stageId)
        if (upErr) throw new Error(upErr.message || 'Upload failed')
        uploadedUrls.push(publicUrl)
      }

      // Save progress update record
      await addProgressUpdate({
        project_id: projectId,
        stage_id:   stageId,
        caption:    caption.trim() || null,
        photo_urls: uploadedUrls,
      })

      onDone()
    } catch (e) {
      setError(e.message)
      setLoading(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/50" onClick={onCancel}>
      <div
        className="w-full max-w-md bg-white rounded-t-3xl p-5 pb-10 animate-slide-up"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-5">
          <h3 className="text-lg font-bold text-gray-900">Add Site Photos</h3>
          <button onClick={onCancel} className="text-gray-400 hover:text-gray-600 p-1">
            <X size={20} />
          </button>
        </div>

        {/* Photo grid */}
        <div className="grid grid-cols-3 gap-2 mb-4">
          {files.map(({ preview }, i) => (
            <div key={i} className="relative aspect-square">
              <img src={preview} alt="" className="w-full h-full object-cover rounded-xl" />
              <button
                onClick={() => removeFile(i)}
                className="absolute top-1 right-1 w-5 h-5 bg-black/60 rounded-full flex items-center justify-center"
              >
                <X size={10} className="text-white" />
              </button>
            </div>
          ))}

          {files.length < 5 && (
            <button
              onClick={() => inputRef.current?.click()}
              className="aspect-square border-2 border-dashed border-gray-200 rounded-xl flex flex-col items-center justify-center text-gray-300 hover:border-blue-300 hover:text-blue-400 transition-colors"
            >
              <Camera size={22} />
              <span className="text-xs mt-1">Add</span>
            </button>
          )}
        </div>

        <input
          ref={inputRef}
          type="file"
          accept="image/*"
          multiple
          capture="environment"
          className="hidden"
          onChange={handleFileChange}
        />

        {/* Caption */}
        <textarea
          value={caption}
          onChange={e => setCaption(e.target.value)}
          placeholder="Add a note about this progress update… (optional)"
          rows={2}
          className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm outline-none focus:border-blue-400 resize-none mb-4"
        />

        {error && <p className="text-sm text-red-600 mb-3">{error}</p>}

        <button
          onClick={handleUpload}
          disabled={loading || files.length === 0}
          className="w-full py-3 bg-blue-700 text-white font-semibold rounded-2xl hover:bg-blue-800 transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
        >
          {loading
            ? <><Loader size={16} className="animate-spin" /> Uploading…</>
            : <><Upload size={16} /> Upload {files.length > 0 ? `${files.length} Photo${files.length !== 1 ? 's' : ''}` : 'Photos'}</>}
        </button>
      </div>
    </div>
  )
}
