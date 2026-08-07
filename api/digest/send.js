// GET/POST /api/digest/send
// Daily digest sender. Invoked by Vercel Cron (no user session) or manually.
//
// Auth: cron-secret only (NOT requireAuth — there is no logged-in user).
//   Header must be `Authorization: Bearer <CRON_SECRET>`.
//
// Recipients come from user_settings (daily_digest_enabled = true). The digest
// is split PER RECIPIENT by role: Amy (Agent) sees assigned_to='Agent' tasks,
// Danielle (TC) sees assigned_to='TC' tasks; Critical-Date key dates (null
// assignee) go to both. Action tasks are fetched once, then filtered per role
// in the send loop. Greeting is personalized. See DIGEST_ROLE / DIGEST_NAME.
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

// Per-recipient split by ROLE (not by person/assigned_tc). The task role axis is
// `tasks.assigned_to`, whose literal values are 'Agent' and 'TC' (null for
// Critical Dates). Amy is the Agent; Danielle is the TC. Recipients not in this
// map get no digest yet (skipped in the send loop) — do not fall back to a
// default role.
const DIGEST_ROLE = {
  'amy@desert-legacy.com':      'Agent',
  'danielle.davidson@kw.com':   'TC',
}
const DIGEST_NAME = {
  'amy@desert-legacy.com':      'Amy',
  'danielle.davidson@kw.com':   'Danielle',
}

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

// ── HTML builder — Legacy OS brand design (Option 3 v2) ─────────────────────────
// Email-safe: table-based layout, all styles inline, 600px max width, no <style>
// blocks / flexbox / grid. Twin-accent brand system: teal #32C8DC + orange
// #D2781E over deep navy #02030a. Colors are exact Legacy OS values — do not
// substitute. Font is Inter everywhere.
const DIGEST_FONT = "Inter,-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif"

// Right-aligned status chips (one per section accent).
function chipOverdue(label) {
  return `<span style="display:inline-block;background:#fde8e8;color:#991b1b;font-size:11px;font-weight:700;padding:5px 10px;border-radius:12px;white-space:nowrap;">${label}</span>`
}
function chipDueToday() {
  return `<span style="display:inline-block;background:#fbe9d4;color:#92400e;font-size:11px;font-weight:700;padding:5px 10px;border-radius:12px;white-space:nowrap;">Due today</span>`
}
function chipKeyDate() {
  return `<span style="display:inline-block;background:#dcf3f7;color:#0e7c8c;font-size:11px;font-weight:700;padding:5px 10px;border-radius:12px;white-space:nowrap;">Today</span>`
}

function overdueLabel(dateStr, today) {
  const n = daysOverdue(dateStr, today)
  return `${n} day${n !== 1 ? 's' : ''} overdue`
}

// One task row: bold title + gray address on the left, status chip on the right.
// Hairline divider between rows (omitted on the last row of a card).
function digestRow(title, address, chip, isLast) {
  const divider = isLast ? '' : 'border-bottom:1px solid #f2f4f7;'
  return `
                <tr>
                  <td style="padding:13px 0;${divider}"><div style="font-size:14px;font-weight:600;color:#1a2330;">${title}</div>${address ? `<div style="font-size:12px;color:#8a93a3;margin-top:3px;">${address}</div>` : ''}</td>
                  <td style="padding:13px 0;${divider}text-align:right;">${chip}</td>
                </tr>`
}

// A titled card section: accented uppercase header + count badge, white card
// with a colored left accent bar. Rendered only when there are items.
function digestSection(label, labelColor, badgeBg, badgeColor, barColor, rowsHtml, count) {
  return `
          <div style="margin-bottom:18px;">
            <div style="margin-bottom:10px;">
              <span style="font-size:13px;font-weight:700;letter-spacing:0.06em;text-transform:uppercase;color:${labelColor};">${label}</span>
              <span style="display:inline-block;margin-left:8px;background:${badgeBg};color:${badgeColor};font-size:12px;font-weight:700;padding:3px 9px;border-radius:10px;vertical-align:middle;">${count}</span>
            </div>
            <div style="background:#ffffff;border:1px solid #eceef2;border-left:4px solid ${barColor};border-radius:12px;padding:4px 18px;box-shadow:0 1px 2px rgba(16,24,40,0.04);">
              <table width="100%" cellpadding="0" cellspacing="0" role="presentation">${rowsHtml}
              </table>
            </div>
          </div>`
}

