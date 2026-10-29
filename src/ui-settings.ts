import { chmod } from 'node:fs/promises';
import path from 'node:path';
import { parseWorkspaceConfig } from './config.js';
import { decisionRevision, DecisionWorkspace } from './decision-workspace.js';
import { acquireExclusiveLease } from './exclusive-lease.js';
import {
	commitInteractiveConfig,
	createInteractiveConfigDocument,
	readExistingInteractiveConfig,
} from './interactive-config.js';
import { boundedPath } from './local-paths.js';
import { privateDirectory } from './jobs/store.js';
import type { Workspace } from './workspace.js';

export class SettingsRevisionError extends Error {}
async function existing(workspace: Workspace) {
	await boundedPath(workspace.root, path.basename(workspace.configFile), true);
	return readExistingInteractiveConfig(workspace);
}
export async function settingsSnapshot(workspace: Workspace) {
	const value = await existing(workspace);
	if (value?.error)
		throw new Error(
			'Workspace configuration is invalid; repair it with ywtc init before editing',
		);
	const data = value?.document?.toJS() ?? {
		defaults: { timeoutMs: 30_000, concurrency: 4 },
		connections: {},
		mentions: { mode: 'off' },
		hashtags: { mode: 'off' },
	};
	return {
		...data,
		revision: value?.fingerprint ?? decisionRevision(null),
		connections: Object.fromEntries(
			Object.entries(data.connections as Record<string, any>).map(
				([name, profile]) => {
					const { token, email, ...safe } = profile;
					return [
						name,
						{ ...safe, hasToken: Boolean(token), hasEmail: Boolean(email) },
					];
				},
			),
		),
	};
}
export async function updateSettings(
	workspace: Workspace,
	input: any,
): Promise<unknown> {
	await privateDirectory(workspace.statesDirectory);
	const lease = await acquireExclusiveLease(
		path.join(workspace.statesDirectory, 'ui-settings.lock'),
		'workspace settings',
		'ui',
	);
	try {
		const previous = await existing(workspace);
		if (input.revision !== (previous?.fingerprint ?? decisionRevision(null)))
			throw new SettingsRevisionError(
				'Configuration changed; reload before saving',
			);
		if (previous?.error) throw new Error('Invalid workspace configuration');
		const draft =
			previous?.document?.clone() ?? createInteractiveConfigDocument();
		const { revision: _revision, connections, ...rest } = input;
		for (const [key, value] of Object.entries(rest)) draft.set(key, value);
		if (connections) {
			const merged = Object.fromEntries(
				Object.entries(connections as Record<string, any>).map(
					([name, profile]) => {
						const prior = previous?.config?.profiles[name];
						const {
							hasToken: _t,
							hasEmail: _e,
							token,
							email,
							...fields
						} = profile;
						return [
							name,
							{
								...fields,
								token: token || prior?.token || '',
								...(email ||
								(prior?.type === 'confluence' ? prior.email : undefined)
									? { email: email || (prior as any).email }
									: {}),
							},
						];
					},
				),
			);
			draft.set('connections', merged);
		}
		parseWorkspaceConfig(draft.toJS(), workspace.configFile);
		await commitInteractiveConfig({
			workspace,
			document: draft,
			...(previous ? { original: previous } : {}),
			reset: false,
		});
		await chmod(workspace.configFile, 0o600);
		return settingsSnapshot(workspace);
	} finally {
		await lease.release();
	}
}
export async function activateDecision(
	workspace: Workspace,
	id: string,
	revision: string,
) {
	const catalog = await new DecisionWorkspace(workspace.root).get(id);
	if (!catalog.published)
		throw new Error('Publish a decision revision before activating it');
	const snapshot = await settingsSnapshot(workspace);
	return updateSettings(workspace, {
		...snapshot,
		revision,
		[catalog.kind]: {
			mode: 'mapping',
			mappingFile: `./.states/decisions/${id}/decisions.json`,
		},
	});
}
