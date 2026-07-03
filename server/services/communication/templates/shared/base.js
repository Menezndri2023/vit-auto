// ── VIT AUTO — Base template engine ──────────────────────────────────────────
// Tous les emails passent par ce module. Modifier ici change tous les emails.

const BRAND = {
  name:        "VIT AUTO",
  tagline:     "International Vehicle Trade",
  primary:     "#0f1b3f",
  accent:      "#f59e0b",
  accentDark:  "#d97706",
  success:     "#059669",
  danger:      "#dc2626",
  warning:     "#d97706",
  text:        "#1e293b",
  muted:       "#64748b",
  border:      "#e2e8f0",
  bg:          "#f1f5f9",
  white:       "#ffffff",
  footerBg:    "#0a1328",
  get logoUrl() { return `${process.env.APP_URL || "https://vit-auto.com"}/logo.png`; },
  get baseUrl() { return process.env.APP_URL || "https://vit-auto.com"; },
  get apiUrl()  { return process.env.API_URL  || "https://api.vit-auto.com"; },
  address:     "Abidjan, Côte d'Ivoire | +225 XX XX XX XX",
  support:     "support@vit-auto.com",
  unsubscribe: "mailto:unsubscribe@vit-auto.com",
};

export function baseEmail({ title, preheader = "", body, lang = "fr" }) {
  return `<!DOCTYPE html>
<html lang="${lang}" xmlns="http://www.w3.org/1999/xhtml">
<head>
  <meta charset="UTF-8"/>
  <meta http-equiv="X-UA-Compatible" content="IE=edge"/>
  <meta name="viewport" content="width=device-width,initial-scale=1.0"/>
  <meta name="color-scheme" content="light"/>
  <meta name="supported-color-schemes" content="light"/>
  <title>${title} | VIT AUTO</title>
  <!--[if mso]>
  <noscript><xml><o:OfficeDocumentSettings>
    <o:PixelsPerInch>96</o:PixelsPerInch>
  </o:OfficeDocumentSettings></xml></noscript>
  <![endif]-->
  <style>
    @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap');
    * { margin:0; padding:0; box-sizing:border-box; }
    body { font-family:'Inter','Segoe UI','Helvetica Neue',Arial,sans-serif; background:${BRAND.bg}; color:${BRAND.text}; -webkit-text-size-adjust:100%; }
    a { color:${BRAND.accent}; }
    img { border:0; outline:none; text-decoration:none; display:block; }
    @media only screen and (max-width:600px) {
      .wrapper { width:100% !important; padding:16px !important; }
      .card { border-radius:12px !important; }
      .header { padding:24px 20px !important; }
      .body { padding:24px 20px !important; }
      .footer { padding:20px !important; }
      .btn { display:block !important; text-align:center !important; width:100% !important; box-sizing:border-box !important; }
      .col-half { display:block !important; width:100% !important; }
    }
  </style>
</head>
<body style="margin:0;padding:0;background:${BRAND.bg}">
  <!-- Preheader invisible -->
  <div style="display:none;max-height:0;overflow:hidden;mso-hide:all;font-size:1px;color:${BRAND.bg};line-height:1px">${preheader}&nbsp;‌&nbsp;‌&nbsp;‌&nbsp;‌&nbsp;‌&nbsp;‌&nbsp;‌&nbsp;‌&nbsp;‌&nbsp;‌</div>

  <table class="wrapper" width="100%" cellpadding="0" cellspacing="0" border="0"
    style="background:${BRAND.bg};padding:32px 16px" role="presentation">
    <tr>
      <td align="center">
        <table class="card" width="600" cellpadding="0" cellspacing="0" border="0"
          style="max-width:600px;width:100%;border-radius:16px;overflow:hidden;box-shadow:0 4px 32px rgba(0,0,0,.12)">

          <!-- ── HEADER ─────────────────────────────────────────────── -->
          <tr>
            <td class="header" style="background:${BRAND.primary};padding:28px 40px;text-align:center">
              <table width="100%" cellpadding="0" cellspacing="0" border="0">
                <tr>
                  <td align="center">
                    <div style="display:inline-block">
                      <span style="color:#ffffff;font-size:28px;font-weight:900;letter-spacing:-1px">VIT</span>
                      <span style="color:${BRAND.accent};font-size:28px;font-weight:900;letter-spacing:-1px"> AUTO</span>
                    </div>
                    <p style="color:#94a3b8;font-size:11px;letter-spacing:2.5px;text-transform:uppercase;margin:6px 0 0">${BRAND.tagline}</p>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- ── BODY ───────────────────────────────────────────────── -->
          <tr>
            <td class="body" style="background:${BRAND.white};padding:40px">
              ${body}
            </td>
          </tr>

          <!-- ── FOOTER ─────────────────────────────────────────────── -->
          <tr>
            <td class="footer" style="background:${BRAND.footerBg};padding:28px 40px;text-align:center">
              <p style="color:#64748b;font-size:12px;margin:0 0 8px">
                <a href="${BRAND.baseUrl}" style="color:${BRAND.accent};text-decoration:none;font-weight:600">VIT AUTO</a>
                &nbsp;·&nbsp; ${BRAND.address}
              </p>
              <p style="color:#475569;font-size:11px;margin:0">
                Vous recevez cet email car votre compte est actif sur VIT AUTO.
                <a href="${BRAND.unsubscribe}" style="color:#475569">Se désinscrire</a>
              </p>
              <p style="color:#334155;font-size:11px;margin:12px 0 0">
                © ${new Date().getFullYear()} VIT AUTO. Tous droits réservés.
              </p>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

export { BRAND };
