// One-off helper: generates the master key encrypting every stored Secrets Vault value and
// prints it to paste into .env as VAULT_MASTER_KEY_BASE64. Not run automatically — bootstrapping
// or rotating this key is a deliberate, manual action. Uses only node:crypto (no dependency on
// libsodium, which control-server itself uses internally) — a random 32-byte key is the same
// regardless of which CSPRNG generated it.
//
// If this is ever lost, every secret already stored in the vault becomes permanently
// undecryptable — there is no recovery path. Generate it once per deployment and back it up
// with the same care as AUTH_JWT_PRIVATE_KEY_BASE64.
import { randomBytes } from 'node:crypto';

console.log('VAULT_MASTER_KEY_BASE64=' + randomBytes(32).toString('base64'));
