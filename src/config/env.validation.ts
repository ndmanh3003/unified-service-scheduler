export interface EnvironmentVariables {
  NODE_ENV: string;
  LOG_LEVEL: string;
  APP_PORT: number;
  DB_HOST: string;
  DB_PORT: number;
  DB_USER: string;
  DB_PASSWORD: string;
  DB_NAME: string;
}

const REQUIRED_STRINGS = [
  'DB_HOST',
  'DB_USER',
  'DB_PASSWORD',
  'DB_NAME',
] as const;

const PORTS = ['APP_PORT', 'DB_PORT'] as const;

export function validateEnv(
  config: Record<string, unknown>,
): EnvironmentVariables {
  const errors: string[] = [];

  for (const key of REQUIRED_STRINGS) {
    if (typeof config[key] !== 'string' || config[key] === '') {
      errors.push(`${key} is required`);
    }
  }

  const ports = {} as Record<(typeof PORTS)[number], number>;
  for (const key of PORTS) {
    const value = Number(config[key]);
    if (!Number.isInteger(value) || value < 1 || value > 65535) {
      errors.push(`${key} must be a valid port number`);
    }
    ports[key] = value;
  }

  if (errors.length > 0) {
    throw new Error(`Invalid environment configuration: ${errors.join('; ')}`);
  }

  return {
    ...(config as Omit<EnvironmentVariables, (typeof PORTS)[number]>),
    NODE_ENV: (config.NODE_ENV as string | undefined) ?? 'development',
    LOG_LEVEL: (config.LOG_LEVEL as string | undefined) ?? 'info',
    ...ports,
  };
}
