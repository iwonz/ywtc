import { Badge } from "../../ui/components/badge";
import { Button } from "../../ui/components/button";
import {
	Hint,
	Notice,
	InputField,
	ChoiceField,
	ExpandPanel,
	AppDialog,
} from "../../ui/fields";
import {
	TableCell,
	TableRow,
	TableBody,
	Table,
	TableHead,
	TableHeader,
} from "../../ui/components/table";
import { ScrollArea } from "../../ui/components/scroll-area";
import {
	TabsTrigger,
	TabsList,
	TabsContent,
	Tabs,
} from "../../ui/components/tabs";
import { useVirtualizer } from "@tanstack/react-virtual";
import {
	AlertTriangle,
	Archive,
	AtSign,
	Hash,
	Ban,
	CheckCircle2,
	ChevronRight,
	CircleDashed,
	Database,
	Download,
	ExternalLink,
	Eye,
	FileImage,
	FileWarning,
	FolderTree,
	Info,
	Monitor,
	MessageSquare,
	Moon,
	Paperclip,
	Search,
	ShieldAlert,
	Sun,
	Timer,
	XCircle,
} from "lucide-react";
import {
	type CSSProperties,
	type ReactNode,
	useEffect,
	useMemo,
	useRef,
	useState,
} from "react";
import type {
	ReportPresentationPayload,
	TransferReportData,
	TransferReportIssue,
} from "../../src/report-contract";
import reportHeader from "../../docs/assets/report-header-transparent.png";
import {
	initialLocale,
	type Locale,
	translator,
	type TranslationKey,
} from "./i18n";
import {
	formatBytes,
	guardedStorageGet,
	guardedStorageSet,
	safeLink,
} from "./lib";
import {
	buildReportTree,
	problemCount,
	type ReportTreeFilter,
	type ReportTreeNode,
	visibleTreeNodes,
} from "./model";
import {
	positiveCounts,
	visibleDetailSections,
	visibleSummarySections,
} from "./presentation";
type Theme = "system" | "light" | "dark";
type Translate = (key: TranslationKey) => string;
type DefinitionItem = [label: string, value: ReactNode | undefined | null];
const categoryLabels: Record<
	Locale,
	Record<TransferReportIssue["category"], string>
