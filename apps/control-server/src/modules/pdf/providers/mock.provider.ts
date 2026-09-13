import { PdfProvider } from '../pdf.types';

// A minimal, real, openable single-page PDF — used only for this phase's own acceptance testing
// (and any future unit tests), scope.md §34 point 6. Never reachable through any per-project
// admin configuration; ignores the html/options entirely.
const MINIMAL_PDF = `%PDF-1.1
1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj
2 0 obj<</Type/Pages/Kids[3 0 R]/Count 1>>endobj
3 0 obj<</Type/Page/Parent 2 0 R/MediaBox[0 0 200 200]>>endobj
trailer<</Size 4/Root 1 0 R>>
%%EOF
`;

export class MockPdfProvider implements PdfProvider {
  async render(): Promise<Buffer> {
    return Buffer.from(MINIMAL_PDF, 'utf8');
  }
}
