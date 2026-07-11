import {
  BadRequestException,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { StorageService } from '../storage/storage.service';
import { UploadType, UPLOAD_TYPE_FOLDER } from './upload-type.enum';
import * as path from 'path';

const ALLOWED_MIME_TYPES = new Set([
  'application/pdf',
  'image/jpeg',
  'image/png',
  'image/webp',
]);

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

    const safeUserId = userId.replace(/[^a-zA-Z0-9-]/g, '');
    const subfolder = UPLOAD_TYPE_FOLDER[type];
    const ext = path.extname(file.originalname ?? '') || this.mimeToExt(file.mimetype);
    const key = `employees/${safeUserId}/${subfolder}/document${ext}`;

    await this.storage.uploadFile(key, file.buffer, file.mimetype);

    return { key, mimeType: file.mimetype, size: file.size };
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

    // Extract the userId segment from the key path
    // Key format: employees/{userId}/... or membership/{userId}/...
    const match = key.match(/^(?:employees|membership)\/([^/]+)\//);
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
}
