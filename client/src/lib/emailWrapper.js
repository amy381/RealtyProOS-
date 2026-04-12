const LOGO_URL = 'https://gyyipikdedwefyrfgoox.supabase.co/storage/v1/object/public/assets/legacyos-logo-v2.png'

/**
 * Wraps an HTML (or plain-text) body in a branded LegacyOS email shell.
 * Uses table-based layout for broad email client compatibility.
 */
export function wrapEmailBody(body) {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
</head>
<body style="margin:0;padding:0;background:#f4f4f4;font-family:Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#f4f4f4;">
    <tr>
      <td align="center" style="padding:24px 16px 0;">

        <!-- Header -->
        <table width="600" cellpadding="0" cellspacing="0" border="0" style="max-width:600px;width:100%;background:#ffffff;border-radius:8px 8px 0 0;">
          <tr>
            <td align="center" style="padding:24px 24px 20px;">
              <img src="${LOGO_URL}" alt="LegacyOS" width="200" style="max-width:200px;height:auto;display:block;" />
            </td>
          </tr>
        </table>

        <!-- Body -->
        <table width="600" cellpadding="0" cellspacing="0" border="0" style="max-width:600px;width:100%;background:#ffffff;">
          <tr>
            <td style="padding:24px;color:#222222;font-size:14px;line-height:1.6;">
              ${body}
            </td>
          </tr>
        </table>

        <!-- Signature -->
        <table width="600" cellpadding="0" cellspacing="0" border="0" style="max-width:600px;width:100%;background:#ffffff;">
          <tr>
            <td style="padding:0 24px 24px;">
              <br><br>
              <div style="margin-top:16px;">
                <img src="https://gyyipikdedwefyrfgoox.supabase.co/storage/v1/object/public/assets/email-signature.png" alt="Amy Casanova - Keller Williams Realty" style="max-width:600px;width:100%;display:block;" />
              </div>
              <div style="margin-top:8px;">
                <img src="https://gyyipikdedwefyrfgoox.supabase.co/storage/v1/object/public/assets/email-footer-white2.png" alt="Powered by LegacyOS" style="max-width:600px;width:100%;display:block;" />
              </div>
            </td>
          </tr>
        </table>

        <!-- Footer -->
        <table width="600" cellpadding="0" cellspacing="0" border="0" style="max-width:600px;width:100%;background:#697175;border-radius:0 0 8px 8px;">
          <tr>
            <td align="center" style="padding:16px 24px;color:#ffffff;font-size:12px;">
              Powered by LegacyOS
            </td>
          </tr>
        </table>

      </td>
    </tr>
  </table>
</body>
</html>`
}
