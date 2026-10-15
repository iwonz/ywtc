import {access, mkdtemp, readFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {describe, expect, it, vi} from 'vitest';
import {
  downloadRegistryTarball,
  parseRegistryMetadata,
  REGISTRY_HANDOFF_ATTEMPTS,
  registryRetryDelayMs,
  waitForRegistryArtifact,
} from '../scripts/npm-registry-handoff.js';

const version = '2.0.3';
const tarballUrl = 'https://registry.npmjs.org/@iwonz/ywtc/-/ywtc-2.0.3.tgz';
const metadata = JSON.stringify([{version, 'dist.tarball': tarballUrl}]);

describe('npm registry handoff', () => {
  it('parses exact-version npm metadata in flat and nested forms', () => {
    expect(parseRegistryMetadata(metadata, version)).toEqual({version, tarballUrl});
    expect(parseRegistryMetadata(JSON.stringify({version, dist: {tarball: tarballUrl}}), version)).toEqual({
      version,
      tarballUrl,
    });
  });

  it.each([
    ['not json', /valid JSON/],
    [JSON.stringify({version: '2.0.2', 'dist.tarball': tarballUrl}), /exact version 2\.0\.3/],
    [JSON.stringify({version}), /tarball URL/],
    [JSON.stringify({version, 'dist.tarball': 'http://registry.example/ywtc.tgz'}), /must use HTTPS/],
  ])('rejects unsafe or mismatched registry metadata', (raw, expected) => {
    expect(() => parseRegistryMetadata(raw, version)).toThrow(expected);
  });

  it('uses bounded two-stage retry delays', () => {
    expect(REGISTRY_HANDOFF_ATTEMPTS).toBe(18);
    expect(registryRetryDelayMs(1)).toBe(5_000);
    expect(registryRetryDelayMs(5)).toBe(5_000);
    expect(registryRetryDelayMs(6)).toBe(10_000);
    expect(registryRetryDelayMs(17)).toBe(10_000);
  });

  it('returns immediately when metadata and tarball are available', async () => {
    const queryMetadata = vi.fn(async () => metadata);
    const download = vi.fn(async () => undefined);
    const sleep = vi.fn(async () => undefined);

    await expect(
      waitForRegistryArtifact({
        packageName: '@iwonz/ywtc',
        version,
        archivePath: '/tmp/ywtc.tgz',
        queryMetadata,
        download,
        sleep,
        log: vi.fn(),
        warn: vi.fn(),
      }),
    ).resolves.toEqual({version, tarballUrl});
    expect(queryMetadata).toHaveBeenCalledOnce();
    expect(download).toHaveBeenCalledWith(tarballUrl, '/tmp/ywtc.tgz');
    expect(sleep).not.toHaveBeenCalled();
  });

  it('retries transient metadata and download failures before succeeding', async () => {
    const queryMetadata = vi
      .fn<() => Promise<string>>()
      .mockRejectedValueOnce(new Error('E404'))
      .mockResolvedValue(metadata);
    const download = vi.fn<(url: string, archivePath: string) => Promise<void>>()
      .mockRejectedValueOnce(new Error('HTTP 404'))
      .mockResolvedValue(undefined);
    const sleep = vi.fn(async () => undefined);
    const warn = vi.fn();

    await expect(
      waitForRegistryArtifact({
        packageName: '@iwonz/ywtc',
        version,
        archivePath: '/tmp/ywtc.tgz',
        queryMetadata,
        download,
        sleep,
        warn,
        log: vi.fn(),
      }),
    ).resolves.toEqual({version, tarballUrl});
    expect(queryMetadata).toHaveBeenCalledTimes(3);
    expect(download).toHaveBeenCalledTimes(2);
    expect(sleep).toHaveBeenNthCalledWith(1, 5_000);
    expect(sleep).toHaveBeenNthCalledWith(2, 5_000);
    expect(warn).toHaveBeenCalledTimes(2);
  });

  it('fails with bounded diagnostics and an exact recovery command', async () => {
    const sleep = vi.fn(async () => undefined);
    const warn = vi.fn();

    await expect(
      waitForRegistryArtifact({
        packageName: '@iwonz/ywtc',
        version,
        archivePath: '/tmp/ywtc.tgz',
        attempts: 3,
        queryMetadata: async () => {
          throw new Error('E404 package not visible');
        },
        download: vi.fn(),
        sleep,
        warn,
        log: vi.fn(),
      }),
    ).rejects.toThrow(
      'after 3 attempts. Last error: E404 package not visible. Recover with: gh workflow run release.yml --repo iwonz/ywtc --ref master -f release_tag=v2.0.3',
    );
    expect(sleep).toHaveBeenCalledTimes(2);
    expect(warn).toHaveBeenCalledTimes(2);
  });

  it('downloads through a partial file and removes it after failure', async () => {
    const directory = await mkdtemp(path.join(tmpdir(), 'ywtc-registry-handoff-'));
    const archivePath = path.join(directory, 'artifact.tgz');
    await downloadRegistryTarball(tarballUrl, archivePath, async () => new Response('archive-bytes'));
    expect(await readFile(archivePath, 'utf8')).toBe('archive-bytes');

    const failedArchive = path.join(directory, 'failed.tgz');
    await expect(
      downloadRegistryTarball(tarballUrl, failedArchive, async () => new Response('missing', {status: 404})),
    ).rejects.toThrow('HTTP 404');
    await expect(access(`${failedArchive}.part-${process.pid}`)).rejects.toThrow();
  });
});
