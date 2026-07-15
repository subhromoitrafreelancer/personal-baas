import { Module } from '@nestjs/common';
import { AuthAuditEventsRepository } from './auth-audit-events.repository';
import { AuthAuditService } from './auth-audit.service';
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
  controllers: [AuthController],
  providers: [
    AuthJwtService,
    AuthUsersRepository,
    AuthSessionsRepository,
    AuthRefreshTokensRepository,
    AuthPasswordResetTokensRepository,
    AuthAuditEventsRepository,
    AuthAuditService,
    SignupService,
    LoginService,
    RefreshService,
    SelfServiceService,
    PasswordResetService,
  ],
  exports: [
    AuthJwtService,
    AuthUsersRepository,
    AuthPasswordResetTokensRepository,
    AuthAuditEventsRepository,
    AuthAuditService,
  ],
})
export class AuthModule {}
