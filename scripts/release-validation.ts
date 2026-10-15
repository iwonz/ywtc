export interface SemanticVersion {
  raw: string;
  major: bigint;
  minor: bigint;
  patch: bigint;
  prerelease: string[];
  build: string[];
}

export interface ReleaseMetadata {
  packageVersion: string;
  lockfileVersion: string;
  lockfileRootVersion: string;
  manifestVersion: string;
  changelog: string;
}

const SEMVER_PATTERN = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-([0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*))?(?:\+([0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*))?$/;

export function parseSemanticVersion(value: string): SemanticVersion {
  const match = SEMVER_PATTERN.exec(value);
  if (!match) {
    throw new Error(`"${value}" is not a valid Semantic Versioning 2.0.0 version.`);
  }

  const prerelease = match[4]?.split('.') ?? [];
  for (const identifier of prerelease) {
    if (/^\d+$/.test(identifier) && identifier.length > 1 && identifier.startsWith('0')) {
      throw new Error(`"${value}" has a numeric prerelease identifier with a leading zero.`);
    }
  }

  return {
    raw: value,
    major: BigInt(match[1]!),
    minor: BigInt(match[2]!),
    patch: BigInt(match[3]!),
    prerelease,
    build: match[5]?.split('.') ?? [],
  };
}

function compareNumber(left: bigint, right: bigint): number {
  if (left === right) return 0;
  return left > right ? 1 : -1;
}

function comparePrereleaseIdentifier(left: string, right: string): number {
  const leftNumeric = /^\d+$/.test(left);
  const rightNumeric = /^\d+$/.test(right);
  if (leftNumeric && rightNumeric) return compareNumber(BigInt(left), BigInt(right));
  if (leftNumeric !== rightNumeric) return leftNumeric ? -1 : 1;
  return left === right ? 0 : left > right ? 1 : -1;
}

export function compareSemanticVersions(left: SemanticVersion, right: SemanticVersion): number {
  for (const component of ['major', 'minor', 'patch'] as const) {
    const compared = compareNumber(left[component], right[component]);
    if (compared !== 0) return compared;
  }

  if (left.prerelease.length === 0 || right.prerelease.length === 0) {
    if (left.prerelease.length === right.prerelease.length) return 0;
    return left.prerelease.length === 0 ? 1 : -1;
  }

  const length = Math.max(left.prerelease.length, right.prerelease.length);
  for (let index = 0; index < length; index += 1) {
    const leftIdentifier = left.prerelease[index];
    const rightIdentifier = right.prerelease[index];
    if (leftIdentifier === undefined || rightIdentifier === undefined) {
      return leftIdentifier === undefined ? -1 : 1;
    }
    const compared = comparePrereleaseIdentifier(leftIdentifier, rightIdentifier);
    if (compared !== 0) return compared;
  }
  return 0;
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export function validateReleaseTag(
  tag: string,
  metadata: ReleaseMetadata,
  priorTags: string[],
): SemanticVersion {
  if (!tag.startsWith('v')) {
    throw new Error(`Release tag "${tag}" must start with "v", for example v1.2.3.`);
  }
  const version = parseSemanticVersion(tag.slice(1));

  const versionSources: Array<[string, string]> = [
    ['package.json', metadata.packageVersion],
    ['package-lock.json', metadata.lockfileVersion],
    ['package-lock.json root package', metadata.lockfileRootVersion],
    ['.release-please-manifest.json', metadata.manifestVersion],
  ];
  for (const [source, actual] of versionSources) {
    if (actual !== version.raw) {
      throw new Error(`${source} version "${actual}" does not match release tag "${tag}".`);
    }
  }

  const escapedVersion = escapeRegExp(version.raw);
  const isoDate = '\\d{4}-\\d{2}-\\d{2}';
  const changelogHeading = new RegExp(
    `^## \\[${escapedVersion}\\](?: - ${isoDate}|\\([^\\r\\n)]+\\) \\(${isoDate}\\))$`,
    'm',
  );
  if (!changelogHeading.test(metadata.changelog)) {
    throw new Error(
      `CHANGELOG.md must contain a dated "## [${version.raw}](comparison-url) (YYYY-MM-DD)" or "## [${version.raw}] - YYYY-MM-DD" heading.`,
    );
  }

  const previousVersions = priorTags
    .filter((candidate) => candidate !== tag && candidate.startsWith('v'))
    .map((candidate) => {
      try {
        return {tag: candidate, version: parseSemanticVersion(candidate.slice(1))};
      } catch {
        return undefined;
      }
    })
    .filter((candidate): candidate is {tag: string; version: SemanticVersion} => candidate !== undefined);

  const latest = previousVersions.reduce<{tag: string; version: SemanticVersion} | undefined>((current, candidate) => {
    if (!current || compareSemanticVersions(candidate.version, current.version) > 0) return candidate;
    return current;
  }, undefined);
  if (latest && compareSemanticVersions(version, latest.version) <= 0) {
    throw new Error(`Release tag "${tag}" must have higher SemVer precedence than existing tag "${latest.tag}".`);
  }

  return version;
}
