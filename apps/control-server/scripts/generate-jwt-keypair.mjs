// One-off helper: generates an Ed25519 keypair for signing application-user access tokens
// (scope.md §8) and prints the base64-encoded PEM values to paste into .env as
// AUTH_JWT_PRIVATE_KEY_BASE64 / AUTH_JWT_PUBLIC_KEY_BASE64. Not run automatically — rotating
// or bootstrapping keys is a deliberate, manual action.
import { generateKeyPairSync } from 'node:crypto';

const { privateKey, publicKey } = generateKeyPairSync('ed25519');

const privatePem = privateKey.export({ type: 'pkcs8', format: 'pem' }).toString();
const publicPem = publicKey.export({ type: 'spki', format: 'pem' }).toString();

console.log('AUTH_JWT_PRIVATE_KEY_BASE64=' + Buffer.from(privatePem).toString('base64'));
console.log('AUTH_JWT_PUBLIC_KEY_BASE64=' + Buffer.from(publicPem).toString('base64'));
