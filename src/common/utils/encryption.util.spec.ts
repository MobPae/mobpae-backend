import { EncryptionUtil } from './encryption.util';

describe('EncryptionUtil', () => {
  const validKey = Buffer.alloc(32, 3).toString('base64');

  beforeEach(() => {
    process.env.BANK_ENCRYPTION_KEY = validKey;
  });

  it('round-trips a plaintext value', () => {
    const ciphertext = EncryptionUtil.encrypt('1234567890');
    expect(ciphertext).not.toContain('1234567890');
    expect(EncryptionUtil.decrypt(ciphertext)).toBe('1234567890');
  });

  it('produces a different ciphertext each time (random IV)', () => {
    const a = EncryptionUtil.encrypt('HDFC0001234');
    const b = EncryptionUtil.encrypt('HDFC0001234');
    expect(a).not.toBe(b);
    expect(EncryptionUtil.decrypt(a)).toBe('HDFC0001234');
    expect(EncryptionUtil.decrypt(b)).toBe('HDFC0001234');
  });

  it('rejects a tampered ciphertext (auth tag mismatch)', () => {
    const ciphertext = EncryptionUtil.encrypt('secret-account-number');
    const [iv, tag, data] = ciphertext.split(':');
    const tamperedByte = Buffer.from(data, 'base64');
    tamperedByte[0] ^= 0xff;
    const tampered = [iv, tag, tamperedByte.toString('base64')].join(':');

    expect(() => EncryptionUtil.decrypt(tampered)).toThrow();
  });

  it('throws when BANK_ENCRYPTION_KEY is not set', () => {
    delete process.env.BANK_ENCRYPTION_KEY;
    expect(() => EncryptionUtil.encrypt('x')).toThrow(
      'BANK_ENCRYPTION_KEY is not set',
    );
  });

  it('throws when BANK_ENCRYPTION_KEY is not exactly 32 bytes', () => {
    process.env.BANK_ENCRYPTION_KEY = Buffer.alloc(16).toString('base64');
    expect(() => EncryptionUtil.encrypt('x')).toThrow(
      'BANK_ENCRYPTION_KEY must be a base64-encoded 32-byte',
    );
  });
});
