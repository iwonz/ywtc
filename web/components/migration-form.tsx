"use client";
import {
	Notice,
	ChoiceField,
	InputField,
	CheckboxField,
	NumberField,
	Spinner,
} from "../../ui/fields";
import { Button } from "../../ui/components/button";
import { useEffect, useState } from "react";
import { api, type Translate } from "./api";
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
	const [settings, setSettings] = useState<any>(),
		[sourceProfile, setSourceProfile] = useState(""),
		[destinationProfile, setDestinationProfile] = useState(""),
		[destinationType, setDestinationType] = useState("confluence"),
		[source, setSource] = useState(""),
		[destination, setDestination] = useState(""),
		[scope, setScope] = useState("subtree"),
		[sourceStatus, setSourceStatus] = useState("all"),
		[comments, setComments] = useState(true),
		[archive, setArchive] = useState(false),
		[live, setLive] = useState(false),
		[confirmed, setConfirmed] = useState(false),
		[busy, setBusy] = useState(false);
	const [concurrency, setConcurrency] = useState<number | string>("");
	const [stateFilename, setStateFilename] = useState("");
	const [fresh, setFresh] = useState(false),
		[rewrite, setRewrite] = useState(false);
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
			.catch(onError);
	}, [root, onError]);
	const profiles = Object.entries(settings?.connections ?? {}) as [
		string,
		any,
	][];
	const file = ["markdown", "html"].includes(destinationType);
	async function submit() {
		setBusy(true);
		try {
			const request = {
				kind: "migrate",
				source,
				sourceProfile,
				destination,
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
				...(file ? { exportRoot: destination } : {}),
			});
			onJob(job.id);
		} catch (error) {
			onError(error);
		} finally {
			setBusy(false);
		}
	}
	return (
		<div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
			{settings?.validation?.valid === false && <Notice tone="orange">{t("Исправьте конфигурацию в разделе «Подключения» перед запуском.", "Repair configuration in Connections before starting.")}</Notice>}
			{!profiles.length && (
				<Notice tone={"orange"}>
					{t(
						"Сначала создайте подключения в настройках.",
						"Create connections in settings first.",
					)}
				</Notice>
			)}
			<ChoiceField
				label={t("Профиль источника", "Source profile")}
				value={sourceProfile}
				options={profiles.map(([name, p]) => ({
					value: name,
					label: `${name} · ${p.type}`,
				}))}
				onValueChange={(v) => setSourceProfile(v ?? "")}
			/>
			<InputField
				label={t(
					"Источник · URL / ID / slug / space URL",
					"Source · URL / ID / slug / space URL",
				)}
				value={source}
				onChange={(e) => setSource(e.target.value)}
				required
			/>
			<ChoiceField
				label={t("Назначение", "Destination")}
				value={destinationType}
				options={[
					{ value: "confluence", label: "Confluence" },
					{ value: "yandex-wiki", label: "Yandex Wiki" },
					{ value: "markdown", label: "Markdown" },
					{ value: "html", label: "HTML" },
				]}
				onValueChange={(e) => {
					setDestinationType(e);
					setArchive(false);
					setDestinationProfile(
						profiles.find(([, p]) => p.type === e)?.[0] ?? "",
					);
				}}
			/>
			{!file && (
				<ChoiceField
					label={t("Профиль назначения", "Destination profile")}
					value={destinationProfile}
					options={profiles
						.filter(([, p]) => p.type === destinationType)
						.map(([name]) => name)}
					onValueChange={(v) => setDestinationProfile(v ?? "")}
				/>
			)}
			<InputField
				label={
					file
						? t("Каталог экспорта", "Export directory")
						: t("Родительская страница назначения", "Destination parent page")
				}
				value={destination}
				onChange={(e) => setDestination(e.target.value)}
				required
			/>
			<div
				style={{
					display: "flex",
					flexDirection: "row",
					gap: 8,
					alignItems: "center",
					flexWrap: "wrap",
				}}
				className="ui-grow"
			>
				<ChoiceField
					label="Scope"
					value={scope}
					options={["page", "subtree", "linked"]}
					onValueChange={(e) => setScope(e)}
				/>
				<ChoiceField
					label={t("Статус источника", "Source status")}
					value={sourceStatus}
					options={["all", "current"]}
					onValueChange={(e) => setSourceStatus(e)}
				/>
			</div>
			<CheckboxField
				label={t("Переносить комментарии", "Include comments")}
				checked={comments}
				onCheckedChange={(e) => setComments(e)}
			/>
			{file && (
				<CheckboxField
					label={t("Создать ZIP", "Create ZIP")}
					checked={archive}
					onCheckedChange={(e) => setArchive(e)}
				/>
			)}
			<CheckboxField
				label={t(
					"Live · записать в destination",
					"Live · write to destination",
				)}
				checked={live}
				onCheckedChange={(e) => {
					setLive(e);
					setConfirmed(false);
				}}
			/>
			{live && (
				<>
					<Notice tone={"orange"}>
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
						onCheckedChange={(e) => setConfirmed(e)}
					/>
				</>
			)}
			<details>
				<summary>{t("Дополнительные параметры", "Advanced options")}</summary>
				<div
					style={{
						display: "flex",
						flexDirection: "column",
						gap: 16,
						marginTop: 16,
					}}
				>
					<NumberField
						label={t("Параллельность", "Concurrency")}
						placeholder={String(settings?.defaults?.concurrency ?? 4)}
						value={concurrency}
						min={1}
						max={64}
						onValueChange={setConcurrency}
					/>
					<InputField
						label={t(
							"State · путь внутри workspace (необязательно)",
							"State · path inside workspace (optional)",
						)}
						value={stateFilename}
						onChange={(e) => setStateFilename(e.target.value)}
					/>
					<CheckboxField
						label={t(
							"Fresh · новые mappings; возможны дубликаты",
							"Fresh · new mappings; may create duplicates",
						)}
						checked={fresh}
						onCheckedChange={(e) => {
							setFresh(e);
							if (e) setRewrite(false);
						}}
					/>
					{!file && (
						<CheckboxField
							label={t(
								"Rewrite · только существующие IDs, без создания страниц",
								"Rewrite · existing IDs only; no new pages",
							)}
							checked={rewrite}
							onCheckedChange={(e) => {
								setRewrite(e);
								if (e) setFresh(false);
							}}
						/>
					)}
				</div>
			</details>
			<Button
				onClick={submit}
				disabled={
					settings?.validation?.valid === false ||
					(concurrency !== "" &&
						(Number(concurrency) < 1 || Number(concurrency) > 64)) ||
					!source.trim() ||
					!destination.trim() ||
					!sourceProfile ||
					(!file && !destinationProfile) ||
					(live && !confirmed) ||
					busy
				}
			>
				{busy && <Spinner />}
				{live
					? t("Запустить перенос", "Start migration")
					: t("Сначала dry-run", "Start dry-run")}
			</Button>
		</div>
	);
}
