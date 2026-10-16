import {createConfluenceClient} from './clients/confluence-factory.js';
import {ConfluenceResponseError} from './clients/confluence-response.js';
import {YandexWikiClient} from './clients/yandex-wiki.js';
import {
  type AppConfig,
  type ConnectionProfile,
  type ConfluenceConnectionProfile,
  secretValues,
  validateProfileSecrets,
  type YandexConnectionProfile,
} from './config.js';
import {HttpRequestError} from './http.js';
import {redact} from './logger.js';

export type ConnectionFailureKind =
  | 'authentication'
  | 'forbidden'
  | 'not-found'
  | 'rate-limit'
  | 'server'
  | 'timeout'
  | 'dns'
  | 'tls'
  | 'unexpected';

export interface ConnectionVerification {
  profile: string;
  provider: ConnectionProfile['type'];
  product: string;
  version?: string;
}

export class ConnectionVerificationError extends Error {
  constructor(
    public readonly profile: string,
    public readonly provider: ConnectionProfile['type'],
    public readonly kind: ConnectionFailureKind,
    message: string,
  ) {
    super(message);
    this.name = 'ConnectionVerificationError';
  }
}

export function classifyConnectionFailure(error: unknown): ConnectionFailureKind {
  if (error instanceof ConfluenceResponseError) {
    return error.kind === 'service-unavailable' ? 'server' : 'unexpected';
  }
  if (error instanceof HttpRequestError) {
    if (error.status === 401) return 'authentication';
    if (error.status === 403) return 'forbidden';
    if (error.status === 404) return 'not-found';
    if (error.status === 429) return 'rate-limit';
    if ((error.status ?? 0) >= 500) return 'server';
    if (['ECONNABORTED', 'ETIMEDOUT'].includes(error.code ?? '')) return 'timeout';
    if (['ENOTFOUND', 'EAI_AGAIN', 'ECONNREFUSED'].includes(error.code ?? '')) return 'dns';
    if ([
      'CERT_HAS_EXPIRED',
      'DEPTH_ZERO_SELF_SIGNED_CERT',
      'ERR_TLS_CERT_ALTNAME_INVALID',
      'SELF_SIGNED_CERT_IN_CHAIN',
      'UNABLE_TO_VERIFY_LEAF_SIGNATURE',
    ].includes(error.code ?? '')) return 'tls';
  }
  return 'unexpected';
}

function guidance(kind: ConnectionFailureKind): string {
  switch (kind) {
    case 'authentication': return 'authentication rejected; check the token and authentication type';
    case 'forbidden': return 'access denied; check the organization ID, API access, and account permissions';
    case 'not-found': return 'API route not found; check the base URL and deployment type';
    case 'rate-limit': return 'rate limited after retries; wait or lower the configured request limits';
    case 'server': return 'provider API failed after retries; retry later or inspect the server';
    case 'timeout': return 'connection timed out; check the URL, network, VPN, and timeout setting';
    case 'dns': return 'host could not be reached; check DNS, URL, proxy, and network access';
    case 'tls': return 'TLS verification failed; install the trusted CA through NODE_EXTRA_CA_CERTS';
    case 'unexpected': return 'connection verification failed; check the profile values and provider availability';
  }
}

function verificationError(config: AppConfig, profile: ConnectionProfile, error: unknown): ConnectionVerificationError {
  const kind = classifyConnectionFailure(error);
  const detail = redact(error, secretValues(config));
  return new ConnectionVerificationError(
    profile.name,
    profile.type,
    kind,
    `${profile.name}: ${guidance(kind)}${detail ? ` (${detail})` : ''}`,
  );
}

async function verifyYandex(config: AppConfig, profile: YandexConnectionProfile): Promise<ConnectionVerification> {
  const client = new YandexWikiClient(profile, config.timeoutMs, profile.limits);
  await client.getCurrentUser();
  return {profile: profile.name, provider: profile.type, product: 'Yandex Wiki Public API v1'};
}

async function verifyConfluence(config: AppConfig, profile: ConfluenceConnectionProfile): Promise<ConnectionVerification> {
  const client = createConfluenceClient(profile, config.timeoutMs);
  const platform = await client.preflight?.();
  await client.getCurrentUser();
  return {
    profile: profile.name,
    provider: profile.type,
    product: platform?.product ?? 'Confluence',
    ...(platform?.version ? {version: platform.version} : {}),
  };
}

export async function verifyConnection(config: AppConfig, profile: ConnectionProfile): Promise<ConnectionVerification> {
  validateProfileSecrets(config, [profile]);
  try {
    return profile.type === 'yandex-wiki'
      ? await verifyYandex(config, profile)
      : await verifyConfluence(config, profile);
  } catch (error) {
    if (error instanceof ConnectionVerificationError) throw error;
    throw verificationError(config, profile, error);
  }
}

export async function verifyConnections(
  config: AppConfig,
  yandex: YandexConnectionProfile,
  confluence: ConfluenceConnectionProfile,
): Promise<[ConnectionVerification, ConnectionVerification]> {
  return Promise.all([verifyConnection(config, yandex), verifyConnection(config, confluence)]);
}
