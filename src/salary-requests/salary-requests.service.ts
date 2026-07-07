/**
 * @deprecated SalaryRequestsService has been replaced by LoanApplicationsService.
 * This stub exists only to satisfy TypeScript compilation while LoanApplicationsModule
 * is implemented in Phase C. All methods throw NotImplementedException.
 * Delete this file once Phase C is complete.
 */
import { Injectable, NotImplementedException } from '@nestjs/common';

@Injectable()
export class SalaryRequestsService {
  private notImplemented(): never {
    throw new NotImplementedException(
      'SalaryRequests has been replaced by LoanApplications. ' +
        'Use /loan-applications endpoints instead.',
    );
  }

  create(_userId: string, _dto: any): Promise<any> {
    return Promise.resolve(this.notImplemented());
  }

  preview(_userId: string, _amount: number): Promise<any> {
    return Promise.resolve(this.notImplemented());
  }

  getEligibility(_userId: string): Promise<any> {
    return Promise.resolve(this.notImplemented());
  }

  findAllForAdmin(_query?: any): Promise<any> {
    return Promise.resolve(this.notImplemented());
  }

  findByEmployee(_employeeId: string): Promise<any> {
    return Promise.resolve(this.notImplemented());
  }

  findByUserId(_userId: string): Promise<any> {
    return Promise.resolve(this.notImplemented());
  }

  findAllForEmployer(_userId: string): Promise<any> {
    return Promise.resolve(this.notImplemented());
  }

  findPendingByEmployer(_userId: string): Promise<any> {
    return Promise.resolve(this.notImplemented());
  }

  findOne(_id: string, _user?: any): Promise<any> {
    return Promise.resolve(this.notImplemented());
  }

  findOneById(_id: string, _userId?: string, _role?: string): Promise<any> {
    return Promise.resolve(this.notImplemented());
  }

  approve(_id: string, _actorUserId: string): Promise<any> {
    return Promise.resolve(this.notImplemented());
  }

  reject(_id: string, _remarks: string | undefined, _actorUserId: string): Promise<any> {
    return Promise.resolve(this.notImplemented());
  }

  employerApprove(_id: string, _actorUserId: string): Promise<any> {
    return Promise.resolve(this.notImplemented());
  }

  employerReject(_id: string, _dto: any, _actorUserId: string): Promise<any> {
    return Promise.resolve(this.notImplemented());
  }

  adminApprove(_id: string, _actorUserId: string): Promise<any> {
    return Promise.resolve(this.notImplemented());
  }

  adminReject(_id: string, _dto: any, _actorUserId: string): Promise<any> {
    return Promise.resolve(this.notImplemented());
  }

  bulkAction(_dto: any, _actorUserId: string, _role?: string): Promise<any> {
    return Promise.resolve(this.notImplemented());
  }

  cancel(_id: string, _userId: string, _remarks?: string): Promise<any> {
    return Promise.resolve(this.notImplemented());
  }
}
