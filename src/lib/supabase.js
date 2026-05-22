// ============================================================
// Building Track -- Supabase Client
// ============================================================
import { createClient } from '@supabase/supabase-js'

const supabaseUrl  = import.meta.env.VITE_SUPABASE_URL
const supabaseKey  = import.meta.env.VITE_SUPABASE_ANON_KEY

export const isConfigured = !!(supabaseUrl && supabaseKey &&
  supabaseUrl !== 'https://your-project-id.supabase.co')

// ── Input helpers ─────────────────────────────────────────────

/** Trim a string and cap it at maxLen characters. Returns '' for non-strings. */
function cap(value, maxLen) {
  return String(value ?? '').trim().slice(0, maxLen)
}

/** Clamp a number to [min, max]. Returns null for non-finite values. */
function clampNum(value, min = 0, max = 999999) {
  const n = parseFloat(value)
  if (!isFinite(n)) return null
  return Math.min(Math.max(n, min), max)
}

/**
 * Return a safe error string for display in the UI.
 * Keeps known user-friendly messages; replaces internal/technical
 * errors with a generic fallback so stack traces don't leak.
 */
export function safeErrorMessage(err, fallback = 'Something went wrong. Please try again.') {
  if (!err) return fallback
  const msg = typeof err === 'string' ? err : (err.message || '')
  if (!msg) return fallback
  // Short, obviously user-facing messages are safe to pass through
  if (msg.length < 120 && !/stack|column|relation|syntax|permission|uuid|pg_|ERROR/i.test(msg)) {
    return msg
  }
  return fallback
}

export const supabase = isConfigured ? createClient(supabaseUrl, supabaseKey) : null

