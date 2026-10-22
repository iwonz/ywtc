import {describe, expect, it} from 'vitest';
import {migrationContinuationCommand, type ReadyMigrationCommand} from '../src/migration-command.js';

function command(dryRun: boolean): ReadyMigrationCommand {
  return {
    command: 'migrate',
    source: 'https://wiki.example/root',
    destination: 'https://docs.example/pages/10',
    scope: 'subtree',
    sourceStatus: 'all',
    comments: true,
    archive: false,
    dryRun,
    fresh: false,
    openReport: false,
  };
}

describe('migration continuation commands', () => {
  it('uses checkpoint-aware retry for a state-backed failed live run', () => {
    expect(migrationContinuationCommand(
      command(false),
      '/tmp/ywtc workspace',
      '10000000-0000-4000-8000-000000000001',
    )).toBe('ywtc retry 10000000-0000-4000-8000-000000000001 --workdir "/tmp/ywtc workspace"');
  });

  it('keeps the explicit migrate command for a dry-run', () => {
    const continuation = migrationContinuationCommand(
      command(true),
      '/tmp/ywtc',
      '10000000-0000-4000-8000-000000000001',
    );
    expect(continuation).toContain('ywtc migrate');
    expect(continuation).toContain('--dry-run');
    expect(continuation).not.toContain('ywtc retry');
  });
});
