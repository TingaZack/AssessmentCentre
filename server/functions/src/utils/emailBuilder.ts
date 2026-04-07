export interface EmailTemplateParams {
  title: string;
  subtitle?: string;
  recipientName: string;
  bodyHtml: string;
  ctaText: string;
  ctaLink: string;
  showStepIndicator?: boolean; // We can turn this on for verifications, off for generic alerts
}

export const buildMlabEmailHtml = (params: EmailTemplateParams): string => {
  const currentYear = new Date().getFullYear();

  const stepIndicatorHtml = params.showStepIndicator
    ? `
        <tr>
          <td style="background-color:#f0f4f6; padding:16px 40px; border-bottom:1px solid #dde4e8;">
            <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
              <tr>
                <td align="center" width="33%" style="padding:0 4px;">
                  <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:0 auto;">
                    <tr>
                      <td width="26" height="26" bgcolor="#94c73d" align="center" valign="middle" style="border:2px solid #7aaa2e; font-family:'Oswald',sans-serif; font-size:10px; font-weight:700; color:#ffffff; letter-spacing:0;">&#10003;</td>
                    </tr>
                  </table>
                  <p style="margin:5px 0 0; font-family:'Oswald',sans-serif; font-size:9px; font-weight:700; letter-spacing:0.12em; text-transform:uppercase; color:#7aaa2e;">Account Created</p>
                </td>
                <td align="center" valign="middle" style="padding-bottom:18px;">
                  <div style="height:2px; background:#dde4e8; min-width:20px;">&nbsp;</div>
                </td>
                <td align="center" width="33%" style="padding:0 4px;">
                  <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:0 auto;">
                    <tr>
                      <td width="26" height="26" bgcolor="#073f4e" align="center" valign="middle" style="border:2px solid #073f4e; font-family:'Oswald',sans-serif; font-size:10px; font-weight:700; color:#94c73d;">&#9993;</td>
                    </tr>
                  </table>
                  <p style="margin:5px 0 0; font-family:'Oswald',sans-serif; font-size:9px; font-weight:700; letter-spacing:0.12em; text-transform:uppercase; color:#073f4e;">Verify Email</p>
                </td>
                <td align="center" valign="middle" style="padding-bottom:18px;">
                  <div style="height:2px; background:#dde4e8; min-width:20px;">&nbsp;</div>
                </td>
                <td align="center" width="33%" style="padding:0 4px;">
                  <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:0 auto;">
                    <tr>
                      <td width="26" height="26" bgcolor="#ffffff" align="center" valign="middle" style="border:2px solid #dde4e8; font-family:'Oswald',sans-serif; font-size:10px; font-weight:700; color:#9b9b9b;">3</td>
                    </tr>
                  </table>
                  <p style="margin:5px 0 0; font-family:'Oswald',sans-serif; font-size:9px; font-weight:700; letter-spacing:0.12em; text-transform:uppercase; color:#9b9b9b;">Access Dashboard</p>
                </td>
              </tr>
            </table>
          </td>
        </tr>
    `
    : "";

  return `
<!DOCTYPE html>
<html lang="en" xmlns="http://www.w3.org/1999/xhtml">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${params.title} — mLab</title>
  <style type="text/css">
    @import url('https://fonts.googleapis.com/css2?family=Oswald:wght@400;500;600;700&display=swap');
    body, table, td, a { -webkit-text-size-adjust: 100%; -ms-text-size-adjust: 100%; }
    table, td { mso-table-lspace: 0pt; mso-table-rspace: 0pt; }
    img { -ms-interpolation-mode: bicubic; border: 0; outline: none; text-decoration: none; }
    body { margin: 0 !important; padding: 0 !important; width: 100% !important; }
    .ve-cta:hover { background-color: #0a5266 !important; }
  </style>
</head>
<body style="margin:0; padding:0; background-color:#e4edf0; font-family:'Trebuchet MS','Lucida Grande',Arial,sans-serif;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:#e4edf0; min-height:100vh;">
    <tr>
      <td align="center" style="padding:40px 16px;">
        <table class="wrapper" role="presentation" cellpadding="0" cellspacing="0" border="0" style="width:580px; max-width:580px; background-color:#ffffff; box-shadow:0 8px 32px rgba(7,63,78,0.18);">
          <tr>
            <td height="5" style="padding:0; line-height:5px; font-size:5px;">
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
                <tr><td width="508" height="5" bgcolor="#073f4e"></td><td width="72" height="5" bgcolor="#94c73d"></td></tr>
              </table>
            </td>
          </tr>
          <tr>
            <td align="center" style="background-color:#073f4e; padding:44px 40px 36px;">
              <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:0 auto 22px;">
                <tr>
                  <td style="background:rgba(148,199,61,0.15); border:1px solid rgba(148,199,61,0.4); padding:5px 14px;">
                    <span style="color:#94c73d; font-family:'Oswald',sans-serif; font-size:10px; font-weight:700; letter-spacing:0.2em; text-transform:uppercase;">&#x1F512;&nbsp; Secure Communication</span>
                  </td>
                </tr>
              </table>
              <h1 style="color:#ffffff; margin:0 0 6px; font-family:'Oswald',sans-serif; font-size:26px; font-weight:700; letter-spacing:0.12em; text-transform:uppercase; line-height:1.1;">Mobile Applications Laboratory NPC</h1>
              <p style="color:rgba(255,255,255,0.45); margin:0; font-size:11px; font-family:'Trebuchet MS',sans-serif; letter-spacing:0.08em; text-transform:uppercase;">Assessment &amp; Credentialing Platform</p>
            </td>
          </tr>
          <tr>
            <td align="center" style="background-color:#052e3a; padding:18px 40px; border-bottom:3px solid #94c73d;">
              <h2 style="color:#ffffff; margin:0; font-family:'Oswald',sans-serif; font-size:28px; font-weight:700; letter-spacing:0.06em; text-transform:uppercase;">${params.title}</h2>
              ${params.subtitle ? `<p style="color:rgba(255,255,255,0.45); margin:6px 0 0; font-size:12px; font-family:'Trebuchet MS',sans-serif; letter-spacing:0.05em;">${params.subtitle}</p>` : ""}
            </td>
          </tr>

          ${stepIndicatorHtml}

          <tr>
            <td style="padding:36px 40px; background-color:#ffffff;">
              <p style="color:#6b6b6b; font-size:15px; line-height:1.7; margin:0 0 22px; font-family:'Trebuchet MS',sans-serif;">
                Hi <strong style="color:#073f4e;">${params.recipientName}</strong>,
              </p>
              
              <div style="color:#6b6b6b; font-size:15px; line-height:1.7; margin:0 0 28px; font-family:'Trebuchet MS',sans-serif;">
                ${params.bodyHtml}
              </div>

              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 28px;">
                <tr>
                  <td align="center">
                    <a href="${params.ctaLink}" class="ve-cta" style="display:inline-block; background-color:#073f4e; color:#ffffff; padding:16px 40px; text-decoration:none; font-family:'Oswald',sans-serif; font-weight:700; font-size:14px; letter-spacing:0.14em; text-transform:uppercase; border:2px solid #052e3a; box-shadow:0 4px 12px rgba(7,63,78,0.25);">
                      &#x2192;&nbsp; ${params.ctaText}
                    </a>
                  </td>
                </tr>
              </table>

              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:#fffbeb; border:1px solid #fde68a; border-left:4px solid #d97706;">
                <tr>
                  <td style="padding:14px 18px;">
                    <p style="color:#92400e; font-size:13px; line-height:1.6; margin:0 0 6px; font-family:'Oswald',sans-serif; font-weight:700; letter-spacing:0.06em; text-transform:uppercase;">Button not working?</p>
                    <p style="color:#78350f; font-size:12px; line-height:1.6; margin:0; font-family:'Trebuchet MS',sans-serif;">
                      Copy and paste this link into your browser:<br />
                      <a href="${params.ctaLink}" style="color:#0a5266; word-break:break-all; text-decoration:underline;">${params.ctaLink}</a>
                    </p>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
          <tr>
            <td style="background-color:#f0f4f6; padding:24px 40px; border-top:1px solid #dde4e8; text-align:center;">
              <p style="color:#9b9b9b; font-size:11px; line-height:1.65; margin:0 0 6px; font-family:'Trebuchet MS',sans-serif;">&copy; ${currentYear} Mobile Applications Laboratory NPC. All rights reserved.</p>
              <p style="color:#9b9b9b; font-size:11px; line-height:1.55; margin:0; font-family:'Trebuchet MS',sans-serif;">If you didn't trigger this action, you can safely ignore this email.</p>
              <p style="margin:10px 0 0; font-size:11px; font-family:'Trebuchet MS',sans-serif; color:#9b9b9b;"><span style="color:#94c73d;">&#9632;</span> Empowering the next generation of African tech talent.</p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>
    `.trim();
};

export const buildMlabEmailPlainText = (
  params: EmailTemplateParams,
): string => {
  const currentYear = new Date().getFullYear();
  // Strip HTML tags from bodyHtml for the plain text version
  const cleanBody = params.bodyHtml.replace(/<[^>]*>?/gm, "");

  return `
mLab Southern Africa — ${params.title}

Hi ${params.recipientName},

${cleanBody}

${params.ctaText}: ${params.ctaLink}

If you didn't trigger this action, you can safely ignore this email.

© ${currentYear} Mobile Applications Laboratory NPC
Empowering the next generation of African tech talent.
    `.trim();
};
