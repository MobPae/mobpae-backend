import { BadRequestException, Injectable } from '@nestjs/common';
import { randomBytes } from 'crypto';
import { promises as fs } from 'fs';
import * as path from 'path';

const ALLOWED_MIME_TYPES = new Map([
  ['application/pdf', '.pdf'],
  ['image/jpeg', '.jpg'],
  ['image/png', '.png'],
  ['image/webp', '.webp'],
]);

@Injectable()
export class FilesService {
  async saveUploadedFile(file: any, user: { userId: string }) {
    const extension = ALLOWED_MIME_TYPES.get(file.mimetype);

    if (!extension) {
      throw new BadRequestException('Only PDF and image uploads are allowed');
    }

    const userFolder = user.userId.replace(/[^a-zA-Z0-9-]/g, '');
    const fileName = `${Date.now()}-${randomBytes(8).toString('hex')}${extension}`;
    const relativePath = path.posix.join('uploads', userFolder, fileName);
    const absolutePath = path.join(process.cwd(), relativePath);

    await fs.mkdir(path.dirname(absolutePath), {
      recursive: true,
    });

    await fs.writeFile(absolutePath, file.buffer);

    return {
      filePath: relativePath,
      mimeType: file.mimetype,
      size: file.size,
    };
  }
}
