import {hostname} from 'node:os';
import {mkdir, open, readFile, unlink} from 'node:fs/promises';
import path from 'node:path';

interface LeaseMetadata {
  pid: number;
  hostname: string;
  startedAt: string;
  purpose: string;
  target: string;
}

export class ExclusiveLeaseBusyError extends Error {
  constructor(message: string) {super(message);this.name = 'ExclusiveLeaseBusyError';}
}

export interface ExclusiveLease {
  filename: string;
  metadata: LeaseMetadata;
  release(): Promise<void>;
}

function localProcessIsAlive(pid: number): boolean {
  if (!Number.isSafeInteger(pid) || pid <= 0) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return (error as NodeJS.ErrnoException).code === 'EPERM';
  }
}

async function existingLease(filename: string): Promise<LeaseMetadata | undefined> {
  try {
    const value = JSON.parse(await readFile(filename, 'utf8')) as Partial<LeaseMetadata>;
    if (
      typeof value.pid !== 'number'
      || typeof value.hostname !== 'string'
      || typeof value.startedAt !== 'string'
      || typeof value.purpose !== 'string'
      || typeof value.target !== 'string'
    ) return undefined;
    return value as LeaseMetadata;
  } catch {
    return undefined;
  }
}

function isProvablyStale(metadata: LeaseMetadata | undefined): boolean {
  return metadata?.hostname === hostname() && !localProcessIsAlive(metadata.pid);
}

export async function acquireExclusiveLease(filename: string, purpose: string, target: string): Promise<ExclusiveLease> {
  await mkdir(path.dirname(filename), {recursive: true, mode: 0o700});
  const metadata: LeaseMetadata = {pid: process.pid, hostname: hostname(), startedAt: new Date().toISOString(), purpose, target};
  for (let attempt = 0; attempt < 2; attempt += 1) {
    let created = false;
    try {
      const handle = await open(filename, 'wx', 0o600);
      created = true;
      try {
        await handle.writeFile(`${JSON.stringify(metadata, null, 2)}\n`);
      } finally {
        await handle.close();
      }
      let released = false;
      return {
        filename,
        metadata,
        async release() {
          if (released) return;
          released = true;
          const current = await existingLease(filename);
          if (current?.pid === metadata.pid && current.hostname === metadata.hostname && current.startedAt === metadata.startedAt) {
            await unlink(filename).catch((error: NodeJS.ErrnoException) => {
              if (error.code !== 'ENOENT') throw error;
            });
          }
        },
      };
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'EEXIST') {
        if (created) await unlink(filename).catch(() => undefined);
        throw error;
      }
      const current = await existingLease(filename);
      if (attempt === 0 && isProvablyStale(current)) {
        await unlink(filename).catch((unlinkError: NodeJS.ErrnoException) => {
          if (unlinkError.code !== 'ENOENT') throw unlinkError;
        });
        continue;
      }
      const detail = current
        ? `PID ${current.pid} on ${current.hostname}, started ${current.startedAt}`
        : 'the lock metadata is unreadable and cannot be proven active';
      throw new ExclusiveLeaseBusyError(`Another ${purpose} is active for "${target}" (${detail}). Wait for it to finish or remove the lock only after proving that process is no longer running.`);
    }
  }
  throw new Error(`Could not acquire ${purpose} lock for "${target}"`);
}
