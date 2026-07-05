import { Module } from '@nestjs/common';

import { StorageModule } from '../storage/storage.module';
import { PrismaModule } from '../prisma/prisma.module';
import { FilesController } from './files.controller';
import { FilesService } from './files.service';

@Module({
  imports: [StorageModule, PrismaModule],
  controllers: [FilesController],
  providers: [FilesService],
  exports: [FilesService, StorageModule],
})
export class FilesModule {}
