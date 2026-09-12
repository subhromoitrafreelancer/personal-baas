import { Module } from '@nestjs/common';
import { AdminAuthModule } from '../admin-auth/admin-auth.module';
import { AuthAuditModule } from '../auth/auth-audit.module';
import { ProjectsModule } from '../projects/projects.module';
import { VaultAdminController } from './vault-admin.controller';
import { VaultCryptoService } from './vault-crypto.service';
import { VaultInternalController } from './vault-internal.controller';
import { VaultInvocationTokenGuard } from './vault-invocation-token.guard';
import { VaultInvocationTokensService } from './vault-invocation-tokens.service';
import { VaultPageController } from './vault-page.controller';
import { VaultRepository } from './vault.repository';
import { VaultService } from './vault.service';

@Module({
  // Only ever needed AuthAuditService from the wider AuthModule (VaultService's audit calls) —
  // depending on the full AuthModule here would create a cycle now that AuthModule itself needs
  // EmailModule, which needs VaultModule (scope.md §32 point 3): AuthModule -> EmailModule ->
  // VaultModule -> AuthModule. AuthAuditModule has no dependency back on either, so it doesn't.
  imports: [AdminAuthModule, AuthAuditModule, ProjectsModule],
  controllers: [VaultAdminController, VaultPageController, VaultInternalController],
  providers: [
    VaultRepository,
    VaultCryptoService,
    VaultService,
    VaultInvocationTokensService,
    VaultInvocationTokenGuard,
  ],
  // VaultInvocationTokensService is consumed by FunctionsService (FunctionsModule imports
  // VaultModule) to mint/revoke the per-invocation token that authorizes a function-runner
  // worker's ctx.secrets.get() callback. VaultService is consumed by EmailModule (and, once
  // built, PdfModule/AiModule) — each stores its own project-scoped provider secret under its
  // own reserved vault-secret name, reusing this same encryption path (scope.md §32 point 3).
  exports: [VaultInvocationTokensService, VaultService],
})
export class VaultModule {}
