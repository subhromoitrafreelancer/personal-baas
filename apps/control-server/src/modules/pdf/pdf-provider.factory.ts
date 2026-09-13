import { GenericHttpPdfProvider } from './providers/generic-http.provider';
import { PdfProvider, PdfProviderConfigRow } from './pdf.types';

// Builds the one real PdfProvider adapter for a project's stored config + decrypted secret.
// Config is per-call, not injected as a singleton — each project has its own config (scope.md
// §34 point 2), so there is no single "the" provider instance for this module.
export function buildPdfProvider(config: PdfProviderConfigRow, secret: string | null): PdfProvider {
  return new GenericHttpPdfProvider({
    apiUrl: config.api_url,
    authHeader: config.auth_header,
    htmlField: config.html_field,
    responseMode: config.response_mode,
    secret,
  });
}
