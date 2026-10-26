import {createHash} from 'node:crypto';
import {load} from 'cheerio';
import type {MentionIdentity, MentionPresentation, MentionProcessingPolicy, NormalizedMention, RawContentFormat} from './domain.js';
import {decisionIdentityKey, decisionPresentation} from './mention-decisions.js';

const usernameCharacter = /[\p{L}\p{N}._-]/u;

function namespace(source: string, prefix: string): string {
  const digest = createHash('sha256').update(source).digest('hex').slice(0, 16).toUpperCase();
  let result = digest, attempt = 0;
  while (source.includes(prefix + result)) result = `${digest}X${(++attempt).toString(36).toUpperCase()}`;
  return result;
}

interface ProtectedMention {marker: string; identity: MentionIdentity}
export interface ProtectedMentions {
  content: string;
  mentions: ProtectedMention[];
  restore(content: string): string;
}

function protectedResult(content: string, mentions: ProtectedMention[]): ProtectedMentions {
  const values = new Map(mentions.map(mention => [mention.marker, mention.identity.source]));
  return {content, mentions, restore: value => value.replace(/YWTC(?:CONFLUENCE)?MENTION[A-Z0-9]+TOKEN/g, marker => values.get(marker) ?? marker)};
}

export function prepareMentionPresentation(identity: MentionIdentity, policy: MentionProcessingPolicy): MentionPresentation {
  return policy.mode === 'off'
    ? {outcome: 'preserved', label: identity.source, retryable: false}
    : decisionPresentation(identity, policy.document);
}

export function mentionIdentityKey(identity: MentionIdentity): string {
  return decisionIdentityKey(identity) ?? `source:${identity.source}`;
}

/** Only the effective presentations of this object's identities affect its representation. */
export function mentionPolicyFingerprint(policy: MentionProcessingPolicy, identities?: readonly MentionIdentity[]): string {
  const selected = identities ?? (policy.mode === 'mapping'
    ? policy.document.entries.map(entry => ({...entry.identity, source: entry.mention})) : []);
  const values = [...new Map(selected.map(identity => {
    const presentation = prepareMentionPresentation(identity, policy);
    return [mentionIdentityKey(identity), presentation.outcome === 'linked'
      ? [mentionIdentityKey(identity), presentation.label, presentation.url] : [mentionIdentityKey(identity), 'preserved']];
  })).values()].sort((a, b) => String(a[0]).localeCompare(String(b[0])));
  return createHash('sha256').update(JSON.stringify(values)).digest('hex');
}

export async function resolveMentionPresentations(
  mentions: readonly NormalizedMention[],
  policy: MentionProcessingPolicy,
): Promise<Map<string, MentionPresentation>> {
  return new Map(mentions.map(mention => [mention.id, prepareMentionPresentation(mention.identity, policy)]));
}

export interface SafeCommentMentionResult {
  content: string;
  mentions: Array<{identity: MentionIdentity; presentation: MentionPresentation}>;
}
export function escapeMentionMarkdown(value: string): string {
  return value.replace(/([\\\x60*_[\]<>])/g, '\\$1');
}

export function renderSafeCommentMentions(
  source: string,
  policy: MentionProcessingPolicy,
  format: RawContentFormat = source.includes('ri:user') ? 'confluence-storage' : 'yfm',
  transform: (content: string) => string = content => content,
): SafeCommentMentionResult {
  const scanned = scanMentions(source, format);
  const replacements = new Map<string, string>();
  const mentions = scanned.mentions.map(mention => {
    const presentation = prepareMentionPresentation(mention.identity, policy);
    const label = escapeMentionMarkdown(presentation.label);
    const destination = presentation.url?.includes('(') || presentation.url?.includes(')') ? `<${presentation.url}>` : presentation.url;
    replacements.set(mention.marker, destination ? `[${label}](${destination})` : label);
    return {identity: mention.identity, presentation};
  });
  return {content: transform(scanned.content).replace(/YWTC(?:CONFLUENCE)?MENTION[A-Z0-9]+TOKEN/g, marker => replacements.get(marker) ?? marker), mentions};
}

export function protectConfluenceMentions(storage: string): {content: string; mentions: NormalizedMention[]} {
  const $ = load(`<main data-ywtc-mentions>${storage}</main>`, {xmlMode: true}, false);
  const mentions: NormalizedMention[] = [], markerNamespace = namespace(storage, 'YWTCCONFLUENCEMENTION');
  $('ac\\:link').each((_index, element) => {
    const link = $(element), user = link.children('ri\\:user').first();
    if (!user.length || link.parents('code,pre,script,style,ac\\:plain-text-body').length) return;
    const username = user.attr('ri:username'), userKey = user.attr('ri:userkey'), accountId = user.attr('ri:account-id');
    const displayName = link.children('ac\\:link-body,ac\\:plain-text-link-body').first().text().trim() || undefined;
    const source = displayName ?? (username ? `@${username}` : accountId ?? userKey ?? 'mention');
    const marker = `YWTCCONFLUENCEMENTION${markerNamespace}${mentions.length.toString(36).toUpperCase()}TOKEN`;
    mentions.push({id: `mention-${mentions.length}`, marker, identity: {
      source, ...(username ? {username} : {}), ...(userKey ? {userKey, id: userKey} : {}),
      ...(accountId ? {accountId, id: accountId} : {}), ...(displayName ? {displayName} : {}),
    }});
    link.replaceWith(marker);
  });
  return {content: $('main[data-ywtc-mentions]').html() ?? '', mentions};
}

