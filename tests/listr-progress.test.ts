import {Listr, ListrLogger, ProcessOutput, createWritable} from 'listr2';
import {describe, expect, it} from 'vitest';
import {CooperativeScheduler} from '../src/cooperative.js';
import {ContinuousProgress} from '../src/progress.js';

const ANSI_PATTERN = new RegExp(`${String.fromCharCode(27)}\\[[0-?]*[ -/]*[@-~]`, 'g');

describe('Listr2 progress integration', () => {
  it('repaints structured progress and heartbeat through the supported task output channel', async () => {
    const stdoutTty = process.stdout.isTTY;
    const stderrTty = process.stderr.isTTY;
    const chunks: string[] = [];
    const stdout = createWritable((chunk) => { chunks.push(chunk); }) as NodeJS.WriteStream;
    const stderr = createWritable((chunk) => { chunks.push(chunk); }) as NodeJS.WriteStream;
    Object.defineProperties(stdout, {
      columns: {value: 120, configurable: true},
      isTTY: {value: true, configurable: true},
    });
    const processOutput = new ProcessOutput(stdout, stderr, {dump: [], leaveEmptyLine: false});
    const logger = new ListrLogger({processOutput});
    const tasks = new Listr([{
      title: 'Discover, transfer, and verify',
      task: async (_context, task) => {
        const progress = new ContinuousProgress((message) => { task.output = message; }, {heartbeatMs: 2});
        const scheduler = new CooperativeScheduler({maxSliceMs: 0});
        try {
          progress.measure({phase: 'Page staging', completed: 0, total: 4, unit: 'pages', inFlight: 1, queued: 3});
          progress.begin('Rendering bootstrap · First page');
          await scheduler.checkpoint({force: true});
          await new Promise((resolve) => setTimeout(resolve, 8));
          progress.measure({phase: 'Page staging', completed: 1, total: 4, unit: 'pages', queued: 3});
          await scheduler.checkpoint({force: true});
        } finally {
          progress.stop();
        }
      },
    }], {
      renderer: 'default',
      rendererOptions: {logger, collapseErrors: false, collapseSubtasks: false},
      forceTTY: true,
      registerSignalListeners: false,
    });

    try {
      await tasks.run();
    } finally {
      Object.defineProperty(process.stdout, 'isTTY', {value: stdoutTty, configurable: true});
      Object.defineProperty(process.stderr, 'isTTY', {value: stderrTty, configurable: true});
    }
    const output = chunks.join('').replace(ANSI_PATTERN, '');
    expect(output).toContain('Page staging · 0/4 pages');
    expect(output).toContain('active 1: Rendering bootstrap · First page');
    expect(output).toContain('Still working');
    expect(output).toContain('Page staging · 1/4 pages');
  });
});
