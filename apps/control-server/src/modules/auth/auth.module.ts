import { Module } from '@nestjs/common';
import { AuthJwtService } from './auth-jwt.service';
import { AuthController } from './auth.controller';
import { AuthUsersRepository } from './auth-users.repository';
import { SignupService } from './signup.service';

@Module({
  controllers: [AuthController],
  providers: [AuthJwtService, AuthUsersRepository, SignupService],
  exports: [AuthJwtService],
})
export class AuthModule {}
