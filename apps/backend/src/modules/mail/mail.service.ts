import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Resend } from 'resend';
import { withCompanyName } from '../settings/company';

export interface MailResult {
  sent: boolean;
  id?: string;
  /** Why the e-mail did not leave (missing key, unverified domain, refused address…). */
  error?: string;
}

export interface CompanyInfo {
  name: string;
  supportEmail?: string;
  phone?: string;
  website?: string;
}

/** Key figures shown in a soft box (label, value, highlighted). */
export type Fact = [string, string, boolean?];

export interface Attachment {
  filename: string;
  content: Buffer;
}

const esc = (s: string | null | undefined) =>
  String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);

/** The app's colours (light theme): terracotta accent, Apple greys. */
const C = { canvas: '#F5F5F7', ink: '#1D1D1F', soft2: '#424245', muted: '#6E6E73', line: '#E5E5EA', soft: '#F5F5F7', accent: '#B2502C' };
/** Replaced by the company's footer when the e-mail leaves. */
const FOOTER_SLOT = '<!--company-footer-->';

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
  /** The company's details once set in Paramètres (set by the settings): sign every e-mail and fill its footer. */
  company?: () => Promise<CompanyInfo | null>;
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
    const info = (await this.company?.().catch(() => null)) ?? null;
    const name = info?.name ?? null;
    subject = withCompanyName(subject, name);
    html = withCompanyName(html.replace(FOOTER_SLOT, this.footer(info)), name);
    // The sender's display name too, unless MAIL_FROM gives its own.
    const from = name ? this.from.replace(/^Malodge Club </, `${name} <`) : this.from;
    try {
      const { data, error } = await new Resend(this.apiKey).emails.send({ from, to, subject, html, ...(attachments?.length ? { attachments } : {}) });
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
        { preheader: 'Votre lien pour choisir un nouveau mot de passe (valable 1 heure).' },
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
        undefined,
        { preheader: 'Choisissez votre mot de passe pour accéder à votre espace.' },
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

  /** Monthly statement of an owner, as a PDF attachment, with the month's key figures. */
  sendOwnerStatement(
    to: string,
    firstName: string,
    monthLabel: string,
    pdf: Buffer,
    filename: string,
    summary?: { nights: number; due: string; paid: string; remaining: string; houses: string[] },
  ) {
    return this.deliver(
      to,
      `Votre relevé de ${monthLabel} — Malodge Club`,
      this.layout(
        `Votre relevé de ${monthLabel}`,
        `<p>Bonjour ${esc(firstName)},</p><p>Voici le relevé de ${esc(monthLabel)}${summary?.houses.length ? ` pour <b>${esc(summary.houses.join(', '))}</b>` : ' pour vos villas'} : nuits louées, chiffre d’affaires, commission de gestion, votre part sur les extras et les versements du mois. Le détail est dans le PDF joint.</p>`,
        undefined,
        'Une question sur ce relevé ? Répondez simplement à cet e-mail.',
        {
          preheader: summary ? `Reste à verser : ${summary.remaining} · ${summary.nights} nuit(s) louée(s)` : `Votre relevé de ${monthLabel}`,
          facts: summary
            ? [
                ['Nuits louées', String(summary.nights)],
                ['Total dû pour le mois', summary.due],
                ['Déjà versé', summary.paid],
                ['Reste à verser', summary.remaining, true],
              ]
            : undefined,
        },
      ),
      'Relevé propriétaire',
      [{ filename, content: pdf }],
    );
  }

  /** Incident alert to an administrator: a few labelled lines and a link to the check page. */
  sendAlert(to: string, subject: string, lines: [string, string][]) {
    return this.deliver(
      to,
      `[Malodge] ${subject}`,
      this.layout('Incident sur l’application', `<p>${esc(subject)}</p>`, { label: 'Voir le contrôle des données', url: `${this.appUrl}/controle` }, undefined, {
        facts: lines.map(([k, v]) => [k, v] as Fact),
      }),
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

  // ─── Layout (MALODGE CLUB, light, the app's look) ───────────────────────────

  /** Company name and contacts, from Paramètres › Général (filled in when the e-mail leaves). */
  private footer(info: CompanyInfo | null) {
    const name = info?.name || 'Malodge Club';
    const link = (href: string, text: string) => `<a href="${esc(href)}" style="color:${C.muted};text-decoration:none;">${esc(text)}</a>`;
    const contacts = [
      info?.supportEmail ? link(`mailto:${info.supportEmail}`, info.supportEmail) : null,
      info?.phone ? link(`tel:${info.phone.replace(/[^+\d]/g, '')}`, info.phone) : null,
      info?.website ? link(info.website, info.website.replace(/^https?:\/\//, '')) : null,
    ].filter(Boolean);
    return `<p style="margin:0 0 4px;font-size:13px;font-weight:600;color:${C.ink};">${esc(name)}</p>
      <p style="margin:0;font-size:12px;line-height:1.6;color:${C.muted};">Conciergerie de luxe${contacts.length ? `<br/>${contacts.join(' &nbsp;·&nbsp; ')}` : ''}</p>`;
  }

  private layout(title: string, body: string, cta?: { label: string; url: string }, footnote?: string, extra: { preheader?: string; facts?: Fact[] } = {}) {
    const logo = `${this.appUrl}/brand/malodge-club-logo.png`;
    const facts = extra.facts?.length
      ? `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:22px 0 4px;background:${C.soft};border-radius:16px;">
          ${extra.facts
            .map(
              ([k, v, strong], i) => `<tr><td style="padding:${i ? 6 : 16}px 0 ${i === extra.facts!.length - 1 ? 16 : 6}px 20px;font-size:14px;color:${strong ? C.ink : C.soft2};${strong ? 'font-weight:700;' : ''}">${esc(k)}</td>
              <td align="right" style="padding:${i ? 6 : 16}px 20px ${i === extra.facts!.length - 1 ? 16 : 6}px 0;font-size:${strong ? 16 : 14}px;font-weight:${strong ? 800 : 600};color:${strong ? C.accent : C.ink};white-space:nowrap;">${esc(v)}</td></tr>`,
            )
            .join('')}
        </table>`
      : '';
    const button = cta
      ? `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:30px 0 0;"><tr><td style="border-radius:999px;background:${C.accent};">
          <a href="${esc(cta.url)}" style="display:inline-block;padding:14px 28px;font-size:15px;font-weight:700;color:#FFFFFF;text-decoration:none;border-radius:999px;">${esc(cta.label)}</a>
        </td></tr></table>
        <p style="margin:16px 0 0;font-size:12px;line-height:1.5;color:${C.muted};">Le bouton ne s’ouvre pas ? Copiez ce lien :<br/><a href="${esc(cta.url)}" style="color:${C.accent};word-break:break-all;">${esc(cta.url)}</a></p>`
      : '';
    // Paragraphs of the body in the house style (the templates write plain <p>).
    const styled = body.replace(/<p>/g, `<p style="margin:0 0 14px;font-size:15px;line-height:1.65;color:${C.soft2};">`).replace(/<b>/g, `<b style="color:${C.ink};">`);
    return `<!DOCTYPE html>
<html lang="fr"><head><meta charset="UTF-8" /><meta name="viewport" content="width=device-width, initial-scale=1.0" />
<meta name="color-scheme" content="light only" /><meta name="supported-color-schemes" content="light" /><title>${esc(title)}</title>
<style>@media (max-width:480px){.mc-card{padding:28px 22px 26px !important;border-radius:20px !important}.mc-title{font-size:22px !important}}</style></head>
<body style="margin:0;padding:0;background:${C.canvas};font-family:-apple-system,BlinkMacSystemFont,'SF Pro Text','Segoe UI',Inter,Helvetica,Arial,sans-serif;color:${C.ink};-webkit-font-smoothing:antialiased;">
  <div style="display:none;max-height:0;overflow:hidden;opacity:0;color:transparent;">${esc(extra.preheader ?? title)}</div>
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${C.canvas};"><tr><td align="center" style="padding:36px 16px 40px;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:600px;">
      <tr><td style="padding:0 6px 22px;">
        <img src="${esc(logo)}" width="150" height="35" alt="MALODGE CLUB" style="display:block;border:0;outline:none;width:150px;height:auto;font-size:16px;font-weight:800;letter-spacing:3px;color:${C.ink};" />
      </td></tr>
      <tr><td class="mc-card" style="background:#FFFFFF;border:1px solid ${C.line};border-radius:24px;padding:40px 40px 36px;">
        <h1 class="mc-title" style="margin:0 0 18px;font-size:24px;line-height:1.25;font-weight:700;letter-spacing:-0.3px;color:${C.ink};">${esc(title)}</h1>
        ${styled}
        ${facts}
        ${button}
        ${footnote ? `<p style="margin:28px 0 0;padding-top:18px;border-top:1px solid ${C.line};font-size:13px;line-height:1.55;color:${C.muted};">${esc(footnote)}</p>` : ''}
      </td></tr>
      <tr><td style="padding:24px 8px 0;">${FOOTER_SLOT}</td></tr>
    </table>
  </td></tr></table>
</body></html>`;
  }
}
