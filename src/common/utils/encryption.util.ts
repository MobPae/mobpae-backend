import { createCipheriv, createDecipheriv, randomBytes } from 'crypto';

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 12; // recommended IV length for GCM

/**
 * Field-level encryption for sensitive columns (bank account number, IFSC).
 * Uses AES-256-GCM (authenticated encryption) with a random IV per call.
 *
 * Key comes from BANK_ENCRYPTION_KEY — a base64-encoded 32-byte value,
 * validated at startup by the Joi schema in app.module.ts. Same env-var
 * pattern as every other secret in this codebase (JWT_SECRET, RAZORPAY_*).
 */
export class EncryptionUtil {
  private static getKey(): Buffer {
    const raw = process.env.BANK_ENCRYPTION_KEY;
    if (!raw) {
      throw new Error('BANK_ENCRYPTION_KEY is not set');
    }
    const key = Buffer.from(raw, 'base64');
    if (key.length !== 32) {
      throw new Error(
        'BANK_ENCRYPTION_KEY must be a base64-encoded 32-byte (AES-256) key',
      );
    }
    return key;
  }

  /** Encrypts a plaintext string. Returns `iv:authTag:ciphertext`, all base64. */
  static encrypt(plaintext: string): string {
    const key = this.getKey();
    const iv = randomBytes(IV_LENGTH);
    const cipher = createCipheriv(ALGORITHM, key, iv);
    const ciphertext = Buffer.concat([
      cipher.update(plaintext, 'utf8'),
      cipher.final(),
    ]);
    const authTag = cipher.getAuthTag();

    return [
      iv.toString('base64'),
      authTag.toString('base64'),
      ciphertext.toString('base64'),
    ].join(':');
  }

  /** Decrypts a payload produced by `encrypt()`. Throws if the auth tag doesn't verify. */
  static decrypt(payload: string): string {
    const [ivB64, tagB64, dataB64] = payload.split(':');
    if (!ivB64 || !tagB64 || !dataB64) {
      throw new Error('Malformed encrypted field payload');
    }

    const key = this.getKey();
    const iv = Buffer.from(ivB64, 'base64');
    const authTag = Buffer.from(tagB64, 'base64');
    const ciphertext = Buffer.from(dataB64, 'base64');

    const decipher = createDecipheriv(ALGORITHM, key, iv);
    decipher.setAuthTag(authTag);
    const plaintext = Buffer.concat([
      decipher.update(ciphertext),
      decipher.final(),
    ]);

    return plaintext.toString('utf8');
  }
}
