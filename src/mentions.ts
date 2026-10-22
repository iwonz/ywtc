import {createHash} from 'node:crypto';
import {load} from 'cheerio';
import type {
  MentionAlias,
  MentionIdentity,
  MentionPolicy,
  MentionPresentation,
  MentionResolution,
  NormalizedMention,
  ResolvedMentionUser,
} from './domain.js';

const placeholderPattern = /\{(source|username|displayName|email|id|name)\}/g;
const usernameCharacter = /[\p{L}\p{N}._-]/u;

function uniqueMarkerNamespace(source: string, prefix: string, length: number): string {
  const digest = createHash('sha256').update(source).digest('hex').slice(0, length).toUpperCase();
  let attempt = 0;
  let namespace = digest;
  while (source.includes(`${prefix}${namespace}`)) {
    attempt += 1;
    namespace = `${digest}X${attempt.toString(36).toUpperCase()}`;
  }
  return namespace;
}

interface ProtectedMention {
  marker: string;
  identity: MentionIdentity;
}

export interface ProtectedMentions {
  content: string;
  mentions: ProtectedMention[];
  restore(content: string): string;
}

function mentionValues(identity: MentionIdentity): Record<string, string | undefined> {
  return {
    source: identity.source,
    username: identity.username,
    displayName: identity.displayName,
    email: identity.email,
    id: identity.id ?? identity.accountId ?? identity.userKey,
    name: identity.displayName ?? identity.username ?? identity.email ?? identity.id ?? identity.accountId ?? identity.userKey,
  };
}

function applyTemplate(template: string, identity: MentionIdentity, encode: boolean): {value?: string; missing?: string} {
  const values = mentionValues(identity);
  let missing: string | undefined;
  const value = template.replace(placeholderPattern, (_token, name: string) => {
    const replacement = values[name];
    if (replacement === undefined || replacement.length === 0) {
      missing ??= name;
      return '';
    }
    return encode ? encodeURIComponent(replacement) : replacement;
  });
  return missing ? {missing} : {value};
}

function safeUrl(template: string, identity: MentionIdentity): {url?: string; missing?: string; unsafe?: boolean} {
  const rendered = applyTemplate(template, identity, true);
  if (rendered.missing) return rendered;
  try {
    const url = new URL(rendered.value!);
    if (url.protocol !== 'https:' && url.protocol !== 'http:') return {unsafe: true};
    return {url: url.toString()};
  } catch {
    return {unsafe: true};
  }
}

export function prepareMentionPresentation(
  identity: MentionIdentity,
  policy: MentionPolicy,
  resolution: {
    native: boolean;
    status?: 'resolved' | 'not-found' | 'ambiguous' | 'unsupported' | 'failed';
    user?: ResolvedMentionUser;
    retryable?: boolean;
    staticDestination?: boolean;
  },
): MentionPresentation {
  if (policy.mode === 'off') return {outcome: 'preserved', label: identity.source, retryable: false};
  if (policy.mode === 'auto' && resolution.native && resolution.status === 'resolved' && resolution.user) {
    return {outcome: 'native', label: identity.displayName ?? identity.username ?? identity.source, user: resolution.user, retryable: false};
  }

  const label = applyTemplate(policy.textTemplate, identity, false);
  if (label.missing) {
    return {outcome: 'unresolved', label: identity.source, reason: `missing-template-value:${label.missing}`, retryable: false};
  }
  if (policy.urlTemplate) {
    const link = safeUrl(policy.urlTemplate, identity);
    if (link.missing) return {outcome: 'unresolved', label: identity.source, reason: `missing-template-value:${link.missing}`, retryable: false};
    if (link.unsafe || !link.url) return {outcome: 'unresolved', label: identity.source, reason: 'unsafe-template-url', retryable: false};
    if (policy.mode === 'auto' && !resolution.staticDestination) {
      return {
        outcome: 'unresolved', label: label.value!, url: link.url,
        reason: `destination-user-${resolution.status ?? 'unsupported'}`, retryable: resolution.retryable ?? false,
      };
    }
    return {outcome: 'linked', label: label.value!, url: link.url, retryable: false};
  }
  if (policy.mode === 'auto' && !resolution.staticDestination) {
    return {
      outcome: 'unresolved', label: label.value!,
      reason: `destination-user-${resolution.status ?? 'unsupported'}`, retryable: resolution.retryable ?? false,
    };
  }
  return {outcome: 'text', label: label.value!, retryable: false};
}

