import { Module } from '@nestjs/common';
import { AppointmentsController } from './appointments.controller.js';
import { AppointmentsService } from './appointments.service.js';
import { BookingPolicyService } from './booking-policy.service.js';

@Module({
  controllers: [AppointmentsController],
  providers: [AppointmentsService, BookingPolicyService],
  exports: [BookingPolicyService],
})
export class AppointmentsModule {}
