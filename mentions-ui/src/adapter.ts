import {type HashtagDecisionEntry, parseHashtagDecisions} from '../../src/hashtag-decisions.js';
import {decisionIdentityKey, type MentionDecisionDocument, type MentionDecisionEntry, parseMentionDecisions} from '../../src/mention-decisions.js';

export type EditorKind = 'mentions' | 'hashtags';
export type EditorEntry = MentionDecisionEntry | HashtagDecisionEntry;
export type EditorDocument = Omit<MentionDecisionDocument, 'entries'> & {entries: EditorEntry[]};
export function entryName(entry: EditorEntry): string {return 'tag' in entry ? entry.tag : entry.mention;}
export function entryKey(entry: EditorEntry): string {return 'tag' in entry ? entry.tag : decisionIdentityKey(entry.identity)!;}
export function defaultLabel(entry: EditorEntry): string {return 'tag' in entry ? entry.tag : entry.identity.username ? `@${entry.identity.username}` : entry.mention;}
export function parseDocument(value: unknown, kind: EditorKind): EditorDocument {return kind === 'hashtags' ? parseHashtagDecisions(value) : parseMentionDecisions(value);}
export function rowError(entry: EditorEntry): string | undefined {
  try {parseDocument({source: {provider: 'yandex-wiki', instance: 'https://example.com'}, entries: [entry]}, 'tag' in entry ? 'hashtags' : 'mentions');return undefined;}
  catch {return `Строка ${entryKey(entry)}: укажите корректное решение, абсолютный HTTP(S) URL без credentials и непустой текст.`;}
}
export function changeDecision(entry: EditorEntry, decision: string): EditorEntry {
  const metadata = entry.occurrences ? {occurrences: entry.occurrences} : {};
  if ('tag' in entry) {
    const base = {tag: entry.tag, ...metadata};
    if (decision === 'text') return {...base, decision, text: 'text' in entry && entry.text ? entry.text : entry.tag};
    return decision === 'url' ? {...base, decision, url: ''} : {...base, decision: 'skip'};
  }
  const base = {identity: entry.identity, mention: entry.mention, ...metadata};
  return decision === 'url' ? {...base, decision, url: ''} : {...base, decision: 'skip'};
}
export function changeText(entry: Exclude<EditorEntry, {decision: 'skip'}>, value: string): EditorEntry {
  if (entry.decision === 'text') return {...entry, text: value};
  const {text: _text, ...rest} = entry;
  return value === '' ? rest : {...entry, text: value};
}
export function serializeDocument(document: EditorDocument, kind: EditorKind): string {
  for (const entry of document.entries) {const error = rowError(entry);if (error) throw new Error(error);}
  return `${JSON.stringify(parseDocument(document, kind), null, 2)}\n`;
}
