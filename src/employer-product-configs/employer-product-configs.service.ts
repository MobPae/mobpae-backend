import {
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { UpsertEmployerProductConfigDto } from './dto/upsert-employer-product-config.dto';

@Injectable()
export class EmployerProductConfigsService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Lists all product configs for an employer by employer ID.
   * Used by admin.
   */
  async findByEmployer(employerId: string) {
    return this.prisma.employerProductConfig.findMany({
      where: { employerId },
      include: { product: true },
    });
  }

  /**
   * Lists all product configs for the currently logged-in employer (by userId).
   * Used by employer portal.
   */
  async findByUserId(userId: string) {
    const employer = await this.prisma.employer.findUnique({ where: { userId } });
    if (!employer) throw new NotFoundException('Employer not found');
    return this.prisma.employerProductConfig.findMany({
      where: { employerId: employer.id },
      include: { product: true },
    });
  }

  /**
   * Upserts the product config for an employer + productType pair.
   * Called by Admin when onboarding or adjusting an employer's product access.
   *
   * maximumAdvanceAmountOverride is an absolute ₹ amount (same for all employees of this employer).
   * The hard ceiling of salary × 50% per employee is enforced at application-submission time
   * in EligibilityService — not here.
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

    return this.prisma.employerProductConfig.upsert({
      where: { employerId_productId: { employerId, productId: product.id } },
      update: {
        maximumAdvanceAmountOverride:
          dto.maximumAdvanceAmountOverride !== undefined
            ? dto.maximumAdvanceAmountOverride
            : undefined,
        requiresEmployerApproval: dto.requiresEmployerApproval,
        isEnabled: dto.isEnabled,
      },
      create: {
        employerId,
        productId: product.id,
        maximumAdvanceAmountOverride: dto.maximumAdvanceAmountOverride ?? null,
        requiresEmployerApproval: dto.requiresEmployerApproval ?? true,
        isEnabled: dto.isEnabled ?? true,
      },
      include: { product: true },
    });
  }

  /**
   * Self-service upsert for the employer portal.
   * Employer can only update their own override — cannot change isEnabled or requiresEmployerApproval.
   */
  async upsertByUserId(
    userId: string,
    productType: string,
    dto: Pick<UpsertEmployerProductConfigDto, 'maximumAdvanceAmountOverride'>,
  ) {
    const employer = await this.prisma.employer.findUnique({ where: { userId } });
    if (!employer) throw new NotFoundException('Employer not found');
    return this.upsert(employer.id, productType, dto);
  }
}
