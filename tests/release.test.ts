import {readFile} from 'node:fs/promises';
import {describe, expect, it} from 'vitest';
import {
  compareSemanticVersions,
  parseSemanticVersion,
  type ReleaseMetadata,
  validateReleaseTag,
} from '../scripts/release-validation.js';

const metadata: ReleaseMetadata = {
  packageVersion: '1.2.3',
  lockfileVersion: '1.2.3',
  lockfileRootVersion: '1.2.3',
  manifestVersion: '1.2.3',
  changelog: '# Changelog\n\n## [1.2.3] - 2026-10-14\n',
};

describe('release validation', () => {
  it('parses stable, prerelease, and build metadata versions', () => {
    expect(parseSemanticVersion('1.2.3')).toMatchObject({major: 1n, minor: 2n, patch: 3n, prerelease: [], build: []});
    expect(parseSemanticVersion('2.0.0-rc.1+build.5')).toMatchObject({
      prerelease: ['rc', '1'],
      build: ['build', '5'],
    });
  });

  it.each(['1', 'v1.2.3', '01.2.3', '1.02.3', '1.2.03', '1.2.3-01', '1.2.3-', '1.2.3+'])('rejects invalid SemVer %s', (version) => {
    expect(() => parseSemanticVersion(version)).toThrow(/Semantic Versioning|leading zero/);
  });

  it('implements SemVer precedence and ignores build metadata', () => {
    const ordered = ['1.0.0-alpha', '1.0.0-alpha.1', '1.0.0-alpha.beta', '1.0.0-beta', '1.0.0-beta.2', '1.0.0-beta.11', '1.0.0-rc.1', '1.0.0'];
    for (let index = 1; index < ordered.length; index += 1) {
      expect(compareSemanticVersions(parseSemanticVersion(ordered[index]!), parseSemanticVersion(ordered[index - 1]!))).toBe(1);
    }
    expect(compareSemanticVersions(parseSemanticVersion('1.0.0+one'), parseSemanticVersion('1.0.0+two'))).toBe(0);
  });

  it('accepts matching increasing release metadata', () => {
    expect(validateReleaseTag('v1.2.3', metadata, ['v1.2.2', 'not-a-release']).raw).toBe('1.2.3');
  });

  it.each([
    ['packageVersion', '1.2.2', /package\.json/],
    ['lockfileVersion', '1.2.2', /package-lock\.json/],
    ['lockfileRootVersion', '1.2.2', /root package/],
    ['manifestVersion', '1.2.2', /manifest/],
  ] as const)('rejects a mismatched %s', (field, actual, expected) => {
    expect(() => validateReleaseTag('v1.2.3', {...metadata, [field]: actual}, [])).toThrow(expected);
  });

  it('rejects missing changelog entries and non-increasing tags', () => {
    expect(() => validateReleaseTag('v1.2.3', {...metadata, changelog: '# Changelog'}, [])).toThrow(/CHANGELOG/);
    expect(() => validateReleaseTag('v1.2.3', metadata, ['v1.2.4'])).toThrow(/higher SemVer precedence/);
    expect(() => validateReleaseTag('v1.2.3', metadata, ['v1.2.3+rebuilt'])).toThrow(/higher SemVer precedence/);
  });

  it('keeps the workflow least-privileged and release-capable', async () => {
    const workflow = await readFile('.github/workflows/release.yml', 'utf8');
    expect(workflow).toContain('permissions:\n  contents: read');
    expect(workflow).toContain('googleapis/release-please-action@v4');
    expect(workflow).toContain('pull-requests: write');
    expect(workflow).toContain('id-token: write');
    expect(workflow).toContain('npm run check');
    expect(workflow).toContain('npm pack');
    expect(workflow).toContain('npm publish "$ARCHIVE" --access public --provenance');
    expect(workflow).toContain('gh release upload');
    expect(workflow).toContain('brew audit --strict');
    expect(workflow).toContain('chore(homebrew): update formula to v$RELEASE_VERSION');
    expect(workflow).not.toMatch(/NODE_AUTH_TOKEN|NPM_TOKEN/);
  });

  it('publishes a public scoped package with the ywtc binary', async () => {
    const packageJson = JSON.parse(await readFile('package.json', 'utf8')) as Record<string, unknown>;
    expect(packageJson).toMatchObject({
      name: '@iwonz/ywtc',
      license: 'MIT',
      publishConfig: {access: 'public', provenance: true},
      bin: {ywtc: './dist/cli.js'},
    });
    expect(packageJson).not.toHaveProperty('private');
  });

  it('includes all release-note sections while preserving product bump types', async () => {
    const config = JSON.parse(await readFile('release-please-config.json', 'utf8')) as {
      packages: Record<string, {"changelog-sections": Array<{type: string}>}>;
    };
    const types = config.packages['.']?.['changelog-sections'].map((entry) => entry.type);
    expect(types).toEqual(expect.arrayContaining(['feat', 'fix', 'perf', 'revert', 'docs', 'refactor', 'test', 'build', 'ci', 'chore', 'style']));
  });
});
