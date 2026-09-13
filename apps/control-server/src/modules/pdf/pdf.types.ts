// Reserved vault-secret name holding a project's PDF vendor auth-header value — scope.md §34
// point 4. Reuses the Secrets Vault (§30) exactly the way Email reuses it for
// EMAIL_PROVIDER_SECRET, rather than a second encryption path.
export const PDF_PROVIDER_SECRET_NAME = 'PDF_PROVIDER_SECRET';

export type PdfResponseMode = 'binary' | 'json_url' | 'json_base64';

export interface PdfProviderConfigRow {
  id: string;
  project_id: string;
  api_url: string;
  auth_header: string | null;
  html_field: string;
  response_mode: PdfResponseMode;
  enabled: boolean;
  created_at: Date;
  updated_at: Date;
}

export interface PdfRenderRequestRow {
  id: string;
  project_id: string;
  status: 'success' | 'failed';
  duration_ms: number | null;
  output_bytes: number | null;
  error: string | null;
  created_at: Date;
}

export interface PdfRenderOptions {
  format?: string;
  margin?: string;
  // Set by PdfService.render() from PDF_TIMEOUT_MS, not caller-supplied — abort()s the
  // provider's own outbound fetch call(s) if the vendor takes too long.
  signal?: AbortSignal;
}

// Implemented by GenericHttpPdfProvider and MockPdfProvider (scope.md §34 point 1) — the same
// one-interface shape as EmailProvider (§32) and AiProvider (§35).
export interface PdfProvider {
  render(html: string, options?: PdfRenderOptions): Promise<Buffer>;
}
