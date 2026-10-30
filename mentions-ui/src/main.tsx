import { Badge } from "../../ui/components/badge";
import { ChoiceGroup, InputField, Notice, AppDialog } from "../../ui/fields";
import { Button } from "../../ui/components/button";
import "@fontsource-variable/inter";
import "./style.css";
import { useVirtualizer } from "@tanstack/react-virtual";
import {
	Download,
	Moon,
	Search,
	Sun,
	Trash2,
	Undo2,
	Upload,
	X,
	RefreshCw,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import { safeMentionUrl } from "../../src/mention-decisions.js";
import { filterDecisions } from "./model";
import {
	changeDecision,
	changeText,
	defaultLabel,
	entryKey,
	entryName,
	parseDocument,
	rowError,
	serializeDocument,
	type EditorDocument,
	type EditorEntry,
	type EditorKind,
} from "./adapter";
const kind: EditorKind =
	window.document.getElementById("ywtc-mentions-data")?.dataset.kind ===
	"hashtags"
		? "hashtags"
		: "mentions";
const subject = kind === "hashtags" ? "тегов" : "упоминаний";
window.document.title = `ywtc · Решения для ${subject}`;
function initialTheme(): "light" | "dark" {
	try {
		const theme = localStorage.getItem("ywtc-mentions-theme");
		if (theme === "light" || theme === "dark") return theme;
	} catch {}
	return matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}
function Editor({ initial }: { initial: EditorDocument }) {
	const [document, setDocument] = useState(initial),
		[baseline, setBaseline] = useState(JSON.stringify(initial));
	const [theme, setTheme] = useState(initialTheme),
		[search, setSearch] = useState(""),
		[filter, setFilter] = useState("all");
	const [error, setError] = useState(""),
		[pending, setPending] = useState<EditorDocument>(),
		[removed, setRemoved] = useState<{
			entry: EditorEntry;
			index: number;
		}>();
	const fileInput = useRef<HTMLInputElement>(null),
		scroll = useRef<HTMLDivElement>(null);
	useEffect(() => {
		window.document.documentElement.classList.toggle("dark", theme === "dark");
		window.document.documentElement.classList.toggle(
			"light",
			theme === "light",
		);
	}, [theme]);
	const rows = filterDecisions(document.entries, search, filter),
		dirty = JSON.stringify(document) !== baseline;
	const virtual = useVirtualizer({
		count: rows.length,
		getScrollElement: () => scroll.current,
		estimateSize: () => 160,
		overscan: 8,
	});
	const virtualized = rows.length > 80;
	const replaceDocument = (value: EditorDocument) => {
		setDocument(value);
		setBaseline(JSON.stringify(value));
		setRemoved(undefined);
		setPending(undefined);
		setSearch("");
		setFilter("all");
		setError("");
	};
	const update = (index: number, entry: EditorEntry) => {
		setDocument((current) => ({
			...current,
			entries: current.entries.map((value, position) =>
				position === index ? entry : value,
			),
		}));
	};
	const importFile = async (file: File) => {
		try {
			const value = parseDocument(JSON.parse(await file.text()), kind);
			if (dirty) setPending(value);
			else replaceDocument(value);
		} catch (failure) {
			setError(`Файл не открыт: ${(failure as Error).message}`);
		}
	};
	const save = () => {
		try {
			const json = serializeDocument(document, kind),
				url = URL.createObjectURL(
					new Blob([json], { type: "application/json" }),
				);
			const link = window.document.createElement("a");
			link.href = url;
			link.download = "decisions.json";
			link.click();
			setTimeout(() => URL.revokeObjectURL(url), 0);
			setBaseline(JSON.stringify(document));
			setError("");
		} catch (failure) {
			setError((failure as Error).message);
		}
	};
	const renderRow = ({
		entry,
		index,
	}: {
		entry: EditorEntry;
		index: number;
	}) => {
		const label =
			entry.decision === "skip"
				? entryName(entry)
				: (entry.text ?? defaultLabel(entry));
		const count =
			entry.occurrences?.reduce(
				(sum, occurrence) => sum + occurrence.count,
				0,
			) ?? 0;
		return (
			<div className="decision-row" data-testid="decision-row">
				<div
					style={{
						display: "flex",
						flexDirection: "row",
						gap: 8,
						alignItems: "flex-start",
						justifyContent: "space-between",
						flexWrap: "wrap",
					}}
				>
					<div
						className="identity"
						style={{ display: "flex", flexDirection: "column", gap: 4 }}
					>
						<p style={{ fontWeight: 600 }}>{entryName(entry)}</p>
						<p style={{ color: "var(--muted-foreground)", fontSize: 12 }}>
							{entryKey(entry)}
						</p>
						{count > 0 && <Badge variant="secondary">{count} вхождений</Badge>}
					</div>
					<div
						style={{
							display: "flex",
							flexDirection: "row",
							alignItems: "center",
							flexWrap: "wrap",
							gap: 8,
						}}
					>
						<ChoiceGroup
							aria-label={`Решение ${entryName(entry)}`}
							value={entry.decision}
							options={[
								{ label: "Как есть", value: "skip" },
								...(kind === "hashtags"
									? [{ label: "Текст", value: "text" }]
									: []),
								{ label: "Ссылка", value: "url" },
							]}
							onValueChange={(value) =>
								update(index, changeDecision(entry, value))
							}
						/>
						<Button
							aria-label={`Удалить ${entryName(entry)}`}
							onClick={() => {
								setRemoved({ entry, index });
								setDocument((current) => ({
									...current,
									entries: current.entries.filter(
										(_, position) => position !== index,
									),
								}));
							}}
							variant="ghost"
							size="icon-sm"
							className="text-destructive"
						>
							<Trash2 size={17} />
						</Button>
					</div>
				</div>
				{entry.decision !== "skip" && (
					<div className="link-fields">
						{entry.decision === "url" && (
							<InputField
								label="URL"
								aria-label={`URL ${entryName(entry)}`}
								value={entry.url}
								error={
									rowError(entry)
										? "Укажите корректный HTTP(S) URL и текст"
										: undefined
								}
								onChange={(event) =>
									update(index, { ...entry, url: event.currentTarget.value })
								}
							/>
						)}
						<InputField
							label={entry.decision === "url" ? "Текст ссылки" : "Текст"}
							aria-label={`Текст ${entryName(entry)}`}
							placeholder={defaultLabel(entry)}
							value={entry.text ?? ""}
							onChange={(event) =>
								update(index, changeText(entry, event.currentTarget.value))
							}
						/>
						{entry.decision === "url" && safeMentionUrl(entry.url) && (
							<a
								href={entry.url}
								target="_blank"
								rel="noopener noreferrer"
								aria-label={`Предпросмотр ${entryName(entry)}`}
								className={"preview" + " ui-link"}
							>
								{label}
							</a>
						)}
					</div>
				)}
				{!!entry.occurrences?.length && (
					<details onToggle={() => virtual.measure()}>
						<summary>Где встречается</summary>
						{entry.occurrences.map((occurrence) => (
							<div
								className="context"
								key={`${occurrence.pageId}:${occurrence.location}:${occurrence.commentId ?? ""}`}
							>
								{safeMentionUrl(occurrence.pageUrl) ? (
									<a
										href={occurrence.pageUrl}
										target="_blank"
										rel="noopener noreferrer"
										className="ui-link"
									>
										{occurrence.pageTitle || occurrence.pageId}
									</a>
								) : (
									<p>{occurrence.pageTitle || occurrence.pageId}</p>
								)}
								<p style={{ color: "var(--muted-foreground)", fontSize: 12 }}>
									{occurrence.location === "comment"
										? `Комментарий ${occurrence.commentId}`
										: "Страница"}{" "}
									· {occurrence.count} ×
								</p>
							</div>
						))}
					</details>
				)}
			</div>
		);
	};
	return (
		<div
			style={{
				width: "100%",
				marginInline: "auto",
				maxWidth: 1120,
				paddingBlock: 32,
			}}
		>
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
				<div>
					<p style={{ color: "var(--muted-foreground)", fontSize: 12 }}>
						YWTC / {kind.toUpperCase()}
					</p>
					<h1 style={{ fontSize: 28 }} className="font-semibold tracking-tight">
						Решения для {subject}
					</h1>
				</div>
				<Button
					aria-label={theme === "light" ? "Тёмная тема" : "Светлая тема"}
					onClick={() => {
						const next = theme === "light" ? "dark" : "light";
						setTheme(next);
						try {
							localStorage.setItem("ywtc-mentions-theme", next);
						} catch {}
					}}
					variant="ghost"
					size="icon-sm"
				>
					{theme === "light" ? <Moon size={20} /> : <Sun size={20} />}
				</Button>
			</div>
			<p style={{ color: "var(--muted-foreground)", marginTop: 8 }}>
				{document.source.provider} · {document.source.instance}
			</p>
			<p style={{ color: "var(--muted-foreground)", fontSize: 14 }}>
				Одно решение для всех вхождений. Удалённые и отсутствующие записи
				переносятся как есть.
			</p>
			<div
				style={{
					display: "flex",
					flexDirection: "row",
					gap: 8,
					alignItems: "center",
					flexWrap: "wrap",
					marginBlock: 24,
				}}
			>
				<Button
					leadingIcon={<Upload />}
					onClick={() => fileInput.current?.click()}
					variant="secondary"
				>
					Открыть JSON
				</Button>
				<Button leadingIcon={<Download />} onClick={save}>
					Сохранить JSON
				</Button>
				{removed && (
					<Button
						leadingIcon={<Undo2 />}
						onClick={() => {
							setDocument((current) => {
								const entries = [...current.entries];
								entries.splice(removed.index, 0, removed.entry);
								return { ...current, entries };
							});
							setRemoved(undefined);
						}}
						variant="ghost"
					>
						Отменить удаление
					</Button>
				)}
				{dirty && (
					<p style={{ color: "var(--warning)", fontSize: 14 }}>
						Есть несохранённые изменения
					</p>
				)}
			</div>
			<input
				ref={fileInput}
				type="file"
				accept=".json,application/json"
				hidden
				aria-label="Файл решений"
				onChange={(event) => {
					const file = event.currentTarget.files?.[0];
					event.currentTarget.value = "";
					if (file) void importFile(file);
				}}
			/>
			{error && (
				<Notice
					role="alert"
					title="Проверьте данные"
					tone={"red"}
					style={{ marginBottom: 16 }}
				>
					{error}
				</Notice>
			)}
			{document.inventory && !document.inventory.complete && (
				<Notice
					title="Инвентаризация неполная"
					tone={"orange"}
					style={{ marginBottom: 16 }}
				>
					Прочитано {document.inventory.scannedPages} из{" "}
					{document.inventory.selectedPages} страниц.{" "}
					<details>
						<summary>Диагностика</summary>
						{document.inventory.issues.map((issue) => (
							<p key={JSON.stringify(issue)} style={{ fontSize: 14 }}>
								{issue.pageId ? `[${issue.pageId}] ` : ""}
								{issue.phase} · {issue.code}: {issue.message}
							</p>
						))}
					</details>
				</Notice>
			)}
			<div
				style={{
					display: "flex",
					flexDirection: "row",
					gap: 8,
					alignItems: "center",
					flexWrap: "wrap",
					marginBottom: 16,
				}}
				className="ui-grow"
			>
				<InputField
					aria-label={`Поиск ${subject}`}
					placeholder={
						kind === "hashtags"
							? "Тег или страница"
							: "Упоминание, identity или страница"
					}
					value={search}
					onChange={(event) => setSearch(event.currentTarget.value)}
					leading={<Search size={16} />}
				/>
				<ChoiceGroup
					aria-label="Фильтр решений"
					value={filter}
					options={[
						{ label: "Все", value: "all" },
						{ label: "Skip", value: "skip" },
						...(kind === "hashtags" ? [{ label: "Текст", value: "text" }] : []),
						{ label: "URL", value: "url" },
					]}
					onValueChange={setFilter}
				/>
			</div>
			{rows.length > 0 ? (
				<>
					<p
						style={{
							color: "var(--muted-foreground)",
							fontSize: 14,
							marginBottom: 8,
						}}
					>
						Показано {rows.length} / {document.entries.length}
					</p>
					<div
						className="decision-list"
						ref={scroll}
						role="tree"
						aria-label={`Список ${subject}`}
						onKeyDown={(event) => {
							if (
								!["ArrowDown", "ArrowUp"].includes(event.key) ||
								(event.target as HTMLElement).tagName !== "DIV"
							)
								return;
							const current = Number(
								(event.target as HTMLElement).dataset.index,
							);
							if (!Number.isFinite(current)) return;
							event.preventDefault();
							const next = Math.max(
								0,
								Math.min(
									rows.length - 1,
									current + (event.key === "ArrowDown" ? 1 : -1),
								),
							);
							virtual.scrollToIndex(next);
							requestAnimationFrame(() =>
								scroll.current
									?.querySelector<HTMLElement>(`[data-index="${next}"]`)
									?.focus(),
							);
						}}
					>
						{virtualized ? (
							<div
								style={{ height: virtual.getTotalSize(), position: "relative" }}
							>
								{virtual.getVirtualItems().map((item) => (
									<div
										key={entryKey(rows[item.index]!.entry)}
										data-index={item.index}
										ref={virtual.measureElement}
										role="treeitem"
										aria-level={1}
										tabIndex={0}
										style={{
											position: "absolute",
											top: 0,
											width: "100%",
											transform: `translateY(${item.start}px)`,
										}}
									>
										{renderRow(rows[item.index]!)}
									</div>
								))}
							</div>
						) : (
							rows.map((row, index) => (
								<div
									key={entryKey(row.entry)}
									data-index={index}
									role="treeitem"
									aria-level={1}
									tabIndex={0}
								>
									{renderRow(row)}
								</div>
							))
						)}
					</div>
				</>
			) : (
				<p style={{ color: "var(--muted-foreground)", paddingBlock: 32 }}>
					{document.entries.length
						? "По вашему запросу ничего не найдено."
						: kind === "hashtags"
							? "Тегов нет. Можно открыть другой JSON."
							: "Упоминаний нет. Можно открыть другой JSON."}
				</p>
			)}
			<AppDialog
				title="Заменить текущие решения?"
				open={Boolean(pending)}
				onDismiss={() => setPending(undefined)}
				closeLabel={"Отмена"}
			>
				<p>Несохранённые изменения будут потеряны.</p>
				<div
					style={{
						display: "flex",
						flexDirection: "row",
						gap: 8,
						alignItems: "center",
						flexWrap: "wrap",
						marginTop: 24,
						justifyContent: "flex-end",
					}}
				>
					<Button
						leadingIcon={<X />}
						onClick={() => setPending(undefined)}
						variant="outline"
					>
						Отмена
					</Button>
					<Button
						leadingIcon={<RefreshCw />}
						onClick={() => {
							if (pending) replaceDocument(pending);
						}}
					>
						Заменить
					</Button>
				</div>
			</AppDialog>
		</div>
	);
}
const root = createRoot(window.document.getElementById("root")!);
try {
	root.render(
		<Editor
			initial={parseDocument(
				JSON.parse(
					window.document.getElementById("ywtc-mentions-data")!.textContent!,
				),
				kind,
			)}
		/>,
	);
} catch {
	root.render(
		<p role="alert">
			Невалидный начальный JSON решений. Создайте экспорт заново.
		</p>,
	);
}
