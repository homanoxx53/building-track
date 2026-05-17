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
      const uploadedUrls = 