import {
  Body,
  Controller,
  Get,
  Headers,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
  Res,
} from '@nestjs/common';
import {
  ApiBadRequestResponse,
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
import type { Response } from 'express';
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
    description:
      'A UUID identifying this booking. Retrying with the same key and payload within 24 hours returns the original appointment.',
  })
  @ApiCreatedResponse({ type: AppointmentResponseDto })
  @ApiOkResponse({
    type: AppointmentResponseDto,
    description:
      'Replay of an earlier booking with the same key; the response carries `Idempotent-Replayed: true`.',
  })
  @ApiBadRequestResponse({
    description: 'VALIDATION_FAILED or IDEMPOTENCY_KEY_REQUIRED',
  })
  @ApiNotFoundResponse({ description: 'NOT_FOUND' })
  @ApiConflictResponse({
    description: 'SLOT_UNAVAILABLE or VEHICLE_ALREADY_BOOKED',
  })
  @ApiUnprocessableEntityResponse({
    description:
      'NO_QUALIFIED_TECHNICIAN, OUTSIDE_BUSINESS_HOURS, START_IN_PAST, INVALID_SLOT_ALIGNMENT or IDEMPOTENCY_KEY_REUSED',
  })
  async create(
    @Headers('idempotency-key') idempotencyKey: string | undefined,
    @Body() body: CreateAppointmentDto,
    @Res({ passthrough: true }) response: Response,
  ): Promise<AppointmentResponseDto> {
    if (!idempotencyKey || !isUUID(idempotencyKey)) {
      throw new IdempotencyKeyRequiredError();
    }
    const { appointment, replayed } = await this.appointments.create({
      idempotencyKey,
      vehicleId: body.vehicleId,
      serviceTypeId: body.serviceTypeId,
      dealershipId: body.dealershipId,
      startAt: new Date(body.startAt),
    });
    if (replayed) {
      response.status(HttpStatus.OK).setHeader('Idempotent-Replayed', 'true');
    }
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
