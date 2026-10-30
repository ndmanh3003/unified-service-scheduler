import { Column, Entity, PrimaryGeneratedColumn } from 'typeorm';

@Entity('service_types')
export class ServiceType {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'text' })
  code: string;

  @Column({ type: 'text' })
  name: string;

  @Column({ name: 'duration_minutes', type: 'integer' })
  durationMinutes: number;

  /** A2: exactly one required skill. */
  @Column({ name: 'required_skill_id', type: 'uuid' })
  requiredSkillId: string;
}
