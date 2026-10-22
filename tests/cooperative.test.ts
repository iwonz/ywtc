import {describe, expect, it, vi} from 'vitest';
import {CooperativeScheduler} from '../src/cooperative.js';

describe('cooperative scheduler', () => {
  it('yields only after the configured CPU slice unless forced', async () => {
    let now = 100;
    const yieldControl = vi.fn(async () => undefined);
    const scheduler = new CooperativeScheduler({maxSliceMs: 25, now: () => now, yieldControl});

    expect(await scheduler.checkpoint()).toBe(false);
    now = 124;
    expect(await scheduler.checkpoint()).toBe(false);
    now = 125;
    expect(await scheduler.checkpoint()).toBe(true);
    expect(yieldControl).toHaveBeenCalledTimes(1);
    expect(await scheduler.checkpoint({force: true})).toBe(true);
    expect(yieldControl).toHaveBeenCalledTimes(2);
  });

  it('lets timers run during a CPU-heavy batch', async () => {
    const scheduler = new CooperativeScheduler({maxSliceMs: 0});
    let timerRan = false;
    setTimeout(() => { timerRan = true; }, 0);

    for (let index = 0; index < 10 && !timerRan; index += 1) {
      const deadline = Date.now() + 2;
      while (Date.now() < deadline) Math.sqrt(index + 1);
      await scheduler.checkpoint();
    }

    expect(timerRan).toBe(true);
  });

  it('honors aborts before and after yielding', async () => {
    const before = new AbortController();
    before.abort(new Error('stop before'));
    const scheduler = new CooperativeScheduler({maxSliceMs: 0});
    await expect(scheduler.checkpoint({signal: before.signal})).rejects.toThrow('stop before');

    const during = new AbortController();
    const yielding = new CooperativeScheduler({
      maxSliceMs: 0,
      yieldControl: async () => { during.abort(new Error('stop during')); },
    });
    await expect(yielding.checkpoint({signal: during.signal})).rejects.toThrow('stop during');
  });
});
