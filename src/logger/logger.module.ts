import { randomUUID } from 'node:crypto';
import { IncomingMessage, ServerResponse } from 'node:http';
import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { LoggerModule as PinoLoggerModule } from 'nestjs-pino';
import { EnvironmentVariables } from '@/config/env.validation.js';

export const CORRELATION_ID_HEADER = 'x-correlation-id';

/**
 * Uses the caller's `X-Correlation-Id` when present, otherwise generates one,
 * and echoes it in the response so a client report can be matched to the log.
 */
export function correlationIdOf(
  req: IncomingMessage,
  res: ServerResponse,
): string {
  const header = req.headers[CORRELATION_ID_HEADER];
  const correlationId =
    typeof header === 'string' && header !== '' ? header : randomUUID();
  res.setHeader(CORRELATION_ID_HEADER, correlationId);
  return correlationId;
}

/** Structured JSON logging; every log line of a request carries its correlation id. */
@Module({
  imports: [
    PinoLoggerModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService<EnvironmentVariables, true>) => ({
        pinoHttp: {
          level: config.get('LOG_LEVEL', { infer: true }),
          genReqId: correlationIdOf,
          customAttributeKeys: { reqId: 'correlationId' },
          // Request and response headers are not logged; the correlation id is enough to trace a request.
          quietReqLogger: true,
          serializers: {
            req: (req: { method: string; url: string }) => ({
              method: req.method,
              url: req.url,
            }),
            res: (res: { statusCode: number }) => ({
              statusCode: res.statusCode,
            }),
          },
        },
      }),
    }),
  ],
})
export class LoggerModule {}
