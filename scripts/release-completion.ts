import {createHash} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import {pathToFileURL} from 'node:url';
import {validateReleaseTag} from './release-validation.js';

export interface ReleaseCompletionEvidence {
  tag: string;
  local: {
    packageVersion: string;
    lockfileVersion: string;
    lockfileRootVersion: string;
    manifestVersion: string;
    changelog: string;
    formula: string;
  };
  github: {
    tagName: string;
    targetCommitish: string;
    draft: boolean;
    prerelease: boolean;
    body: string;
    assets: Array<{name: string; state: string; digest?: string}>;
  };
  npm: {
    version: string;
    tarballUrl: string;
    integrity: string;
  };
  tarballSha256: string;
  checksumText: string;
}

export interface VerifiedReleaseCompletion {
  tag: string;
  version: string;
  tarballUrl: string;
  sha256: string;
}

interface LoadOptions {
  root?: string;
  fetcher?: typeof fetch;
  githubToken?: string;
}

function formulaValue(formula: string, field: 'url' | 'sha256'): string {
  const match = formula.match(new RegExp(`^\\s*${field}\\s+"([^"]+)"\\s*$`, 'm'));
  if (!match?.[1]) throw new Error(`Homebrew formula is missing ${field}.`);
  return match[1];
}

function checksumMatches(checksumText: string, sha256: string, archiveName: string): boolean {
  return checksumText.split(/\r?\n/u).some((line) => {
    const match = /^([0-9a-f]{64})[ \t]+\*?(.+?)[ \t]*$/iu.exec(line);
    const filename = match?.[2]?.split(/[\\/]/u).at(-1);
    return match?.[1]?.toLowerCase() === sha256 && filename === archiveName;
  });
}

function requiredAsset(
  assets: ReleaseCompletionEvidence['github']['assets'],
  name: string,
): ReleaseCompletionEvidence['github']['assets'][number] {
  const asset = assets.find((candidate) => candidate.name === name);
  if (asset?.state !== 'uploaded') throw new Error(`GitHub Release is missing uploaded asset ${name}.`);
  return asset;
}

export function validateReleaseCompletion(evidence: ReleaseCompletionEvidence): VerifiedReleaseCompletion {
  const version = validateReleaseTag(evidence.tag, {
    packageVersion: evidence.local.packageVersion,
    lockfileVersion: evidence.local.lockfileVersion,
    lockfileRootVersion: evidence.local.lockfileRootVersion,
    manifestVersion: evidence.local.manifestVersion,
    changelog: evidence.local.changelog,
  }, []).raw;

  if (evidence.github.tagName !== evidence.tag) {
    throw new Error(`GitHub Release tag "${evidence.github.tagName}" does not match ${evidence.tag}.`);
  }
  if (evidence.github.draft) throw new Error(`GitHub Release ${evidence.tag} is still a draft.`);
  if (evidence.github.prerelease) throw new Error(`GitHub Release ${evidence.tag} is unexpectedly a prerelease.`);
  if (!/^[0-9a-f]{40}$/i.test(evidence.github.targetCommitish)) {
    throw new Error(`GitHub Release ${evidence.tag} does not identify an exact release commit.`);
  }
  if (!evidence.github.body.includes('<!-- ywtc-installation -->')) {
    throw new Error(`GitHub Release ${evidence.tag} is missing verified installation notes.`);
  }

  const archiveName = `iwonz-ywtc-${version}.tgz`;
  const archive = requiredAsset(evidence.github.assets, archiveName);
  requiredAsset(evidence.github.assets, `${archiveName}.sha256`);

  if (evidence.npm.version !== version) {
    throw new Error(`npm package version "${evidence.npm.version}" does not match expected ${version}.`);
  }
  if (!evidence.npm.integrity.trim()) throw new Error(`npm package ${version} is missing dist.integrity.`);
  const expectedTarballUrl = `https://registry.npmjs.org/@iwonz/ywtc/-/ywtc-${version}.tgz`;
  if (evidence.npm.tarballUrl !== expectedTarballUrl) {
    throw new Error(`npm tarball URL "${evidence.npm.tarballUrl}" does not match expected ${expectedTarballUrl}.`);
  }

  const sha256 = evidence.tarballSha256.toLowerCase();
  if (!/^[0-9a-f]{64}$/.test(sha256)) throw new Error('npm tarball SHA-256 is missing or invalid.');
  if (archive.digest?.toLowerCase() !== `sha256:${sha256}`) {
    throw new Error(`GitHub Release archive digest does not match npm tarball SHA-256 ${sha256}.`);
  }
  if (!checksumMatches(evidence.checksumText, sha256, archiveName)) {
    throw new Error(`GitHub checksum asset does not contain npm tarball SHA-256 ${sha256}.`);
  }

  const formulaUrl = formulaValue(evidence.local.formula, 'url');
  if (formulaUrl !== evidence.npm.tarballUrl) {
    throw new Error(`Homebrew formula URL "${formulaUrl}" does not match npm tarball ${evidence.npm.tarballUrl}.`);
  }
  const formulaSha256 = formulaValue(evidence.local.formula, 'sha256').toLowerCase();
  if (formulaSha256 !== sha256) {
    throw new Error(`Homebrew formula SHA-256 "${formulaSha256}" does not match npm tarball SHA-256 ${sha256}.`);
  }

  return {tag: evidence.tag, version, tarballUrl: evidence.npm.tarballUrl, sha256};
}

function objectValue(value: unknown, source: string): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error(`${source} returned invalid JSON.`);
  return value as Record<string, unknown>;
}

function stringValue(value: unknown, source: string): string {
  if (typeof value !== 'string' || !value.trim()) throw new Error(`${source} is missing a string value.`);
  return value;
}

