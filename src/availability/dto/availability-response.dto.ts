import { ApiProperty } from '@nestjs/swagger';

export class AvailabilitySlotDto {
  @ApiProperty({ format: 'date-time' }) startAt: string;
  @ApiProperty({ format: 'date-time', description: 'Exclusive end (A3).' })
  endAt: string;
  @ApiProperty({
    description: 'Qualified technicians free for the whole slot.',
  })
  availableTechnicians: number;
  @ApiProperty({ description: 'Service bays free for the whole slot.' })
  availableServiceBays: number;
}

export class AvailabilityResponseDto {
  @ApiProperty({ format: 'uuid' }) dealershipId: string;
  @ApiProperty({ format: 'uuid' }) serviceTypeId: string;
  @ApiProperty({ example: '2031-03-03' }) date: string;
  @ApiProperty({ example: 'Asia/Ho_Chi_Minh' }) timezone: string;
  @ApiProperty({
    type: [AvailabilitySlotDto],
    description:
      'Future starts with at least one free technician and one free bay.',
  })
  slots: AvailabilitySlotDto[];
}
