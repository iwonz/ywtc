import {describe, expect, it} from 'vitest';
import {CLI_HELP, COMMAND_HELP, parseCliArguments} from '../src/cli-arguments.js';

describe('CLI arguments', () => {
  it('parses explicit migration and state options', () => {
    expect(parseCliArguments(['migrate', '--source', '/docs/', '--target', '123'])).toMatchObject({
      command: 'migrate', source: '/docs/', target: '123', fresh: false,
    });
    expect(parseCliArguments([
      'migrate', '--source', 'docs', '--target', '123', '--workdir', './work',
      '--state', '.states/custom.json', '--fresh', '--single-page', '--concurrency', '6',
    ])).toMatchObject({
      command: 'migrate', workdir: './work', stateFilename: '.states/custom.json',
      fresh: true, singlePage: true, concurrency: 6,
    });
  });

  it('parses init, doctor, update and version commands', () => {
    expect(parseCliArguments(['init', '--workdir', '~/migration'])).toEqual({command: 'init', workdir: '~/migration'});
    expect(parseCliArguments(['doctor'])).toEqual({command: 'doctor'});
    expect(parseCliArguments(['doctor', '--source', 'docs', '--target', '123'])).toEqual({
      command: 'doctor', source: 'docs', target: '123',
    });
    expect(parseCliArguments(['update', '--install', '--via', 'brew'])).toEqual({command: 'update', install: true, via: 'brew'});
    expect(parseCliArguments(['--version'])).toEqual({command: 'version'});
  });

  it('reports legacy, partial, empty, unknown, and invalid invocations clearly', () => {
    expect(() => parseCliArguments(['--source', 'docs', '--target', '123'])).toThrow(/v2 CLI requires a command/);
    expect(() => parseCliArguments(['migrate', '--source', 'docs'])).toThrow(/requires non-empty --source and --target/);
    expect(() => parseCliArguments(['doctor', '--source', 'docs'])).toThrow(/both --source and --target/);
    expect(() => parseCliArguments(['migrate', '--source', 'docs', '--target', '123', '--state', '   '])).toThrow(/non-empty/);
    expect(() => parseCliArguments(['migrate', '--source', 'docs', '--target', '123', '--concurrency', '0'])).toThrow(/between 1 and 32/);
    expect(() => parseCliArguments(['update', '--via', 'source'])).toThrow(/npm or brew/);
    expect(() => parseCliArguments(['unknown'])).toThrow(/Unknown command/);
  });

  it('shows global and command help without requiring configuration', () => {
    expect(parseCliArguments(['--help'])).toEqual({command: 'help'});
    expect(parseCliArguments(['migrate', '--help'])).toEqual({command: 'help', topic: 'migrate'});
    expect(CLI_HELP).toMatch(/^ywtc — /);
    expect(COMMAND_HELP.migrate).toContain('ywtc migrate');
  });
});
