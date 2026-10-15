import path from 'node:path';
import type {AppConfig, ConnectionProfile} from './config.js';
import type {ExportFormat} from './domain.js';

export interface RemoteLocator {
  type: 'remote';
  value: string;
  profile: ConnectionProfile;
}

export interface DirectoryLocator {
  type: 'directory';
  path: string;
  format: ExportFormat;
}

export type ResolvedLocator = RemoteLocator | DirectoryLocator;

function normalizedBase(profile: ConnectionProfile): URL {
  return new URL(profile.type === 'yandex-wiki' ? profile.webUrl : profile.baseUrl);
}

function normalizedProfileUrl(profile: ConnectionProfile): URL {
  const url = normalizedBase(profile);
  url.hash = '';
  url.search = '';
  url.pathname = url.pathname.replace(/\/+$/, '') || '/';
  if (profile.type === 'confluence' && profile.deployment === 'cloud') {
    url.pathname = url.pathname.replace(/\/wiki$/, '') || '/';
  }
  return url;
}

function isAbsoluteUrl(value: string): boolean {
  try {
    const parsed = new URL(value);
    return parsed.protocol === 'http:' || parsed.protocol === 'https:';
  } catch {
    return false;
  }
}

function urlMatchesProfile(value: string, profile: ConnectionProfile): boolean {
  const candidate = new URL(value);
  const base = normalizedBase(profile);
  if (candidate.origin !== base.origin) return false;
  const basePath = base.pathname.replace(/\/+$/, '');
  return !basePath || candidate.pathname === basePath || candidate.pathname.startsWith(`${basePath}/`);
}

export function selectRemoteProfile(
  config: AppConfig,
  locator: string,
  requestedProfile: string | undefined,
  role: 'source' | 'destination',
): ConnectionProfile {
  if (requestedProfile) {
    const profile = config.profiles[requestedProfile];
    if (!profile) throw new Error(`Unknown --${role}-profile "${requestedProfile}". Available profiles: ${Object.keys(config.profiles).sort().join(', ') || 'none'}.`);
    if (isAbsoluteUrl(locator) && !urlMatchesProfile(locator, profile)) {
      throw new Error(`${role} URL does not belong to profile "${requestedProfile}" (${normalizedBase(profile).origin}).`);
    }
    return profile;
  }

  const profiles = Object.values(config.profiles);
  if (isAbsoluteUrl(locator)) {
    const matches = profiles
      .filter((profile) => urlMatchesProfile(locator, profile))
      .sort((left, right) => normalizedBase(right).pathname.length - normalizedBase(left).pathname.length);
    if (matches.length === 0) throw new Error(`No configured profile matches ${role} URL. Add its base URL to ${config.configFile} or pass a configured endpoint.`);
    if (matches.length > 1 && normalizedBase(matches[0]!).pathname.length === normalizedBase(matches[1]!).pathname.length) {
      throw new Error(`Multiple profiles match ${role} URL: ${matches.map((profile) => profile.name).join(', ')}. Pass --${role}-profile.`);
    }
    return matches[0]!;
  }

  const suitable = /^\d+$/.test(locator)
    ? profiles
    : profiles.filter((profile) => profile.type === 'yandex-wiki');
  if (suitable.length === 1) return suitable[0]!;
  if (suitable.length === 0) {
    throw new Error(`No configured profile accepts the ${role} shorthand "${locator}". Use an absolute URL or add a Yandex Wiki profile.`);
  }
  throw new Error(`The ${role} locator "${locator}" is shorthand and ${suitable.length} suitable profiles are configured. Pass --${role}-profile (${suitable.map((profile) => profile.name).sort().join(', ')}).`);
}

export function resolveSourceLocator(config: AppConfig, value: string, profile?: string): RemoteLocator {
  return {type: 'remote', value: value.trim(), profile: selectRemoteProfile(config, value.trim(), profile, 'source')};
}

export function resolveDestinationLocator(input: {
  config: AppConfig;
  value: string;
  profile?: string;
  format?: ExportFormat;
  cwd?: string;
}): ResolvedLocator {
  const value = input.value.trim();
  if (input.format) {
    if (input.profile) throw new Error('--destination-profile cannot be combined with a filesystem --format.');
    if (isAbsoluteUrl(value)) throw new Error('--format cannot be used with an HTTP(S) destination. Omit --format for a remote page.');
    return {type: 'directory', path: path.resolve(input.cwd ?? process.cwd(), value), format: input.format};
  }
  return {type: 'remote', value, profile: selectRemoteProfile(input.config, value, input.profile, 'destination')};
}

export function profileBaseUrl(profile: ConnectionProfile): string {
  return normalizedProfileUrl(profile).toString().replace(/\/$/, '');
}

export function sameRemoteInstance(left: ConnectionProfile, right: ConnectionProfile): boolean {
  return left.type === right.type && profileBaseUrl(left) === profileBaseUrl(right);
}
