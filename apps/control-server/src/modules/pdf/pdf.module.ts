import { Module } from '@nestjs/common';
import { AdminAuthModule } from '../admin-auth/admin-auth.module';
import { AuthAuditModule } from '../auth/auth-audit.module';
import { ProjectsModule } from '../projects/projects.module';
import { StorageModule } from '../storage/storage.module';
import { VaultModule } from '../vault/vault.module';
import { PdfAdminController } from './pdf-admin.controller';
import { PdfInternalController } from './pdf-internal.controller';
import { PdfPageController } from './pdf-page.controller';
import { PdfProviderConfigsRepository } from './pdf-provider-configs.repository';
import { PdfRenderRequestsRepository } from './pdf-render-requests.repository';
import { PdfService } from './pdf.service';

// StorageModule (for renderToStorage) and VaultModule (for the per-project provider secret) —
// no cycle risk: StorageModule imports AuthModule, which has no path back to this leaf module.
@Module({
  imports: [AdminAuthModule, ProjectsModule, VaultModule, StorageModule, AuthAuditModule],
  controllers: [PdfAdminController, PdfInternalController, PdfPageController],
  providers: [PdfProviderConfigsRepository, PdfRenderRequestsRepository, PdfService],
})
export class PdfModule {}
