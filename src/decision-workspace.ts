import { createHash, randomUUID } from 'node:crypto';
import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import { z } from 'zod';
import type { MentionIdentity } from './domain.js';
import { acquireExclusiveLease } from './exclusive-lease.js';
import {
	type HashtagDecisionDocument,
	parseHashtagDecisions,
} from './hashtag-decisions.js';
import { scanHashtags } from './hashtags.js';
import { atomicJson, privateDirectory } from './jobs/store.js';
import { boundedPath } from './local-paths.js';
import {
	decisionIdentityKey,
	type MentionDecisionDocument,
	parseMentionDecisions,
} from './mention-decisions.js';
import { collectMentionDecisions } from './mention-export.js';
import { scanMentions } from './mentions.js';

export type DecisionKind = 'mentions' | 'hashtags';
export type DecisionDocument =
	| MentionDecisionDocument
	| HashtagDecisionDocument;
export interface DecisionCatalog {
	id: string;
	kind: DecisionKind;
	revision: string;
	published: boolean;
	document: DecisionDocument;
	updatedAt: string;
	staleKeys?: string[];
}
export const decisionRevision = (value: unknown): string =>
	createHash('sha256').update(JSON.stringify(value)).digest('hex');
function validateDecision(
	kind: DecisionKind,
	value: unknown,
): DecisionDocument {
	return kind === 'mentions'
		? parseMentionDecisions(value)
		: parseHashtagDecisions(value);
}
function decisionKey(
	kind: DecisionKind,
	entry: DecisionDocument['entries'][number],
): string {
	return kind === 'hashtags'
		? (entry as HashtagDecisionDocument['entries'][number]).tag
		: decisionIdentityKey(
				(entry as MentionDecisionDocument['entries'][number]).identity,
			)!;
}
export async function collectDecisionCatalogs(
	input: Parameters<typeof collectMentionDecisions>[0] & {
		kinds: DecisionKind[];
	},
): Promise<{
	mentions?: MentionDecisionDocument;
	hashtags?: HashtagDecisionDocument;
}> {
	const originals = new Map<string, MentionIdentity>();
	const combined = await collectMentionDecisions({
		...input,
		scanIdentities: (content, format) => {
			const items: MentionIdentity[] = [];
			if (input.kinds.includes('mentions'))
				for (const mention of scanMentions(content, format).mentions) {
					const key = decisionIdentityKey(mention.identity);
					if (!key) {
						items.push(mention.identity);
						continue;
					}
					const id = `mention:${key}`;
					originals.set(id, mention.identity);
					items.push({ id, source: mention.identity.source });
				}
			if (input.kinds.includes('hashtags'))
				for (const hashtag of scanHashtags(content, format).hashtags)
					items.push({ id: `hashtag:${hashtag.tag}`, source: hashtag.tag });
			return items;
		},
	});
	const result: {
		mentions?: MentionDecisionDocument;
		hashtags?: HashtagDecisionDocument;
	} = {};
	if (input.kinds.includes('mentions'))
		result.mentions = parseMentionDecisions({
			source: combined.source,
			inventory: combined.inventory,
			entries: combined.entries
				.filter((entry) => entry.identity.id?.startsWith('mention:'))
				.map((entry) => {
					const identity = originals.get(entry.identity.id!)!,
						{ username, userKey, accountId, id } = identity;
					return {
						...entry,
						identity: {
							...(username ? { username } : {}),
							...(userKey ? { userKey } : {}),
							...(accountId ? { accountId } : {}),
							...(id ? { id } : {}),
						},
					};
				}),
		});
	if (input.kinds.includes('hashtags'))
		result.hashtags = parseHashtagDecisions({
			source: combined.source,
			inventory: combined.inventory,
			entries: combined.entries
				.filter((entry) => entry.identity.id?.startsWith('hashtag:'))
				.map((entry) => ({
					tag: entry.identity.id!.slice(8),
					decision: 'skip',
					occurrences: entry.occurrences,
				})),
		});
	return result;
}
export function mergeDecisionCatalog(
	kind: DecisionKind,
	previous: DecisionDocument,
	scanned: DecisionDocument,
): { document: DecisionDocument; staleKeys: string[] } {
	if (JSON.stringify(previous.source) !== JSON.stringify(scanned.source))
		throw new Error('Decision source binding mismatch');
	const prior = new Map(
		previous.entries.map((entry) => [decisionKey(kind, entry), entry]),
	);
	const current = new Map(
		scanned.entries.map((entry) => [decisionKey(kind, entry), entry]),
	);
	const entries = scanned.entries.map((entry) => ({
		...(prior.get(decisionKey(kind, entry)) ?? entry),
		occurrences: entry.occurrences,
	}));
	const stale = [...prior].filter(([key]) => !current.has(key));
	return {
		document: validateDecision(kind, {
			...scanned,
			entries: [...entries, ...stale.map(([, entry]) => entry)],
		}),
		staleKeys: stale.map(([key]) => key),
	};
}
export class DecisionWorkspace {
	constructor(readonly workdir: string) {}
	filename(id: string, file = 'catalog.json'): string {
		if (!z.string().uuid().safeParse(id).success)
			throw new Error('Invalid catalog ID');
		return path.join(this.workdir, '.states', 'decisions', id, file);
	}
	async get(id: string): Promise<DecisionCatalog> {
		const filename = await boundedPath(
			this.workdir,
			path.relative(this.workdir, this.filename(id)),
		);
		const raw = JSON.parse(await readFile(filename, 'utf8')) as DecisionCatalog;
		if (
			raw.id !== id ||
			!['mentions', 'hashtags'].includes(raw.kind) ||
			typeof raw.revision !== 'string' ||
			typeof raw.published !== 'boolean'
		)
			throw new Error('Invalid decision catalog');
		const document = validateDecision(raw.kind, raw.document);
		if (decisionRevision(document) !== raw.revision)
			throw new Error('Decision catalog checksum mismatch');
		if (raw.published) {
			const publishedPath = await boundedPath(
				this.workdir,
				path.relative(this.workdir, this.filename(id, 'decisions.json')),
			);
			if (
				decisionRevision(
					validateDecision(
						raw.kind,
						JSON.parse(await readFile(publishedPath, 'utf8')),
					),
				) !== raw.revision
			)
				throw new Error('Published decision revision changed on disk');
		}
		return { ...raw, document };
	}
	async list(): Promise<DecisionCatalog[]> {
		let names: string[];
		try {
			names = await readdir(path.join(this.workdir, '.states', 'decisions'));
		} catch (error) {
			if ((error as NodeJS.ErrnoException).code === 'ENOENT') return [];
			throw error;
		}
		return Promise.all(
			names
				.filter((name) => z.string().uuid().safeParse(name).success)
				.map((id) => this.get(id)),
		);
	}
	async save(
		kind: DecisionKind,
		value: unknown,
		id: string = randomUUID(),
		expected?: string,
		staleKeys?: string[],
	): Promise<DecisionCatalog> {
		const document = validateDecision(kind, value),
			filename = this.filename(id);
		await boundedPath(
			this.workdir,
			path.relative(this.workdir, filename),
			true,
		);
		await privateDirectory(path.dirname(filename));
		const lease = await acquireExclusiveLease(
			`${filename}.lock`,
			'decision draft',
			id,
		);
		try {
			let previous: DecisionCatalog | undefined;
			try {
				previous = await this.get(id);
			} catch (error) {
				if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
			}
			if (previous?.published)
				throw new Error('Published decision revision is immutable');
			if (
				previous &&
				(expected !== previous.revision || previous.kind !== kind)
			)
				throw new Error('Decision revision changed; reload before saving');
			const catalog: DecisionCatalog = {
				id,
				kind,
				document,
				revision: decisionRevision(document),
				published: false,
				updatedAt: new Date().toISOString(),
				...((staleKeys ?? previous?.staleKeys)
					? { staleKeys: staleKeys ?? previous!.staleKeys! }
					: {}),
			};
			await atomicJson(filename, catalog);
			return catalog;
		} finally {
			await lease.release();
		}
	}
	async publish(id: string, expected: string): Promise<DecisionCatalog> {
    const lease = await acquireExclusiveLease(`${this.filename(id)}.lock`, 'decision publication', id);
    try {
		const draft = await this.get(id);
		if (draft.revision !== expected)
			throw new Error('Decision revision changed');
		if (draft.published) return draft;
		const result = {
			...draft,
			id: randomUUID(),
			published: true,
			updatedAt: new Date().toISOString(),
		};
		await atomicJson(
			this.filename(result.id, 'decisions.json'),
			result.document,
		);
		await atomicJson(this.filename(result.id), result);
		return result;
    } finally {await lease.release();}
	}
}
