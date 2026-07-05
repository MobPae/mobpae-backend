import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  S3Client,
  PutObjectCommand,
  DeleteObjectCommand,
  HeadObjectCommand,
  GetObjectCommand,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

/** Default signed URL lifetime — 15 minutes */
export const DEFAULT_SIGNED_URL_EXPIRY_SECONDS = 900;

@Injectable()
export class StorageService implements OnModuleInit {
  private readonly logger = new Logger(StorageService.name);
  private s3: S3Client;
  private bucket: string;

  constructor(private readonly config: ConfigService) {}

  onModuleInit() {
    const accountId = this.config.getOrThrow<string>('R2_ACCOUNT_ID');
    const accessKeyId = this.config.getOrThrow<string>('R2_ACCESS_KEY_ID');
    const secretAccessKey = this.config.getOrThrow<string>('R2_SECRET_ACCESS_KEY');
    this.bucket = this.config.getOrThrow<string>('R2_BUCKET_NAME');

    this.s3 = new S3Client({
      region: 'auto',
      endpoint: `https://${accountId}.r2.cloudflarestorage.com`,
      credentials: { accessKeyId, secretAccessKey },
    });

    this.logger.log(`StorageService ready — bucket: ${this.bucket}`);
  }

  /**
   * Upload a file buffer to R2.
   * The caller is responsible for computing the object key.
   *
   * @returns The object key that was written (same as `key` param).
   */
  async uploadFile(
    key: string,
    buffer: Buffer,
    mimeType: string,
  ): Promise<string> {
    await this.s3.send(
      new PutObjectCommand({
        Bucket: this.bucket,
        Key: key,
        Body: buffer,
        ContentType: mimeType,
      }),
    );
    this.logger.debug(`Uploaded: ${key}`);
    return key;
  }

  /**
   * Permanently delete an object from R2.
   * Safe to call on a key that does not exist — R2 returns 204 regardless.
   */
  async deleteFile(key: string): Promise<void> {
    await this.s3.send(
      new DeleteObjectCommand({ Bucket: this.bucket, Key: key }),
    );
    this.logger.debug(`Deleted: ${key}`);
  }

  /**
   * Generate a pre-signed GET URL for a private object.
   * URL expires after `expiresIn` seconds (default 15 minutes).
   * Never expose these URLs publicly or cache them beyond their lifetime.
   */
  async getSignedUrl(
    key: string,
    expiresIn = DEFAULT_SIGNED_URL_EXPIRY_SECONDS,
  ): Promise<string> {
    const command = new GetObjectCommand({
      Bucket: this.bucket,
      Key: key,
    });
    return getSignedUrl(this.s3, command, { expiresIn });
  }

  /**
   * Check whether an object key exists in the bucket.
   * Uses HeadObject — does not download the file.
   */
  async fileExists(key: string): Promise<boolean> {
    try {
      await this.s3.send(
        new HeadObjectCommand({ Bucket: this.bucket, Key: key }),
      );
      return true;
    } catch (err: any) {
      if (
        err?.name === 'NotFound' ||
        err?.name === 'NoSuchKey' ||
        err?.$metadata?.httpStatusCode === 404
      ) {
        return false;
      }
      throw err;
    }
  }
}
