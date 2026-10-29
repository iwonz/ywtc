"use client";
import { Button } from "../../ui/components/button";
import {
	Notice,
	NumberField,
	InputField,
	ChoiceField,
	PasswordField,
	AppDialog,
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
		[probe, setProbe] = useState<any>();
	useEffect(() => {
		api(`${root}/settings`).then(setSettings).catch(onError);
	}, [root, onError]);
	const patch = (key: string, value: unknown) =>
		setEdit({ ...edit, [key]: value });
	const save = async () => {
		try {
			const connections = { ...settings.connections };
			if (previous && previous !== name) delete connections[previous];
			connections[name] = edit;
			const value = await api(`${root}/settings`, "PUT", {
				...settings,
				connections,
			});
			setSettings(value);
			setEdit(undefined);
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
					onClick={() => {
						setPrevious("");
						setName("");
						setEdit(fresh("confluence"));
					}}
				>
					{t("Добавить подключение", "Add connection")}
				</Button>
			</div>
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
							onClick={() =>
								api(`${root}/settings/probe`, "POST", { profile: key })
									.then(setProbe)
									.catch(onError)
							}
							variant="secondary"
						>
							{t("Проверить доступ", "Probe access")}
						</Button>
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
								setSettings({
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
								setSettings({
									...settings,
									defaults: { ...settings.defaults, timeoutMs: Number(v) },
								})
							}
						/>
						<Button
							onClick={() =>
								api(`${root}/settings`, "PUT", settings)
									.then(setSettings)
									.catch(onError)
							}
							variant="secondary"
						>
							{t("Сохранить defaults", "Save defaults")}
						</Button>
					</div>
					<p className="muted">
						Mentions: {settings.mentions?.mode ?? "off"} · Hashtags:{" "}
						{settings.hashtags?.mode ?? "off"}
					</p>
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
						<Button
							disabled={!/^[a-z0-9][a-z0-9._-]*$/.test(name)}
							onClick={save}
						>
							{t("Сохранить профиль", "Save profile")}
						</Button>
					</div>
				)}
			</AppDialog>
		</>
	);
}
