// One-off helper: generates an Ed25519 keypair for signing application-user access tokens and
// prints the values to paste into .env as AUTH_JWT_PRIVATE_KEY_BASE64 / AUTH_JWT_PUBLIC_KEY_BASE64
// / AUTH_JWT_PUBLIC_KEY_JWK. Not run automatically — rotating or bootstrapping keys is a
// deliberate, manual action.
//
// AUTH_JWT_PUBLIC_KEY_JWK feeds PostgREST's PGRST_JWT_SECRET: PostgREST's asymmetric
// jwt-secret takes a literal JWK object, not a PEM string, and Ed25519 keys use the JWK "OKP"
// key type rather than the RSA/EC shapes most jwt-secret examples show.
import { generateKeyPairSync } from 'node:crypto';

const { privateKey, publicKey } = generateKeyPairSync('ed25519');

const privatePem = privateKey.export({ type: 'pkcs8', format: 'pem' }).toString();
const publicPem = publicKey.export({ type: 'spki', format: 'pem' }).toString();
const publicJwk = publicKey.export({ format: 'jwk' });

console.log('AUTH_JWT_PRIVATE_KEY_BASE64=' + Buffer.from(privatePem).toString('base64'));
console.log('AUTH_JWT_PUBLIC_KEY_BASE64=' + Buffer.from(publicPem).toString('base64'));
console.log('AUTH_JWT_PUBLIC_KEY_JWK=' + JSON.stringify(publicJwk));
