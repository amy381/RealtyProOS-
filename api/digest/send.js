// GET/POST /api/digest/send
// Daily digest sender. Invoked by Vercel Cron (no user session) or manually.
//
// Auth: cron-secret only (NOT requireAuth — there is no logged-in user).
//   Header must be `Authorization: Bearer <CRON_SECRET>`.
//
// Recipients come from user_settings (daily_digest_enabled = true). The digest
// content is role-based (tasks assigned to the 'TC' role), so the body is
// IDENTICAL for every recipient — built once, sent to each.
//
// Query/body logic ported from supabase/functions/send-daily-digest/index.ts.
// Sends via the shared Gmail helpers in ../google/_lib (getValidAccessToken +
// buildMimeMessage + toBase64Url + gmailSendRaw) — the same headless send path
// as /api/google/gmail-send, no duplication.

const {
  getSupabase,
  getValidAccessToken,
  buildMimeMessage,
  gmailSendRaw,
  toBase64Url,
} = require('../google/_lib')

// ── Signature wrap ─────────────────────────────────────────────────────────────
// emailWrapper.js lives under client/src and is an ESM module, so it can't be
// required from this CommonJS serverless function. Inlined here with the same
// signature image URL used by the client wrapper (assets/email-signature-v2.png).
function wrapEmailBody(body) {
  return `${body}<br><br>
<div style="margin-top: 16px;">
  <img src="https://gyyipikdedwefyrfgoox.supabase.co/storage/v1/object/public/assets/email-signature-v2.png" alt="Amy Casanova - Keller Williams Realty - Powered by LegacyOS" style="max-width: 200px; width: 100%; display: block;" />
</div>`
}

// ── Date helpers (Arizona = UTC-7, no DST) ──────────────────────────────────────
function azToday() {
  const az = new Date(new Date().toLocaleString('en-US', { timeZone: 'America/Phoenix' }))
  const y  = az.getFullYear()
  const m  = String(az.getMonth() + 1).padStart(2, '0')
  const d  = String(az.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

function fmtDate(dateStr) {
  const d = new Date(dateStr + 'T00:00:00')
  return d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })
}

function daysOverdue(dateStr, today) {
  const due = new Date(dateStr + 'T00:00:00')
  const now = new Date(today + 'T00:00:00')
  return Math.floor((now.getTime() - due.getTime()) / 86400000)
}

// ── HTML builder (ported from the Edge Function) ────────────────────────────────
function groupByTransaction(tasks) {
  const map = new Map()
  for (const t of tasks) {
    const txId = t.transaction_id
    if (!map.has(txId)) {
      map.set(txId, { addr: t.transactions?.property_address || 'Unknown property', tasks: [] })
    }
    map.get(txId).tasks.push(t)
  }
  return map
}

function renderSection(title, color, tasks, today) {
  if (!tasks.length) return ''
  const grouped = groupByTransaction(tasks)
  const txBlocks = [...grouped.values()].map(({ addr, tasks: txTasks }) => {
    const rows = txTasks.map(t => {
      const overdue = t.due_date < today ? daysOverdue(t.due_date, today) : 0
      const badge   = overdue > 0
        ? `<span style="background:#fde8e8;color:#991b1b;border-radius:4px;padding:1px 6px;font-size:11px;font-weight:600;margin-left:8px;">${overdue}d overdue</span>`
        : `<span style="background:#fef3c7;color:#92400e;border-radius:4px;padding:1px 6px;font-size:11px;font-weight:600;margin-left:8px;">Due today</span>`
      return `
        <tr>
          <td style="padding:6px 0;border-bottom:1px solid #f0f0f0;font-size:14px;color:#1a1a1a;">
            ${t.title}${badge}
          </td>
        </tr>`
    }).join('')
    return `
      <div style="margin-bottom:14px;">
        <div style="font-size:12px;font-weight:600;text-transform:uppercase;letter-spacing:0.05em;color:#888;margin-bottom:6px;">${addr}</div>
        <table style="width:100%;border-collapse:collapse;">${rows}</table>
      </div>`
  }).join('')

  return `
    <div style="margin-bottom:24px;">
      <div style="font-size:13px;font-weight:700;text-transform:uppercase;letter-spacing:0.07em;color:${color};padding-bottom:8px;border-bottom:2px solid ${color};margin-bottom:12px;">${title}</div>
      ${txBlocks}
    </div>`
}

