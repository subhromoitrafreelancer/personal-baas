import { Controller, Get } from '@nestjs/common';
import { OpenapiDocsService } from './openapi-docs.service';

// Deliberately unguarded (scope.md §38) — mirrors PostgREST's own public openapi.json, so an
// external integrator can fetch this without first standing up an admin session.
@Controller()
export class OpenapiDocsController {
  constructor(private readonly openapiDocs: OpenapiDocsService) {}

  @Get('openapi.json')
  get() {
    return this.openapiDocs.generate();
  }
}
