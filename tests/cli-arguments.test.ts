import {describe, expect, it} from 'vitest';
import {CLI_HELP, parseCliArguments} from '../src/cli-arguments.js';

describe('CLI arguments', () => {
  it('uses automatic resumable state unless an exact override is supplied', () => {
    expect(parseCliArguments(['--source', '/docs/', '--target', '123'])).toMatchObject({
      help: false,
      source: '/docs/',
      target: '123',
      fresh: false,
    });
    expect(parseCliArguments([
      '--source', 'docs',
      '--target', '123',
      '--state', './runtime/custom.json',
      '--fresh',
      '--single-page',
      '--concurrency', '6',
    ])).toMatchObject({
      stateFilename: './runtime/custom.json',
      fresh: true,
      singlePage: true,
      concurrency: 6,
    });
  });

  it('reports missing, empty, unknown, and invalid values clearly', () => {
    expect(() => parseCliArguments(['--source', 'docs'])).toThrow(/--source and --target.*required/);
    expect(() => parseCliArguments(['--source', 'docs', '--target', '123', '--state', '   '])).toThrow(/non-empty file path/);
    expect(() => parseCliArguments(['--source', 'docs', '--target', '123', '--concurrency', '0'])).toThrow(/between 1 and 32/);
    expect(() => parseCliArguments(['--source', 'docs', '--target', '123', '--unknown'])).toThrow(/Unknown option/);
  });

  it('shows help without requiring migration inputs', () => {
    expect(parseCliArguments(['--help'])).toEqual({help: true});
    expect(CLI_HELP).toMatch(/^ywtc — /);
  });
});
