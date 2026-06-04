import { Resend } from "resend";

// Enveloppe d'envoi d'email transactionnel (Resend). Centralise la config et
// dégrade proprement : si `RESEND_API_KEY` est absent (dev local, prod sans
// domaine vérifié), on n'envoie rien et on log — l'appelant ne plante jamais.

interface SendEmailInput {
  to: string;
  subject: string;
  html: string;
}

export function isEmailConfigured(): boolean {
  return Boolean(process.env.RESEND_API_KEY);
}

export async function sendEmail({
  to,
  subject,
  html,
}: SendEmailInput): Promise<void> {
  if (!isEmailConfigured()) {
    console.warn(`[email] RESEND_API_KEY absent — email "${subject}" non envoyé à ${to}.`);
    return;
  }
  const from =
    process.env.RESEND_FROM_EMAIL ?? "noreply@piloti.mathiscapart.xyz";
  try {
    const resend = new Resend(process.env.RESEND_API_KEY);
    await resend.emails.send({ from, to, subject, html });
  } catch (err) {
    // Un échec d'email ne doit jamais casser l'action métier appelante.
    console.error(`[email] échec d'envoi "${subject}" à ${to}:`, err);
  }
}

// Gabarit HTML minimal aux couleurs SGDF, partagé par les emails de notification.
export function notificationEmailHtml(opts: {
  title: string;
  body: string;
  url: string;
  cta?: string;
}): string {
  const { title, body, url, cta = "Ouvrir Piloti" } = opts;
  return `
    <div style="font-family:system-ui,-apple-system,sans-serif;max-width:480px;margin:0 auto;">
      <h2 style="color:#1a4d2e;">${title}</h2>
      <p style="color:#3a3a3a;font-size:15px;line-height:1.5;">${body}</p>
      <p style="margin:24px 0;">
        <a href="${url}" style="background:#1a7a4a;color:#fff;padding:10px 20px;border-radius:9999px;text-decoration:none;font-weight:bold;">${cta}</a>
      </p>
      <p style="color:#999;font-size:12px;">
        Vous recevez cet email car les notifications par email sont activées sur votre compte Piloti.
        Vous pouvez les désactiver depuis « Mon compte ».
      </p>
    </div>
  `;
}
