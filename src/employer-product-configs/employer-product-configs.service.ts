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
   * Lists all product configs for the currently logged-in employer (by employerId).
   * Used by employer portal.
   */
  async findByEmployerId(employerId: string) {
    return this.prisma.employerProductConfig.findMany({
      where: { employerId },
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
        ...(dto.maximumAdvanceAmountOverride !== undefined && {
          maximumAdvanceAmountOverride: dto.maximumAdvanceAmountOverride,
        }),
        ...(dto.maximumAdvancePercentageOverride !== undefined && {
          maximumAdvancePercentageOverride: dto.maximumAdvancePercentageOverride,
        }),
        requiresEmployerApproval: dto.requiresEmployerApproval,
        isEnabled: dto.isEnabled,
      },
      create: {
        employerId,
        productId: product.id,
        maximumAdvanceAmountOverride: dto.maximumAdvanceAmountOverride ?? null,
        requiresEmployerApproval: dto.requiresEmployerApproval ?? true,
        isEnabled: dto.isEnabled ?? true,
        // maximumAdvancePercentageOverride added in schema — available after prisma db push
        ...(dto.maximumAdvancePercentageOverride !== undefined && {
          maximumAdvancePercentageOverride: dto.maximumAdvancePercentageOverride,
        }),
      } as any,
      include: { product: true },
    });
  }

  /**
   * Self-service upsert for the employer portal.
   * Employer can only set their percentage override — cannot change isEnabled or requiresEmployerApproval.
   */
  async upsertByEmployerId(
    employerId: string,
    productType: string,
    dto: Pick<UpsertEmployerProductConfigDto, 'maximumAdvancePercentageOverride'>,
  ) {
    return this.upsert(employerId, productType, dto);
  }

  /**
   * Returns the active eligibility + pricing rules for a product type.
   * Exposed to employer portal so they can see what they are overriding.
   */
  async findActiveRulesForProductType(productType: string) {
    const product = await this.prisma.loanProduct.findUnique({
      where: { productType: productType as any },
    });
    if (!product) throw new NotFoundException(`Product '${productType}' not found`);

    const config = await this.prisma.loanProductConfig.findFirst({
      where: { productId: product.id, isActive: true },
    });
    if (!config) throw new NotFoundException(`No active config for '${productType}'`);

    const rules = config.eligibilityRules as any;
    return {
      defaultAdvancePercentage: rules.platformAdvancePercentage ?? 10,
      hardCeilingPercentage:    rules.hardCeilingPercentage    ?? 50,
      platformMaxAdvanceAmount: rules.platformMaxAdvanceAmount  ?? 5000,
    };
  }
}
