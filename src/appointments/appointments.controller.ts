import {
  Body,
  Controller,
  Get,
  Headers,
  Param,
  ParseUUIDPipe,
  Post,
} from '@nestjs/common';
import {
  ApiConflictResponse,
  ApiCreatedResponse,
  ApiHeader,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiUnprocessableEntityResponse,
} from '@nestjs/swagger';
import { isUUID } from 'class-validator';
import { IdempotencyKeyRequiredError } from '@/common/errors.js';
import { AppointmentsService } from './appointments.service.js';
import { AppointmentResponseDto } from './dto/appointment-response.dto.js';
import { CreateAppointmentDto } from './dto/create-appointment.dto.js';

@ApiTags('appointments')
@Controller('appointments')
export class AppointmentsController {
  constructor(private readonly appointments: AppointmentsService) {}

  @Post()
  @ApiOperation({
    summary: 'Book a service appointment',
    description:
      'Assigns a qualified technician and a service bay that are both free for the whole service duration.',
  })
  @ApiHeader({
    name: 'Idempotency-Key',
    required: true,
    description: 'A UUID identifying this booking attempt.',
  })
  @ApiCreatedResponse({ type: AppointmentResponseDto })
  @ApiNotFoundResponse({ description: 'NOT_FOUND' })
  @ApiConflictResponse({
    description: 'SLOT_UNAVAILABLE or VEHICLE_ALREADY_BOOKED',
  })
  @ApiUnprocessableEntityResponse({
    description:
      'NO_QUALIFIED_TECHNICIAN, OUTSIDE_BUSINESS_HOURS, START_IN_PAST or INVALID_SLOT_ALIGNMENT',
  })
  async create(
    @Headers('idempotency-key') idempotencyKey: string | undefined,
    @Body() body: CreateAppointmentDto,
  ): Promise<AppointmentResponseDto> {
    if (!idempotencyKey || !isUUID(idempotencyKey)) {
      throw new IdempotencyKeyRequiredError();
    }
    const appointment = await this.appointments.create({
      vehicleId: body.vehicleId,
      serviceTypeId: body.serviceTypeId,
      dealershipId: body.dealershipId,
      startAt: new Date(body.startAt),
    });
    return AppointmentResponseDto.from(appointment);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get an appointment with its related records' })
  @ApiOkResponse({ type: AppointmentResponseDto })
  @ApiNotFoundResponse({ description: 'NOT_FOUND' })
  async findOne(
    @Param('id', new ParseUUIDPipe()) id: string,
  ): Promise<AppointmentResponseDto> {
    return AppointmentResponseDto.from(await this.appointments.findOne(id));
  }
}
