import { ApiProperty } from '@nestjs/swagger';
import { IsISO8601, IsUUID, Matches } from 'class-validator';

export class AvailabilityQueryDto {
  @ApiProperty({
    format: 'uuid',
    example: '10000000-0000-4000-8000-000000000001',
  })
  @IsUUID()
  dealershipId: string;

  @ApiProperty({
    format: 'uuid',
    example: '30000000-0000-4000-8000-000000000001',
  })
  @IsUUID()
  serviceTypeId: string;

  @ApiProperty({
    example: '2031-03-03',
    description: 'A calendar day in the dealership timezone (YYYY-MM-DD).',
  })
  @Matches(/^\d{4}-\d{2}-\d{2}$/, { message: 'date must be YYYY-MM-DD' })
  // Strict mode rejects days that do not exist, such as 2030-02-30.
  @IsISO8601({ strict: true })
  date: string;
}
