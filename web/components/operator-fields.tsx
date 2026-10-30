"use client";
import { useId, type ReactNode } from "react";
import { RadioGroup, RadioGroupItem } from "../../ui/components/radio-group";
import { ChoiceField } from "../../ui/fields";
import type { Translate } from "./api";

export function FormSection({
	title,
	description,
	children,
}: {
	title: string;
	description?: string;
	children: ReactNode;
}) {
	return (
		<fieldset className="form-section">
			<legend>{title}</legend>
			{description && <p className="muted form-description">{description}</p>}
			<div className="form-fields">{children}</div>
		</fieldset>
	);
}
export function RequiredNote({ t }: { t: Translate }) {
	return (
		<p className="ui-field-hint">
			{t(
				"* Обязательные поля. Значения по умолчанию уже выбраны.",
				"* Required fields. Defaults are already selected.",
			)}
		</p>
	);
}
export function ScopeField({
	value,
	onValueChange,
	t,
}: {
	value: string;
	onValueChange: (value: string) => void;
	t: Translate;
}) {
	const id = useId();
	const options = [
		[
			"page",
			t(
				"Одна страница. Для пространства Confluence — только домашняя страница внутри нового раздела.",
				"One page. For a Confluence space, only its homepage inside the new section.",
			),
		],
		[
			"subtree",
			t(
				"Страница и все доступные потомки. Для пространства Confluence — все доступные страницы пространства.",
				"The page and all accessible descendants. For a Confluence space, all accessible space pages.",
			),
		],
		[
			"linked",
			t(
				"Обход внутренних ссылок от корня. Для пространства Confluence — от домашней страницы; ссылки из комментариев обход не расширяют.",
				"Follow internal links from the root, or the homepage of a Confluence space. Comment links do not expand traversal.",
			),
		],
	];
	return (
		<fieldset className="scope-field">
			<legend>{t("Область переноса", "Scope")}</legend>
			<RadioGroup
				aria-label="Scope"
				value={value}
				onValueChange={onValueChange}
				className="scope-choices"
			>
				{options.map(([key, description]) => (
					<label key={key} htmlFor={`${id}-${key}`}>
						<RadioGroupItem
							id={`${id}-${key}`}
							value={key!}
							aria-label={key}
							aria-describedby={`${id}-${key}-hint`}
						/>
						<span>
							<strong>{key}</strong>
							<span id={`${id}-${key}-hint`} className="ui-field-hint">
								{description}
							</span>
						</span>
					</label>
				))}
			</RadioGroup>
		</fieldset>
	);
}
export function SourceStatusField({
	value,
	onValueChange,
	t,
}: {
	value: string;
	onValueChange: (value: string) => void;
	t: Translate;
}) {
	return (
		<ChoiceField
			label={t("Статус источника", "Source status")}
			value={value}
			options={["all", "current"]}
			onValueChange={onValueChange}
			description={t(
				"all — все доступные; current — только актуальные обнаруженные страницы. Явный корень включается всегда.",
				"all includes all accessible pages; current selects current discovered pages. The explicit root is always included.",
			)}
			help={t(
				"Фильтр не удаляет страницы из destination. Для Yandex current исключает obsolete; неподдерживаемая проверка статуса останавливает preflight.",
				"This filter does not remove destination pages. Yandex current excludes obsolete pages; unsupported status checks stop preflight.",
			)}
		/>
	);
}
