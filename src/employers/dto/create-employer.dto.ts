export class CreateEmployerDto {
  companyName: string;
  companyCode: string;
  contactPerson: string;
  email: string;
  phone: string;

  payrollDate?: number;
  payrollCutoffDate?: number;
}
