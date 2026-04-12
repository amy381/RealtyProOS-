/**
 * Appends Amy's signature and footer images to every outgoing email body.
 */
export function wrapEmailBody(body) {
  return `${body}<br><br>
<div style="margin-top: 16px;">
  <img src="https://gyyipikdedwefyrfgoox.supabase.co/storage/v1/object/public/assets/email-signature.png" alt="Amy Casanova - Keller Williams Realty" style="max-width: 300px; width: 100%; display: block;" />
</div>
<div style="margin-top: 8px;">
  <img src="https://gyyipikdedwefyrfgoox.supabase.co/storage/v1/object/public/assets/email-footer-white2.png" alt="Powered by LegacyOS" style="max-width: 600px; width: 100%; display: block;" />
</div>`
}
