"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { RefreshCw } from "lucide-react";
import { Button } from "../../ui/components/button";
import { Notice, Spinner } from "../../ui/fields";
import type { Translate } from "./api";

export function useCollection<T>(load: () => Promise<T>, interval = 0) {
	const [data, setData] = useState<T>(),
		[status, setStatus] = useState<"loading" | "ready" | "error">("loading"),
		[error, setError] = useState("");
	const sequence = useRef(0);
	const pending = useRef(false);
	const reload = useCallback(
		async (background = false) => {
			const current = ++sequence.current;
			pending.current = true;
			if (!background) setStatus("loading");
			try {
				const next = await load();
				if (current !== sequence.current) return;
				setData(next);
				setError("");
				setStatus("ready");
				return next;
			} catch (cause) {
				if (current !== sequence.current) return;
				setError(cause instanceof Error ? cause.message : String(cause));
				setStatus("error");
			} finally {
				if (current === sequence.current) pending.current = false;
			}
		},
		[load],
	);
	useEffect(() => {
		void reload();
		const timer = interval
			? setInterval(() => {
					if (!pending.current) void reload(true);
				}, interval)
			: undefined;
		return () => {
			sequence.current++;
			pending.current = false;
			if (timer) clearInterval(timer);
		};
	}, [reload, interval]);
	return { data, status, error, reload };
}

export function CollectionState({
	status,
	error,
	reload,
	t,
}: {
	status: "loading" | "ready" | "error";
	error: string;
	reload: () => unknown;
	t: Translate;
}) {
	if (status === "ready") return null;
	if (status === "loading")
		return (
			<div className="collection-loading" role="status">
				<Spinner />
				<span>{t("Загружаем данные…", "Loading data…")}</span>
			</div>
		);
	return (
		<Notice
			tone="red"
			title={t("Не удалось загрузить данные", "Could not load data")}
		>
			<p>{error}</p>
			<Button
				leadingIcon={<RefreshCw />}
				variant="secondary"
				onClick={() => void reload()}
			>
				{t("Повторить чтение", "Retry loading")}
			</Button>
		</Notice>
	);
}
