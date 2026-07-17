import {
  BadRequestException,
  Controller,
  ForbiddenException,
  Get,
  Post,
  Query,
  Req,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import {
  ApiBearerAuth,
  ApiBody,
  ApiConsumes,
  ApiOperation,
  ApiQuery,
  ApiTags,
} from '@nestjs/swagger';

import { Roles } from '../auth/decorators/roles.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { FilesService } from './files.service';
import { UploadType } from './upload-type.enum';

@ApiTags('Files')
@ApiBearerAuth()
@Controller('files')
@UseGuards(JwtAuthGuard, RolesGuard)
export class FilesController {
  constructor(private readonly filesService: FilesService) {}

  // ── POST /files/upload ──────────────────────────────────────────────────
  @Post('upload')
  @Roles('ADMIN', 'EMPLOYER', 'EMPLOYEE')
  @ApiOperation({
    summary: 'Upload a file to private R2 storage',
    description:
      'Returns the object key. Store this key in the database. ' +
      'Use GET /files/signed-url to retrieve the file later.',
  })
  @ApiConsumes('multipart/form-data')
  @ApiQuery({
    name: 'type',
    enum: UploadType,
    required: true,
    description:
      'Document type — determines storage folder. ' +
      'KYC: kyc_aadhar | kyc_pan | kyc_salary_slip | kyc_other. ' +
      'Employee: profile_photo. ' +
      'Re-uploading the same type overwrites the existing file in R2.',
  })
  @ApiBody({
    schema: {
      type: 'object',
      properties: { file: { type: 'string', format: 'binary' } },
    },
  })
  @UseInterceptors(
    FileInterceptor('file', { limits: { fileSize: 5 * 1024 * 1024 } }),
  )
  async upload(
    @UploadedFile() file: any,
    @Query('type') type: UploadType,
    @Req() req: any,
  ) {
    if (!file) throw new BadRequestException('File is required');

    if (!Object.values(UploadType).includes(type)) {
      throw new BadRequestException(
        `Invalid upload type. Valid values: ${Object.values(UploadType).join(', ')}`,
      );
    }

    const { key, mimeType, size } = await this.filesService.saveUploadedFile(
      file,
      req.user.userId,
      type,
    );

    // Return only the key — never a public URL
    return { key, mimeType, size };
  }

  // ── GET /files/signed-url ───────────────────────────────────────────────
  @Get('signed-url')
  @Roles('ADMIN', 'EMPLOYER', 'EMPLOYEE')
  @ApiOperation({
    summary: 'Get a signed URL for a private file',
    description:
      'Returns a temporary pre-signed URL (15 minutes) for the given object key. ' +
      'Only accessible by the file owner, their employer, or an admin.',
  })
  @ApiQuery({
    name: 'key',
    required: true,
    description: 'R2 object key returned from /files/upload',
  })
  @ApiQuery({
    name: 'expiresIn',
    required: false,
    description: 'URL lifetime in seconds (default 900)',
  })
  async signedUrl(
    @Query('key') key: string,
    @Query('expiresIn') expiresInStr: string | undefined,
    @Req() req: any,
  ) {
    if (!key || key.trim() === '') {
      throw new BadRequestException('key is required');
    }

    // Guard: prevent path traversal
    if (key.includes('..') || key.startsWith('/')) {
      throw new BadRequestException('Invalid key');
    }

    // Authorization check
    const allowed = await this.filesService.canAccess(key, req.user);
    if (!allowed) {
      throw new ForbiddenException('You do not have access to this file');
    }

    // Keep signed URLs short-lived. Very small/very large caller values are normalized.
    const requested = expiresInStr ? parseInt(expiresInStr, 10) : 900;
    const normalized = isNaN(requested) ? 900 : requested;
    const expiresIn = Math.min(Math.max(normalized, 60), 3600);

    const url = await this.filesService.getSignedUrl(key, expiresIn);
    return { url, expiresIn };
  }
}
