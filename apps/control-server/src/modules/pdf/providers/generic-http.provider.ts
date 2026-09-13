import { PdfProvider, PdfProviderConfigRow, PdfRenderOptions } from '../pdf.types';

export interface GenericHttpConfig {
  apiUrl: string;
  authHeader: string | null;
  htmlField: string;
  responseMode: PdfProviderConfigRow['response_mode'];
  secret: string | null;
}

// The one real, vendor-agnostic adapter (scope.md §34 point 3) — entirely config-driven from a
// project's own pdf.provider_configs row. Covers the three common response shapes hosted
// HTML→PDF APIs use: raw bytes in the response body, a JSON body pointing at a downloadable URL
// ({ url }), or a JSON body carrying base64-encoded bytes ({ data }). Those two field names are
// a documented convention, not user-configurable — a vendor using different field names needs a
// small adapter change, not new config surface.
export class GenericHttpPdfProvider implements PdfProvider {
  constructor(private readonly config: GenericHttpConfig) {}

  async render(html: string, options?: PdfRenderOptions): Promise<Buffer> {
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (this.config.authHeader && this.config.secret) {
      headers[this.config.authHeader] = this.config.secret;
    }

    const res = await fetch(this.config.apiUrl, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        [this.config.htmlField]: html,
        ...(options?.format ? { format: options.format } : {}),
        ...(options?.margin ? { margin: options.margin } : {}),
      }),
      signal: options?.signal,
    });

    if (!res.ok) {
      throw new Error(`PDF vendor request failed (${res.status})`);
    }

    if (this.config.responseMode === 'binary') {
      return Buffer.from(await res.arrayBuffer());
    }

    const payload = (await res.json()) as { url?: string; data?: string };
    if (this.config.responseMode === 'json_url') {
      if (!payload.url) {
        throw new Error('PDF vendor response missing "url" field');
      }
      const fileRes = await fetch(payload.url, { signal: options?.signal });
      if (!fileRes.ok) {
        throw new Error(`Failed to download rendered PDF (${fileRes.status})`);
      }
      return Buffer.from(await fileRes.arrayBuffer());
    }

    // json_base64
    if (!payload.data) {
      throw new Error('PDF vendor response missing "data" field');
    }
    return Buffer.from(payload.data, 'base64');
  }
}
