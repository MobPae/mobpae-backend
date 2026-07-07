import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { UpsertEmployerProductConfigDto } from './dto/upsert-employer-product-config.dto';

@Injectable()
export class EmployerProductConfigsService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Lists all product configs for an employer.
   * Used by admin and employer portal.
   */
  async findByEmployer(employerId: string) {
    return this.prisma.employerProductConfig.findMany({
      where: { employerId },
      include: { product: true },
    });
  }

  /**
   * Upserts the product config for an employer + productType pair.
   * Called by Admin when onboarding or adjusting an employer's product access.
   */
  async upsert(
    employerId: string,
    productType: string,
    dto: UpsertEmployerProductConfigDto,
  ) {
    const employer = await this.prisma.employer.findUnique({
      where: { id: employerId },
    });

    if (!employer) {
      throw new NotFoundException('Employer not found');
    }

    const product = await this.prisma.loanProduct.findUnique({
      where: { productType: productType as any },
    });

    if (!product) {
      throw new NotFoundException(`Product '${productType}' not found`);
    }

    // Validate that the override doesn't exceed the global config default
    if (dto.maximumAdvancePercentageOverride !== undefined && dto.maximumAdvancePercentageOverride !== null) {
      const activeConfig = await this.prisma.loanProductConfig.findFirst({
        where: { productId: product.id, isActive: true },
      });

      if (activeConfig) {
        const rules = activeConfig.eligibilityRules as { maximumAdvancePercentage?: number };
        const globalMax = rules.maximumAdvancePercentage ?? 100;

        if (dto.maximumAdvancePercentageOverride > globalMax) {
          throw new BadRequestException(
            `Employer override (${dto.maximumAdvancePercentageOverride}%) cannot exceed ` +
              `the product config maximum (${globalMax}%)`,
          );
        }
      }
    }

    return this.prisma.employerProductConfig.upsert({
      where: { employerId_productId: { employerId, productId: product.id } },
      update: {
        maximumAdvancePercentageOverride:
          dto.maximumAdvancePercentageOverride !== undefined
            ? dto.maximumAdvancePercentageOverride
            : undefined,
        requiresEmployerApproval: dto.requiresEmployerApproval,
        isEnabled: dto.isEnabled,
      },
      create: {
        employerId,
        productId: product.id,
        maximumAdvancePercentageOverride:
          dto.maximumAdvancePercentageOverride ?? null,
        requiresEmployerApproval: dto.requiresEmployerApproval ?? true,
        isEnabled: dto.isEnabled ?? true,
      },
      include: { product: true },
    });
  }

  /**
   * Returns the effective advance percentage for a given employer + product.
   * Priority: employer override → product config global → throw.
   * Used by EligibilityService.
   */
  async getEffectiveAdvancePercentage(
    employerId: string,
    productId: string,
  ): Promise<number> {
    const empConfig = await this.prisma.employerProductConfig.findUnique({
      where: { employerId_productId: { employerId, productId } },
    });

    if (empConfig?.maximumAdvancePercentageOverride != null) {
      return Number(empConfig.maximumAdvancePercentageOverride);
    }

    // Fall back to global product config
    const productConfig = await this.prisma.loanProductConfig.findFirst({
      where: { productId, isActive: true },
    });

    if (!productConfig) {
      throw new BadRequestException('No active product configuration found');
    }

    const rules = productConfig.eligibilityRules as {
      maximumAdvancePercentage?: number;
    };

    return rules.maximumAdvancePercentage ?? 50;
  }
}
