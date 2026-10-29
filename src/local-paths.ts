import { lstat, realpath } from 'node:fs/promises';
import path from 'node:path';

export async function boundedPath(
	root: string,
	relative: string,
	allowMissing = false,
): Promise<string> {
	const base = await realpath(root),
		candidate = path.resolve(base, relative),
		suffix = path.relative(base, candidate);
	if (
		suffix === '..' ||
		suffix.startsWith(`..${path.sep}`) ||
		path.isAbsolute(suffix)
	)
		throw new Error('Path escapes registered boundary');
	let current = base;
	for (const part of suffix.split(path.sep).filter(Boolean)) {
		current = path.join(current, part);
		try {
			if ((await lstat(current)).isSymbolicLink())
				throw new Error('Unsafe symlink boundary');
		} catch (error) {
			if (allowMissing && (error as NodeJS.ErrnoException).code === 'ENOENT')
				return candidate;
			throw error;
		}
	}
	return candidate;
}
