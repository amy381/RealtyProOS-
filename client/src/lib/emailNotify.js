// Sends @mention email notifications via the Gmail API (/api/google/gmail-send).
// Recipients are TCs matched from tc_settings by @handle — internal only.
// Failures are logged and swallowed so a bad notification never breaks the
// task create/update that triggered it.

import { wrapEmailBody } from './emailWrapper'
import { apiFetch } from './apiClient'

const esc = (s) =>
  String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

export function parseMentions(notes) {
  if (!notes) return []
  return [...notes.matchAll(/@(\w+)/g)].map(m => m[1].toLowerCase())
}

export async function sendMentionNotifications({
  notes,
  prevNotifiedMentions = [],
  tcSettings = [],
  transaction,
  taskTitle,
}) {
  const rawMentions = parseMentions(notes)
  if (!rawMentions.length) return []

  const address   = transaction.property_address || '(no address)'
  const app_url   = `https://app.desert-legacy.com/?tab=board&tx=${transaction.id}`
  const newlyNotified = []

  for (const raw of rawMentions) {
    if (prevNotifiedMentions.includes(raw)) continue

    const tc = tcSettings.find(t => {
      const first      = t.name.split(' ')[0].toLowerCase()
      const fullNospace = t.name.replace(/\s+/g, '').toLowerCase()
      return raw === first || raw === fullNospace
    })
    if (!tc?.email) continue

    const subject  = `You were mentioned in a task — ${address}`
    const htmlBody = wrapEmailBody(
      `<p style="font-size:13px;">You were mentioned in a note on <strong>${esc(address)}</strong>.</p>` +
      (taskTitle ? `<p style="font-size:13px;">Task: <strong>${esc(taskTitle)}</strong></p>` : '') +
      `<pre style="font-family:monospace;font-size:13px;white-space:pre-wrap;line-height:1.5;">${esc(notes)}</pre>` +
      `<p style="font-size:13px;"><a href="${app_url}">Open in LegacyOS</a></p>`
    )

    try {
      const res = await apiFetch('/api/google/gmail-send', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          to:            tc.email,
          subject,
          body:          htmlBody,
          transactionId: transaction.id,
        }),
      })
      const result = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(result.error || `Gmail send failed (${res.status})`)
      newlyNotified.push(raw)
    } catch (err) {
      console.error('[Mention] Gmail send error:', err)
    }
  }

  return newlyNotified
}
