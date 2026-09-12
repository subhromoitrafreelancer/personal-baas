import nodemailer from 'nodemailer';
import { EmailMessage, EmailProvider, EmailSendResult } from '../email.types';

export interface SmtpConfig {
  host: string;
  port: number;
  secure: boolean;
  username: string | null;
  password: string;
  fromAddress: string;
}

// Generic SMTP adapter (nodemailer) — covers SES, SendGrid, Mailgun, Postmark, Gmail, or any
// self-hosted mail server with zero vendor-specific code (scope.md §32), the other of the two v1
// EmailProvider adapters. A fresh transport per send, not pooled — v1 sending volume doesn't
// warrant connection reuse, and per-call construction keeps this provider stateless like
// ResendProvider.
export class SmtpProvider implements EmailProvider {
  constructor(private readonly config: SmtpConfig) {}

  async send(message: EmailMessage): Promise<EmailSendResult> {
    const transport = nodemailer.createTransport({
      host: this.config.host,
      port: this.config.port,
      secure: this.config.secure,
      auth: this.config.username
        ? { user: this.config.username, pass: this.config.password }
        : undefined,
    });

    const info = await transport.sendMail({
      from: this.config.fromAddress,
      to: message.to,
      subject: message.subject,
      html: message.html,
      text: message.text,
    });

    return { providerMessageId: info.messageId ?? null };
  }
}
