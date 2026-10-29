import { z } from 'zod';

export const uuid = z.string().uuid();
const locator = z
	.string()
	.trim()
	.min(1)
	.refine((value) => {
		if (!/^https?:/i.test(value)) return true;
		try {
			const url = new URL(value);
			return !url.username && !url.password;
		} catch {
			return false;
		}
	}, 'locator must not contain credentials');
const source = {
	source: locator,
	sourceProfile: z.string().min(1).optional(),
	scope: z.enum(['page', 'subtree', 'linked']),
	sourceStatus: z.enum(['all', 'current']),
	comments: z.boolean(),
	concurrency: z.number().int().min(1).max(64).optional(),
};
export const targetSelectionSchema = z
	.object({
		pageIds: z.array(z.string()).default([]),
		resourceIds: z.record(z.string(), z.array(z.string())).default({}),
		commentPageIds: z.array(z.string()).default([]),
		terminalOverride: z.boolean().default(false),
	})
	.strict();
export type TargetSelection = z.infer<typeof targetSelectionSchema>;
export const jobRequestSchema = z.discriminatedUnion('kind', [
	z
		.object({
			kind: z.literal('migrate'),
			...source,
			destination: locator,
			destinationProfile: z.string().optional(),
			format: z.enum(['markdown', 'html']).optional(),
			archive: z.boolean(),
			dryRun: z.boolean(),
			fresh: z.boolean().optional(),
			rewrite: z.boolean().optional(),
			stateFilename: z.string().optional(),
		})
		.strict(),
	z
		.object({
			kind: z.literal('retry'),
			runId: uuid,
			dryRun: z.boolean(),
			concurrency: source.concurrency,
			rewrite: z.boolean().optional(),
		})
		.strict(),
	z
		.object({
			kind: z.literal('scan'),
			...source,
			kinds: z.array(z.enum(['mentions', 'hashtags'])).min(1),
			output: z.string().min(1).optional(),
			catalogId: uuid.optional(),
		})
		.strict(),
	z
		.object({
			kind: z.literal('targeted'),
			runId: uuid,
			selection: targetSelectionSchema,
			action: z.enum(['retry', 'decisions']),
			dryRun: z.boolean(),
			previewId: uuid.optional(),
			revisions: z
				.object({
					mentions: z.string().optional(),
					hashtags: z.string().optional(),
				})
				.strict()
				.optional(),
		})
		.strict(),
]);
export type JobRequest = z.infer<typeof jobRequestSchema>;
const jobStatuses = [
	'queued',
	'running',
	'stopping',
	'finished',
	'interrupted',
] as const;
export type JobStatus = (typeof jobStatuses)[number];
const jobResultSchema = z
	.object({
		exitCode: z.number().int(),
		status: z.enum([
			'completed',
			'completed-with-warnings',
			'partial',
			'failed',
			'cancelled',
			'interrupted',
		]),
		runId: uuid.optional(),
		reportHtml: z.string().optional(),
		reportJson: z.string().optional(),
		output: z.string().optional(),
		catalogId: uuid.optional(),
		previewId: uuid.optional(),
	})
	.strict();
export type JobResult = z.infer<typeof jobResultSchema>;
export const jobSchema = z
	.object({
		id: uuid,
		request: jobRequestSchema,
		status: z.enum(jobStatuses),
		createdAt: z.string(),
		updatedAt: z.string(),
		lastSequence: z.number().int().nonnegative(),
		pid: z.number().int().positive().optional(),
		nonce: z.string().optional(),
		runId: uuid.optional(),
		result: jobResultSchema.optional(),
		error: z.string().optional(),
		heartbeatAt: z.string().optional(),
		progress: z.unknown().optional(),
		inventory: z.record(z.string(), z.number().nonnegative()).optional(),
	})
	.strict();
export type Job = z.infer<typeof jobSchema>;
