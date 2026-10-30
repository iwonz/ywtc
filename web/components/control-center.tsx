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
import { useCallback, useEffect, useRef, useState } from "react";
import {
	ArrowRightLeft,
	Files,
	FolderOpen,
	GitBranch,
	CircleHelp,
	PanelLeftClose,
	PanelLeftOpen,
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
import { OperatorHelp } from "./operator-help";
export function ControlCenter() {
	const [connected, setConnected] = useState(false),
		[error, setError] = useState(""),
		[workspaces, setWorkspaces] = useState<any[]>([]),
		[workspace, setWorkspace] = useState(""),
		[tab, setTab] = useState("settings"),
		[language, setLanguage] = useState("ru"),
		[add, setAdd] = useState(false),
		[directory, setDirectory] = useState(""),
		[newMigration, setNewMigration] = useState(false),
		[job, setJob] = useState<string>(),
		[run, setRun] = useState<string>(),
		[revision, setRevision] = useState(0),
		[collapsed, setCollapsed] = useState(false),
		[help, setHelp] = useState(false),
		[pickerFocus, setPickerFocus] = useState(false),
		[workspaceBusy, setWorkspaceBusy] = useState(false),
		[workspaceError, setWorkspaceError] = useState("");
	const picker = useRef<HTMLDivElement>(null);
	const { theme: colorScheme, setTheme: setColorScheme } = useUiTheme();
	const t: Translate = (ru, en) => (language === "ru" ? ru : en);
	const navigation = [
		{
			id: "settings",
			label: t("Подключения", "Connections"),
			icon: Plug,
			hint: t(
				"Начните с профилей, доступов и настроек выбранного пространства.",
				"Start with profiles, access and settings for the selected workspace.",
			),
		},
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
			id: "sync",
			label: t("Синхронизация", "Synchronization"),
			icon: RefreshCw,
			hint: t(
				"Сравнение изменений и подтверждённое обновление переноса.",
				"Review changes and apply confirmed migration updates.",
			),
		},
		{
			id: "decisions",
			label: t("Упоминания и хэштеги", "Mentions & hashtags"),
			icon: Tags,
			hint: t(
				"Анализ → разметка → публикация версии → подключение или применение к миграции.",
				"Analyze → edit → publish a revision → activate or apply to a migration.",
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
			setCollapsed(
				localStorage.getItem("ywtc-ui-sidebar-collapsed") === "true",
			);
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
	useEffect(() => {
		if (!collapsed && pickerFocus) {
			picker.current
				?.querySelector<HTMLButtonElement>('button[role="combobox"]')
				?.focus();
			setPickerFocus(false);
		}
	}, [collapsed, pickerFocus]);
	const collapse = (next: boolean) => {
		setCollapsed(next);
		try {
			localStorage.setItem("ywtc-ui-sidebar-collapsed", String(next));
		} catch {}
	};
	const chooseWorkspace = (id: string) => {
		setWorkspace(id);
		setJob(undefined);
		setRun(undefined);
		setNewMigration(false);
		setTab("settings");
		setError("");
	};
	const register = async (create: boolean) => {
		if (!directory.trim() || workspaceBusy) return;
		setWorkspaceBusy(true);
		setWorkspaceError("");
		try {
			const data = await api("workspaces", "POST", {
				path: directory.trim(),
				...(create ? { create: true } : {}),
			});
			const selected =
				data.items.find(
					(w: any) => !workspaces.some((old) => old.id === w.id),
				) ??
				data.items.find(
					(w: any) => w.path === directory.trim().replace(/\/$/, ""),
				);
			setWorkspaces(data.items);
			chooseWorkspace(selected?.id ?? workspace);
			setAdd(false);
			setDirectory("");
		} catch (e) {
			setWorkspaceError(e instanceof Error ? e.message : String(e));
		} finally {
			setWorkspaceBusy(false);
		}
	};
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
		<main className="shell" data-sidebar-collapsed={collapsed}>
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
					<span className="brand">ywtc</span>
				</div>
				<div
					className="header-controls"
					style={{
						display: "flex",
						flexDirection: "row",
						alignItems: "center",
						flexWrap: "nowrap",
						gap: 8,
					}}
				>
					<Hint
						content={t(
							"Справка: порядок работы и статусы",
							"Help: workflow and statuses",
						)}
					>
						<Button
							aria-label={t("Справка", "Help")}
							variant="ghost"
							size="icon-sm"
							onClick={() => setHelp(true)}
						>
							<CircleHelp aria-hidden="true" />
						</Button>
					</Hint>
					<Hint content={t("Проект на GitHub", "Project on GitHub")}>
						<Button asChild variant="ghost" size="icon-sm">
							<a
								href="https://github.com/iwonz/ywtc"
								target="_blank"
								rel="noopener noreferrer"
								aria-label={t("Проект на GitHub", "Project on GitHub")}
							>
								<GitBranch aria-hidden="true" />
							</a>
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
					<aside className="workspace-navigation" id="workspace-sidebar">
						<div className="sidebar-heading">
							{!collapsed && <span>{t("Пространство", "Workspace")}</span>}
							<Hint
								content={
									collapsed
										? t("Развернуть сайдбар", "Expand sidebar")
										: t("Свернуть сайдбар", "Collapse sidebar")
								}
							>
								<Button
									size="icon-sm"
									variant="ghost"
									aria-expanded={!collapsed}
									aria-controls="workspace-sidebar"
									aria-label={
										collapsed
											? t("Развернуть сайдбар", "Expand sidebar")
											: t("Свернуть сайдбар", "Collapse sidebar")
									}
									onClick={() => collapse(!collapsed)}
								>
									{collapsed ? (
										<PanelLeftOpen aria-hidden="true" />
									) : (
										<PanelLeftClose aria-hidden="true" />
									)}
								</Button>
							</Hint>
						</div>
						<div ref={picker} className="sidebar-workspace">
							{collapsed ? (
								<Hint
									content={
										workspaces.find((w) => w.id === workspace)?.path ??
										t("Выбрать пространство", "Choose workspace")
									}
								>
									<Button
										variant="ghost"
										size="icon-sm"
										aria-label={t("Выбрать пространство", "Choose workspace")}
										onClick={() => {
											collapse(false);
											setPickerFocus(true);
										}}
									>
										<FolderOpen aria-hidden="true" />
									</Button>
								</Hint>
							) : (
								<>
									<ChoiceField
										aria-label={t("Пространство", "Workspace")}
										value={workspace}
										options={workspaces.map((w) => ({
											value: w.id,
											label: w.path,
										}))}
										onValueChange={chooseWorkspace}
										description={t(
											"Локальная папка с конфигурацией и результатами.",
											"Local folder with configuration and results.",
										)}
									/>
									<Button
										variant="ghost"
										size="sm"
										onClick={() => {
											setWorkspaceError("");
											setAdd(true);
										}}
										aria-label={t(
											"Подключить пространство",
											"Connect workspace",
										)}
									>
										<Plus aria-hidden="true" />
										{t("Подключить или создать", "Connect or create")}
									</Button>
								</>
							)}
						</div>
						<nav
							className="work-area-nav"
							aria-label={t("Рабочие разделы", "Work areas")}
						>
							{navigation.map(({ id, label, icon: Icon, hint }) => (
								<Hint key={id} content={collapsed ? `${label}: ${hint}` : hint}>
									<Button
										className="nav-link"
										aria-label={label}
										aria-current={tab === id ? "page" : undefined}
										onClick={() => setTab(id)}
										variant="ghost"
									>
										<Icon size={18} strokeWidth={1.75} aria-hidden="true" />
										<span className={collapsed ? "sr-only" : undefined}>
											{label}
										</span>
									</Button>
								</Hint>
							))}
						</nav>
						<Hint content={t("Новая миграция", "New migration")}>
							<Button
								disabled={!workspace}
								className="create-migration"
								aria-label={t("Новая миграция", "New migration")}
								onClick={() => setNewMigration(true)}
							>
								<Plus aria-hidden="true" />
								<span className={collapsed ? "sr-only" : undefined}>
									{t("Новая миграция", "New migration")}
								</span>
							</Button>
						</Hint>
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
					"Подключить или создать пространство",
					"Connect or create workspace",
				)}
				open={add}
				onDismiss={() => setAdd(false)}
			>
				<InputField
					label={t("Полный путь", "Absolute path")}
					value={directory}
					required
					description={t(
						"Укажите папку на этом компьютере. Подключение использует её данные; создание добавит отсутствующую папку, не миграцию.",
						"Choose a folder on this computer. Connecting uses its data; creating adds a missing folder, not a migration.",
					)}
					onChange={(e) => setDirectory(e.target.value)}
				/>
				{workspaceError && <Notice tone="red">{workspaceError}</Notice>}
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
						disabled={!directory.trim() || workspaceBusy}
						onClick={() => register(false)}
					>
						{t("Подключить", "Connect")}
					</Button>
					<Button
						disabled={!directory.trim() || workspaceBusy}
						onClick={() => register(true)}
						variant="secondary"
					>
						{t("Создать", "Create")}
					</Button>
				</div>
			</AppDialog>
			<OperatorHelp open={help} onDismiss={() => setHelp(false)} t={t} />
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
