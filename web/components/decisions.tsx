"use client";
import { Button } from "../../ui/components/button";
import { Badge } from "../../ui/components/badge";
import {
	ChoiceField,
	JsonFilePicker,
	Notice,
	InputField,
	Hint,
	CheckboxField,
	AppDialog,
} from "../../ui/fields";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import { Trash2, Undo2 } from "lucide-react";
import {
	changeDecision,
	changeText,
	defaultLabel,
	entryKey,
	entryName,
	parseDocument,
	rowError,
	serializeDocument,
} from "../../mentions-ui/src/adapter";
import { filterDecisions } from "../../mentions-ui/src/model";
import { api, download, safeLink, type Translate } from "./api";
import { RequiredNote, ScopeField, SourceStatusField } from "./operator-fields";
export function Decisions({
	root,
	t,
	onError,
	onJob,
}: {
	root: string;
	t: Translate;
	onError: (e: unknown) => void;
	onJob: (id: string) => void;
}) {
	const [catalogs, setCatalogs] = useState<any[]>([]),
		[catalog, setCatalog] = useState<any>(),
		[document, setDocument] = useState<any>(),
		[dirty, setDirty] = useState(false),
		[search, setSearch] = useState(""),
		[filter, setFilter] = useState("all"),
		[deleted, setDeleted] = useState<{
			entry: any;
			index: number;
		}>(),
		[analysis, setAnalysis] = useState(false),
		[source, setSource] = useState(""),
		[profile, setProfile] = useState(""),
		[scope, setScope] = useState("subtree"),
		[sourceStatus, setSourceStatus] = useState("all"),
		[comments, setComments] = useState(true),
		[kind, setKind] = useState("both"),
		[profiles, setProfiles] = useState<string[]>([]),
		[configInvalid, setConfigInvalid] = useState(false),
		[applying, setApplying] = useState(false),
		[reports, setReports] = useState<any[]>([]),
		[run, setRun] = useState(""),
		[mentionRevision, setMentionRevision] = useState<string | null>(null),
		[hashtagRevision, setHashtagRevision] = useState<string | null>(null),
		[operationBusy, setOperationBusy] = useState(false),
		[dialogError, setDialogError] = useState("");
	const container = useRef<HTMLDivElement>(null);
	const refresh = useCallback(
		() =>
			api(`${root}/decisions?limit=500`)
				.then((d) => setCatalogs(d.items))
				.catch(onError),
		[root, onError],
	);
	useEffect(() => {
		refresh();
		api(`${root}/settings`)
			.then((s) => {
				setConfigInvalid(s.validation?.valid === false);
				const available =
					s.validation?.valid === false ? [] : Object.keys(s.connections);
				setProfiles(available);
				setProfile(available[0] ?? "");
			})
			.catch(onError);
	}, [root, refresh, onError]);
	useEffect(() => {
		if (!dirty) return;
		const handler = (e: BeforeUnloadEvent) => {
			e.preventDefault();
		};
		window.addEventListener("beforeunload", handler);
		return () => window.removeEventListener("beforeunload", handler);
	}, [dirty]);
	const entries = useMemo(
		() => filterDecisions(document?.entries ?? [], search, filter),
		[document, search, filter],
	);
	const virtualizer = useVirtualizer({
		count: entries.length,
		getScrollElement: () => container.current,
		estimateSize: () => 170,
		overscan: 6,
	});
	const valid = !document || document.entries.every((e: any) => !rowError(e));
	const replace = (index: number, entry: any) => {
		setDocument({
			...document,
			entries: document.entries.map((e: any, i: number) =>
				i === index ? entry : e,
			),
		});
		setDirty(true);
	};
	const accept = (next: any) => {
		setCatalog(next);
		setDocument(structuredClone(next.document));
		setDirty(false);
		setDeleted(undefined);
		setSearch("");
		setFilter("all");
	};
	const load = async (id: string) => {
		if (
			dirty &&
			!window.confirm(
				t("Заменить несохранённый черновик?", "Replace unsaved changes?"),
			)
		)
			return;
		try {
			accept(await api(`${root}/decisions/${id}`));
		} catch (e) {
			onError(e);
		}
	};
	const save = async () => {
		try {
			const next = await api(
				`${root}/decisions${catalog?.published || !catalog?.id ? "" : `/${catalog.id}`}`,
				catalog?.published || !catalog?.id ? "POST" : "PUT",
				{
					kind: catalog.kind,
					document: parseDocument(document, catalog.kind),
					...(!catalog.published && catalog.id
						? { revision: catalog.revision }
						: {}),
				},
			);
			accept(next);
			refresh();
			return next;
		} catch (e) {
			onError(e);
		}
	};
	const publish = async () => {
		const saved = dirty || catalog.published ? await save() : catalog;
		if (!saved) return;
		try {
			accept(
				await api(`${root}/decisions/${saved.id}/publish`, "POST", {
					revision: saved.revision,
				}),
			);
			refresh();
		} catch (e) {
			onError(e);
		}
	};
	const activate = async () => {
		try {
			const settings = await api(`${root}/settings`);
			if (
				!window.confirm(
					t(
						"Подключить эту опубликованную версию к следующим миграциям пространства?",
						"Activate this published revision for future workspace migrations?",
					),
				)
			)
				return;
			await api(`${root}/decisions/${catalog.id}/activate`, "POST", {
				configRevision: settings.revision,
			});
		} catch (e) {
			onError(e);
		}
	};
	const importFile = async (file: File | null) => {
		if (!file) return;
		try {
			const next = parseDocument(
				JSON.parse(await file.text()),
				catalog?.kind ?? "mentions",
			);
			if (
				dirty &&
				!window.confirm(
					t("Заменить несохранённый черновик?", "Replace unsaved changes?"),
				)
			)
				return;
			setDocument(next);
			setCatalog({ kind: catalog?.kind ?? "mentions", published: false });
			setDirty(true);
			setDeleted(undefined);
		} catch (e) {
			onError(e);
		}
	};
	const scan = () => {
		if (operationBusy || !source.trim() || !profile || configInvalid) return;
		setOperationBusy(true);
		setDialogError("");
		return api(`${root}/jobs`, "POST", {
			request: {
				kind: "scan",
				source: source.trim(),
				sourceProfile: profile,
				scope,
				sourceStatus,
				comments,
				kinds: kind === "both" ? ["mentions", "hashtags"] : [kind],
				...(catalog?.id ? { catalogId: catalog.id } : {}),
			},
		})
			.then((j) => {
				setAnalysis(false);
				onJob(j.id);
			})
			.catch((e) => setDialogError(e instanceof Error ? e.message : String(e)))
			.finally(() => setOperationBusy(false));
	};
	const apply = () => {
		if (operationBusy || !run || (!mentionRevision && !hashtagRevision)) return;
		setOperationBusy(true);
		setDialogError("");
		return api(`${root}/jobs`, "POST", {
			request: {
				kind: "targeted",
				runId: run,
				action: "decisions",
				dryRun: true,
				selection: {
					pageIds: [],
					resourceIds: {},
					commentPageIds: [],
					terminalOverride: false,
				},
				revisions: {
					...(mentionRevision ? { mentions: mentionRevision } : {}),
					...(hashtagRevision ? { hashtags: hashtagRevision } : {}),
				},
			},
		})
			.then((j) => onJob(j.id))
			.catch((e) => setDialogError(e instanceof Error ? e.message : String(e)))
			.finally(() => setOperationBusy(false));
	};
	return (
		<>
			<div
				style={{
					display: "flex",
					flexDirection: "row",
					gap: 8,
					alignItems: "center",
					flexWrap: "wrap",
					justifyContent: "space-between",
				}}
			>
				<div className="section-title">
					{t("Упоминания и хэштеги", "Mentions & hashtags")}
				</div>
				<div
					style={{
						display: "flex",
						flexDirection: "row",
						gap: 8,
						alignItems: "center",
						flexWrap: "wrap",
					}}
				>
					<Button
						onClick={() => {
							setDialogError("");
							setAnalysis(true);
						}}
						variant="secondary"
					>
						{t("Анализ source", "Analyze source")}
					</Button>
					<Button
						onClick={() => {
							setDialogError("");
							api(`${root}/reports?limit=500`)
								.then((d) => setReports(d.items.filter((r: any) => !r.dryRun)))
								.catch(onError);
							setApplying(true);
						}}
						variant="ghost"
					>
						{t("Применить к миграции", "Apply to migration")}
					</Button>
				</div>
			</div>
			<p className="workflow-hint">
				{t(
					"1. Анализ → 2. Разметка и черновик → 3. Публикация версии → 4. Подключение к будущим миграциям или отдельное применение к существующей. Сохранение черновика не изменяет destination.",
					"1. Analyze → 2. Edit and save draft → 3. Publish revision → 4. Activate for future migrations or apply separately to an existing migration. Saving a draft does not change destination data.",
				)}
			</p>
			{catalogs.map((c) => (
				<div className="row" key={c.id}>
					<Badge variant="secondary">{c.kind}</Badge>
					<Button onClick={() => load(c.id)} variant="ghost">
						{c.id.slice(0, 8)}
					</Button>
					<span className="grow muted">
						{c.source.instance} · {new Date(c.updatedAt).toLocaleString()}
					</span>
					{c.entries > 0 && (
						<Badge variant="outline">{c.entries} entries</Badge>
					)}
					<Badge data-tone={c.published ? "teal" : "gray"} variant="secondary">
						{c.published
							? t("Опубликовано", "Published")
							: t("Черновик", "Draft")}
					</Badge>
				</div>
			))}
			{!catalogs.length && (
				<div className="empty">
					{t(
						"Запустите анализ источника или импортируйте decisions.json.",
						"Analyze a source or import decisions.json.",
					)}
				</div>
			)}
			<div
				style={{
					display: "flex",
					flexDirection: "row",
					gap: 8,
					alignItems: "center",
					flexWrap: "wrap",
					marginTop: 16,
				}}
			>
				<ChoiceField
					aria-label="Import kind"
					value={catalog?.kind ?? "mentions"}
					options={["mentions", "hashtags"]}
					onValueChange={(e) => {
						if (
							dirty &&
							!window.confirm(
								t(
									"Отбросить несохранённые изменения?",
									"Discard unsaved changes?",
								),
							)
						)
							return;
						setCatalog({ kind: e });
						setDocument(undefined);
						setDirty(false);
					}}
				/>
				<JsonFilePicker accept="application/json,.json" onFile={importFile}>
					{(props) => (
						<Button {...props} variant="secondary">
							{t("Открыть JSON", "Open JSON")}
						</Button>
					)}
				</JsonFilePicker>
			</div>
			{document && (
				<section className="section">
					<div
						style={{
							display: "flex",
							flexDirection: "row",
							gap: 8,
							alignItems: "center",
							flexWrap: "wrap",
							justifyContent: "space-between",
						}}
					>
						<strong>
							{catalog.kind} · {document.source.instance}
							{dirty ? " *" : ""}
						</strong>
						<div
							style={{
								display: "flex",
								flexDirection: "row",
								gap: 8,
								alignItems: "center",
								flexWrap: "wrap",
							}}
						>
							<Button
								disabled={!valid}
								onClick={() => {
									try {
										download(
											JSON.parse(serializeDocument(document, catalog.kind)),
											"decisions.json",
										);
									} catch (e) {
										onError(e);
									}
								}}
								variant="ghost"
							>
								{t("Скачать JSON", "Download JSON")}
							</Button>
							<Button disabled={!valid} onClick={save}>
								{t("Сохранить черновик", "Save draft")}
							</Button>
							<Button disabled={!valid} onClick={publish} variant="secondary">
								{t("Опубликовать версию", "Publish revision")}
							</Button>
							{catalog.published && !dirty && (
								<Button onClick={activate} variant="secondary">
									{t("Подключить к пространству", "Activate in workspace")}
								</Button>
							)}
						</div>
					</div>
					{document.inventory?.complete === false && (
						<Notice tone={"orange"} style={{ marginTop: 16 }}>
							{t(
								"Inventory неполон. Доступные решения сохранены; проблемы перечислены ниже.",
								"Inventory is incomplete. Available decisions are retained; issues are listed below.",
							)}
							<details>
								<summary>{t("Проблемы inventory", "Inventory issues")}</summary>
								<pre className="code">
									{JSON.stringify(document.inventory, null, 2)}
								</pre>
							</details>
						</Notice>
					)}
					{!valid && (
						<Notice tone={"red"} style={{ marginTop: 16 }}>
							{t(
								"Исправьте невалидные строки перед сохранением.",
								"Fix invalid rows before saving.",
							)}
						</Notice>
					)}
					<div className="toolbar">
						<InputField
							aria-label={t("Поиск решений", "Search decisions")}
							value={search}
							onChange={(e) => setSearch(e.target.value)}
							placeholder={t(
								"Упоминание, тег, identity или контекст",
								"Mention, tag, identity or context",
							)}
							style={{ flex: 1 }}
						/>
						<ChoiceField
							aria-label="Decision filter"
							value={filter}
							options={
								catalog.kind === "hashtags"
									? ["all", "skip", "text", "url"]
									: ["all", "skip", "url"]
							}
							onValueChange={(e) => setFilter(e)}
						/>
						{deleted && (
							<Button
								onClick={() => {
									const next = [...document.entries];
									next.splice(deleted.index, 0, deleted.entry);
									setDocument({ ...document, entries: next });
									setDeleted(undefined);
									setDirty(true);
								}}
								variant="ghost"
							>
								{<Undo2 size={15} />}
								{t("Отменить удаление", "Undo delete")}
							</Button>
						)}
					</div>
					<div ref={container} className="scroll-list">
						<ul
							aria-label="Decisions"
							style={{
								height: virtualizer.getTotalSize(),
								position: "relative",
								listStyle: "none",
								padding: 0,
								margin: 0,
							}}
						>
							{virtualizer.getVirtualItems().map((v) => {
								const row = entries[v.index],
									entry = row.entry as any,
									index = row.index;
								return (
									<li
										key={entryKey(entry)}
										data-index={v.index}
										ref={virtualizer.measureElement}
										style={{
											position: "absolute",
											top: 0,
											left: 0,
											width: "100%",
											transform: `translateY(${v.start}px)`,
										}}
										className="decision-row"
									>
										<div
											style={{
												display: "flex",
												flexDirection: "row",
												gap: 8,
												alignItems: "center",
												flexWrap: "wrap",
											}}
										>
											<strong className="grow">{entryName(entry)}</strong>
											<span className="mono muted">
												{"identity" in entry
													? Object.entries(entry.identity)
															.map(([k, v]) => `${k}: ${v}`)
															.join(" · ")
													: ""}
											</span>
											<ChoiceField
												aria-label={`Decision ${entryName(entry)}`}
												value={entry.decision}
												options={
													catalog.kind === "hashtags"
														? ["skip", "text", "url"]
														: ["skip", "url"]
												}
												onValueChange={(e) =>
													replace(index, changeDecision(entry, e))
												}
											/>
											<Hint
												content={t(
													"Удалить (означает skip)",
													"Delete (means skip)",
												)}
											>
												<Button
													aria-label={`Delete ${entryName(entry)}`}
													onClick={() => {
														setDeleted({ entry, index });
														setDocument({
															...document,
															entries: document.entries.filter(
																(_: any, i: number) => i !== index,
															),
														});
														setDirty(true);
													}}
													variant="ghost"
													size="icon-sm"
													className="text-destructive"
												>
													<Trash2 size={16} />
												</Button>
											</Hint>
										</div>
										{entry.decision !== "skip" && (
											<div className="decision-inputs">
												{entry.decision === "url" && (
													<InputField
														aria-label={`URL ${entryName(entry)}`}
														placeholder="https://…"
														value={entry.url}
														error={
															!safeLink(entry.url) ? "HTTP(S) URL" : undefined
														}
														onChange={(e) =>
															replace(index, { ...entry, url: e.target.value })
														}
													/>
												)}
												<InputField
													aria-label={`Text ${entryName(entry)}`}
													placeholder={defaultLabel(entry)}
													value={entry.text ?? ""}
													onChange={(e) =>
														replace(index, changeText(entry, e.target.value))
													}
												/>
												{entry.decision === "url" && safeLink(entry.url) && (
													<a
														href={safeLink(entry.url)}
														target="_blank"
														rel="noreferrer"
													>
														{entry.text ?? defaultLabel(entry)}
													</a>
												)}
											</div>
										)}
										{entry.occurrences?.length > 0 && (
											<details style={{ marginTop: 10 }}>
												<summary className="muted">
													{entry.occurrences.reduce(
														(n: number, o: any) => n + (o.count ?? 1),
														0,
													)}{" "}
													{t("вхождений · контексты", "occurrences · contexts")}
												</summary>
												{entry.occurrences.map((o: any) => (
													<div
														className="row"
														key={`${o.pageId}-${o.location}-${o.commentId ?? ""}`}
													>
														{safeLink(o.pageUrl) ? (
															<a
																href={safeLink(o.pageUrl)}
																target="_blank"
																rel="noreferrer"
															>
																{o.pageTitle ?? o.pageId}
															</a>
														) : (
															(o.pageTitle ?? o.pageId)
														)}
														<span className="mono">
															{o.location} {o.commentId ?? ""}
														</span>
													</div>
												))}
											</details>
										)}
									</li>
								);
							})}
						</ul>
					</div>
					{!document.entries.length && (
						<div className="empty">
							{t(
								"Упоминаний или тегов нет. Отсутствующие записи означают skip.",
								"No mentions or tags. Missing entries mean skip.",
							)}
						</div>
					)}
				</section>
			)}
			<AppDialog
				title={t("Source-only анализ", "Source-only analysis")}
				open={analysis}
				onDismiss={() => setAnalysis(false)}
			>
				<div className="operation-form">
					<RequiredNote t={t} />
					<p className="workflow-hint">
						{t(
							"Читаются только выбранные source-страницы и комментарии. Вложения/Grid payload не скачиваются, destination и migration state не изменяются.",
							"Only selected source pages and comments are read. Attachment/Grid payloads are not downloaded; destination and migration state are unchanged.",
						)}
					</p>
					{dialogError && <Notice tone="red">{dialogError}</Notice>}
					{configInvalid && (
						<Notice tone="orange">
							{t(
								"Исправьте конфигурацию в разделе «Подключения» перед анализом.",
								"Repair configuration in Connections before analysis.",
							)}
						</Notice>
					)}
					<ChoiceField
						required
						label={t("Профиль", "Profile")}
						value={profile}
						options={profiles}
						onValueChange={(v) => setProfile(v ?? "")}
					/>
					<InputField
						required
						label="Source URL / ID / slug / space URL"
						value={source}
						onChange={(e) => setSource(e.target.value)}
					/>
					<ScopeField value={scope} onValueChange={setScope} t={t} />
					<SourceStatusField
						value={sourceStatus}
						onValueChange={setSourceStatus}
						t={t}
					/>
					<ChoiceField
						label={t("Сканировать", "Scan")}
						description={t(
							"both — оба типа за одно чтение; отдельный тип — только упоминания или теги.",
							"both scans both types in one pass; a single type collects only mentions or hashtags.",
						)}
						value={kind}
						options={["both", "mentions", "hashtags"]}
						onValueChange={(e) => setKind(e)}
					/>
					<CheckboxField
						label={t("Комментарии", "Comments")}
						checked={comments}
						description={t(
							"Включить в анализ комментарии, ответы и inline-контекст.",
							"Include comments, replies and inline context in the analysis.",
						)}
						onCheckedChange={(e) => setComments(e)}
					/>
					<Button
						disabled={
							operationBusy || configInvalid || !source.trim() || !profile
						}
						onClick={scan}
					>
						{t("Запустить анализ", "Start analysis")}
					</Button>
				</div>
			</AppDialog>
			<AppDialog
				title={t("Применение решений · preview", "Apply decisions · preview")}
				open={applying}
				onDismiss={() => setApplying(false)}
			>
				<div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
					<RequiredNote t={t} />
					{dialogError && <Notice tone="red">{dialogError}</Notice>}
					<ChoiceField
						required
						searchable
						label={t("Миграция", "Migration")}
						value={run}
						options={reports.map((r) => ({
							value: r.runId,
							label: `${r.source.title} · ${r.runId.slice(0, 8)}`,
						}))}
						onValueChange={(v) => setRun(v ?? "")}
					/>
					<ChoiceField
						clearable
						label="Mentions"
						description={t(
							"Необязательно: опубликованная версия решений упоминаний.",
							"Optional: a published mention decision revision.",
						)}
						value={mentionRevision}
						options={catalogs
							.filter((c) => c.kind === "mentions" && c.published)
							.map((c) => ({
								value: c.id,
								label: `${c.id.slice(0, 8)} · ${c.source.instance}`,
							}))}
						onValueChange={setMentionRevision}
					/>
					<ChoiceField
						clearable
						label="Hashtags"
						description={t(
							"Необязательно: опубликованная версия решений тегов. Выберите хотя бы один тип.",
							"Optional: a published hashtag decision revision. Select at least one type.",
						)}
						value={hashtagRevision}
						options={catalogs
							.filter((c) => c.kind === "hashtags" && c.published)
							.map((c) => ({
								value: c.id,
								label: `${c.id.slice(0, 8)} · ${c.source.instance}`,
							}))}
						onValueChange={setHashtagRevision}
					/>
					<Notice>
						{t(
							"Невыбранный тип решений сохраняется. Будут изменены только затронутые страницы и архивы, без создания страниц и изменения родителей.",
							"Unselected policy is preserved. Only affected pages and archives change; no pages are created or moved.",
						)}
					</Notice>
					<Button
						disabled={
							operationBusy || !run || (!mentionRevision && !hashtagRevision)
						}
						onClick={apply}
					>
						{t("Подготовить preview", "Prepare preview")}
					</Button>
				</div>
			</AppDialog>
		</>
	);
}
