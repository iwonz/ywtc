import {readFileSync} from 'node:fs';
import {parse as parseDotEnv} from 'dotenv';
import {parse as parseYaml} from 'yaml';
import {z} from 'zod';

const limitsSchema = z.object({
  readConcurrency: z.number().int().min(1).max(64).default(4),
  writeConcurrency: z.number().int().min(1).max(32).default(2),
  downloadConcurrency: z.number().int().min(1).max(32).default(2),
  uploadConcurrency: z.number().int().min(1).max(32).default(2),
  requestsPerSecond: z.number().int().min(1).max(1_000).default(8),
  burst: z.number().int().min(1).max(1_000).default(8),
}).partial().default({});

const baseProfileSchema = z.object({
  tokenEnv: z.string().regex(/^[A-Z][A-Z0-9_]*$/, 'must be an uppercase environment variable name'),
  limits: limitsSchema,
});

const yandexProfileSchema = baseProfileSchema.extend({
  type: z.literal('yandex-wiki'),
  apiUrl: z.url(),
  webUrl: z.url(),
  authType: z.enum(['oauth', 'iam']).default('oauth'),
  organization: z.object({
    type: z.enum(['yandex360', 'cloud']).default('yandex360'),
    id: z.string().trim().min(1),
  }),
});

const confluenceProfileSchema = baseProfileSchema.extend({
  type: z.literal('confluence'),
  deployment: z.enum(['data-center', 'cloud']),
  baseUrl: z.url(),
  authType: z.enum(['pat', 'api-token']),
  emailEnv: z.string().regex(/^[A-Z][A-Z0-9_]*$/).optional(),
}).superRefine((profile, context) => {
  if (profile.deployment === 'data-center' && profile.authType !== 'pat') {
    context.addIssue({code: 'custom', path: ['authType'], message: 'Data Center requires pat'});
  }
  if (profile.deployment === 'cloud' && profile.authType !== 'api-token') {
    context.addIssue({code: 'custom', path: ['authType'], message: 'Cloud requires api-token'});
  }
  if (profile.deployment === 'cloud' && !profile.emailEnv) {
    context.addIssue({code: 'custom', path: ['emailEnv'], message: 'Cloud API token requires emailEnv'});
  }
});

const fileSchema = z.object({
  schemaVersion: z.literal(2),
  defaults: z.object({
    timeoutMs: z.number().int().min(1_000).max(300_000).default(30_000),
    concurrency: z.number().int().min(1).max(64).default(4),
  }).partial().default({}),
  connections: z.record(z.string().regex(/^[a-z0-9][a-z0-9._-]*$/), z.discriminatedUnion('type', [
    yandexProfileSchema,
    confluenceProfileSchema,
  ])).refine((connections) => Object.keys(connections).length > 0, 'at least one connection is required'),
});

export interface NetworkLimits {
  readConcurrency: number;
  writeConcurrency: number;
  downloadConcurrency: number;
  uploadConcurrency: number;
  requestsPerSecond: number;
  burst: number;
}

interface ProfileBase {
  name: string;
  tokenEnv: string;
  token: string;
  limits: NetworkLimits;
}

export interface YandexConnectionProfile extends ProfileBase {
  type: 'yandex-wiki';
  apiUrl: string;
  webUrl: string;
  authType: 'oauth' | 'iam';
  organization: {type: 'yandex360' | 'cloud'; id: string};
}

export interface ConfluenceConnectionProfile extends ProfileBase {
  type: 'confluence';
  deployment: 'data-center' | 'cloud';
  baseUrl: string;
  authType: 'pat' | 'api-token';
  emailEnv?: string;
  email?: string;
}

export type ConnectionProfile = YandexConnectionProfile | ConfluenceConnectionProfile;

export interface AppConfig {
  schemaVersion: 2;
  profiles: Record<string, ConnectionProfile>;
  timeoutMs: number;
  concurrency: number;
  envFile: string;
  configFile: string;
}

export class ConfigurationError extends Error {
  constructor(public readonly fields: string[], public readonly configFile?: string) {
    const location = configFile ? ` in ${configFile}` : '';
    super(`Invalid or missing configuration${location}: ${fields.join(', ')}. Run "ywtc init" and fix the listed values.`);
    this.name = 'ConfigurationError';
  }
}

function withoutTrailingSlash(value: string): string {
  return value.replace(/\/+$/, '');
}