function canonicalPolicy(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalPolicy);
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, child]) => [key, canonicalPolicy(child)]));
  }
  return value;
}

export function mentionPolicyFingerprint(policy: MentionPolicy): string {
  return createHash('sha256').update(JSON.stringify(canonicalPolicy(policy))).digest('hex');
}

export function mentionIdentityKey(identity: MentionIdentity): string {
  if (identity.accountId) return `accountId:${identity.accountId}`;
  if (identity.userKey) return `userKey:${identity.userKey}`;
  if (identity.username) return `username:${identity.username.toLocaleLowerCase()}`;
  if (identity.email) return `email:${identity.email.toLocaleLowerCase()}`;
  if (identity.id) return `id:${identity.id}`;
  return `source:${identity.source}`;
}

function identityAlias(identity: MentionIdentity, aliases: Record<string, MentionAlias>): MentionAlias | undefined {
  const keys = [
    identity.accountId ? `accountId:${identity.accountId}` : undefined,
    identity.userKey ? `userKey:${identity.userKey}` : undefined,
    identity.username ? `username:${identity.username}` : undefined,
    identity.id ? `id:${identity.id}` : undefined,
  ];
  for (const key of keys) {
    if (key && aliases[key]) return aliases[key];
  }
  return undefined;
}

function applyAlias(identity: MentionIdentity, alias: MentionAlias | undefined): MentionIdentity {
  return alias ? {...identity, ...alias} : identity;
}

export async function resolveMentionPresentations(
  mentions: readonly NormalizedMention[],
  policy: MentionPolicy,
  destination?: {resolveMention?: (identity: MentionIdentity) => Promise<MentionResolution>},
  options: {staticDestination?: boolean; lookupCache?: Map<string, Promise<MentionResolution>>} = {},
): Promise<Map<string, MentionPresentation>> {
  const results = new Map<string, MentionPresentation>();
  const lookups = options.lookupCache ?? new Map<string, Promise<MentionResolution>>();
  await Promise.all(mentions.map(async (mention) => {
    if (policy.mode === 'off') {
      results.set(mention.id, prepareMentionPresentation(mention.identity, policy, {native: false}));
      return;
    }
    if (policy.mode === 'template' || options.staticDestination) {
      results.set(mention.id, prepareMentionPresentation(mention.identity, policy, {native: false, staticDestination: true}));
      return;
    }
    const targetIdentity = applyAlias(mention.identity, identityAlias(mention.identity, policy.aliases));
    const lookupKey = JSON.stringify(canonicalPolicy({
      username: targetIdentity.username,
      userKey: targetIdentity.userKey,
      accountId: targetIdentity.accountId,
      id: targetIdentity.id,
      email: targetIdentity.email,
    }));
    let lookup = lookups.get(lookupKey);
    if (!lookup) {
      lookup = destination?.resolveMention
        ? destination.resolveMention(targetIdentity).catch((error: unknown): MentionResolution => ({
          status: 'failed',
          retryable: true,
          reason: error instanceof Error ? error.message : String(error),
        }))
        : Promise.resolve({status: 'unsupported', retryable: false, reason: 'destination-mention-lookup-unsupported'});
      lookups.set(lookupKey, lookup);
    }
    const resolution = await lookup;
    const presentation = prepareMentionPresentation(mention.identity, policy, {
      native: true,
      status: resolution.status,
      ...(resolution.status === 'resolved' ? {user: resolution.user} : {retryable: resolution.retryable}),
    });
    if (resolution.status !== 'resolved' && presentation.outcome === 'unresolved') presentation.reason = resolution.reason;
    results.set(mention.id, presentation);
  }));
  return results;
}

export interface SafeCommentMentionResult {
  content: string;
  mentions: Array<{identity: MentionIdentity; presentation: MentionPresentation}>;
}

