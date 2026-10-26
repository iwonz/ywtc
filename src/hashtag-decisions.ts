import {z} from 'zod';
import {canonicalMentionInstance, parseMentionDecisions, safeMentionUrl} from './mention-decisions.js';

const hashtagPattern = /^#[\p{L}\p{N}\p{M}_-]+$/u;
export function validHashtag(value: string): boolean {return hashtagPattern.test(value) && /[\p{L}\p{N}]/u.test(value);}
const base = {tag: z.string().refine(validHashtag, 'hashtag required')};
const text = z.string().refine(value => value.trim().length > 0, 'nonempty literal text required');
const safeUrl = (value: string) => safeMentionUrl(value) && !/[<>]/u.test(value) && ![...value].some(character => character.codePointAt(0)! <= 32 || character.codePointAt(0) === 127);
const entrySchema = z.discriminatedUnion('decision', [
  z.object({...base, decision: z.literal('skip')}).strict(),
  z.object({...base, decision: z.literal('text'), text}).strict(),
  z.object({...base, decision: z.literal('url'), url: z.string().refine(safeUrl), text: text.optional()}).strict(),
]);
const documentSchema = z.object({
  source: z.object({provider: z.enum(['yandex-wiki', 'confluence']), instance: z.string()}).strict(),
  entries: z.array(z.unknown()), inventory: z.unknown().optional(),
}).strict();
export type HashtagDecisionEntry = z.infer<typeof entrySchema> & {occurrences?: import('./mention-decisions.js').MentionOccurrence[]};
export interface HashtagDecisionDocument {
  source: {provider: 'yandex-wiki' | 'confluence'; instance: string};
  entries: HashtagDecisionEntry[];
  inventory?: import('./mention-decisions.js').MentionDecisionDocument['inventory'];
}
export interface HashtagPresentation {outcome: 'preserved' | 'text' | 'linked'; label: string; url?: string}
export const hashtagRecordSchema = z.object({
  id: z.string(), tag: z.string(), location: z.enum(['page', 'comment']), commentId: z.string().optional(),
  outcome: z.enum(['preserved', 'text', 'linked']), label: z.string(), url: z.string().optional(),
  verification: z.enum(['pending', 'verified', 'unverified']),
}).strict();
export type HashtagRecord = z.infer<typeof hashtagRecordSchema>;
const count = z.number().int().nonnegative();
export const hashtagSummarySchema = z.object({mode: z.enum(['off', 'mapping']), total: count, unique: count, page: count, comment: count, preserved: count, text: count, linked: count, verified: count}).strict().refine(value => value.page + value.comment === value.total && value.preserved + value.text + value.linked === value.total && value.unique <= value.total && value.verified <= value.total, 'inconsistent hashtag totals');
export type HashtagSummary = z.infer<typeof hashtagSummarySchema>;
export function verifiedHashtagRecords(records: HashtagRecord[], pageStatus: string, commentStatus: string, dryRun: boolean): HashtagRecord[] {
  return records.map(item => {
    const status = item.location === 'page' ? pageStatus : commentStatus;
    const verified = item.location === 'page' ? ['complete', 'partial'].includes(status) : status === 'complete';
    return {...item, verification: dryRun ? 'pending' : verified ? 'verified' : ['failed', 'partial', 'conflict'].includes(status) ? 'unverified' : 'pending'};
  });
}
export function summarizeHashtags(records: HashtagRecord[], mode: 'off' | 'mapping'): HashtagSummary {
  const result: HashtagSummary = {mode, total: records.length, unique: new Set(records.map(item => item.tag)).size, page: 0, comment: 0, preserved: 0, text: 0, linked: 0, verified: 0};
  for (const item of records) {result[item.location]++;result[item.outcome]++;if (item.verification === 'verified') result.verified++;}
  return result;
}
export type HashtagProcessingPolicy = {mode: 'off'} | {mode: 'mapping'; document: HashtagDecisionDocument};

export function parseHashtagDecisions(value: unknown): HashtagDecisionDocument {
  try {
    const parsed = documentSchema.parse(value), seen = new Set<string>();
    const entries = parsed.entries.map((item, index) => {
      const raw = z.object({occurrences: z.unknown().optional()}).passthrough().parse(item);
      const {occurrences, ...decision} = raw;
      const entry = entrySchema.parse(decision);
      if (seen.has(entry.tag)) throw new Error(`entries.${index}.tag duplicate`);
      seen.add(entry.tag);
      return {...entry, ...(occurrences !== undefined ? {occurrences} : {})};
    });
    // Share occurrence/inventory validation without making hashtag identities case-insensitive.
    const metadata = parseMentionDecisions({source: parsed.source, entries: entries.map((entry, index) => ({identity: {id: String(index)}, mention: entry.tag, decision: 'skip', ...('occurrences' in entry ? {occurrences: entry.occurrences} : {})})), ...(parsed.inventory !== undefined ? {inventory: parsed.inventory} : {})});
    return {source: {...metadata.source, instance: canonicalMentionInstance(metadata.source.instance)}, entries: entries.map((entry, index) => ({...entry, ...(metadata.entries[index]?.occurrences ? {occurrences: metadata.entries[index]!.occurrences!} : {})})) as HashtagDecisionEntry[], ...(metadata.inventory ? {inventory: metadata.inventory} : {})};
  } catch (error) {
    const detail = error instanceof z.ZodError ? error.issues.flatMap(issue => issue.code === 'unrecognized_keys' ? issue.keys.map(key => [...issue.path, key].join('.')) : [issue.path.join('.') || 'document']).join(', ') : (error as Error).message;
    throw new Error(`Invalid hashtag decisions: ${detail}`);
  }
}
const indexes = new WeakMap<HashtagDecisionDocument, Map<string, HashtagDecisionEntry>>();
export function hashtagPresentation(tag: string, policy: HashtagProcessingPolicy): HashtagPresentation {
  if (policy.mode === 'off') return {outcome: 'preserved', label: tag};
  let index = indexes.get(policy.document);
  if (!index) {index = new Map(policy.document.entries.map(entry => [entry.tag, entry]));indexes.set(policy.document, index);}
  const entry = index.get(tag);
  if (!entry || entry.decision === 'skip') return {outcome: 'preserved', label: tag};
  return entry.decision === 'text' ? {outcome: 'text', label: entry.text} : {outcome: 'linked', label: entry.text ?? tag, url: entry.url};
}
