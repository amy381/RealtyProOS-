// Shared branded email shell for outbound @mention notifications and the Notify
// modal. Table-based, inline CSS only, 600px fixed — Outlook-safe (no <style>,
// flexbox, or grid). Renders readable with images disabled (alt text, no layout
// depends on the logo/footer image).
//
// This is the ONE shell both email types render through. emailWrapper.js
// (footer-signature image) is unrelated and still used by other senders.
//
// Approved design spec: legacyos-email-mockup.html. Colors: header #02030a,
// teal rule/accent #50C8DC, amber eyebrow/CTA #D4781E, body #0f1c24, muted
// #6a7c88, quote bg #f4f8fa.

const LOGO_URL   = 'https://gyyipikdedwefyrfgoox.supabase.co/storage/v1/object/public/assets/legacyos-logo-nav-v3.png'
const FOOTER_URL = 'https://gyyipikdedwefyrfgoox.supabase.co/storage/v1/object/public/assets/email-footer-white2.png'
const FONT = "-apple-system,'Segoe UI',Roboto,Helvetica,Arial,sans-serif"

// "Bullhead City, AZ 86442" from a transaction, omitting empty parts (no
// dangling commas). Returns '' when city/state/zip are all blank → the shell
// then omits the subline entirely.
export function cityStateZip(tx = {}) {
  const stateZip = [tx.state, tx.zip].filter(Boolean).join(' ')
  return [tx.city, stateZip].filter(Boolean).join(', ')
}

// Escape user-supplied content before injecting into HTML.
export function escapeHtml(s) {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

// Highlight @handles in teal. Input MUST already be escaped; newlines → <br>.
export function renderNoteHtml(text) {
  return escapeHtml(text)
    .replace(/@(\w+)/g, '<span style="color:#0f7c8c;font-weight:600;">@$1</span>')
    .replace(/\n/g, '<br>')
}

// Teal-accented quote block. The optional "Task: …" and "Note added by …"
// header lines are each omitted entirely when absent — no dangling label. The
// last present header line carries the 8px gap before the note; task title (for
// task-note/comment mentions) sits above the author. bodyHtml is pre-rendered
// (escaped + optionally mention-highlighted).
export function quoteBlock({ author = '', taskTitle = '', bodyHtml = '' }) {
  const authorLine = author
    ? `<p style="margin:0 0 8px;font-size:12px;color:#7a8b96;font-family:${FONT};">Note added by <strong style="color:#0f1c24;">${escapeHtml(author)}</strong></p>`
    : ''
  const taskLine = taskTitle
    ? `<p style="margin:0 0 ${author ? '4' : '8'}px;font-size:12px;color:#7a8b96;font-family:${FONT};">Task: <strong style="color:#0f1c24;">${escapeHtml(taskTitle)}</strong></p>`
    : ''
  return (
    `<tr><td style="padding:22px 28px 0;">` +
      `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#f4f8fa;border-left:3px solid #50C8DC;border-radius:0 6px 6px 0;">` +
        `<tr><td style="padding:16px 18px;">` +
          taskLine +
          authorLine +
          `<p style="margin:0;font-size:15px;line-height:1.55;color:#1d2b35;font-family:${FONT};">${bodyHtml}</p>` +
        `</td></tr>` +
      `</table>` +
    `</td></tr>`
  )
}

// "What changed" table for the Notify email. rows: [{ label, value }].
// Returns '' when there are no rows (element omitted entirely).
export function changesTable(rows = []) {
  const clean = (rows || []).filter(r => r && r.label)
  if (!clean.length) return ''
  const body = clean.map((r, i) => {
    const last = i === clean.length - 1
    const border = last ? '' : 'border-bottom:1px solid #eef2f5;'
    return (
      `<tr>` +
        `<td style="padding:11px 16px;${border}font-size:14px;color:#6a7c88;width:45%;font-family:${FONT};">${escapeHtml(r.label)}</td>` +
        `<td style="padding:11px 16px;${border}font-size:14px;font-weight:600;color:#0f1c24;font-family:${FONT};">${escapeHtml(r.value)}</td>` +
      `</tr>`
    )
  }).join('')
  return (
    `<tr><td style="padding:24px 28px 0;">` +
      `<p style="margin:0 0 10px;font-size:12px;font-weight:700;letter-spacing:.09em;text-transform:uppercase;color:#7a8b96;font-family:${FONT};">What changed</p>` +
      `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="border:1px solid #dde5ea;border-radius:6px;">` +
        body +
      `</table>` +
    `</td></tr>`
  )
}

// Render the full branded email. Any absent field omits its element entirely:
//   - no subline    → the sub-line <p> is not emitted
//   - empty content → the content row is not emitted
// contentRows is a string of <tr>…</tr> rows (from quoteBlock/changesTable).
export function renderBrandedEmail({
  eyebrow = '',
  address = '',
  subline = '',
  contentRows = '',
  ctaUrl = '',
  ctaLabel = 'Open in LegacyOS &rarr;',
}) {
  const eyebrowRow = eyebrow
    ? `<p style="margin:0 0 6px;font-size:12px;font-weight:700;letter-spacing:.09em;text-transform:uppercase;color:#D4781E;font-family:${FONT};">${escapeHtml(eyebrow)}</p>`
    : ''
  const sublineRow = subline
    ? `<p style="margin:0;font-size:14px;color:#6a7c88;font-family:${FONT};">${escapeHtml(subline)}</p>`
    : ''
  const ctaRow = ctaUrl
    ? `<tr><td style="padding:24px 28px 30px;">` +
        `<table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr>` +
          `<td style="background:#D4781E;border-radius:6px;">` +
            `<a href="${escapeHtml(ctaUrl)}" style="display:inline-block;padding:12px 26px;font-size:14px;font-weight:600;color:#ffffff;text-decoration:none;font-family:${FONT};">${ctaLabel}</a>` +
          `</td>` +
        `</tr></table>` +
      `</td></tr>`
    : ''

  return (
    `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#e9edf0;margin:0;padding:0;">` +
      `<tr><td align="center" style="padding:24px 12px;font-family:${FONT};">` +
        `<table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0" style="width:600px;max-width:600px;background:#ffffff;border-radius:10px;overflow:hidden;box-shadow:0 2px 12px rgba(2,5,18,.10);">` +
          // Dark brand header
          `<tr><td style="background:#02030a;padding:20px 28px;border-bottom:2px solid #50C8DC;">` +
            `<img src="${LOGO_URL}" alt="LegacyOS" height="30" style="height:30px;display:block;border:0;">` +
          `</td></tr>` +
          // Eyebrow + address headline + optional subline
          `<tr><td style="padding:28px 28px 0;">` +
            eyebrowRow +
            `<h1 style="margin:0 0 4px;font-size:21px;line-height:1.3;font-weight:700;color:#0f1c24;font-family:${FONT};">${escapeHtml(address)}</h1>` +
            sublineRow +
          `</td></tr>` +
          // Optional content (quote block, changes table)
          contentRows +
          // CTA
          ctaRow +
          // Footer banner (decorative — empty alt, layout does not depend on it)
          `<tr><td style="padding:0;"><img src="${FOOTER_URL}" alt="" width="600" style="width:600px;max-width:100%;display:block;border:0;"></td></tr>` +
        `</table>` +
      `</td></tr>` +
    `</table>`
  )
}