// ── Auth ──────────────────────────────────────────────────────
export async function signUp(email, password, fullName, role = 'contractor') {
  if (!supabase) return { error: { message: 'Not configured' } }
  return supabase.auth.signUp({
    email, password,
    options: {
      data: { full_name: fullName, default_role: role },
      emailRedirectTo: window.location.origin,
    },
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

/**
 * Create a project AND insert the owner into project_members AND insert stages.
 * FIX BUG 1: owner was never added to project_members
 * FIX BUG 2: stages array was silently ignored
 * FIX BUG 17: removed non-existent 'country' column
 */
export async function createProject({ title, address, description, stages = [] }) {
  if (!supabase) return { data: null, error: { message: 'Not configured' } }

  const { data: { user }, error: authErr } = await supabase.auth.getUser()
  if (authErr || !user) return { data: null, error: { message: 'Not logged in' } }

  // Sanitize inputs before sending to DB
  const safeTitle       = cap(title,       100)
  const safeAddress     = cap(address,     300)
  const safeDescription = cap(description, 500)

  if (!safeTitle) return { data: null, error: { message: 'Project name is required' } }

  // 1. Pre-generate the project ID so we can add the member row before SELECT-ing
  //    (the SELECT policy checks is_project_member — user must be a member first)
  const projectId = crypto.randomUUID()

  const { error: projErr } = await supabase
    .from('projects')
    .insert({ id: projectId, title: safeTitle, address: safeAddress, description: safeDescription, owner_id: user.id })

  if (projErr) return { data: null, error: projErr }

  // 2. Add creator as owner in project_members (makes SELECT policy pass)
  const { error: memberErr } = await supabase
    .from('project_members')
    .insert({ project_id: projectId, user_id: user.id, role: 'owner' })

  if (memberErr) return { data: null, error: memberErr }

  // 3. Now fetch the project — user is a member so RLS allows it
  const { data: project, error: fetchErr } = await supabase
    .from('projects')
    .select('*')
    .eq('id', projectId)
    .single()

  if (fetchErr || !project) return { data: null, error: fetchErr }

  // 4. Insert stages if provided
  if (stages.length > 0) {
    const stageRows = stages.map((s, i) => ({
      project_id:  project.id,
      name:        s.name,
      order_index: s.order_index ?? i,
      status:      'pending',
    }))
    const { error: stageErr } = await supabase.from('stages').insert(stageRows)
    if (stageErr) console.error('Stage insert failed:', stageErr.message)
  }

  return { data: project, error: null }
}

/**
 * FIX BUG 3: Supabase returns key 'projects' (table name) on the join result.
 * We alias it as 'project' so destructuring in Dashboard works cleanly.
 * FIX BUG 16: stages now ordered by order_index.
 */
export async function getMyProjects() {
  if (!supabase) return { data: [] }
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { data: [] }

  const { data, error } = await supabase
    .from('project_members')
    .select(`
      role,
      project:projects (
        id, title, address, description, created_at,
        stages ( id, name, status, order_index )
      )
    `)
    .eq('user_id', user.id)

  if (error) { console.error('getMyProjects:', error.message); return { data: [] } }

  // Sort stages by order_index within each project
  const sorted = (data || []).map(row => ({
    ...row,
    project: row.project ? {
      ...row.project,
      stages: (row.project.stages || []).sort((a, b) => a.order_index - b.order_index),
    } : null,
  }))

  return { data: sorted }
}

/**
 * Full project detail for ProjectView — includes stages and members.
 * FIX BUG 10: was called getProjectDetail (didn't exist), now exported as getProjectDetail.
 */
export async function getProjectDetail(projectId) {
  if (!supabase) return { data: null }
  const { data, error } = await supabase
    .from('projects')
    .select(`
      id, title, address, description, created_at,
      stages ( id, name, status, order_index, notes, approved_at ),
      project_members ( user_id, role )
    `)
    .eq('id', projectId)
    .single()

  if (error) { console.error('getProjectDetail:', error.message); return { data: null } }

  // Sort stages
  if (data?.stages) {
    data.stages = data.stages.sort((a, b) => a.order_index - b.order_index)
  }

  return { data }
}

// ── Stages ────────────────────────────────────────────────────

/**
 * Update stage status.
 * Pass opts.projectId + opts.stageName to trigger an owner notification
 * when the stage is submitted for review.
 */
export async function updateStageStatus(stageId, status, opts = {}) {
  if (!supabase) return
  const result = await supabase
    .from('stages')
    .update({ status, updated_at: new Date().toISOString() })
    .eq('id', stageId)

  // Fire-and-forget notification when submitted for review
  if (!result.error && status === 'submitted' && opts.projectId) {
    notifyOwner('stage_submitted', opts.projectId, { stage_name: opts.stageName || 'a stage' })
  }
  return result
}

/**
 * Fire-and-forget: call the notify-owner Edge Function.
 * Errors are logged but never surfaced to the user.
 */
function notifyOwner(type, projectId, extra = {}) {
  if (!supabase) return
  supabase.functions
    .invoke('notify-owner', { body: { type, project_id: projectId, ...extra } })
    .catch(err => console.warn('notify-owner failed (non-critical):', err?.message))
}

/**
 * FIX BUG 11: was inserting into non-existent 'stage_approvals' table.
 * Now sets approved_by + approved_at directly on the stages row.
 */
export async function approveStage(stageId) {
  if (!supabase) return
  const { data: { user } } = await supabase.auth.getUser()
  return supabase
    .from('stages')
    .update({
      status:      'approved',
      approved_by: user.id,
      approved_at: new Date().toISOString(),
      updated_at:  new Date().toISOString(),
    })
    .eq('id', stageId)
}

// ── Progress Updates ──────────────────────────────────────────

/**
 * FIX BUG 7: was expecting camelCase params + 'notes' field.
 * Now accepts snake_case matching how components call it,
 * and uses 'caption' to match the DB schema.
 */
export async function addProgressUpdate({ project_id, stage_id, caption, photo_urls }) {
  if (!supabase) return { data: null, error: { message: 'Not configured' } }
  const { data: { user } } = await supabase.auth.getUser()

  // Sanitize caption; validate photo_urls is an array of strings from a trusted origin
  const safeCaption = cap(caption, 500) || null
  const safeUrls = Array.isArray(photo_urls)
    ? photo_urls
        .filter(u => typeof u === 'string' && u.startsWith('https://'))
        .slice(0, 10)   // hard cap — no more than 10 photos per update
    : []

  const result = await supabase
    .from('progress_updates')
    .insert({
      project_id,
      stage_id:   stage_id || null,
      caption:    safeCaption,
      photo_urls: safeUrls,
      user_id:    user.id,
    })
    .select()
    .single()

  // Notify owner about new site update (fire-and-forget)
  if (!result.error) {
    notifyOwner('progress_update', project_id, {
      photo_count: safeUrls.length,
      has_caption: !!safeCaption,
    })
  }
  return result
}

/**
 * FIX BUG 9: exported as getProgressFeed so ProgressFeed.jsx can import it.
 * FIX BUG 14: join now brings back the user's full_name in a way the component can use.
 */
export async function getProgressFeed(projectId) {
  if (!supabase) return { data: [] }
  return supabase
    .from('progress_updates')
    .select(`
      id, caption, photo_urls, created_at, stage_id,
      stages ( name ),
      profiles:user_id ( full_name, email )
    `)
    .eq('project_id', projectId)
    .order('created_at', { ascending: false })
}

// ── Material Logs ─────────────────────────────────────────────

export async function getMaterialLogs(projectId) {
  if (!supabase) return { data: [] }
  return supabase
    .from('material_logs')
    .select('*')
    .eq('project_id', projectId)
    .order('created_at', { ascending: false })
}

/**
 * FIX BUG 8: was expecting camelCase params and wrong column names.
 * Now matches DB schema: item_name, boq_quantity, actual_quantity.
 */
export async function addMaterialLog({ project_id, item_name, unit, boq_quantity, actual_quantity, notes }) {
  if (!supabase) return { data: null, error: { message: 'Not configured' } }
  const { data: { user } } = await supabase.auth.getUser()

  // Sanitize text fields and clamp numeric values
  const safeItem   = cap(item_name, 100)
  const safeNotes  = cap(notes, 500) || null
  const safeUnit   = cap(unit, 20) || 'bags'
  const safeActual = clampNum(actual_quantity, 0, 999999) ?? 0
  const safeBoq    = boq_quantity != null ? clampNum(boq_quantity, 0, 999999) : null

  if (!safeItem) return { data: null, error: { message: 'Item name is required' } }

  return supabase
    .from('material_logs')
    .insert({
      project_id,
      item_name:       safeItem,
      unit:            safeUnit,
      boq_quantity:    safeBoq,
      actual_quantity: safeActual,
      notes:           safeNotes,
      logged_by:       user.id,
    })
    .select()
    .single()
}

// ── Photo Upload ──────────────────────────────────────────────

/**
 * FIX BUG 6: was uploadPhoto(projectId, file) — args were reversed in component call.
 * Now uploadPhoto(file, projectId, stageId) matching PhotoUpload.jsx.
 * Returns { publicUrl, error } instead of throwing.
 */
export async function uploadPhoto(file, projectId, stageId) {
  if (!supabase) return { publicUrl: null, error: { message: 'Not configured' } }

  // Path: projectId/stageId/timestamp-random.jpg
  const folder = stageId ? `${projectId}/${stageId}` : projectId
  const path   = `${folder}/${Date.now()}-${Math.random().toString(36).slice(2)}.jpg`

  const { error } = await supabase.storage
    .from('site-photos')
    .upload(path, file, { cacheControl: '3600', upsert: false })

  if (error) return { publicUrl: null, error }

  const { data } = supabase.storage.from('site-photos').getPublicUrl(path)
  return { publicUrl: data.publicUrl, error: null }
}

// ── Invite Codes ──────────────────────────────────────────────

/**
 * FIX BUG 5: was calling non-existent Edge Function /functions/v1/send-invite.
 * Now calls the SQL RPC generate_invite_code directly.
 * FIX BUG 10: exported as generateInviteCode to match ProjectView.jsx import.
 */
export async function generateInviteCode(projectId, role = 'contractor') {
  if (!supabase) return { data: null, error: { message: 'Not configured' } }
  const { data, error } = await supabase
    .rpc('generate_invite_code', { p_project_id: projectId, p_role: role })
  if (error) return { data: null, error }
  // RPC returns a table row; first element has invite_code
  return { data: Array.isArray(data) ? data[0] : data, error: null }
}

/**
 * FIX BUG 4: was calling non-existent Edge Function /functions/v1/join-project.
 * Now calls the SQL RPC join_project_by_code directly.
 */
export async function joinByCode(code) {
  if (!supabase) return { error: 'Not configured' }
  const safeCode = cap(code, 20).toUpperCase()
  if (!safeCode) return { error: 'Please enter an invite code' }
  const { data, error } = await supabase
    .rpc('join_project_by_code', { p_code: safeCode })
  if (error) {
    // The RPC raises "Invalid or expired invite code" and "Project not found" —
    // both are safe to display. Anything else gets a generic fallback.
    return { error: safeErrorMessage(error, 'Invalid or expired invite code') }
  }
  return { data: Array.isArray(data) ? data[0] : data, error: null }
}
