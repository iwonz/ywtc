"use client";
import { AppDialog } from "../../ui/fields";
import {
	Tabs,
	TabsList,
	TabsTrigger,
	TabsContent,
} from "../../ui/components/tabs";
import type { Translate } from "./api";

export function OperatorHelp({
	open,
	onDismiss,
	t,
}: {
	open: boolean;
	onDismiss: () => void;
	t: Translate;
}) {
	const objectRows = [
		[
			"complete",
			t(
				"Данные представлены и проверены; допустимы безопасные нормализации и адаптации.",
				"Data is represented and verified; safe normalizations and adaptations are allowed.",
			),
			t(
				"Дополнительных действий не требуется.",
				"No further action is required.",
			),
		],
		[
			"partial",
			t(
				"Часть данных или значимой структуры не сохранена либо не подтверждена проверкой.",
				"Some data or meaningful structure is missing or unverified.",
			),
			t(
				"Откройте точную проблему и возможность retry.",
				"Inspect the exact issue and retry eligibility.",
			),
		],
		[
			"failed",
			t(
				"Операция или проверка не удалась; прежний или bootstrap-контент может существовать.",
				"An operation or verification failed; prior or bootstrap content may still exist.",
			),
			t(
				"Проверьте причину, доступы и retryable.",
				"Check the cause, permissions and retryable flag.",
			),
		],
		[
			"blocked",
			t(
				"Объект не обрабатывался из-за недоступной обязательной зависимости.",
				"The object was not processed because a required dependency was unavailable.",
			),
			t(
				"Исправьте указанную первопричину, затем повторите зависимую ветку.",
				"Resolve the named root cause, then retry the dependent branch.",
			),
		],
		[
			"conflict",
			t(
				"Неоднозначная immutable identity/ownership. Ручная правка body сама по себе не конфликт.",
				"Immutable identity or ownership is ambiguous. A manual body edit alone is not a conflict.",
			),
			t(
				"Проверьте conflictEvidence и candidate IDs.",
				"Review conflictEvidence and candidate IDs.",
			),
		],
		[
			"planned",
			t(
				"Dry-run-план без destination-записи; внутри live это также промежуточное состояние.",
				"A dry-run plan without destination writing; during live execution it can also be intermediate.",
			),
			t(
				"Проверьте режим и дождитесь финала либо запустите live.",
				"Check the mode, wait for finalization or start live execution.",
			),
		],
		[
			"not-started",
			t(
				"Live-run завершился до финального переноса объекта; bootstrap уже может существовать.",
				"The live run ended before the object's final transfer; bootstrap content may already exist.",
			),
			t(
				"Продолжите с сохранённым state через retry.",
				"Continue with the saved state through retry.",
			),
		],
		[
			"excluded",
			t(
				"Страница исключена фильтром, inventory drift или явным sync-решением.",
				"A page was excluded by filtering, inventory drift or an explicit sync decision.",
			),
			t(
				"Проверьте причину исключения; это не destination failure.",
				"Inspect the exclusion reason; this is not a destination failure.",
			),
		],
	];
	return (
		<AppDialog
			open={open}
			onDismiss={onDismiss}
			title={t("Как работать с ywtc", "Using ywtc")}
			width="54rem"
		>
			<Tabs defaultValue="workflow">
				<TabsList>
					<TabsTrigger value="workflow">
						{t("Порядок работы", "Workflow")}
					</TabsTrigger>
					<TabsTrigger value="statuses">{t("Статусы", "Statuses")}</TabsTrigger>
				</TabsList>
				<TabsContent value="workflow" className="help-content">
					<ol className="workflow-list">
						<li>
							<strong>
								{t("Пространство и подключения", "Workspace and connections")}
							</strong>
							<p>
								{t(
									"Выберите локальную папку с конфигурацией, state и отчётами. Это не Confluence space. Затем настройте профили и проверьте доступы.",
									"Choose the local folder holding configuration, state and reports. This is not a Confluence space. Configure profiles and probe access next.",
								)}
							</p>
						</li>
						<li>
							<strong>{t("Dry-run, затем live", "Dry-run, then live")}</strong>
							<p>
								{t(
									"Задайте source, destination и состав переноса. Dry-run анализирует и строит отчёт без destination-записи; live требует отдельного подтверждения. Закрытие UI не отменяет принятую задачу.",
									"Choose source, destination and transfer scope. Dry-run analyzes and reports without destination writes; live requires separate confirmation. Closing the UI does not cancel an accepted job.",
								)}
							</p>
						</li>
						<li>
							<strong>
								{t(
									"Задачи, отчёты и восстановление",
									"Tasks, reports and recovery",
								)}
							</strong>
							<p>
								{t(
									"Job ID относится к операции, Run ID — к отчёту переноса. Смотрите текущий этап и фактические outcomes. Retry повторяет исправимые проблемы, sync заново анализирует изменения source и предлагает решения.",
									"Job ID identifies an operation; Run ID identifies a migration report. Follow its current phase and actual outcomes. Retry handles recoverable issues; sync analyzes source changes and proposes decisions.",
								)}
							</p>
						</li>
						<li>
							<strong>
								{t("Упоминания и хэштеги", "Mentions and hashtags")}
							</strong>
							<p>
								{t(
									"Анализ → разметка → сохранение черновика → публикация версии. Подключение версии к пространству действует на будущие миграции. Применение к существующему переносу отдельно строит preview и требует подтверждения записи.",
									"Analyze → edit → save draft → publish revision. Activating a revision affects future migrations. Applying it to an existing migration separately prepares a preview and requires write confirmation.",
								)}
							</p>
						</li>
					</ol>
				</TabsContent>
				<TabsContent value="statuses" className="help-content">
					<h3>{t("Состояние задачи", "Job lifecycle")}</h3>
					<p>
						{t(
							"queued — ожидание; running — worker выполняет операцию; stopping — остановка запрошена; interrupted — финал не подтверждён. finished означает завершение выполнения, включая ошибку или отмену, а не успешную миграцию.",
							"queued means waiting; running means a worker is executing; stopping means stop was requested; interrupted means no confirmed final result. finished means execution ended, including failure or cancellation, not a successful migration.",
						)}
					</p>
					<h3>{t("Результат запуска", "Run result")}</h3>
					<p>
						{t(
							"completed — нормальный финал без issues ошибок/предупреждений/деградаций; completed-with-warnings — без errors, но с warnings или degradations; partial — после нормального финала остались error issues. failed — обязательная подготовка или pipeline не завершились; cancelled — обработана остановка; interrupted — найден незавершённый running. Всегда проверяйте dry-run/live и исходы объектов.",
							"completed is a normal finish without errors, warnings or degradations; completed-with-warnings has warnings or degradations but no errors; partial finished normally with unresolved error issues. failed means required preparation or the pipeline did not finish; cancelled handled a stop; interrupted identifies an unfinished running record. Always check dry-run/live and object outcomes.",
						)}
					</p>
					<h3>{t("Основные исходы объектов", "Common object outcomes")}</h3>
					<div className="help-status-list">
						{objectRows.map(([status, meaning, action]) => (
							<div key={status}>
								<code>{status}</code>
								<div>
									<p>{meaning}</p>
									<p className="muted">{action}</p>
								</div>
							</div>
						))}
					</div>
					<p>
						{t(
							"У архивов комментариев skipped означает отключение/отсутствие комментариев, stale — ранее сохранённый архив больше не подтверждён source. Возможность автоповтора определяется отдельно, а adaptation/normalization не означают неполный перенос. Промежуточные и исторические значения описаны в README.",
							"For comment archives, skipped means disabled/no comments; stale means source no longer confirms a prior archive. Automatic retry eligibility is separate, and adaptation/normalization do not mean an incomplete transfer. README documents intermediate and historical values.",
						)}
					</p>
					<a
						href="https://github.com/iwonz/ywtc#отчёты-и-статусы"
						target="_blank"
						rel="noopener noreferrer"
					>
						{t(
							"Полные условия статусов в README",
							"Full status conditions in README",
						)}
					</a>
				</TabsContent>
			</Tabs>
		</AppDialog>
	);
}
