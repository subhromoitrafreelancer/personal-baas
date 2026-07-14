import { Module } from '@nestjs/common';
import { AuthJwtService } from './auth-jwt.service';

@Module({
  providers: [AuthJwtService],
  exports: [AuthJwtService],
})
export class AuthModule {}
