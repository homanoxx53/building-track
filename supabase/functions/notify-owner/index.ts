// ============================================================
// Building Track — notify-owner Edge Function
// Sends an email to the project owner when:
//   - A stage is submitted for review ('stage_submitted')
//   - A site update (note / photos) is posted ('progress_update')
//
// Required env vars (set in Supabase Dashboard → Edge Functions → Secrets):
//   SMTP_HOST   smtp.forwardemail.net
//   SMTP_PORT   465
//   SMTP_USER   your-sender@yourdomain.com
//   SMTP_PASS   your_forwardemail_api_key
//   FROM_NAME   Building Track  (optional, defaults to 'Building Track')
// ============================================================
import { serve }        from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const CORS = {
  'Access-Control-Allow-Origin':  '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })

  try {
    // ── Auth: require a valid user JWT ────────────────────────
    const jwt = req.headers.get('Authorization')?.replace('Bearer ', '')
    if (!jwt) return new Response('Unauthorized', { status: 401, headers: CORS })

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    )

    // Verify the token
    const { data: { user }, error: authErr } = await supabase.auth.getUser(jwt)
    if (authErr || !user) return new Response('Unauthorized', { status: 401, headers: CORS })

    // ── Parse body ────────────────────────────────────────────
    const body = await req.json().catch(() => ({}))
    const { type, project_id, stage_name, photo_count, has_caption } = body

    if (!type || !project_id) {
      return new Response('Missing type or project_id', { status: 400, headers: CORS })
    }

    // ── Look up project + owner ───────────────────────────────
    const { data: projectData } = await supabase
      .from('projects')
      .select('title')
      .eq('id', project_id)
      .single()

    const { data: ownerMember } = await supabase
      .from('project_members')
      .select('profiles:user_id ( email, full_name )')
      .eq('project_id', project_id)
      .eq('role', 'owner')
      .single()

    const ownerProfile = ownerMember?.profiles as { email: string; full_name: string } | null
    const ownerEmail   = ownerProfile?.email
    const ownerName    = ownerProfile?.full_name || 'there'

    // Don't email the owner if they triggered the event themselves
    if (!ownerEmail || user.email === ownerEmail) {
      return new Response(JSON.stringify({ skipped: true }), { headers: { ...CORS, 'Content-Type': 'application/json' } })
    }

    // Look up submitter name
    const { data: submitterProfile } = await supabase
      .from('profiles')
      .select('full_name')
      .eq('id', user.id)
      .single()

    const submitterName = (submitterProfile as { full_name: string } | null)?.full_name || user.email || 'A team member'
    const projectTitle  = (projectData as { title: string } | null)?.title || 'your project'

    // ── Build email content ───────────────────────────────────
    let subject = ''
    let bodyHtml = ''
    let bodyText = ''

    if (type === 'stage_submitted') {
      subject  = `Stage ready for review — ${projectTitle}`
      bodyHtml = `
        <p>Hi ${ownerName},</p>
        <p><strong>${submitterName}</strong> has submitted <strong>${stage_name || 'a stage'}</strong> for review on <strong>${projectTitle}</strong>.</p>
        <p>Log in to Building Track to inspect the progress and approve or request changes.</p>
        <p style="margin-top:24px;color:#6b7280;font-size:13px;">Building Track — Remote Site Monitoring</p>
      `
      bodyText = `Hi ${ownerName},\n\n${submitterName} has submitted "${stage_name || 'a stage'}" for review on ${projectTitle}.\n\nLog in to Building Track to approve or request changes.\n\n— Building Track`
    } else if (type === 'progress_update') {
      const parts = []
      if (photo_count > 0) parts.push(`${photo_count} photo${photo_count !== 1 ? 's' : ''}`)
      if (has_caption)     parts.push('a note')
      const what = parts.length > 0 ? parts.join(' and ') : 'an update'
      subject  = `New site update on ${projectTitle}`
      bodyHtml = `
        <p>Hi ${ownerName},</p>
        <p><strong>${submitterName}</strong> posted ${what} on <strong>${projectTitle}</strong>.</p>
        <p>Log in to Building Track to view the latest progress.</p>
        <p style="margin-top:24px;color:#6b7280;font-size:13px;">Building Track — Remote Site Monitoring</p>
      `
      bodyText = `Hi ${ownerName},\n\n${submitterName} posted ${what} on ${projectTitle}.\n\nLog in to Building Track to view the latest progress.\n\n— Building Track`
    } else {
      return new Response('Unknown type', { status: 400, headers: CORS })
    }

    // ── Send via forwardemail.net SMTP ────────────────────────
    const smtpHost = Deno.env.get('SMTP_HOST') || 'smtp.forwardemail.net'
    const smtpPort = parseInt(Deno.env.get('SMTP_PORT') || '465')
    const smtpUser = Deno.env.get('SMTP_USER') || ''
    const smtpPass = Deno.env.get('SMTP_PASS') || ''
    const fromName = Deno.env.get('FROM_NAME') || 'Building Track'

    if (!smtpUser || !smtpPass) {
      console.warn('SMTP credentials not configured — skipping email')
      return new Response(JSON.stringify({ skipped: true, reason: 'smtp_not_configured' }), {
        headers: { ...CORS, 'Content-Type': 'application/json' },
      })
    }

    // Use nodemailer via npm: (supported in Supabase Edge Functions)
    const nodemailer = (await import('npm:nodemailer')).default
    const transporter = nodemailer.createTransport({
      host:   smtpHost,
      port:   smtpPort,
      secure: smtpPort === 465,
      auth:   { user: smtpUser, pass: smtpPass },
    })

    await transporter.sendMail({
      from:    `"${fromName}" <${smtpUser}>`,
      to:      ownerEmail,
      subject,
      html:    bodyHtml,
      text:    bodyText,
    })

    return new Response(JSON.stringify({ sent: true, to: ownerEmail }), {
      headers: { ...CORS, 'Content-Type': 'application/json' },
    })

  } catch (err) {
    console.error('notify-owner error:', err)
    // Never surface internal errors — return 200 so the client doesn't retry
    return new Response(JSON.stringify({ error: 'internal' }), {
      status: 200,
      headers: { ...CORS, 'Content-Type': 'application/json' },
    })
  }
})
