import { Column, Entity, PrimaryGeneratedColumn } from 'typeorm';

@Entity('dealerships')
export class Dealership {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'text' })
  name: string;

  /** IANA timezone in which opening hours are evaluated (A4). */
  @Column({ type: 'text' })
  timezone: string;

  /** Local opening time, `HH:MM:SS`. */
  @Column({ name: 'open_time', type: 'time' })
  openTime: string;

  /** Local closing time, `HH:MM:SS`; services must end by then. */
  @Column({ name: 'close_time', type: 'time' })
  closeTime: string;
}
