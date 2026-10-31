import { ApiProperty } from '@nestjs/swagger';
import { Appointment } from '@/database/entities/appointment.entity.js';

class CustomerSummary {
  @ApiProperty({ format: 'uuid' }) id: string;
  @ApiProperty() name: string;
}

class VehicleSummary {
  @ApiProperty({ format: 'uuid' }) id: string;
  @ApiProperty() vin: string;
  @ApiProperty() make: string;
  @ApiProperty() model: string;
  @ApiProperty() year: number;
}

class DealershipSummary {
  @ApiProperty({ format: 'uuid' }) id: string;
  @ApiProperty() name: string;
  @ApiProperty({ example: 'Asia/Ho_Chi_Minh' }) timezone: string;
}

class ServiceTypeSummary {
  @ApiProperty({ format: 'uuid' }) id: string;
  @ApiProperty() code: string;
  @ApiProperty() name: string;
  @ApiProperty() durationMinutes: number;
}

class ResourceSummary {
  @ApiProperty({ format: 'uuid' }) id: string;
  @ApiProperty() name: string;
}

export class AppointmentResponseDto {
  @ApiProperty({ format: 'uuid' }) id: string;
  @ApiProperty({ enum: ['CONFIRMED', 'CANCELLED'] }) status: string;
  @ApiProperty({ format: 'date-time' }) startAt: string;
  @ApiProperty({ format: 'date-time', description: 'Exclusive end (A3).' })
  endAt: string;
  @ApiProperty({ format: 'date-time' }) createdAt: string;
  @ApiProperty() customer: CustomerSummary;
  @ApiProperty() vehicle: VehicleSummary;
  @ApiProperty() dealership: DealershipSummary;
  @ApiProperty() serviceType: ServiceTypeSummary;
  @ApiProperty() technician: ResourceSummary;
  @ApiProperty() serviceBay: ResourceSummary;

  /** Expects every relation of the appointment to be loaded. */
  static from(appointment: Required<Appointment>): AppointmentResponseDto {
    const {
      customer,
      vehicle,
      dealership,
      serviceType,
      technician,
      serviceBay,
    } = appointment;
    return {
      id: appointment.id,
      status: appointment.status,
      startAt: appointment.startAt.toISOString(),
      endAt: appointment.endAt.toISOString(),
      createdAt: appointment.createdAt.toISOString(),
      customer: { id: customer.id, name: customer.name },
      vehicle: {
        id: vehicle.id,
        vin: vehicle.vin,
        make: vehicle.make,
        model: vehicle.model,
        year: vehicle.year,
      },
      dealership: {
        id: dealership.id,
        name: dealership.name,
        timezone: dealership.timezone,
      },
      serviceType: {
        id: serviceType.id,
        code: serviceType.code,
        name: serviceType.name,
        durationMinutes: serviceType.durationMinutes,
      },
      technician: { id: technician.id, name: technician.name },
      serviceBay: { id: serviceBay.id, name: serviceBay.name },
    };
  }
}
