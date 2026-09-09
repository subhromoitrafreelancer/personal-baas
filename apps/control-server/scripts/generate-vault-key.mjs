// One-off helper: generates the master key encrypting every stored secret in the Secrets Vault
// (Phase 16, scope.md §30) and prints the value to paste into .env as VAULT_MASTER_KEY_BASE64.
// Not run automatically — key generation, like the JWT keypair's, is a deliberate manual action.
//
// If this key is ever lost, every secret already stored in vault.secrets becomes permanently
// undecryptable — there is no recovery path (scope.md §30 point 3). Back it up the same way you
// would AUTH_JWT_PRIVATE_KEY_BASE64.
import sodium from 'libsodium-wrappers';

await sodium.ready;

const key = sodium.crypto_secretbox_keygen();

console.log('VAULT_MASTER_KEY_BASE64=' + Buffer.from(key).toString('base64'));
