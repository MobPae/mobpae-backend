import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { UpdateSettingsDto } from './dto/update-settings.dto';

@Injectable()
export class SettingsService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll() {
    const settings = await this.prisma.setting.findMany();

    const result = {};

    settings.forEach((setting) => {
      result[setting.key] = setting.value;
    });

    return result;
  }

  async update(dto: UpdateSettingsDto) {
    const entries = Object.entries(dto);

    for (const [key, value] of entries) {
      await this.prisma.setting.upsert({
        where: {
          key,
        },
        update: {
          value: String(value),
        },
        create: {
          key,
          value: String(value),
        },
      });
    }

    return this.findAll();
  }
}
