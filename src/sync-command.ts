import path from "node:path";
import { pathToFileURL } from "node:url";
import type { CliCommand } from "./cli-arguments.js";
import { submitJob, readJobResult } from "./jobs/client.js";
import { foreground } from "./jobs/command.js";
import { SyncPlanStore } from "./sync-store.js";
import { resolveWorkspace } from "./workspace.js";

export async function runSyncCommand(
	command: Extract<CliCommand, { command: "sync" }>,
): Promise<number> {
	const workspace = await resolveWorkspace(
		command.workdir ? { explicit: command.workdir } : {},
	);
	const store = new SyncPlanStore(workspace.root);
	const request =
		command.action === "analyze"
			? {
					kind: "sync-plan" as const,
					runId: command.runId,
					...(command.source ? { source: command.source } : {}),
				}
			: {
					kind: "sync-apply" as const,
					planId: command.planId,
					revision: (await store.get(command.planId)).revision,
					confirmTrash: command.confirmTrash,
				};
	const job = await submitJob(workspace, request);
	console.log(`\n◆ Synchronization ${command.action}\n  Job ID  ${job.id}`);
	await foreground(workspace, job.id);
	const result = await readJobResult(workspace, job.id);
	if (result?.planId) {
		const plan = await store.get(result.planId),
			directory = await store.directory(plan.id);
		console.log(
			`\n◆ Synchronization ${plan.status}\n  Plan ID    ${plan.id}\n  Inventory  ${plan.inventory.complete ? "complete" : "incomplete"}\n  Decisions  ${path.join(directory, "decisions.json")}\n  Review     ywtc ui --workdir ${JSON.stringify(workspace.root)}\n  Apply      ywtc sync apply ${plan.id} --workdir ${JSON.stringify(workspace.root)}`,
		);
		for (const failure of plan.inventory.failures)
			console.error(`  ${failure.code}: ${failure.message}`);
	}
	if (result?.reportHtml)
		console.log(`  Report     ${pathToFileURL(result.reportHtml).href}`);
	if (result?.error) console.error(`ERROR ${result.error}`);
	return result?.exitCode ?? 1;
}
