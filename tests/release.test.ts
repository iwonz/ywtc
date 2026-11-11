import {execFile} from 'node:child_process';
import {copyFile, mkdtemp, readFile, rm, writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {promisify} from 'node:util';
import {describe, expect, it} from 'vitest';
import {
  compareSemanticVersions,
  parseSemanticVersion,
  type ReleaseMetadata,
  validateReleaseTag,
} from '../scripts/release-validation.js';

const execFileAsync = promisify(execFile);

const metadata: ReleaseMetadata = {
  packageVersion: '1.2.3',
  lockfileVersion: '1.2.3',
  lockfileRootVersion: '1.2.3',
  manifestVersion: '1.2.3',
  changelog: '# Changelog\n\n## [1.2.3] - 2026-10-14\n',
};

const releaseCompletionModule = '../scripts/release-completion.js';
const releaseSha256 = 'a'.repeat(64);
const completeReleaseEvidence = {
  tag: 'v5.4.7',
  local: {
    packageVersion: '5.4.7',
    lockfileVersion: '5.4.7',
    lockfileRootVersion: '5.4.7',
    manifestVersion: '5.4.7',
    changelog: '# Changelog\n\n## [5.4.7](https://github.com/iwonz/ywtc/compare/v5.4.6...v5.4.7) (2026-11-11)\n',
    formula: `class Ywtc < Formula\n  url "https://registry.npmjs.org/@iwonz/ywtc/-/ywtc-5.4.7.tgz"\n  sha256 "${releaseSha256}"\nend\n`,
  },
  github: {
    tagName: 'v5.4.7',
    targetCommitish: '7'.repeat(40),
    draft: false,
    prerelease: false,
    body: '<!-- ywtc-installation -->\nnpm install -g @iwonz/ywtc@latest',
    assets: [
      {name: 'iwonz-ywtc-5.4.7.tgz', state: 'uploaded', digest: `sha256:${releaseSha256}`},
      {name: 'iwonz-ywtc-5.4.7.tgz.sha256', state: 'uploaded'},
    ],
  },
  npm: {
    version: '5.4.7',
    tarballUrl: 'https://registry.npmjs.org/@iwonz/ywtc/-/ywtc-5.4.7.tgz',
    integrity: 'sha512-example',
  },
  tarballSha256: releaseSha256,
  checksumText: `${releaseSha256}  iwonz-ywtc-5.4.7.tgz\n`,
};

describe('release validation', () => {
  it('accepts one complete release identity across GitHub, npm, and Homebrew', async () => {
    const {validateReleaseCompletion} = await import(releaseCompletionModule);
    expect(validateReleaseCompletion(completeReleaseEvidence)).toEqual({
      tag: 'v5.4.7',
      version: '5.4.7',
      tarballUrl: completeReleaseEvidence.npm.tarballUrl,
      sha256: releaseSha256,
    });
  });

  it('accepts a verified checksum whose filename includes the CI staging path', async () => {
    const {validateReleaseCompletion} = await import(releaseCompletionModule);
    expect(validateReleaseCompletion({
      ...completeReleaseEvidence,
      checksumText: `${releaseSha256}  /ci-staging/ywtc-release/iwonz-ywtc-5.4.7.tgz\n`,
    })).toMatchObject({tag: 'v5.4.7', sha256: releaseSha256});
  });

  it('runs the audited packer entry point outside the repository module boundary', async () => {
    const directory = await mkdtemp(path.join(tmpdir(), 'ywtc-recovery-packer-'));
    const packer = path.join(directory, 'pack-release.ts');
    try {
      await copyFile('scripts/pack-release.ts', packer);
      await writeFile(
        path.join(directory, 'release-package.ts'),
        "export async function packRelease(): Promise<string> { return 'fixture-archive.tgz'; }\n",
      );
      const {stdout} = await execFileAsync(
        process.execPath,
        ['--import', 'tsx', packer, path.join(directory, 'output')],
        {cwd: process.cwd(), encoding: 'utf8'},
      );
      expect(stdout).toBe('fixture-archive.tgz');
    } finally {
      await rm(directory, {recursive: true, force: true});
    }
  });

  it.each([
    ['local package metadata', {local: {...completeReleaseEvidence.local, packageVersion: '5.4.6'}}, /package\.json.*5\.4\.7/i],
    ['GitHub archive asset', {github: {...completeReleaseEvidence.github, assets: completeReleaseEvidence.github.assets.slice(1)}}, /GitHub Release.*iwonz-ywtc-5\.4\.7\.tgz/i],
    ['npm package version', {npm: {...completeReleaseEvidence.npm, version: '5.4.6'}}, /npm.*5\.4\.7/i],
    ['published checksum', {checksumText: `${'b'.repeat(64)}  iwonz-ywtc-5.4.7.tgz\n`}, /checksum.*SHA-256/i],
    ['Homebrew formula checksum', {local: {...completeReleaseEvidence.local, formula: completeReleaseEvidence.local.formula.replace(releaseSha256, 'c'.repeat(64))}}, /Homebrew.*SHA-256/i],
  ])('rejects a mismatched %s', async (_label, override, expected) => {
    const {validateReleaseCompletion} = await import(releaseCompletionModule);
    expect(() => validateReleaseCompletion({...completeReleaseEvidence, ...override})).toThrow(expected as RegExp);
  });

  it('tests supported stable Node majors without a floating prerelease alias', async () => {
    const workflow = await readFile('.github/workflows/release.yml', 'utf8');
    expect(workflow).toContain('node: [24, 26]');
    expect(workflow).not.toMatch(/node:.*\b(?:current|latest|nightly|canary)\b/);
  });
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

  it('accepts the linked changelog heading generated by Release Please', () => {
    const changelog =
      '# Changelog\n\n## [1.2.3](https://github.com/iwonz/ywtc/compare/v1.2.2...v1.2.3) (2026-10-15)\n';
    expect(validateReleaseTag('v1.2.3', {...metadata, changelog}, ['v1.2.2']).raw).toBe('1.2.3');
  });

  it.each([
    '## [1.2.3](https://github.com/iwonz/ywtc/compare/v1.2.2...v1.2.3)',
    '## [1.2.3]() (2026-10-15)',
    '## [1.2.3](https://example.com) 2026-10-15',
    '## [1.2.4](https://example.com) (2026-10-15)',
  ])('rejects malformed or wrong-version Release Please heading %s', (heading) => {
    expect(() => validateReleaseTag('v1.2.3', {...metadata, changelog: `# Changelog\n\n${heading}\n`}, [])).toThrow(
      /CHANGELOG/,
    );
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
    expect(workflow).toContain('actions/checkout@v7');
    expect(workflow).toContain('actions/setup-node@v7');
    expect(workflow).toContain('googleapis/release-please-action@v5');
    expect(workflow).toContain('pull-requests: write');
    expect(workflow).toContain('id-token: write');
    expect(workflow).toContain('npm run check');
    expect(workflow).toContain("if: github.event_name == 'workflow_dispatch'");
    expect(workflow).toContain('git fetch --no-tags origin master');
    expect(workflow).toContain(`git show "\${validator_commit}:scripts/release-validation.ts"`);
    expect(workflow).toContain(`git show "\${validator_commit}:scripts/validate-release-tag.ts"`);
    expect(workflow).toContain(`git show "\${validator_commit}:scripts/package-validation.ts"`);
    expect(workflow).toContain(`git show "\${validator_commit}:scripts/release-package.ts"`);
    expect(workflow).toContain(`git show "\${validator_commit}:scripts/pack-release.ts"`);
    expect(workflow).toContain('node --import tsx "$RECOVERY_VALIDATOR" "$RELEASE_TAG"');
    expect(workflow).toContain('git restore --source=HEAD -- scripts/package-validation.ts');
    expect(workflow).toContain("const values=Array.isArray(p)?p:Object.values(p)");
    expect(workflow).toContain(`node --import tsx "\${RECOVERY_PACKER:-scripts/pack-release.ts}" "$release_dir"`);
    expect(workflow).toContain('git restore --source=HEAD -- scripts/release-package.ts');
    expect(workflow).toContain('rm scripts/release-package.ts');
    expect(workflow).toContain('npm publish "$ARCHIVE" --access public --provenance');
    expect(workflow).toContain('gh release upload');
    expect(workflow).toContain(
      'brew tap iwonz/ywtc https://github.com/iwonz/ywtc.git\\nbrew trust --tap iwonz/ywtc\\nbrew install ywtc',
    );
    expect(workflow).toContain("if: always() && needs.publish-npm.result == 'success'");
    expect(workflow).toContain('brew tap-new --no-git "$tap_name"');
    expect(workflow).toContain('tap_dir="$(brew --repository "$tap_name")"');
    expect(workflow).toContain('cp Formula/ywtc.rb "$tap_dir/Formula/ywtc.rb"');
    expect(workflow).toContain('brew audit --strict "$tap_name/ywtc"');
    expect(workflow).toContain('brew install --formula "$tap_name/ywtc"');
    expect(workflow).toContain('brew test "$tap_name/ywtc"');
    expect(workflow).toContain(
      'node --import tsx scripts/npm-registry-handoff.ts "@iwonz/ywtc" "$RELEASE_VERSION" "$archive"',
    );
    expect(workflow).not.toContain('npm view "@iwonz/ywtc@$RELEASE_VERSION" dist.tarball');
    expect(workflow).not.toContain('brew audit --strict Formula/ywtc.rb');
    expect(workflow).not.toContain('brew install --formula ./Formula/ywtc.rb');
    expect(workflow).toContain('chore(homebrew): update formula to v$RELEASE_VERSION');
    expect(workflow).not.toMatch(/NODE_AUTH_TOKEN|NPM_TOKEN/);
  });

  it('trusts only the staged Homebrew CI tap before loading its formula', async () => {
    const workflow = await readFile('.github/workflows/release.yml', 'utf8');
    const start = workflow.indexOf('      - name: Verify formula');
    const end = workflow.indexOf('      - name: Commit formula to master', start + 1);
    expect(start).toBeGreaterThanOrEqual(0);
    expect(end).toBeGreaterThan(start);
    const verification = workflow.slice(start, end);
    const commands = [
      'brew tap-new --no-git "$tap_name"',
      'cp Formula/ywtc.rb "$tap_dir/Formula/ywtc.rb"',
      'brew trust --tap "$tap_name"',
      'brew audit --strict "$tap_name/ywtc"',
      'brew install --formula "$tap_name/ywtc"',
      'brew test "$tap_name/ywtc"',
      'ywtc --version',
    ];
    let previous = -1;
    for (const command of commands) {
      const current = verification.indexOf(command);
      expect(current, command).toBeGreaterThan(previous);
      previous = current;
    }
  });

  it('uploads the exact observable npm registry archive after publish or reuse', async () => {
    const workflow = await readFile('.github/workflows/release.yml', 'utf8');
    const start = workflow.indexOf('\n  publish-npm:');
    const end = workflow.indexOf('\n  homebrew:', start + 1);
    expect(start).toBeGreaterThanOrEqual(0);
    expect(end).toBeGreaterThan(start);
    const publication = workflow.slice(start, end);
    const commands = [
      `git show "\${validator_commit}:scripts/npm-registry-handoff.ts" > "$validator_dir/npm-registry-handoff.ts"`,
      `node --import tsx "\${RECOVERY_PACKER:-scripts/pack-release.ts}" "$release_dir"`,
      'npm publish "$ARCHIVE" --access public --provenance',
      `node --import tsx "\${RECOVERY_REGISTRY_HANDOFF:-scripts/npm-registry-handoff.ts}" "@iwonz/ywtc" "$RELEASE_VERSION" "$ARCHIVE"`,
      '(cd "$(dirname "$ARCHIVE")" && shasum -a 256 "$archive_name" > "$ARCHIVE.sha256")',
      'gh release upload "$RELEASE_TAG" "$ARCHIVE" "$ARCHIVE.sha256" --clobber',
    ];
    let previous = -1;
    for (const command of commands) {
      const current = publication.indexOf(command);
      expect(current, command).toBeGreaterThan(previous);
      previous = current;
    }
  });

  it('treats a release as complete only after the cross-channel terminal gate', async () => {
    const [workflow, readme, agents] = await Promise.all([
      readFile('.github/workflows/release.yml', 'utf8'),
      readFile('README.md', 'utf8'),
      readFile('AGENTS.md', 'utf8'),
    ]);
    expect(workflow).toContain('\n  release-complete:');
    expect(workflow).toContain('name: Verify complete release');
    expect(workflow).toContain('needs: [publish-npm, homebrew]');
    expect(workflow).toContain('npm run release:verify -- "$RELEASE_TAG"');
    expect(workflow).toContain('(cd "$(dirname "$ARCHIVE")" && shasum -a 256 "$archive_name" > "$ARCHIVE.sha256")');
    expect(readme).toContain('Push исходного изменения и открытый release PR означают pending release, а не завершённый релиз.');
    expect(readme).toContain('`Verify complete release`');
    expect(agents).toContain('A requested release remains incomplete after the source push or creation of the Release Please pull request.');
  });

  it('provisions Playwright Chromium before every complete CI quality gate', async () => {
    const workflow = await readFile('.github/workflows/release.yml', 'utf8');
    const chromiumInstall = 'npx playwright install chromium --with-deps';
    const jobSegment = (start: string, end: string): string => {
      const startIndex = workflow.indexOf(`\n  ${start}:`);
      const endIndex = workflow.indexOf(`\n  ${end}:`, startIndex + 1);
      expect(startIndex).toBeGreaterThanOrEqual(0);
      expect(endIndex).toBeGreaterThan(startIndex);
      return workflow.slice(startIndex, endIndex);
    };
    const expectProvisionedBeforeCheck = (job: string): void => {
      const dependencyInstallIndex = job.indexOf('npm ci');
      const browserInstallIndex = job.indexOf(chromiumInstall);
      const checkIndex = job.indexOf('npm run check');
      expect(dependencyInstallIndex).toBeGreaterThanOrEqual(0);
      expect(browserInstallIndex).toBeGreaterThan(dependencyInstallIndex);
      expect(checkIndex).toBeGreaterThan(browserInstallIndex);
      expect(job.split(chromiumInstall)).toHaveLength(2);
    };

    expectProvisionedBeforeCheck(jobSegment('checks', 'release-please'));
    expectProvisionedBeforeCheck(jobSegment('publish-npm', 'homebrew'));
  });

  it('documents the Homebrew third-party tap trust boundary', async () => {
    const readme = await readFile('README.md', 'utf8');
    expect(readme).toContain(
      'brew tap iwonz/ywtc https://github.com/iwonz/ywtc.git\nbrew trust --tap iwonz/ywtc\nbrew install ywtc',
    );
  });

  it('publishes a public scoped package with the ywtc binary', async () => {
    const packageJson = JSON.parse(await readFile('package.json', 'utf8')) as Record<string, unknown>;
    expect(packageJson).toMatchObject({
      name: '@iwonz/ywtc',
      license: 'MIT',
      publishConfig: {access: 'public', provenance: true},
      bin: {ywtc: './dist/cli.js'},
      engines: {node: '>=24.0.0', npm: '>=11.5.1'},
    });
    expect(packageJson).not.toHaveProperty('private');
  });

  it('pins Homebrew cooldown-eligible runtime dependencies', async () => {
    const packageJson = JSON.parse(await readFile('package.json', 'utf8')) as {
      dependencies?: Record<string, string>;
    };
    expect(packageJson.dependencies?.['@diplodoc/transform']).toBe('4.78.9');
    expect(packageJson.dependencies?.['markdown-it']).toBe('14.3.3');
    expect(packageJson.dependencies).not.toHaveProperty('dotenv');
  });

  it('includes all release-note sections while preserving product bump types', async () => {
    const config = JSON.parse(await readFile('release-please-config.json', 'utf8')) as {
      packages: Record<string, {"changelog-sections": Array<{type: string}>}>;
    };
    const types = config.packages['.']?.['changelog-sections'].map((entry) => entry.type);
    expect(types).toEqual(expect.arrayContaining(['feat', 'fix', 'perf', 'revert', 'docs', 'refactor', 'test', 'build', 'ci', 'chore', 'style']));
  });
});