function buildDigestHtml(overdue, dueToday, milestones, today, firstName) {
  const dateString    = fmtDate(today)
  const mstones       = milestones || []
  const overdueCount  = overdue.length
  const dueTodayCount = dueToday.length
  const keyDateCount  = mstones.length
  const name          = firstName || 'there'
  const addr          = t => t.transactions?.property_address || ''

  const overdueRows = overdue.map((t, i) =>
    digestRow(t.title, addr(t), chipOverdue(overdueLabel(t.due_date, today)), i === overdue.length - 1)).join('')
  const dueRows = dueToday.map((t, i) =>
    digestRow(t.title, addr(t), chipDueToday(), i === dueToday.length - 1)).join('')
  const keyRows = mstones.map((t, i) =>
    digestRow(t.title, addr(t), chipKeyDate(), i === mstones.length - 1)).join('')

  const overdueSection  = overdueCount  ? digestSection('Overdue', '#dc2626', '#fde8e8', '#dc2626', '#dc2626', overdueRows, overdueCount) : ''
  const dueTodaySection = dueTodayCount ? digestSection('Due Today', '#b45309', '#fbe9d4', '#b45309', '#D2781E', dueRows, dueTodayCount) : ''
  const keyDatesSection = keyDateCount  ? digestSection('Key Dates Today', '#0e7c8c', '#dcf3f7', '#0e7c8c', '#32C8DC', keyRows, keyDateCount) : ''

  const allEmpty = (overdueCount + dueTodayCount + keyDateCount) === 0
  const emptyCard = `
          <div style="background:#ffffff;border:1px solid #eceef2;border-left:4px solid #32C8DC;border-radius:12px;padding:26px 20px;box-shadow:0 1px 2px rgba(16,24,40,0.04);">
            <div style="font-size:16px;font-weight:700;color:#1a2330;">You're all caught up 🎉</div>
            <div style="font-size:13px;color:#5c6570;margin-top:6px;">No overdue tasks, nothing due today, no key dates.</div>
          </div>`

  const summary = allEmpty
    ? `You're all caught up for today.`
    : `Here's your day. <strong style="color:#dc2626;">${overdueCount} ${overdueCount === 1 ? 'task' : 'tasks'} overdue</strong>, ${dueTodayCount} due today, ${keyDateCount} key ${keyDateCount === 1 ? 'date' : 'dates'}.`

  const bodyInner = allEmpty
    ? emptyCard
    : `${overdueSection}${dueTodaySection}${keyDatesSection}`

  return `<!DOCTYPE html>
<html>
<head><meta charset="UTF-8" /><meta name="viewport" content="width=device-width, initial-scale=1.0" /></head>
<body style="margin:0;padding:0;background:#eef1f5;font-family:${DIGEST_FONT};">
  <table width="100%" cellpadding="0" cellspacing="0" role="presentation" style="background:#eef1f5;padding:28px 14px;">
    <tr><td align="center">
      <table width="100%" cellpadding="0" cellspacing="0" role="presentation" style="max-width:600px;">

        <!-- Masthead + twin-accent underline (teal -> orange) -->
        <tr><td style="background:#02030a;border-radius:14px 14px 0 0;padding:22px 24px 18px;text-align:center;">
          <img src="https://gyyipikdedwefyrfgoox.supabase.co/storage/v1/object/public/assets/legacyos-logo-nav-v3.png" alt="Legacy OS" width="320" style="max-width:320px;width:100%;height:auto;display:block;margin:0 auto;" />
        </td></tr>
        <tr><td style="font-size:0;line-height:0;">
          <table width="100%" cellpadding="0" cellspacing="0" role="presentation"><tr>
            <td width="65%" style="background:#32C8DC;height:4px;line-height:4px;font-size:0;">&nbsp;</td>
            <td width="35%" style="background:#D2781E;height:4px;line-height:4px;font-size:0;">&nbsp;</td>
          </tr></table>
        </td></tr>

        <!-- Greeting -->
        <tr><td style="background:#ffffff;padding:26px 28px 8px;">
          <div style="font-size:12px;font-weight:700;letter-spacing:0.1em;text-transform:uppercase;color:#0e7c8c;">Daily Digest · ${dateString}</div>
          <div style="font-size:22px;font-weight:700;color:#0f1826;margin-top:8px;">Good morning, ${name} 👋</div>
          <div style="font-size:14px;color:#5c6570;line-height:1.55;margin-top:8px;">${summary}</div>
        </td></tr>

        <!-- Body -->
        <tr><td style="background:#ffffff;padding:18px 28px 4px;">
${bodyInner}
        </td></tr>

        <!-- CTA -->
        <tr><td style="background:#ffffff;border-radius:0 0 14px 14px;padding:18px 28px 28px;text-align:center;">
          <a href="https://app.desert-legacy.com" style="display:inline-block;background:#02030a;color:#ffffff;font-size:14px;font-weight:600;padding:13px 30px;border-radius:9px;text-decoration:none;border-top:2px solid #32C8DC;">Open LegacyOS →</a>
        </td></tr>

        <tr><td style="padding:18px 8px;text-align:center;"><div style="font-size:12px;color:#9aa3af;">Legacy OS · Sent every morning, Arizona time</div></td></tr>

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

    // ── Action tasks (Task + Email) — fetched ONCE for all roles, then filtered
    // per recipient inside the send loop. Critical Dates are excluded here (they
    // are the null-assignee key-date milestones, handled separately below).
    // "Incomplete" = status <> 'complete' (must NOT drop 'in_progress' tasks).
    const { data: actionTasks, error: tErr } = await supabase
      .from('tasks')
      .select('id, title, due_date, assigned_to, task_type, transaction_id, transactions(property_address)')
      .eq('user_id', LEGACY_OS_OWNER_USER_ID)
      .neq('status', 'complete')
      .neq('task_type', 'Critical Date')
      .not('due_date', 'is', null)
      .lte('due_date', today)
    if (tErr) throw new Error('tasks: ' + tErr.message)

    // ── Key Dates: Critical Date milestones due TODAY (role-neutral, null
    // assignee — shown to BOTH recipients). task_type is 'Critical Date' (there
    // is no 'Due Date' type). status <> 'complete' is the resolved/past guard.
    const { data: milestones, error: mErr } = await supabase
      .from('tasks')
      .select('id, title, due_date, transaction_id, transactions(property_address)')
      .eq('user_id', LEGACY_OS_OWNER_USER_ID)
      .eq('task_type', 'Critical Date')
      .neq('status', 'complete')
      .eq('due_date', today)
    if (mErr) throw new Error('milestones: ' + mErr.message)

    const allActions = actionTasks || []
    const keyDates   = milestones || []
    const dateLabel  = fmtDate(today)

    // Build one digest per recipient, filtering action tasks by that recipient's
    // role. Recipients with no role mapping are skipped (no digest yet).
    const built  = []
    const skipped = []
    for (const email of recipients) {
      const role = DIGEST_ROLE[email]
      if (!role) { skipped.push(email); continue }
      const firstName = DIGEST_NAME[email] || 'there'
      const overdue   = allActions.filter(t => t.assigned_to === role && t.due_date <  today)
      const dueToday  = allActions.filter(t => t.assigned_to === role && t.due_date === today)
      const subject   = `Your Daily Digest — ${dateLabel}`
      const body      = wrapEmailBody(buildDigestHtml(overdue, dueToday, keyDates, today, firstName))
      built.push({
        email, role, firstName, subject, body,
        counts: { overdue: overdue.length, dueToday: dueToday.length, keyDates: keyDates.length },
      })
    }

    // ── Dry run: everything except the actual send. Returns per-recipient
    // counts + full rendered HTML so both digests can be reviewed. ─────────────
    if (dryRun) {
      return res.status(200).json({
        dryRun:  true,
        today,
        skipped,
        digests: built.map(d => ({
          email:   d.email,
          role:    d.role,
          name:    d.firstName,
          subject: d.subject,
          counts:  d.counts,
          html:    d.body,
        })),
      })
    }

    // ── Send one message per recipient via shared Gmail helpers ───────────────
    const accessToken = await getValidAccessToken()

    let sent = 0
    const recipientsSent = []
    const errors = []

    for (const d of built) {
      try {
        const raw     = buildMimeMessage({ to: d.email, subject: d.subject, body: d.body })
        const encoded = toBase64Url(raw)
        const gmailRes = await gmailSendRaw(accessToken, encoded)
        if (!gmailRes.ok) {
          const errBody = await gmailRes.json().catch(() => ({}))
          errors.push({ email: d.email, error: errBody.error?.message || `Gmail API error ${gmailRes.status}` })
          continue
        }
        sent++
        recipientsSent.push(d.email)
      } catch (err) {
        errors.push({ email: d.email, error: err.message })
      }
    }

    return res.status(200).json({ sent, recipients: recipientsSent, skipped, errors })
  } catch (err) {
    console.error('[digest]', err)
    return res.status(500).json({ error: err.message })
  }
}
