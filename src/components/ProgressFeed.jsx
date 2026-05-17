// ============================================================
// Building Track -- Activity / Progress Feed
// ============================================================
import { useState, useEffect } from 'react'
import { Camera, Clock, CheckCircle2, AlertCircle } from 'lucide-react'
import { getProgressFeed } from '../lib/supabase.js'

function timeAgo(iso) {
  const diff = Date.now() - new Date(iso).getTime()
  const mins  = Math.floor(diff / 60000)
  if (mins < 1)   return 'just now'
  if (mins < 60)  return `${mins}m ago`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24)   return `${hrs}h ago`
  const days = Math.floor(hrs / 24)
  if (days < 7)   return `${days}d ago`
  return new Date(iso).toLocaleDateString()
}

function FeedItem({ item }) {
  const [imgOpen, setImgOpen] = useState(null)
  const photos = item.photo_urls || []

  return (
    <div className="bg-white border border-gray-100 rounded-2xl overflow-hidden">
      <div className="p-4">
        <div className="flex items-start gap-3">
          <div className="w-8 h-8 bg-blue-100 rounded-xl flex items-center justify-center shrink-0">
            {photos.length > 0
              ? <Camera size={14} className="text-blue-600" />
              : <CheckCircle2 size={14} className="text-blue-600" />}
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center justify-between gap-2 mb-0.5">
              <p className="text-sm font-semibold text-gray-900 truncate">
                {item.stage_name || 'Update'}
              </p>
              <span className="text-xs text-gray-400 shrink-0">{timeAgo(item.created_at)}</span>
            </div>
            <p className="text-xs text-gray-400">
              {item.user_name || item.user_email || 'Team member'}
            </p>
            {item.caption && (
              <p className="text-sm text-gray-600 mt-2">{item.caption}</p>
            )}
          </div>
        </div>
      </div>

      {/* Photos grid */}
      {photos.length > 0 && (
        <div className={`grid gap-0.5 ${photos.length === 1 ? 'grid-cols-1' : 'grid-cols-2'}`}>
          {photos.slice(0, 4).map((url, i) => (
            <div key={i} className="relative aspect-video">
              <img
                src={url}
                alt=""
                className="w-full h-full object-cover cursor-pointer"
                onClick={() => setImgOpen(url)}
              />
              {photos.length > 4 && i === 3 && (
                <div className="absolute inset-0 bg-black/50 flex items-center justify-center">
                  <span className="text-white text-lg font-bold">+{photos.length - 4}</span>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Lightbox */}
      {imgOpen && (
        <div
          className="fixed inset-0 z-50 bg-black/90 flex items-center justify-center p-4"
          onClick={() => setImgOpen(null)}
        >
          <img src={imgOpen} alt="" className="max-w-full max-h-full rounded-xl object-contain" />
        </div>
      )}
    </div>
  )
}

export default function ProgressFeed({ project, role, user }) {
  const [feed,    setFeed]    = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    getProgressFeed(project.id).then(({ data }) => {
      setFeed(data || [])
      setLoading(false)
    })
  }, [project.id])

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

  if (feed.length === 0) {
    return (
      <div className="p-6 text-center pt-12">
        <div className="w-16 h-16 bg-blue-50 rounded-2xl flex items-center justify-center mx-auto mb-4">
          <Camera size={24} className="text-blue-400" />
        </div>
        <h3 className="font-semibold text-gray-700 mb-1">No updates yet</h3>
        <p className="text-sm text-gray-400">Photos and progress updates from the site will appear here.</p>
      </div>
    )
  }

  return (
    <div className="p-4 space-y-3">
      {feed.map(item => (
        <FeedItem key={item.id} item={item} />
      ))}
    </div>
  )
}