function renderMilestones(milestones) {
  if (!milestones.length) return ''
  const rows = milestones.map(t => `
    <tr>
      <td style="padding:6px 0;border-bottom:1px solid #f0f0f0;font-size:14px;color:#1a1a1a;">
        📅 ${t.title}
        <span style="font-size:12px;color:#888;margin-left:8px;">${t.transactions?.property_address || ''}</span>
      </td>
    </tr>`).join('')

  return `
    <div style="margin-bottom:24px;">
      <div style="font-size:13px;font-weight:700;text-transform:uppercase;letter-spacing:0.07em;color:#6d28d9;padding-bottom:8px;border-bottom:2px solid #6d28d9;margin-bottom:12px;">Key Dates — Today</div>
      <table style="width:100%;border-collapse:collapse;">${rows}</table>
    </div>`
}

function buildDigestHtml(overdue, dueToday, milestones, today) {
  // Role-based digest (assignee is the 'TC' role, not a person), so the greeting
  // is neutral and the body is identical for every recipient.
  const displayName = 'there'
  const dateLabel   = fmtDate(today)
  const totalCount  = overdue.length + dueToday.length + milestones.length

  const overdueSection    = renderSection('Overdue', '#dc2626', overdue, today)
  const dueTodaySection   = renderSection('Due Today', '#d97706', dueToday, today)
  const milestonesSection = renderMilestones(milestones)

  const emptyMsg = totalCount === 0
    ? `<p style="color:#666;font-size:15px;text-align:center;padding:24px 0;">✅ Nothing due or overdue — great work!</p>`
    : ''

  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8" />
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet" />
</head>
<body style="margin:0;padding:0;background:#f5f5f5;font-family:'Inter',sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f5f5f5;padding:32px 16px;">
    <tr><td align="center">
      <table width="100%" cellpadding="0" cellspacing="0" style="max-width:580px;background:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 2px 12px rgba(0,0,0,0.08);">

        <!-- Header -->
        <tr>
          <td style="background:#111111;padding:24px 32px;">
            <div style="font-size:18px;font-weight:700;color:#ffffff;letter-spacing:-0.3px;">LegacyOS</div>
            <div style="font-size:13px;color:#999999;margin-top:2px;">Daily Digest — ${dateLabel}</div>
          </td>
        </tr>

        <!-- Body -->
        <tr>
          <td style="padding:28px 32px;">
            <p style="font-size:16px;color:#1a1a1a;margin:0 0 24px;font-weight:500;">Hi ${displayName},</p>
            <p style="font-size:14px;color:#666;margin:0 0 24px;line-height:1.5;">
              Here's the task summary for today.
              ${overdue.length > 0 ? `There ${overdue.length === 1 ? 'is' : 'are'} <strong style="color:#dc2626;">${overdue.length} overdue task${overdue.length !== 1 ? 's' : ''}</strong>.` : ''}
            </p>

            ${overdueSection}
            ${dueTodaySection}
            ${milestonesSection}
            ${emptyMsg}

            <div style="margin-top:28px;padding-top:20px;border-top:1px solid #e0e0e0;text-align:center;">
              <a href="https://app.desert-legacy.com"
                 style="display:inline-block;background:#111111;color:#ffffff;font-size:14px;font-weight:600;padding:10px 24px;border-radius:8px;text-decoration:none;">
                Open LegacyOS →
              </a>
            </div>
          </td>
        </tr>

        <!-- Footer -->
        <tr>
          <td style="background:#f9f9f9;padding:16px 32px;border-top:1px solid #eeeeee;">
            <p style="font-size:12px;color:#aaaaaa;margin:0;text-align:center;">
              LegacyOS · Daily digest sent every morning (Arizona time)
            </p>
          </td>
        </tr>

      </table>
    </td></tr>
  </table>
</body>
</html>`
}

// ── Handler ─────────────────────────────────────────────────────────────────────
module.exports = async function handler(req, res) {
  if (req.method !== 'GET' && req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  // ── Cron-secret auth (no user session) ──────────────────────────────────────
  const secret = process.env.CRON_SECRET
  if (!secret) {
    console.error('[digest] CRON_SECRET not configured')
    return res.status(500).json({ error: 'CRON_SECRET not configured on the server' })
  }
  const authHeader = req.headers.authorization || req.headers.Authorization || ''
  if (authHeader !== `Bearer ${secret}`) {
    return res.status(401).json({ error: 'Unauthorized' })
  }

  const dryRun =
    req.query?.dryRun === '1' ||
    req.query?.dryRun === 'true' ||
    (req.body && req.body.dryRun === true)

  const tokenCheck =
    req.query?.tokenCheck === '1' ||
    req.query?.tokenCheck === 'true' ||
    (req.body && req.body.tokenCheck === true)

  try {
    const supabase = getSupabase()
    const today    = azToday()

    // ── Token-check mode: verify the headless refresh-token flow works from a
    // no-session serverless context. Obtains a token but sends NOTHING. ────────
    if (tokenCheck) {
      try {
        const accessToken = await getValidAccessToken()
        let expiresInSec = null
        try {
          const { data: authRow } = await supabase
            .from('google_auth').select('expiry_date').limit(1).single()
          if (authRow?.expiry_date) {
            expiresInSec = Math.max(0, Math.round((authRow.expiry_date - Date.now()) / 1000))
          }
        } catch (_) { /* expiry lookup is best-effort */ }
        return res.status(200).json({
          tokenCheck:    true,
          tokenObtained: true,
          tokenPrefix:   (accessToken || '').slice(0, 8),
          expiresInSec,
        })
      } catch (err) {
        return res.status(200).json({ tokenCheck: true, tokenObtained: false, error: err.message })
      }
    }

    // ── Recipients: enabled rows in user_settings ─────────────────────────────
    const { data: recipRows, error: recipErr } = await supabase
      .from('user_settings')
      .select('email')
      .eq('daily_digest_enabled', true)
    if (recipErr) throw new Error('user_settings: ' + recipErr.message)

    const recipients = [
      ...new Set(
        (recipRows || [])
          .map(r => (r.email || '').trim())
          .filter(Boolean)
      ),
    ]

    if (recipients.length === 0) {
      return res.status(200).json({ sent: 0, reason: 'no enabled recipients' })
    }

    // ── Digest content (role-based: tasks assigned to 'TC') ───────────────────
    const { data: actionTasks, error: tErr } = await supabase
      .from('tasks')
      .select('id, title, due_date, assigned_to, task_type, transaction_id, transactions(property_address)')
      .neq('status', 'complete')
      .neq('task_type', 'Due Date')
      .not('due_date', 'is', null)
      .lte('due_date', today)
    if (tErr) throw new Error('tasks: ' + tErr.message)

    const { data: milestones, error: mErr } = await supabase
      .from('tasks')
      .select('id, title, due_date, transaction_id, transactions(property_address)')
      .eq('task_type', 'Due Date')
      .eq('due_date', today)
    if (mErr) throw new Error('milestones: ' + mErr.message)

    const overdue  = (actionTasks || []).filter(t => t.assigned_to === 'TC' && t.due_date <  today)
    const dueToday = (actionTasks || []).filter(t => t.assigned_to === 'TC' && t.due_date === today)

    // One body + subject for everyone (role-based digest)
    const subject = `Your Daily Digest — ${fmtDate(today)}`
    const body    = wrapEmailBody(buildDigestHtml(overdue, dueToday, milestones || [], today))

    // ── Dry run: everything except the actual send ────────────────────────────
    if (dryRun) {
      return res.status(200).json({
        dryRun:      true,
        wouldSendTo: recipients,
        subject,
        bodyPreview: body.slice(0, 500),
      })
    }

    // ── Send one message per recipient via shared Gmail helpers ───────────────
    const accessToken = await getValidAccessToken()

    let sent = 0
    const recipientsSent = []
    const errors = []

    for (const email of recipients) {
      try {
        const raw     = buildMimeMessage({ to: email, subject, body })
        const encoded = toBase64Url(raw)
        const gmailRes = await gmailSendRaw(accessToken, encoded)
        if (!gmailRes.ok) {
          const errBody = await gmailRes.json().catch(() => ({}))
          errors.push({ email, error: errBody.error?.message || `Gmail API error ${gmailRes.status}` })
          continue
        }
        sent++
        recipientsSent.push(email)
      } catch (err) {
        errors.push({ email, error: err.message })
      }
    }

    return res.status(200).json({ sent, recipients: recipientsSent, errors })
  } catch (err) {
    console.error('[digest]', err)
    return res.status(500).json({ error: err.message })
  }
}