export function escapeMentionMarkdown(value: string): string {
  return value.replace(/([\\`*_[\]<>])/g, '\\$1');
}

function markdownMention(presentation: MentionPresentation): string {
  const label = escapeMentionMarkdown(presentation.label);
  return presentation.url ? `[${label}](${presentation.url})` : label;
}

/** Render comment mentions without destination-native markers, so archival never notifies users. */
export function renderSafeCommentMentions(source: string, policy: MentionPolicy): SafeCommentMentionResult {
  const captured: Array<{marker: string; identity: MentionIdentity}> = [];
  const markerNamespace = uniqueMarkerNamespace(source, 'YWTCCOMMENTNATIVE', 12);
  let content = source;
  if (source.includes('ri:user')) {
    const $ = load(`<main data-ywtc-comment-mentions>${source}</main>`, {xmlMode: true}, false);
    $('ac\\:link').each((_index, element) => {
      const link = $(element);
      const user = link.children('ri\\:user').first();
      if (user.length === 0) return;
      const username = user.attr('ri:username');
      const userKey = user.attr('ri:userkey');
      const accountId = user.attr('ri:account-id');
      const displayName = link.children('ac\\:link-body, ac\\:plain-text-link-body').first().text().trim() || undefined;
      const marker = `YWTCCOMMENTNATIVE${markerNamespace}${captured.length.toString(36).toUpperCase()}TOKEN`;
      captured.push({
        marker,
        identity: {
          source: displayName ?? (username ? `@${username}` : accountId ?? userKey ?? 'mention'),
          ...(username ? {username} : {}),
          ...(userKey ? {userKey, id: userKey} : {}),
          ...(accountId ? {accountId, id: accountId} : {}),
          ...(displayName ? {displayName} : {}),
        },
      });
      link.replaceWith(marker);
    });
    content = $('main[data-ywtc-comment-mentions]').html() ?? source;
  }

  const yfm = protectYfmMentions(content);
  captured.push(...yfm.mentions);
  content = yfm.content;
  const mentions: SafeCommentMentionResult['mentions'] = [];
  for (const mention of captured) {
    const presentation = prepareMentionPresentation(mention.identity, policy, {native: false, staticDestination: true});
    mentions.push({identity: mention.identity, presentation});
    content = content.split(mention.marker).join(markdownMention(presentation));
  }
  return {content, mentions};
}

function isWordBoundaryBefore(source: string, index: number): boolean {
  if (index === 0) return true;
  const previous = source[index - 1]!;
  if (previous === '\\' || /[\p{L}\p{N}._%+-]/u.test(previous)) return false;
  const tokenStart = Math.max(source.lastIndexOf(' ', index - 1), source.lastIndexOf('\n', index - 1), source.lastIndexOf('\t', index - 1)) + 1;
  return !source.slice(tokenStart, index).includes('://');
}

export function protectYfmMentions(source: string): ProtectedMentions {
  const mentions: ProtectedMention[] = [];
  const chunks: string[] = [];
  const markerNamespace = uniqueMarkerNamespace(source, 'YWTCMENTION', 16);
  let cursor = 0;
  let index = 0;
  let inlineCode = false;
  let fencedCode = false;
  let htmlTag = false;

  while (index < source.length) {
    if (!inlineCode && source.startsWith('```', index)) {
      fencedCode = !fencedCode;
      index += 3;
      continue;
    }
    const character = source[index]!;
    if (!fencedCode && character === '`') {
      inlineCode = !inlineCode;
      index += 1;
      continue;
    }
    if (!fencedCode && !inlineCode && character === '<') htmlTag = true;
    if (htmlTag && character === '>') {
      htmlTag = false;
      index += 1;
      continue;
    }
    if (character !== '@' || fencedCode || inlineCode || htmlTag || !isWordBoundaryBefore(source, index)) {
      index += 1;
      continue;
    }

    let end = index + 1;
    let username = '';
    if (source[end] === '{') {
      const close = source.indexOf('}', end + 1);
      if (close < 0 || close - end > 129) {
        index += 1;
        continue;
      }
      username = source.slice(end + 1, close);
      if (!username || [...username].some((value) => !usernameCharacter.test(value))) {
        index += 1;
        continue;
      }
      end = close + 1;
    } else {
      while (end < source.length && end - index <= 128 && usernameCharacter.test(source[end]!)) end += 1;
      while (end > index + 1 && /[.-]/u.test(source[end - 1]!)) end -= 1;
      username = source.slice(index + 1, end);
      if (!username) {
        index += 1;
        continue;
      }
    }

    const raw = source.slice(index, end);
    const marker = `YWTCMENTION${markerNamespace}${mentions.length.toString(36).toUpperCase()}TOKEN`;
    chunks.push(source.slice(cursor, index), marker);
    mentions.push({marker, identity: {source: raw, username}});
    cursor = end;
    index = end;
  }
  chunks.push(source.slice(cursor));
  const content = chunks.join('');
  return {
    content,
    mentions,
    restore(value: string): string {
      let restored = value;
      for (const mention of mentions) restored = restored.split(mention.marker).join(mention.identity.source);
      return restored;
    },
  };
}
