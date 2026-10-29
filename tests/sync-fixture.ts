import { createHash } from "node:crypto";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import path from "node:path";
import type {
	AppConfig,
	ConfluenceConnectionProfile,
	NetworkLimits,
	YandexConnectionProfile,
} from "../src/config.js";
import type {
	CommentInventory,
	DestinationComment,
	DestinationAdapter,
	DestinationPage,
	SourceAdapter,
	SourcePage,
	SourceResource,
	UploadedResource,
} from "../src/domain.js";
import { DestinationRevisionConflictError } from "../src/domain.js";
import { HttpRequestError } from "../src/http.js";
import type { TransferOptions } from "../src/migrator.js";

const limits: NetworkLimits = {
	readConcurrency: 4,
	writeConcurrency: 2,
	downloadConcurrency: 2,
	uploadConcurrency: 2,
	requestsPerSecond: 100,
	burst: 100,
};
const sourceProfile: YandexConnectionProfile = {
	name: "source",
	type: "yandex-wiki",
	apiUrl: "https://api.wiki.example.com/v1",
	webUrl: "https://wiki.example.com",
	authType: "oauth",
	organization: { type: "yandex360", id: "fixture-org" },
	token: "fixture-source",
	limits,
};
export const destinationProfile: ConfluenceConnectionProfile = {
	name: "destination",
	type: "confluence",
	deployment: "data-center",
	baseUrl: "https://conf.example.com",
	authType: "pat",
	token: "fixture-destination",
	limits,
};
export const syncConfig: AppConfig = {
	profiles: { source: sourceProfile, destination: destinationProfile },
	timeoutMs: 30000,
	concurrency: 2,
	configFile: "fixture.yaml",
};
export const sourcePage = (
	id: string,
	title: string,
	body: string,
	parent?: string,
): SourcePage => ({
	provider: "yandex-wiki",
	profile: "source",
	id,
	canonicalId: `source:yandex-wiki:${id}`,
	title,
	locator: id,
	url: `https://wiki.example.com/${id}/`,
	rawContent: body,
	rawFormat: "yfm",
	references: [],
	...(parent
		? {
				parentId: parent,
				ancestorIds: ["1", ...(parent === "1" ? [] : [parent])],
			}
		: {}),
});
export function syncFixture() {
	const root = sourcePage("1", "Root", "# Root");
	const sources = new Map([[root.id, root]]),
		pages = new Map<string, DestinationPage>(),
		files = new Map<string, UploadedResource[]>(),
		bytes = new Map<string, Buffer>(),
		resourceLists = new Map<string, SourceResource[]>(),
		comments = new Map<string, CommentInventory>();
	const archives = new Map<string, DestinationComment>(),
		commentWrites: string[] = [];
	const creates: Array<{ id: string; parentId: string; body: string }> = [],
		updates: Array<{ id: string; body: string }> = [],
		uploads: string[] = [],
		reads: string[] = [];
	let next = 200;
	const container = {
		provider: "confluence" as const,
		profile: "destination",
		id: "100",
		canonicalId: "destination:confluence:100",
		title: "Archive",
		url: "https://conf.example.com/pages/100",
		space: "DOC",
		locator: "100",
	};
	const capabilities = {
		readPages: true,
		readHierarchy: true,
		readResources: true,
		writePages: true,
		writeResources: true,
		verifyWrites: true,
		readComments: true,
		writeComments: true,
		updateComments: true,
		reparentPages: true,
	};
	const empty = (): CommentInventory => ({
		status: "empty",
		threads: [],
		comments: 0,
		participants: 0,
		attachments: 0,
		knownBytes: 0,
		unknownSizes: 0,
		warnings: [],
	});
	const source = {
		profile: sourceProfile,
		kind: "yandex-wiki",
		capabilities,
		preflight: async () => ({ product: "Wiki", warnings: [] }),
		supportsSourceStatus: () => true,
		resolvePage: async (locator: string) => {
			const found = [...sources.values()].find(
				(p) =>
					p.id === locator ||
					p.url.replace(/\/$/, "") === locator.replace(/\/$/, ""),
			);
			if (!found) throw new HttpRequestError("Source not found", 404);
			return structuredClone(found);
		},
		getPage: async (id: string) => {
			const p = sources.get(id);
			if (!p) throw new HttpRequestError("Source not found", 404);
			return structuredClone(p);
		},
		getDescendants: async (page: SourcePage) =>
			[...sources.values()]
				.filter((p) => p.ancestorIds?.includes(page.id))
				.map((p) => structuredClone(p)),
		resolveReference: async (
			page: SourcePage,
			reference: { href?: string },
		) => {
			if (!reference.href) return undefined;
			return [...sources.values()].find(
				(p) =>
					p.url.replace(/\/$/, "") ===
					new URL(reference.href!, page.url).toString().replace(/\/$/, ""),
			);
		},
		listResources: async (page: SourcePage) =>
			structuredClone(resourceLists.get(page.id) ?? []),
		readComments: async (page: SourcePage) =>
			structuredClone(comments.get(page.id) ?? empty()),
		downloadResource: async (resource: SourceResource, filename: string) => {
			const buffer = bytes.get(resource.id) ?? Buffer.from(resource.name);
			await mkdir(path.dirname(filename), { recursive: true });
			await writeFile(filename, buffer);
			return {
				path: filename,
				size: buffer.length,
				sha256: createHash("sha256").update(buffer).digest("hex"),
			};
		},
	} as unknown as SourceAdapter & DestinationAdapter;
	const destination = {
		profile: destinationProfile,
		kind: "confluence",
		capabilities,
		preflight: async () => ({ product: "Confluence", warnings: [] }),
		resolveContainer: async () => container,
		findChild: async (parent: DestinationPage, title: string) =>
			[...pages.values()].find(
				(p) => p.parentId === parent.id && p.title === title,
			),
		findTitleConflict: async (_parent: DestinationPage, title: string) =>
			[...pages.values()].find((p) => p.title === title),
		createPage: async (input: {
			container: DestinationPage;
			title: string;
			body: string;
		}) => {
			const id = String(next++),
				page: DestinationPage = {
					provider: "confluence",
					profile: "destination",
					id,
					canonicalId: `destination:confluence:${id}`,
					title: input.title,
					url: `https://conf.example.com/pages/viewpage.action?pageId=${id}`,
					locator: id,
					space: "DOC",
					parentId: input.container.id,
					content: input.body,
					version: "1",
				};
			pages.set(id, page);
			creates.push({ id, parentId: input.container.id, body: input.body });
			return structuredClone(page);
		},
		updatePage: async (input: {
			page: DestinationPage;
			title: string;
			body: string;
		}) => {
			const current = pages.get(input.page.id);
			if (!current) throw new HttpRequestError("Destination missing", 404);
			if (input.page.version !== current.version)
				throw new DestinationRevisionConflictError("page", current.id);
			const page = {
				...current,
				title: input.title,
				content: input.body,
				version: String(Number(current.version ?? 0) + 1),
			};
			pages.set(page.id, page);
			updates.push({ id: page.id, body: input.body });
			return structuredClone(page);
		},
		reparentPage: async (input: {
			page: DestinationPage;
			parent: DestinationPage;
		}) => {
			const current = pages.get(input.page.id)!;
			const page = {
				...current,
				parentId: input.parent.id,
				version: String(Number(current.version ?? 0) + 1),
			};
			pages.set(page.id, page);
			return structuredClone(page);
		},
		verifyPage: async (page: DestinationPage) => {
			reads.push(page.id);
			const current = pages.get(page.id);
			if (!current) throw new HttpRequestError("Destination missing", 404);
			return structuredClone(current);
		},
		createArchiveComment: async (input: {
			page: DestinationPage;
			body: string;
		}) => {
			const comment = {
				id: String(next++),
				pageId: input.page.id,
				body: input.body,
				version: "1",
				fingerprint: createHash("sha256").update(input.body).digest("hex"),
			};
			archives.set(comment.id, comment);
			commentWrites.push(comment.id);
			return structuredClone(comment);
		},
		updateArchiveComment: async (input: {
			comment: DestinationComment;
			body: string;
		}) => {
			const current = archives.get(input.comment.id)!;
			if (current.version !== input.comment.version)
				throw new DestinationRevisionConflictError("comment", current.id);
			const next = {
				...current,
				body: input.body,
				version: String(Number(current.version) + 1),
				fingerprint: createHash("sha256").update(input.body).digest("hex"),
			};
			archives.set(current.id, next);
			commentWrites.push(current.id);
			return structuredClone(next);
		},
		readArchiveComment: async (input: {
			page: DestinationPage;
			commentId: string;
		}) => {
			const comment = archives.get(input.commentId);
			if (!comment) throw new HttpRequestError("Comment missing", 404);
			return structuredClone(comment);
		},
		findArchiveComment: async (page: DestinationPage) =>
			[...archives.values()].find((c) => c.pageId === page.id),
		uploadResource: async (input: {
			page: DestinationPage;
			name: string;
			filePath: string;
			existingId?: string;
		}) => {
			const id = input.existingId ?? `file-${String(next++)}`,
				data = await readFile(input.filePath);
			bytes.set(id, data);
			const resource = {
				id,
				name: input.name,
				url: `https://conf.example.com/download/${id}`,
				size: data.length,
			};
			files.set(input.page.id, [
				...(files.get(input.page.id) ?? []).filter((r) => r.id !== id),
				resource,
			]);
			uploads.push(id);
			return resource;
		},
		listUploadedResources: async (page: DestinationPage) =>
			structuredClone(files.get(page.id) ?? []),
		downloadUploadedResource: async (input: {
			resource: UploadedResource;
			destination: string;
		}) => {
			const data = bytes.get(input.resource.id)!;
			await writeFile(input.destination, data);
			return {
				path: input.destination,
				size: data.length,
				sha256: createHash("sha256").update(data).digest("hex"),
			};
		},
		renderPageReference: (
			page: DestinationPage,
			label: string,
			anchor?: string,
		) => `<a href="${page.url}${anchor ? `#${anchor}` : ""}">${label}</a>`,
		renderResourceReference: (
			resource: UploadedResource,
			label: string,
			image: boolean,
		) =>
			image
				? `<ac:image ac:alt="${label}"><ri:attachment ri:filename="${resource.name}"/></ac:image>`
				: `<a href="${resource.url}">${label}</a>`,
	} as unknown as SourceAdapter & DestinationAdapter;
	return {
		root,
		sources,
		pages,
		resourceLists,
		comments,
		archives,
		commentWrites,
		bytes,
		files,
		creates,
		updates,
		uploads,
		reads,
		source,
		destination,
		container,
		factory: (profile: { name: string }) =>
			profile.name === "source" ? source : destination,
	};
}
export function syncOptions(directory: string): TransferOptions {
	return {
		source: { type: "remote", profile: sourceProfile, value: "1" },
		destination: { type: "remote", profile: destinationProfile, value: "100" },
		scope: "subtree",
		sourceStatus: "all",
		comments: false,
		dryRun: false,
		archive: false,
		concurrency: 2,
		runtimeDirectory: path.join(directory, ".states"),
		cacheDirectory: path.join(directory, ".states/cache"),
		reportsDirectory: path.join(directory, ".states/reports"),
	};
}
