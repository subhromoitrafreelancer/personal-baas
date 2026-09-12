import { EmailMessage, EmailProvider, EmailSendResult } from '../email.types';

export interface ResendConfig {
  apiKey: string;
  fromAddress: string;
}

// Wraps Resend's REST API directly via fetch — no SDK dependency, consistent with this
// project's minimal-dependency posture (scope.md §32). One of the two v1 EmailProvider adapters.
export class ResendProvider implements EmailProvider {
  constructor(private readonly config: ResendConfig) {}

  async send(message: EmailMessage): Promise<EmailSendResult> {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this.config.apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: this.config.fromAddress,
        to: message.to,
        subject: message.subject,
        html: message.html,
        text: message.text,
      }),
    });

    const payload = (await res.json().catch(() => ({}))) as { id?: string; message?: string };
    if (!res.ok) {
      throw new Error(payload.message ?? `Resend request failed (${res.status})`);
    }
    return { providerMessageId: payload.id ?? null };
  }
}
