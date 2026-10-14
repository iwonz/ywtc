import {config as loadDotEnv} from 'dotenv';
import {z} from 'zod';

const environmentSchema = z.object({
  YANDEX_WIKI_TOKEN: z.string().trim().min(1),
  YANDEX_WIKI_AUTH_TYPE: z.enum(['oauth', 'iam']).default('oauth'),
  YANDEX_WIKI_ORG_ID: z.string().trim().min(1),
  YANDEX_WIKI_ORG_TYPE: z.enum(['yandex360', 'cloud']).default('yandex360'),
  YANDEX_WIKI_API_URL: z.url().default('https://api.wiki.yandex.net/v1'),
  YANDEX_WIKI_WEB_URL: z.url().default('https://wiki.yandex.ru'),
  CONFLUENCE_BASE_URL: z.url(),
  CONFLUENCE_TOKEN: z.string().trim().min(1),
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
});

export interface NetworkLimits {
  yandex: {
    apiConcurrency: number;
    downloadConcurrency: number;
    requestsPerSecond: number;
    burst: number;
  };
  confluence: {
    readConcurrency: number;
    writeConcurrency: number;
    uploadConcurrency: number;
    requestsPerSecond: number;
    burst: number;
  };
}

export interface AppConfig {
  yandex: {
    token: string;
    authType: 'oauth' | 'iam';
    orgId: string;
    orgType: 'yandex360' | 'cloud';
    apiUrl: string;
    webUrl: string;
  };
  confluence: {
    baseUrl: string;
    token: string;
  };
  timeoutMs: number;
  concurrency: number;
  networkLimits: NetworkLimits;
}

function withoutTrailingSlash(value: string): string {
  return value.replace(/\/+$/, '');
}

export function readConfig(environment: NodeJS.ProcessEnv = process.env): AppConfig {
  loadDotEnv({quiet: true});
  const parsed = environmentSchema.safeParse(environment);

  if (!parsed.success) {
    const fields = parsed.error.issues.map((issue) => issue.path.join('.') || 'environment').join(', ');
    throw new Error(`Invalid or missing environment configuration: ${fields}`);
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
      baseUrl: withoutTrailingSlash(parsed.data.CONFLUENCE_BASE_URL),
      token: parsed.data.CONFLUENCE_TOKEN,
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

export function secretValues(config: AppConfig): string[] {
  return [config.yandex.token, config.confluence.token];
}
