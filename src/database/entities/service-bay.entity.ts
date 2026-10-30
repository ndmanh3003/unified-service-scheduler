import { Column, Entity, PrimaryGeneratedColumn } from 'typeorm';

@Entity('service_bays')
export class ServiceBay {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'dealership_id', type: 'uuid' })
  dealershipId: string;

  @Column({ type: 'text' })
  name: string;

  @Column({ name: 'is_active', type: 'boolean' })
  isActive: boolean;
}
