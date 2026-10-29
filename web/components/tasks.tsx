"use client";
import { Badge } from "../../ui/components/badge";
import { Button } from "../../ui/components/button";
import { Notice, CheckboxField } from "../../ui/fields";
import { Progress } from "../../ui/components/progress";
import { useEffect, useRef, useState } from "react";
import { api, statusColor, type Translate } from "./api";
export function Tasks({
	root,
	t,
	initialJob,
	onError,
	onReport,
	onJob,
}: {
	root: string;
	t: Translate;
	initialJob?: string;
	onError: (e: unknown) => void;
	onReport: (id: string) => void;
	onJob: (id: string) => void;
}) {
	const [jobs, setJobs] = useState<any[]>([]),
		[selected, setSelected] = useState(initialJob),
		[job, setJob] = useState<any>(),
		[events, setEvents] = useState<any[]>([]),
		[snapshot, setSnapshot] = useState<any>(),
		[preview, setPreview] = useState<any>(),
		[confirmed, setConfirmed] = useState(false),
		[offset, setOffset] = useState(0),
		[total, setTotal] = useState(0),
		[disconnected, setDisconnected] = useState(false);
	const cursor = useRef(0);
	useEffect(() => {
		const load = () =>
			api(`${root}/jobs?offset=${offset}`)
				.then((d) => {
					setJobs(d.items);
					setTotal(d.total);
				})
				.catch(onError);
		load();
		const timer = setInterval(load, 3000);
		return () => clearInterval(timer);
	}, [root, offset, onError]);
	useEffect(() => {
		if (!selected) return;
		setEvents([]);
		setSnapshot(undefined);
		setPreview(undefined);
		setConfirmed(false);
		cursor.current = 0;
		const source = new EventSource(`/api/${root}/jobs/${selected}/events`);
		source.onopen = () => setDisconnected(false);
		source.onerror = () => setDisconnected(true);
		source.addEventListener("event", (event) => {
			const e = JSON.parse((event as MessageEvent).data);
			cursor.current = e.sequence;
			setEvents((items) => [...items, e].slice(-300));
			if (e.data?.type === "progress") setSnapshot(e.data);
		});
		source.addEventListener("snapshot", (event) => {
			const j = JSON.parse((event as MessageEvent).data);
			setJob(j);
			if (j.progress) setSnapshot(j.progress);
			if (j.result?.previewId)
				api(`${root}/previews/${j.result.previewId}`)
					.then(setPreview)
					.catch(onError);
			if (["finished", "interrupted"].includes(j.status)) {
				source.close();
				setDisconnected(false);
			}
		});
		return () => source.close();
	}, [root, selected, onError]);
	const submit = async (request: any, live = false) => {
		try {
			const next = await api(`${root}/jobs`, "POST", {
				request,
				confirmed: live,
			});
			onJob(next.id);
			setSelected(next.id);
		} catch (e) {
			onError(e);
		}
	};
	return (
		<>
			<div className="section-title">
				{t("Очередь и история задач", "Queue & task history")}
			</div>
			{jobs.map((item) => (
				<div className="row" key={item.id}>
					<Badge
						data-tone={statusColor(item.result?.status ?? item.status)}
						variant="secondary"
					>
						{item.status}
					</Badge>
					<Button onClick={() => setSelected(item.id)} variant="ghost">
						{item.request.kind} · {item.id.slice(0, 8)}
					</Button>
					<span className="grow muted">
						{new Date(item.createdAt).toLocaleString()}
					</span>
					{item.runId && (
						<Button onClick={() => onReport(item.runId)} variant="ghost">
							{t("Отчёт", "Report")}
						</Button>
					)}
					{item.result && (
						<span className="mono">
							{item.result.status} · exit {item.result.exitCode}
						</span>
					)}
				</div>
			))}
			{!jobs.length && (
				<div className="empty">{t("Задач пока нет.", "No jobs yet.")}</div>
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
				<Button
					disabled={!offset}
					onClick={() => setOffset(Math.max(0, offset - 100))}
					variant="ghost"
				>
					←
				</Button>
				<Button
					disabled={offset + 100 >= total}
					onClick={() => setOffset(offset + 100)}
					variant="ghost"
				>
					→
				</Button>
			</div>
			{job && (
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
						<div className="section-title">
							{t("Задача", "Task")} <span className="mono">{job.id}</span>
						</div>
						{["queued", "running", "stopping"].includes(job.status) && (
							<Button
								disabled={job.status === "stopping"}
								onClick={() =>
									api(`${root}/jobs/${job.id}/stop`, "POST", {})
										.then(setJob)
										.catch(onError)
								}
							>
								{job.status === "stopping"
									? t("Остановка запрошена", "Stop requested")
									: t("Мягкая остановка", "Graceful stop")}
							</Button>
						)}
					</div>
					{disconnected && (
						<Notice tone={"orange"}>
							{t(
								"Потеряно наблюдение. Работа может продолжаться; соединение восстанавливается.",
								"Observability lost. Work may continue; reconnecting.",
							)}
						</Notice>
					)}
					{job.heartbeatAt && (
						<p className="muted">
							{t("Последний сигнал", "Last heartbeat")}:{" "}
							{new Date(job.heartbeatAt).toLocaleString()}
						</p>
					)}
					{job.inventory && (
						<div
							style={{
								display: "flex",
								flexDirection: "row",
								gap: 8,
								alignItems: "center",
								flexWrap: "wrap",
								marginBlock: 16,
							}}
						>
							{Object.entries(job.inventory)
								.filter(([, count]) => Number(count) > 0)
								.map(([key, count]) => (
									<Badge key={key} variant="outline">
										Source {key}: {String(count)}
									</Badge>
								))}
						</div>
					)}
					{snapshot && (
						<div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
							<strong>{snapshot.phase}</strong>
							{snapshot.total > 0 && (
								<Progress
									aria-label="Operation progress"
									value={(snapshot.completed / snapshot.total) * 100}
								/>
							)}
							<span>
								{snapshot.completed ?? ""}
								{snapshot.total ? ` / ${snapshot.total}` : ""}{" "}
								{snapshot.unit ?? ""} {snapshot.detail}
							</span>
							<div
								style={{
									display: "flex",
									flexDirection: "row",
									gap: 8,
									alignItems: "center",
									flexWrap: "wrap",
								}}
							>
								{Object.entries(snapshot.counters ?? {}).map(
									([key, count]: [string, any]) =>
										count.total || count.completed ? (
											<Badge key={key} variant="secondary">
												{key} {count.completed}
												{count.total === undefined ? "" : `/${count.total}`}
											</Badge>
										) : null,
								)}
								{snapshot.inFlight > 0 && (
									<Badge variant="outline">
										{t("В работе", "In flight")} {snapshot.inFlight}
									</Badge>
								)}
								{snapshot.queued > 0 && (
									<Badge variant="outline">
										{t("В очереди", "Queued")} {snapshot.queued}
									</Badge>
								)}
							</div>
							<span className="muted">
								{snapshot.rate ? `${snapshot.rate.toFixed(1)} op/s · ` : ""}
								{snapshot.etaMs
									? `ETA ${Math.ceil(snapshot.etaMs / 60000)} min · `
									: ""}
								{t("Прошло", "Elapsed")} {Math.round(snapshot.elapsedMs / 1000)}{" "}
								s · {t("Без завершений", "Since last completion")}{" "}
								{Math.max(
									0,
									Math.round((Date.now() - snapshot.lastCompletedAt) / 1000),
								)}{" "}
								s
							</span>
							{snapshot.active?.map((a: any) => (
								<span className="mono" key={a.id}>
									{a.label} · {Math.round((Date.now() - a.startedAt) / 1000)} s
								</span>
							))}
						</div>
					)}
					{job.error && <Notice tone={"red"}>{job.error}</Notice>}
					{job.result?.runId && (
						<Button
							onClick={() => onReport(job.result.runId)}
							variant="secondary"
							style={{ marginTop: 16 }}
						>
							{t("Открыть отчёт", "Open report")}
						</Button>
					)}
					{job.status === "interrupted" && (
						<Notice tone={"orange"} style={{ marginTop: 16 }}>
							{t(
								"Задача прервана. Автоматических повторных записей нет.",
								"Task interrupted. No writes are automatically retried.",
							)}
							<Button
								onClick={() =>
									job.request.kind === "targeted"
										? submit({
												...job.request,
												dryRun: true,
												previewId: undefined,
											})
										: job.runId
											? submit({
													kind: "retry",
													runId: job.runId,
													dryRun: true,
												})
											: submit({
													...job.request,
													...(job.request.kind === "migrate"
														? { dryRun: true }
														: {}),
												})
								}
								style={{ marginLeft: 16 }}
							>
								{t("Подготовить продолжение", "Prepare continuation")}
							</Button>
						</Notice>
					)}
					{["migrate", "retry"].includes(job.request.kind) &&
						job.request.dryRun &&
						job.result?.runId &&
						!["failed", "cancelled", "interrupted"].includes(
							job.result.status,
						) && (
							<div
								style={{
									display: "flex",
									flexDirection: "column",
									gap: 16,
									marginTop: 16,
								}}
							>
								<CheckboxField
									checked={confirmed}
									label={t(
										"Подтверждаю live-запуск с этими параметрами",
										"Confirm live migration with these parameters",
									)}
									onCheckedChange={(e) => setConfirmed(e)}
								/>
								<Button
									disabled={!confirmed}
									onClick={() =>
										submit({ ...job.request, dryRun: false }, true)
									}
								>
									{t("Запустить live", "Run live")}
								</Button>
							</div>
						)}
					{job.request.kind === "targeted" &&
						!job.request.dryRun &&
						job.result?.status === "failed" && (
							<Button
								onClick={() =>
									submit({ ...job.request, dryRun: true, previewId: undefined })
								}
								variant="secondary"
								style={{ marginTop: 16 }}
							>
								{t("Подготовить новый preview", "Prepare a new preview")}
							</Button>
						)}
					{preview && (
						<div
							style={{
								display: "flex",
								flexDirection: "column",
								gap: 16,
								marginTop: 24,
							}}
						>
							<strong>{t("Предварительный план", "Preview plan")}</strong>
							<div
								style={{
									display: "flex",
									flexDirection: "row",
									gap: 8,
									alignItems: "center",
									flexWrap: "wrap",
								}}
							>
								<Badge variant="secondary">
									{preview.plan.retryPageIds.length} pages
								</Badge>
								<Badge variant="secondary">
									{preview.plan.contextPageIds?.length ?? 0} context
								</Badge>
							</div>
							{Object.entries(preview.pages).map(([id, p]: [string, any]) => (
								<details key={id}>
									<summary>{p.title}</summary>
									<div className="preview-grid">
										<pre className="code">{p.current}</pre>
										<pre className="code">{p.proposed}</pre>
									</div>
								</details>
							))}
							{Object.entries(preview.comments ?? {}).map(
								([id, c]: [string, any]) => (
									<details key={id}>
										<summary>
											{t("Архив комментариев", "Comment archive")} · {id}
										</summary>
										<div className="preview-grid">
											<pre className="code">{c.current}</pre>
											<pre className="code">{c.proposed}</pre>
										</div>
									</details>
								),
							)}
							<Notice tone={"orange"}>
								{t(
									"Будут применены только выбранные объекты. Новое содержимое source заменит текущий destination. Изменение данных потребует нового preview.",
									"Only selected objects will be applied. New source content replaces current destination. Data changes require a new preview.",
								)}
							</Notice>
							<CheckboxField
								checked={confirmed}
								label={t(
									"Я проверил preview и подтверждаю запись",
									"I reviewed the preview and confirm writes",
								)}
								onCheckedChange={(e) => setConfirmed(e)}
							/>
							<Button
								disabled={!confirmed || preview.ready === false}
								onClick={() =>
									submit(
										{ ...job.request, dryRun: false, previewId: preview.id },
										true,
									)
								}
							>
								{t("Применить", "Apply")}
							</Button>
							{preview.blockers?.map((s: string) => (
								<Notice key={s} tone={"red"}>
									{s}
								</Notice>
							))}
						</div>
					)}
					<h3>{t("Журнал", "Event log")}</h3>
					<div className="code" aria-live="polite">
						{events.map((e) => (
							<div key={e.sequence}>
								<span className="muted">
									{e.sequence} {new Date(e.at).toLocaleTimeString()}
								</span>{" "}
								{e.message ??
									e.data?.message ??
									e.data?.detail ??
									`${e.type}: ${e.data?.status ?? ""}`}
							</div>
						))}
					</div>
				</section>
			)}
		</>
	);
}
