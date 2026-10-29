import { chmod } from "node:fs/promises";
import path from "node:path";
import { parseWorkspaceConfig } from "./config.js";
import { decisionRevision, DecisionWorkspace } from "./decision-workspace.js";
import { acquireExclusiveLease } from "./exclusive-lease.js";
import {
	commitInteractiveConfig,
	createInteractiveConfigDocument,
	readExistingInteractiveConfig,
} from "./interactive-config.js";
import { boundedPath } from "./local-paths.js";
import { privateDirectory } from "./jobs/store.js";
import type { Workspace } from "./workspace.js";
import { inspectSettings, settingsRecord } from "./ui-settings-model.js";

export class SettingsRevisionError extends Error {}
async function existing(workspace: Workspace) {
	await boundedPath(workspace.root, path.basename(workspace.configFile), true);
	return readExistingInteractiveConfig(workspace);
}
export async function settingsSnapshot(workspace: Workspace) {
	const value = await existing(workspace);
	const { data, validation } = inspectSettings(value, workspace.configFile);
	return {
		...data,
		validation,
		revision: value?.fingerprint ?? decisionRevision(null),
	};
}
export async function updateSettings(
	workspace: Workspace,
	input: any,
): Promise<unknown> {
	await privateDirectory(workspace.statesDirectory);
	const lease = await acquireExclusiveLease(
		path.join(workspace.statesDirectory, "ui-settings.lock"),
		"workspace settings",
		"ui",
	);
	try {
		const previous = await existing(workspace);
		if (input.revision !== (previous?.fingerprint ?? decisionRevision(null)))
			throw new SettingsRevisionError(
				"Configuration changed; reload before saving",
			);
		if (previous?.error && input.repairConfirmed !== true)
			throw new Error(
				"Confirm configuration repair and its private backup before applying",
			);
		const priorProfiles = settingsRecord(
			inspectSettings(previous, workspace.configFile).raw.connections,
		);
		const draft =
			previous?.document?.clone() ?? createInteractiveConfigDocument();
		const {
			revision: _revision,
			validation: _validation,
			backupPath: _backupPath,
			repairConfirmed: _repairConfirmed,
			connections,
			...rest
		} = input;
		for (const [key, value] of Object.entries(rest)) draft.set(key, value);
		if (connections) {
			const merged = Object.fromEntries(
				Object.entries(connections as Record<string, any>).map(
					([name, profile]) => {
						const prior = settingsRecord(priorProfiles[name]);
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
								token:
									token ||
									(typeof prior.token === "string" ? prior.token : "") ||
									"",
								...(fields.type === "confluence" &&
								(email ||
									(typeof prior.email === "string" ? prior.email : undefined))
									? { email: email || (prior as any).email }
									: {}),
							},
						];
					},
				),
			);
			draft.set("connections", merged);
		}
		parseWorkspaceConfig(draft.toJS(), workspace.configFile);
		const committed = await commitInteractiveConfig({
			workspace,
			document: draft,
			...(previous ? { original: previous } : {}),
			reset: Boolean(previous?.error),
		});
		await chmod(workspace.configFile, 0o600);
		return {
			...(await settingsSnapshot(workspace)),
			...(committed.backupFile
				? {
						backupPath: path
							.relative(workspace.root, committed.backupFile)
							.split(path.sep)
							.join("/"),
					}
				: {}),
		};
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
		throw new Error("Publish a decision revision before activating it");
	const snapshot = await settingsSnapshot(workspace);
	return updateSettings(workspace, {
		...snapshot,
		revision,
		[catalog.kind]: {
			mode: "mapping",
			mappingFile: `./.states/decisions/${id}/decisions.json`,
		},
	});
}
