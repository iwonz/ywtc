import {writeFile} from 'node:fs/promises';
import {mkdtemp} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {describe, expect, it} from 'vitest';
import type {SourceResource} from '../src/domain.js';
import {DestinationNameAllocator, fingerprintFile, verifiedCacheFile} from '../src/resource-reconciliation.js';

function resource(id: string, preferredName = 'image.png'): SourceResource {
  return {provider: 'yandex-wiki', id, pageId: '1', name: 'image.png', preferredName, kind: 'image'};
}

describe('resource reconciliation', () => {
  it('allocates preferred names case-insensitively and adds a stable source-id suffix on collision', () => {
    const allocator = new DestinationNameAllocator(['IMAGE.PNG']);
    const first = allocator.allocate(resource('resource-1'));
    const second = allocator.allocate(resource('resource-1'));
    expect(first).toMatch(/^image--[0-9a-f]{8}\.png$/);
    expect(second).toMatch(/^image--[0-9a-f]{8}-2\.png$/);
    expect(new DestinationNameAllocator().allocate(resource('resource-2', 'image-1.png'))).toBe('image-1.png');
  });

  it('reuses only cache files whose actual size and SHA-256 are verified', async () => {
    const directory = await mkdtemp(path.join(os.tmpdir(), 'ywtc-resource-cache-'));
    const filename = path.join(directory, 'resource.bin');
    await writeFile(filename, 'payload');
    const fingerprint = await fingerprintFile(filename);
    await expect(verifiedCacheFile(filename, fingerprint)).resolves.toEqual(fingerprint);
    await expect(verifiedCacheFile(filename, {...fingerprint, sha256: 'wrong'})).resolves.toBeUndefined();
    await expect(verifiedCacheFile(path.join(directory, 'missing.bin'))).resolves.toBeUndefined();
  });
});
