import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Resend } from 'resend';

export interface MailResult {
  sent: boolean;
  id?: string;
  /** Why the e-mail did not leave (missing key, unverified domain, refused address…). */
  error?: string;
}

export interface Attachment {
  filename: string;
  content: Buffer;
}

const esc = (s: string | null | undefined) =>
  String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);

/**
 * E-mails sent through Resend. Every send is awaited and its outcome checked:
 * Resend does not throw when it refuses an e-mail (unverified domain, bad
 * sender…), it returns an error, which is logged and handed back.
 */
@Injectable()
export class MailService {
  private readonly logger = new Logger(MailService.name);
  /** Called when an e-mail does not leave (set by the incident journal). */
  onFailure?: (what: string, error: string) => void;
  private readonly apiKey: string;
  private readonly from: string;
  readonly appUrl: string;
  /** Name of the variable the sender was read from (null = Resend's test sender). */
  private readonly fromVariable: string | null;

  constructor(private config: ConfigService) {
    // Values pasted with quotes ("…" or '…') are taken without them.
    const read = (k: string) => (config.get<string>(k) ?? '').trim().replace(/^(['"])(.*)\1$/, '$2').trim();
    this.apiKey = read('RESEND_API_KEY');
    // The usual names for the sender address are all accepted.
    const names = ['MAIL_FROM', 'EMAIL_FROM', 'RESEND_FROM', 'FROM_EMAIL', 'MAIL_SENDER', 'SMTP_FROM', 'SENDER_EMAIL'];
    this.fromVariable = names.find((k) => read(k)) ?? null;
    const sender = this.fromVariable ? read(this.fromVariable) : '';
    // A bare address gets the brand name: "Malodge Club <contact@…>".
    this.from = !sender ? 'Malodge Club <onboarding@resend.dev>' : sender.includes('<') ? sender : `Malodge Club <${sender}>`;
    // Links in e-mails must point to the live site, never to localhost.
    const vercelUrl = process.env.VERCEL_PROJECT_PRODUCTION_URL || process.env.VERCEL_URL;
    this.appUrl = ((config.get<string>('APP_URL') ?? '').trim() || (vercelUrl ? `https://${vercelUrl}` : 'http://localhost:5173')).replace(/\/+$/, '');
    if (!this.apiKey) this.logger.warn('RESEND_API_KEY absente : aucun e-mail ne peut partir');
  }

  /** Configuration as the server sees it (no secret). */
  status() {
    const domain = this.from.match(/@([^>\s]+)/)?.[1] ?? null;
    return {
      configured: !!this.apiKey,
      keyLooksValid: /^re_[A-Za-z0-9_]{10,}$/.test(this.apiKey),
      from: this.from,
      fromDomain: domain,
      fromIsDefault: !this.fromVariable,
      fromVariable: this.fromVariable,
      appUrl: this.appUrl,
      appUrlIsDefault: !(this.config.get<string>('APP_URL') ?? '').trim(),
    };
  }

  private async deliver(to: string, subject: string, html: string, what: string, attachments?: Attachment[]): Promise<MailResult> {
    const result = await this.send(to, subject, html, what, attachments);
    // A missing address is not a failure of the mail system.
    if (!result.sent && result.error && !result.error.startsWith('Pas d’adresse')) {
      try {
        this.onFailure?.(what, result.error);
      } catch {
        /* never fails a send */
      }
    }
    return result;
  }

  private async send(to: string, subject: string, html: string, what: string, attachments?: Attachment[]): Promise<MailResult> {
    if (!this.apiKey) {
      this.logger.warn(`${what} non envoyé à ${to} : RESEND_API_KEY absente`);
      return { sent: false, error: 'RESEND_API_KEY absente dans les variables d’environnement du serveur' };
    }
    if (!to || /\.(invalid|local)$/i.test(to)) return { sent: false, error: 'Pas d’adresse e-mail réelle pour ce destinataire' };
    try {
      const { data, error } = await new Resend(this.apiKey).emails.send({ from: this.from, to, subject, html, ...(attachments?.length ? { attachments } : {}) });
      if (error) {
        const raw = `${(error as any).name ?? 'erreur'} : ${error.message}`;
        this.logger.error(`${what} refusé par Resend pour ${to} — ${raw}`);
        return { sent: false, error: this.explain(error.message ?? '') ?? raw };
      }
      return { sent: true, id: data?.id };
    } catch (e: any) {
      this.logger.error(`${what} : envoi impossible à ${to} — ${e?.message ?? e}`);
      return { sent: false, error: e?.message ?? String(e) };
    }
  }

  /** Resend's refusals in plain French, with what to change. */
  private explain(message: string): string | null {
    const m = message.toLowerCase();
    const st = this.status();
    if (m.includes('only send testing emails')) {
      return st.fromIsDefault
        ? `MAIL_FROM n’est pas renseignée sur le serveur : l’adresse de test de Resend (${st.from}) ne peut écrire qu’au titulaire du compte Resend. Renseignez MAIL_FROM avec une adresse de votre domaine vérifié (ex. Malodge Club <noreply@malodge.fr>) dans Vercel, puis redéployez.`
        : `L’expéditeur ${st.from} n’est pas autorisé : le domaine ${st.fromDomain} n’est pas vérifié dans le compte Resend de cette clé. Vérifiez-le dans Resend (Domains › Verify) ou utilisez un domaine déjà vérifié dans MAIL_FROM.`;
    }
    if (m.includes('not verified') || m.includes('domain is not')) {
      return `Le domaine ${st.fromDomain} de l’expéditeur n’est pas vérifié dans Resend (Domains › Verify).`;
    }
    if (m.includes('api key is invalid') || m.includes('invalid api key')) {
      return 'La clé RESEND_API_KEY est refusée par Resend : recopiez une clé valide dans Vercel puis redéployez.';
    }
    return null;
  }

  sendPasswordReset(to: string, firstName: string, token: string) {
    const url = `${this.appUrl}/reinitialiser-mot-de-passe?token=${token}`;
    return this.deliver(
      to,
      'Réinitialisation de votre mot de passe — Malodge Club',
      this.layout(
        'Réinitialisation du mot de passe',
        `<p>Bonjour ${esc(firstName)},</p><p>Nous avons reçu une demande de réinitialisation du mot de passe de votre compte. Ce lien est valable <b>1 heure</b>.</p>`,
        { label: 'Choisir un nouveau mot de passe', url },
        'Si vous n’êtes pas à l’origine de cette demande, ignorez cet e-mail : votre mot de passe reste inchangé.',
      ),
      'E-mail de réinitialisation',
    );
  }

  sendPasswordChanged(to: string, firstName: string) {
    return this.deliver(
      to,
      'Votre mot de passe a été modifié — Malodge Club',
      this.layout(
        'Mot de passe modifié',
        `<p>Bonjour ${esc(firstName)},</p><p>Le mot de passe de votre compte vient d’être modifié.</p>`,
        { label: 'Se connecter', url: `${this.appUrl}/login` },
        'Si vous n’êtes pas à l’origine de ce changement, contactez-nous immédiatement.',
      ),
      'E-mail de confirmation de mot de passe',
    );
  }

  sendWelcome(to: string, firstName: string) {
    return this.deliver(
      to,
      'Bienvenue sur Malodge Club',
      this.layout(
        'Bienvenue',
        `<p>Bonjour ${esc(firstName)},</p><p>Votre compte Malodge Club est prêt.</p>`,
        { label: 'Se connecter', url: `${this.appUrl}/login` },
      ),
      'E-mail de bienvenue',
    );
  }

  /** Invitation of a user created by an administrator: a link to choose their password (valid 7 days). */
  sendInvitation(to: string, firstName: string, token: string, invitedBy?: string) {
    const url = `${this.appUrl}/reinitialiser-mot-de-passe?token=${token}&invitation=1`;
    return this.deliver(
      to,
      'Votre accès à Malodge Club',
      this.layout(
        'Votre accès à Malodge Club',
        `<p>Bonjour ${esc(firstName)},</p><p>${invitedBy ? `${esc(invitedBy)} vous a ouvert` : 'Un accès vous a été ouvert'} un compte sur l’application Malodge Club. Choisissez votre mot de passe pour vous connecter. Ce lien est valable <b>7 jours</b>.</p><p>Votre identifiant : <b>${esc(to)}</b></p>`,
        { label: 'Choisir mon mot de passe', url },
      ),
      'Invitation',
    );
  }

  sendNotification(to: string, firstName: string, title: string, body: string) {
    return this.deliver(
      to,
      `${title} — Malodge Club`,
      this.layout(title, `<p>Bonjour ${esc(firstName)},</p><p>${esc(body).replace(/\n/g, '<br/>')}</p>`, { label: 'Ouvrir l’application', url: this.appUrl }),
      'Notification',
    );
  }

  /** A message of the guest journey (welcome, J-7, J-1, thanks), with the link to their stay space. */
  sendGuestMessage(to: string, subject: string, title: string, lines: string[], cta: { label: string; url: string }) {
    return this.deliver(to, subject, this.layout(title, lines.map((l) => `<p>${esc(l)}</p>`).join(''), cta), 'Message client');
  }

  /** Monthly statement of an owner, as a PDF attachment. */
  sendOwnerStatement(to: string, firstName: string, monthLabel: string, pdf: Buffer, filename: string) {
    return this.deliver(
      to,
      `Votre relevé de ${monthLabel} — Malodge Club`,
      this.layout(
        `Votre relevé de ${monthLabel}`,
        `<p>Bonjour ${esc(firstName)},</p><p>Vous trouverez ci-joint le relevé de ${esc(monthLabel)} pour vos villas : nuits louées, chiffre d’affaires, commission de gestion, votre part sur les extras et les versements du mois.</p><p>Une question ? Répondez simplement à cet e-mail.</p>`,
      ),
      'Relevé propriétaire',
      [{ filename, content: pdf }],
    );
  }

  /** Incident alert to an administrator: a few labelled lines and a link to the check page. */
  sendAlert(to: string, subject: string, lines: [string, string][]) {
    const rows = lines
      .map(([k, v]) => `<tr><td style="padding:4px 12px 4px 0;color:#6B6E80;vertical-align:top;">${esc(k)}</td><td style="padding:4px 0;">${esc(v)}</td></tr>`)
      .join('');
    return this.deliver(
      to,
      `[Malodge] ${subject}`,
      this.layout('Incident sur l’application', `<table style="border-collapse:collapse;font-size:14px;">${rows}</table>`, { label: 'Voir le contrôle des données', url: `${this.appUrl}/controle` }),
      'Alerte incident',
    );
  }

  sendTest(to: string) {
    return this.deliver(
      to,
      'Test d’envoi — Malodge Club',
      this.layout(
        'Les e-mails fonctionnent',
        `<p>Cet e-mail de test confirme que l’application peut envoyer des e-mails.</p><p>Expéditeur : <b>${esc(this.from)}</b><br/>Liens vers : <b>${esc(this.appUrl)}</b></p>`,
      ),
      'E-mail de test',
    );
  }

  // ─── Layout (MALODGE CLUB, light) ────────────────────────────────────────────

  private layout(title: string, body: string, cta?: { label: string; url: string }, footnote?: string) {
    return `<!DOCTYPE html>
<html lang="fr"><head><meta charset="UTF-8" /><meta name="viewport" content="width=device-width, initial-scale=1.0" /><title>${esc(title)}</title></head>
<body style="margin:0;padding:0;background:#F7F7F9;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;color:#1C1D29;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#F7F7F9;padding:32px 16px;"><tr><td align="center">
    <table width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;">
      <tr><td style="padding-bottom:24px;">
        <span style="font-size:17px;font-weight:800;letter-spacing:3px;color:#1C1D29;">MALODGE</span><br/>
        <span style="font-size:10px;font-weight:700;letter-spacing:6px;color:#B2593A;">CLUB</span>
      </td></tr>
      <tr><td style="background:#FFFFFF;border:1px solid #E9E9EE;border-radius:18px;padding:32px;font-size:14px;line-height:1.6;color:#4C4E5E;">
        <h1 style="margin:0 0 16px;font-size:20px;font-weight:800;color:#1C1D29;">${esc(title)}</h1>
        ${body}
        ${cta ? `<p style="margin:28px 0 8px;"><a href="${esc(cta.url)}" style="display:inline-block;background:#1F2130;color:#FFFFFF;text-decoration:none;font-weight:700;padding:12px 22px;border-radius:999px;">${esc(cta.label)}</a></p>
        <p style="margin:0;font-size:12px;color:#707282;">Ou copiez ce lien : <a href="${esc(cta.url)}" style="color:#B2593A;word-break:break-all;">${esc(cta.url)}</a></p>` : ''}
        ${footnote ? `<p style="margin:24px 0 0;font-size:12px;color:#707282;">${esc(footnote)}</p>` : ''}
      </td></tr>
      <tr><td style="padding-top:18px;font-size:11px;color:#707282;text-align:center;">Malodge Club · Conciergerie de luxe</td></tr>
    </table>
  </td></tr></table>
</body></html>`;
  }
}
