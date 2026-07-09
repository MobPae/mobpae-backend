import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { LoanProductsService } from './loan-products.service';
import { CreateLoanProductConfigDto } from './dto/create-loan-product-config.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';

@ApiTags('Loan Products')
@ApiBearerAuth()
@Controller('loan-products')
@UseGuards(JwtAuthGuard, RolesGuard)
export class LoanProductsController {
  constructor(private readonly loanProductsService: LoanProductsService) {}

  @Get()
  @Roles('ADMIN')
  @ApiOperation({ summary: 'List all loan products' })
  findAll() {
    return this.loanProductsService.findAllProducts();
  }

  @Get(':productType/config/active')
  @Roles('ADMIN')
  @ApiOperation({ summary: 'Get the active config for a product type' })
  findActiveConfig(@Param('productType') productType: string) {
    return this.loanProductsService.findActiveConfig(productType.toUpperCase());
  }

  @Get(':productType/config/history')
  @Roles('ADMIN')
  @ApiOperation({ summary: 'Get full version history for a product type' })
  findConfigHistory(@Param('productType') productType: string) {
    return this.loanProductsService.findConfigHistory(productType.toUpperCase());
  }

  @Post(':productType/config')
  @Roles('ADMIN')
  @ApiOperation({
    summary: 'Create a new config version for a product (deactivates current)',
  })
  createConfigVersion(
    @Param('productType') productType: string,
    @Body() dto: CreateLoanProductConfigDto,
    @Req() req: any,
  ) {
    return this.loanProductsService.createConfigVersion(
      productType.toUpperCase(),
      dto,
      req.user.userId,
    );
  }

  @Delete(':productType/config/:id')
  @Roles('ADMIN')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Delete a non-active config version' })
  deleteConfigVersion(
    @Param('productType') productType: string,
    @Param('id') id: string,
  ) {
    return this.loanProductsService.deleteConfigVersion(
      productType.toUpperCase(),
      id,
    );
  }
}
