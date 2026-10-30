import {
  Column,
  Entity,
  JoinTable,
  ManyToMany,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { Skill } from './skill.entity.js';

@Entity('technicians')
export class Technician {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'dealership_id', type: 'uuid' })
  dealershipId: string;

  @Column({ type: 'text' })
  name: string;

  @Column({ name: 'is_active', type: 'boolean' })
  isActive: boolean;

  @ManyToMany(() => Skill)
  @JoinTable({
    name: 'technician_skills',
    joinColumn: { name: 'technician_id' },
    inverseJoinColumn: { name: 'skill_id' },
  })
  skills: Skill[];
}
