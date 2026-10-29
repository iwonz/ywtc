"use client";
import { Button } from "../../ui/components/button";
import {
	Notice,
	NumberField,
	InputField,
	ChoiceField,
	PasswordField,
	AppDialog,
	CheckboxField,
} from "../../ui/fields";
import { useEffect, useState } from "react";
import { api, type Translate } from "./api";
const fresh = (type: string) =>
	type === "yandex-wiki"
		? {
				type,
				apiUrl: "https://api.wiki.yandex.net/v1",
				webUrl: "https://wiki.example.com",
				authType: "oauth",
				organization: { type: "yandex360", id: "" },
			}
		: { type, deployment: "data-center", baseUrl: "", authType: "pat" };
export function Settings({
	root,
	t,
	onError,
}: {
	root: string;
	t: Translate;
	onError: (e: unknown) => void;
}) {
	const [settings, setSettings] = useState<any>(),
		[edit, setEdit] = useState<any>(),
		[name, setName] = useState(""),
		[previous, setPrevious] = useState(""),
		[probe, setProbe] = useState<any>(),
		[dirty, setDirty] = useState(false),
		[confirmed, setConfirmed] = useState(false),
		[busy, setBusy] = useState(false);
	const recovering = settings?.validation?.valid === false;
	useEffect(() => {
		setSettings(undefined);
		setEdit(undefined);
		setDirty(false);
		setConfirmed(false);
		api(`${root}/settings`).then(setSettings).catch(onError);
	}, [root, onError]);
	useEffect(() => {
		if (!dirty) return;
		const warn = (event: BeforeUnloadEvent) => event.preventDefault();
		window.addEventListener("beforeunload", warn);
		return () => window.removeEventListener("beforeunload", warn);
	}, [dirty]);
	const changeSettings = (value: any) => {
		setSettings(value);
		setDirty(true);
		setConfirmed(false);
	};
	const apply = async (connections = settings.connections) => {
		setBusy(true);
		try {
			const value = await api(`${root}/settings`, "PUT", {
				...settings,
				connections,
				repairConfirmed: confirmed,
			});
			setSettings(value);
			setEdit(undefined);
			setDirty(false);
			setConfirmed(false);
		} catch (error) {
			onError(error);
		} finally {
			setBusy(false);
		}
	};
	const patch = (key: string, value: unknown) =>
		setEdit({ ...edit, [key]: value });
	const save = async () => {
		try {
			const connections = { ...settings.connections };
			if (previous && previous !== name) delete connections[previous];
			connections[name] = edit;
			if (recovering) {
				changeSettings({ ...settings, connections });
				setEdit(undefined);
			} else await apply(connections);
		} catch (e) {
			onError(e);
		}
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
					{t("Подключения и настройки", "Connections & settings")}
				</div>
				<Button
					disabled={!settings || busy}
					onClick={() => {
						setPrevious("");
						setName("");
						setEdit(fresh("confluence"));
					}}
				>
					{t("Добавить подключение", "Add connection")}
				</Button>
			</div>
			{recovering && (
				<Notice tone="orange" style={{ marginTop: 16 }}>
					<strong>{t("Исправьте конфигурацию", "Repair configuration")}</strong>
					<p>
						{t(
							"Изменения профилей остаются в черновике до применения всей конфигурации. Запуск операций и проверка доступа пока недоступны.",
							"Profile changes stay in a draft until the entire configuration is applied. Operations and access probes are unavailable meanwhile.",
						)}
					</p>
					<p>
						{t("Поля с ошибками", "Invalid fields")}:{" "}
						{settings.validation.fields.join(", ")}
					</p>
					<p>
						{settings.validation.readable
							? t(
									"Сохранённые токены и email останутся на сервере; пустые поля сохраняют текущие значения.",
									"Stored tokens and email stay on the server; empty fields retain current values.",
								)
							: t(
									"YAML не читается как конфигурация. Введите подключения и секреты заново.",
									"YAML cannot be read as configuration. Re-enter connections and credentials.",
								)}
					</p>
					{settings.validation.requiresConfirmation && (
						<p>
							{t(
								"Перед заменой сохранится точная приватная копия исходного YAML. Неподдерживаемые поля и комментарии останутся в копии, но не в исправленном файле.",
								"An exact private copy of the original YAML will be saved before replacement. Unsupported fields and comments remain in the backup, not the repaired file.",
							)}
						</p>
					)}
				</Notice>
			)}
			{settings?.backupPath && (
				<Notice tone="teal" style={{ marginTop: 16 }}>
					{t(
						"Конфигурация исправлена. Резервная копия",
						"Configuration repaired. Backup",
					)}
					: {settings.backupPath}
				</Notice>
			)}
			{Object.entries(settings?.connections ?? {}).map(
				([key, value]: [string, any]) => (
					<div className="row" key={key}>
						<strong>{key}</strong>
						<span className="grow muted">
							{value.type} · {value.webUrl ?? value.baseUrl}
						</span>
						<span>
							{value.hasToken
								? t("Токен сохранён", "Token stored")
								: t("Нет токена", "No token")}
						</span>
						<Button
							onClick={() => {
								setName(key);
								setPrevious(key);
								setEdit(structuredClone(value));
							}}
							variant="ghost"
						>
							{t("Изменить", "Edit")}
						</Button>
						<Button
							disabled={recovering || busy}
							onClick={() =>
								api(`${root}/settings/probe`, "POST", { profile: key })
									.then(setProbe)
									.catch(onError)
							}
							variant="secondary"
						>
							{t("Проверить доступ", "Probe access")}
						</Button>
						{recovering && (
							<Button
								variant="ghost"
								onClick={() => {
									const connections = { ...settings.connections };
									delete connections[key];
									changeSettings({ ...settings, connections });
								}}
							>
								{t("Убрать из черновика", "Remove from draft")}
							</Button>
						)}
					</div>
				),
			)}
			{probe && (
				<Notice
					tone={probe.warnings?.length ? "orange" : "teal"}
					onDismiss={() => setProbe(undefined)}
					style={{ marginTop: 16 }}
				>
					{probe.product} {probe.version}
					{probe.warnings?.map((w: string) => (
						<p key={w}>{w}</p>
					))}
				</Notice>
			)}
			{settings && (
				<section className="section">
					<div
						style={{
							display: "flex",
							flexDirection: "row",
							gap: 8,
							flexWrap: "wrap",
							alignItems: "flex-end",
						}}
					>
						<NumberField
							label={t("Параллельность по умолчанию", "Default concurrency")}
							min={1}
							max={64}
							value={settings.defaults?.concurrency ?? 4}
							onValueChange={(v) =>
								changeSettings({
									...settings,
									defaults: { ...settings.defaults, concurrency: Number(v) },
								})
							}
						/>
						<NumberField
							label={t("Timeout (ms)", "Timeout (ms)")}
							min={1000}
							max={300000}
							value={settings.defaults?.timeoutMs ?? 30000}
							onValueChange={(v) =>
								changeSettings({
									...settings,
									defaults: { ...settings.defaults, timeoutMs: Number(v) },
								})
							}
						/>
					</div>
					{["mentions", "hashtags"].map((kind) => (
						<div className="row" key={kind}>
							<ChoiceField
								label={kind === "mentions" ? "Mentions" : "Hashtags"}
								value={settings[kind]?.mode ?? "off"}
								options={["off", "mapping"]}
								onValueChange={(mode) =>
									changeSettings({
										...settings,
										[kind]:
											mode === "mapping" ? { mode, mappingFile: "" } : { mode },
									})
								}
							/>
							{settings[kind]?.mode === "mapping" && (
								<InputField
									label={`${kind} · mappingFile`}
									value={settings[kind].mappingFile}
									onChange={(e) =>
										changeSettings({
											...settings,
											[kind]: {
												...settings[kind],
												mappingFile: e.target.value,
											},
										})
									}
								/>
							)}
						</div>
					))}
					{recovering && settings.validation.requiresConfirmation && (
						<CheckboxField
							label={t(
								"Подтверждаю исправление с приватной резервной копией",
								"Confirm repair with a private backup",
							)}
							checked={confirmed}
							onCheckedChange={setConfirmed}
						/>
					)}
					<Button
						style={{ marginTop: 16 }}
						disabled={
							busy ||
							(recovering &&
								settings.validation.requiresConfirmation &&
								!confirmed)
						}
						onClick={() => apply()}
						variant="secondary"
					>
						{recovering
							? t("Применить исправление", "Apply repair")
							: t("Сохранить настройки", "Save settings")}
					</Button>
				</section>
			)}
			<AppDialog
				title={t("Профиль подключения", "Connection profile")}
				open={Boolean(edit)}
				onDismiss={() => setEdit(undefined)}
				width="48rem"
			>
				{edit && (
					<div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
						<InputField
							label={t("Имя профиля", "Profile name")}
							disabled={Boolean(previous)}
							value={name}
							onChange={(e) => setName(e.target.value)}
							required
						/>
						<ChoiceField
							label={t("Система", "Provider")}
							value={edit.type}
							options={["yandex-wiki", "confluence"]}
							onValueChange={(e) => setEdit(fresh(e))}
						/>
						{edit.type === "yandex-wiki" ? (
							<>
								<InputField
									label="API URL"
									value={edit.apiUrl}
									onChange={(e) => patch("apiUrl", e.target.value)}
								/>
								<InputField
									label="Web URL"
									value={edit.webUrl}
									onChange={(e) => patch("webUrl", e.target.value)}
								/>
								<ChoiceField
									label={t("Тип организации", "Organization type")}
									value={edit.organization.type}
									options={["yandex360", "cloud"]}
									onValueChange={(e) =>
										patch("organization", {
											...edit.organization,
											type: e,
										})
									}
								/>
								<InputField
									label={t("ID организации", "Organization ID")}
									value={edit.organization.id}
									onChange={(e) =>
										patch("organization", {
											...edit.organization,
											id: e.target.value,
										})
									}
								/>
								<ChoiceField
									label="Auth"
									value={edit.authType}
									options={["oauth", "iam"]}
									onValueChange={(e) => patch("authType", e)}
								/>
							</>
						) : (
							<>
								<ChoiceField
									label="Deployment"
									value={edit.deployment}
									options={["data-center", "cloud"]}
									onValueChange={(e) =>
										setEdit({
											...edit,
											deployment: e,
											authType: e === "cloud" ? "api-token" : "pat",
										})
									}
								/>
								<InputField
									label="Base URL"
									value={edit.baseUrl}
									onChange={(e) => patch("baseUrl", e.target.value)}
								/>
								{edit.deployment === "cloud" && (
									<PasswordField
										label={t(
											"Email · пусто = сохранить текущий",
											"Email · empty keeps current",
										)}
										autoComplete="off"
										value={edit.email ?? ""}
										onChange={(e) => patch("email", e.target.value)}
									/>
								)}
							</>
						)}
						<PasswordField
							label={t(
								"Токен · пусто = сохранить текущий",
								"Token · empty keeps current",
							)}
							autoComplete="new-password"
							value={edit.token ?? ""}
							onChange={(e) => patch("token", e.target.value)}
						/>
						<details>
							<summary>{t("Лимиты запросов", "Request limits")}</summary>
							{(
								[
									"readConcurrency",
									"writeConcurrency",
									"downloadConcurrency",
									"uploadConcurrency",
									"requestsPerSecond",
									"burst",
								] as const
							).map((key) => (
								<NumberField
									key={key}
									label={key}
									value={edit.limits?.[key] ?? ""}
									min={1}
									max={
										key === "readConcurrency"
											? 64
											: key.endsWith("Concurrency")
												? 32
												: 1000
									}
									onValueChange={(v) => {
										const limits = { ...edit.limits };
										if (v === "") delete limits[key];
										else limits[key] = Number(v);
										patch("limits", limits);
									}}
								/>
							))}
						</details>
						<Button
							disabled={busy || !/^[a-z0-9][a-z0-9._-]*$/.test(name)}
							onClick={save}
						>
							{recovering
								? t("В черновик", "Stage profile")
								: t("Сохранить профиль", "Save profile")}
						</Button>
					</div>
				)}
			</AppDialog>
		</>
	);
}
