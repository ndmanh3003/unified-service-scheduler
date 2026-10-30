import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { Customer } from './customer.entity.js';
import { Dealership } from './dealership.entity.js';
import { ServiceBay } from './service-bay.entity.js';
import { ServiceType } from './service-type.entity.js';
import { Technician } from './technician.entity.js';
import { Vehicle } from './vehicle.entity.js';

export type AppointmentStatus = 'CONFIRMED' | 'CANCELLED';

/**
 * The generated `time_range` column and the exclusion constraints are defined
 * in the migration only; they are not mapped here.
 */
@Entity('appointments')
export class Appointment {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'customer_id', type: 'uuid' })
  customerId: string;

  @Column({ name: 'vehicle_id', type: 'uuid' })
  vehicleId: string;

  @Column({ name: 'dealership_id', type: 'uuid' })
  dealershipId: string;

  @Column({ name: 'service_type_id', type: 'uuid' })
  serviceTypeId: string;

  @Column({ name: 'technician_id', type: 'uuid' })
  technicianId: string;

  @Column({ name: 'service_bay_id', type: 'uuid' })
  serviceBayId: string;

  @Column({ name: 'start_at', type: 'timestamptz' })
  startAt: Date;

  @Column({ name: 'end_at', type: 'timestamptz' })
  endAt: Date;

  @Column({ type: 'text' })
  status: AppointmentStatus;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;

  @ManyToOne(() => Customer)
  @JoinColumn({ name: 'customer_id' })
  customer?: Customer;

  @ManyToOne(() => Vehicle)
  @JoinColumn({ name: 'vehicle_id' })
  vehicle?: Vehicle;

  @ManyToOne(() => Dealership)
  @JoinColumn({ name: 'dealership_id' })
  dealership?: Dealership;

  @ManyToOne(() => ServiceType)
  @JoinColumn({ name: 'service_type_id' })
  serviceType?: ServiceType;

  @ManyToOne(() => Technician)
  @JoinColumn({ name: 'technician_id' })
  technician?: Technician;

  @ManyToOne(() => ServiceBay)
  @JoinColumn({ name: 'service_bay_id' })
  serviceBay?: ServiceBay;
}
