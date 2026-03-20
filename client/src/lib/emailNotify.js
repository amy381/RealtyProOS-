// Sends @mention email notifications via EmailJS.
// Requires these Vercel / .env vars:
//   VITE_EMAILJS_SERVICE_ID
//   VITE_EMAILJS_TEMPLATE_ID   (template vars: to_email, to_name, transaction_addr, client_name, task_title, mention_notes, app_url)
//   VITE_EMAILJS_PUBLIC_KEY
//
// If not configured, notifications are silently skipped.

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
  const SERVICE_ID  = import.meta.env.VITE_EMAILJS_SERVICE_ID
  const TEMPLATE_ID = import.meta.env.VITE_EMAILJS_TEMPLATE_ID
  const PUBLIC_KEY  = import.meta.env.VITE_EMAILJS_PUBLIC_KEY
  if (!SERVICE_ID || !TEMPLATE_ID || !PUBLIC_KEY) return []

  const rawMentions = parseMentions(notes)
  if (!rawMentions.length) return []

  const newlyNotified = []

  for (const raw of rawMentions) {
    if (prevNotifiedMentions.includes(raw)) continue

    const tc = tcSettings.find(t => {
      const first      = t.name.split(' ')[0].toLowerCase()
      const fullNospace = t.name.replace(/\s+/g, '').toLowerCase()
      return raw === first || raw === fullNospace
    })
    if (!tc?.email) continue

    try {
      const { default: emailjs } = await import('@emailjs/browser')
      const app_url = `https://realty-pro-os.vercel.app/transaction/${transaction.id}`
      await emailjs.send(SERVICE_ID, TEMPLATE_ID, {
        to_email:         tc.email,
        to_name:          tc.name,
        transaction_addr: transaction.property_address || '(no address)',
        client_name:      transaction.client_name || '',
        task_title:       taskTitle,
        mention_notes:    notes,
        app_url,
      }, PUBLIC_KEY)
      newlyNotified.push(raw)
    } catch (err) {
      console.error('EmailJS send error:', err)
    }
  }

  return newlyNotified
}
