import type {DestinationAdapter, DestinationPage} from './domain.js';
import {HttpRequestError} from './http.js';

const CONSISTENCY_DELAYS_MS = [500, 1_000, 2_000, 4_000, 8_000] as const;

export class ConfirmedDestinationMissingError extends Error {
  constructor(readonly page: DestinationPage, options?: ErrorOptions) {
    super(`Previously confirmed destination page ${page.id} remained unavailable after consistency retries`, options);
    this.name = 'ConfirmedDestinationMissingError';
  }
}

function isNotFoundError(error: unknown): boolean {
  return error instanceof HttpRequestError
    ? error.status === 404
    : /(?:status\s*=\s*404|\b404\b.*(?:not found|no content))/i.test(error instanceof Error ? error.message : String(error));
}

export interface ConsistencyRetryOptions {
  sleep?: (milliseconds: number) => Promise<void>;
  random?: () => number;
  onRetry?: (attempt: number, delayMs: number) => void;
}

export async function verifyConfirmedDestinationPage(
  adapter: DestinationAdapter,
  page: DestinationPage,
  options: ConsistencyRetryOptions = {},
): Promise<DestinationPage> {
  const sleep = options.sleep ?? ((milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds)));
  const random = options.random ?? Math.random;
  let lastError: unknown;
  for (let attempt = 0; attempt <= CONSISTENCY_DELAYS_MS.length; attempt += 1) {
    try {
      return await adapter.verifyPage(page);
    } catch (error) {
      if (!isNotFoundError(error)) throw error;
      lastError = error;
      const baseDelay = CONSISTENCY_DELAYS_MS[attempt];
      if (baseDelay === undefined) break;
      const jittered = Math.max(1, Math.round(baseDelay * (0.8 + random() * 0.4)));
      options.onRetry?.(attempt + 1, jittered);
      await sleep(jittered);
    }
  }
  throw new ConfirmedDestinationMissingError(page, {cause: lastError});
}
