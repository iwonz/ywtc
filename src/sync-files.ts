import { randomUUID } from "node:crypto";
import { chmod, copyFile, mkdir, rename, rm } from "node:fs/promises";
import path from "node:path";
import type { SourceAdapter, SourcePage, SourceResource } from "./domain.js";
import { boundedPath } from "./local-paths.js";
import type { ContinuousProgress } from "./progress.js";
import {
	verifiedCacheFile,
	type FileFingerprint,
} from "./resource-reconciliation.js";

export async function checkSyncFiles(
	adapter: SourceAdapter,
	page: SourcePage,
	resources: SourceResource[],
	cacheDirectory: string,
	signal?: AbortSignal,
	progress?: ContinuousProgress,
): Promise<Record<string, FileFingerprint>> {
	const result: Record<string, FileFingerprint> = {};
	const directory = await boundedPath(cacheDirectory, "sync-files", true);
	await mkdir(directory, { recursive: true, mode: 0o700 });
	for (const resource of resources) {
		if (resource.kind === "grid" || resource.inventoryFailure) continue;
		signal?.throwIfAborted();
		const operation = progress?.begin(
				`Checking file · ${resource.preferredName ?? resource.name} → ${page.title}`,
			),
			temporary = await boundedPath(
				directory,
				`${randomUUID()}.download`,
				true,
			);
		try {
			const downloaded = await adapter.downloadResource(
					resource,
					temporary,
					page,
				),
				verified = await verifiedCacheFile(temporary, downloaded);
			if (!verified)
				throw new Error("Downloaded bytes failed SHA-256 verification");
			await chmod(temporary, 0o600);
			const filename = await boundedPath(directory, verified.sha256, true),
				cached = await verifiedCacheFile(filename, verified);
			if (!cached) await rename(temporary, filename);
			else await rm(temporary, { force: true });
			result[resource.id] = { ...verified, path: filename };
		} catch (error) {
			await rm(temporary, { force: true });
			throw new Error(
				`Cannot verify source file ${resource.name}: ${error instanceof Error ? error.message : String(error)}`,
				{ cause: error },
			);
		} finally {
			if (operation) progress?.end(operation);
		}
	}
	return result;
}
export async function copyCheckedSyncFile(
	file: FileFingerprint,
	destination: string,
): Promise<FileFingerprint> {
	const verified = await verifiedCacheFile(file.path, file);
	if (!verified)
		throw new Error(
			"Prepared source bytes are missing or corrupt; analyze again",
		);
	await mkdir(path.dirname(destination), { recursive: true, mode: 0o700 });
	if (file.path !== destination) await copyFile(file.path, destination);
	return { ...verified, path: destination };
}
