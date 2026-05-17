// ============================================================
// Building Track -- Photo Upload Sheet
// Compresses images client-side before upload:
//   - Max dimension: 1920px (preserves aspect ratio)
//   - JPEG quality: 0.82
//   - Hard reject: anything still > 10MB after compression
// Supabase bucket should also be set to 10MB max as server-side cap.
// ============================================================
import { useState, useRef } from 'react'
import { Camera, X, Upload, Loader } from 'lucide-react'
import { uploadPhoto, addProgressUpdate } from '../lib/supabase.js'

const MAX_DIMENSION = 1920   // px — long edge
const JPEG_QUALITY  = 0.82
const MAX_BYTES     = 10 * 1024 * 1024   // 10 MB hard cap after compression

// Accepted MIME types — covers all real camera formats
// HEIC/HEIF = iPhone default; WebP = Android/Chrome; JPEG/PNG = universal
const ACCEPTED_TYPES = new Set([
  'image/jpeg',
  'image/jpg',
  'image/png',
  'image/webp',
  'image/heic',
  'image/heif',
])

// Human-readable label for error messages
const ACCEPTED_LABEL = 'JPEG, PNG, WebP, or HEIC'

/**
 * Compress an image File using Canvas.
 * Returns a new Blob (image/jpeg) and its object URL for preview.
 * Note: Canvas always outputs JPEG — HEIC, PNG, WebP all get converted,
 * which also means HEIC works on iOS Safari (native decoder) even though
 * most desktop browsers can't decode HEIC natively.
 */
async function compressImage(file) {
  // Reject non-image or unsupported types
  if (!file.type.startsWith('image/')) {
    throw new Error(`${file.name} is not an image file`)
  }
  if (!ACCEPTED_TYPES.has(file.type.toLowerCase())) {
    throw new Error(`${file.name}: unsupported format. Please use ${ACCEPTED_LABEL}.`)
  }

  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file)
    const img = new window.Image()

    img.onload = () => {
      URL.revokeObjectURL(url)

      // Calculate new dimensions, capping at MAX_DIMENSION
      let { width, height } = img
      if (width > MAX_DIMENSION || height > MAX_DIMENSION) {
        const ratio = Math.min(MAX_DIMENSION / width, MAX_DIMENSION / height)
        width  = Math.round(width  * ratio)
        height = Math.round(height * ratio)
      }

      const canvas = document.createElement('canvas')
      canvas.width  = width
      canvas.height = height
      const ctx = canvas.getContext('2d')
      ctx.drawImage(img, 0, 0, width, height)

      canvas.toBlob(
        (blob) => {
          if (!blob) { reject(new Error(`Failed to compress ${file.name}`)); return }
          if (blob.size > MAX_BYTES) {
            reject(new Error(`${file.name} is too large even after compression (${(blob.size / 1024 / 1024).toFixed(1)} MB). Maximum is 10 MB.`))
            return
          }
          // Create a proper File so Supabase gets the right name
          const compressed = new File([blob], file.name.replace(/\.\w+$/, '.jpg'), { type: 'image/jpeg' })
          resolve({ file: compressed, preview: URL.createObjectURL(compressed) })
        },
        'image/jpeg',
        JPEG_QUALITY
      )
    }

    img.onerror = () => {
      URL.revokeObjectURL(url)
      reject(new Error(`Could not read ${file.name}`))
    }

    img.src = url
  })
}

export default function PhotoUpload({ stageId, projectId, onDone, onCancel }) {
  const [files,       setFiles]       = useState([])   // [{file, preview}]
  const [caption,     setCaption]     = useState('')
  const [loading,     setLoading]     = useState(false)
  const [compressing, setCompressing] = useState(false)
  const [error,       setError]       = useState(null)
  const inputRef = useRef(null)

  const handleFileChange = async (e) => {
    const picked = Array.from(e.target.files || []).slice(0, 5 - files.length)
    if (picked.length === 0) return

    setCompressing(true)
    setError(null)

    const results = []
    for (const raw of picked) {
      try {
        const compressed = await compressImage(raw)
        results.push(compressed)
      } catch (err) {
        setError(err.message)
        setCompressing(false)
        return
      }
    }

    setFiles(prev => [...prev, ...results].slice(0, 5))
    setCompressing(false)
    // Reset input so the same file can be re-selected if needed
    e.target.value = ''
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

  const busy = loading || compressing

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/50" onClick={onCancel}>
      <div
        className="w-full max-w-md bg-white rounded-t-3xl p-5 pb-10 animate-slide-up"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-5">
          <div>
            <h3 className="text-lg font-bold text-gray-900">Add Site Photos</h3>
            <p className="text-xs text-gray-400">JPEG · PNG · WebP · HEIC · max 10 MB each</p>
          </div>
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

          {/* Add button — show spinner while compressing */}
          {files.length < 5 && (
            <button
              onClick={() => !busy && inputRef.current?.click()}
              disabled={busy}
              className="aspect-square border-2 border-dashed border-gray-200 rounded-xl flex flex-col items-center justify-center text-gray-300 hover:border-blue-300 hover:text-blue-400 transition-colors disabled:opacity-50"
            >
              {compressing
                ? <Loader size={20} className="animate-spin text-blue-400" />
                : <><Camera size={22} /><span className="text-xs mt-1">Add</span></>}
            </button>
          )}
        </div>

        <input
          ref={inputRef}
          type="file"
          accept="image/jpeg,image/png,image/webp,image/heic,image/heif"
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

        {error && (
          <p className="text-sm text-red-600 bg-red-50 rounded-xl px-3 py-2 mb-3">{error}</p>
        )}

        <button
          onClick={handleUpload}
          disabled={busy || files.length === 0}
          className="w-full py-3 bg-blue-700 text-white font-semibold rounded-2xl hover:bg-blue-800 transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
        >
          {loading
            ? <><Loader size={16} className="animate-spin" /> Uploading…</>
            : compressing
            ? <><Loader size={16} className="animate-spin" /> Compressing…</>
            : <><Upload size={16} /> Upload {files.length > 0 ? `${files.length} Photo${files.length !== 1 ? 's' : ''}` : 'Photos'}</>}
        </button>
      </div>
    </div>
  )
}
