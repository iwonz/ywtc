import {execFileSync} from 'node:child_process';
import {readFile} from 'node:fs/promises';
import process from 'node:process';
import {validateReleaseTag} from './release-validation.js';

interface PackageJson {
  version?: unknown;
}

interface PackageLock {
  version?: unknown;
  packages?: {'': {version?: unknown}};
}

function requiredVersion(value: unknown, source: string): string {
  if (typeof value !== 'string' || !value) throw new Error(`${source} does not contain a non-empty version.`);
  return value;
}

async function readJson<T>(filename: string): Promise<T> {
  try {
    return JSON.parse(await readFile(filename, 'utf8')) as T;
  } catch (error) {
    throw new Error(`Cannot read valid JSON from ${filename}.`, {cause: error});
  }
}

async function main(): Promise<void> {
  const tag = process.argv[2]?.trim();
  if (!tag) throw new Error('Usage: npm run release:validate -- v1.2.3');

  const [packageJson, packageLock, manifest, changelog] = await Promise.all([
    readJson<PackageJson>('package.json'),
    readJson<PackageLock>('package-lock.json'),
    readJson<Record<string, unknown>>('.release-please-manifest.json'),
    readFile('CHANGELOG.md', 'utf8'),
  ]);
  const priorTags = execFileSync('git', ['tag', '--list', 'v*'], {encoding: 'utf8'})
    .split(/\r?\n/)
    .filter(Boolean);

  const version = validateReleaseTag(tag, {
    packageVersion: requiredVersion(packageJson.version, 'package.json'),
    lockfileVersion: requiredVersion(packageLock.version, 'package-lock.json'),
    lockfileRootVersion: requiredVersion(packageLock.packages?.['']?.version, 'package-lock.json root package'),
    manifestVersion: requiredVersion(manifest['.'], '.release-please-manifest.json'),
    changelog,
  }, priorTags);

  process.stdout.write(`Release tag ${tag} is valid for ywtc ${version.raw}.\n`);
}

main().catch((error: unknown) => {
  process.stderr.write(`Release validation failed: ${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
});
