import {
  BadRequestException,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { StorageService } from '../storage/storage.service';
import { UploadType, UPLOAD_TYPE_FOLDER } from './upload-type.enum';

const ALLOWED_MIME_TYPES = new Set([
  'application/pdf',
  'image/jpeg',
  'image/png',
  'image/webp',
]);

const MIME_SIGNATURES: Record<string, (buffer: Buffer) => boolean> = {
  'application/pdf': (buffer) => buffer.subarray(0, 5).toString() === '%PDF-',
  'image/jpeg': (buffer) =>
    buffer.length >= 3 &&
    buffer[0] === 0xff &&
    buffer[1] === 0xd8 &&
    buffer[2] === 0xff,
  'image/png': (buffer) =>
    buffer
      .subarray(0, 8)
      .equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])),
  'image/webp': (buffer) =>
    buffer.length >= 12 &&
    buffer.subarray(0, 4).toString() === 'RIFF' &&
    buffer.subarray(8, 12).toString() === 'WEBP',
};

export interface SavedFile {
  /** R2 object key — the only value stored in the database */
  key: string;
  mimeType: string;
  size: number;
}

@Injectable()
export class FilesService {
  constructor(
    private readonly storage: StorageService,
    private readonly prisma: PrismaService,
  ) {}

  /**
   * Upload a file to R2 and return the object key.
   * The key (not a URL) is what gets stored in the database.
   *
   * All uploads use a deterministic key ("document.{ext}") so re-uploading
   * the same document type naturally overwrites the existing R2 object.
   * No orphan files, no manual cleanup needed.
   *
   * Key format: employees/{userId}/{subfolder}/document.{ext}
   * Examples:
   *   employees/{userId}/kyc/pan/document.pdf
   *   employees/{userId}/selfie/document.jpg
   *   employees/{userId}/profile/document.png
   */
  async saveUploadedFile(
    file: any,
    userId: string,
    type: UploadType,
  ): Promise<SavedFile> {
    if (!ALLOWED_MIME_TYPES.has(file.mimetype)) {
      throw new BadRequestException('Only PDF and image uploads are allowed');
    }

    const detectedMimeType = this.detectMimeType(file.buffer);
    if (!detectedMimeType || detectedMimeType !== file.mimetype) {
      throw new BadRequestException('File content does not match file type');
    }

    const safeUserId = userId.replace(/[^a-zA-Z0-9-]/g, '');
    const subfolder = UPLOAD_TYPE_FOLDER[type];
    const ext = this.mimeToExt(detectedMimeType);
    const key = `employees/${safeUserId}/${subfolder}/document${ext}`;

    await this.storage.uploadFile(key, file.buffer, detectedMimeType);

    return { key, mimeType: detectedMimeType, size: file.size };
  }

  /**
   * Generate a signed URL for a given object key.
   * Authorization must be verified by the caller before invoking this.
   */
  async getSignedUrl(key: string, expiresIn?: number): Promise<string> {
    return this.storage.getSignedUrl(key, expiresIn);
  }

  /**
   * Determine whether the requesting user is allowed to access a given key.
   *
   * Rules:
   *  - ADMIN: unrestricted
   *  - EMPLOYEE: may only access keys that contain their own userId segment
   *  - EMPLOYER: may access keys for any of their employees
   */
  async canAccess(
    key: string,
    user: { userId: string; role: string },
  ): Promise<boolean> {
    if (user.role === 'ADMIN') return true;

    // Extract the userId segment from the key path.
    // Key format: employees/{userId}/...
    const match = key.match(/^employees\/([^/]+)\//);
    if (!match) return false;
    const keyUserId = match[1];

    if (user.role === 'EMPLOYEE') {
      return keyUserId === user.userId.replace(/[^a-zA-Z0-9-]/g, '');
    }

    if (user.role === 'EMPLOYER') {
      // Verify the userId in the key belongs to one of this employer's employees
      const employer = await this.prisma.employer.findUnique({
        where: { userId: user.userId },
        select: { id: true },
      });
      if (!employer) return false;

      const employee = await this.prisma.employee.findFirst({
        where: { userId: keyUserId, employerId: employer.id },
        select: { id: true },
      });
      return employee !== null;
    }

    return false;
  }

  private mimeToExt(mime: string): string {
    const map: Record<string, string> = {
      'image/jpeg': '.jpg',
      'image/png': '.png',
      'image/webp': '.webp',
      'application/pdf': '.pdf',
    };
    return map[mime] ?? '';
  }

  private detectMimeType(buffer?: Buffer): string | null {
    if (!buffer || buffer.length === 0) return null;

    for (const [mimeType, matches] of Object.entries(MIME_SIGNATURES)) {
      if (matches(buffer)) return mimeType;
    }

    return null;
  }
}
