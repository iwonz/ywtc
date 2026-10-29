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
import { Languages, Monitor, Moon, Plus, Sun } from "lucide-react";
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
				<div
					style={{
						display: "flex",
						flexDirection: "row",
						alignItems: "center",
						flexWrap: "wrap",
						gap: 24,
					}}
				>
					<span className="brand">
						ywtc<span style={{ color: "var(--primary)" }}>_</span>
					</span>
					<span className="muted">
						{t("Центр миграций", "Migration control center")}
					</span>
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
				<>
					<div
						className="nav"
						style={{
							display: "flex",
							flexDirection: "row",
							gap: 8,
							alignItems: "center",
							flexWrap: "wrap",
							justifyContent: "space-between",
						}}
					>
						<div
							style={{
								display: "flex",
								flexDirection: "row",
								alignItems: "center",
								flexWrap: "wrap",
								gap: 8,
							}}
						>
							{[
								["reports", t("Миграции и отчёты", "Migrations & reports")],
								["jobs", t("Задачи", "Tasks")],
								["decisions", "Decisions"],
								["sync", t("Синхронизация", "Synchronization")],
								["settings", t("Подключения", "Connections")],
							].map(([id, label]) => (
								<Button
									key={id}
									onClick={() => setTab(id)}
									variant={tab === id ? "secondary" : "ghost"}
								>
									{label}
								</Button>
							))}
						</div>
						<Button onClick={() => setNewMigration(true)}>
							{<Plus size={16} />}
							{t("Новая миграция", "New migration")}
						</Button>
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
				</>
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
