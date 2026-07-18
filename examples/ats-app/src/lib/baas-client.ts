import { createClient } from '@personal-baas/client-sdk';

const url = import.meta.env.VITE_BAAS_URL as string;
const apiKey = import.meta.env.VITE_BAAS_ANON_KEY as string;
const schemaName = (import.meta.env.VITE_BAAS_SCHEMA as string | undefined) ?? 'api_ats';

if (!url || !apiKey) {
  throw new Error(
    'Missing VITE_BAAS_URL / VITE_BAAS_ANON_KEY -- copy .env.example to .env.local and fill it in (see README.md).',
  );
}

export const baas = createClient({ url, apiKey, schemaName });
