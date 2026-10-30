"use client";
import {
	InputField,
	ChoiceField,
	Notice,
	PageControls,
	CheckboxField,
	AppDialog,
} from "../../ui/fields";
import { Button } from "../../ui/components/button";
import {
	TableHead,
	TableRow,
	TableHeader,
	TableCell,
	TableBody,
	Table,
} from "../../ui/components/table";
import { Badge } from "../../ui/components/badge";
import { useCallback, useEffect, useState, useRef } from "react";
import { api, safeLink, type Translate } from "./api";
import { FormSection, RequiredNote } from "./operator-fields";
import { Check, FileText, Link2, RefreshCw, ScanSearch, FilterX } from "lucide-react";
import { CollectionState, useCollection } from "./collection-state";
import { EmptyState } from "./empty-state";
export function Synchronization({
	root,
	t,
	onError,
	onJob,
}: {
	root: string;
	t: Translate;
	onError: (error: unknown) => void;
	onJob: (id: string) => void;
}) {
	const [planId, setPlanId] = useState(""),
		[plan, setPlan] = useState<any>(),
		[runId, setRunId] = useState(""),
		[source, setSource] = useState(""),
		[query, setQuery] = useState(""),
		[filter, setFilter] = useState("all"),
		[page, setPage] = useState(1),
		[detail, setDetail] = useState<any>(),
		[trash, setTrash] = useState(false),
		[confirm, setConfirm] = useState(false),
		[busy, setBusy] = useState(false),
		[decisionBusy, setDecisionBusy] = useState(false),
		[starting, setStarting] = useState(false);
	const loadedRevision = useRef("");
	const listing = useCollection(useCallback(() => api(`${root}/sync`), [root]));
	const plans: any[] = listing.data?.items ?? [],
		refresh = listing.reload;
	const planRead = useCollection(useCallback(() => planId ? api(`${root}/sync/${planId}?offset=${(page - 1) * 50}&limit=50&q=${encodeURIComponent(query)}&filter=${filter}`) : Promise.resolve(undefined), [root, planId, page, query, filter]));
	const load = planRead.reload;
	useEffect(() => {
		const next = planRead.data;
		if (next && loadedRevision.current !== next.revision) {
			loadedRevision.current = next.revision;
			setConfirm(false);
			setTrash(false);
		}
		setPlan(next);
	}, [planRead.data]);
	async function task(request: unknown) {
		setBusy(true);
		try {
			const job = await api(`${root}/jobs`, "POST", {
				request,
				confirmed: true,
			});
			onJob(job.id);
		} catch (error) {
			onError(error);
		} finally {
			setBusy(false);
		}
	}
	async function decide(id: string, value: string | null) {
		if (!value || !plan) return;
		setDecisionBusy(true);
		setConfirm(false);
		setTrash(false);
		try {
			const document = {
				...plan.decisions,
				decisions: { ...plan.decisions.decisions, [id]: value },
			};
			const saved = await api(`${root}/sync/${planId}`, "PUT", {
				revision: plan.revision,
				document,
			});
			setPlan({ ...plan, decisions: document, revision: saved.revision });
			setConfirm(false);
			await load();
		} catch (error) {
			onError(error);
			await load();
		} finally {
			setDecisionBusy(false);
		}
	}
	return (
		<div style={{ display: "flex", flexDirection: "column", gap: 32 }}>
			<p className="workflow-hint">
				{t(
					"Анализ → решения по изменениям → проверка preview → подтверждение записи. Неизменённые объекты переиспользуются; «Оставить» действует до следующего изменения source. Корзина требует отдельного подтверждения.",
					"Analyze → decide changes → review preview → confirm writes. Unchanged objects are reused; Keep lasts until source changes again. Trash requires a separate confirmation.",
				)}
			</p>
			<CollectionState {...listing} t={t} />
			{listing.status === "ready" && !plans.length && !starting && (
				<EmptyState
					kind="sync"
					title={t(
						"Продолжите перенос с актуальными данными",
						"Keep an existing migration up to date",
					)}
					description={t(
						"Укажите Run ID завершённого переноса. Анализ найдёт новые страницы, изменения и ссылки, а запись начнётся только после просмотра и подтверждения плана.",
						"Use an existing live Run ID to find new pages, changes and links. Writes begin only after you review and confirm a plan.",
					)}
				>
					<Button leadingIcon={<RefreshCw />} onClick={() => setStarting(true)}>
						{t("Новый анализ", "New analysis")}
					</Button>
				</EmptyState>
			)}
			{(starting || plans.length > 0) && (
				<FormSection
					title={t("1. Новый анализ", "1. New analysis")}
					description={t(
						"Нужен Run ID существующего live-переноса. Этот шаг не записывает destination.",
						"Requires a Run ID from an existing live migration. This step does not write destination data.",
					)}
				>
					<RequiredNote t={t} />
					<div
						style={{
							display: "flex",
							flexDirection: "row",
							gap: 8,
							flexWrap: "wrap",
							alignItems: "flex-end",
						}}
					>
						<InputField
							label={t("Run ID исходной миграции", "Original migration Run ID")}
							autoFocus={starting && !plans.length}
							required
							description={t(
								"Скопируйте полный UUID из отчёта в этом пространстве.",
								"Copy the full UUID from a report in this workspace.",
							)}
							value={runId}
							onChange={(e) => setRunId(e.currentTarget.value)}
							style={{ width: 340 }}
						/>
						<InputField
							label={t("Подраздел — необязательно", "Subtree — optional")}
							description={t(
								"Оставьте пустым для исходного корня. URL подраздела ограничит повторный discovery, сохраняя mappings большого переноса.",
								"Leave empty for the original root. A subtree URL limits discovery while preserving the larger migration's mappings.",
							)}
							value={source}
							onChange={(e) => setSource(e.currentTarget.value)}
							style={{ flex: 1 }}
						/>
						<Button
							leadingIcon={<ScanSearch />}
							disabled={!runId || busy}
							onClick={() =>
								task({
									kind: "sync-plan",
									runId,
									...(source ? { source } : {}),
								})
							}
						>
							{t("Анализировать без записи", "Analyze without writes")}
						</Button>
					</div>
				</FormSection>
			)}
			{plans.length > 0 && (
				<FormSection
					title={t("2. Решения и применение", "2. Decisions and apply")}
					description={t(
						"Выберите сохранённый план. Запись доступна после решений по обязательным изменениям и проверки актуального preview.",
						"Select a saved plan. Writes require decisions for mandatory changes and a current reviewed preview.",
					)}
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
						<ChoiceField
							label={t("План синхронизации", "Synchronization plan")}
							description={t(
								"Продолжите прежний анализ или выберите новый результат задачи.",
								"Continue an earlier analysis or select a new task result.",
							)}
							value={planId}
							style={{ flex: 1 }}
							searchable
							options={plans.map((p) => ({
								value: p.id,
								label: `${p.createdAt} · ${p.status} · ${p.sourceUrl}`,
							}))}
							onValueChange={(v) => {
								setPlanId(v ?? "");
								setPlan(undefined);
								setPage(1);
								setConfirm(false);
								setTrash(false);
							}}
						/>
						<Button
							leadingIcon={<RefreshCw />}
							onClick={() => {
								refresh().catch(onError);
								load().catch(onError);
							}}
							variant="ghost"
						>
							{t("Обновить", "Refresh")}
						</Button>
					</div>
				{planId && <CollectionState {...planRead} t={t} />}
					{plan && (
						<>
							{!plan.inventory.complete && (
								<Notice tone={"orange"}>
									{t(
										"Inventory неполон. Применение запрещено; устраните причины и повторите анализ.",
										"Inventory is incomplete. Resolve the failures and analyze again before applying.",
									)}{" "}
									{plan.inventory.failures
										.map((f: any) => `${f.code}: ${f.message}`)
										.join("; ")}
								</Notice>
							)}
							<p style={{ color: "var(--muted-foreground)", fontSize: 14 }}>
								{t(
									"Новые страницы добавляются. Изменившиеся и страницы без baseline требуют решения. Неизменённые сохраняют ID и тело.",
									"New pages are added. Changed pages and unknown baselines require a decision. Unchanged pages retain their IDs and bodies.",
								)}
							</p>
							{plan.references.unreadable?.length > 0 && (
								<Notice tone={"yellow"}>
									{t(
										"Аудит входящих ссылок неполон. Обязательная ветка проверена; ссылки в этих непрочитанных объектах пока не исправляются. Корзина недоступна.",
										"Inbound link audit is incomplete. Required dependencies were checked; links in these unreadable objects cannot be patched. Trash is unavailable.",
									)}{" "}
									{plan.references.unreadable
										.map(
											(failure: any) => `${failure.pageId}: ${failure.message}`,
										)
										.join("; ")}
								</Notice>
							)}
							<div
								style={{
									display: "flex",
									flexDirection: "row",
									gap: 8,
									alignItems: "center",
									flexWrap: "wrap",
								}}
							>
								<InputField
									aria-label={t("Поиск страниц", "Search pages")}
									placeholder={t("Название или ID", "Title or ID")}
									value={query}
									onChange={(e) => {
										setQuery(e.currentTarget.value);
										setPage(1);
									}}
									style={{ flex: 1 }}
								/>
								<ChoiceField
									aria-label={t("Фильтр изменений", "Change filter")}
									value={filter}
									options={[
										"all",
										"add",
										"changed",
										"unknown-baseline",
										"unchanged",
										"kept",
										"excluded",
									].map((value) => ({
										value,
										label: value === "all" ? t("Все", "All") : value,
									}))}
									onValueChange={(v) => {
										setFilter(v ?? "all");
										setPage(1);
									}}
								/>
							</div>
							{planRead.status === "ready" && !plan.total && (query || filter !== "all") && <div className="empty">{t("Поиск не нашёл совпадений.", "No pages match this filter.")} <Button leadingIcon={<FilterX />} variant="ghost" onClick={() => { setQuery(""); setFilter("all"); setPage(1); }}>{t("Сбросить фильтры", "Clear filters")}</Button></div>}
							<div className="table-scroll overflow-x-auto">
								<Table>
									<TableHeader>
										<TableRow>
											<TableHead>{t("Страница", "Page")}</TableHead>
											<TableHead>{t("Изменение", "Change")}</TableHead>
											<TableHead>{t("Решение", "Decision")}</TableHead>
										</TableRow>
									</TableHeader>
									<TableBody>
										{plan.items.map((item: any) => (
											<TableRow key={item.id}>
												<TableCell>
													<Button
														leadingIcon={<FileText />}
														onClick={async () => {
															try {
																setDetail(
																	await api(
																		`${root}/sync/${planId}/detail?pageId=${encodeURIComponent(item.id)}`,
																	),
																);
															} catch (error) {
																onError(error);
															}
														}}
														variant="ghost"
													>
														{item.title}
													</Button>
													<div
														style={{
															display: "flex",
															flexDirection: "row",
															alignItems: "center",
															flexWrap: "wrap",
															gap: 8,
														}}
													>
														{safeLink(item.sourceUrl) && (
															<a
																href={safeLink(item.sourceUrl)}
																target="_blank"
																rel="noreferrer"
															>
																source
															</a>
														)}
														{safeLink(item.destinationUrl) && (
															<a
																href={safeLink(item.destinationUrl)}
																target="_blank"
																rel="noreferrer"
															>
																destination
															</a>
														)}
													</div>
												</TableCell>
												<TableCell>
													<Badge
														data-tone={
															["changed", "unknown-baseline"].includes(
																item.classification,
															)
																? "orange"
																: "gray"
														}
														variant="secondary"
													>
														{item.classification}
													</Badge>
													<p style={{ fontSize: 12 }}>
														{item.reasons.join(" · ")}
													</p>
												</TableCell>
												<TableCell>
													{["changed", "unknown-baseline"].includes(
														item.classification,
													) ? (
														<ChoiceField
															aria-label={`${t("Решение", "Decision")}: ${item.title}`}
															placeholder={t("Выберите", "Choose")}
															value={plan.decisions.decisions[item.id] ?? null}
															description={
																!item.trash.allowed
																	? item.trash.reason
																	: undefined
															}
															disabled={
																plan.status === "applied" || decisionBusy
															}
															options={[
																{
																	value: "update",
																	label: t("Обновить", "Update"),
																},
																{ value: "keep", label: t("Оставить", "Keep") },
																{
																	value: "trash",
																	label: t("В корзину", "Trash"),
																	disabled: !item.trash.allowed,
																},
															]}
															onValueChange={(v) => decide(item.id, v)}
														/>
													) : (
														<p style={{ fontSize: 14 }}>
															{item.classification === "add"
																? t("Добавить", "Add")
																: t("Без записи", "No body update")}
														</p>
													)}
												</TableCell>
											</TableRow>
										))}
									</TableBody>
								</Table>
							</div>
							{plan.total > 50 && (
								<PageControls
									total={Math.ceil(plan.total / 50)}
									value={page}
									onValueChange={setPage}
								/>
							)}
							<div
								style={{
									display: "flex",
									flexDirection: "row",
									gap: 8,
									alignItems: "center",
									flexWrap: "wrap",
								}}
							>
								<p style={{ fontSize: 14 }}>
									{t("Проверка входящих ссылок", "Inbound link audit")}:{" "}
									{plan.references.pages} {t("страниц", "pages")}
									{plan.references.comments > 0
										? ` · ${plan.references.comments} comments`
										: ""}
									{plan.references.patches > 0
										? ` · ${plan.references.patches} patches`
										: ""}
								</p>
							</div>
							<SyncLinkReview
								root={root}
								planId={planId}
								revision={plan.revision}
								t={t}
								onError={onError}
								onInspect={async (id) => {
									try {
										setDetail(
											await api(
												`${root}/sync/${planId}/detail?pageId=${encodeURIComponent(id)}`,
											),
										);
									} catch (error) {
										onError(error);
									}
								}}
							/>
							{plan.missingDecisions > 0 && (
								<Notice tone={"blue"}>
									{t("Осталось выбрать решения", "Decisions remaining")}:{" "}
									{plan.missingDecisions}
								</Notice>
							)}
							{plan.status !== "applied" && (
								<div
									style={{ display: "flex", flexDirection: "column", gap: 12 }}
								>
									<CheckboxField
										checked={confirm}
										disabled={decisionBusy}
										label={t(
											"Подтверждаю решения и показанные исправления ссылок. Изменения destination могут быть заменены source-версией.",
											"Confirm decisions and disclosed link repairs. Destination edits may be replaced by the source version.",
										)}
										onCheckedChange={(e) => setConfirm(e)}
									/>
									{Object.values(plan.decisions.decisions).includes(
										"trash",
									) && (
										<CheckboxField
											checked={trash}
											disabled={decisionBusy}
											label={t(
												"Отдельно подтверждаю обратимое перемещение выбранных leaf-страниц в корзину.",
												"Separately confirm reversible trash of the selected leaf pages.",
											)}
											onCheckedChange={(e) => setTrash(e)}
										/>
									)}
									<Button
										leadingIcon={<Check />}
										disabled={
											!confirm ||
											!plan.inventory.complete ||
											plan.missingDecisions > 0 ||
											busy ||
											decisionBusy ||
											(Object.values(plan.decisions.decisions).includes(
												"trash",
											) &&
												!trash)
										}
										onClick={() =>
											task({
												kind: "sync-apply",
												planId,
												revision: plan.revision,
												confirmTrash: trash,
											})
										}
									>
										{t("Применить план", "Apply plan")}
									</Button>
								</div>
							)}
						</>
					)}
				</FormSection>
			)}
			<AppDialog
				title={detail?.item.title}
				open={Boolean(detail)}
				onDismiss={() => setDetail(undefined)}
				width={"90%"}
			>
				<div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
					<p>{detail?.item.id}</p>
					{detail?.resources?.length > 0 && (
						<div className="table-scroll overflow-x-auto">
							<Table>
								<TableHeader>
									<TableRow>
										<TableHead>{t("Файл", "File")}</TableHead>
										<TableHead>
											{t("Проверенные bytes", "Verified bytes")}
										</TableHead>
										<TableHead>
											{t("Прежний SHA-256", "Previous SHA-256")}
										</TableHead>
										<TableHead>Source SHA-256</TableHead>
									</TableRow>
								</TableHeader>
								<TableBody>
									{detail.resources.map((file: any) => (
										<TableRow key={file.id}>
											<TableCell>{file.name}</TableCell>
											<TableCell>{file.size}</TableCell>
											<TableCell>
												<p
													style={{
														fontSize: 12,
														...{ overflowWrap: "anywhere" },
													}}
												>
													{file.previousSha256 ??
														t("Нет baseline", "No baseline")}
												</p>
											</TableCell>
											<TableCell>
												<p
													style={{
														fontSize: 12,
														...{ overflowWrap: "anywhere" },
													}}
												>
													{file.sha256}
												</p>
											</TableCell>
										</TableRow>
									))}
								</TableBody>
							</Table>
						</div>
					)}
					{detail?.comments &&
						(detail.comments.current || detail.comments.proposed) && (
							<div
								style={{
									display: "flex",
									flexDirection: "row",
									gap: 8,
									flexWrap: "wrap",
									alignItems: "flex-start",
								}}
								className="ui-grow"
							>
								<div>
									<p style={{ fontWeight: 600 }}>
										{t("Архив комментариев сейчас", "Current comment archive")}
									</p>
									<pre
										style={{ whiteSpace: "pre-wrap", overflowWrap: "anywhere" }}
									>
										{detail.comments.current}
									</pre>
								</div>
								<div>
									<p style={{ fontWeight: 600 }}>
										{t("Предлагаемый архив", "Proposed archive")}
									</p>
									<pre
										style={{ whiteSpace: "pre-wrap", overflowWrap: "anywhere" }}
									>
										{detail.comments.proposed}
									</pre>
								</div>
							</div>
						)}
					<div
						style={{
							display: "flex",
							flexDirection: "row",
							gap: 8,
							flexWrap: "wrap",
							alignItems: "flex-start",
						}}
						className="ui-grow"
					>
						<div>
							<p style={{ fontWeight: 600 }}>
								{t("Сейчас в destination", "Current destination")}
							</p>
							<pre
								style={{
									whiteSpace: "pre-wrap",
									overflowWrap: "anywhere",
									maxHeight: "65vh",
									overflow: "auto",
								}}
							>
								{detail?.preview?.current ?? t("Нет тела", "No body")}
							</pre>
						</div>
						<div>
							<p style={{ fontWeight: 600 }}>
								{t("Source-derived результат", "Source-derived result")}
							</p>
							<pre
								style={{
									whiteSpace: "pre-wrap",
									overflowWrap: "anywhere",
									maxHeight: "65vh",
									overflow: "auto",
								}}
							>
								{detail?.preview?.proposed ?? t("Нет preview", "No preview")}
							</pre>
						</div>
					</div>
				</div>
			</AppDialog>
		</div>
	);
}
function SyncLinkReview({
	root,
	planId,
	revision,
	t,
	onError,
	onInspect,
}: {
	root: string;
	planId: string;
	revision: string;
	t: Translate;
	onError: (error: unknown) => void;
	onInspect: (id: string) => void;
}) {
	const [page, setPage] = useState(1),
		[links, setLinks] = useState<any>();
	useEffect(() => {
		let active = true;
		api(
			`${root}/sync/${planId}/links?offset=${(page - 1) * 50}&limit=50&revision=${revision}`,
		)
			.then((data) => {
				if (active) setLinks(data);
			})
			.catch(onError);
		return () => {
			active = false;
		};
	}, [root, planId, revision, page, onError]);
	if (!links?.total) return null;
	return (
		<div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
			<p style={{ fontWeight: 600 }}>
				{t("Изменения входящих ссылок", "Incoming link changes")} ·{" "}
				{links.total}
			</p>
			<div className="table-scroll overflow-x-auto">
				<Table>
					<TableHeader>
						<TableRow>
							<TableHead>{t("Откуда", "From")}</TableHead>
							<TableHead>{t("Текущая ссылка", "Current reference")}</TableHead>
							<TableHead>{t("Куда", "Target")}</TableHead>
						</TableRow>
					</TableHeader>
					<TableBody>
						{links.items.map((link: any) => (
							<TableRow key={link.id}>
								<TableCell>
									<Button
										leadingIcon={<Link2 />}
										onClick={() => onInspect(link.pageId)}
										variant="ghost"
									>
										{link.title}
									</Button>
									<p style={{ fontSize: 12 }}>
										{link.location}
										{link.occurrences > 1 ? ` ×${link.occurrences}` : ""}
									</p>
								</TableCell>
								<TableCell style={{ overflowWrap: "anywhere" }}>
									{link.href}
								</TableCell>
								<TableCell style={{ overflowWrap: "anywhere" }}>
									{link.destinationUrl ??
										t(
											"Destination ID будет подтверждён после создания",
											"Destination ID will be verified after creation",
										)}
									<p style={{ fontSize: 12 }}>{link.targetId}</p>
								</TableCell>
							</TableRow>
						))}
					</TableBody>
				</Table>
			</div>
			{links.total > 50 && (
				<PageControls
					total={Math.ceil(links.total / 50)}
					value={page}
					onValueChange={setPage}
				/>
			)}
		</div>
	);
}
