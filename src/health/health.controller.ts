import { Controller, Get } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import {
  HealthCheck,
  HealthCheckService,
  TypeOrmHealthIndicator,
} from '@nestjs/terminus';

@ApiTags('health')
@Controller('health')
export class HealthController {
  constructor(
    private readonly health: HealthCheckService,
    private readonly database: TypeOrmHealthIndicator,
  ) {}

  @Get('live')
  @ApiOperation({ summary: 'Liveness probe' })
  @HealthCheck()
  live() {
    return this.health.check([]);
  }

  @Get('ready')
  @ApiOperation({
    summary: 'Readiness probe',
    description: 'Returns 503 when PostgreSQL is unreachable.',
  })
  @HealthCheck()
  ready() {
    return this.health.check([
      () => this.database.pingCheck('postgres', { timeout: 1500 }),
    ]);
  }
}
