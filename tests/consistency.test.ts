import {describe, expect, it, vi} from 'vitest';
import {ConfirmedDestinationMissingError, verifyConfirmedDestinationPage} from '../src/consistency.js';
import {DestinationOwnershipConflictError, type DestinationAdapter, type DestinationPage} from '../src/domain.js';
import {HttpRequestError} from '../src/http.js';

const page: DestinationPage = {
  provider: 'confluence', profile: 'destination', id: '42', canonicalId: 'destination:42',
  title: 'Page', url: 'https://confluence.example/pages/42', content: '<p>Body</p>',
};

describe('confirmed destination consistency', () => {
  it('retries only confirmed 404 reads with the bounded schedule', async () => {
    const verifyPage = vi.fn()
      .mockRejectedValueOnce(new HttpRequestError('missing', 404))
      .mockRejectedValueOnce(new HttpRequestError('missing', 404))
      .mockResolvedValue(page);
    const delays: number[] = [];
    const result = await verifyConfirmedDestinationPage({verifyPage} as unknown as DestinationAdapter, page, {
      sleep: async (delay) => { delays.push(delay); }, random: () => 0.5,
    });
    expect(result).toBe(page);
    expect(verifyPage).toHaveBeenCalledTimes(3);
    expect(delays).toEqual([500, 1_000]);
  });

  it('does not retry non-404 errors and classifies persistent confirmed 404', async () => {
    const forbidden = vi.fn().mockRejectedValue(new HttpRequestError('forbidden', 403));
    await expect(verifyConfirmedDestinationPage({verifyPage: forbidden} as unknown as DestinationAdapter, page, {
      sleep: async () => undefined,
    })).rejects.toThrow(/forbidden/);
    expect(forbidden).toHaveBeenCalledOnce();

    const missing = vi.fn().mockRejectedValue(new HttpRequestError('missing', 404));
    await expect(verifyConfirmedDestinationPage({verifyPage: missing} as unknown as DestinationAdapter, page, {
      sleep: async () => undefined, random: () => 0.5,
    })).rejects.toBeInstanceOf(ConfirmedDestinationMissingError);
    expect(missing).toHaveBeenCalledTimes(6);
  });

  it('rejects a provider response with a different immutable destination ID', async () => {
    const verifyPage = vi.fn().mockResolvedValue({...page, id: '99', canonicalId: 'destination:99'});
    const error = await verifyConfirmedDestinationPage({verifyPage} as unknown as DestinationAdapter, page)
      .catch((cause: unknown) => cause);
    expect(error).toBeInstanceOf(DestinationOwnershipConflictError);
    expect(error).toMatchObject({reason: 'immutable-id-mismatch', candidateIds: ['42', '99']});
    expect(verifyPage).toHaveBeenCalledOnce();
  });
});
