import { Module } from '@nestjs/common';
import { ApiKeysRepository } from '../api-keys/api-keys.repository';
import { EmailModule } from '../email/email.module';
import { ProjectsModule } from '../projects/projects.module';
import { ApiKeyBearerGuard } from './api-key-bearer.guard';
import { AuthAuditModule } from './auth-audit.module';
import { AuthJwtService } from './auth-jwt.service';
import { AuthPasswordResetTokensRepository } from './auth-password-reset-tokens.repository';
import { AuthRefreshTokensRepository } from './auth-refresh-tokens.repository';
import { AuthSessionsRepository } from './auth-sessions.repository';
import { AuthController } from './auth.controller';
import { AuthUsersRepository } from './auth-users.repository';
import { LoginService } from './login.service';
import { PasswordResetService } from './password-reset.service';
import { RefreshService } from './refresh.service';
import { SelfServiceService } from './self-service.service';
import { SignupService } from './signup.service';

@Module({
  imports: [ProjectsModule, EmailModule, AuthAuditModule],
  controllers: [AuthController],
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
  ],
  // Re-exports the whole AuthAuditModule (not the bare AuthAuditEventsRepository/AuthAuditService
  // tokens) — Nest only allows a module to export a provider that is either its own or that
  // belongs to a module it re-exports wholesale, not an individual token cherry-picked out of an
  // imported module.
  exports: [
    AuthJwtService,
    AuthUsersRepository,
    AuthPasswordResetTokensRepository,
    AuthAuditModule,
  ],
})
export class AuthModule {}
