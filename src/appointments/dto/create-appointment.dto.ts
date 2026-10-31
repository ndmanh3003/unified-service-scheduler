import { ApiProperty } from '@nestjs/swagger';
import { IsISO8601, IsUUID, Matches } from 'class-validator';

/** The four inputs named by the brief; the customer is the vehicle's owner (A8). */
export class CreateAppointmentDto {
  @ApiProperty({
    format: 'uuid',
    example: '70000000-0000-4000-8000-000000000001',
  })
  @IsUUID()
  vehicleId: string;

  @ApiProperty({
    format: 'uuid',
    example: '30000000-0000-4000-8000-000000000001',
  })
  @IsUUID()
  serviceTypeId: string;

  @ApiProperty({
    format: 'uuid',
    example: '10000000-0000-4000-8000-000000000001',
  })
  @IsUUID()
  dealershipId: string;

  @ApiProperty({
    format: 'date-time',
    example: '2030-01-07T09:00:00+07:00',
    description:
      'ISO 8601 with an explicit offset. Must be in the future and aligned to the slot granularity (A5).',
  })
  @IsISO8601({ strict: true })
  // Without an offset the instant would depend on the server timezone.
  @Matches(/(Z|[+-]\d{2}:\d{2})$/, {
    message: 'startAt must include a timezone offset',
  })
  startAt: string;
}
