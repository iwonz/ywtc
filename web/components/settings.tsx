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
import { useCallback, useEffect, useState } from "react";
import { Pencil, Plug, Save, ShieldCheck, Trash2 } from "lucide-react";
import { CollectionState, useCollection } from "./collection-state";
import { EmptyState } from "./empty-state";
import { api, type Translate } from "./api";
import { RequiredNote } from "./operator-fields";
const limitHelp: Record<string, [string, string, string, string]> = {
	readConcurrency: [
		"Параллельные чтения",
		"Concurrent reads",
		"Предел одновременных API-чтений этого профиля.",
		"Maximum simultaneous API reads for this profile.",
	],
	writeConcurrency: [
		"Параллельные записи",
		"Concurrent writes",
		"Предел одновременных API-записей этого профиля.",
		"Maximum simultaneous API writes for this profile.",
	],
	downloadConcurrency: [
		"Параллельные скачивания",
		"Concurrent downloads",
		"Сколько файлов можно скачивать одновременно.",
		"How many files may download simultaneously.",
	],
	uploadConcurrency: [
		"Параллельные загрузки",
		"Concurrent uploads",
		"Сколько файлов можно загружать одновременно.",
		"How many files may upload simultaneously.",
	],
	requestsPerSecond: [
		"Запросов в секунду",
		"Requests per second",
		"Ограничение темпа сетевых запросов этого профиля.",
		"Request-rate limit for this profile.",
	],
	burst: [
		"Пиковый запас запросов",
		"Request burst",
		"Ограничение кратковременного пика; обычный темп задаётся отдельно.",
		"Limits short request bursts; the sustained rate is configured separately.",
	],
};
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
		[busy, setBusy] = useState(false),
		[profileError, setProfileError] = useState("");
	const recovering = settings?.validation?.valid === false;
	const listing = useCollection(
		useCallback(() => api(`${root}/settings`), [root]),
	);
	useEffect(() => {
		setSettings(listing.data);
		setEdit(undefined);
		setDirty(false);
		setConfirmed(false);
	}, [listing.data]);
	const addProfile = () => {
		setProfileError("");
		setPrevious("");
		setName("");
		setEdit(fresh("confluence"));
	};
	const hasConnections = Object.keys(settings?.connections ?? {}).length > 0;
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
			setProfileError(error instanceof Error ? error.message : String(error));
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
				{hasConnections && (
					<Button
						disabled={!settings || busy}
						onClick={addProfile}
						leadingIcon={<Plug />}
					>
						{t("Добавить подключение", "Add connection")}
					</Button>
				)}
			</div>
			<p className="workflow-hint">
				{t(
					"Сначала настройте профили source и remote destination. Сохранение конфигурации не проверяет права на каждую страницу; «Проверить доступ» выполняет read-only проверку подключения.",
					"Configure source and remote destination profiles first. Saving configuration does not prove access to every page; Probe access performs a read-only connection check.",
				)}
			</p>
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
			<CollectionState {...listing} t={t} />
			{listing.status === "ready" && settings && !hasConnections && (
				<EmptyState
					kind="connections"
					title={t("Подключите ваши системы", "Connect your systems")}
					description={t(
						"Добавьте профиль источника и назначения. Токены хранятся локально; проверить доступ можно до первой миграции.",
						"Add source and destination profiles. Tokens stay local, and you can probe access before your first migration.",
					)}
				>
					<Button leadingIcon={<Plug />} onClick={addProfile}>
						{t("Добавить подключение", "Add connection")}
					</Button>
				</EmptyState>
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
							leadingIcon={<Pencil />}
							onClick={() => {
								setProfileError("");
								setName(key);
								setPrevious(key);
								setEdit(structuredClone(value));
							}}
							variant="ghost"
						>
							{t("Изменить", "Edit")}
						</Button>
						<Button
							leadingIcon={<ShieldCheck />}
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
								leadingIcon={<Trash2 />}
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
					<h3 className="section-title">
						{t("Настройки пространства", "Workspace settings")}
					</h3>
					<p className="workflow-hint">
						{t(
							"Необязательные defaults и политики для будущих операций. Сохранение здесь само по себе не изменяет destination.",
							"Optional defaults and policies for future operations. Saving here does not itself change destination data.",
						)}
					</p>
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
							description={t(
								"Целое число 1–64; сеть дополнительно ограничена лимитами профилей.",
								"An integer from 1 to 64; profile network limits also apply.",
							)}
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
							description={t(
								"Таймаут одного сетевого запроса, 1000–300000 мс.",
								"Timeout per network request, 1000–300000 ms.",
							)}
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
								description={t(
									"off — сохранить исходное представление; mapping — применить готовые решения из файла.",
									"off preserves the source representation; mapping applies explicit file decisions.",
								)}
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
									required
									description={t(
										"Путь относительно ywtc.config.yaml; абсолютный путь и ~ также поддерживаются.",
										"Relative to ywtc.config.yaml; absolute paths and ~ are also supported.",
									)}
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
						leadingIcon={<Save />}
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
						<RequiredNote t={t} />
						{profileError && <Notice tone="red">{profileError}</Notice>}
						<InputField
							label={t("Имя профиля", "Profile name")}
							description={t(
								"Латинские буквы, цифры, точка, _ или -. Первым — буква/цифра. Имя используется в CLI и задачах.",
								"Lowercase letters, digits, dot, _ or -. Start with a letter/digit. Used by CLI and jobs.",
							)}
							disabled={Boolean(previous)}
							value={name}
							onChange={(e) => setName(e.target.value)}
							required
						/>
						<ChoiceField
							label={t("Система", "Provider")}
							required
							value={edit.type}
							options={["yandex-wiki", "confluence"]}
							onValueChange={(e) => setEdit(fresh(e))}
						/>
						{edit.type === "yandex-wiki" ? (
							<>
								<InputField
									label="API URL"
									required
									help={t(
										"Базовый URL Public API, включая его version path. Это не адрес страницы в браузере.",
										"Public API base URL including its version path, not a browser page URL.",
									)}
									value={edit.apiUrl}
									onChange={(e) => patch("apiUrl", e.target.value)}
								/>
								<InputField
									label="Web URL"
									required
									help={t(
										"Базовый адрес Wiki в браузере; используется для locators и исходных ссылок.",
										"Browser Wiki base URL, used for locators and original links.",
									)}
									value={edit.webUrl}
									onChange={(e) => patch("webUrl", e.target.value)}
								/>
								<ChoiceField
									label={t("Тип организации", "Organization type")}
									required
									description={t(
										"yandex360 — организация Yandex 360; cloud — организация Yandex Cloud.",
										"yandex360 selects a Yandex 360 organization; cloud selects a Yandex Cloud organization.",
									)}
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
									required
									description={t(
										"ID организации, к которой имеет доступ токен.",
										"Organization ID accessible to the token.",
									)}
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
									required
									description={t(
										"Тип переданного токена: OAuth или IAM.",
										"The supplied token type: OAuth or IAM.",
									)}
									value={edit.authType}
									options={["oauth", "iam"]}
									onValueChange={(e) => patch("authType", e)}
								/>
							</>
						) : (
							<>
								<ChoiceField
									label="Deployment"
									required
									description={t(
										"Data Center использует PAT; Cloud — email и API token.",
										"Data Center uses PAT; Cloud uses email and an API token.",
									)}
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
									required
									help={t(
										"Базовый URL Confluence, включая context path при его наличии. Не URL отдельной страницы.",
										"Confluence base URL, including any context path, not an individual page URL.",
									)}
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
										description={t(
											"Нужен для Cloud API. Пустое поле сохраняет имеющийся email на сервере.",
											"Required for Cloud API calls. Empty keeps any existing email on the server.",
										)}
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
							description={t(
								"Нужен для API-операций, но может быть заполнен позже. Сохранённый токен не возвращается в браузер; пусто — сохранить его.",
								"Needed for API operations, but may be supplied later. Stored tokens are not returned to the browser; empty retains the existing token.",
							)}
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
									label={t(limitHelp[key]![0], limitHelp[key]![1])}
									help={t(limitHelp[key]![2], limitHelp[key]![3])}
									description={t(
										"Необязательно: пусто использует default профиля.",
										"Optional: empty uses the profile default.",
									)}
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
							leadingIcon={<Save />}
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
