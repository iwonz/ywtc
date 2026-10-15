import {describe, expect, it} from 'vitest';
import {renderHomebrewFormula} from '../scripts/homebrew-formula.js';

describe('Homebrew formula generation', () => {
  it('renders a deterministic npm-backed formula with functional tests', () => {
    const formula = renderHomebrewFormula({
      version: '2.0.0',
      url: 'https://registry.npmjs.org/@iwonz/ywtc/-/ywtc-2.0.0.tgz',
      sha256: 'a'.repeat(64),
    });
    expect(formula).toContain('class Ywtc < Formula');
    expect(formula).toContain('depends_on "node@24"');
    expect(formula).toContain('system "npm", "install", *std_npm_args');
    expect(formula).toContain('bin.install_symlink libexec.glob("bin/*")');
    expect(formula).toContain('ywtc --version');
    expect(formula.indexOf('version "2.0.0"')).toBeLessThan(formula.indexOf('sha256'));
    expect(formula).not.toContain('cached_download');
    expect(formula).not.toContain('"--global"');
    expect(formula).not.toContain('CONFLUENCE_TOKEN');
  });

  it('rejects unsafe metadata', () => {
    expect(() => renderHomebrewFormula({version: 'next', url: 'http://example.com/a.tgz', sha256: 'x'})).toThrow(/SemVer/);
  });
});