export function scanMentions(source: string, format: RawContentFormat): ProtectedMentions {
  if (format === 'yfm') return protectYfmMentions(source);
  const result = protectConfluenceMentions(source);
  return protectedResult(result.content, result.mentions.map(mention => ({marker: mention.marker!, identity: mention.identity})));
}

/** Single pass; no repeated searches over unbounded prefixes or unterminated braces. */
export function protectYfmMentions(source: string): ProtectedMentions {
  const mentions: ProtectedMention[] = [], chunks: string[] = [];
  const markerNamespace = namespace(source, 'YWTCMENTION');
  let cursor = 0, index = 0, lineStart = 0, inlineTicks = 0, fenceWidth = 0, fenceCharacter = '';
  let tokenHasUrl = false, diagram = false, inTag = false, tagPrefix = '';
  const ignoredTags = new Set<string>();
  while (index < source.length) {
    const character = source[index]!;
    if (character === '\n') { lineStart = index + 1; tokenHasUrl = false; index++; continue; }
    if (/\s/u.test(character)) tokenHasUrl = false;
    if (source.startsWith('://', index)) tokenHasUrl = true;
    if (inTag) {
      if (tagPrefix.length < 128) tagPrefix += character;
      if (character === '>') {
        const tag = /^<\s*(\/?)\s*(code|pre|script|style)\b/i.exec(tagPrefix);
        if (tag) { if (tag[1]) ignoredTags.delete(tag[2]!.toLowerCase()); else ignoredTags.add(tag[2]!.toLowerCase()); }
        inTag = false;
      }
      index++;continue;
    }
    const leading = index - lineStart <= 3 && /^[ \t]*$/.test(source.slice(lineStart, index));
    if ((character === '\x60' || character === '~') && (leading || (!fenceWidth && character === '\x60'))) {
      let end = index + 1;while (source[end] === character) end++;
      const width = end - index;
      if (leading && width >= 3 && !inlineTicks) {
        if (!fenceWidth) { fenceWidth = width; fenceCharacter = character; }
        else if (character === fenceCharacter && width >= fenceWidth) { fenceWidth = 0; fenceCharacter = ''; }
      } else if (!fenceWidth && character === '\x60' && source[index - 1] !== '\\') {
        if (!inlineTicks) inlineTicks = width;else if (inlineTicks === width) inlineTicks = 0;
      }
      index = end;continue;
    }
    if (fenceWidth || inlineTicks) { index++;continue; }
    if (source.startsWith('{%', index)) {
      const token = source.slice(index, index + 256), end = token.indexOf('%}');
      if (end >= 0) {
        const directive = token.slice(0, end + 2);
        if (/^\{%\s*diagram\b/i.test(directive)) diagram = true;
        if (/^\{%\s*enddiagram\b/i.test(directive)) diagram = false;
        index += end + 2;continue;
      }
    }
    if (diagram) { index++;continue; }
    if (character === '<') { inTag = true;tagPrefix = '<';index++;continue; }
    const previous = source[index - 1];
    if (ignoredTags.size || character !== '@' || tokenHasUrl || (previous !== undefined && (previous === '\\' || /[\p{L}\p{N}._%+-]/u.test(previous)))) { index++;continue; }
    let end = index + 1, username = '';
    if (source[end] === '{') {
      const closeOffset = source.slice(end + 1, end + 130).indexOf('}');
      if (closeOffset < 0) { index++;continue; }
      const close = end + 1 + closeOffset;username = source.slice(end + 1, close);
      if (!username || [...username].some(value => !usernameCharacter.test(value))) { index++;continue; }
      end = close + 1;
    } else {
      while (end < source.length && end - index <= 128 && usernameCharacter.test(source[end]!)) end++;
      while (end > index + 1 && /[.-]/u.test(source[end - 1]!)) end--;
      username = source.slice(index + 1, end);
      if (!username) { index++;continue; }
    }
    const marker = `YWTCMENTION${markerNamespace}${mentions.length.toString(36).toUpperCase()}TOKEN`;
    chunks.push(source.slice(cursor, index), marker);
    mentions.push({marker, identity: {source: source.slice(index, end), username}});
    cursor = end;index = end;
  }
  chunks.push(source.slice(cursor));
  return protectedResult(chunks.join(''), mentions);
}
