import { z } from 'zod';

/**
 * Runtime environment validation. Import `env` anywhere in server code.
 *
 * Validation runs once at module load. In production (`NODE_ENV=production`)
 * missing critical values throw immediately so a misconfigured deploy fails
 * fast rather than leaking. In development we allow generous defaults so the
 * app boots with `docker compose up` and no cloud account.
 */

const bool = (def: boolean) =>
  z
    .enum(['true', 'false', '1', '0'])
    .transform((v) => v === 'true' || v === '1')
    .default(def ? 'true' : 'false');

const int = (def: number) =>
  z
    .string()
    .transform((v) => Number.parseInt(v, 10))
    .pipe(z.number().int().nonnegative())
    .default(String(def));

const schema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),

  // Database
  DATABASE_URL: z.string().min(1).default('postgresql://portal:portal@localhost:5432/portal'),
  DIRECT_URL: z.string().optional(),

  // App
  NEXT_PUBLIC_APP_URL: z.string().url().default('http://localhost:3000'),
  SESSION_SECRET: z.string().min(32).default('dev-session-secret-change-me-32chars-min!!'),
  LOG_LEVEL: z.enum(['debug', 'info', 'warn', 'error']).default('info'),

  // Auth adapter selection
  ENABLE_DEV_AUTH: bool(true),

  // AWS core
  AWS_REGION: z.string().default('us-east-1'),
  AWS_ACCESS_KEY_ID: z.string().optional(),
  AWS_SECRET_ACCESS_KEY: z.string().optional(),

  // S3 / storage
  STORAGE_DRIVER: z.enum(['s3', 'minio', 'local']).default('local'),
  AWS_S3_BUCKET: z.string().default('gc-portal-dev'),
  AWS_KMS_KEY_ID: z.string().optional(),
  S3_ENDPOINT: z.string().optional(), // MinIO endpoint for local dev
  S3_FORCE_PATH_STYLE: bool(true),
  LOCAL_STORAGE_DIR: z.string().default('.local-storage'),
  PRESIGNED_URL_EXPIRATION_SECONDS: int(300),
  MAX_UPLOAD_SIZE_MB: int(50),

  // Bedrock / AI
  AI_DRIVER: z.enum(['bedrock', 'mock']).default('mock'),
  AWS_BEDROCK_CHAT_MODEL_ID: z.string().default('anthropic.claude-3-5-sonnet-20240620-v1:0'),
  AWS_BEDROCK_LOW_COST_MODEL_ID: z.string().default('anthropic.claude-3-haiku-20240307-v1:0'),
  AWS_BEDROCK_ADVANCED_MODEL_ID: z.string().default('anthropic.claude-3-5-sonnet-20240620-v1:0'),
  AWS_BEDROCK_EMBEDDING_MODEL_ID: z.string().default('amazon.titan-embed-text-v2:0'),
  AWS_BEDROCK_EMBEDDING_DIMENSION: int(1024),

  // Cognito
  COGNITO_USER_POOL_ID: z.string().optional(),
  COGNITO_CLIENT_ID: z.string().optional(),
  COGNITO_CLIENT_SECRET: z.string().optional(),
  COGNITO_DOMAIN: z.string().optional(),
  COGNITO_REGION: z.string().optional(),

  // Cost + limits defaults (seed OrganizationSetting)
  DEFAULT_MONTHLY_TOKEN_LIMIT: int(5_000_000),
  DEFAULT_DAILY_QUERY_LIMIT: int(200),

  // Chunking
  CHUNK_TARGET_TOKENS: int(700),
  CHUNK_OVERLAP_TOKENS: int(100),

  // Rate limiting (public webhook / API)
  RATE_LIMIT_WINDOW_SECONDS: int(60),
  RATE_LIMIT_MAX_REQUESTS: int(60),

  // Invitations
  INVITATION_EXPIRY_HOURS: int(72),

  // Worker
  JOB_WORKER_ID: z.string().default('worker-local'),
});

export type Env = z.infer<typeof schema>;

function load(): Env {
  const parsed = schema.safeParse(process.env);
  if (!parsed.success) {
    const issues = parsed.error.issues
      .map((i) => `  - ${i.path.join('.')}: ${i.message}`)
      .join('\n');
    throw new Error(`Invalid environment configuration:\n${issues}`);
  }
  const env = parsed.data;

  // Production guardrails: refuse to boot with insecure defaults.
  // Skipped during `next build` (NEXT_PHASE), which sets NODE_ENV=production but
  // does not serve traffic; the checks still run when the server actually boots.
  const isBuildPhase = process.env.NEXT_PHASE === 'phase-production-build';
  if (env.NODE_ENV === 'production' && !isBuildPhase) {
    const problems: string[] = [];
    if (env.ENABLE_DEV_AUTH) problems.push('ENABLE_DEV_AUTH must be false in production');
    if (env.SESSION_SECRET.startsWith('dev-session-secret'))
      problems.push('SESSION_SECRET must be set to a strong unique value');
    if (env.AI_DRIVER === 'mock') problems.push('AI_DRIVER must be "bedrock" in production');
    if (env.STORAGE_DRIVER === 'local')
      problems.push('STORAGE_DRIVER must be "s3" (or "minio") in production');
    if (env.STORAGE_DRIVER === 's3' && !env.AWS_KMS_KEY_ID)
      problems.push('AWS_KMS_KEY_ID is required for SSE-KMS encryption in production');
    if (!env.COGNITO_USER_POOL_ID || !env.COGNITO_CLIENT_ID)
      problems.push('Cognito configuration is required in production');
    if (problems.length > 0) {
      throw new Error(
        `Unsafe production configuration:\n${problems.map((p) => `  - ${p}`).join('\n')}`,
      );
    }
  }

  return env;
}

export const env = load();
