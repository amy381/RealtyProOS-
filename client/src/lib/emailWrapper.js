/**
 * Appends the combined signature + footer image to every outgoing email body.
 */
export function wrapEmailBody(body) {
  return `${body}<br><br>
<div style="margin-top: 16px;">
  <img src="https://gyyipikdedwefyrfgoox.supabase.co/storage/v1/object/public/assets/email_footer_signature.png" alt="Amy Casanova - Keller Williams Realty - Powered by LegacyOS" style="max-width: 318px; width: 100%; display: block;" />
</div>`
}
