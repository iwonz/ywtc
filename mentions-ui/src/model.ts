import {decisionIdentityKey, type MentionDecisionDocument, type MentionDecisionEntry, parseMentionDecisions } from '../../src/mention-decisions.js';

export function filterDecisions<T extends {decision: string}>(entries: T[], search: string, filter: string): Array<{entry: T; index: number}> {
  const query = search.toLowerCase().trim();
  return entries.flatMap((entry, index) => (filter === 'all' || entry.decision === filter) && (!query || JSON.stringify(entry).toLowerCase().includes(query)) ? [{entry, index}] : []);
}
function decisionRowError(entry: MentionDecisionEntry): string | undefined {
  try {parseMentionDecisions({source: {provider: 'yandex-wiki', instance: 'https://example.com'}, entries: [entry]});return undefined;}
  catch {return `Строка ${decisionIdentityKey(entry.identity)}: укажите абсолютный HTTP(S) URL без credentials и непустой текст (или оставьте текст по умолчанию).`;}
}
export function serializeDecisions(document: MentionDecisionDocument): string {
  for (const entry of document.entries) {const error = decisionRowError(entry);if (error) throw new Error(error);}
  return `${JSON.stringify(parseMentionDecisions(document), null, 2)}\n`;
}
