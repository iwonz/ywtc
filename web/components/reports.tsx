"use client";
import { Button } from "../../ui/components/button";
import {
	Hint,
	Notice,
	InputField,
	ChoiceField,
	CheckboxField,
	AppDialog,
} from "../../ui/fields";
import { Badge } from "../../ui/components/badge";
import {
	TabsTrigger,
	TabsList,
	TabsContent,
	Tabs,
} from "../../ui/components/tabs";
import { useEffect, useState } from "react";
import { ChevronDown, ChevronRight, ExternalLink, Eye } from "lucide-react";
import { api, download, safeLink, statusColor, type Translate } from "./api";
const isolated = (body: string) =>
	`<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; img-src data: blob:; base-uri 'none'; form-action 'none'"><style>body{font:14px system-ui;padding:16px;overflow-wrap:anywhere}img{max-width:100%}table{border-collapse:collapse}td,th{border:1px solid #ddd;padding:5px}</style>${body}`;
function LinkIcon({ url, label }: { url?: string; label: string }) {
	const href = safeLink(url);
	return (
		<Hint content={label}>
			<Button
				asChild={Boolean(href)}
				disabled={!href}
				className="report-reference"
				aria-label={label}
				variant="ghost"
				size="icon-sm"
			>
				{href ? (
					<a href={href} target="_blank" rel="noopener noreferrer">
						<ExternalLink size={15} aria-hidden="true" />
					</a>
				) : (
					<ExternalLink size={15} aria-hidden="true" />
				)}
			</Button>
		</Hint>
	);
}
export function Reports({
	root,
	t,
	initialRun,
	onError,
	onJob,
}: {
	root: string;
	t: Translate;
	initialRun?: string;
	onError: (e: unknown) => void;
	onJob: (id: string) => void;
}) {
	const [reports, setReports] = useState<any[]>([]),
		[invalidReports, setInvalidReports] = useState<string[]>([]),
		[run, setRun] = useState(initialRun),
		[report, setReport] = useState<any>(),
		[rows, setRows] = useState<any[]>([]),
		[total, setTotal] = useState(0),
		[offset, setOffset] = useState(0),
		[query, setQuery] = useState(""),
		[filter, setFilter] = useState("all"),
		[details, setDetails] = useState<any>(),
		[selected, setSelected] = useState<string[]>([]),
		[resources, setResources] = useState<Record<string, string[]>>({}),
		[comments, setComments] = useState<string[]>([]),
		[override, setOverride] = useState(false),
		[collapsed, setCollapsed] = useState<string[]>([]),
		[state, setState] = useState<any>(),
		[stateOffset, setStateOffset] = useState(0),
		[reportOffset, setReportOffset] = useState(0),
		[reportTotal, setReportTotal] = useState(0);
	useEffect(() => {
		api(`${root}/reports?offset=${reportOffset}`)
			.then((d) => {
				setReports(d.items);
				setInvalidReports(d.invalid ?? []);
				setReportTotal(d.total);
			})
			.catch(onError);
	}, [root, reportOffset, onError]);
	useEffect(() => {
		if (run) {
			api(`${root}/reports/${run}`).then(setReport).catch(onError);
			setSelected([]);
			setResources({});
			setComments([]);
		}
	}, [root, run, onError]);
	useEffect(() => {
		if (run)
			api(
				`${root}/reports/${run}/rows?offset=${offset}&q=${encodeURIComponent(query)}&filter=${filter}`,
			)
				.then((d) => {
					setRows(d.items);
					setTotal(d.total);
				})
				.catch(onError);
	}, [root, run, offset, query, filter, onError]);
	const toggle = (items: string[], id: string) =>
		items.includes(id) ? items.filter((i) => i !== id) : [...items, id];
	const open = (id: string) =>
		api(`${root}/reports/${run}/page?id=${encodeURIComponent(id)}`)
			.then(setDetails)
			.catch(onError);
	const preview = () =>
		api(`${root}/jobs`, "POST", {
			request: {
				kind: "targeted",
				runId: run,
				action: "retry",
				dryRun: true,
				selection: {
					pageIds: selected,
					resourceIds: resources,
					commentPageIds: comments,
					terminalOverride: override,
				},
			},
		})
			.then((j) => onJob(j.id))
			.catch(onError);
	const grouped = Object.groupBy(reports, (r) => r.state?.id ?? "unknown");
	const hidden = new Set<string>();
	for (const row of rows)
		if (collapsed.includes(row.parentId) || hidden.has(row.parentId))
			hidden.add(row.id);
	return (
		<>
			<div className="section-title">
				{t("Миграции и история запусков", "Migrations & run history")}
			</div>
			{invalidReports.length > 0 && (
				<Notice tone={"orange"} style={{ marginBottom: 16 }}>
					{t(
						"Не удалось прочитать bundles: повреждённый JSON, неполные данные или небезопасный путь. Сохранённые файлы не изменены.",
						"Some bundles could not be read: corrupted JSON, incomplete data or unsafe paths. Existing files were preserved.",
					)}
					<div className="mono">{invalidReports.join(", ")}</div>
				</Notice>
			)}
			{Object.entries(grouped).map(([id, runs]) => (
				<section key={id} className="section">
					<div className="mono muted">STATE {id}</div>
					{runs!.map((r) => (
						<div className="row" key={r.runId}>
							<Badge data-tone={statusColor(r.status)} variant="secondary">
								{r.dryRun ? "dry-run" : r.status}
							</Badge>
							<Button
								onClick={() => {
									setRun(r.runId);
									setOffset(0);
									setQuery("");
								}}
								variant="ghost"
							>
								{r.source?.title ?? r.runId.slice(0, 8)}
							</Button>
							<span className="grow muted">
								{new Date(r.finishedAt ?? r.startedAt).toLocaleString()}
							</span>
							{r.sync && (
								<span className="mono">sync · {r.sync.planId.slice(0, 8)}</span>
							)}
							{r.retry && !r.sync && (
								<span className="mono">
									retry {r.retry.attempt} · {r.retry.rootRunId.slice(0, 8)}
								</span>
							)}
							{r.summary.pages > 0 && (
								<Badge variant="outline">{r.summary.pages} pages</Badge>
							)}
							{r.summary.errors > 0 && (
								<Badge data-tone={"red"} variant="secondary">
									{r.summary.errors} errors
								</Badge>
							)}
						</div>
					))}
				</section>
			))}
			{!reports.length && (
				<div className="empty">
					{t(
						"Отчётов пока нет. Можно запустить dry-run или подключить существующий workspace.",
						"No reports yet. Start a dry-run or connect an existing workspace.",
					)}
				</div>
			)}
			{reportTotal > 100 && (
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
						disabled={!reportOffset}
						onClick={() => setReportOffset(Math.max(0, reportOffset - 100))}
					>
						←
					</Button>
					<Button
						disabled={reportOffset + 100 >= reportTotal}
						onClick={() => setReportOffset(reportOffset + 100)}
					>
						→
					</Button>
				</div>
			)}
			{report && (
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
						<h2>{report.source.title}</h2>
						<Badge data-tone={statusColor(report.status)} variant="secondary">
							{report.status}
						</Badge>
					</div>
					<div className="summary">
						{[
							["pages", t("страниц", "pages")],
							["resources", t("файлов", "files")],
							["comments", t("комментариев", "comments")],
							["errors", t("ошибок", "errors")],
							["warnings", t("предупреждений", "warnings")],
							["adaptations", t("адаптаций", "adaptations")],
						].map(([key, label]) =>
							report.summary[key] > 0 ? (
								<span key={key}>
									<strong>{report.summary[key]}</strong>
									{label}
								</span>
							) : null,
						)}
					</div>
					<div
						style={{
							display: "flex",
							flexDirection: "column",
							marginBlock: 16,
							gap: 8,
						}}
					>
						{[
							[t("Страницы", "Pages"), report.summary.pageStatuses],
							[t("Файлы", "Files"), report.summary.resourceStatuses],
							["Grid", report.summary.gridStatuses],
							[
								t("Архивы комментариев", "Comment archives"),
								report.summary.commentStatuses,
							],
							["Mentions", report.summary.mentionOutcomes],
							[
								"Hashtags",
								report.summary.hashtags && {
									preserved: report.summary.hashtags.preserved,
									text: report.summary.hashtags.text,
									linked: report.summary.hashtags.linked,
								},
							],
						].map(([label, counts]: any[]) => {
							const values = Object.entries(counts ?? {}).filter(
								([key, count]) => key !== "total" && Number(count) > 0,
							);
							return values.length ? (
								<section
									key={label}
									aria-label={label}
									style={{
										display: "flex",
										flexDirection: "row",
										gap: 8,
										alignItems: "center",
										flexWrap: "wrap",
									}}
								>
									<span className="muted">{label}</span>
									{values.map(([status, count]) => (
										<Badge
											key={status}
											data-tone={statusColor(status)}
											variant="secondary"
										>
											{status} {String(count)}
										</Badge>
									))}
								</section>
							) : null;
						})}
						{report.summary.excludedPages > 0 && (
							<span className="muted">
								{t("Исключено фильтром источника", "Excluded by source filter")}
								: {report.summary.excludedPages}
							</span>
						)}
						{!report.summary.inventoryComplete && (
							<Notice tone={"orange"}>
								{t(
									"Inventory неполон: totals отражают только известные объекты.",
									"Inventory is incomplete: totals cover only known objects.",
								)}
							</Notice>
						)}
					</div>
					<dl className="meta">
						<dt>RUN ID</dt>
						<dd className="mono">{report.runId}</dd>
						<dt>STATE</dt>
						<dd>
							<Button
								onClick={() => {
									setStateOffset(0);
									api(`${root}/states/${report.state.id}`)
										.then(setState)
										.catch(onError);
								}}
								variant="ghost"
								size="default"
							>
								{report.state.id}
							</Button>
						</dd>
						<dt>SOURCE</dt>
						<dd>
							{safeLink(report.source.url) ? (
								<a
									href={safeLink(report.source.url)}
									target="_blank"
									rel="noreferrer"
								>
									{report.source.url}
								</a>
							) : (
								report.source.url
							)}
						</dd>
						<dt>DESTINATION</dt>
						<dd>
							{safeLink(report.destination.url) ? (
								<a
									href={safeLink(report.destination.url)}
									target="_blank"
									rel="noreferrer"
								>
									{report.destination.url}
								</a>
							) : (
								(report.destination.url ?? report.destination.id)
							)}
						</dd>
					</dl>
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
							onClick={() =>
								api(`${root}/jobs`, "POST", {
									request: { kind: "retry", runId: run, dryRun: true },
								})
									.then((j) => onJob(j.id))
									.catch(onError)
							}
							disabled={report.dryRun}
							variant="secondary"
						>
							{t("План автоматического retry", "Preview automatic retry")}
						</Button>
						<Button
							onClick={() => download(report, `run-${run}-summary.json`)}
							variant="ghost"
						>
							{t("Скачать сводку", "Download summary")}
						</Button>
					</div>
					<div className="toolbar">
						<InputField
							aria-label={t("Поиск в дереве", "Search tree")}
							placeholder={t(
								"Название, файл, ID или диагностика",
								"Title, file, ID or diagnostic",
							)}
							value={query}
							onChange={(e) => {
								setQuery(e.target.value);
								setOffset(0);
							}}
							style={{ flex: 1, minWidth: 220 }}
						/>
						<ChoiceField
							aria-label={t("Статус", "Status")}
							value={filter}
							options={[
								"all",
								"problems",
								"partial",
								"failed",
								"blocked",
								"conflict",
								"excluded",
							]}
							onValueChange={(e) => {
								setFilter(e);
								setOffset(0);
							}}
						/>
					</div>
					<div role="tree" aria-label={t("Иерархия страниц", "Page hierarchy")}>
						{rows
							.filter((row) => !hidden.has(row.id))
							.map((row) => (
								<div
									role="treeitem"
									onClick={(event) => {
										if (
											!(event.target as HTMLElement).closest(
												"button,a,input,label",
											)
										)
											open(row.id);
									}}
									tabIndex={0}
									onKeyDown={(event) => {
										if (event.target !== event.currentTarget) return;
										if (event.key === "Enter" || event.key === " ") {
											event.preventDefault();
											open(row.id);
										}
										if (event.key === "ArrowLeft")
											setCollapsed([...collapsed, row.id]);
										if (event.key === "ArrowRight")
											setCollapsed(collapsed.filter((id) => id !== row.id));
										if (event.key === "ArrowDown" || event.key === "ArrowUp") {
											event.preventDefault();
											const sibling =
												event.key === "ArrowDown"
													? event.currentTarget.nextElementSibling
													: event.currentTarget.previousElementSibling;
											(sibling as HTMLElement | null)?.focus();
										}
									}}
									aria-level={row.depth + 1}
									aria-expanded={!collapsed.includes(row.id)}
									className={`row ${["failed", "conflict"].includes(row.status) ? "danger" : !["complete", "planned"].includes(row.status) ? "problem" : ""}`}
									key={row.id}
									style={
										{
											"--row-indent": `${8 + Math.min(row.depth, 12) * 18}px`,
										} as React.CSSProperties
									}
								>
									<CheckboxField
										aria-label={`${t("Выбрать", "Select")} ${row.title}`}
										disabled={["complete", "excluded", "conflict"].includes(
											row.status,
										)}
										checked={selected.includes(row.id)}
										onCheckedChange={() =>
											setSelected(toggle(selected, row.id))
										}
									/>
									<Button
										aria-label={t("Свернуть ветку", "Toggle branch")}
										onClick={() => setCollapsed(toggle(collapsed, row.id))}
										variant="ghost"
										size="icon-sm"
									>
										{collapsed.includes(row.id) ? (
											<ChevronRight size={14} />
										) : (
											<ChevronDown size={14} />
										)}
									</Button>
									<LinkIcon url={row.sourceUrl} label="Source" />
									<LinkIcon url={row.destinationUrl} label="Destination" />
									<Hint content={t("Детали", "Details")}>
										<Button
											aria-label={`${t("Детали", "Details")} ${row.title}`}
											onClick={() => open(row.id)}
											variant="ghost"
											size="icon-sm"
										>
											<Eye size={16} />
										</Button>
									</Hint>
									<Button
										className="grow"
										onClick={() => open(row.id)}
										variant="ghost"
										style={{ justifyContent: "flex-start" }}
									>
										{row.title}
									</Button>
									<Badge
										data-tone={statusColor(row.status)}
										variant="secondary"
									>
										{row.status}
									</Badge>
									{row.files > 0 && (
										<span className="mono">{row.files} files</span>
									)}
									{row.comments > 0 && (
										<span className="mono">{row.comments} comments</span>
									)}
								</div>
							))}
					</div>
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
						<Button
							disabled={!offset}
							onClick={() => setOffset(Math.max(0, offset - 100))}
							variant="ghost"
						>
							←
						</Button>
						<span className="muted">
							{total
								? `${offset + 1}–${Math.min(offset + 100, total)} / ${total}`
								: t("Нет совпадений", "No matches")}
						</span>
						<Button
							disabled={offset + 100 >= total}
							onClick={() => setOffset(offset + 100)}
							variant="ghost"
						>
							→
						</Button>
					</div>
					{Boolean(
						selected.length ||
							Object.values(resources).some((a) => a.length) ||
							comments.length,
					) && (
						<div
							style={{
								display: "flex",
								flexDirection: "column",
								gap: 16,
								marginTop: 24,
							}}
						>
							<CheckboxField
								label={t(
									"Включить выбранные terminal/non-retryable ошибки (ownership не обходится)",
									"Include selected terminal/non-retryable errors (ownership is never bypassed)",
								)}
								checked={override}
								onCheckedChange={(e) => setOverride(e)}
							/>
							<Button onClick={preview}>
								{t("Подготовить точечный retry", "Preview selected retry")}
							</Button>
						</div>
					)}
				</section>
			)}
			<AppDialog
				title={details?.page.sourceTitle}
				open={Boolean(details)}
				onDismiss={() => setDetails(undefined)}
				width={"90%"}
			>
				<Tabs defaultValue="overview">
					<TabsList>
						{[
							["overview", t("Обзор", "Overview")],
							["files", t("Файлы", "Files")],
							["comments", t("Комментарии", "Comments")],
							["compare", t("Сравнение", "Compare")],
							["issues", t("Проблемы", "Issues")],
						].map(([value, label]) => (
							<TabsTrigger value={value} key={value}>
								{label}
							</TabsTrigger>
						))}
					</TabsList>
					<TabsContent value="overview" style={{ paddingTop: 16 }}>
						<dl className="meta">
							{details &&
								Object.entries(details.page)
									.filter(
										([key, value]) =>
											![
												"resourceItems",
												"comments",
												"mentions",
												"hashtags",
											].includes(key) &&
											typeof value !== "object" &&
											value !== 0 &&
											value !== undefined,
									)
									.map(([key, value]) => (
										<div style={{ display: "contents" }} key={key}>
											<dt>{key}</dt>
											<dd className="mono">{String(value)}</dd>
										</div>
									))}
						</dl>
					</TabsContent>
					<TabsContent value="files" style={{ paddingTop: 16 }}>
						{details?.page.resourceItems?.map((file: any) => (
							<div className="row" key={file.sourceId}>
								<CheckboxField
									disabled={
										file.status === "complete" ||
										details.page.status === "conflict"
									}
									checked={(
										resources[details.page.sourceCanonicalId] ?? []
									).includes(file.sourceId)}
									aria-label={`Retry ${file.sourceName}`}
									onCheckedChange={() =>
										setResources({
											...resources,
											[details.page.sourceCanonicalId]: toggle(
												resources[details.page.sourceCanonicalId] ?? [],
												file.sourceId,
											),
										})
									}
								/>
								<div className="grow">
									<strong>{file.sourceName}</strong>
									<p className="mono">
										{file.destinationName}{" "}
										{file.transferredBytes
											? `· ${file.transferredBytes} B`
											: ""}
									</p>
									{file.error && <Notice tone={"red"}>{file.error}</Notice>}
									<div className="mono">{file.sha256}</div>
								</div>
								<LinkIcon url={file.sourceUrl} label="Source file" />
								<LinkIcon url={file.destinationUrl} label="Destination file" />
								<Badge data-tone={statusColor(file.status)} variant="secondary">
									{file.status}
								</Badge>
							</div>
						))}
					</TabsContent>
					<TabsContent value="comments" style={{ paddingTop: 16 }}>
						{details?.page.comments && (
							<>
								<CheckboxField
									label={t(
										"Повторить только архив комментариев",
										"Retry comment archive only",
									)}
									disabled={
										details.page.status === "conflict" ||
										!report?.commentsEnabled
									}
									checked={comments.includes(details.page.sourceCanonicalId)}
									onCheckedChange={() =>
										setComments(
											toggle(comments, details.page.sourceCanonicalId),
										)
									}
								/>
								<p>
									{details.page.comments.status}{" "}
									{details.page.comments.comments || ""}
								</p>
								{details.page.comments.error && (
									<Notice tone={"red"}>{details.page.comments.error}</Notice>
								)}
								{details.page.comments.items?.map((item: any) => (
									<div className="row" key={item.commentId}>
										<span>
											{item.author} · {item.createdAt}
										</span>
										<span className="mono">{item.commentId}</span>
										<Badge variant="secondary">{item.outcome}</Badge>
										{item.error}
									</div>
								))}
							</>
						)}
					</TabsContent>
					<TabsContent value="compare" style={{ paddingTop: 16 }}>
						{details?.preview ? (
							<div className="preview-grid">
								<div>
									<strong>Source</strong>
									<iframe
										title="Source preview"
										sandbox=""
										referrerPolicy="no-referrer"
										srcDoc={isolated(details.preview.source)}
									/>
								</div>
								<div>
									<strong>Destination</strong>
									<iframe
										title="Destination preview"
										sandbox=""
										referrerPolicy="no-referrer"
										srcDoc={isolated(details.preview.destination)}
									/>
								</div>
							</div>
						) : (
							<Notice>
								{t(
									"Preview отсутствует в этом отчёте.",
									"Preview is unavailable in this report.",
								)}
							</Notice>
						)}
					</TabsContent>
					<TabsContent value="issues" style={{ paddingTop: 16 }}>
						{details?.issues.map((issue: any) => (
							<div
								className="section"
								key={
									issue.id ?? `${issue.code}-${issue.objectId ?? issue.pageId}`
								}
							>
								<Badge
									data-tone={statusColor(
										issue.severity === "error" ? "failed" : issue.severity,
									)}
									variant="secondary"
								>
									{issue.severity}
								</Badge>
								<h4>{issue.message}</h4>
								<p>{issue.action}</p>
								<div className="mono">
									{issue.code} · {issue.phase} · {issue.category} ·{" "}
									{issue.retryable ? "retryable" : "terminal"}
									{issue.rootCauseId && ` · depends on ${issue.rootCauseId}`}
								</div>
								<details>
									<summary>{t("Диагностика", "Technical details")}</summary>
									<pre className="code">{JSON.stringify(issue, null, 2)}</pre>
								</details>
							</div>
						))}
					</TabsContent>
				</Tabs>
			</AppDialog>
			<AppDialog
				title={t("State · только чтение", "State · read only")}
				open={Boolean(state)}
				onDismiss={() => setState(undefined)}
				width="72rem"
			>
				<pre className="code">{JSON.stringify(state, null, 2)}</pre>
				{state?.items[0]?.pageCount > 100 && (
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
							disabled={!stateOffset}
							onClick={() => {
								setStateOffset(Math.max(0, stateOffset - 100));
								api(
									`${root}/states/${report.state.id}?offset=${Math.max(0, stateOffset - 100)}`,
								)
									.then(setState)
									.catch(onError);
							}}
						>
							←
						</Button>
						<Button
							disabled={stateOffset + 100 >= state.items[0].pageCount}
							onClick={() => {
								setStateOffset(stateOffset + 100);
								api(
									`${root}/states/${report.state.id}?offset=${stateOffset + 100}`,
								)
									.then(setState)
									.catch(onError);
							}}
						>
							→
						</Button>
					</div>
				)}
			</AppDialog>
		</>
	);
}
