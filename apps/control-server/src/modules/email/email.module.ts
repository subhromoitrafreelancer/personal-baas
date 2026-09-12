import { Module } from '@nestjs/common';
import { AdminAuthModule } from '../admin-auth/admin-auth.module';
import { ProjectsModule } from '../projects/projects.module';
import { VaultModule } from '../vault/vault.module';
import { EmailAdminController } from './email-admin.controller';
import { EmailInternalController } from './email-internal.controller';
import { EmailPageController } from './email-page.controller';
import { EmailProviderConfigsRepository } from './email-provider-configs.repository';
import { EmailSentMessagesRepository } from './email-sent-messages.repository';
import { EmailService } from './email.service';

@Module({
  imports: [AdminAuthModule, ProjectsModule, VaultModule],
  controllers: [EmailAdminController, EmailInternalController, EmailPageController],
  providers: [EmailProviderConfigsRepository, EmailSentMessagesRepository, EmailService],
  // Consumed by AuthModule's password-reset request flow (scope.md §32 point 7) and by
  // FunctionsModule indirectly via the internal HTTP callback (not a DI import — function-runner
  // calls EmailInternalController over HTTP, the same shape ctx.secrets already uses).
  exports: [EmailService],
})
export class EmailModule {}
