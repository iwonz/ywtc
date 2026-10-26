import {readFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {type HashtagDecisionDocument, parseHashtagDecisions} from './hashtag-decisions.js';
import {collectMentionDecisions, writeDecisionBundle} from './mention-export.js';
import {scanHashtags} from './hashtags.js';

export async function collectHashtagDecisions(input: Parameters<typeof collectMentionDecisions>[0]): Promise<HashtagDecisionDocument> {
  const document = await collectMentionDecisions({...input, scanIdentities: (content, format) => scanHashtags(content, format).hashtags.map(item => ({id: item.tag, source: item.tag})),
    onProgress: message => input.onProgress?.(message.replaceAll('mentions', 'hashtags').replaceAll('identities', 'tags')),
  });
  return parseHashtagDecisions({source: document.source, entries: document.entries.map(entry => ({tag: entry.identity.id!, decision: 'skip', ...(entry.occurrences ? {occurrences: entry.occurrences} : {})})), ...(document.inventory ? {inventory: {...document.inventory, issues: document.inventory.issues.map(issue => ({...issue, code: issue.code.replace(/^mention-/, 'hashtag-')}))}} : {})});
}
export async function writeHashtagBundle(directory: string, document: HashtagDecisionDocument, shell?: string): Promise<{json: string; html: string; url: string}> {
  const template = shell ?? await readFile(fileURLToPath(new URL(import.meta.url.includes('/src/') ? '../dist/mentions-ui/index.html' : './mentions-ui/index.html', import.meta.url)), 'utf8');
  if (!template.includes('id="ywtc-mentions-data"')) throw new Error('Decision editor is missing its data element');
  return writeDecisionBundle(directory, parseHashtagDecisions(document), template.replace('id="ywtc-mentions-data"', 'id="ywtc-mentions-data" data-kind="hashtags"'));
}