export function loadEnvironment(envFile: string, processEnvironment: NodeJS.ProcessEnv = process.env): NodeJS.ProcessEnv {
  let fileEnvironment: Record<string, string> = {};
  try {
    fileEnvironment = parseDotEnv(readFileSync(envFile));
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
      throw new Error(`Cannot read workspace credentials: ${envFile}`, {cause: error});
    }
  }
  return {...fileEnvironment, ...processEnvironment};
}

function readYaml(filename: string): unknown {
  try {
    return parseYaml(readFileSync(filename, 'utf8'));
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') throw new ConfigurationError(['ywtc.config.yaml'], filename);
    throw new Error(`Cannot parse workspace profile configuration: ${filename}`, {cause: error});
  }
}

const defaultLimits: NetworkLimits = {
  readConcurrency: 4,
  writeConcurrency: 2,
  downloadConcurrency: 2,
  uploadConcurrency: 2,
  requestsPerSecond: 8,
  burst: 8,
};

function resolvedLimits(input: {[K in keyof NetworkLimits]?: NetworkLimits[K] | undefined}): NetworkLimits {
  return {
    readConcurrency: input.readConcurrency ?? defaultLimits.readConcurrency,
    writeConcurrency: input.writeConcurrency ?? defaultLimits.writeConcurrency,
    downloadConcurrency: input.downloadConcurrency ?? defaultLimits.downloadConcurrency,
    uploadConcurrency: input.uploadConcurrency ?? defaultLimits.uploadConcurrency,
    requestsPerSecond: input.requestsPerSecond ?? defaultLimits.requestsPerSecond,
    burst: input.burst ?? defaultLimits.burst,
  };
}

export function readWorkspaceConfig(
  envFile: string,
  configFile: string,
  processEnvironment: NodeJS.ProcessEnv = process.env,
): AppConfig {
  const parsed = fileSchema.safeParse(readYaml(configFile));
  if (!parsed.success) {
    const fields = [...new Set(parsed.error.issues.map((issue) => issue.path.join('.') || 'configuration'))].sort();
    throw new ConfigurationError(fields, configFile);
  }
  const environment = loadEnvironment(envFile, processEnvironment);
  const profiles: Record<string, ConnectionProfile> = {};
  for (const [name, profile] of Object.entries(parsed.data.connections)) {
    const token = environment[profile.tokenEnv]?.trim() ?? '';
    const limits = resolvedLimits(profile.limits);
    if (profile.type === 'yandex-wiki') {
      profiles[name] = {
        name,
        type: profile.type,
        apiUrl: withoutTrailingSlash(profile.apiUrl),
        webUrl: withoutTrailingSlash(profile.webUrl),
        authType: profile.authType,
        organization: profile.organization,
        tokenEnv: profile.tokenEnv,
        token,
        limits,
      };
    } else {
      const email = profile.emailEnv ? environment[profile.emailEnv]?.trim() : undefined;
      profiles[name] = {
        name,
        type: profile.type,
        deployment: profile.deployment,
        baseUrl: withoutTrailingSlash(profile.baseUrl),
        authType: profile.authType,
        tokenEnv: profile.tokenEnv,
        token,
        limits,
        ...(profile.emailEnv ? {emailEnv: profile.emailEnv} : {}),
        ...(email ? {email} : {}),
      };
    }
  }
  const timeoutOverride = Number(environment.HTTP_TIMEOUT_MS);
  const concurrencyOverride = Number(environment.MIGRATION_CONCURRENCY);
  return {
    schemaVersion: 2,
    profiles,
    timeoutMs: Number.isInteger(timeoutOverride) && timeoutOverride >= 1_000 ? timeoutOverride : parsed.data.defaults.timeoutMs ?? 30_000,
    concurrency: Number.isInteger(concurrencyOverride) && concurrencyOverride >= 1 ? concurrencyOverride : parsed.data.defaults.concurrency ?? 4,
    envFile,
    configFile,
  };
}

/** Validate only the profiles an operation will actually use. */
export function validateProfileSecrets(config: AppConfig, profiles: ConnectionProfile[]): void {
  const missing = profiles.flatMap((profile) => [
    ...(!profile.token ? [profile.tokenEnv] : []),
    ...(profile.type === 'confluence' && profile.deployment === 'cloud' && !profile.email
      ? [profile.emailEnv ?? 'emailEnv']
      : []),
  ]);
  if (missing.length > 0) throw new ConfigurationError([...new Set(missing)].sort(), config.envFile);
}

export function secretValues(config: AppConfig): string[] {
  return Object.values(config.profiles).flatMap((profile) => [
    ...(profile.token ? [profile.token] : []),
    ...(profile.type === 'confluence' && profile.email ? [profile.email] : []),
  ]);
}
