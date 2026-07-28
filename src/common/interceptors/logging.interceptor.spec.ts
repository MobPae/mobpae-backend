import { CallHandler, ExecutionContext } from '@nestjs/common';
import { of } from 'rxjs';

import { LoggingInterceptor } from './logging.interceptor';

function buildContext(body: Record<string, unknown>): ExecutionContext {
  const request = { method: 'POST', originalUrl: '/bank-accounts', body, user: undefined };
  const response = { statusCode: 200 };
  return {
    switchToHttp: () => ({
      getRequest: () => request,
      getResponse: () => response,
    }),
  } as unknown as ExecutionContext;
}

function buildHandler(): CallHandler {
  return { handle: () => of({ ok: true }) };
}

describe('LoggingInterceptor', () => {
  it('redacts bank account fields (regression: accountHolderName/ifscCode previously leaked)', (done) => {
    const logSpy = jest.spyOn(console, 'log').mockImplementation(() => undefined);
    const interceptor = new LoggingInterceptor();

    const body = {
      accountHolderName: 'Arjun Sharma',
      accountNumber: '1234567890',
      ifscCode: 'HDFC0001234',
      upiId: 'arjun@upi',
    };

    interceptor
      .intercept(buildContext(body), buildHandler())
      .subscribe(() => {
        const bodyLogCall = logSpy.mock.calls.find((call) => call[0] === 'BODY:');
        expect(bodyLogCall).toBeDefined();

        const loggedBody = bodyLogCall![1] as Record<string, unknown>;
        expect(loggedBody.accountHolderName).toBe('[REDACTED]');
        expect(loggedBody.accountNumber).toBe('[REDACTED]');
        expect(loggedBody.ifscCode).toBe('[REDACTED]');
        expect(loggedBody.upiId).toBe('[REDACTED]');

        logSpy.mockRestore();
        done();
      });
  });
});
