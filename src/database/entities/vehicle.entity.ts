import { Column, Entity, PrimaryGeneratedColumn } from 'typeorm';

@Entity('vehicles')
export class Vehicle {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'customer_id', type: 'uuid' })
  customerId: string;

  @Column({ type: 'text' })
  vin: string;

  @Column({ type: 'text' })
  make: string;

  @Column({ type: 'text' })
  model: string;

  @Column({ type: 'integer' })
  year: number;
}
