import {readFileSync} from 'node:fs';
import {parse as parseDotEnv} from 'dotenv';
import {z} from 'zod';

const environmentSchema = z.object({
  YANDEX_WIKI_TOKEN: z.string().trim().min(1),
  YANDEX_WIKI_AUTH_TYPE: z.enum(['oauth', 'iam']).default('oauth'),
  YANDEX_WIKI_ORG_ID: z.string().trim().min(1),
  YANDEX_WIKI_ORG_TYPE: z.enum(['yandex360', 'cloud']).default('yandex360'),
  YANDEX_WIKI_API_URL: z.url().default('https://api.wiki.yandex.net/v1'),
  YANDEX_WIKI_WEB_URL: z.url().default('https://wiki.yandex.ru'),
  CONFLUENCE_DEPLOYMENT: z.enum(['data-center', 'cloud']),
  CONFLUENCE_AUTH_TYPE: z.enum(['pat', 'api-token']),
  CONFLUENCE_BASE_URL: z.url(),
  CONFLUENCE_TOKEN: z.string().trim().min(1),
  CONFLUENCE_EMAIL: z.string().trim().email().optional().or(z.literal('')),
  HTTP_TIMEOUT_MS: z.coerce.number().int().min(1_000).max(300_000).default(30_000),
  MIGRATION_CONCURRENCY: z.coerce.number().int().min(1).max(32).default(4),
  YANDEX_API_CONCURRENCY: z.coerce.number().int().min(1).max(32).default(4),
  YANDEX_DOWNLOAD_CONCURRENCY: z.coerce.number().int().min(1).max(16).default(2),
  YANDEX_API_RPS: z.coerce.number().int().min(1).max(1_000).default(8),
  YANDEX_API_BURST: z.coerce.number().int().min(1).max(1_000).default(8),
  CONFLUENCE_READ_CONCURRENCY: z.coerce.number().int().min(1).max(32).default(4),
  CONFLUENCE_WRITE_CONCURRENCY: z.coerce.number().int().min(1).max(16).default(2),
  CONFLUENCE_UPLOAD_CONCURRENCY: z.coerce.number().int().min(1).max(16).default(2),
  CONFLUENCE_API_RPS: z.coerce.number().int().min(1).max(1_000).default(8),
  CONFLUENCE_API_BURST: z.coerce.number().int().min(1).max(1_000).default(10),
}).superRefine((value, context) => {
  if (value.CONFLUENCE_DEPLOYMENT === 'data-center' && value.CONFLUENCE_AUTH_TYPE !== 'pat') {
    context.addIssue({code: 'custom', path: ['CONFLUENCE_AUTH_TYPE'], message: 'Data Center requires pat'});
  }
  if (value.CONFLUENCE_DEPLOYMENT === 'cloud' && value.CONFLUENCE_AUTH_TYPE !== 'api-token') {
    context.addIssue({code: 'custom', path: ['CONFLUENCE_AUTH_TYPE'], message: 'Cloud requires api-token'});
  }
  if (value.CONFLUENCE_DEPLOYMENT === 'cloud' && !value.CONFLUENCE_EMAIL) {
    context.addIssue({code: 'custom', path: ['CONFLUENCE_EMAIL'], message: 'Cloud API token requires account email'});
  }
});

export interface NetworkLimits {
  yandex: {apiConcurrency: number; downloadConcurrency: number; requestsPerSecond: number; burst: number};
  confluence: {readConcurrency: number; writeConcurrency: number; uploadConcurrency: number; requestsPerSecond: number; burst: number};
}

export interface AppConfig {
  yandex: {token: string; authType: 'oauth' | 'iam'; orgId: string; orgType: 'yandex360' | 'cloud'; apiUrl: string; webUrl: string};
  confluence: {deployment: 'data-center' | 'cloud'; authType: 'pat' | 'api-token'; baseUrl: string; token: string; email?: string};
  timeoutMs: number;
  concurrency: number;
  networkLimits: NetworkLimits;
}

export class ConfigurationError extends Error {
  constructor(public readonly fields: string[], public readonly envFile?: string) {
    const location = envFile ? ` in ${envFile}` : '';
    super(`Invalid or missing configuration${location}: ${fields.join(', ')}. Run "ywtc init" and fill the listed values.`);
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
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw new Error(`Cannot read workspace configuration: ${envFile}`, {cause: error});
  }
  return {...fileEnvironment, ...processEnvironment};
}

export function readConfig(environment: NodeJS.ProcessEnv = process.env, envFile?: string): AppConfig {
  const parsed = environmentSchema.safeParse(environment);
  if (!parsed.success) {
    const fields = [...new Set(parsed.error.issues.map((issue) => issue.path.join('.') || 'environment'))].sort();
    throw new ConfigurationError(fields, envFile);
  }
  return {
    yandex: {
      token: parsed.data.YANDEX_WIKI_TOKEN,
      authType: parsed.data.YANDEX_WIKI_AUTH_TYPE,
      orgId: parsed.data.YANDEX_WIKI_ORG_ID,
      orgType: parsed.data.YANDEX_WIKI_ORG_TYPE,
      apiUrl: withoutTrailingSlash(parsed.data.YANDEX_WIKI_API_URL),
      webUrl: withoutTrailingSlash(parsed.data.YANDEX_WIKI_WEB_URL),
    },
    confluence: {
      deployment: parsed.data.CONFLUENCE_DEPLOYMENT,
      authType: parsed.data.CONFLUENCE_AUTH_TYPE,
      baseUrl: withoutTrailingSlash(parsed.data.CONFLUENCE_BASE_URL),
      token: parsed.data.CONFLUENCE_TOKEN,
      ...(parsed.data.CONFLUENCE_EMAIL ? {email: parsed.data.CONFLUENCE_EMAIL} : {}),
    },
    timeoutMs: parsed.data.HTTP_TIMEOUT_MS,
    concurrency: parsed.data.MIGRATION_CONCURRENCY,
    networkLimits: {
      yandex: {
        apiConcurrency: parsed.data.YANDEX_API_CONCURRENCY,
        downloadConcurrency: parsed.data.YANDEX_DOWNLOAD_CONCURRENCY,
        requestsPerSecond: parsed.data.YANDEX_API_RPS,
        burst: parsed.data.YANDEX_API_BURST,
      },
      confluence: {
        readConcurrency: parsed.data.CONFLUENCE_READ_CONCURRENCY,
        writeConcurrency: parsed.data.CONFLUENCE_WRITE_CONCURRENCY,
        uploadConcurrency: parsed.data.CONFLUENCE_UPLOAD_CONCURRENCY,
        requestsPerSecond: parsed.data.CONFLUENCE_API_RPS,
        burst: parsed.data.CONFLUENCE_API_BURST,
      },
    },
  };
}

export function readWorkspaceConfig(envFile: string, environment: NodeJS.ProcessEnv = process.env): AppConfig {
  return readConfig(loadEnvironment(envFile, environment), envFile);
}

export function secretValues(config: AppConfig): string[] {
  return [config.yandex.token, config.confluence.token];
}
