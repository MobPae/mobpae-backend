import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateLoanProductConfigDto } from './dto/create-loan-product-config.dto';

@Injectable()
export class LoanProductsService {
  constructor(private readonly prisma: PrismaService) {}

  // ── Products ────────────────────────────────────────────────────────────────

  /** Returns all loan products (active and inactive). */
  findAllProducts() {
    return this.prisma.loanProduct.findMany({
      orderBy: { createdAt: 'asc' },
    });
  }

  /** Returns the active LoanProductConfig for a product type (e.g. 'SA'). */
  async findActiveConfig(productType: string) {
    const product = await this.prisma.loanProduct.findUnique({
      where: { productType: productType as any },
    });

    if (!product) {
      throw new NotFoundException(`Product '${productType}' not found`);
    }

    const config = await this.prisma.loanProductConfig.findFirst({
      where: { productId: product.id, isActive: true },
    });

    if (!config) {
      throw new NotFoundException(
        `No active config found for product '${productType}'`,
      );
    }

    return config;
  }

  /** Returns the full version history for a product (newest first). */
  async findConfigHistory(productType: string) {
    const product = await this.prisma.loanProduct.findUnique({
      where: { productType: productType as any },
    });

    if (!product) {
      throw new NotFoundException(`Product '${productType}' not found`);
    }

    return this.prisma.loanProductConfig.findMany({
      where: { productId: product.id },
      orderBy: { versionNumber: 'desc' },
    });
  }

  // ── Config versioning ───────────────────────────────────────────────────────

  /**
   * Creates a new LoanProductConfig version for the given product type.
   *
   * Atomically:
   * 1. Deactivates the current active version (sets effectiveTo + isActive=false).
   * 2. Inserts the new version with versionNumber = prev + 1, isActive = true.
   * 3. Wires previousVersionId to the deactivated version.
   *
   * This ensures only one active config per product at all times.
   */
  async createConfigVersion(
    productType: string,
    dto: CreateLoanProductConfigDto,
    actorUserId: string,
  ) {
    const product = await this.prisma.loanProduct.findUnique({
      where: { productType: productType as any },
    });

    if (!product) {
      throw new NotFoundException(`Product '${productType}' not found`);
    }

    // Highest version number currently in DB
    const latestConfig = await this.prisma.loanProductConfig.findFirst({
      where: { productId: product.id },
      orderBy: { versionNumber: 'desc' },
    });

    const nextVersion = (latestConfig?.versionNumber ?? 0) + 1;

    return this.prisma.$transaction(async (tx) => {
      let previousVersionId: string | null = null;

      // Deactivate current active version if exists
      if (latestConfig && latestConfig.isActive) {
        await tx.loanProductConfig.update({
          where: { id: latestConfig.id },
          data: {
            isActive: false,
            effectiveTo: new Date(dto.effectiveFrom),
          },
        });
        previousVersionId = latestConfig.id;
      } else if (latestConfig) {
        // Latest exists but isn't active — version chain from it anyway
        previousVersionId = latestConfig.id;
      }

      const newConfig = await tx.loanProductConfig.create({
        data: {
          productId: product.id,
          versionNumber: nextVersion,
          versionName: dto.versionName,
          isActive: true,
          effectiveFrom: new Date(dto.effectiveFrom),
          previousVersionId,
          eligibilityRules: dto.eligibilityRules as any,
          pricingRules: dto.pricingRules as any,
          operationalRules: dto.operationalRules as any,
          createdBy: actorUserId,
        },
      });

      return newConfig;
    });
  }

  /**
   * Returns the active config for a product by its internal productId.
   * Used internally by EligibilityService and LoanApplicationsService.
   */
  async findActiveConfigByProductId(productId: string) {
    const config = await this.prisma.loanProductConfig.findFirst({
      where: { productId, isActive: true },
    });

    if (!config) {
      throw new BadRequestException(
        `No active configuration found for the requested product. Contact admin.`,
      );
    }

    return config;
  }

  /**
   * Deletes a non-active config version. Refuses to delete the currently active one.
   */
  async deleteConfigVersion(productType: string, configId: string) {
    const product = await this.prisma.loanProduct.findUnique({
      where: { productType: productType as any },
    });
    if (!product) {
      throw new NotFoundException(`Product '${productType}' not found`);
    }

    const config = await this.prisma.loanProductConfig.findFirst({
      where: { id: configId, productId: product.id },
    });
    if (!config) {
      throw new NotFoundException('Config version not found');
    }
    if (config.isActive) {
      throw new BadRequestException(
        'Cannot delete the active config version. Publish a new version first.',
      );
    }

    await this.prisma.loanProductConfig.delete({ where: { id: configId } });
  }

  /**
   * Looks up a LoanProduct by its enum type code (e.g. 'SA').
   * Used internally across service boundaries.
   */
  async findProductByType(productType: string) {
    const product = await this.prisma.loanProduct.findUnique({
      where: { productType: productType as any },
    });

    if (!product) {
      throw new NotFoundException(`Product '${productType}' not found`);
    }

    return product;
  }
}
