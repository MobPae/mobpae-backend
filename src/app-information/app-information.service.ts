import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import {
  AppInfoType,
  CreateAppInformationDto,
} from './dto/create-app-information.dto';
import { UpdateAppInformationDto } from './dto/update-app-information.dto';

/**
 * NOTE: `(this.prisma as any).appInformation` is used because the Prisma client
 * must be regenerated locally via `npx prisma generate` after the migration.
 * Once regenerated, replace with `this.prisma.appInformation`.
 */
@Injectable()
export class AppInformationService {
  constructor(private readonly prisma: PrismaService) {}

  private get db() {
    return (this.prisma as any).appInformation;
  }

  /**
   * Return all active app information entries.
   * Public endpoint — no auth required.
   */
  async findAllActive() {
    return this.db.findMany({
      where: { isActive: true },
      orderBy: { type: 'asc' },
      select: {
        id: true,
        type: true,
        title: true,
        content: true,
        version: true,
        updatedAt: true,
      },
    });
  }

  /**
   * Return a single active entry by type.
   * Public endpoint — no auth required.
   */
  async findByType(type: AppInfoType) {
    const entry = await this.db.findFirst({
      where: { type, isActive: true },
      select: {
        id: true,
        type: true,
        title: true,
        content: true,
        version: true,
        updatedAt: true,
      },
    });

    if (!entry) {
      throw new NotFoundException(
        `App information for type '${type}' not found`,
      );
    }

    return entry;
  }

  /**
   * Admin — list all entries including inactive.
   */
  async findAll() {
    return this.db.findMany({ orderBy: { type: 'asc' } });
  }

  /**
   * Admin — create or update (upsert by type).
   */
  async upsert(dto: CreateAppInformationDto) {
    return this.db.upsert({
      where: { type: dto.type },
      update: {
        title: dto.title,
        content: dto.content,
        version: dto.version,
        isActive: dto.isActive ?? true,
      },
      create: {
        type: dto.type,
        title: dto.title,
        content: dto.content,
        version: dto.version,
        isActive: dto.isActive ?? true,
      },
    });
  }

  /**
   * Admin — update an existing entry by id.
   */
  async update(id: string, dto: UpdateAppInformationDto) {
    const existing = await this.db.findUnique({ where: { id } });

    if (!existing) {
      throw new NotFoundException('App information not found');
    }

    return this.db.update({
      where: { id },
      data: {
        title: dto.title,
        content: dto.content,
        version: dto.version,
        isActive: dto.isActive,
      },
    });
  }
}
