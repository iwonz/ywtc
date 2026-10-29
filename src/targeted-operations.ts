import { buildRetryPlan, type RetryPlan } from './retry-plan.js';
import type { TransferReportData } from './report-contract.js';
import type { TargetSelection } from './jobs/contracts.js';
import { decisionRevision } from './decision-workspace.js';

export class StalePreviewError extends Error {
	constructor() {
		super('Preview evidence changed; prepare and confirm a new preview');
		this.name = 'StalePreviewError';
	}
}
export function assertPreviewEvidence(
	expected: Record<string, string>,
	actual: Record<string, string>,
): void {
	const ordered = (value: Record<string, string>) =>
		Object.entries(value).sort(([a], [b]) => a.localeCompare(b));
	if (decisionRevision(ordered(expected)) !== decisionRevision(ordered(actual)))
		throw new StalePreviewError();
}
export function buildOperatorPlan(
	report: TransferReportData,
	selection: TargetSelection,
	action: 'retry' | 'decisions',
): RetryPlan {
	const automatic = buildRetryPlan(report),
		byId = new Map(report.pages.map((page) => [page.sourceCanonicalId, page]));
	const plan: RetryPlan = {
		...automatic,
		pages: structuredClone(automatic.pages),
		retryPageIds: [],
		contextPageIds: [],
		selectedResourceIds: {},
		selectedCommentPageIds: [],
		remainingRetryable: 0,
	};
	for (const item of Object.values(plan.pages)) {
		item.retryPage = false;
		item.resourceIds = [];
		item.retryComments = false;
		item.decision =
			item.decision === 'resolved' || item.decision === 'context'
				? 'resolved'
				: 'terminal';
	}
	const check = (id: string) => {
		const page = byId.get(id);
		if (!page) throw new Error(`Unknown selected page ${id}`);
		if (
			page.status === 'conflict' ||
			page.conflictEvidence ||
			report.issues.some(
				(issue) =>
					issue.pageId === id &&
					issue.code === 'destination-ownership-ambiguity' &&
					issue.lifecycle !== 'resolved',
			)
		)
			throw new Error(
				`Ownership/identity ambiguity cannot be overridden: ${id}`,
			);
		const owners = report.pages.filter(
			(other) =>
				page.destinationId && other.destinationId === page.destinationId,
		);
		if (owners.length > 1)
			throw new Error(`Ambiguous immutable destination identity for ${id}`);
		return page;
	};
	const select = (id: string) => {
		check(id);
		const item = plan.pages[id]!;
		item.decision = 'retry';
		if (!plan.retryPageIds.includes(id)) plan.retryPageIds.push(id);
		return item;
	};
	for (const id of new Set(selection.pageIds)) {
		const page = check(id);
		if (action === 'retry' && page.status === 'complete')
			throw new Error(
				'Complete pages require decisions application or ordinary migrate',
			);
		if (
			action === 'retry' &&
			!automatic.pages[id]?.retryPage &&
			!selection.terminalOverride
		)
			throw new Error(`Terminal page requires confirmation: ${id}`);
		select(id).retryPage = true;
	}
	for (const [id, resources] of Object.entries(selection.resourceIds)) {
		if (!resources.length) continue;
		const page = check(id),
			item = select(id);
		for (const resourceId of new Set(resources)) {
			const resource = page.resourceItems.find(
				(resource) => resource.sourceId === resourceId,
			);
			if (!resource)
				throw new Error(`Unknown selected resource ${resourceId} on ${id}`);
			if (action === 'retry' && resource.status === 'complete')
				throw new Error(`Resource is already complete: ${resourceId}`);
			if (
				action === 'retry' &&
				!automatic.pages[id]?.resourceIds.includes(resourceId) &&
				!selection.terminalOverride
			)
				throw new Error(
					`Terminal resource requires confirmation: ${resourceId}`,
				);
			item.resourceIds.push(resourceId);
		}
	}
	for (const id of new Set(selection.commentPageIds)) {
		if (report.commentsEnabled === false)
			throw new Error('Comment archives were disabled in this migration');
		check(id);
		if (
			action === 'retry' &&
			!automatic.pages[id]?.retryComments &&
			!selection.terminalOverride
		)
			throw new Error(`Terminal comment archive requires confirmation: ${id}`);
		select(id).retryComments = true;
	}
	let expanded = true;
	while (expanded) {
		expanded = false;
		for (const page of report.pages) {
			if (
				page.status !== 'blocked' ||
				!page.blockedByPageId ||
				!plan.pages[page.blockedByPageId]?.retryPage ||
				plan.retryPageIds.includes(page.sourceCanonicalId)
			)
				continue;
			const item = select(page.sourceCanonicalId);
			item.retryPage = true;
			item.retryComments = !['complete', 'skipped'].includes(
				page.comments.status,
			);
			item.resourceIds = page.resourceItems
				.filter((resource) =>
					['blocked', 'not-started'].includes(resource.status),
				)
				.map((resource) => resource.sourceId);
			expanded = true;
		}
	}
	const selected = new Set(plan.retryPageIds),
		contexts = new Set<string>();
	for (const id of selected) {
		const visited = new Set<string>();
		let page = byId.get(id);
		while (page) {
			const parent =
				page.projectedParentId ?? page.sourceParentId ?? page.parentId;
			if (!parent || !byId.has(parent)) break;
			if (visited.has(parent))
				throw new Error('Hierarchy cycle prevents a safe targeted plan');
			visited.add(parent);
			check(parent);
			if (!selected.has(parent)) contexts.add(parent);
			page = byId.get(parent);
		}
	}
	plan.contextPageIds = [...contexts];
	for (const id of contexts)
		if (plan.pages[id]?.decision === 'resolved')
			plan.pages[id]!.decision = 'context';
	for (const id of selected) {
		const item = plan.pages[id]!;
		if (item.resourceIds.length)
			plan.selectedResourceIds[id] = item.resourceIds;
		if (item.retryComments) plan.selectedCommentPageIds.push(id);
	}
	plan.remainingRetryable = selected.size;
	plan.remainingTerminal = Object.values(plan.pages).filter(
		(item) => item.decision === 'terminal',
	).length;
	plan.carriedForward = report.pages.length - selected.size;
	plan.discoveryIncomplete = false;
	return plan;
}
