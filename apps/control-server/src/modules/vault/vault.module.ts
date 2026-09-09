import { Module } from '@nestjs/common';
import { AdminAuthModule } from '../admin-auth/admin-auth.module';
import { AuthModule } from '../auth/auth.module';
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
  imports: [AdminAuthModule, AuthModule, ProjectsModule],
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
  // worker's ctx.secrets.get() callback.
  exports: [VaultInvocationTokensService],
})
export class VaultModule {}
