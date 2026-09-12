// Reserved vault-secret name holding a project's email provider credential (Resend API key, or
// SMTP password) — scope.md §32 point 3. Reuses the Secrets Vault (§30) exactly the way the AI
// Gateway reuses it for AI_PROVIDER_API_KEY (§35 point 3), rather than a second encryption path.
export const EMAIL_PROVIDER_SECRET_NAME = 'EMAIL_PROVIDER_SECRET';

export type EmailProviderKind = 'resend' | 'smtp';

export interface EmailProviderConfigRow {
  id: string;
  project_id: string;
  provider: EmailProviderKind;
  from_address: string;
  smtp_host: string | null;
  smtp_port: number | null;
  smtp_secure: boolean | null;
  smtp_username: string | null;
  enabled: boolean;
  created_at: Date;
  updated_at: Date;
}

export interface EmailSentMessageRow {
  id: string;
  project_id: string;
  to_address: string;
  subject: string;
  provider: string | null;
  status: 'sent' | 'failed';
  provider_message_id: string | null;
  error: string | null;
  created_at: Date;
}

export interface EmailMessage {
  to: string;
  subject: string;
  html?: string;
  text?: string;
}

export interface EmailSendResult {
  providerMessageId: string | null;
}

// Implemented by ResendProvider and SmtpProvider (scope.md §32 point 1) — the same
// one-interface-two-adapters shape as PdfProvider (§34) and AiProvider (§35).
export interface EmailProvider {
  send(message: EmailMessage): Promise<EmailSendResult>;
}
