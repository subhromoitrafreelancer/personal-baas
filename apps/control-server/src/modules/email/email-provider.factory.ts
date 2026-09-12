import { BadRequestException } from '@nestjs/common';
import { EmailProviderConfigRow, EmailProvider } from './email.types';
import { ResendProvider } from './providers/resend.provider';
import { SmtpProvider } from './providers/smtp.provider';

// Builds the right EmailProvider adapter for a project's stored config + decrypted secret.
// Config is per-call, not injected as a singleton — each project can have a different provider
// (scope.md §32 point 2), so there is no single "the" provider instance for this module.
export function buildEmailProvider(config: EmailProviderConfigRow, secret: string): EmailProvider {
  if (config.provider === 'resend') {
    return new ResendProvider({ apiKey: secret, fromAddress: config.from_address });
  }

  if (!config.smtp_host || !config.smtp_port) {
    throw new BadRequestException('SMTP host/port are not configured for this project');
  }
  return new SmtpProvider({
    host: config.smtp_host,
    port: config.smtp_port,
    secure: config.smtp_secure ?? false,
    username: config.smtp_username,
    password: secret,
    fromAddress: config.from_address,
  });
}
