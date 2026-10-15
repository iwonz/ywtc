import {createHash} from 'node:crypto';
import {createReadStream} from 'node:fs';
import {stat} from 'node:fs/promises';
import path from 'node:path';
import type {SourceResource} from './domain.js';
import {safeFilename} from './input.js';

export interface FileFingerprint {
  path: string;
  size: number;
  sha256: string;
  mimeType?: string;
}

function stableResourceSuffix(resourceId: string): string {
  return createHash('sha256').update(resourceId).digest('hex').slice(0, 8);
}

export function preferredDestinationName(resource: SourceResource): string {
  return safeFilename(resource.preferredName ?? resource.name);
}

function suffixedName(filename: string, suffix: string, sequence?: number): string {
  const extension = path.extname(filename);
  const stem = filename.slice(0, filename.length - extension.length) || 'attachment';
  return `${stem}--${suffix}${sequence && sequence > 1 ? `-${sequence}` : ''}${extension}`;
}

export class DestinationNameAllocator {
  private readonly occupied = new Set<string>();

  constructor(names: Iterable<string> = []) {
    for (const name of names) this.reserve(name);
  }

  reserve(name: string): void {
    this.occupied.add(name.toLocaleLowerCase());
  }

  isOccupied(name: string): boolean {
    return this.occupied.has(name.toLocaleLowerCase());
  }

  allocate(resource: SourceResource, confirmedName?: string): string {
    if (confirmedName) {
      this.reserve(confirmedName);
      return confirmedName;
    }
    const preferred = preferredDestinationName(resource);
    if (!this.isOccupied(preferred)) {
      this.reserve(preferred);
      return preferred;
    }
    const suffix = stableResourceSuffix(resource.id);
    let sequence = 1;
    let candidate = suffixedName(preferred, suffix);
    while (this.isOccupied(candidate)) {
      sequence += 1;
      candidate = suffixedName(preferred, suffix, sequence);
    }
    this.reserve(candidate);
    return candidate;
  }
}

export async function fingerprintFile(filename: string): Promise<FileFingerprint> {
  const details = await stat(filename);
  const hash = createHash('sha256');
  for await (const chunk of createReadStream(filename)) hash.update(chunk);
  return {path: filename, size: details.size, sha256: hash.digest('hex')};
}

export async function verifiedCacheFile(
  filename: string,
  expected?: {size?: number; sha256?: string; mimeType?: string},
): Promise<FileFingerprint | undefined> {
  try {
    const actual = await fingerprintFile(filename);
    if (expected?.size !== undefined && expected.size !== actual.size) return undefined;
    if (expected?.sha256 !== undefined && expected.sha256 !== actual.sha256) return undefined;
    return {...actual, ...(expected?.mimeType ? {mimeType: expected.mimeType} : {})};
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return undefined;
    throw error;
  }
}