function booleanValue(value: unknown, source: string): boolean {
  if (typeof value !== 'boolean') throw new Error(`${source} is missing a boolean value.`);
  return value;
}

async function successfulResponse(fetcher: typeof fetch, url: string, init: RequestInit, source: string): Promise<Response> {
  const response = await fetcher(url, init);
  if (!response.ok) throw new Error(`${source} request failed with HTTP ${response.status}.`);
  return response;
}

async function jsonResponse(fetcher: typeof fetch, url: string, init: RequestInit, source: string): Promise<Record<string, unknown>> {
  const response = await successfulResponse(fetcher, url, init, source);
  return objectValue(await response.json(), source);
}

async function readJson(filename: string): Promise<Record<string, unknown>> {
  return objectValue(JSON.parse(await readFile(filename, 'utf8')) as unknown, filename);
}

export async function loadReleaseCompletionEvidence(
  tag: string,
  options: LoadOptions = {},
): Promise<ReleaseCompletionEvidence> {
  const root = options.root ?? process.cwd();
  const fetcher = options.fetcher ?? fetch;
  const version = tag.startsWith('v') ? tag.slice(1) : tag;
  const githubHeaders: Record<string, string> = {
    accept: 'application/vnd.github+json',
    'user-agent': 'ywtc-release-verifier',
    'x-github-api-version': '2022-11-28',
  };
  const token = options.githubToken ?? process.env.GITHUB_TOKEN;
  if (token) githubHeaders.authorization = `Bearer ${token}`;

  const [packageJson, packageLock, manifest, changelog, formula, githubRelease, npmDocument] = await Promise.all([
    readJson(path.join(root, 'package.json')),
    readJson(path.join(root, 'package-lock.json')),
    readJson(path.join(root, '.release-please-manifest.json')),
    readFile(path.join(root, 'CHANGELOG.md'), 'utf8'),
    readFile(path.join(root, 'Formula/ywtc.rb'), 'utf8'),
    jsonResponse(fetcher, `https://api.github.com/repos/iwonz/ywtc/releases/tags/${encodeURIComponent(tag)}`, {headers: githubHeaders}, 'GitHub Release'),
    jsonResponse(fetcher, `https://registry.npmjs.org/@iwonz%2Fywtc/${encodeURIComponent(version)}`, {}, 'npm registry'),
  ]);

  const lockPackages = objectValue(packageLock.packages, 'package-lock.json packages');
  const lockRoot = objectValue(lockPackages[''], 'package-lock.json root package');
  const rawAssets = githubRelease.assets;
  if (!Array.isArray(rawAssets)) throw new Error('GitHub Release assets are missing.');
  const assets = rawAssets.map((value, index) => {
    const asset = objectValue(value, `GitHub Release asset ${index}`);
    return {
      name: stringValue(asset.name, `GitHub Release asset ${index} name`),
      state: stringValue(asset.state, `GitHub Release asset ${index} state`),
      ...(typeof asset.digest === 'string' ? {digest: asset.digest} : {}),
      downloadUrl: stringValue(asset.browser_download_url, `GitHub Release asset ${index} download URL`),
    };
  });
  const checksumName = `iwonz-ywtc-${version}.tgz.sha256`;
  const checksumAsset = assets.find((asset) => asset.name === checksumName);
  if (!checksumAsset) throw new Error(`GitHub Release is missing uploaded asset ${checksumName}.`);

  const npmDist = objectValue(npmDocument.dist, 'npm dist metadata');
  const tarballUrl = stringValue(npmDist.tarball, 'npm dist.tarball');
  const [tarballResponse, checksumResponse] = await Promise.all([
    successfulResponse(fetcher, tarballUrl, {}, 'npm tarball'),
    successfulResponse(fetcher, checksumAsset.downloadUrl, {headers: githubHeaders}, 'GitHub checksum asset'),
  ]);
  const tarball = Buffer.from(await tarballResponse.arrayBuffer());
  const tarballSha256 = createHash('sha256').update(tarball).digest('hex');

  return {
    tag,
    local: {
      packageVersion: stringValue(packageJson.version, 'package.json version'),
      lockfileVersion: stringValue(packageLock.version, 'package-lock.json version'),
      lockfileRootVersion: stringValue(lockRoot.version, 'package-lock.json root version'),
      manifestVersion: stringValue(manifest['.'], '.release-please-manifest.json version'),
      changelog,
      formula,
    },
    github: {
      tagName: stringValue(githubRelease.tag_name, 'GitHub Release tag'),
      targetCommitish: stringValue(githubRelease.target_commitish, 'GitHub Release target commit'),
      draft: booleanValue(githubRelease.draft, 'GitHub Release draft'),
      prerelease: booleanValue(githubRelease.prerelease, 'GitHub Release prerelease'),
      body: typeof githubRelease.body === 'string' ? githubRelease.body : '',
      assets: assets.map(({name, state, digest}) => ({name, state, ...(digest ? {digest} : {})})),
    },
    npm: {
      version: stringValue(npmDocument.version, 'npm package version'),
      tarballUrl,
      integrity: stringValue(npmDist.integrity, 'npm dist.integrity'),
    },
    tarballSha256,
    checksumText: await checksumResponse.text(),
  };
}

async function main(): Promise<void> {
  const tag = process.argv[2]?.trim();
  if (!tag) throw new Error('Usage: npm run release:verify -- vX.Y.Z');
  const verified = validateReleaseCompletion(await loadReleaseCompletionEvidence(tag));
  process.stdout.write(`Release ${verified.tag} is complete across GitHub, npm, and Homebrew (${verified.sha256}).\n`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error: unknown) => {
    process.stderr.write(`Release completion verification failed: ${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  });
}
