import { Module } from '@nestjs/common';
import { OpenapiDocsController } from './openapi-docs.controller';
import { OpenapiDocsService } from './openapi-docs.service';

// Phase 24 (scope.md §38). No other module dependency — reads only the zod schemas already
// exported from auth/user-directory's own controller files.
@Module({
  controllers: [OpenapiDocsController],
  providers: [OpenapiDocsService],
})
export class OpenapiDocsModule {}
