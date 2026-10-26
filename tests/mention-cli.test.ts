import {describe, expect, it} from 'vitest';
import {cliHelp, parseCliArguments} from '../src/cli-arguments.js';

describe('mentions export CLI', () => {
  it('parses aliases with migrate defaults', () => {
    expect(parseCliArguments(['mentions', 'export', '-s', 'root', '-o', './mentions', '-S', 'wiki', '-w', '/tmp/workspace', '-j', '2'])).toEqual({command: 'mentions-export', source: 'root', output: './mentions', sourceProfile: 'wiki', workdir: '/tmp/workspace', concurrency: 2, scope: 'subtree', sourceStatus: 'all', comments: true});
  });
  it('requires output and rejects destination or invalid scope', () => {
    for (const args of [['-s', 'root'], ['-s', 'root', '-o', './mentions', '-d', 'target'], ['-s', 'root', '-o', './mentions', '-m', 'invalid']]) expect(() => parseCliArguments(['mentions', 'export', ...args])).toThrow();
  });
  it('supports no-comments and nested help', () => {
    expect(parseCliArguments(['mentions', 'export', '--source', 'root', '--output', './mentions', '-N'])).toMatchObject({comments: false});
    expect(cliHelp('mentions')).toContain('--output');
  });
});