> = {
	en: {
		network: "network",
		"rate-limit": "rate limit",
		authorization: "authorization",
		permissions: "permissions",
		"provider-api": "provider API",
		parsing: "parsing",
		"rendering-layout": "rendering / layout",
		verification: "verification",
		hierarchy: "hierarchy",
		conflict: "conflict",
		"attachment-image": "attachment / image",
		comment: "comment",
		mention: "mention",
		filtering: "filtering",
		dependency: "dependency",
		unknown: "unknown",
	},
	ru: {
		network: "сеть",
		"rate-limit": "лимит запросов",
		authorization: "авторизация",
		permissions: "права",
		"provider-api": "API провайдера",
		parsing: "разбор",
		"rendering-layout": "разметка / вёрстка",
		verification: "проверка",
		hierarchy: "иерархия",
		conflict: "конфликт",
		"attachment-image": "вложение / изображение",
		comment: "комментарий",
		mention: "упоминание",
		filtering: "фильтрация",
		dependency: "зависимость",
		unknown: "неизвестно",
	},
};
const filterValues: ReportTreeFilter[] = [
	"all",
	"problems",
	"partial",
	"failed",
	"blocked",
	"conflict",
	"excluded",
];
function issueActionLabel(issue: TransferReportIssue, locale: Locale): string {
	if (locale === "en") return issue.action;
	if (issue.severity === "blocked")
		return "Устраните ошибку вышестоящей страницы и повторите ту же миграцию.";
	if (issue.retryable)
		return "Повторите ту же миграцию: объект будет обработан заново.";
	if (issue.severity === "degradation")
		return "Сравните source и destination во вкладке сравнения.";
	if (issue.severity === "adaptation")
		return "Действие не требуется: данные сохранены в эквивалентном представлении.";
	if (issue.severity === "normalization") return "Действие не требуется.";
	if (issue.category === "authorization")
		return "Проверьте токен подключения, выполните doctor и повторите миграцию.";
	if (issue.category === "permissions")
		return "Предоставьте пользователю токена доступ к объекту и повторите миграцию.";
	if (issue.category === "mention")
		return "Проверьте source identity и явный mapping решений; при необходимости повторите перенос затронутого объекта.";
	if (issue.category === "conflict")
		return "Проверьте ownership и identity destination-объекта, затем повторите миграцию.";
	return "Проверьте причину, затронутый объект и техническую диагностику.";
}
function statusTranslation(status: string): TranslationKey | undefined {
	if (status === "excluded") return "excludedStatus";
	if (status === "completed") return "complete";
	if (status === "completed-with-warnings") return "warning";
	return [
		"complete",
		"partial",
		"failed",
		"blocked",
		"conflict",
		"planned",
		"not-started",
		"discovered",
		"skeleton-created",
		"skipped",
		"native",
		"linked",
		"text",
		"preserved",
		"unresolved",
	].includes(status)
		? (status as TranslationKey)
		: undefined;
}
function statusColor(status: string): string {
	if (
		status === "complete" ||
		status === "completed" ||
		status === "native" ||
		status === "linked" ||
		status === "text" ||
		status === "preserved"
	)
		return "teal";
	if (status === "failed") return "red";
	if (status === "conflict") return "grape";
	if (
		status === "partial" ||
		status === "planned" ||
		status === "completed-with-warnings" ||
		status === "unresolved"
	)
		return "yellow";
	if (status === "blocked" || status === "not-started" || status === "excluded")
		return "gray";
	return "blue";
}
function StatusIcon({ status, size = 13 }: { status: string; size?: number }) {
	if (
		status === "complete" ||
		status === "completed" ||
		status === "native" ||
		status === "linked" ||
		status === "text" ||
		status === "preserved"
	)
		return <CheckCircle2 size={size} aria-hidden="true" />;
	if (status === "failed") return <XCircle size={size} aria-hidden="true" />;
	if (status === "blocked") return <Ban size={size} aria-hidden="true" />;
	if (status === "conflict")
		return <ShieldAlert size={size} aria-hidden="true" />;
	if (status === "excluded") return <Archive size={size} aria-hidden="true" />;
	if (status === "not-started" || status === "planned")
		return <Timer size={size} aria-hidden="true" />;
	if (
		status === "partial" ||
		status === "completed-with-warnings" ||
		status === "unresolved"
	)
		return <AlertTriangle size={size} aria-hidden="true" />;
	return <CircleDashed size={size} aria-hidden="true" />;
}
function StatusBadge({ status, t }: { status: string; t: Translate }) {
	const key = statusTranslation(status);
	return (
		<Badge data-tone={statusColor(status)} variant="secondary">
			{<StatusIcon status={status} size={12} />}
			{key ? t(key) : status}
		</Badge>
	);
}
function ExternalIcon({
	href,
	label,
	color = "gray",
	children,
}: {
	href?: string | undefined;
	label: string;
	color?: string;
	children: ReactNode;
}) {
	const safe = safeLink(href);
	if (!safe) return null;
	return (
		<Hint content={label} delay={250}>
			<Button
				aria-label={label}
				onClick={(event) => event.stopPropagation()}
				variant="ghost"
				size="icon-sm"
				style={{
					color:
						color === "gray"
							? "var(--muted-foreground)"
							: color === "green"
								? "var(--success)"
								: "var(--primary)",
				}}
				asChild={true}
			>
				<a href={safe} target={"_blank"} rel={"noreferrer"}>
					{children}
				</a>
			</Button>
		</Hint>
	);
}
function formatDate(value: string | undefined, locale: Locale): string {
	if (!value) return "";
	const date = new Date(value);
	return Number.isNaN(date.valueOf())
		? value
		: new Intl.DateTimeFormat(locale === "ru" ? "ru-RU" : "en-US", {
				dateStyle: "medium",
				timeStyle: "short",
			}).format(date);
}
function countText(entries: Array<[number, string]>): string | undefined {
	const visible = entries.filter(([count]) => count > 0);
	return visible.length > 0
		? visible.map(([count, label]) => `${count} ${label}`).join(" · ")
		: undefined;
}
function byteSummary(
	knownBytes: number,
	unknownSizes: number,
	t: Translate,
): string | undefined {
	const parts: string[] = [];
	if (knownBytes > 0) parts.push(`${formatBytes(knownBytes)} ${t("known")}`);
	if (unknownSizes > 0) parts.push(`${unknownSizes} ${t("unknownSizes")}`);
	return parts.length > 0 ? parts.join(" · ") : undefined;
}
function OutcomeList({
	counts,
	t,
}: {
	counts: Record<string, number>;
	t: Translate;
}) {
	const entries = positiveCounts(counts);
	if (entries.length === 0) return null;
	return (
		<div
			style={{
				display: "flex",
				flexDirection: "row",
				alignItems: "center",
				gap: 6,
				flexWrap: "wrap",
			}}
		>
			{entries.map(([status, count]) => {
				const key = statusTranslation(status);
				return (
					<Badge
						key={status}
						data-tone={statusColor(status)}
						variant="secondary"
					>
						{key ? t(key) : status} · {count}
					</Badge>
				);
			})}
		</div>
	);
}
function SummaryTable({
	report,
	t,
}: {
	report: TransferReportData;
	t: Translate;
}) {
	const summary = report.summary;
	const sourceBytes = summary.sourceBytes + summary.commentBytes;
	const sections = visibleSummarySections(summary);
	const inventoryTelemetry = countText([
		[summary.inventoryReusedPages ?? 0, t("reused")],
		[summary.inventoryFreshPages ?? 0, t("fresh")],
		[summary.inventoryRecoveryAttempts ?? 0, t("recoveryAttempts")],
		[summary.inventoryRemainingFailures ?? 0, t("remainingFailures")],
	]);
	const rows: Array<{
		id: string;
		icon: ReactNode;
		label: string;
		source?: ReactNode;
		destination?: ReactNode;
		sourceRequired?: boolean;
		destinationRequired?: boolean;
	}> = [
		{
			id: "pages",
			icon: <FolderTree size={16} />,
			label: t("pages"),
			sourceRequired: true,
			destinationRequired: true,
			source: countText([
				[
					summary.returnedDescendants +
						(report.source.kind === "space" ? 0 : 1),
					t("found"),
				],
				[summary.pages, t("selected")],
				[summary.excludedPages, t("excluded")],
			]),
			destination: <OutcomeList counts={summary.pageStatuses} t={t} />,
		},
		...(sections.includes("files")
			? [
					{
						id: "files",
						icon: <Paperclip size={16} />,
						label: t("files"),
						source: countText([
							[summary.resources, t("files").toLocaleLowerCase()],
							[summary.attachments, t("attachments")],
							[summary.resourceImages, t("images")],
							[summary.resourceDiagrams ?? 0, t("diagrams")],
							[summary.commentAttachments, t("commentAttachments")],
						]),
						destination: (
							<OutcomeList counts={summary.resourceStatuses} t={t} />
						),
					},
				]
			: []),
		...(sections.includes("comments")
			? [
					{
						id: "comments",
						icon: <MessageSquare size={16} />,
						label: t("comments"),
						source: countText([
							[summary.commentThreads, t("threads")],
							[summary.comments, t("entries")],
							[summary.commentParticipants, t("participants")],
						]),
						destination: <OutcomeList counts={summary.commentStatuses} t={t} />,
					},
				]
			: []),
		...(sections.includes("mentions") && summary.mentionOutcomes
			? [
					{
						id: "mentions",
						icon: <AtSign size={16} />,
						label: t("mentions"),
						source: countText([
							[summary.pageMentions ?? 0, t("pages").toLocaleLowerCase()],
							[summary.commentMentions ?? 0, t("comments").toLocaleLowerCase()],
							[summary.mentionIdentities ?? 0, t("identities")],
						]),
						destination: (
							<OutcomeList
								counts={{ ...summary.mentionOutcomes, total: 0 }}
								t={t}
							/>
						),
					},
				]
			: []),
		...(sections.includes("hashtags") && summary.hashtags
			? [
					{
						id: "hashtags",
						icon: <Hash size={16} />,
						label: t("hashtags"),
						source: countText([
							[summary.hashtags.total, t("occurrences")],
							[summary.hashtags.unique, t("hashtags")],
						]),
						destination: (
							<div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
								<p style={{ color: "var(--muted-foreground)", fontSize: 12 }}>
									{t("decisions")}
								</p>
								<OutcomeList
									counts={{
										preserved: summary.hashtags.preserved,
										text: summary.hashtags.text,
										linked: summary.hashtags.linked,
									}}
									t={t}
								/>
								{summary.hashtags.verified > 0 && (
									<p style={{ fontSize: 12 }}>
										{summary.hashtags.verified} {t("verified")}
									</p>
								)}
							</div>
						),
					},
				]
			: []),
		...(sections.includes("data")
			? [
					{
						id: "data",
						icon: <Database size={16} />,
						label: t("data"),
						source: byteSummary(sourceBytes, summary.bytesUnknown, t),
						destination:
							summary.bytes > 0
								? `${formatBytes(summary.bytes)} ${t("transferred")}`
								: undefined,
					},
				]
			: []),
		...(sections.includes("quality")
			? [
					{
						id: "quality",
						icon: <ShieldAlert size={16} />,
						label: t("quality"),
						source: countText([
							[summary.normalizations, t("normalization").toLocaleLowerCase()],
							[summary.adaptations, t("adaptation").toLocaleLowerCase()],
							[summary.preservedExternalReferences, t("externalReferences")],
						]),
						destination: countText([
							[summary.errors, t("error").toLocaleLowerCase()],
							[summary.warnings, t("warning").toLocaleLowerCase()],
							[summary.degradations, t("degradation").toLocaleLowerCase()],
						]),
					},
				]
			: []),
	];
	return (
		<div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
			<div className="summary-table-container">
				<Table className="summary-table" aria-label={t("summary")}>
					<TableBody>
						{rows.map((row) => (
							<TableRow key={row.id}>
								<TableCell>
									<div
										className="metric-label"
										style={{
											display: "flex",
											flexDirection: "row",
											alignItems: "center",
											gap: 8,
											flexWrap: "nowrap",
										}}
									>
										{row.icon}
										<p style={{ fontWeight: 600, fontSize: 14 }}>{row.label}</p>
									</div>
								</TableCell>
								<TableCell>
									<span className="visually-hidden">{t("source")}: </span>
									{row.source ??
										(row.sourceRequired ? (
											<span
												style={{
													color: "var(--muted-foreground)",
													fontSize: 14,
												}}
											>
												{t("notAvailable")}
											</span>
										) : null)}
								</TableCell>
								<TableCell>
									<span className="visually-hidden">{t("destination")}: </span>
									{row.destination ??
										(row.destinationRequired ? (
											<span
												style={{
													color: "var(--muted-foreground)",
													fontSize: 14,
												}}
											>
												{t("notAvailable")}
											</span>
										) : null)}
								</TableCell>
							</TableRow>
						))}
					</TableBody>
				</Table>
			</div>
			{!summary.inventoryComplete && (
				<Notice
					icon={<AlertTriangle size={16} />}
					title={t("inventoryIncomplete")}
					tone={"yellow"}
				>
					{summary.inventoriedPages}/{summary.pages}{" "}
					{t("pages").toLocaleLowerCase()}
					{inventoryTelemetry ? ` · ${inventoryTelemetry}` : ""}
				</Notice>
			)}
			{summary.inventoryComplete && inventoryTelemetry && (
				<p style={{ color: "var(--muted-foreground)", fontSize: 14 }}>
					{t("inventory")} · {inventoryTelemetry}
				</p>
			)}
		</div>
	);
}
function RussianFlag() {
	return (
		<svg viewBox="0 0 24 18" className="language-flag" aria-hidden="true">
			<path fill="#fff" d="M0 0h24v6H0z" />
			<path fill="#1c57a7" d="M0 6h24v6H0z" />
			<path fill="#d52b1e" d="M0 12h24v6H0z" />
		</svg>
	);
}
function EnglishFlag() {
	return (
		<svg viewBox="0 0 24 18" className="language-flag" aria-hidden="true">
			<path fill="#17365d" d="M0 0h24v18H0z" />
			<path stroke="#fff" strokeWidth="4" d="m0 0 24 18M24 0 0 18" />
			<path stroke="#cf142b" strokeWidth="2" d="m0 0 24 18M24 0 0 18" />
			<path fill="#fff" d="M0 6h24v6H0zM9 0h6v18H9z" />
			<path fill="#cf142b" d="M0 7.5h24v3H0zM10.5 0h3v18h-3z" />
		</svg>
	);
}
function PreferenceButton({
	label,
	onClick,
	children,
}: {
	label: string;
	onClick: () => void;
	children: ReactNode;
}) {
	return (
		<Hint content={label} delay={250}>
			<Button
				type="button"
				aria-label={label}
				onClick={onClick}
				variant="outline"
				size="icon-sm"
			>
				{children}
			</Button>
		</Hint>
	);
}
function TreeRow({
	node,
	expanded,
	hasChildren,
	t,
	toggle,
	open,
}: {
	node: ReportTreeNode;
	expanded: boolean;
	hasChildren: boolean;
	t: Translate;
	toggle: () => void;
	open: () => void;
}) {
	const sourceUrl = node.page?.sourceUrl ?? node.excluded?.sourceUrl;
	const destinationUrl = node.page?.destinationUrl;
	const counters = node.page
		? countText([
				[node.page.resources, t("files").toLocaleLowerCase()],
				[node.page.grids, t("grids")],
				[node.page.comments.comments, t("comments").toLocaleLowerCase()],
				[node.page.mentions?.length ?? 0, t("mentions").toLocaleLowerCase()],
				[node.page.links, t("links")],
			])
		: undefined;
	return (
		<div
			role="treeitem"
			aria-level={node.depth + 1}
			aria-expanded={hasChildren ? expanded : undefined}
			tabIndex={0}
			className={`tree-row status-${node.status}`}
			style={
				{
					"--tree-indent": `${Math.min(node.depth, 12) * 20 + 8}px`,
				} as CSSProperties
			}
			onClick={open}
			onKeyDown={(event) => {
				if (event.key === "Enter" || event.key === " ") {
					event.preventDefault();
					open();
				}
				if (event.key === "ArrowRight" && hasChildren && !expanded) {
					event.preventDefault();
					toggle();
				}
				if (event.key === "ArrowLeft" && hasChildren && expanded) {
					event.preventDefault();
					toggle();
				}
			}}
		>
			<Button
				type="button"
				className={
					hasChildren ? "tree-toggle" : "tree-toggle tree-toggle-hidden"
				}
				aria-label={expanded ? t("collapse") : t("expand")}
				onClick={(event) => {
					event.stopPropagation();
					toggle();
				}}
				variant="ghost"
				size="icon-sm"
			>
				<ChevronRight
					size={16}
					className={
						expanded ? "tree-chevron tree-chevron-expanded" : "tree-chevron"
					}
				/>
			</Button>
			<ExternalIcon href={sourceUrl} label={t("sourceLink")} color="red">
				<ExternalLink size={16} />
			</ExternalIcon>
			<ExternalIcon
				href={destinationUrl}
				label={t("destinationLink")}
				color="blue"
			>
				<ExternalLink size={16} />
			</ExternalIcon>
			<Hint content={t("details")} delay={250}>
				<Button
					type="button"
					aria-label={t("details")}
					onClick={(event) => {
						event.stopPropagation();
						open();
					}}
					variant="ghost"
					size="icon-sm"
				>
					<Eye size={16} />
				</Button>
			</Hint>
			<div className="tree-row-content">
				<div
					style={{
						display: "flex",
						flexDirection: "row",
						alignItems: "center",
						gap: 8,
						flexWrap: "wrap",
					}}
				>
					<p className="tree-title" style={{ fontWeight: 600, fontSize: 14 }}>
						{node.synthetic ? t("unknownPosition") : node.title}
					</p>
					<StatusBadge status={node.status} t={t} />
					{node.container && (
						<Badge data-tone={"gray"} variant="secondary">
							{t("spaceContainer")}
						</Badge>
					)}
				</div>
				{counters && (
					<p
						style={{
							color: "var(--muted-foreground)",
							fontSize: 12,
							marginTop: 3,
						}}
					>
						{counters}
					</p>
				)}
				{node.excluded && (
					<p
						style={{
							color: "var(--muted-foreground)",
							fontSize: 12,
							marginTop: 3,
						}}
					>
						{node.excluded.reason}
						{node.excluded.sourceStatus
							? ` · ${node.excluded.sourceStatus}`
							: ""}
					</p>
				)}
			</div>
		</div>
	);
}
function Hierarchy({
	report,
	t,
	selectedId,
	onSelect,
}: {
	report: TransferReportData;
	t: Translate;
	selectedId?: string | undefined;
	onSelect: (id: string) => void;
}) {
	const tree = useMemo(() => buildReportTree(report), [report]);
	const [search, setSearch] = useState("");
	const [filter, setFilter] = useState<ReportTreeFilter>("all");
	const [expanded, setExpanded] = useState<Set<string>>(
		() =>
			new Set(
				[...tree.nodes.values()]
					.filter((node) => node.children.length > 0)
					.map((node) => node.id),
			),
	);
	const visible = useMemo(
		() => visibleTreeNodes(tree, expanded, filter, search),
		[tree, expanded, filter, search],
	);
	const scrollRef = useRef<HTMLDivElement>(null);
	const virtualizer = useVirtualizer({
		count: visible.length,
		getScrollElement: () => scrollRef.current,
		estimateSize: () => 66,
		overscan: 12,
	});
	useEffect(() => {
		virtualizer.measure();
	}, [virtualizer]);
	const filterOptions = filterValues.map((value) => ({
		value,
		label:
			value === "all"
				? t("all")
				: value === "problems"
					? `${t("problems")} (${problemCount(report)})`
					: statusTranslation(value)
						? t(statusTranslation(value)!)
						: value,
	}));
	return (
		<section
			aria-labelledby="hierarchy-title"
			className="report-section hierarchy-section"
		>
			<div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
				<div
					className="hierarchy-header"
					style={{
						display: "flex",
						flexDirection: "row",
						flexWrap: "wrap",
						gap: 16,
						alignItems: "flex-end",
						justifyContent: "space-between",
					}}
				>
					<div>
						<div
							style={{
								display: "flex",
								flexDirection: "row",
								alignItems: "center",
								flexWrap: "wrap",
								gap: 8,
							}}
						>
							<FolderTree size={18} color="var(--primary)" />
							<h2
								id="hierarchy-title"
								style={{ fontSize: 22 }}
								className="font-semibold tracking-tight"
							>
								{t("hierarchy")}
							</h2>
						</div>
						<p
							style={{
								color: "var(--muted-foreground)",
								fontSize: 14,
								marginTop: 4,
							}}
						>
							{t("hierarchyDescription")} · {visible.length}/{tree.nodes.size}
						</p>
					</div>
					<div
						className="hierarchy-controls"
						style={{
							display: "flex",
							flexDirection: "row",
							alignItems: "center",
							flexWrap: "wrap",
							gap: 12,
						}}
					>
						<InputField
							id="report-search"
							aria-label={t("search")}
							value={search}
							onChange={(event) => setSearch(event.currentTarget.value)}
							placeholder={t("search")}
							className="hierarchy-search"
							leading={<Search size={16} />}
						/>
						<ChoiceField
							aria-label={t("filter")}
							value={filter}
							className="hierarchy-filter"
							options={filterOptions}
							onValueChange={(value) =>
								setFilter((value ?? "all") as ReportTreeFilter)
							}
						/>
					</div>
				</div>
				{visible.length === 0 ? (
					<Notice icon={<Info size={16} />} tone={"gray"}>
						{t("noResults")}
					</Notice>
				) : (
					<ScrollArea
						className="tree-scroll"
						viewportRef={scrollRef}
						type="auto"
					>
						<div
							role="tree"
							aria-label={t("hierarchy")}
							className="tree-virtual"
							style={{ height: virtualizer.getTotalSize() + 16 }}
						>
							{virtualizer.getVirtualItems().map((item) => {
								const node = visible[item.index]!;
								return (
									<div
										key={node.id}
										ref={virtualizer.measureElement}
										data-index={item.index}
										className="virtual-row"
										style={{ transform: `translateY(${item.start}px)` }}
									>
										<TreeRow
											node={node}
											expanded={expanded.has(node.id)}
											hasChildren={node.children.length > 0}
											t={t}
											toggle={() =>
												setExpanded((current) => {
													const next = new Set(current);
													if (next.has(node.id)) next.delete(node.id);
													else next.add(node.id);
													return next;
												})
											}
											open={() => onSelect(node.id)}
										/>
									</div>
								);
							})}
						</div>
					</ScrollArea>
				)}
				{selectedId && (
					<span className="visually-hidden" aria-live="polite">
						{selectedId}
					</span>
				)}
			</div>
		</section>
	);
}
function hasDefinitionValue(
	value: ReactNode | undefined | null,
): value is ReactNode {
	return value !== undefined && value !== null && value !== "";
}
function DefinitionGrid({ items }: { items: DefinitionItem[] }) {
	const visible = items.filter(([, value]) => hasDefinitionValue(value));
	if (visible.length === 0) return null;
	return (
		<dl className="definition-list">
			{visible.map(([label, value]) => (
				<div key={label} className="definition-item">
					<dt
						style={{
							color: "var(--muted-foreground)",
							fontWeight: 700,
							textTransform: "uppercase",
							fontSize: 12,
						}}
					>
						{label}
					</dt>
					<dd className="definition-value">{value}</dd>
				</div>
			))}
		</dl>
	);
}
function isolatedPreview(body: string): string {
	const csp =
		"default-src 'none'; style-src 'unsafe-inline'; img-src data: blob:; font-src data:; object-src 'none'; base-uri 'none'; form-action 'none'";
	return `<!doctype html><html><head><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="${csp}"><style>body{font:14px/1.55 system-ui,sans-serif;margin:18px;color:#182230;overflow-wrap:anywhere}img{max-width:100%;height:auto}table{border-collapse:collapse;max-width:100%}td,th{border:1px solid #ccd;padding:6px}pre{white-space:pre-wrap;background:#f3f4f6;padding:10px;border-radius:6px}a{color:#175cd3}.ywtc-layout{display:grid;gap:18px}.ywtc-layout-section{display:grid;grid-template-columns:repeat(var(--columns,1),minmax(0,1fr));gap:18px;align-items:start}.ywtc-layout-columns-2{--columns:2}.ywtc-layout-columns-3{--columns:3}.ywtc-layout-cell{min-width:0}@media(max-width:620px){.ywtc-layout-section{grid-template-columns:1fr}}</style></head><body>${body}</body></html>`;
}
function issueColor(issue: TransferReportIssue): string {
	if (issue.severity === "error") return "red";
	if (issue.severity === "degradation" || issue.severity === "warning")
		return "yellow";
	if (issue.severity === "blocked") return "gray";
	return "blue";
}
function IssueList({
	issues,
	locale,
	t,
}: {
	issues: TransferReportIssue[];
	locale: Locale;
	t: Translate;
}) {
	const [expanded, setExpanded] = useState<Set<string>>(new Set());
	if (issues.length === 0)
		return (
			<Notice icon={<Info size={16} />} tone={"gray"}>
				{t("noIssues")}
			</Notice>
		);
	return (
		<div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
			{issues.map((issue) => {
				const key = `${issue.code}:${issue.objectId ?? issue.pageId ?? "run"}`;
				const opened = expanded.has(key);
				return (
					<Notice
						key={key}
						title={issue.code}
						icon={<StatusIcon status={issue.severity} size={16} />}
						tone={issueColor(issue)}
					>
						<div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
							<div
								style={{
									display: "flex",
									flexDirection: "row",
									alignItems: "center",
									gap: 6,
									flexWrap: "wrap",
								}}
							>
								<Badge data-tone={issueColor(issue)} variant="secondary">
									{t(issue.severity)}
								</Badge>
								<Badge data-tone={"gray"} variant="outline">
									{categoryLabels[locale][issue.category]}
								</Badge>
								<Badge data-tone={"gray"} variant="outline">
									{issue.phase}
								</Badge>
								{issue.retryable && (
									<Badge data-tone={"yellow"} variant="secondary">
										{t("retryable")}
									</Badge>
								)}
								{issue.occurrences > 1 && (
									<Badge data-tone={"gray"} variant="outline">
										×{issue.occurrences}
									</Badge>
								)}
							</div>
							<p style={{ fontSize: 14 }}>
								<strong>{t("action")}:</strong>{" "}
								{issueActionLabel(issue, locale)}
							</p>
							<div>
								<Button
									type="button"
									onClick={() =>
										setExpanded((current) => {
											const next = new Set(current);
											if (next.has(key)) next.delete(key);
											else next.add(key);
											return next;
										})
									}
									variant="ghost"
									size="default"
								>
									{t("technical")}
								</Button>
								<ExpandPanel open={opened}>
									<div
										className="technical-diagnostics"
										style={{ marginTop: 8 }}
									>
										<p style={{ fontSize: 12 }}>
											<strong>ID:</strong>{" "}
											{issue.objectId ?? issue.pageId ?? "run"}
										</p>
										{issue.rootCauseId && (
											<p style={{ fontSize: 12 }}>
												<strong>Root cause:</strong> {issue.rootCauseId}
											</p>
										)}
										<p className="diagnostic-message" style={{ fontSize: 12 }}>
											<strong>Message:</strong> {issue.message}
										</p>
									</div>
								</ExpandPanel>
							</div>
						</div>
					</Notice>
				);
			})}
		</div>
	);
}
function ResourcesTable({ node, t }: { node: ReportTreeNode; t: Translate }) {
	const resources = node.page?.resourceItems ?? [];
	return (
		<div className="table-scroll overflow-x-auto">
			<Table>
				<TableHeader>
					<TableRow>
						<TableHead>{t("name")}</TableHead>
						<TableHead>{t("kind")}</TableHead>
						<TableHead>{t("size")}</TableHead>
						<TableHead>{t("status")}</TableHead>
						<TableHead>{t("reason")}</TableHead>
					</TableRow>
				</TableHeader>
				<TableBody>
					{resources.map((resource) => (
						<TableRow key={resource.sourceId}>
							<TableCell>
								<div
									style={{
										display: "flex",
										flexDirection: "row",
										gap: 8,
										alignItems: "flex-start",
										flexWrap: "nowrap",
									}}
								>
									{resource.kind === "image" || resource.kind === "diagram" ? (
										<FileImage size={16} color="var(--primary)" />
									) : resource.kind === "grid" ? (
										<Database size={16} color="var(--primary)" />
									) : (
										<Paperclip size={16} color="var(--primary)" />
									)}
									<div>
										<p style={{ fontWeight: 600, fontSize: 14 }}>
											{resource.sourceName}
										</p>
										{resource.destinationName &&
											resource.destinationName !== resource.sourceName && (
												<p
													style={{
														color: "var(--muted-foreground)",
														fontSize: 12,
													}}
												>
													→ {resource.destinationName}
												</p>
											)}
										<div
											style={{
												display: "flex",
												flexDirection: "row",
												alignItems: "center",
												flexWrap: "wrap",
												marginTop: 4,
												gap: 4,
											}}
										>
											<ExternalIcon
												href={resource.sourceUrl}
												label={t("sourceLink")}
												color="red"
											>
												<ExternalLink size={14} />
											</ExternalIcon>
											<ExternalIcon
												href={resource.destinationUrl}
												label={t("destinationLink")}
												color="blue"
											>
												<ExternalLink size={14} />
											</ExternalIcon>
										</div>
									</div>
								</div>
							</TableCell>
							<TableCell>
								<p style={{ fontSize: 14 }}>{resource.kind}</p>
							</TableCell>
							<TableCell>
								{resource.sourceBytes !== undefined &&
									resource.sourceBytes > 0 && (
										<p style={{ fontSize: 14 }}>
											{formatBytes(resource.sourceBytes)}
										</p>
									)}
								{resource.sha256 && (
									<code
										title={resource.sha256}
										className={"hash-code" + " ui-code"}
									>
										{resource.sha256}
									</code>
								)}
							</TableCell>
							<TableCell>
								<StatusBadge status={resource.status} t={t} />
							</TableCell>
							<TableCell>
								<p style={{ color: "var(--muted-foreground)", fontSize: 14 }}>
									{resource.error ?? resource.blockedReason}
								</p>
							</TableCell>
						</TableRow>
					))}
				</TableBody>
			</Table>
		</div>
	);
}
function CommentsPanel({
	node,
	locale,
	t,
}: {
	node: ReportTreeNode;
	locale: Locale;
	t: Translate;
}) {
	const comments = node.page!.comments;
	const commentCount = countText([
		[comments.threads, t("threads")],
		[comments.comments, t("entries")],
		[comments.participants, t("participants")],
		[comments.attachments, t("attachments")],
	]);
	return (
		<div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
			<DefinitionGrid
				items={[
					[
						t("status"),
						<StatusBadge key="comment-status" status={comments.status} t={t} />,
					],
					[t("comments"), commentCount],
					[
						t("archive"),
						comments.archiveName ? (
							<div
								key="comment-archive"
								style={{
									display: "flex",
									flexDirection: "row",
									alignItems: "center",
									flexWrap: "wrap",
									gap: 4,
								}}
							>
								<p style={{ fontSize: 14 }}>{comments.archiveName}</p>
								<ExternalIcon
									href={comments.archiveUrl}
									label={t("archive")}
									color="blue"
								>
									<ExternalLink size={14} />
								</ExternalIcon>
							</div>
						) : undefined,
					],
					[
						t("size"),
						comments.bytes > 0 ? formatBytes(comments.bytes) : undefined,
					],
				]}
			/>
			{comments.error && (
				<Notice icon={<XCircle size={16} />} tone={"red"}>
					{comments.error}
				</Notice>
			)}
			{comments.items?.length ? (
				<div className="table-scroll overflow-x-auto">
					<Table>
						<TableHeader>
							<TableRow>
								<TableHead>ID</TableHead>
								<TableHead>{t("participants")}</TableHead>
								<TableHead>{t("status")}</TableHead>
								<TableHead>{t("reason")}</TableHead>
							</TableRow>
						</TableHeader>
						<TableBody>
							{comments.items.map((comment) => (
								<TableRow key={comment.commentId}>
									<TableCell>
										<code className="ui-code">{comment.commentId}</code>
										{comment.createdAt && (
											<p
												style={{
													color: "var(--muted-foreground)",
													fontSize: 12,
													marginTop: 3,
												}}
											>
												{formatDate(comment.createdAt, locale)}
											</p>
										)}
										<div
											style={{
												display: "flex",
												flexDirection: "row",
												alignItems: "center",
												flexWrap: "wrap",
												marginTop: 4,
												gap: 4,
											}}
										>
											<ExternalIcon
												href={comment.sourceUrl}
												label={t("sourceLink")}
												color="red"
											>
												<ExternalLink size={14} />
											</ExternalIcon>
											<ExternalIcon
												href={comment.destinationUrl}
												label={t("destinationLink")}
												color="blue"
											>
												<ExternalLink size={14} />
											</ExternalIcon>
										</div>
									</TableCell>
									<TableCell>
										<p style={{ fontSize: 14 }}>{comment.author}</p>
									</TableCell>
									<TableCell>
										<StatusBadge status={comment.outcome} t={t} />
									</TableCell>
									<TableCell>
										<p style={{ fontSize: 14 }}>
											{comment.error ?? comment.sourceStatus}
										</p>
									</TableCell>
								</TableRow>
							))}
						</TableBody>
					</Table>
				</div>
			) : null}
		</div>
	);
}
function MentionsPanel({ node, t }: { node: ReportTreeNode; t: Translate }) {
	const mentions = node.page?.mentions ?? [];
	if (mentions.length === 0)
		return (
			<Notice icon={<Info size={16} />} tone={"gray"}>
				{t("noMentions")}
			</Notice>
		);
	return (
		<div className="table-scroll overflow-x-auto">
			<Table>
				<TableHeader>
					<TableRow>
						<TableHead>{t("source")}</TableHead>
						<TableHead>{t("destination")}</TableHead>
						<TableHead>{t("status")}</TableHead>
						<TableHead>{t("reason")}</TableHead>
					</TableRow>
				</TableHeader>
				<TableBody>
					{mentions.map((mention) => (
						<TableRow key={`${mention.location}:${mention.id}`}>
							<TableCell>
								<p style={{ fontWeight: 600, fontSize: 14 }}>
									{mention.source}
								</p>
								<p style={{ color: "var(--muted-foreground)", fontSize: 12 }}>
									{mention.location}
								</p>
							</TableCell>
							<TableCell>
								{mention.url ? (
									<a
										href={safeLink(mention.url)}
										target="_blank"
										rel="noreferrer"
										style={{ fontSize: 14 }}
									>
										{mention.label}
									</a>
								) : (
									<p style={{ fontSize: 14 }}>{mention.label}</p>
								)}
								{mention.destinationIdentity && (
									<code style={{ marginTop: 4 }} className="ui-code">
										{Object.entries(mention.destinationIdentity)
											.map(([key, value]) => `${key}:${value}`)
											.join(" · ")}
									</code>
								)}
							</TableCell>
							<TableCell>
								<StatusBadge status={mention.outcome} t={t} />
							</TableCell>
							<TableCell>
								<p style={{ color: "var(--muted-foreground)", fontSize: 14 }}>
									{mention.reason}
								</p>
								{mention.retryable && (
									<Badge
										data-tone={"yellow"}
										variant="secondary"
										style={{ marginTop: 4 }}
									>
										{t("retryable")}
									</Badge>
								)}
							</TableCell>
						</TableRow>
					))}
				</TableBody>
			</Table>
		</div>
	);
}
function PageDialog({
	node,
	payload,
	locale,
	t,
	onOpenChange,
}: {
	node?: ReportTreeNode | undefined;
	payload: ReportPresentationPayload;
	locale: Locale;
	t: Translate;
	onOpenChange: (open: boolean) => void;
}) {
	const page = node?.page;
	const excluded = node?.excluded;
	const issues = node
		? payload.report.issues.filter(
				(issue) =>
					(issue.pageId === node.id || issue.blockedByPageId === node.id) &&
					issue.lifecycle !== "resolved" &&
					issue.severity !== "adaptation" &&
					issue.severity !== "normalization",
			)
		: [];
	const preview = node ? payload.previews[node.id] : undefined;
	const sections = visibleDetailSections({
		page,
		hasPreview: Boolean(preview),
		issueCount: issues.length,
	});
	const tabs = [
		{ value: "overview", label: t("overview"), visible: true },
		{ value: "files", label: t("files"), visible: sections.includes("files") },
		{
			value: "comments",
			label: t("comments"),
			visible: sections.includes("comments"),
		},
		{
			value: "mentions",
			label: t("mentions"),
			visible: sections.includes("mentions"),
		},
		{
			value: "hashtags",
			label: t("hashtags"),
			visible: sections.includes("hashtags"),
		},
		{
			value: "comparison",
			label: t("comparison"),
			visible: sections.includes("comparison"),
		},
		{
			value: "issues",
			label: `${t("issues")} · ${issues.length}`,
			visible: sections.includes("issues"),
		},
	].filter((tab) => tab.visible);
	const inventory = page
		? countText([
				[page.links, t("links")],
				[page.tables, t("tables")],
				[page.grids, t("grids")],
				[page.diagrams ?? 0, t("diagrams")],
				[page.codeBlocks, t("codeBlocks")],
			])
		: undefined;
	const title = (
		<div
			style={{
				display: "flex",
				flexDirection: "row",
				alignItems: "center",
				gap: 8,
				flexWrap: "wrap",
			}}
		>
			<p style={{ fontWeight: 700 }}>
				{node?.synthetic ? t("unknownPosition") : node?.title}
			</p>
			{node && <StatusBadge status={node.status} t={t} />}
		</div>
	);
	return (
		<AppDialog
			key={node?.id}
			title={title}
			open={Boolean(node)}
			onDismiss={() => onOpenChange(false)}
			width={"min(1180px, 96vw)"}
		>
			{node && (
				<Tabs defaultValue="overview">
					<ScrollArea type="auto">
						<TabsList className="details-tabs">
							{tabs.map((tab) => (
								<TabsTrigger key={tab.value} value={tab.value}>
									{tab.label}
								</TabsTrigger>
							))}
						</TabsList>
					</ScrollArea>
					<TabsContent value="overview" style={{ paddingTop: 16 }}>
						<div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
							<DefinitionGrid
								items={[
									[t("sourceId"), page?.sourceId ?? excluded?.sourceId],
									[t("destinationId"), page?.destinationId],
									[
										t("sourceParent"),
										page?.sourceParentId ?? excluded?.sourceParentId,
									],
									[
										t("expectedParent"),
										page?.projectedParentId ??
											page?.parentId ??
											excluded?.projectedParentId,
									],
									[t("actualParent"), page?.destinationParentId],
									[t("depth"), node.depth > 0 ? String(node.depth) : undefined],
									[t("inventory"), inventory ?? excluded?.reason],
									[
										t("status"),
										<StatusBadge
											key="page-status"
											status={node.status}
											t={t}
										/>,
									],
									[
										t("conflictEvidence"),
										page?.conflictEvidence
											? `${page.conflictEvidence.reason}: ${page.conflictEvidence.candidateIds.join(", ")}`
											: undefined,
									],
								]}
							/>
							<div
								style={{
									display: "flex",
									flexDirection: "row",
									alignItems: "center",
									flexWrap: "wrap",
									gap: 8,
								}}
							>
								<ExternalIcon
									href={page?.sourceUrl ?? excluded?.sourceUrl}
									label={t("sourceLink")}
									color="red"
								>
									<ExternalLink size={16} />
								</ExternalIcon>
								<ExternalIcon
									href={page?.destinationUrl}
									label={t("destinationLink")}
									color="blue"
								>
									<ExternalLink size={16} />
								</ExternalIcon>
							</div>
							{excluded && !excluded.metadataComplete && (
								<Notice icon={<AlertTriangle size={16} />} tone={"yellow"}>
									{t("metadataIncomplete")}
								</Notice>
							)}
							{page?.error && (
								<Notice icon={<XCircle size={16} />} tone={"red"}>
									{page.error}
								</Notice>
							)}
							{page?.warnings.map((warning) => (
								<Notice
									key={warning}
									icon={<AlertTriangle size={16} />}
									tone={"yellow"}
								>
									{warning}
								</Notice>
							))}
							{page?.adaptations?.map((adaptation) => (
								<Notice
									key={adaptation}
									icon={<Info size={16} />}
									tone={"blue"}
								>
									{adaptation}
								</Notice>
							))}
						</div>
					</TabsContent>
					{sections.includes("files") && (
						<TabsContent value="files" style={{ paddingTop: 16 }}>
							<ResourcesTable node={node} t={t} />
						</TabsContent>
					)}
					{sections.includes("comments") && (
						<TabsContent value="comments" style={{ paddingTop: 16 }}>
							<CommentsPanel node={node} locale={locale} t={t} />
						</TabsContent>
					)}
					{sections.includes("mentions") && (
						<TabsContent value="mentions" style={{ paddingTop: 16 }}>
							<MentionsPanel node={node} t={t} />
						</TabsContent>
					)}
					{sections.includes("hashtags") && (
						<TabsContent value="hashtags" style={{ paddingTop: 16 }}>
							<div className="table-scroll overflow-x-auto">
								<Table>
									<TableHeader>
										<TableRow>
											<TableHead>{t("source")}</TableHead>
											<TableHead>{t("decisions")}</TableHead>
											<TableHead>{t("status")}</TableHead>
										</TableRow>
									</TableHeader>
									<TableBody>
										{page?.hashtags?.map((item) => (
											<TableRow key={item.id}>
												<TableCell>
													<p style={{ fontWeight: 600, fontSize: 14 }}>
														{item.tag}
													</p>
													<p
														style={{
															color: "var(--muted-foreground)",
															fontSize: 12,
														}}
													>
														{item.location}
														{item.commentId ? ` · ${item.commentId}` : ""}
													</p>
												</TableCell>
												<TableCell>
													{item.url && safeLink(item.url) ? (
														<a
															href={safeLink(item.url)}
															target="_blank"
															rel="noreferrer"
														>
															{item.label}
														</a>
													) : (
														<p>{item.label}</p>
													)}
													<p
														style={{
															color: "var(--muted-foreground)",
															fontSize: 12,
														}}
													>
														{t(item.outcome)}
													</p>
												</TableCell>
												<TableCell>{t(item.verification)}</TableCell>
											</TableRow>
										))}
									</TableBody>
								</Table>
							</div>
						</TabsContent>
					)}
					{preview && (
						<TabsContent value="comparison" style={{ paddingTop: 16 }}>
							<div className="ui-grid">
								<div>
									<p style={{ fontWeight: 700, fontSize: 14, marginBottom: 8 }}>
										{t("sourcePreview")}
									</p>
									<iframe
										title={t("sourcePreview")}
										className="preview-frame"
										sandbox=""
										srcDoc={isolatedPreview(preview.source)}
									/>
								</div>
								<div>
									<p style={{ fontWeight: 700, fontSize: 14, marginBottom: 8 }}>
										{t("destinationPreview")}
									</p>
									<iframe
										title={t("destinationPreview")}
										className="preview-frame"
										sandbox=""
										srcDoc={isolatedPreview(preview.destination)}
									/>
								</div>
							</div>
						</TabsContent>
					)}
					{issues.length > 0 && (
						<TabsContent value="issues" style={{ paddingTop: 16 }}>
							<IssueList issues={issues} locale={locale} t={t} />
						</TabsContent>
					)}
				</Tabs>
			)}
		</AppDialog>
	);
}
function MetadataLink({
	href,
	fallback,
}: {
	href?: string | undefined;
	fallback: string;
}) {
	const safe = safeLink(href);
	if (!safe)
		return (
			<span style={{ color: "var(--muted-foreground)", fontSize: 14 }}>
				{href || fallback}
			</span>
		);
	return (
		<a
			href={safe}
			target="_blank"
			rel="noreferrer"
			className="metadata-link"
			style={{ fontSize: 14 }}
		>
			{href}
			<ExternalLink size={13} aria-hidden="true" />
		</a>
	);
}
function ReportOverview({
	report,
	locale,
	theme,
	setLocale,
	setTheme,
	t,
}: {
	report: TransferReportData;
	locale: Locale;
	theme: Theme;
	setLocale: (locale: Locale) => void;
	setTheme: (theme: Theme) => void;
	t: Translate;
}) {
	const nextLocale: Locale = locale === "ru" ? "en" : "ru";
	const nextTheme: Theme =
		theme === "system" ? "light" : theme === "light" ? "dark" : "system";
	const localeLabel = `${t("language")}: ${locale === "ru" ? "Русский" : "English"}; ${t("next")}: ${nextLocale === "ru" ? "Русский" : "English"}`;
	const themeLabel = `${t("theme")}: ${t(theme)}; ${t("next")}: ${t(nextTheme)}`;
	return (
		<section
			aria-labelledby="report-title"
			className="report-section overview-section"
		>
			<h1
				id="report-title"
				style={{ fontSize: 28 }}
				className={"visually-hidden" + " font-semibold tracking-tight"}
			>
				{t("report")}
			</h1>
			<div
				className="preference-controls"
				style={{
					display: "flex",
					flexDirection: "row",
					alignItems: "center",
					flexWrap: "wrap",
					gap: 8,
					justifyContent: "flex-end",
				}}
			>
				<PreferenceButton
					label={localeLabel}
					onClick={() => setLocale(nextLocale)}
				>
					{locale === "ru" ? <RussianFlag /> : <EnglishFlag />}
				</PreferenceButton>
				<PreferenceButton
					label={themeLabel}
					onClick={() => setTheme(nextTheme)}
				>
					{theme === "system" ? (
						<Monitor size={17} />
					) : theme === "light" ? (
						<Sun size={17} />
					) : (
						<Moon size={17} />
					)}
				</PreferenceButton>
			</div>
			<img
				src={reportHeader}
				className="report-header"
				alt="Yandex Wiki and Confluence sources pass pages, hierarchy, links, tables, images, comments, and attachments through ywtc to Confluence, Yandex Wiki, Markdown, and HTML"
			/>
			<div
				className="run-status"
				style={{
					display: "flex",
					flexDirection: "column",
					gap: 8,
					alignItems: "center",
				}}
			>
				<StatusBadge status={report.status} t={t} />
				<div
					style={{
						display: "flex",
						flexDirection: "row",
						alignItems: "center",
						gap: 24,
						justifyContent: "center",
						flexWrap: "wrap",
					}}
				>
					<p style={{ color: "var(--muted-foreground)", fontSize: 12 }}>
						{t("started")}:{" "}
						<strong>{formatDate(report.startedAt, locale)}</strong>
					</p>
					{report.finishedAt && (
						<p style={{ color: "var(--muted-foreground)", fontSize: 12 }}>
							{t("finished")}:{" "}
							<strong>{formatDate(report.finishedAt, locale)}</strong>
						</p>
					)}
				</div>
			</div>
			<div className="overview-summary">
				<SummaryTable report={report} t={t} />
			</div>
			<dl className="run-details">
				{report.sync && (
					<>
						<div className="run-detail">
							<dt>SYNC</dt>
							<dd className="metadata-code">{report.sync.planId}</dd>
						</div>
						<div className="run-detail">
							<dt>{locale === "ru" ? "Изменения" : "Changes"}</dt>
							<dd>
								{countText([
									[report.sync.added, locale === "ru" ? "добавлено" : "added"],
									[
										report.sync.updated,
										locale === "ru" ? "обновлено" : "updated",
									],
									[
										report.sync.reused,
										locale === "ru" ? "без изменений" : "unchanged",
									],
									[report.sync.kept, locale === "ru" ? "оставлено" : "kept"],
									[
										report.sync.excluded,
										locale === "ru" ? "исключено" : "excluded",
									],
									[
										report.sync.linkPatches,
										locale === "ru" ? "ссылок исправлено" : "links repaired",
									],
									[
										report.sync.unresolvedReferences,
										locale === "ru"
											? "ссылок требуют проверки"
											: "links need review",
									],
								]) ?? t("notAvailable")}
							</dd>
						</div>
					</>
				)}
				{report.retry && !report.sync && (
					<>
						<div className="run-detail">
							<dt>{t("retryAttempt")}</dt>
							<dd>#{report.retry.attempt}</dd>
						</div>
						<div className="run-detail">
							<dt>{t("retryRoot")}</dt>
							<dd className="metadata-code">{report.retry.rootRunId}</dd>
						</div>
						<div className="run-detail">
							<dt>{t("previousRun")}</dt>
							<dd className="metadata-code">{report.retry.parentRunId}</dd>
						</div>
						<div className="run-detail">
							<dt>{t("retrySelection")}</dt>
							<dd>
								{countText([
									[report.retry.selectedPages, t("pages").toLocaleLowerCase()],
									[
										report.retry.selectedResources,
										t("files").toLocaleLowerCase(),
									],
									[
										report.retry.selectedComments,
										t("comments").toLocaleLowerCase(),
									],
									[report.retry.contextPages, t("contextPages")],
									[report.retry.carriedForward, t("carriedForward")],
								]) ?? t("notAvailable")}
							</dd>
						</div>
						{(report.retry.remainingRetryable > 0 ||
							report.retry.remainingTerminal > 0) && (
							<div className="run-detail">
								<dt>{t("remaining")}</dt>
								<dd>
									{countText([
										[report.retry.remainingRetryable, t("retryable")],
										[report.retry.remainingTerminal, t("terminal")],
									])}
								</dd>
							</div>
						)}
					</>
				)}
				<div className="run-detail">
					<dt>{t("runId")}</dt>
					<dd className="metadata-code">{report.runId}</dd>
				</div>
				<div className="run-detail">
					<dt>{t("state")}</dt>
					<dd className="metadata-code">{report.state.path}</dd>
				</div>
				<div className="run-detail">
					<dt>{t("source")}</dt>
					<dd>
						<MetadataLink
							href={report.source.url}
							fallback={report.source.title || t("notAvailable")}
						/>
					</dd>
				</div>
				<div className="run-detail">
					<dt>{t("destination")}</dt>
					<dd>
						<MetadataLink
							href={report.destination.url}
							fallback={report.destination.id || t("notAvailable")}
						/>
					</dd>
				</div>
			</dl>
			<div
				style={{
					display: "flex",
					flexDirection: "row",
					gap: 8,
					alignItems: "center",
					flexWrap: "wrap",
					marginTop: 16,
					justifyContent: "flex-start",
				}}
			>
				<Button variant="ghost" asChild={true}>
					<a href={"report.json"} download={"report.json"}>
						{<Download size={16} />}
						{t("downloadJson")}
					</a>
				</Button>
			</div>
		</section>
	);
}
function ReportApplication({
	payload,
}: {
	payload: ReportPresentationPayload;
}) {
	const storedLocale = guardedStorageGet("ywtc-report-locale");
	const storedTheme = guardedStorageGet("ywtc-report-theme");
	const [locale, setLocale] = useState<Locale>(
		storedLocale === "ru" || storedLocale === "en"
			? storedLocale
			: initialLocale(),
	);
	const [theme, setTheme] = useState<Theme>(
		storedTheme === "light" ||
			storedTheme === "dark" ||
			storedTheme === "system"
			? storedTheme
			: "system",
	);
	const [systemDark, setSystemDark] = useState(
		() => window.matchMedia("(prefers-color-scheme: dark)").matches,
	);
	const [selectedId, setSelectedId] = useState<string>();
	const t = useMemo(() => translator(locale), [locale]);
	const tree = useMemo(() => buildReportTree(payload.report), [payload.report]);
	const selectedNode = selectedId ? tree.nodes.get(selectedId) : undefined;
	const effectiveTheme =
		theme === "system" ? (systemDark ? "dark" : "light") : theme;
	useEffect(() => {
		document.documentElement.lang = locale;
		document.title = `ywtc · ${t("report")} · ${payload.report.runId}`;
		guardedStorageSet("ywtc-report-locale", locale);
	}, [locale, payload.report.runId, t]);
	useEffect(() => {
		const media = window.matchMedia("(prefers-color-scheme: dark)");
		const update = () => setSystemDark(media.matches);
		media.addEventListener?.("change", update);
		return () => media.removeEventListener?.("change", update);
	}, []);
	useEffect(() => {
		const root = document.documentElement;
		root.classList.remove("light", "dark");
		root.classList.add(effectiveTheme);
		guardedStorageSet("ywtc-report-theme", theme);
	}, [effectiveTheme, theme]);
	const report = payload.report;
	return (
		<div className="report-background">
			<main
				className="report-shell"
				style={{ width: "100%", marginInline: "auto" }}
			>
				<ReportOverview
					report={report}
					locale={locale}
					theme={theme}
					setLocale={setLocale}
					setTheme={setTheme}
					t={t}
				/>
				<Hierarchy
					report={report}
					t={t}
					selectedId={selectedId}
					onSelect={setSelectedId}
				/>
			</main>
			<PageDialog
				node={selectedNode}
				payload={payload}
				locale={locale}
				t={t}
				onOpenChange={(open) => {
					if (!open) setSelectedId(undefined);
				}}
			/>
		</div>
	);
}
export function App({ payload }: { payload: ReportPresentationPayload }) {
	return <ReportApplication payload={payload} />;
}
export function ReportLoadError({ message }: { message: string }) {
	return (
		<div
			style={{
				width: "100%",
				marginInline: "auto",
				maxWidth: 1120,
				paddingBlock: 32,
			}}
		>
			<Notice
				icon={<FileWarning size={20} />}
				title="Report could not be loaded."
				tone={"red"}
			>
				{message}
			</Notice>
		</div>
	);
}
