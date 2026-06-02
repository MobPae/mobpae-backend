import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
} from '@nestjs/common';

import { Observable, throwError } from 'rxjs';
import { tap, catchError } from 'rxjs/operators';

@Injectable()
export class LoggingInterceptor implements NestInterceptor {
  /**
   * Logs incoming requests and outgoing responses
   * along with execution time.
   */

  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    const request = context.switchToHttp().getRequest();
    const response = context.switchToHttp().getResponse();

    const { method, originalUrl, body } = request;

    const startTime = Date.now();
    const timestamp = new Date().toISOString();

    const userId = request.user?.userId || 'anonymous';

    console.log('='.repeat(80));
    console.log(`[${timestamp}] REQUEST ${method} ${originalUrl}`);
    console.log(`USER: ${userId}`);
    console.log(`ROLE: ${request.user?.role || 'anonymous'}`);
    console.log('BODY:', body || {});

    return next.handle().pipe(
      tap(() => {
        const duration = Date.now() - startTime;

        console.log(`RESPONSE ${response.statusCode}`);

        console.log(`DURATION ${duration}ms`);

        console.log('='.repeat(80));
      }),

      catchError((error) => {
        const duration = Date.now() - startTime;

        console.log(`ERROR ${error.status || 500}`);
        console.log(`MESSAGE: ${error.message}`);
        console.log(`DURATION ${duration}ms`);
        console.log('='.repeat(80));

        return throwError(() => error);
      }),
    );
  }
}
