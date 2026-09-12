import { BadGatewayException, Injectable, NotFoundException } from '@nestjs/common';
import { VaultService } from '../vault/vault.service';
import { buildEmailProvider } from './email-provider.factory';
import {
  EmailProviderConfigsRepository,
  UpsertProviderConfigInput,
} from './email-provider-configs.repository';
import { EmailSentMessagesRepository } from './email-sent-messages.repository';
import { EMAIL_PROVIDER_SECRET_NAME, EmailMessage } from './email.types';

export interface EmailSendOutcome {
  status: 'sent' | 'failed';
  providerMessageId: string | null;
  error: string | null;
  reason: 'not_configured' | 'provider_error' | null;
}

@Injectable()
export class EmailService {
  constructor(
    private readonly configs: EmailProviderConfigsRepository,
    private readonly sentMessages: EmailSentMessagesRepository,
    private readonly vault: VaultService,
  ) {}

  getConfig(projectId: string) {
    return this.configs.findByProjectId(projectId);
  }

  saveConfig(projectId: string, input: UpsertProviderConfigInput) {
    return this.configs.upsert(projectId, input);
  }

  setSecret(projectId: string, value: string, adminEmail: string) {
    return this.vault.upsert(projectId, EMAIL_PROVIDER_SECRET_NAME, value, adminEmail);
  }

  listSent(projectId: string, limit = 50) {
    return this.sentMessages.listByProject(projectId, limit);
  }

  // The one method that ever actually sends an email — never throws. Every caller gets a plain
  // result object and a durable email.sent_messages row regardless of outcome (scope.md §32
  // points 7-8): the public password-reset endpoint must return an identical response either
  // way, and ctx.email.send()'s internal endpoint (sendOrThrow, below) decides how to surface a
  // failure to its own caller instead of this method deciding for it.
  async send(projectId: string, message: EmailMessage): Promise<EmailSendOutcome> {
    const config = await this.configs.findByProjectId(projectId);
    if (!config || !config.enabled) {
      return this.recordAndReturn(
        projectId,
        message,
        null,
        'failed',
        null,
        'Email is not configured for this project',
        'not_configured',
      );
    }

    const secret = await this.vault.resolveForFunction(projectId, EMAIL_PROVIDER_SECRET_NAME);
    if (!secret) {
      return this.recordAndReturn(
        projectId,
        message,
        config.provider,
        'failed',
        null,
        'Email provider secret is not set for this project',
        'not_configured',
      );
    }

    try {
      const provider = buildEmailProvider(config, secret);
      const result = await provider.send(message);
      return this.recordAndReturn(
        projectId,
        message,
        config.provider,
        'sent',
        result.providerMessageId,
        null,
        null,
      );
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : String(err);
      return this.recordAndReturn(
        projectId,
        message,
        config.provider,
        'failed',
        null,
        errorMessage,
        'provider_error',
      );
    }
  }

  // Used by ctx.email.send() (scope.md §32 point 8) — unlike send()/the public password-reset
  // path, a Function should see a real, immediate error when its project's email isn't usable,
  // not a silently-swallowed success (mirrors the AI Gateway's "clean 404 for an unconfigured
  // project", §35 point 10).
  async sendOrThrow(
    projectId: string,
    message: EmailMessage,
  ): Promise<{ providerMessageId: string | null }> {
    const outcome = await this.send(projectId, message);
    if (outcome.status === 'failed') {
      if (outcome.reason === 'not_configured') {
        throw new NotFoundException(outcome.error);
      }
      throw new BadGatewayException(outcome.error ?? 'Failed to send email');
    }
    return { providerMessageId: outcome.providerMessageId };
  }

  private async recordAndReturn(
    projectId: string,
    message: EmailMessage,
    provider: string | null,
    status: 'sent' | 'failed',
    providerMessageId: string | null,
    error: string | null,
    reason: 'not_configured' | 'provider_error' | null,
  ): Promise<EmailSendOutcome> {
    await this.sentMessages.record({
      projectId,
      toAddress: message.to,
      subject: message.subject,
      provider,
      status,
      providerMessageId,
      error,
    });
    return { status, providerMessageId, error, reason };
  }
}
