// ============================================================
// Building Track -- Supabase Client
// ============================================================
import { createClient } from '@supabase/supabase-js'

const supabaseUrl  = import.meta.env.VITE_SUPABASE_URL
const supabaseKey  = import.meta.env.VITE_SUPABASE_ANON_KEY

export const isConfigured = !!(supabaseUrl && supabaseKey &&
  supabaseUrl !== 'https://your-project-id.supabase.co')

export const supabase = isConfigured ? createClient(supabaseUrl, supabaseKey) : null

// ── Auth ──────────────────────────────────────────────────────
export async function signUp(email, password, fullName) {
  if (!supabase) return { error: { message: 'Not configured' } }
  return supabase.auth.signUp({
    email, password,
    options: { data: { full_name: fullName } },
  })
}

export async function signIn(email, password) {
  if (!supabase) return { error: { message: 'Not configured' } }
  return supabase.auth.signInWithPassword({ email, password })
}

export async function signOut() {
  if (!supabase) return
  return supabase.auth.signOut()
}

export async function getUser() {
  if (!supabase) return null
  const { data: { user } } = await supabase.auth.getUser()
  return user
}

// ── Projects ──────────────────────────────────────────────────
export async function createProject({ title, address, country, description }) {
  if (!supabase) return { data: null, error: { message: 'Not configured' } }
  const { data: { user } } = await supabase.auth.getUser()
  return supabase
    .from('projects')
    .insert({ title, address, country, description, owner_id: user.id })
    .select()
    .single()
}

export async function getMyProjects() {
  if (!supabase) return { data: [] }
  const { data: { user } } = await supabase.auth.getUser()
  return supabase
    .from('project_members')
    .select(`
      role,
      projects (
        id, title, address, country, status, created_at,
        stages ( id, name, status, order_index )
      )
    `)
    .eq('user_id', user.id)
    .order('created_at', { referencedTable: 'projects', ascending: false })
}

export async function getProject(projectId) {
  if (!supabase) return { data: null }
  return supabase
    .from('projects')
    .select(`
      *,
      stages ( id, name, status, order_index, target_date, approved_at ),
      project_members ( user_id, role, profiles ( full_name, email ) )
    `)
    .eq('id', projectId)
    .single()
}

// ── Stages ────────────────────────────────────────────────────
export async function createDefaultStages(projectId) {
  if (!supabase) return
  const defaults = [
    'Site Preparation',
    'Foundation',
    'Substructure (below DPC)',
    'Blockwork & Columns',
    'Roofing',
    'Windows & Doors',
    'Internal Finishes',
    'External Finishes',
    'Completion & Handover',
  ].map((name, i) => ({ project_id: projectId, name, order_index: i, status: 'pending' }))

  return supabase.from('stages').insert(defaults)
}

export async function updateStageStatus(stageId, status) {
  if (!supabase) return
  return supabase
    .from('stages')
    .update({ status, ...(status === 'completed' ? { completed_at: new Date().toISOString() } : {}) })
    .eq('id', stageId)
}

// ── Progress Updates ──────────────────────────────────────────
export async function addProgressUpdate({ projectId, stageId, notes, photoUrls }) {
  if (!supabase) return { data: null }
  const { data: { user } } = await supabase.auth.getUser()
  return supabase
    .from('progress_updates')
    .insert({ project_id: projectId, stage_id: stageId, notes, photo_urls: photoUrls, uploaded_by: user.id })
    .select()
    .single()
}

export async function getProgressUpdates(projectId, stageId = null) {
  if (!supabase) return { data: [] }
  let query = supabase
    .from('progress_updates')
    .select('*, profiles ( full_name )')
    .eq('project_id', projectId)
    .order('created_at', { ascending: false })
  if (stageId) query = query.eq('stage_id', stageId)
  return query
}

// ── Material Logs ─────────────────────────────────────────────
export async function addMaterialLog({ projectId, stageId, item, quantityUsed, unit, receiptUrl }) {
  if (!supabase) return { data: null }
  const { data: { user } } = await supabase.auth.getUser()
  return supabase
    .from('material_logs')
    .insert({
      project_id: projectId, stage_id: stageId,
      item, quantity_used: quantityUsed, unit,
      receipt_url: receiptUrl, logged_by: user.id,
    })
    .select()
    .single()
}

export async function getMaterialLogs(projectId) {
  if (!supabase) return { data: [] }
  return supabase
    .from('material_logs')
    .select('*')
    .eq('project_id', projectId)
    .order('created_at', { ascending: false })
}

// ── Photo Upload ──────────────────────────────────────────────
export async function uploadPhoto(projectId, file) {
  if (!supabase) return null
  const ext  = file.name.split('.').pop()
  const path = `${projectId}/${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`
  const { error } = await supabase.storage.from('site-photos').upload(path, file, {
    cacheControl: '3600',
    upsert: false,
  })
  if (error) throw error
  const { data } = supabase.storage.from('site-photos').getPublicUrl(path)
  return data.publicUrl
}

// ── Invite ────────────────────────────────────────────────────
export async function generateInvite(projectId, role) {
  if (!supabase) return null
  const { data: { session } } = await supabase.auth.getSession()
  const res = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/send-invite`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${session.access_token}`,
    },
    body: JSON.stringify({ projectId, role }),
  })
  if (!res.ok) throw new Error('Failed to generate invite')
  return res.json()
}

export async function joinByCode(code) {
  if (!supabase) return { error: 'Not configured' }
  const { data: { session } } = await supabase.auth.getSession()
  const res = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/join-project`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${session.access_token}`,
    },
    body: JSON.stringify({ code }),
  })
  if (!res.ok) {
    const err = await res.json()
    return { error: err.error || 'Invalid code' }
  }
  return res.json()
}

// ── Stage Approval ────────────────────────────────────────────
export async function approveStage(stageId, notes = '') {
  if (!supabase) return
  const { data: { user } } = await supabase.auth.getUser()
  await supabase.from('stage_approvals').insert({ stage_id: stageId, approved_by: user.id, notes })
  return updateStageStatus(stageId, 'approved')
}
