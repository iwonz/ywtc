import { randomUUID } from "node:crypto";
import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import { z } from "zod";
import { acquireExclusiveLease } from "./exclusive-lease.js";
import { atomicJson, privateDirectory } from "./jobs/store.js";
import { boundedPath } from "./local-paths.js";
import {
	parseSyncDecisions,
	parseSyncPlan,
	stableHash,
	type SyncDecisions,
	type SyncPlan,
} from "./sync-contract.js";

export class SyncPlanValidationError extends Error {
	readonly exitCode = 2;
	constructor(message: string) {
		super(message);
		this.name = "SyncPlanValidationError";
	}
}
export class SyncRevisionError extends SyncPlanValidationError {
	readonly status = 409;
	constructor() {
		super("Synchronization decisions or preview changed; refresh the plan");
		this.name = "SyncRevisionError";
	}
}
export class SyncPlanStore {
	constructor(readonly root: string) {}
	async directory(id: string, allowMissing = false): Promise<string> {
		if (!z.string().uuid().safeParse(id).success)
			throw new SyncPlanValidationError(
				"Synchronization requires a canonical Plan ID",
			);
		return boundedPath(
			this.root,
			path.join(".states", "sync", id),
			allowMissing,
		);
	}
	async create(
		plan: Omit<SyncPlan, "id" | "revision" | "createdAt">,
		prepared: unknown,
	): Promise<SyncPlan> {
		const id = randomUUID(),
			directory = await this.directory(id, true);
		await privateDirectory(directory);
		const decisions: SyncDecisions = { planId: id, decisions: {} },
			result: SyncPlan = {
				...plan,
				id,
				createdAt: new Date().toISOString(),
				revision: stableHash(decisions),
			};
		parseSyncPlan(result);
		await atomicJson(path.join(directory, "prepared.json"), prepared);
		await atomicJson(path.join(directory, "decisions.json"), decisions);
		await atomicJson(path.join(directory, "plan.json"), result);
		return result;
	}
	async get(id: string): Promise<SyncPlan> {
		try {
			const directory = await this.directory(id),
				plan = parseSyncPlan(
					JSON.parse(
						await readFile(await boundedPath(directory, "plan.json"), "utf8"),
					),
				);
			if (
				plan.id !== id ||
				!Array.isArray(plan.items) ||
				!plan.inventory ||
				!plan.references
			)
				throw new Error("Invalid plan");
			return { ...plan, revision: stableHash(await this.decisions(id)) };
		} catch (error) {
			if (error instanceof SyncPlanValidationError) throw error;
			throw new SyncPlanValidationError(
				"Synchronization plan is missing or invalid",
			);
		}
	}
	async decisions(id: string): Promise<SyncDecisions> {
		const directory = await this.directory(id),
			parsed = parseSyncDecisions(
				JSON.parse(
					await readFile(
						await boundedPath(directory, "decisions.json"),
						"utf8",
					),
				),
			);
		if (parsed.planId !== id)
			throw new SyncPlanValidationError(
				"Decisions belong to another synchronization plan",
			);
		return parsed;
	}
	async prepared<T>(id: string): Promise<T> {
		const directory = await this.directory(id);
		return JSON.parse(
			await readFile(await boundedPath(directory, "prepared.json"), "utf8"),
		) as T;
	}
	async savePrepared(id: string, value: unknown): Promise<void> {
		const directory = await this.directory(id);
		await atomicJson(
			await boundedPath(directory, "prepared.json", true),
			value,
		);
	}
	async checkpoint(id: string, key: string, value: unknown): Promise<void> {
		const directory = await this.directory(id),
			filename = await boundedPath(
				directory,
				path.join("checkpoints", `${stableHash(key)}.json`),
				true,
			);
		await atomicJson(filename, { key, value });
	}
	async checkpoints<T>(id: string): Promise<Record<string, T>> {
		const directory = await this.directory(id),
			root = await boundedPath(directory, "checkpoints", true),
			result: Record<string, T> = {};
		let entries: string[];
		try {
			entries = await readdir(root);
		} catch (error) {
			if ((error as NodeJS.ErrnoException).code === "ENOENT") return result;
			throw error;
		}
		for (const name of entries.filter((n) => /^[a-f0-9]{64}\.json$/.test(n))) {
			const record = JSON.parse(
				await readFile(await boundedPath(root, name), "utf8"),
			);
			if (
				typeof record.key !== "string" ||
				`${stableHash(record.key)}.json` !== name
			)
				throw new SyncPlanValidationError("Invalid synchronization checkpoint");
			result[record.key] = record.value;
		}
		return result;
	}
	async savePlan(plan: SyncPlan): Promise<void> {
		const directory = await this.directory(plan.id);
		await atomicJson(await boundedPath(directory, "plan.json", true), plan);
	}
	async setDecisions(
		id: string,
		value: unknown,
		expectedRevision: string,
	): Promise<SyncPlan> {
		const directory = await this.directory(id),
			lease = await acquireExclusiveLease(
				path.join(directory, "edit.lock"),
				"sync decision edit",
				id,
			);
		try {
			const current = await this.get(id);
			if (current.status === "applied")
				throw new SyncPlanValidationError(
					"Applied synchronization plans are immutable",
				);
			if (current.revision !== expectedRevision) throw new SyncRevisionError();
			const next = parseSyncDecisions(value);
			if (next.planId !== id)
				throw new SyncPlanValidationError(
					"Decisions belong to another synchronization plan",
				);
			this.validateDecisions(current, next, false);
			await atomicJson(await boundedPath(directory, "decisions.json"), next);
			const result = { ...current, revision: stableHash(next) };
			await this.savePlan(result);
			return result;
		} finally {
			await lease.release();
		}
	}
	validateDecisions(
		plan: SyncPlan,
		document: SyncDecisions,
		complete = true,
	): void {
		if (document.planId !== plan.id)
			throw new SyncPlanValidationError("Decision Plan ID mismatch");
		const byId = new Map(plan.items.map((item) => [item.id, item]));
		for (const [id, decision] of Object.entries(document.decisions)) {
			const item = byId.get(id);
			if (
				!item ||
				!["changed", "unknown-baseline"].includes(item.classification)
			)
				throw new SyncPlanValidationError(
					`Decision is not applicable to ${id}`,
				);
			if (decision === "trash" && !item.trash.allowed)
				throw new SyncPlanValidationError(
					`Trash is unavailable for ${id}: ${item.trash.reason ?? "not a proved published leaf"}`,
				);
		}
		if (complete) {
			if (!plan.inventory.complete || plan.status === "partial")
				throw new SyncPlanValidationError(
					"Synchronization inventory is incomplete; analyze again",
				);
			const missing = plan.items.filter(
				(item) =>
					["changed", "unknown-baseline"].includes(item.classification) &&
					!document.decisions[item.id],
			);
			if (missing.length)
				throw new SyncPlanValidationError(
					`${missing.length} changed or unknown-baseline page(s) still require decisions`,
				);
		}
	}
	async list(): Promise<SyncPlan[]> {
		let entries: string[];
		try {
			entries = await readdir(await boundedPath(this.root, ".states/sync"));
		} catch (error) {
			if ((error as NodeJS.ErrnoException).code === "ENOENT") return [];
			throw error;
		}
		const plans = await Promise.all(
			entries
				.filter((id) => z.string().uuid().safeParse(id).success)
				.map((id) => this.get(id).catch(() => undefined)),
		);
		return plans
			.filter((p): p is SyncPlan => p !== undefined)
			.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
	}
}
