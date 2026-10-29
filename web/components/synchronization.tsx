"use client";
import { useCallback, useEffect, useState, useRef } from "react";
import {
	Alert,
	Badge,
	Button,
	Checkbox,
	Group,
	Modal,
	Pagination,
	Select,
	Stack,
	Table,
	Text,
	TextInput,
} from "@mantine/core";
import { api, safeLink, type Translate } from "./api";

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
	const [plans, setPlans] = useState<any[]>([]),
		[planId, setPlanId] = useState(""),
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
		[decisionBusy, setDecisionBusy] = useState(false);
	const loadedRevision = useRef(""),
		loadSequence = useRef(0);
	const refresh = useCallback(async () => {
		const data = await api(`${root}/sync`);
		setPlans(data.items);
	}, [root]);
	const load = useCallback(async () => {
		if (!planId) {
			setPlan(undefined);
			return;
		}
		const sequence = ++loadSequence.current,
			next = await api(
				`${root}/sync/${planId}?offset=${(page - 1) * 50}&limit=50&q=${encodeURIComponent(query)}&filter=${filter}`,
			);
		if (sequence !== loadSequence.current) return;
		if (loadedRevision.current !== next.revision) {
			loadedRevision.current = next.revision;
			setConfirm(false);
			setTrash(false);
		}
		setPlan(next);
	}, [root, planId, page, query, filter]);
	useEffect(() => {
		refresh().catch(onError);
	}, [refresh, onError]);
	useEffect(() => {
		load().catch(onError);
	}, [load, onError]);
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
		<Stack gap="xl">
			<Group align="end">
				<TextInput
					label={t("Run ID исходной миграции", "Original migration Run ID")}
					value={runId}
					onChange={(e) => setRunId(e.currentTarget.value)}
					w={340}
				/>
				<TextInput
					label={t("Подраздел — необязательно", "Subtree — optional")}
					value={source}
					onChange={(e) => setSource(e.currentTarget.value)}
					style={{ flex: 1 }}
				/>
				<Button
					disabled={!runId || busy}
					onClick={() =>
						task({ kind: "sync-plan", runId, ...(source ? { source } : {}) })
					}
				>
					{t("Анализировать без записи", "Analyze without writes")}
				</Button>
			</Group>
			<Group>
				<Select
					label={t("План синхронизации", "Synchronization plan")}
					value={planId}
					data={plans.map((p) => ({
						value: p.id,
						label: `${p.createdAt} · ${p.status} · ${p.sourceUrl}`,
					}))}
					onChange={(v) => {
						setPlanId(v ?? "");
						setPage(1);
						setConfirm(false);
						setTrash(false);
					}}
					style={{ flex: 1 }}
					searchable
				/>
				<Button
					variant="subtle"
					onClick={() => {
						refresh().catch(onError);
						load().catch(onError);
					}}
				>
					{t("Обновить", "Refresh")}
				</Button>
			</Group>
			{plan && (
				<>
					{!plan.inventory.complete && (
						<Alert color="orange">
							{t(
								"Inventory неполон. Применение запрещено; устраните причины и повторите анализ.",
								"Inventory is incomplete. Resolve the failures and analyze again before applying.",
							)}{" "}
							{plan.inventory.failures
								.map((f: any) => `${f.code}: ${f.message}`)
								.join("; ")}
						</Alert>
					)}
					<Text size="sm" c="dimmed">
						{t(
							"Новые страницы добавляются. Изменившиеся и страницы без baseline требуют решения. Неизменённые сохраняют ID и тело.",
							"New pages are added. Changed pages and unknown baselines require a decision. Unchanged pages retain their IDs and bodies.",
						)}
					</Text>
					{plan.references.unreadable?.length > 0 && (
						<Alert color="yellow">
							{t(
								"Аудит входящих ссылок неполон. Обязательная ветка проверена; ссылки в этих непрочитанных объектах пока не исправляются. Корзина недоступна.",
								"Inbound link audit is incomplete. Required dependencies were checked; links in these unreadable objects cannot be patched. Trash is unavailable.",
							)}{" "}
							{plan.references.unreadable
								.map((failure: any) => `${failure.pageId}: ${failure.message}`)
								.join("; ")}
						</Alert>
					)}
					<Group>
						<TextInput
							aria-label={t("Поиск страниц", "Search pages")}
							placeholder={t("Название или ID", "Title or ID")}
							value={query}
							onChange={(e) => {
								setQuery(e.currentTarget.value);
								setPage(1);
							}}
							style={{ flex: 1 }}
						/>
						<Select
							aria-label={t("Фильтр изменений", "Change filter")}
							value={filter}
							onChange={(v) => {
								setFilter(v ?? "all");
								setPage(1);
							}}
							data={[
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
						/>
					</Group>
					<Table.ScrollContainer minWidth={650}>
						<Table>
							<Table.Thead>
								<Table.Tr>
									<Table.Th>{t("Страница", "Page")}</Table.Th>
									<Table.Th>{t("Изменение", "Change")}</Table.Th>
									<Table.Th>{t("Решение", "Decision")}</Table.Th>
								</Table.Tr>
							</Table.Thead>
							<Table.Tbody>
								{plan.items.map((item: any) => (
									<Table.Tr key={item.id}>
										<Table.Td>
											<Button
												variant="subtle"
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
											>
												{item.title}
											</Button>
											<Group gap="xs">
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
											</Group>
										</Table.Td>
										<Table.Td>
											<Badge
												color={
													["changed", "unknown-baseline"].includes(
														item.classification,
													)
														? "orange"
														: "gray"
												}
											>
												{item.classification}
											</Badge>
											<Text size="xs">{item.reasons.join(" · ")}</Text>
										</Table.Td>
										<Table.Td>
											{["changed", "unknown-baseline"].includes(
												item.classification,
											) ? (
												<Select
													aria-label={`${t("Решение", "Decision")}: ${item.title}`}
													placeholder={t("Выберите", "Choose")}
													value={plan.decisions.decisions[item.id] ?? null}
													onChange={(v) => decide(item.id, v)}
													data={[
														{ value: "update", label: t("Обновить", "Update") },
														{ value: "keep", label: t("Оставить", "Keep") },
														{
															value: "trash",
															label: t("В корзину", "Trash"),
															disabled: !item.trash.allowed,
														},
													]}
													description={
														!item.trash.allowed ? item.trash.reason : undefined
													}
													disabled={plan.status === "applied" || decisionBusy}
												/>
											) : (
												<Text size="sm">
													{item.classification === "add"
														? t("Добавить", "Add")
														: t("Без записи", "No body update")}
												</Text>
											)}
										</Table.Td>
									</Table.Tr>
								))}
							</Table.Tbody>
						</Table>
					</Table.ScrollContainer>
					{plan.total > 50 && (
						<Pagination
							total={Math.ceil(plan.total / 50)}
							value={page}
							onChange={setPage}
						/>
					)}
					<Group>
						<Text size="sm">
							{t("Проверка входящих ссылок", "Inbound link audit")}:{" "}
							{plan.references.pages} {t("страниц", "pages")}
							{plan.references.comments > 0
								? ` · ${plan.references.comments} comments`
								: ""}
							{plan.references.patches > 0
								? ` · ${plan.references.patches} patches`
								: ""}
						</Text>
					</Group>
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
						<Alert color="blue">
							{t("Осталось выбрать решения", "Decisions remaining")}:{" "}
							{plan.missingDecisions}
						</Alert>
					)}
					{plan.status !== "applied" && (
						<Stack gap="sm">
							<Checkbox
								checked={confirm}
								disabled={decisionBusy}
								onChange={(e) => setConfirm(e.currentTarget.checked)}
								label={t(
									"Подтверждаю решения и показанные исправления ссылок. Изменения destination могут быть заменены source-версией.",
									"Confirm decisions and disclosed link repairs. Destination edits may be replaced by the source version.",
								)}
							/>
							{Object.values(plan.decisions.decisions).includes("trash") && (
								<Checkbox
									checked={trash}
									disabled={decisionBusy}
									onChange={(e) => setTrash(e.currentTarget.checked)}
									label={t(
										"Отдельно подтверждаю обратимое перемещение выбранных leaf-страниц в корзину.",
										"Separately confirm reversible trash of the selected leaf pages.",
									)}
								/>
							)}
							<Button
								disabled={
									!confirm ||
									!plan.inventory.complete ||
									plan.missingDecisions > 0 ||
									busy ||
									decisionBusy ||
									(Object.values(plan.decisions.decisions).includes("trash") &&
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
						</Stack>
					)}
				</>
			)}
			<Modal
				opened={Boolean(detail)}
				onClose={() => setDetail(undefined)}
				title={detail?.item.title}
				size="90%"
			>
				<Stack>
					<Text>{detail?.item.id}</Text>
					{detail?.resources?.length > 0 && (
						<Table.ScrollContainer minWidth={650}>
							<Table>
								<Table.Thead>
									<Table.Tr>
										<Table.Th>{t("Файл", "File")}</Table.Th>
										<Table.Th>
											{t("Проверенные bytes", "Verified bytes")}
										</Table.Th>
										<Table.Th>
											{t("Прежний SHA-256", "Previous SHA-256")}
										</Table.Th>
										<Table.Th>Source SHA-256</Table.Th>
									</Table.Tr>
								</Table.Thead>
								<Table.Tbody>
									{detail.resources.map((file: any) => (
										<Table.Tr key={file.id}>
											<Table.Td>{file.name}</Table.Td>
											<Table.Td>{file.size}</Table.Td>
											<Table.Td>
												<Text size="xs" style={{ overflowWrap: "anywhere" }}>
													{file.previousSha256 ??
														t("Нет baseline", "No baseline")}
												</Text>
											</Table.Td>
											<Table.Td>
												<Text size="xs" style={{ overflowWrap: "anywhere" }}>
													{file.sha256}
												</Text>
											</Table.Td>
										</Table.Tr>
									))}
								</Table.Tbody>
							</Table>
						</Table.ScrollContainer>
					)}
					{detail?.comments &&
						(detail.comments.current || detail.comments.proposed) && (
							<Group grow align="start">
								<div>
									<Text fw={600}>
										{t("Архив комментариев сейчас", "Current comment archive")}
									</Text>
									<pre
										style={{ whiteSpace: "pre-wrap", overflowWrap: "anywhere" }}
									>
										{detail.comments.current}
									</pre>
								</div>
								<div>
									<Text fw={600}>
										{t("Предлагаемый архив", "Proposed archive")}
									</Text>
									<pre
										style={{ whiteSpace: "pre-wrap", overflowWrap: "anywhere" }}
									>
										{detail.comments.proposed}
									</pre>
								</div>
							</Group>
						)}
					<Group grow align="start">
						<div>
							<Text fw={600}>
								{t("Сейчас в destination", "Current destination")}
							</Text>
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
							<Text fw={600}>
								{t("Source-derived результат", "Source-derived result")}
							</Text>
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
					</Group>
				</Stack>
			</Modal>
		</Stack>
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
		<Stack gap="sm">
			<Text fw={600}>
				{t("Изменения входящих ссылок", "Incoming link changes")} ·{" "}
				{links.total}
			</Text>
			<Table.ScrollContainer minWidth={600}>
				<Table>
					<Table.Thead>
						<Table.Tr>
							<Table.Th>{t("Откуда", "From")}</Table.Th>
							<Table.Th>{t("Текущая ссылка", "Current reference")}</Table.Th>
							<Table.Th>{t("Куда", "Target")}</Table.Th>
						</Table.Tr>
					</Table.Thead>
					<Table.Tbody>
						{links.items.map((link: any) => (
							<Table.Tr key={link.id}>
								<Table.Td>
									<Button
										variant="subtle"
										onClick={() => onInspect(link.pageId)}
									>
										{link.title}
									</Button>
									<Text size="xs">
										{link.location}
										{link.occurrences > 1 ? ` ×${link.occurrences}` : ""}
									</Text>
								</Table.Td>
								<Table.Td style={{ overflowWrap: "anywhere" }}>
									{link.href}
								</Table.Td>
								<Table.Td style={{ overflowWrap: "anywhere" }}>
									{link.destinationUrl ??
										t(
											"Destination ID будет подтверждён после создания",
											"Destination ID will be verified after creation",
										)}
									<Text size="xs">{link.targetId}</Text>
								</Table.Td>
							</Table.Tr>
						))}
					</Table.Tbody>
				</Table>
			</Table.ScrollContainer>
			{links.total > 50 && (
				<Pagination
					total={Math.ceil(links.total / 50)}
					value={page}
					onChange={setPage}
				/>
			)}
		</Stack>
	);
}
