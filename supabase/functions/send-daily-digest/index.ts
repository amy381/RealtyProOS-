// Daily Digest Edge Function
// Cron: 0 15 * * * (8am Arizona MST = 15:00 UTC)
//
// Required Supabase secrets (supabase secrets set --env-file .env.supabase):
//   EMAILJS_SERVICE_ID
//   EMAILJS_DIGEST_TEMPLATE_ID   <- new EmailJS template for digest HTML
//   EMAILJS_PUBLIC_KEY
//   EMAILJS_PRIVATE_KEY          <- Account > API Keys > Private Key in EmailJS

import { serve }        from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

// ─── Helpers ──────────────────────────────────────────────────────────────────

function azToday(): string {
  // Arizona never observes DST — always UTC-7
  const az = new Date(new Date().toLocaleString('en-US', { timeZone: 'America/Phoenix' }))
  const y  = az.getFullYear()
  const m  = String(az.getMonth() + 1).padStart(2, '0')
  const d  = String(az.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

function fmtDate(dateStr: string): string {
  const d = new Date(dateStr + 'T00:00:00')
  return d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })
}

function daysOverdue(dateStr: string, today: string): number {
  const due = new Date(dateStr + 'T00:00:00')
  const now = new Date(today + 'T00:00:00')
  return Math.floor((now.getTime() - due.getTime()) / 86400000)
}

// ─── Email sender via EmailJS REST API ────────────────────────────────────────

async function sendDigest(toEmail: string, toName: string, subject: string, html: string) {
  const res = await fetch('https://api.emailjs.com/api/v1.0/email/send', {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      service_id:  Deno.env.get('EMAILJS_SERVICE_ID'),
      template_id: Deno.env.get('EMAILJS_DIGEST_TEMPLATE_ID'),
      user_id:     Deno.env.get('EMAILJS_PUBLIC_KEY'),
      accessToken: Deno.env.get('EMAILJS_PRIVATE_KEY'),
      template_params: {
        to_email:     toEmail,
        to_name:      toName,
        subject,
        message_html: html,
      },
    }),
  })
  if (!res.ok) {
    const body = await res.text()
    throw new Error(`EmailJS error ${res.status}: ${body}`)
  }
}

// ─── HTML builder ─────────────────────────────────────────────────────────────

function groupByTransaction(tasks: any[]): Map<string, { addr: string; tasks: any[] }> {
  const map = new Map<string, { addr: string; tasks: any[] }>()
  for (const t of tasks) {
    const txId = t.transaction_id
    if (!map.has(txId)) {
      map.set(txId, { addr: t.transactions?.property_address || 'Unknown property', tasks: [] })
    }
    map.get(txId)!.tasks.push(t)
  }
  return map
}

function renderSection(title: string, color: string, tasks: any[], today: string): string {
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

function renderMilestones(milestones: any[]): string {
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

function buildDigestHtml(
  name:        string,
  overdue:     any[],
  dueToday:    any[],
  milestones:  any[],
  today:       string,
): string {
  const displayName = name === 'Me' ? 'Amy' : name.split(' ')[0]
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
              Here's your task summary for today.
              ${overdue.length > 0 ? `You have <strong style="color:#dc2626;">${overdue.length} overdue task${overdue.length !== 1 ? 's' : ''}</strong>.` : ''}
            </p>

            ${overdueSection}
            ${dueTodaySection}
            ${milestonesSection}
            ${emptyMsg}

            <div style="margin-top:28px;padding-top:20px;border-top:1px solid #e0e0e0;text-align:center;">
              <a href="https://realty-pro-os.vercel.app"
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
              LegacyOS · Daily digest sent every morning at 8am Arizona time
            </p>
          </td>
        </tr>

      </table>
    </td></tr>
  </table>
</body>
</html>`
}

// ─── Main handler ─────────────────────────────────────────────────────────────

serve(async (_req) => {
  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    )

    const today = azToday()

    // Load TC settings (names + emails)
    const { data: tcSettings, error: tcErr } = await supabase
      .from('tc_settings').select('*')
    if (tcErr) throw new Error('tc_settings: ' + tcErr.message)

    // Load digest preferences
    const { data: userSettings } = await supabase
      .from('user_settings').select('email, daily_digest_enabled')
    const digestPref = new Map<string, boolean>(
      (userSettings || []).map((u: any) => [u.email, u.daily_digest_enabled])
    )

    // Load overdue + due-today regular tasks (joined with transactions)
    const { data: actionTasks, error: tErr } = await supabase
      .from('tasks')
      .select('id, title, due_date, assigned_to, task_type, transaction_id, transactions(property_address)')
      .neq('status', 'complete')
      .neq('task_type', 'Due Date')
      .not('due_date', 'is', null)
      .lte('due_date', today)
    if (tErr) throw new Error('tasks: ' + tErr.message)

    // Load Due Date milestones hitting today
    const { data: milestones, error: mErr } = await supabase
      .from('tasks')
      .select('id, title, due_date, transaction_id, transactions(property_address)')
      .eq('task_type', 'Due Date')
      .eq('due_date', today)
    if (mErr) throw new Error('milestones: ' + mErr.message)

    const results: { name: string; email: string; sent: boolean; skipped?: string }[] = []

    for (const tc of (tcSettings || [])) {
      if (!tc.email) {
        results.push({ name: tc.name, email: '', sent: false, skipped: 'no email' })
        continue
      }

      // Respect opt-out (default: enabled if no row exists)
      if (digestPref.has(tc.email) && digestPref.get(tc.email) === false) {
        results.push({ name: tc.name, email: tc.email, sent: false, skipped: 'opted out' })
        continue
      }

      const overdue  = (actionTasks || []).filter(t => t.assigned_to === tc.name && t.due_date < today)
      const dueToday = (actionTasks || []).filter(t => t.assigned_to === tc.name && t.due_date === today)

      if (overdue.length === 0 && dueToday.length === 0 && (milestones || []).length === 0) {
        results.push({ name: tc.name, email: tc.email, sent: false, skipped: 'nothing due' })
        continue
      }

      const subject = overdue.length > 0
        ? `⚠️ LegacyOS Digest — ${overdue.length} overdue task${overdue.length !== 1 ? 's' : ''}`
        : `📋 LegacyOS Daily Digest — ${fmtDate(today)}`

      const html = buildDigestHtml(tc.name, overdue, dueToday, milestones || [], today)
      await sendDigest(tc.email, tc.name, subject, html)
      results.push({ name: tc.name, email: tc.email, sent: true })
    }

    console.log('Digest results:', JSON.stringify(results))
    return new Response(JSON.stringify({ ok: true, date: today, results }), {
      headers: { 'Content-Type': 'application/json' },
    })
  } catch (err: any) {
    console.error('Digest error:', err)
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    })
  }
})
