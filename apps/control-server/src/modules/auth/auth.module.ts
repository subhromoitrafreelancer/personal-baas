import { Module } from '@nestjs/common';
import { AuthJwtService } from './auth-jwt.service';
import { AuthRefreshTokensRepository } from './auth-refresh-tokens.repository';
import { AuthSessionsRepository } from './auth-sessions.repository';
import { AuthController } from './auth.controller';
import { AuthUsersRepository } from './auth-users.repository';
import { LoginService } from './login.service';
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
    SignupService,
    LoginService,
    RefreshService,
    SelfServiceService,
  ],
  exports: [AuthJwtService],
})
export class AuthModule {}
