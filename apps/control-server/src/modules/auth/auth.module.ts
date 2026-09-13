import { Module } from '@nestjs/common';
import { ApiKeysRepository } from '../api-keys/api-keys.repository';
import { EmailModule } from '../email/email.module';
import { ProjectsModule } from '../projects/projects.module';
import { VaultModule } from '../vault/vault.module';
import { ApiKeyBearerGuard } from './api-key-bearer.guard';
import { AuthAuditModule } from './auth-audit.module';
import { AuthJwtService } from './auth-jwt.service';
import { AuthPasswordResetTokensRepository } from './auth-password-reset-tokens.repository';
import { AuthRefreshTokensRepository } from './auth-refresh-tokens.repository';
import { AuthSessionsRepository } from './auth-sessions.repository';
import { AuthController } from './auth.controller';
import { AuthUsersRepository } from './auth-users.repository';
import { LoginService } from './login.service';
import { MfaBackupCodesRepository } from './mfa/mfa-backup-codes.repository';
import { MfaEnrollmentGuard } from './mfa/mfa-enrollment.guard';
import { MfaFactorsRepository } from './mfa/mfa-factors.repository';
import { MfaController } from './mfa/mfa.controller';
import { MfaService } from './mfa/mfa.service';
import { PasswordResetService } from './password-reset.service';
import { RefreshService } from './refresh.service';
import { SelfServiceService } from './self-service.service';
import { SignupService } from './signup.service';

@Module({
  // VaultModule: reuses VaultCryptoService directly for TOTP-secret encryption (Phase 19,
  // scope.md §33 point 3) — safe to import here since VaultModule has no path back to
  // AuthModule after the Phase 18 AuthAuditModule extraction.
  imports: [ProjectsModule, EmailModule, AuthAuditModule, VaultModule],
  controllers: [AuthController, MfaController],
  providers: [
    AuthJwtService,
    AuthUsersRepository,
    AuthSessionsRepository,
    AuthRefreshTokensRepository,
    AuthPasswordResetTokensRepository,
    // Separate instance from ApiKeysModule's (see api-key-bearer.guard.ts) — avoids a
    // circular import, since ApiKeysModule already imports AuthModule.
    ApiKeysRepository,
    ApiKeyBearerGuard,
    SignupService,
    LoginService,
    RefreshService,
    SelfServiceService,
    PasswordResetService,
    MfaFactorsRepository,
    MfaBackupCodesRepository,
    MfaService,
    MfaEnrollmentGuard,
  ],
  // Re-exports the whole AuthAuditModule (not the bare AuthAuditEventsRepository/AuthAuditService
  // tokens) — Nest only allows a module to export a provider that is either its own or that
  // belongs to a module it re-exports wholesale, not an individual token cherry-picked out of an
  // imported module. MfaService is exported for AdminUsersModule's admin-triggered reset action.
  exports: [
    AuthJwtService,
    AuthUsersRepository,
    AuthPasswordResetTokensRepository,
    AuthAuditModule,
    MfaService,
    MfaFactorsRepository,
  ],
})
export class AuthModule {}
