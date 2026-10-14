import path from 'node:path';

function decodePath(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

export function normalizeWikiSlug(value: string): string {
  return decodePath(value)
    .replace(/^\/+|\/+$/g, '')
    .replace(/\/{2,}/g, '/')
    .trim();
}

export function parseWikiSource(input: string, wikiWebUrl: string): string {
  const trimmed = input.trim();
  if (!trimmed) throw new Error('Source Wiki slug or URL is required');

  try {
    const source = new URL(trimmed);
    const configured = new URL(wikiWebUrl);
    if (source.host !== configured.host) {
      throw new Error(`Source URL host must match ${configured.host}`);
    }
    const basePath = configured.pathname.replace(/\/+$/, '');
    const pathname = basePath && source.pathname.startsWith(basePath)
      ? source.pathname.slice(basePath.length)
      : source.pathname;
    const slug = normalizeWikiSlug(pathname);
    if (!slug) throw new Error('Source URL does not contain a Wiki page slug');
    return slug;
  } catch (error) {
    if (/^[a-z][a-z\d+.-]*:\/\//i.test(trimmed)) throw error;
    const slug = normalizeWikiSlug(trimmed);
    if (!slug) throw new Error('Source Wiki slug is empty');
    return slug;
  }
}

export function resolveRelativeWikiSlug(currentSlug: string, hrefPath: string): string {
  const decoded = decodePath(hrefPath).replace(/\\/g, '/');
  if (decoded.startsWith('/')) return normalizeWikiSlug(decoded);
  const directory = path.posix.dirname(normalizeWikiSlug(currentSlug));
  return normalizeWikiSlug(path.posix.normalize(path.posix.join(directory === '.' ? '' : directory, decoded)));
}

export function safeFilename(value: string): string {
  // biome-ignore lint/suspicious/noControlCharactersInRegex: filesystem control characters must be removed.
  const normalized = path.basename(value).replace(/[\u0000-\u001f<>:"/\\|?*]/g, '_').trim();
  return normalized || 'unnamed-file';
}
