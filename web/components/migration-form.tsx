"use client";
import { Play, ScanSearch, LoaderCircle } from "lucide-react";
import { useEffect, useState } from "react";
import {
	Notice,
	ChoiceField,
	InputField,
	CheckboxField,
	NumberField,
} from "../../ui/fields";
import { Button } from "../../ui/components/button";
import { api, type Translate } from "./api";
import {
	FormSection,
	RequiredNote,
	ScopeField,
	SourceStatusField,
} from "./operator-fields";

export function MigrationForm({
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
	const [settings, setSettings] = useState<any>();
	const [sourceProfile, setSourceProfile] = useState(""),
		[destinationProfile, setDestinationProfile] = useState("");
	const [destinationType, setDestinationType] = useState("confluence"),
		[source, setSource] = useState(""),
		[destination, setDestination] = useState("");
	const [scope, setScope] = useState("subtree"),
		[sourceStatus, setSourceStatus] = useState("all");
	const [comments, setComments] = useState(true),
		[archive, setArchive] = useState(false);
	const [live, setLive] = useState(false),
		[confirmed, setConfirmed] = useState(false),
		[busy, setBusy] = useState(false);
	const [concurrency, setConcurrency] = useState<number | string>(""),
		[stateFilename, setStateFilename] = useState("");
	const [fresh, setFresh] = useState(false),
		[rewrite, setRewrite] = useState(false),
		[error, setError] = useState("");
	useEffect(() => {
		api(`${root}/settings`)
			.then((value) => {
				setSettings(value);
				setSourceProfile(
					Object.keys(value.connections).find(
						(n) => value.connections[n].type === "yandex-wiki",
					) ??
						Object.keys(value.connections)[0] ??
						"",
				);
				setDestinationProfile(
					Object.keys(value.connections).find(
						(n) => value.connections[n].type === "confluence",
					) ?? "",
				);
			})
			.catch((e) => {
				setError(e instanceof Error ? e.message : String(e));
				onError(e);
			});
	}, [root, onError]);
	const requestKey = JSON.stringify([
		sourceProfile,
		destinationProfile,
		destinationType,
		source,
		destination,
		scope,
		sourceStatus,
		comments,
		archive,
		concurrency,
		stateFilename,
		fresh,
		rewrite,
		live,
	]);
	useEffect(() => {
		if (requestKey) {
			setConfirmed(false);
			setError("");
		}
	}, [requestKey]);
	const profiles = Object.entries(settings?.connections ?? {}) as [
		string,
		any,
	][];
	const file = ["markdown", "html"].includes(destinationType);
	const invalidConcurrency =
		concurrency !== "" &&
		(!Number.isInteger(Number(concurrency)) ||
			Number(concurrency) < 1 ||
			Number(concurrency) > 64);
	const missing = [
		!sourceProfile ? t("профиль источника", "source profile") : "",
		!source.trim() ? t("источник", "source") : "",
		!file && !destinationProfile
			? t("профиль назначения", "destination profile")
			: "",
		!destination.trim() ? t("назначение", "destination") : "",
	].filter(Boolean);
	const ready =
		Boolean(settings) &&
		settings.validation?.valid !== false &&
		!missing.length &&
		!invalidConcurrency &&
		(!live || confirmed) &&
		!busy;
	async function submit() {
		if (!ready) return;
		setBusy(true);
		setError("");
		try {
			const request = {
				kind: "migrate",
				source: source.trim(),
				sourceProfile,
				destination: destination.trim(),
				...(!file ? { destinationProfile } : { format: destinationType }),
				scope,
				sourceStatus,
				comments,
				archive: file && archive,
				dryRun: !live,
				...(concurrency !== "" ? { concurrency: Number(concurrency) } : {}),
				...(stateFilename.trim()
					? { stateFilename: stateFilename.trim() }
					: {}),
				...(fresh ? { fresh: true } : {}),
				...(rewrite && !file ? { rewrite: true } : {}),
			};
			const job = await api(`${root}/jobs`, "POST", {
				request,
				confirmed: live && confirmed,
				...(file ? { exportRoot: destination.trim() } : {}),
			});
			onJob(job.id);
		} catch (e) {
			setError(e instanceof Error ? e.message : String(e));
		} finally {
			setBusy(false);
		}
	}
	return (
		<form
			className="operation-form"
			onSubmit={(e) => {
				e.preventDefault();
				void submit();
			}}
		>
			<RequiredNote t={t} />
			{error && <Notice tone="red">{error}</Notice>}
			{settings?.validation?.valid === false && (
				<Notice tone="orange">
					{t(
						"Исправьте конфигурацию в разделе «Подключения» перед запуском.",
						"Repair configuration in Connections before starting.",
					)}
				</Notice>
			)}
			{settings && !profiles.length && (
				<Notice tone="orange">
					{t(
						"Сначала создайте подключения в настройках.",
						"Create connections in settings first.",
					)}
				</Notice>
			)}
			<FormSection
				title={t("1. Источник", "1. Source")}
				description={t(
					"Откуда читать страницы. Доступ ограничен правами выбранного токена.",
					"Where pages are read from. Access is limited by the selected token's permissions.",
				)}
			>
				<ChoiceField
					required
					label={t("Профиль источника", "Source profile")}
					value={sourceProfile}
					options={profiles.map(([name, p]) => ({
						value: name,
						label: `${name} · ${p.type}`,
					}))}
					onValueChange={setSourceProfile}
					help={t(
						"Профиль задаёт API, организацию/instance и токен. Его параметры редактируются в «Подключениях».",
						"A profile supplies the API, organization/instance and token. Edit it in Connections.",
					)}
				/>
				<InputField
					required
					label={t(
						"Источник · URL / ID / slug / space URL",
						"Source · URL / ID / slug / space URL",
					)}
					value={source}
					onChange={(e) => setSource(e.target.value)}
					description={t(
						"Страница, личный раздел Yandex Wiki или URL пространства Confluence.",
						"A page, Yandex Wiki personal section or Confluence space URL.",
					)}
				/>
			</FormSection>
			<FormSection
				title={t("2. Назначение", "2. Destination")}
				description={t(
					"Куда переносить. Для удалённой системы нужна родительская страница; для экспорта — каталог.",
					"Where data goes. Remote systems require a parent page; file exports require a directory.",
				)}
			>
				<ChoiceField
					required
					label={t("Назначение", "Destination")}
					value={destinationType}
					options={[
						{ value: "confluence", label: "Confluence" },
						{ value: "yandex-wiki", label: "Yandex Wiki" },
						{ value: "markdown", label: "Markdown" },
						{ value: "html", label: "HTML" },
					]}
					onValueChange={(value) => {
						setDestinationType(value);
						setArchive(false);
						setRewrite(false);
						setDestinationProfile(
							profiles.find(([, p]) => p.type === value)?.[0] ?? "",
						);
					}}
				/>
				{!file && (
					<ChoiceField
						required
						label={t("Профиль назначения", "Destination profile")}
						value={destinationProfile}
						options={profiles
							.filter(([, p]) => p.type === destinationType)
							.map(([name]) => name)}
						onValueChange={setDestinationProfile}
					/>
				)}
				<InputField
					required
					label={
						file
							? t("Каталог экспорта", "Export directory")
							: t("Родительская страница назначения", "Destination parent page")
					}
					value={destination}
					onChange={(e) => setDestination(e.target.value)}
					description={
						file
							? t(
									"Новый/пустой каталог либо существующий управляемый экспорт ywtc. Непустой чужой каталог не перезаписывается.",
									"A new/empty directory or an existing ywtc-managed export. Unmanaged nonempty directories are protected.",
								)
							: t(
									"URL или ID страницы-родителя в выбранной системе.",
									"URL or ID of the parent page in the selected system.",
								)
					}
				/>
			</FormSection>
			<FormSection title={t("3. Состав переноса", "3. Transfer scope")}>
				<ScopeField value={scope} onValueChange={setScope} t={t} />
				<SourceStatusField
					value={sourceStatus}
					onValueChange={setSourceStatus}
					t={t}
				/>
				<CheckboxField
					label={t("Переносить комментарии", "Include comments")}
					checked={comments}
					onCheckedChange={setComments}
					description={t(
						"Архив веток и ответов на каждой странице. Отключение исключает чтение и запись комментариев.",
						"Archive threads and replies per page. Disabling skips all comment reads and writes.",
					)}
				/>
				{file && (
					<CheckboxField
						label={t("Создать ZIP", "Create ZIP")}
						checked={archive}
						onCheckedChange={setArchive}
						description={t(
							"Дополнительный архив готового файлового экспорта.",
							"Create an additional archive of the finished file export.",
						)}
					/>
				)}
			</FormSection>
			<details className="advanced-options">
				<summary>
					{t(
						"Дополнительные параметры · необязательно",
						"Advanced options · optional",
					)}
				</summary>
				<div className="form-fields">
					<NumberField
						label={t("Параллельность", "Concurrency")}
						placeholder={String(settings?.defaults?.concurrency ?? 4)}
						value={concurrency}
						min={1}
						max={64}
						step={1}
						onValueChange={setConcurrency}
						description={t(
							"Оставьте пустым для значения из конфигурации. Допустимо целое число 1–64.",
							"Leave empty to use configuration. Must be an integer from 1 to 64.",
						)}
						help={t(
							"Ограничивает параллельную обработку. Provider rate limits и отдельные сетевые лимиты продолжают действовать.",
							"Limits concurrent processing. Provider rate limits and separate network limits still apply.",
						)}
						error={
							invalidConcurrency
								? t(
										"Введите целое число 1–64.",
										"Enter an integer from 1 to 64.",
									)
								: undefined
						}
					/>
					<InputField
						label={t(
							"State · путь внутри пространства (необязательно)",
							"State · path inside workspace (optional)",
						)}
						value={stateFilename}
						onChange={(e) => setStateFilename(e.target.value)}
						description={t(
							"Обычно state выбирается автоматически. Явный путь должен оставаться внутри пространства.",
							"State is normally selected automatically. An explicit path must remain inside this workspace.",
						)}
					/>
					<CheckboxField
						label={t(
							"Fresh · новые mappings; возможны дубликаты",
							"Fresh · new mappings; may create duplicates",
						)}
						checked={fresh}
						onCheckedChange={(v) => {
							setFresh(v);
							if (v) setRewrite(false);
						}}
						description={t(
							"Игнорирует прежние mappings; существующий live-state сохраняется как backup. Для обычного продолжения не требуется.",
							"Ignores prior mappings and backs up existing live state. Not required for ordinary continuation.",
						)}
					/>
					{!file && (
						<CheckboxField
							label={t(
								"Rewrite · только существующие IDs, без создания страниц",
								"Rewrite · existing IDs only; no new pages",
							)}
							checked={rewrite}
							onCheckedChange={(v) => {
								setRewrite(v);
								if (v) setFresh(false);
							}}
							description={t(
								"Заново собирает содержимое по существующим mappings. Несовместим с Fresh и файловым экспортом.",
								"Rebuilds content using existing mappings. Incompatible with Fresh and file exports.",
							)}
						/>
					)}
				</div>
			</details>
			<FormSection
				title={t("4. Проверка и запуск", "4. Review and start")}
				description={t(
					"По умолчанию dry-run: анализ и отчёт без записи в destination. После него live можно подтвердить в задаче.",
					"Defaults to dry-run: analysis and a report without destination writes. Live can be confirmed in the resulting task.",
				)}
			>
				<CheckboxField
					label={t(
						"Live · записать в destination",
						"Live · write to destination",
					)}
					checked={live}
					onCheckedChange={(v) => {
						setLive(v);
						setConfirmed(false);
					}}
				/>
				{live && (
					<>
						<Notice tone="orange">
							{t(
								"Source заменит содержимое сопоставленных страниц. Сначала рекомендуется dry-run.",
								"Source replaces mapped destination content. A dry-run is recommended first.",
							)}
						</Notice>
						<CheckboxField
							label={t(
								"Подтверждаю запись выбранной миграции",
								"I confirm this migration will write destination data",
							)}
							checked={confirmed}
							onCheckedChange={setConfirmed}
						/>
					</>
				)}
				{missing.length > 0 && (
					<p className="ui-field-hint">
						{t("Для запуска заполните: ", "To start, complete: ")}
						{missing.join(", ")}.
					</p>
				)}
				<Button
					leadingIcon={
						busy ? (
							<LoaderCircle className="animate-spin" />
						) : live ? (
							<Play />
						) : (
							<ScanSearch />
						)
					}
					type="submit"
					disabled={!ready}
				>
					{live
						? t("Запустить перенос", "Start migration")
						: t("Сначала dry-run", "Start dry-run")}
				</Button>
			</FormSection>
		</form>
	);
}
