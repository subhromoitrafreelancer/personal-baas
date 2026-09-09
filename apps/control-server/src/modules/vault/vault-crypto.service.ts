import { Injectable, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import sodium from 'libsodium-wrappers';
import { EnvConfig } from '../../config/env.schema';

// Encrypts/decrypts Secrets Vault values (Phase 16, scope.md §30 point 3). libsodium's
// crypto_secretbox_easy/crypto_secretbox_open_easy (XSalsa20-Poly1305) — the same class of
// primitive already trusted elsewhere on this platform (Ed25519 JWT signing, Argon2id password
// hashing) rather than a hand-rolled AES-GCM wrapper over Node's raw crypto module.
//
// libsodium-wrappers is a WASM build: its crypto_* functions are attached to the module
// dynamically only after `sodium.ready` resolves, so every call here happens after
// onModuleInit's await completes — never call encrypt()/decrypt() before Nest has finished
// bootstrapping this provider.
@Injectable()
export class VaultCryptoService implements OnModuleInit {
  private key!: Uint8Array;

  constructor(private readonly config: ConfigService<EnvConfig, true>) {}

  async onModuleInit(): Promise<void> {
    await sodium.ready;
    const key = Buffer.from(this.config.get('VAULT_MASTER_KEY_BASE64', { infer: true }), 'base64');
    if (key.length !== sodium.crypto_secretbox_KEYBYTES) {
      throw new Error(
        `VAULT_MASTER_KEY_BASE64 must decode to ${sodium.crypto_secretbox_KEYBYTES} bytes ` +
          `(got ${key.length}) — generate one with \`npm run generate:vault-key\``,
      );
    }
    this.key = key;
  }

  encrypt(plaintext: string): { nonce: Buffer; ciphertext: Buffer } {
    // Freshly generated per call, never reused across encryptions — nonces are public data,
    // safe to store alongside the ciphertext they were used with.
    const nonce = sodium.randombytes_buf(sodium.crypto_secretbox_NONCEBYTES);
    const ciphertext = sodium.crypto_secretbox_easy(plaintext, nonce, this.key);
    return { nonce: Buffer.from(nonce), ciphertext: Buffer.from(ciphertext) };
  }

  decrypt(nonce: Buffer, ciphertext: Buffer): string {
    // Throws on MAC-verification failure (a tampered/corrupt row, or a VAULT_MASTER_KEY_BASE64
    // mismatch after a botched rotation) rather than silently returning garbage.
    const plaintext = sodium.crypto_secretbox_open_easy(ciphertext, nonce, this.key);
    return Buffer.from(plaintext).toString('utf8');
  }
}
