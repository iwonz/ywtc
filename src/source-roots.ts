import type {SourceAdapter, SourcePage} from './domain.js';

/** Parse only space-entry URLs, not concrete page URLs or destination locators. */
export function confluenceSpaceKey(locator: string, baseUrl: string): string | undefined {
  let url: URL;
  try {url = new URL(locator);} catch {return undefined;}
  const base = new URL(baseUrl);
  if (url.origin !== base.origin) throw new Error(`Confluence source host must match ${base.origin}`);
  const basePath = base.pathname.replace(/\/+$/, '').replace(/\/wiki$/, '');
  if (basePath && !url.pathname.startsWith(`${basePath}/`)) throw new Error('Confluence source URL is outside the configured context path');
  const pathname = url.pathname.slice(basePath.length);
  if (/^\/(?:wiki\/)?spaces\/viewspace\.action\/?$/.test(pathname)) {
    const keys = url.searchParams.getAll('key');
    if (keys.length !== 1 || !keys[0]?.trim()) throw new Error('Confluence space URL requires exactly one nonempty key');
    return keys[0];
  }
  if (url.searchParams.has('pageId')) return undefined;
  const match = pathname.match(/^\/display\/([^/]+)\/?$/)
    ?? pathname.match(/^\/(?:wiki\/)?spaces\/([^/]+)(?:\/overview)?\/?$/);
  return match?.[1] ? decodeURIComponent(match[1]) : undefined;
}

export async function resolveSourceRoot(adapter: SourceAdapter, locator: string): Promise<SourcePage> {
  return adapter.resolveRoot ? (await adapter.resolveRoot(locator)).item : adapter.resolvePage(locator);
}

export function realSourcePages<T extends SourcePage>(pages: T[]): T[] {
  return pages.filter(page => !page.sourceSpace);
}
