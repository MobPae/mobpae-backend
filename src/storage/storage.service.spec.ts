import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { StorageService } from './storage.service';

// ── Mock the entire AWS SDK ──────────────────────────────────────────────────
const mockSend = jest.fn();

jest.mock('@aws-sdk/client-s3', () => ({
  S3Client: jest.fn().mockImplementation(() => ({ send: mockSend })),
  PutObjectCommand: jest.fn().mockImplementation((args) => ({ input: args, type: 'Put' })),
  DeleteObjectCommand: jest.fn().mockImplementation((args) => ({ input: args, type: 'Delete' })),
  HeadObjectCommand: jest.fn().mockImplementation((args) => ({ input: args, type: 'Head' })),
  GetObjectCommand: jest.fn().mockImplementation((args) => ({ input: args, type: 'Get' })),
}));

jest.mock('@aws-sdk/s3-request-presigner', () => ({
  getSignedUrl: jest.fn().mockResolvedValue('https://signed.r2.dev/test-key?X-Amz-Signature=abc'),
}));

// ── Helpers ──────────────────────────────────────────────────────────────────
function buildService() {
  const configMap: Record<string, string> = {
    R2_ACCOUNT_ID: 'test-account-id',
    R2_ACCESS_KEY_ID: 'test-access-key',
    R2_SECRET_ACCESS_KEY: 'test-secret',
    R2_BUCKET_NAME: 'test-bucket',
  };

  const configService = {
    getOrThrow: (key: string) => {
      if (!(key in configMap)) throw new Error(`Missing config: ${key}`);
      return configMap[key];
    },
  } as unknown as ConfigService;

  const service = new StorageService(configService);
  service.onModuleInit(); // initialise the S3Client
  return service;
}

// ── Tests ────────────────────────────────────────────────────────────────────
describe('StorageService', () => {
  beforeEach(() => {
    mockSend.mockReset();
  });

  // ── uploadFile ──────────────────────────────────────────────────────────
  describe('uploadFile', () => {
    it('sends PutObjectCommand with correct params and returns the key', async () => {
      mockSend.mockResolvedValueOnce({});
      const service = buildService();
      const buffer = Buffer.from('hello');
      const key = 'employees/user-1/kyc/aadhar/file.pdf';

      const result = await service.uploadFile(key, buffer, 'application/pdf');

      expect(result).toBe(key);
      expect(mockSend).toHaveBeenCalledTimes(1);
      const cmd = mockSend.mock.calls[0][0];
      expect(cmd.input).toMatchObject({
        Bucket: 'test-bucket',
        Key: key,
        Body: buffer,
        ContentType: 'application/pdf',
      });
    });

    it('propagates S3 errors', async () => {
      mockSend.mockRejectedValueOnce(new Error('Network error'));
      const service = buildService();
      await expect(
        service.uploadFile('some/key.pdf', Buffer.from('x'), 'application/pdf'),
      ).rejects.toThrow('Network error');
    });
  });

  // ── deleteFile ──────────────────────────────────────────────────────────
  describe('deleteFile', () => {
    it('sends DeleteObjectCommand with correct bucket and key', async () => {
      mockSend.mockResolvedValueOnce({});
      const service = buildService();
      await service.deleteFile('employees/user-1/profile/photo.jpg');

      expect(mockSend).toHaveBeenCalledTimes(1);
      const cmd = mockSend.mock.calls[0][0];
      expect(cmd.input).toMatchObject({
        Bucket: 'test-bucket',
        Key: 'employees/user-1/profile/photo.jpg',
      });
    });

    it('propagates S3 errors', async () => {
      mockSend.mockRejectedValueOnce(new Error('Access denied'));
      const service = buildService();
      await expect(service.deleteFile('some/key.jpg')).rejects.toThrow('Access denied');
    });
  });

  // ── getSignedUrl ────────────────────────────────────────────────────────
  describe('getSignedUrl', () => {
    it('returns a signed URL string', async () => {
      const service = buildService();
      const url = await service.getSignedUrl('employees/user-1/kyc/pan/pan.pdf');

      expect(typeof url).toBe('string');
      expect(url).toContain('https://');
    });

    it('uses default expiry of 900 seconds', async () => {
      const { getSignedUrl: mockGetSignedUrl } = require('@aws-sdk/s3-request-presigner');
      mockGetSignedUrl.mockResolvedValueOnce('https://signed.url');
      const service = buildService();

      await service.getSignedUrl('some/key.pdf');

      expect(mockGetSignedUrl).toHaveBeenCalledWith(
        expect.anything(),
        expect.anything(),
        { expiresIn: 900 },
      );
    });

    it('accepts a custom expiry', async () => {
      const { getSignedUrl: mockGetSignedUrl } = require('@aws-sdk/s3-request-presigner');
      mockGetSignedUrl.mockResolvedValueOnce('https://signed.url');
      const service = buildService();

      await service.getSignedUrl('some/key.pdf', 300);

      expect(mockGetSignedUrl).toHaveBeenCalledWith(
        expect.anything(),
        expect.anything(),
        { expiresIn: 300 },
      );
    });
  });

  // ── fileExists ──────────────────────────────────────────────────────────
  describe('fileExists', () => {
    it('returns true when HeadObject succeeds', async () => {
      mockSend.mockResolvedValueOnce({ ContentLength: 1234 });
      const service = buildService();

      const exists = await service.fileExists('employees/user-1/profile/photo.jpg');
      expect(exists).toBe(true);
    });

    it('returns false when HeadObject returns 404 (NotFound)', async () => {
      const notFound = Object.assign(new Error('Not Found'), {
        name: 'NotFound',
        $metadata: { httpStatusCode: 404 },
      });
      mockSend.mockRejectedValueOnce(notFound);
      const service = buildService();

      const exists = await service.fileExists('employees/user-1/profile/missing.jpg');
      expect(exists).toBe(false);
    });

    it('returns false when HeadObject returns NoSuchKey', async () => {
      const noSuchKey = Object.assign(new Error('NoSuchKey'), { name: 'NoSuchKey' });
      mockSend.mockRejectedValueOnce(noSuchKey);
      const service = buildService();

      const exists = await service.fileExists('some/missing/key.jpg');
      expect(exists).toBe(false);
    });

    it('re-throws unexpected S3 errors', async () => {
      const unexpected = Object.assign(new Error('InternalError'), { name: 'InternalError' });
      mockSend.mockRejectedValueOnce(unexpected);
      const service = buildService();

      await expect(service.fileExists('some/key.jpg')).rejects.toThrow('InternalError');
    });
  });
});
