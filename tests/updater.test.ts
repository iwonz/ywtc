import {describe, expect, it, vi} from 'vitest';
import {isNewerVersion, runUpdate} from '../src/updater.js';

describe('update command', () => {
  it('compares stable versions', () => {
    expect(isNewerVersion('2.0.0', '1.9.9')).toBe(true);
    expect(isNewerVersion('2.0.0', '2.0.0')).toBe(false);
    expect(isNewerVersion('1.9.9', '2.0.0')).toBe(false);
  });

  it('checks without changing the installation', async () => {
    const execute = vi.fn();
    const result = await runUpdate({
      currentVersion: '1.0.0', install: false, channel: 'global-npm',
      fetchLatest: async () => '2.0.0', execute,
    });
    expect(result).toMatchObject({updateAvailable: true, installed: false, channel: 'global-npm'});
    expect(execute).not.toHaveBeenCalled();
  });

  it('uses argument arrays without shell for npm and brew', async () => {
    const npmExecute = vi.fn(async () => undefined);
    await runUpdate({
      currentVersion: '1.0.0', install: true, via: 'npm', channel: 'global-npm',
      fetchLatest: async () => '2.0.0', execute: npmExecute,
    });
    expect(npmExecute).toHaveBeenCalledWith('npm', ['install', '-g', '@iwonz/ywtc@latest']);
    const brewExecute = vi.fn(async () => undefined);
    await runUpdate({
      currentVersion: '1.0.0', install: true, via: 'brew', channel: 'brew',
      fetchLatest: async () => '2.0.0', execute: brewExecute,
    });
    expect(brewExecute.mock.calls).toEqual([['brew', ['update']], ['brew', ['upgrade', 'ywtc']]]);
  });

  it.each(['source', 'npx', 'local', 'unknown'] as const)('does not self-modify %s installs', async (channel) => {
    const execute = vi.fn();
    const result = await runUpdate({
      currentVersion: '1.0.0', install: true, channel, fetchLatest: async () => '2.0.0', execute,
    });
    expect(result.installed).toBe(false);
    expect(execute).not.toHaveBeenCalled();
  });
});
