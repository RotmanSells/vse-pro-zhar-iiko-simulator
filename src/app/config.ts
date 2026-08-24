import { z } from 'zod';

const BooleanEnv = z.enum(['true', 'false']).transform((value) => value === 'true');

const EnvSchema = z.object({
  NODE_ENV: z.string().default('development'),
  HOST: z.string().default('127.0.0.1'),
  PORT: z.coerce.number().int().min(1).max(65535).default(4010),
  SIMULATOR_DETERMINISTIC_IDS: BooleanEnv.default('true'),
  SIMULATOR_TOKEN_TTL_MS: z.coerce.number().int().positive().default(3_600_000),
  SIMULATOR_V2_API_KEY: z.string().min(1).default('vpzh-test-api-key'),
  SIMULATOR_V2_APP_ID: z.string().uuid().default('00000000-0000-4000-8000-000000000001'),
  SIMULATOR_V2_CLIENT_SECRET: z.string().min(1).default('vpzh-test-client-secret'),
  SIMULATOR_LEGACY_API_LOGIN: z.string().min(1).default('vpzh-test-api-login'),
  SIMULATOR_CONTROL_TOKEN: z.string().default(''),
  SIMULATOR_RATE_LIMIT_ENABLED: BooleanEnv.default('false'),
  SIMULATOR_RATE_LIMIT_REQUESTS: z.coerce.number().int().positive().default(60),
  SIMULATOR_RATE_LIMIT_WINDOW_MS: z.coerce.number().int().positive().default(60_000)
});

export interface Config {
  nodeEnv: string;
  host: string;
  port: number;
  deterministicIds: boolean;
  tokenTtlMs: number;
  v2ApiKey: string;
  v2AppId: string;
  v2ClientSecret: string;
  legacyApiLogin: string;
  controlToken: string;
  rateLimit: { enabled: boolean; requests: number; windowMs: number };
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const parsed = EnvSchema.parse(env);
  return {
    nodeEnv: parsed.NODE_ENV,
    host: parsed.HOST,
    port: parsed.PORT,
    deterministicIds: parsed.SIMULATOR_DETERMINISTIC_IDS,
    tokenTtlMs: parsed.SIMULATOR_TOKEN_TTL_MS,
    v2ApiKey: parsed.SIMULATOR_V2_API_KEY,
    v2AppId: parsed.SIMULATOR_V2_APP_ID,
    v2ClientSecret: parsed.SIMULATOR_V2_CLIENT_SECRET,
    legacyApiLogin: parsed.SIMULATOR_LEGACY_API_LOGIN,
    controlToken: parsed.SIMULATOR_CONTROL_TOKEN,
    rateLimit: {
      enabled: parsed.SIMULATOR_RATE_LIMIT_ENABLED,
      requests: parsed.SIMULATOR_RATE_LIMIT_REQUESTS,
      windowMs: parsed.SIMULATOR_RATE_LIMIT_WINDOW_MS
    }
  };
}
