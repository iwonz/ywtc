import { isMap, parseDocument } from "yaml";
import { ConfigurationError, parseWorkspaceConfig } from "./config.js";
import type { ExistingInteractiveConfig } from "./interactive-config.js";
import { redact } from "./logger.js";

export function settingsRecord(value: unknown): Record<string, any> {
	return value && typeof value === "object" && !Array.isArray(value)
		? (value as Record<string, any>)
		: {};
}

/** Private inspection is separate from operational validation; raw never leaves the server. */
export function inspectSettings(
	previous: ExistingInteractiveConfig | undefined,
	configFile: string,
) {
	let raw: Record<string, any> = {},
		readable = !previous;
	if (previous) {
		try {
			const document = previous.document ?? parseDocument(previous.source);
			readable = document.errors.length === 0 && isMap(document.contents);
			if (readable) raw = settingsRecord(document.toJS());
		} catch {
			readable = false;
		}
	}
	const profiles = settingsRecord(raw.connections);
	const secrets = Object.values(profiles).flatMap((value) => {
		const p = settingsRecord(value);
		return [p.token, p.email].filter(
			(v): v is string => typeof v === "string" && Boolean(v),
		);
	});
	const text = (value: unknown, fallback = "") =>
		typeof value === "string" ? redact(value, secrets) : fallback;
	const number = (value: unknown, fallback: number) =>
		typeof value === "number" && Number.isFinite(value) ? value : fallback;
	const policy = (value: unknown) => {
		if (value === undefined) return { mode: "off" };
		const p = settingsRecord(value);
		if (p.mode === "off") return { mode: "off" };
		if (p.mode === "mapping")
			return { mode: "mapping", mappingFile: text(p.mappingFile) };
		return { mode: "" };
	};
	let fields: string[] = [];
	if (!readable) fields = ["yaml"];
	else
		try {
			parseWorkspaceConfig(raw, configFile);
		} catch (error) {
			fields =
				error instanceof ConfigurationError
					? error.fields.map((field) => redact(field, secrets))
					: ["configuration"];
		}
	const connections = Object.fromEntries(
		Object.entries(profiles).flatMap(([name, value]) => {
			if (text(name) !== name) return [];
			const p = settingsRecord(value),
				organization = settingsRecord(p.organization),
				limits = settingsRecord(p.limits);
			const base = {
				type: ["yandex-wiki", "confluence"].includes(p.type) ? p.type : "",
				hasToken: typeof p.token === "string" && Boolean(p.token),
				hasEmail: typeof p.email === "string" && Boolean(p.email),
				limits: Object.fromEntries(
					[
						"readConcurrency",
						"writeConcurrency",
						"downloadConcurrency",
						"uploadConcurrency",
						"requestsPerSecond",
						"burst",
					]
						.filter(
							(key) =>
								typeof limits[key] === "number" && Number.isFinite(limits[key]),
						)
						.map((key) => [key, limits[key]]),
				),
			};
			return [
				[
					name,
					p.type === "yandex-wiki"
						? {
								...base,
								apiUrl: text(p.apiUrl),
								webUrl: text(p.webUrl),
								authType: text(p.authType, "oauth"),
								organization: {
									type: text(organization.type, "yandex360"),
									id: text(organization.id),
								},
							}
						: {
								...base,
								baseUrl: text(p.baseUrl),
								deployment: text(p.deployment),
								authType: text(p.authType),
							},
				],
			];
		}),
	);
	const defaults = settingsRecord(raw.defaults);
	return {
		raw,
		data: {
			defaults: {
				timeoutMs: number(defaults.timeoutMs, 30_000),
				concurrency: number(defaults.concurrency, 4),
			},
			mentions: policy(raw.mentions),
			hashtags: policy(raw.hashtags),
			connections,
		},
		validation: {
			valid: fields.length === 0,
			readable,
			fields,
			requiresConfirmation: Boolean(previous?.error),
		},
	};
}
