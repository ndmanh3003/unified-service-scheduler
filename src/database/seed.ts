import { DataSource } from 'typeorm';

/**
 * Fixed identifiers, so the cURL examples and the race-condition demo can
 * refer to seeded rows directly.
 */
export const SEED_IDS = {
  dealerships: {
    /** Three technicians and three bays. */
    main: '10000000-0000-4000-8000-000000000001',
    /** One technician and one bay: every overlapping request competes for the same pair. */
    express: '10000000-0000-4000-8000-000000000002',
  },
  skills: {
    engine: '20000000-0000-4000-8000-000000000001',
    brakes: '20000000-0000-4000-8000-000000000002',
    electric: '20000000-0000-4000-8000-000000000003',
  },
  serviceTypes: {
    oilChange: '30000000-0000-4000-8000-000000000001',
    brakeService: '30000000-0000-4000-8000-000000000002',
    evBatteryCheck: '30000000-0000-4000-8000-000000000003',
  },
  customers: {
    an: '60000000-0000-4000-8000-000000000001',
    binh: '60000000-0000-4000-8000-000000000002',
    /** Owns the twenty fleet vehicles used by the race-condition demo. */
    fleet: '60000000-0000-4000-8000-000000000003',
  },
  vehicles: {
    anSedan: '70000000-0000-4000-8000-000000000001',
    anElectric: '70000000-0000-4000-8000-000000000002',
    binhHatchback: '70000000-0000-4000-8000-000000000003',
  },
} as const;

/** Fleet vehicle `n` (1 to 20) has id `71000000-0000-4000-8000-0000000000nn`. */
export function fleetVehicleId(n: number): string {
  return `71000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
}

/**
 * Demo reference data (A10). Every insert ignores existing rows, so the seed
 * can run on every startup.
 */
export async function seedDemoData(dataSource: DataSource): Promise<void> {
  const { dealerships, skills, serviceTypes, customers, vehicles } = SEED_IDS;

  await dataSource.transaction(async (manager) => {
    await manager.query(
      `INSERT INTO dealerships (id, name, timezone, open_time, close_time) VALUES
         ($1, 'Keyloop Motors Saigon', 'Asia/Ho_Chi_Minh', '08:00', '17:00'),
         ($2, 'Keyloop Express Thu Duc', 'Asia/Ho_Chi_Minh', '08:00', '17:00')
       ON CONFLICT (id) DO NOTHING`,
      [dealerships.main, dealerships.express],
    );

    await manager.query(
      `INSERT INTO skills (id, code, name) VALUES
         ($1, 'ENGINE', 'Engine maintenance'),
         ($2, 'BRAKES', 'Brake systems'),
         ($3, 'ELECTRIC', 'High-voltage electric systems')
       ON CONFLICT (id) DO NOTHING`,
      [skills.engine, skills.brakes, skills.electric],
    );

    await manager.query(
      `INSERT INTO service_types (id, code, name, duration_minutes, required_skill_id) VALUES
         ($1, 'OIL_CHANGE', 'Oil change', 60, $4),
         ($2, 'BRAKE_SERVICE', 'Brake service', 90, $5),
         ($3, 'EV_BATTERY_CHECK', 'EV battery check', 45, $6)
       ON CONFLICT (id) DO NOTHING`,
      [
        serviceTypes.oilChange,
        serviceTypes.brakeService,
        serviceTypes.evBatteryCheck,
        skills.engine,
        skills.brakes,
        skills.electric,
      ],
    );

    await manager.query(
      `INSERT INTO technicians (id, dealership_id, name, is_active) VALUES
         ('40000000-0000-4000-8000-000000000001', $1, 'Minh Le', true),
         ('40000000-0000-4000-8000-000000000002', $1, 'Hoa Pham', true),
         ('40000000-0000-4000-8000-000000000003', $1, 'Quang Vo', true),
         ('40000000-0000-4000-8000-000000000004', $1, 'Tuan Do (on leave)', false),
         ('40000000-0000-4000-8000-000000000005', $2, 'Lan Ho', true)
       ON CONFLICT (id) DO NOTHING`,
      [dealerships.main, dealerships.express],
    );

    await manager.query(
      `INSERT INTO technician_skills (technician_id, skill_id) VALUES
         ('40000000-0000-4000-8000-000000000001', $1),
         ('40000000-0000-4000-8000-000000000001', $2),
         ('40000000-0000-4000-8000-000000000002', $1),
         ('40000000-0000-4000-8000-000000000003', $1),
         ('40000000-0000-4000-8000-000000000003', $3),
         ('40000000-0000-4000-8000-000000000004', $1),
         ('40000000-0000-4000-8000-000000000005', $1),
         ('40000000-0000-4000-8000-000000000005', $2)
       ON CONFLICT DO NOTHING`,
      [skills.engine, skills.brakes, skills.electric],
    );

    await manager.query(
      `INSERT INTO service_bays (id, dealership_id, name, is_active) VALUES
         ('50000000-0000-4000-8000-000000000001', $1, 'Bay 1', true),
         ('50000000-0000-4000-8000-000000000002', $1, 'Bay 2', true),
         ('50000000-0000-4000-8000-000000000003', $1, 'Bay 3', true),
         ('50000000-0000-4000-8000-000000000004', $2, 'Express Bay', true)
       ON CONFLICT (id) DO NOTHING`,
      [dealerships.main, dealerships.express],
    );

    await manager.query(
      `INSERT INTO customers (id, name, email, phone) VALUES
         ($1, 'An Nguyen', 'an.nguyen@example.com', '+84900000001'),
         ($2, 'Binh Tran', 'binh.tran@example.com', '+84900000002'),
         ($3, 'Saigon Fleet Services', 'fleet@example.com', '+84900000003')
       ON CONFLICT (id) DO NOTHING`,
      [customers.an, customers.binh, customers.fleet],
    );

    await manager.query(
      `INSERT INTO vehicles (id, customer_id, vin, make, model, year) VALUES
         ($1, $4, 'JTDBR32E720000001', 'Toyota', 'Vios', 2022),
         ($2, $4, 'RLLV0000000000002', 'VinFast', 'VF 8', 2024),
         ($3, $5, 'MRHGM6650PP000003', 'Honda', 'City', 2023)
       ON CONFLICT (id) DO NOTHING`,
      [
        vehicles.anSedan,
        vehicles.anElectric,
        vehicles.binhHatchback,
        customers.an,
        customers.binh,
      ],
    );

    await manager.query(
      `INSERT INTO vehicles (id, customer_id, vin, make, model, year)
       SELECT ('71000000-0000-4000-8000-' || lpad(n::text, 12, '0'))::uuid,
              $1, 'FLEET' || lpad(n::text, 12, '0'), 'Toyota', 'Hiace', 2021
       FROM generate_series(1, 20) AS n
       ON CONFLICT (id) DO NOTHING`,
      [customers.fleet],
    );
  });
}
