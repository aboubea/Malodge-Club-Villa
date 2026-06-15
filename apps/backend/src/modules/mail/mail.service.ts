import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Resend } from 'resend';

@Injectable()
export class MailService {
  private readonly logger = new Logger(MailService.name);
  private readonly apiKey: string;
  private readonly from: string;
  private readonly appUrl: string;

  constructor(private config: ConfigService) {
    this.apiKey = config.get('RESEND_API_KEY', '');
    this.from = config.get('MAIL_FROM', 'Malodge Club Villa <noreply@malodge.com>');
    this.appUrl = config.get('APP_URL', 'http://localhost:5173');
    if (!this.apiKey) {
      this.logger.warn('RESEND_API_KEY not set — email sending disabled');
    }
  }

  private getClient(): Resend | null {
    if (!this.apiKey) return null;
    return new Resend(this.apiKey);
  }

  async sendPasswordReset(to: string, firstName: string, token: string): Promise<void> {
    const client = this.getClient();
    if (!client) return;
    const resetUrl = `${this.appUrl}/reinitialiser-mot-de-passe?token=${token}`;

    try {
      await client.emails.send({
        from: this.from,
        to,
        subject: 'Réinitialisation de votre mot de passe — Malodge Club Villa',
        html: this.buildPasswordResetHtml(firstName, resetUrl),
      });
    } catch (err) {
      this.logger.error(`Failed to send password reset email to ${to}`, err);
    }
  }

  async sendPasswordChanged(to: string, firstName: string): Promise<void> {
    const client = this.getClient();
    if (!client) return;
    try {
      await client.emails.send({
        from: this.from,
        to,
        subject: 'Votre mot de passe a été modifié — Malodge Club Villa',
        html: this.buildPasswordChangedHtml(firstName),
      });
    } catch (err) {
      this.logger.error(`Failed to send password changed email to ${to}`, err);
    }
  }

  async sendWelcome(to: string, firstName: string, tempPassword?: string): Promise<void> {
    const client = this.getClient();
    if (!client) return;
    try {
      await client.emails.send({
        from: this.from,
        to,
        subject: 'Bienvenue sur Malodge Club Villa',
        html: this.buildWelcomeHtml(firstName, tempPassword),
      });
    } catch (err) {
      this.logger.error(`Failed to send welcome email to ${to}`, err);
    }
  }

  // ─── Email templates ────────────────────────────────────────────────────────

