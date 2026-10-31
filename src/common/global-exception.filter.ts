import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { Request, Response } from 'express';
import { AppError } from '@/common/errors.js';

/** HTTP status for each code of the error catalog in docs/SPEC.md. */
const STATUS_BY_CODE: Record<string, number> = {
  VALIDATION_FAILED: HttpStatus.BAD_REQUEST,
  IDEMPOTENCY_KEY_REQUIRED: HttpStatus.BAD_REQUEST,
  NOT_FOUND: HttpStatus.NOT_FOUND,
  SLOT_UNAVAILABLE: HttpStatus.CONFLICT,
  VEHICLE_ALREADY_BOOKED: HttpStatus.CONFLICT,
  NO_QUALIFIED_TECHNICIAN: HttpStatus.UNPROCESSABLE_ENTITY,
  OUTSIDE_BUSINESS_HOURS: HttpStatus.UNPROCESSABLE_ENTITY,
  START_IN_PAST: HttpStatus.UNPROCESSABLE_ENTITY,
  INVALID_SLOT_ALIGNMENT: HttpStatus.UNPROCESSABLE_ENTITY,
  IDEMPOTENCY_KEY_REUSED: HttpStatus.UNPROCESSABLE_ENTITY,
};

export interface ErrorBody {
  error: { code: string; message: string; correlationId: string };
}

/** Writes every error in the unified shape and maps typed errors to HTTP codes. */
@Catch()
export class GlobalExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(GlobalExceptionFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const context = host.switchToHttp();
    // pino-http stores the correlation id as `req.id` (see LoggerModule).
    const request = context.getRequest<Request & { id?: unknown }>();
    const response = context.getResponse<Response>();
    const { status, code, message } = this.describe(exception);

    if (status >= 500) {
      // Details are logged, never returned.
      this.logger.error({ msg: 'unhandled_error', err: exception });
    } else {
      this.logger.log({ msg: 'request_rejected', code, status });
    }

    const body: ErrorBody = {
      error: {
        code,
        message,
        correlationId: typeof request.id === 'string' ? request.id : '',
      },
    };
    response.status(status).json(body);
  }

  private describe(exception: unknown): {
    status: number;
    code: string;
    message: string;
  } {
    if (exception instanceof AppError) {
      return {
        status:
          STATUS_BY_CODE[exception.code] ?? HttpStatus.UNPROCESSABLE_ENTITY,
        code: exception.code,
        message: exception.message,
      };
    }
    if (exception instanceof HttpException) {
      const status = exception.getStatus();
      if (status >= 500) {
        return internalError();
      }
      return {
        status,
        code: status === 404 ? 'NOT_FOUND' : 'VALIDATION_FAILED',
        message: messageOf(exception),
      };
    }
    return internalError();
  }
}

function internalError() {
  return {
    status: HttpStatus.INTERNAL_SERVER_ERROR,
    code: 'INTERNAL_ERROR',
    message: 'An unexpected error occurred.',
  };
}

/** `ValidationPipe` reports one message per invalid field; they are joined. */
function messageOf(exception: HttpException): string {
  const response = exception.getResponse();
  if (
    typeof response === 'object' &&
    response !== null &&
    'message' in response
  ) {
    const { message } = response as { message: unknown };
    if (Array.isArray(message)) {
      return message.join('; ');
    }
    if (typeof message === 'string') {
      return message;
    }
  }
  return exception.message;
}
