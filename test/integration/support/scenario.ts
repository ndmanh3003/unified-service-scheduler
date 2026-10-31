import { randomUUID } from 'node:crypto';
import { DataSource } from 'typeorm';

export interface ScenarioOptions {
  /** Skills of each technician; `engine` is the skill an oil change requires. */
  technicians?: { skills?: ('engine' | 'brakes')[]; isActive?: boolean }[];
  serviceBays?: number;
  vehicles?: number;
}

export interface Scenario {
  dealershipId: string;
  serviceTypeId: string;
  customerId: string;
  vehicleIds: string[];
  technicianIds: string[];
  serviceBayIds: string[];
}

/**
 * Inserts an isolated dealership in Ho Chi Minh City (UTC+7), open 08:00 to
 * 17:00, with a 60-minute oil change that requires the `engine` skill. Every
 * row gets fresh ids so tests never share resources.
 */
export async function createScenario(
  sql: DataSource,
  options: ScenarioOptions = {},
): Promise<Scenario> {
  const technicians = options.technicians ?? [{}];
  const tag = randomUUID().slice(0, 8);
  const scenario: Scenario = {
    dealershipId: randomUUID(),
    serviceTypeId: randomUUID(),
    customerId: randomUUID(),
    vehicleIds: Array.from({ length: options.vehicles ?? 2 }, () =>
      randomUUID(),
    ),
    technicianIds: technicians.map(() => randomUUID()),
    serviceBayIds: Array.from({ length: options.serviceBays ?? 1 }, () =>
      randomUUID(),
    ),
  };
  const skills = { engine: randomUUID(), brakes: randomUUID() };

  await sql.transaction(async (manager) => {
    await manager.query(
      `INSERT INTO dealerships (id, name, timezone, open_time, close_time)
       VALUES ($1, $2, 'Asia/Ho_Chi_Minh', '08:00', '17:00')`,
      [scenario.dealershipId, `Dealership ${tag}`],
    );
    await manager.query(
      `INSERT INTO skills (id, code, name) VALUES ($1, $3, 'Engine'), ($2, $4, 'Brakes')`,
      [skills.engine, skills.brakes, `ENGINE_${tag}`, `BRAKES_${tag}`],
    );
    await manager.query(
      `INSERT INTO service_types (id, code, name, duration_minutes, required_skill_id)
       VALUES ($1, $2, 'Oil change', 60, $3)`,
      [scenario.serviceTypeId, `OIL_${tag}`, skills.engine],
    );
    await manager.query(
      `INSERT INTO customers (id, name, email, phone)
       VALUES ($1, 'An Nguyen', $2, '+84900000001')`,
      [scenario.customerId, `an.${tag}@example.com`],
    );
    for (const [index, id] of scenario.vehicleIds.entries()) {
      await manager.query(
        `INSERT INTO vehicles (id, customer_id, vin, make, model, year)
         VALUES ($1, $2, $3, 'Toyota', 'Vios', 2022)`,
        [id, scenario.customerId, `VIN${tag}${index}`],
      );
    }
    for (const [index, technician] of technicians.entries()) {
      const id = scenario.technicianIds[index];
      await manager.query(
        `INSERT INTO technicians (id, dealership_id, name, is_active) VALUES ($1, $2, $3, $4)`,
        [
          id,
          scenario.dealershipId,
          `Technician ${index}`,
          technician.isActive ?? true,
        ],
      );
      for (const skill of technician.skills ?? ['engine']) {
        await manager.query(
          'INSERT INTO technician_skills (technician_id, skill_id) VALUES ($1, $2)',
          [id, skills[skill]],
        );
      }
    }
    for (const [index, id] of scenario.serviceBayIds.entries()) {
      await manager.query(
        'INSERT INTO service_bays (id, dealership_id, name) VALUES ($1, $2, $3)',
        [id, scenario.dealershipId, `Bay ${index}`],
      );
    }
  });

  return scenario;
}
