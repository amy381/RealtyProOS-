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

// Owner scope for the single-tenant digest. Mirrors LEGACY_OS_OWNER_USER_ID in
// api/google/gmail-send.js (not exported there, so duplicated verbatim here).
// The digest is one role-based body for all recipients, scoped to this user's data.
const LEGACY_OS_OWNER_USER_ID = 'a02b464f-dd3e-49de-b893-2825fe8efb3f'

// ── Body wrap (digest-only) ─────────────────────────────────────────────────────
// The digest sends WITHOUT the email signature image — the Legacy OS logo now
// lives in the header masthead (see buildDigestHtml) instead. This is a
// DIGEST-ONLY change: the shared client wrapper (client/src/lib/emailWrapper.js)
// and api/google/gmail-send.js are untouched, so vendor/task emails keep their
// signature.
function wrapEmailBody(body) {
  return body
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

// ── HTML builder — card-based sections, generous spacing, clear hierarchy ───────
// Email-safe: inline styles + table-based task rows (renders in Gmail/Outlook;
// border-radius degrades to square corners in Outlook desktop, which is fine).

// Right-aligned status pills
function pillOverdue(days) {
  return `<span style="display:inline-block;background:#fde8e8;color:#991b1b;font-size:11px;font-weight:700;line-height:1;padding:5px 10px;border-radius:12px;white-space:nowrap;">${days} day${days !== 1 ? 's' : ''} overdue</span>`
}
function pillDueToday() {
  return `<span style="display:inline-block;background:#fef3c7;color:#92400e;font-size:11px;font-weight:700;line-height:1;padding:5px 10px;border-radius:12px;white-space:nowrap;">Due today</span>`
}
function pillKeyDate(dateStr) {
  return `<span style="display:inline-block;background:#e2f6fa;color:#0e7c8c;font-size:11px;font-weight:700;line-height:1;padding:5px 10px;border-radius:12px;white-space:nowrap;">${fmtDate(dateStr)}</span>`
}

// One task row: bold title + gray address on the left, status pill on the right.
// Hairline divider between rows (omitted on the last row of a card).
function taskRow(title, address, pill, isLast) {
  const divider = isLast ? '' : 'border-bottom:1px solid #eef1f5;'
  return `
          <tr>
            <td style="padding:12px 0;${divider}vertical-align:top;">
              <div style="font-size:14px;font-weight:600;color:#1a2330;line-height:1.35;">${title}</div>
              ${address ? `<div style="font-size:12px;color:#8a93a3;margin-top:3px;">${address}</div>` : ''}
            </td>
            <td style="padding:12px 0 12px 12px;${divider}text-align:right;vertical-align:middle;white-space:nowrap;">
              ${pill}
            </td>
          </tr>`
}

// A titled card section: accented header + count badge, white card with a
// colored left accent bar. `barColor` is the accent bar; `color` is the
// (readable) header/badge text color. Returns '' when there are no items.
function renderCardSection(title, color, tint, barColor, items) {
  if (!items.length) return ''
  const rows = items.map((it, i) => taskRow(it.title, it.address, it.pill, i === items.length - 1)).join('')
  return `
      <div style="margin-bottom:20px;">
        <div style="margin-bottom:10px;">
          <span style="font-size:13px;font-weight:700;letter-spacing:0.08em;text-transform:uppercase;color:${color};">${title}</span>
          <span style="display:inline-block;margin-left:8px;background:${tint};color:${color};font-size:12px;font-weight:700;line-height:1;padding:3px 9px;border-radius:10px;vertical-align:middle;">${items.length}</span>
        </div>
        <div style="background:#ffffff;border:1px solid #e6e9ef;border-left:3px solid ${barColor};border-radius:10px;padding:2px 16px;">
          <table width="100%" cellpadding="0" cellspacing="0" role="presentation" style="border-collapse:collapse;">
            ${rows}
          </table>
        </div>
      </div>`
}

function buildDigestHtml(overdue, dueToday, milestones, today) {
  // Role-based digest (assignee is the 'TC' role, not a person), so the greeting
  // is neutral and the body is identical for every recipient.
  const displayName = 'there'
  const dateLabel   = fmtDate(today)
  const mstones     = milestones || []
  const totalCount  = overdue.length + dueToday.length + mstones.length

  const toItem = (t, pill) => ({
    title:   t.title,
    address: t.transactions?.property_address || '',
    pill,
  })

  const overdueSection  = renderCardSection('Overdue', '#dc2626', '#fde8e8', '#dc2626',
                            overdue.map(t => toItem(t, pillOverdue(daysOverdue(t.due_date, today)))))
  const dueTodaySection = renderCardSection('Due Today', '#b45309', '#fef3c7', '#d97706',
                            dueToday.map(t => toItem(t, pillDueToday())))
  // Key Dates uses the app teal accent (#50C8DC) as the left bar; a darker teal
  // (#0e7c8c) for readable header/badge text on white.
  const keyDatesSection = renderCardSection('Key Dates', '#0e7c8c', '#e2f6fa', '#50C8DC',
                            mstones.map(t => toItem(t, pillKeyDate(t.due_date))))

  // Empty sections are hidden. If everything is empty, show one calm message.
  const emptyState = totalCount === 0
    ? `<div style="background:#ffffff;border:1px solid #e6e9ef;border-radius:10px;padding:28px 16px;text-align:center;">
             <div style="font-size:15px;color:#4b5563;">✅ Nothing due or overdue — you're all caught up.</div>
           </div>`
    : ''

  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
</head>
<body style="margin:0;padding:0;background:#f5f7fa;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" role="presentation" style="background:#f5f7fa;padding:28px 14px;">
    <tr><td align="center">
      <table width="100%" cellpadding="0" cellspacing="0" role="presentation" style="max-width:600px;">

        <!-- Masthead: big logo on a dark bar (matches app nav #02030a) -->
        <tr>
          <td style="background:#02030a;border-radius:14px 14px 0 0;padding:16px 24px;text-align:center;">
            <img src="https://gyyipikdedwefyrfgoox.supabase.co/storage/v1/object/public/assets/legacyos-logo-nav-v3.png" alt="Legacy OS" style="max-width: 380px; width: 100%; height: auto; display: block; margin: 0 auto;" />
          </td>
        </tr>

        <!-- Subtitle + greeting (light body) -->
        <tr>
          <td style="background:#f5f7fa;padding:22px 4px 8px;">
            <div style="font-size:13px;color:#9aa3af;text-align:center;margin-bottom:18px;">Daily Digest · ${dateLabel}</div>
            <div style="font-size:16px;font-weight:600;color:#1a2330;margin-bottom:6px;">Hi ${displayName},</div>
            <div style="font-size:14px;color:#6b7280;line-height:1.5;">
              Here's the task summary for today.${overdue.length > 0 ? ` <strong style="color:#dc2626;">${overdue.length} task${overdue.length !== 1 ? 's' : ''} overdue.</strong>` : ''}
            </div>
          </td>
        </tr>

        <!-- Sections -->
        <tr>
          <td style="padding:12px 4px 4px;">
            ${overdueSection}
            ${dueTodaySection}
            ${keyDatesSection}
            ${emptyState}
          </td>
        </tr>

        <!-- CTA -->
        <tr>
          <td style="padding:8px 4px 4px;text-align:center;">
            <a href="https://app.desert-legacy.com"
               style="display:inline-block;background:#111418;color:#ffffff;font-size:14px;font-weight:600;padding:11px 26px;border-radius:8px;text-decoration:none;">
              Open LegacyOS →
            </a>
          </td>
        </tr>

        <!-- Footer -->
        <tr>
          <td style="padding:18px 4px 4px;text-align:center;">
            <div style="font-size:12px;color:#9aa3af;">LegacyOS · Daily digest sent every morning (Arizona time)</div>
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
      .eq('user_id', LEGACY_OS_OWNER_USER_ID)
      .neq('status', 'complete')
      .neq('task_type', 'Due Date')
      .not('due_date', 'is', null)
      .lte('due_date', today)
    if (tErr) throw new Error('tasks: ' + tErr.message)

    const { data: milestones, error: mErr } = await supabase
      .from('tasks')
      .select('id, title, due_date, transaction_id, transactions(property_address)')
      .eq('user_id', LEGACY_OS_OWNER_USER_ID)
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
