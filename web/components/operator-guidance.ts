import type { Translate } from "./api.js";

const lifecycle: Record<string, [string, string]> = {
	queued: [
		"Запрос сохранён и ожидает запуска worker в очереди пространства.",
		"The request is saved and awaiting a worker in this workspace queue.",
	],
	running: [
		"Worker выполняет операцию. Текущий этап и подтверждённые результаты показаны ниже.",
		"A worker is executing the operation. The current phase and confirmed outcomes appear below.",
	],
	stopping: [
		"Мягкая остановка запрошена. Дождитесь подтверждения и сохранения доступных checkpoints.",
		"Graceful stop was requested. Wait for confirmation and available checkpoints to be saved.",
	],
	finished: [
		"Выполнение завершено. Успех определяется отдельным результатом операции и отчётом, а не словом finished.",
		"Execution ended. Success is determined by the separate operation result and report, not the word finished.",
	],
	interrupted: [
		"Финал worker не подтверждён. Продолжение требует явного действия; автоматического повтора записей нет.",
		"The worker's final result was not confirmed. Continuation requires an explicit action; writes are not automatically repeated.",
	],
};
export function lifecycleGuidance(status: string, t: Translate): string {
	const message = Object.hasOwn(lifecycle, status) ? lifecycle[status] : undefined;
	return message
		? t(...message)
		: t(
				"Показано сохранённое состояние задачи; подробности — в журнале.",
				"This is the stored task state; consult its log for details.",
			);
}
const phases: Record<string, [string, string]> = {
	"Source cache": [
		"Проверяются сохранённые source-снимки и подготавливаются данные для анализа.",
		"Saved source snapshots are checked and prepared for analysis.",
	],
	"Source inventory": [
		"Читаются и нормализуются выбранные страницы; подготавливается inventory. Это ещё не destination-запись.",
		"Selected pages are read and normalized to prepare inventory. This is not destination writing yet.",
	],
	"Mention/hashtag decisions": [
		"К найденным упоминаниям и тегам применяются зафиксированные решения.",
		"Pinned decisions are applied to discovered mentions and hashtags.",
	],
	"Preparing transfer state": [
		"Подготавливаются mappings и checkpoints для выбранных страниц.",
		"Mappings and checkpoints are prepared for selected pages.",
	],
	"Planning pages": [
		"Строится dry-run-план страниц без записи в destination.",
		"A dry-run page plan is prepared without destination writes.",
	],
	"Page staging": [
		"Страницы и их родители согласуются сверху вниз; создаётся или проверяется bootstrap-контент.",
		"Pages and parents are reconciled top-down; bootstrap content is created or checked.",
	],
	"Content transfer": [
		"Переносятся и проверяются страницы, файлы и архивы комментариев. Счётчики показывают обработанные операции; успех определяется исходами объектов.",
		"Pages, files and comment archives are transferred and verified. Counters show processed operations; success is determined by object outcomes.",
	],
	"Filesystem export": [
		"Файловый результат собирается и проверяется в staging перед безопасной заменой каталога.",
		"The filesystem export is assembled and checked in staging before safe directory replacement.",
	],
	"Sync source inventory": [
		"Повторно читается выбранный source и сравнивается с сохранённым baseline.",
		"Selected source data is read again and compared with the saved baseline.",
	],
	"Sync destination and reference audit": [
		"Проверяются mapped-страницы и входящие ссылки; изменения ещё требуют решения оператора.",
		"Mapped pages and incoming links are audited; proposed changes still require operator decisions.",
	],
	verification: [
		"Повторное чтение проверяет фактически сохранённый результат.",
		"Read-back checks the result actually saved by the destination.",
	],
	"Finalizing transfer · calculating outcomes and writing report": [
		"Подсчитываются исходы и сохраняется связанный отчёт. Дождитесь финального результата задачи.",
		"Outcomes are calculated and the linked report is saved. Wait for the final task result.",
	],
};
export function phaseGuidance(phase: string, t: Translate): string {
	const message = Object.hasOwn(phases, phase) ? phases[phase] : undefined;
	return message
		? t(...message)
		: t(
				"Worker сообщает этот этап; текущая операция и активные объекты показаны ниже. Неизвестный total не превращается в процент.",
				"The worker reports this phase; its current operation and active objects appear below. An unknown total is not converted to a percentage.",
			);
}
export function measuredPercentage(
	snapshot: { completed?: number; total?: number } | undefined,
): number | undefined {
	const completed = snapshot?.completed,
		total = snapshot?.total;
	if (
		typeof completed !== "number" ||
		typeof total !== "number" ||
		!Number.isFinite(completed) ||
		!Number.isFinite(total) ||
		total <= 0 ||
		completed < 0 ||
		completed > total
	)
		return;
	return (completed / total) * 100;
}
export function operationLabel(kind: string, t: Translate): string {
	const labels: Record<string, [string, string]> = {
		migrate: ["Миграция", "Migration"],
		retry: ["Повтор проблемных объектов", "Retry unresolved objects"],
		scan: ["Анализ упоминаний и тегов", "Mention and hashtag analysis"],
		targeted: ["Точечная операция", "Targeted operation"],
		"sync-plan": ["Анализ синхронизации", "Synchronization analysis"],
		"sync-apply": ["Применение синхронизации", "Apply synchronization"],
	};
	const label = Object.hasOwn(labels, kind) ? labels[kind] : undefined;
	return label ? t(...label) : kind;
}
