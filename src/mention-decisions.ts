import {z} from 'zod';
import type {MentionIdentity, MentionPresentation} from './domain.js';

export function safeMentionUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return value === value.trim() && ['https:', 'http:'].includes(url.protocol) && !url.username && !url.password;
  } catch { return false; }
}

export function canonicalMentionInstance(value: string): string {
  const url = new URL(value);
  if (!safeMentionUrl(value) || url.search || url.hash) throw new Error('Invalid source.instance');
  return `${url.origin}${url.pathname.replace(/\/+$/, '')}`;
}

export function decisionIdentityKey(identity: {accountId?: string | undefined; userKey?: string | undefined; username?: string | undefined; id?: string | undefined}): string | undefined {
  if (identity.accountId) return `accountId:${identity.accountId}`;
  if (identity.userKey) return `userKey:${identity.userKey}`;
  if (identity.username) return `username:${identity.username.toLowerCase()}`;
  if (identity.id) return `id:${identity.id}`;
  return undefined;
}

const identity = z.object({
  username: z.string().trim().min(1).optional(), accountId: z.string().trim().min(1).optional(),
  userKey: z.string().trim().min(1).optional(), id: z.string().trim().min(1).optional(),
}).strict().refine(value => decisionIdentityKey(value) !== undefined, 'source identity is required');
const occurrence = z.object({
  pageId: z.string().min(1), pageTitle: z.string(), pageUrl: z.string().refine(safeMentionUrl),
  location: z.enum(['page', 'comment']), commentId: z.string().min(1).optional(), count: z.number().int().positive(),
}).strict().refine(value => value.location === 'page' || Boolean(value.commentId), 'commentId is required');
const entryBase = {identity, mention: z.string().min(1), occurrences: z.array(occurrence).optional()};
const entrySchema = z.discriminatedUnion('decision', [
  z.object({...entryBase, decision: z.literal('skip')}).strict(),
  z.object({...entryBase, decision: z.literal('url'), url: z.string().refine(safeMentionUrl, 'absolute HTTP(S) URL without credentials required'), text: z.string().refine(value => value.trim().length > 0, 'nonempty text required').optional()}).strict(),
]);
const inventoryIssue = z.object({
  pageId: z.string().optional(), phase: z.enum(['discovery', 'page', 'comment']),
  code: z.string().min(1), message: z.string().min(1), retryable: z.boolean(),
}).strict();
const inventory = z.object({
  complete: z.boolean(), selectedPages: z.number().int().nonnegative(), scannedPages: z.number().int().nonnegative(),
  scannedComments: z.number().int().nonnegative(), issues: z.array(inventoryIssue),
}).strict().refine(value => value.scannedPages <= value.selectedPages && (!value.complete || value.issues.length === 0), 'inventory totals or completeness are inconsistent');
const documentSchema = z.object({
  source: z.object({provider: z.enum(['yandex-wiki', 'confluence']), instance: z.string().transform((value, context) => {
    try { return canonicalMentionInstance(value); } catch { context.addIssue({code: 'custom', message: 'canonical HTTP(S) instance required'}); return z.NEVER; }
  })}).strict(),
  entries: z.array(entrySchema), inventory: inventory.optional(),
}).strict().superRefine((value, context) => {
  const seen = new Set<string>();
  for (const [index, entry] of value.entries.entries()) {
    const key = decisionIdentityKey(entry.identity)!;
    if (seen.has(key)) context.addIssue({code: 'custom', path: ['entries', index, 'identity'], message: 'duplicate source identity'});
    seen.add(key);
  }
});

export type MentionDecisionDocument = z.infer<typeof documentSchema>;
export type MentionDecisionEntry = MentionDecisionDocument['entries'][number];
export type MentionOccurrence = z.infer<typeof occurrence>;
export type MentionInventoryIssue = z.infer<typeof inventoryIssue>;

export function parseMentionDecisions(value: unknown): MentionDecisionDocument {
  const parsed = documentSchema.safeParse(value);
  if (parsed.success) return parsed.data;
  const fields = parsed.error.issues.flatMap(issue => issue.code === 'unrecognized_keys'
    ? issue.keys.map(key => [...issue.path, key].map(String).join('.'))
    : [issue.path.map(String).join('.') || 'document']);
  throw new Error(`Invalid mention decisions: ${[...new Set(fields)].join(', ')}`);
}

const indexes = new WeakMap<MentionDecisionDocument, Map<string, MentionDecisionEntry>>();
export function decisionPresentation(identity: MentionIdentity, document: MentionDecisionDocument): MentionPresentation {
  let index = indexes.get(document);
  if (!index) { index = new Map(document.entries.map(entry => [decisionIdentityKey(entry.identity)!, entry])); indexes.set(document, index); }
  const key = decisionIdentityKey(identity), entry = key ? index.get(key) : undefined;
  if (!entry || entry.decision === 'skip') return {outcome: 'preserved', label: identity.source, retryable: false};
  return {outcome: 'linked', label: entry.text ?? (entry.identity.username ? `@${entry.identity.username}` : entry.mention), url: entry.url, retryable: false};
}
