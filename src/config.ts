import {readFileSync} from 'node:fs';
import {parse as parseYaml} from 'yaml';
import {z} from 'zod';

const limitsSchema = z.object({
  readConcurrency: z.number().int().min(1).max(64).default(4),
  writeConcurrency: z.number().int().min(1).max(32).default(2),
  downloadConcurrency: z.number().int().min(1).max(32).default(2),
  uploadConcurrency: z.number().int().min(1).max(32).default(2),
  requestsPerSecond: z.number().int().min(1).max(1_000).default(8),
  burst: z.number().int().min(1).max(1_000).default(8),
}).strict().partial().default({});

const profileBaseShape = {
  token: z.string().trim().default(''),
  limits: limitsSchema,
};

const yandexProfileSchema = z.object({
  ...profileBaseShape,
  type: z.literal('yandex-wiki'),
  apiUrl: z.url(),
  webUrl: z.url(),
  authType: z.enum(['oauth', 'iam']).default('oauth'),
  organization: z.object({
    type: z.enum(['yandex360', 'cloud']).default('yandex360'),
    id: z.string().trim().min(1),
  }).strict(),
}).strict();

const confluenceProfileSchema = z.object({
  ...profileBaseShape,
  type: z.literal('confluence'),
  deployment: z.enum(['data-center', 'cloud']),
  baseUrl: z.url(),
  authType: z.enum(['pat', 'api-token']),
  email: z.string().trim().optional(),
}).strict().superRefine((profile, context) => {
  if (profile.deployment === 'data-center' && profile.authType !== 'pat') {
    context.addIssue({code: 'custom', path: ['authType'], message: 'Data Center requires pat'});
  }
  if (profile.deployment === 'cloud' && profile.authType !== 'api-token') {
    context.addIssue({code: 'custom', path: ['authType'], message: 'Cloud requires api-token'});
  }
});

const fileSchema = z.object({
  defaults: z.object({
    timeoutMs: z.number().int().min(1_000).max(300_000).default(30_000),
    concurrency: z.number().int().min(1).max(64).default(4),
  }).strict().partial().default({}),
  connections: z.record(z.string().regex(/^[a-z0-9][a-z0-9._-]*$/), z.discriminatedUnion('type', [
    yandexProfileSchema,
    confluenceProfileSchema,
  ])).refine((connections) => Object.keys(connections).length > 0, 'at least one connection is required'),
}).strict();

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
  email?: string;
}

export type ConnectionProfile = YandexConnectionProfile | ConfluenceConnectionProfile;

export interface AppConfig {
  profiles: Record<string, ConnectionProfile>;
  timeoutMs: number;
  concurrency: number;
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

function readYaml(filename: string): unknown {
  try {
    return parseYaml(readFileSync(filename, 'utf8'));
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') throw new ConfigurationError(['ywtc.config.yaml'], filename);
    throw new Error(`Cannot parse workspace configuration: ${filename}`, {cause: error});
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

function issueFields(issue: z.core.$ZodIssue): string[] {
  if (issue.code === 'unrecognized_keys') {
    return issue.keys.map((key) => [...issue.path, key].map(String).join('.'));
  }
  return [issue.path.map(String).join('.') || 'configuration'];
}

export function parseWorkspaceConfig(value: unknown, configFile: string): AppConfig {
  const parsed = fileSchema.safeParse(value);
  if (!parsed.success) {
    const fields = [...new Set(parsed.error.issues.flatMap(issueFields))].sort();
    throw new ConfigurationError(fields, configFile);
  }
  const profiles: Record<string, ConnectionProfile> = {};
  for (const [name, profile] of Object.entries(parsed.data.connections)) {
    const limits = resolvedLimits(profile.limits);
    if (profile.type === 'yandex-wiki') {
      profiles[name] = {
        name,
        type: profile.type,
        apiUrl: withoutTrailingSlash(profile.apiUrl),
        webUrl: withoutTrailingSlash(profile.webUrl),
        authType: profile.authType,
        organization: profile.organization,
        token: profile.token,
        limits,
      };
    } else {
      profiles[name] = {
        name,
        type: profile.type,
        deployment: profile.deployment,
        baseUrl: withoutTrailingSlash(profile.baseUrl),
        authType: profile.authType,
        token: profile.token,
        limits,
        ...(profile.email !== undefined ? {email: profile.email} : {}),
      };
    }
  }
  return {
    profiles,
    timeoutMs: parsed.data.defaults.timeoutMs ?? 30_000,
    concurrency: parsed.data.defaults.concurrency ?? 4,
    configFile,
  };
}

export function parseWorkspaceConfigYaml(source: string, configFile: string): AppConfig {
  try {
    return parseWorkspaceConfig(parseYaml(source), configFile);
  } catch (error) {
    if (error instanceof ConfigurationError) throw error;
    throw new Error(`Cannot parse workspace configuration: ${configFile}`, {cause: error});
  }
}

export function readWorkspaceConfig(configFile: string): AppConfig {
  return parseWorkspaceConfig(readYaml(configFile), configFile);
}

/** Validate only the profiles an operation will actually use. */
export function validateProfileSecrets(config: AppConfig, profiles: ConnectionProfile[]): void {
  const missing = profiles.flatMap((profile) => [
    ...(!profile.token ? [`connections.${profile.name}.token`] : []),
    ...(profile.type === 'confluence' && profile.deployment === 'cloud' && !profile.email
      ? [`connections.${profile.name}.email`]
      : []),
  ]);
  if (missing.length > 0) throw new ConfigurationError([...new Set(missing)].sort(), config.configFile);
}

export function secretValues(config: AppConfig): string[] {
  return Object.values(config.profiles).flatMap((profile) => [
    ...(profile.token ? [profile.token] : []),
    ...(profile.type === 'confluence' && profile.email ? [profile.email] : []),
  ]);
}