  private buildPasswordResetHtml(firstName: string, resetUrl: string): string {
    return `<!DOCTYPE html>
<html lang="fr">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Réinitialisation du mot de passe</title>
</head>
<body style="margin:0;padding:0;background-color:#0A0A0B;font-family:-apple-system,BlinkMacSystemFont,'Inter',sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background-color:#0A0A0B;padding:40px 20px;">
    <tr>
      <td align="center">
        <table width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;">

          <!-- Logo -->
          <tr>
            <td style="padding-bottom:32px;text-align:center;">
              <table cellpadding="0" cellspacing="0" style="display:inline-table;">
                <tr>
                  <td style="width:36px;height:36px;background:#C9A96E;border-radius:10px;text-align:center;vertical-align:middle;">
                    <span style="font-size:18px;color:#0A0A0B;font-weight:700;">M</span>
                  </td>
                  <td style="padding-left:10px;vertical-align:middle;">
                    <span style="font-size:15px;color:#F5F0EB;font-weight:500;">Malodge</span>
                    <span style="font-size:11px;color:#C9A96E;display:block;margin-top:1px;">Club Villa</span>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- Card -->
          <tr>
            <td style="background:#111113;border:1px solid #242428;border-radius:16px;padding:40px;">

              <h1 style="margin:0 0 8px;font-size:22px;font-weight:300;color:#F5F0EB;letter-spacing:-0.3px;">
                Réinitialisation du mot de passe
              </h1>
              <p style="margin:0 0 28px;font-size:14px;color:#6B6B6F;line-height:1.6;">
                Bonjour ${firstName},
              </p>
              <p style="margin:0 0 28px;font-size:14px;color:#6B6B6F;line-height:1.6;">
                Nous avons reçu une demande de réinitialisation de mot de passe pour votre compte.
                Cliquez sur le bouton ci-dessous pour créer un nouveau mot de passe.
                Ce lien est valable <strong style="color:#F5F0EB;">1 heure</strong>.
              </p>

              <!-- CTA Button -->
              <table cellpadding="0" cellspacing="0" style="margin:0 0 28px;">
                <tr>
                  <td style="background:#C9A96E;border-radius:10px;">
                    <a href="${resetUrl}" style="display:inline-block;padding:14px 28px;font-size:14px;font-weight:500;color:#0A0A0B;text-decoration:none;letter-spacing:0.1px;">
                      Réinitialiser mon mot de passe
                    </a>
                  </td>
                </tr>
              </table>

              <p style="margin:0 0 8px;font-size:12px;color:#6B6B6F;line-height:1.6;">
                Si le bouton ne fonctionne pas, copiez ce lien dans votre navigateur :
              </p>
              <p style="margin:0 0 28px;font-size:11px;color:#C9A96E;word-break:break-all;">
                ${resetUrl}
              </p>

              <hr style="border:none;border-top:1px solid #242428;margin:0 0 20px;" />

              <p style="margin:0;font-size:12px;color:#6B6B6F;line-height:1.6;">
                Si vous n'avez pas demandé cette réinitialisation, ignorez cet email.
                Votre mot de passe restera inchangé.
              </p>
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="padding-top:24px;text-align:center;">
              <p style="margin:0;font-size:11px;color:#6B6B6F;">
                © ${new Date().getFullYear()} Malodge Club Villa. Tous droits réservés.
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

  private buildPasswordChangedHtml(firstName: string): string {
    return `<!DOCTYPE html>
<html lang="fr">
<head><meta charset="UTF-8" /><title>Mot de passe modifié</title></head>
<body style="margin:0;padding:0;background-color:#0A0A0B;font-family:-apple-system,BlinkMacSystemFont,'Inter',sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background-color:#0A0A0B;padding:40px 20px;">
    <tr>
      <td align="center">
        <table width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;">
          <tr>
            <td style="padding-bottom:32px;text-align:center;">
              <table cellpadding="0" cellspacing="0" style="display:inline-table;">
                <tr>
                  <td style="width:36px;height:36px;background:#C9A96E;border-radius:10px;text-align:center;vertical-align:middle;">
                    <span style="font-size:18px;color:#0A0A0B;font-weight:700;">M</span>
                  </td>
                  <td style="padding-left:10px;vertical-align:middle;">
                    <span style="font-size:15px;color:#F5F0EB;font-weight:500;">Malodge</span>
                    <span style="font-size:11px;color:#C9A96E;display:block;margin-top:1px;">Club Villa</span>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
          <tr>
            <td style="background:#111113;border:1px solid #242428;border-radius:16px;padding:40px;">
              <h1 style="margin:0 0 8px;font-size:22px;font-weight:300;color:#F5F0EB;">
                Mot de passe modifié
              </h1>
              <p style="margin:0 0 20px;font-size:14px;color:#6B6B6F;line-height:1.6;">
                Bonjour ${firstName},
              </p>
              <p style="margin:0 0 20px;font-size:14px;color:#6B6B6F;line-height:1.6;">
                Votre mot de passe a été modifié avec succès le
                <strong style="color:#F5F0EB;">${new Date().toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit' })}</strong>.
              </p>
              <p style="margin:0;font-size:13px;color:#6B6B6F;line-height:1.6;">
                Si vous n'êtes pas à l'origine de cette modification, contactez immédiatement
                votre administrateur.
              </p>
            </td>
          </tr>
          <tr>
            <td style="padding-top:24px;text-align:center;">
              <p style="margin:0;font-size:11px;color:#6B6B6F;">
                © ${new Date().getFullYear()} Malodge Club Villa. Tous droits réservés.
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

  private buildWelcomeHtml(firstName: string, tempPassword?: string): string {
    return `<!DOCTYPE html>
<html lang="fr">
<head><meta charset="UTF-8" /><title>Bienvenue</title></head>
<body style="margin:0;padding:0;background-color:#0A0A0B;font-family:-apple-system,BlinkMacSystemFont,'Inter',sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background-color:#0A0A0B;padding:40px 20px;">
    <tr>
      <td align="center">
        <table width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;">
          <tr>
            <td style="padding-bottom:32px;text-align:center;">
              <table cellpadding="0" cellspacing="0" style="display:inline-table;">
                <tr>
                  <td style="width:36px;height:36px;background:#C9A96E;border-radius:10px;text-align:center;vertical-align:middle;">
                    <span style="font-size:18px;color:#0A0A0B;font-weight:700;">M</span>
                  </td>
                  <td style="padding-left:10px;vertical-align:middle;">
                    <span style="font-size:15px;color:#F5F0EB;font-weight:500;">Malodge</span>
                    <span style="font-size:11px;color:#C9A96E;display:block;margin-top:1px;">Club Villa</span>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
          <tr>
            <td style="background:#111113;border:1px solid #242428;border-radius:16px;padding:40px;">
              <h1 style="margin:0 0 8px;font-size:22px;font-weight:300;color:#F5F0EB;">
                Bienvenue, ${firstName} !
              </h1>
              <p style="margin:0 0 20px;font-size:14px;color:#6B6B6F;line-height:1.6;">
                Votre compte Malodge Club Villa a été créé. Vous pouvez dès maintenant
                vous connecter à la plateforme.
              </p>
              ${tempPassword ? `
              <div style="background:#1A1A1D;border:1px solid #242428;border-radius:10px;padding:16px;margin-bottom:24px;">
                <p style="margin:0 0 6px;font-size:12px;color:#6B6B6F;text-transform:uppercase;letter-spacing:0.5px;">
                  Mot de passe temporaire
                </p>
                <p style="margin:0;font-size:16px;color:#C9A96E;font-family:monospace;letter-spacing:1px;">
                  ${tempPassword}
                </p>
              </div>
              <p style="margin:0 0 20px;font-size:13px;color:#6B6B6F;line-height:1.6;">
                Pensez à modifier votre mot de passe dès votre première connexion.
              </p>
              ` : ''}
              <p style="margin:0;font-size:13px;color:#6B6B6F;">
                Pour toute question, contactez votre administrateur.
              </p>
            </td>
          </tr>
          <tr>
            <td style="padding-top:24px;text-align:center;">
              <p style="margin:0;font-size:11px;color:#6B6B6F;">
                © ${new Date().getFullYear()} Malodge Club Villa. Tous droits réservés.
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
}
