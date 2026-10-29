import {describe, expect, it} from 'vitest';
import {redactCheckoutPaths} from '../scripts/build-paths.mjs';

describe('standalone checkout path redaction', () => {
  it('removes real paths without corrupting worker or workspace identifiers', () => {
    const source = 'require("/work/web/page.js");const root="/work";const route="/api/workspaces";const worker="/worker";';
    expect(redactCheckoutPaths(source, '/work')).toBe('require("./web/page.js");const root=".";const route="/api/workspaces";const worker="/worker";');
  });
  it('treats checkout punctuation literally and preserves longer sibling names', () => {
    expect(redactCheckoutPaths('"/tmp/repo.v1/x" "/tmp/repo.v1-extra" "/tmp/repoXv1/x"', '/tmp/repo.v1')).toBe('"./x" "/tmp/repo.v1-extra" "/tmp/repoXv1/x"');
  });
});
