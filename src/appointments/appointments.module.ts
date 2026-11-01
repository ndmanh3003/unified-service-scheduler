import { Module } from '@nestjs/common';
import { AppointmentsController } from './appointments.controller.js';
import { AppointmentsService } from './appointments.service.js';
import { BookingPolicyService } from './booking-policy.service.js';
import { IdempotencyService } from './idempotency.service.js';

@Module({
  controllers: [AppointmentsController],
  providers: [AppointmentsService, BookingPolicyService, IdempotencyService],
  exports: [BookingPolicyService],
})
export class AppointmentsModule {}
