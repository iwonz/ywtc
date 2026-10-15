import {execFile} from 'node:child_process';
import {createWriteStream} from 'node:fs';
import {mkdir, rename, unlink} from 'node:fs/promises';
import {dirname} from 'node:path';
import {Readable} from 'node:stream';
import {pipeline} from 'node:stream/promises';
import type {ReadableStream as NodeReadableStream} from 'node:stream/web';
import {promisify} from 'node:util';

const execFileAsync = promisify(execFile);

export const REGISTRY_HANDOFF_ATTEMPTS = 18;
const SHORT_RETRY_DELAY_MS = 5_000;
const LONG_RETRY_DELAY_MS = 10_000;
const SHORT_RETRY_ATTEMPTS = 5;
const DOWNLOAD_TIMEOUT_MS = 30_000;

export interface RegistryArtifact {
  version: string;
  tarballUrl: string;
}

type FetchLike = (input: string | URL | Request, init?: RequestInit) => Promise<Response>;

export interface RegistryHandoffOptions {
  packageName: string;
  version: string;
  archivePath: string;
  attempts?: number;
  queryMetadata?: () => Promise<string>;
  download?: (url: string, archivePath: string) => Promise<void>;
  sleep?: (milliseconds: number) => Promise<void>;
  log?: (message: string) => void;
  warn?: (message: string) => void;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function tarballFromEntry(entry: Record<string, unknown>): unknown {
  if (entry['dist.tarball'] !== undefined) return entry['dist.tarball'];
  return isRecord(entry.dist) ? entry.dist.tarball : undefined;
}

export function parseRegistryMetadata(raw: string, expectedVersion: string): RegistryArtifact {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error('npm registry metadata was not valid JSON');
  }

  const entries = Array.isArray(parsed) ? parsed : [parsed];
  const entry = entries.find(
    (candidate): candidate is Record<string, unknown> => isRecord(candidate) && candidate.version === expectedVersion,
  );
  if (!entry) {
    throw new Error(`npm registry metadata did not contain exact version ${expectedVersion}`);
  }

  const tarballValue = tarballFromEntry(entry);
  if (typeof tarballValue !== 'string' || tarballValue.length === 0) {
    throw new Error(`npm registry metadata for ${expectedVersion} did not contain a tarball URL`);
  }

  let tarballUrl: URL;
  try {
    tarballUrl = new URL(tarballValue);
  } catch {
    throw new Error(`npm registry tarball URL for ${expectedVersion} was invalid`);
  }
  if (tarballUrl.protocol !== 'https:') {
    throw new Error(`npm registry tarball URL for ${expectedVersion} must use HTTPS`);
  }

  return {version: expectedVersion, tarballUrl: tarballUrl.href};
}

export function registryRetryDelayMs(failedAttempt: number): number {
  return failedAttempt <= SHORT_RETRY_ATTEMPTS ? SHORT_RETRY_DELAY_MS : LONG_RETRY_DELAY_MS;
}

async function queryNpmMetadata(packageName: string, version: string): Promise<string> {
  const {stdout} = await execFileAsync(
    'npm',
    ['view', `${packageName}@${version}`, 'version', 'dist.tarball', '--json'],
    {encoding: 'utf8', maxBuffer: 1024 * 1024},
  );
  return stdout;
}

export async function downloadRegistryTarball(
  url: string,
  archivePath: string,
  fetchImpl: FetchLike = fetch,
): Promise<void> {
  await mkdir(dirname(archivePath), {recursive: true});
  const partialPath = `${archivePath}.part-${process.pid}`;
  await unlink(partialPath).catch(() => undefined);

  try {
    const response = await fetchImpl(url, {
      redirect: 'follow',
      signal: AbortSignal.timeout(DOWNLOAD_TIMEOUT_MS),
    });
    if (!response.ok) {
      throw new Error(`registry tarball download returned HTTP ${response.status}`);
    }
    if (!response.body) {
      throw new Error('registry tarball download returned an empty body');
    }
    await pipeline(
      Readable.fromWeb(response.body as unknown as NodeReadableStream<Uint8Array>),
      createWriteStream(partialPath, {flags: 'wx'}),
    );
    await rename(partialPath, archivePath);
  } catch (error) {
    await unlink(partialPath).catch(() => undefined);
    throw error;
  }
}

function defaultSleep(milliseconds: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

function conciseError(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  const normalized = message.replaceAll(/\s+/g, ' ').trim();
  return normalized.length > 300 ? `${normalized.slice(0, 297)}...` : normalized;
}

export async function waitForRegistryArtifact(options: RegistryHandoffOptions): Promise<RegistryArtifact> {
  const attempts = options.attempts ?? REGISTRY_HANDOFF_ATTEMPTS;
  if (!Number.isInteger(attempts) || attempts < 1) {
    throw new Error('Registry handoff attempts must be a positive integer');
  }
  if (!options.packageName || !options.version || !options.archivePath) {
    throw new Error('Registry handoff requires packageName, version, and archivePath');
  }

  const queryMetadata = options.queryMetadata ?? (() => queryNpmMetadata(options.packageName, options.version));
  const download = options.download ?? downloadRegistryTarball;
  const sleep = options.sleep ?? defaultSleep;
  const log = options.log ?? ((message: string) => console.error(message));
  const warn = options.warn ?? ((message: string) => console.error(`::warning::${message}`));
  let lastError = 'unknown registry error';

  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    log(`Resolving ${options.packageName}@${options.version} from npm registry (attempt ${attempt}/${attempts}).`);
    try {
      const artifact = parseRegistryMetadata(await queryMetadata(), options.version);
      await download(artifact.tarballUrl, options.archivePath);
      log(`Resolved ${options.packageName}@${options.version} and downloaded its registry tarball.`);
      return artifact;
    } catch (error) {
      lastError = conciseError(error);
      if (attempt === attempts) break;
      const delayMs = registryRetryDelayMs(attempt);
      warn(
        `${options.packageName}@${options.version} is not fully available yet: ${lastError}. Retrying in ${delayMs / 1_000}s.`,
      );
      await sleep(delayMs);
    }
  }

  const releaseTag = `v${options.version}`;
  throw new Error(
    `npm registry did not expose a downloadable ${options.packageName}@${options.version} artifact after ${attempts} attempts. ` +
      `Last error: ${lastError}. Recover with: gh workflow run release.yml --repo iwonz/ywtc --ref master -f release_tag=${releaseTag}`,
  );
}

if (process.argv[1]?.endsWith('npm-registry-handoff.ts')) {
  const [packageName, version, archivePath] = process.argv.slice(2);
  if (!packageName || !version || !archivePath) {
    console.error('Usage: npm-registry-handoff.ts <package-name> <version> <archive-path>');
    process.exitCode = 2;
  } else {
    try {
      const artifact = await waitForRegistryArtifact({packageName, version, archivePath});
      process.stdout.write(`${artifact.tarballUrl}\n`);
    } catch (error) {
      console.error(`::error::${conciseError(error)}`);
      process.exitCode = 1;
    }
  }
}
