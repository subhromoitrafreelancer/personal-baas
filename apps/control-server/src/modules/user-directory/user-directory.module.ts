import { Module } from '@nestjs/common';
import { ApiKeysRepository } from '../api-keys/api-keys.repository';
import { AuthModule } from '../auth/auth.module';
import { UserDirectoryController } from './user-directory.controller';

// Phase 22 (scope.md §36). AuthModule exports AuthUsersRepository and ServiceRoleBearerGuard, but
// when a guard is attached via @UseGuards(ClassRef) in a *different* module, Nest resolves that
// guard's own constructor params from the consuming module's DI graph, not the module it was
// originally provided in — so ServiceRoleBearerGuard's ApiKeysRepository dependency (a provider
// AuthModule never exports, see auth.module.ts's own comment on why) needs a local instance here
// too, the same "second instance is harmless" pattern ApiKeyBearerGuard/StorageAccessGuard already
// use for the identical reason.
@Module({
  imports: [AuthModule],
  controllers: [UserDirectoryController],
  providers: [ApiKeysRepository],
})
export class UserDirectoryModule {}
