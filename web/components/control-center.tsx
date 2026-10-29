"use client";
import { useUiTheme } from "../../ui/theme";
import {
	ChoiceField,
	Hint,
	Notice,
	Spinner,
	InputField,
	AppDialog,
} from "../../ui/fields";
import { Button } from "../../ui/components/button";
import { useCallback, useEffect, useState } from "react";
import {
	ArrowRightLeft,
	Files,
	Languages,
	ListTodo,
	Monitor,
	Moon,
	Plug,
	Plus,
	RefreshCw,
	Sun,
	Tags,
} from "lucide-react";
import { api, type Translate } from "./api";
import { Tasks } from "./tasks";
import { Reports } from "./reports";
import { Decisions } from "./decisions";
import { Settings } from "./settings";
import { MigrationForm } from "./migration-form";
import { Synchronization } from "./synchronization";
export function ControlCenter() {
	const [connected, setConnected] = useState(false),
		[error, setError] = useState(""),
		[workspaces, setWorkspaces] = useState<any[]>([]),
		[workspace, setWorkspace] = useState(""),
		[tab, setTab] = useState("reports"),
		[language, setLanguage] = useState("ru"),
		[add, setAdd] = useState(false),
		[directory, setDirectory] = useState(""),
		[newMigration, setNewMigration] = useState(false),
		[job, setJob] = useState<string>(),
		[run, setRun] = useState<string>(),
		[revision, setRevision] = useState(0);
	const { theme: colorScheme, setTheme: setColorScheme } = useUiTheme();
	const t: Translate = (ru, en) => (language === "ru" ? ru : en);
	const navigation = [
		{
			id: "reports",
			label: t("Миграции и отчёты", "Migrations & reports"),
			icon: Files,
			hint: t(
				"История запусков, дерево страниц и точечное восстановление.",
				"Run history, page hierarchy and targeted recovery.",
			),
		},
		{
			id: "jobs",
			label: t("Задачи", "Tasks"),
			icon: ListTodo,
			hint: t(
				"Очередь операций, прогресс и журнал выполнения.",
				"Operation queue, progress and execution log.",
			),
		},
		{
			id: "decisions",
			label: "Decisions",
			icon: Tags,
			hint: t(
				"Анализ и решения для упоминаний и тегов.",
				"Analysis and decisions for mentions and hashtags.",
			),
		},
		{
			id: "sync",
			label: t("Синхронизация", "Synchronization"),
			icon: RefreshCw,
			hint: t(
				"Сравнение изменений и подтверждённое обновление переноса.",
				"Review changes and apply confirmed migration updates.",
			),
		},
		{
			id: "settings",
			label: t("Подключения", "Connections"),
			icon: Plug,
			hint: t(
				"Профили, доступы и настройки рабочего каталога.",
				"Profiles, access and workspace settings.",
			),
		},
	];
	const activeArea =
		navigation.find((area) => area.id === tab) ?? navigation[0]!;
	const AreaIcon = activeArea.icon;
	const root = `w/${workspace}`;
	const fail = useCallback(
		(error: unknown) =>
			setError(error instanceof Error ? error.message : String(error)),
		[],
	);
	const refresh = useCallback(async () => {
		const data = await api("workspaces");
		setWorkspaces(data.items);
		setWorkspace((value) => value || data.items[0]?.id || "");
		setConnected(true);
	}, []);
	useEffect(() => {
		try {
			setLanguage(
				localStorage.getItem("ywtc-ui-language") ??
					(navigator.language.startsWith("ru") ? "ru" : "en"),
			);
		} catch {}
		const secret = location.hash.slice(1);
		history.replaceState(null, "", location.pathname);
		(async () => {
			if (secret) await api("session", "POST", { secret });
			await refresh();
		})().catch(fail);
	}, [fail, refresh]);
	const showJob = (id: string) => {
		setJob(id);
		setTab("jobs");
		setRevision((r) => r + 1);
		setNewMigration(false);
	};
	const showRun = (id: string) => {
		setRun(id);
		setTab("reports");
	};
	return (
		<main className="shell">
			<h1
				style={{
					position: "absolute",
					width: 1,
					height: 1,
					overflow: "hidden",
				}}
			>
				ywtc control center
			</h1>
			<header className="top">
				<div className="product-identity">
					<ArrowRightLeft className="product-mark" aria-hidden="true" />
					<div>
						<span className="brand">ywtc</span>
						<p className="product-caption">
							{t("Центр миграций", "Migration control center")}
						</p>
					</div>
				</div>
				<div
					className="workspace-controls"
					style={{
						display: "flex",
						flexDirection: "row",
						alignItems: "center",
						flexWrap: "nowrap",
						gap: 8,
					}}
				>
					<ChoiceField
						aria-label={t("Рабочая директория", "Workspace")}
						value={workspace}
						options={workspaces.map((w) => ({ value: w.id, label: w.path }))}
						onValueChange={(value) => {
							setWorkspace(value ?? "");
							setJob(undefined);
							setRun(undefined);
						}}
						style={{ width: 260, flex: "1 1 160px" }}
					/>
					<Hint content={t("Подключить workspace", "Connect workspace")}>
						<Button
							aria-label={t("Подключить workspace", "Connect workspace")}
							onClick={() => setAdd(true)}
							variant="ghost"
							size="icon-sm"
						>
							<Plus size={18} />
						</Button>
					</Hint>
					<Hint
						content={`${colorScheme} → ${colorScheme === "system" ? "light" : colorScheme === "light" ? "dark" : "system"}`}
					>
						<Button
							aria-label="Theme"
							onClick={() =>
								setColorScheme(
									colorScheme === "system"
										? "light"
										: colorScheme === "light"
											? "dark"
											: "system",
								)
							}
							variant="ghost"
							size="icon-sm"
						>
							{colorScheme === "system" ? (
								<Monitor size={18} />
							) : colorScheme === "light" ? (
								<Sun size={18} />
							) : (
								<Moon size={18} />
							)}
						</Button>
					</Hint>
					<Hint content={language === "ru" ? "English" : "Русский"}>
						<Button
							aria-label="Language"
							onClick={() => {
								const next = language === "ru" ? "en" : "ru";
								setLanguage(next);
								try {
									localStorage.setItem("ywtc-ui-language", next);
								} catch {}
							}}
							variant="ghost"
							size="icon-sm"
						>
							<Languages size={18} />
						</Button>
					</Hint>
				</div>
			</header>
			{error && (
				<Notice
					tone={"red"}
					onDismiss={() => setError("")}
					style={{ marginBottom: 24 }}
				>
					{error}
				</Notice>
			)}
			{!connected ? (
				<div className="empty">
					{error ? (
						t(
							"Для подключения откройте URL из команды ywtc ui.",
							"Connect using the URL printed by ywtc ui.",
						)
					) : (
						<Spinner />
					)}
				</div>
			) : (
				<div className="workspace-layout">
					<aside className="workspace-navigation">
						<Button
							className="create-migration"
							onClick={() => setNewMigration(true)}
						>
							<Plus size={16} aria-hidden="true" />
							{t("Новая миграция", "New migration")}
						</Button>
						<nav
							className="work-area-nav"
							aria-label={t("Рабочие разделы", "Work areas")}
						>
							{navigation.map(({ id, label, icon: Icon, hint }) => (
								<Hint key={id} content={hint}>
									<Button
										className="nav-link"
										aria-current={tab === id ? "page" : undefined}
										onClick={() => setTab(id)}
										variant="ghost"
									>
										<Icon size={18} strokeWidth={1.75} aria-hidden="true" />
										<span>{label}</span>
									</Button>
								</Hint>
							))}
						</nav>
					</aside>
					<div className="workspace-content">
						<div className="context-strip">
							<AreaIcon size={15} aria-hidden="true" />
							<p>{activeArea.hint}</p>
						</div>
						{workspace && tab === "jobs" && (
							<Tasks
								key={`${workspace}-${revision}`}
								root={root}
								t={t}
								initialJob={job}
								onError={fail}
								onReport={showRun}
								onJob={showJob}
							/>
						)}
						{workspace && tab === "reports" && (
							<Reports
								key={workspace}
								root={root}
								t={t}
								initialRun={run}
								onError={fail}
								onJob={showJob}
							/>
						)}
						{workspace && tab === "decisions" && (
							<Decisions
								key={workspace}
								root={root}
								t={t}
								onError={fail}
								onJob={showJob}
							/>
						)}
						{workspace && tab === "sync" && (
							<Synchronization
								key={workspace}
								root={root}
								t={t}
								onError={fail}
								onJob={showJob}
							/>
						)}
						{workspace && tab === "settings" && (
							<Settings key={workspace} root={root} t={t} onError={fail} />
						)}
					</div>
				</div>
			)}
			<AppDialog
				title={t(
					"Подключить или создать workspace",
					"Connect or create workspace",
				)}
				open={add}
				onDismiss={() => setAdd(false)}
			>
				<InputField
					label={t("Полный путь", "Absolute path")}
					value={directory}
					onChange={(e) => setDirectory(e.target.value)}
				/>
				<div
					style={{
						display: "flex",
						flexDirection: "row",
						gap: 8,
						alignItems: "center",
						flexWrap: "wrap",
						marginTop: 24,
					}}
				>
					<Button
						onClick={() =>
							api("workspaces", "POST", { path: directory })
								.then(() => {
									setAdd(false);
									return refresh();
								})
								.catch(fail)
						}
					>
						{t("Подключить", "Connect")}
					</Button>
					<Button
						onClick={() =>
							api("workspaces", "POST", { path: directory, create: true })
								.then(() => {
									setAdd(false);
									return refresh();
								})
								.catch(fail)
						}
						variant="secondary"
					>
						{t("Создать", "Create")}
					</Button>
				</div>
			</AppDialog>
			<AppDialog
				title={t("Новая миграция", "New migration")}
				open={newMigration}
				onDismiss={() => setNewMigration(false)}
				width="48rem"
			>
				<MigrationForm root={root} t={t} onError={fail} onJob={showJob} />
			</AppDialog>
		</main>
	);
}
