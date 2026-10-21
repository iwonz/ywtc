export type Locale = 'ru' | 'en';

const dictionaries = {
  en: {
    report: 'Transfer report', source: 'Source', destination: 'Destination', status: 'Status', started: 'Started', finished: 'Finished',
    scope: 'Scope', sourceStatus: 'Source status', dryRun: 'Dry run', live: 'Live transfer', summary: 'Summary', metric: 'Metric', quality: 'Quality', next: 'next',
    pages: 'Pages', files: 'Files', comments: 'Comments', data: 'Data volume', found: 'found', selected: 'selected', excluded: 'excluded',
    attachments: 'attachments', images: 'images', commentAttachments: 'comment attachments', known: 'known', unknownSizes: 'unknown sizes',
    transferred: 'transferred', threads: 'threads', entries: 'entries', participants: 'participants', inventoryIncomplete: 'Inventory incomplete',
    reused: 'reused', fresh: 'fresh', recoveryAttempts: 'recovery attempts', remainingFailures: 'remaining failures',
    rootCauses: 'Root causes', dependent: 'dependent objects', retryable: 'retryable', noRootCauses: 'No root errors were recorded.',
    hierarchy: 'Page hierarchy', hierarchyDescription: 'Expanded source structure with exact transfer outcomes.', search: 'Search pages, files, IDs, or diagnostics…',
    filter: 'Filter', all: 'All', problems: 'Problems', unknownPosition: 'Position unknown', sourceLink: 'Open source', destinationLink: 'Open destination',
    details: 'View details', collapse: 'Collapse branch', expand: 'Expand branch', noResults: 'No pages match the current search and filter.',
    overview: 'Overview', comparison: 'Comparison', issues: 'Issues', parent: 'Parent', sourceParent: 'Source parent', expectedParent: 'Expected destination parent', actualParent: 'Actual destination parent', depth: 'Depth', sourceId: 'Source ID', destinationId: 'Destination ID', conflictEvidence: 'Conflict evidence',
    inventory: 'Inventory', links: 'links', tables: 'tables', grids: 'grids', codeBlocks: 'code blocks', name: 'Name', kind: 'Kind', size: 'Size',
    hash: 'SHA-256', reason: 'Reason', action: 'What to do', category: 'Category', phase: 'Phase', occurrences: 'Occurrences', noFiles: 'No transferable files.',
    noComments: 'No source comments.', noIssues: 'No page-specific issues.', previewUnavailable: 'Preview is unavailable.', sourcePreview: 'Source preview', destinationPreview: 'Destination preview',
    downloadJson: 'Download report JSON', outputs: 'Outputs', state: 'State', runId: 'Run ID', theme: 'Theme', language: 'Language', system: 'System', light: 'Light', dark: 'Dark',
    retryAttempt: 'Retry attempt', retryRoot: 'Retry root', previousRun: 'Previous run', retrySelection: 'Selected for retry', contextPages: 'context pages', carriedForward: 'carried forward', remaining: 'Remaining', terminal: 'terminal',
    close: 'Close', metadataIncomplete: 'The provider did not expose enough metadata to place this page exactly.', archive: 'Archive', revision: 'revision', stale: 'stale',
    complete: 'Complete', partial: 'Partial', failed: 'Failed', blocked: 'Blocked', conflict: 'Conflict', planned: 'Planned', 'not-started': 'Not started',
    discovered: 'Discovered', 'skeleton-created': 'Bootstrap created', skipped: 'Skipped', excludedStatus: 'Excluded', warning: 'Warning', error: 'Error',
    degradation: 'Degradation', adaptation: 'Adaptation', normalization: 'Safe normalization', externalReferences: 'external references preserved', technical: 'Technical diagnostics', technicalDetails: 'Technical details', resultLink: 'Open result', notAvailable: 'Not available',
  },
  ru: {
    report: 'Отчёт о переносе', source: 'Источник', destination: 'Назначение', status: 'Статус', started: 'Начало', finished: 'Завершение',
    scope: 'Охват', sourceStatus: 'Статус source', dryRun: 'Проверочный запуск', live: 'Перенос', summary: 'Краткая сводка', metric: 'Параметр', quality: 'Качество', next: 'далее',
    pages: 'Страницы', files: 'Файлы', comments: 'Комментарии', data: 'Объём данных', found: 'найдено', selected: 'выбрано', excluded: 'исключено',
    attachments: 'вложений', images: 'изображений', commentAttachments: 'вложений комментариев', known: 'известно', unknownSizes: 'размеров неизвестно',
    transferred: 'перенесено', threads: 'веток', entries: 'сообщений', participants: 'участников', inventoryIncomplete: 'Инвентаризация неполная',
    reused: 'переиспользовано', fresh: 'прочитано заново', recoveryAttempts: 'попыток восстановления', remainingFailures: 'оставшихся ошибок',
    rootCauses: 'Первопричины', dependent: 'зависимых объектов', retryable: 'можно повторить', noRootCauses: 'Первичных ошибок не зафиксировано.',
    hierarchy: 'Иерархия страниц', hierarchyDescription: 'Раскрытая структура source с точными результатами переноса.', search: 'Поиск по страницам, файлам, ID и диагностике…',
    filter: 'Фильтр', all: 'Все', problems: 'С проблемами', unknownPosition: 'Положение неизвестно', sourceLink: 'Открыть source', destinationLink: 'Открыть destination',
    details: 'Открыть детали', collapse: 'Свернуть ветку', expand: 'Раскрыть ветку', noResults: 'По текущему поиску и фильтру страниц нет.',
    overview: 'Обзор', comparison: 'Сравнение', issues: 'Проблемы', parent: 'Родитель', sourceParent: 'Родитель в source', expectedParent: 'Ожидаемый родитель в destination', actualParent: 'Фактический родитель в destination', depth: 'Глубина', sourceId: 'Source ID', destinationId: 'Destination ID', conflictEvidence: 'Данные о конфликте',
    inventory: 'Содержимое', links: 'ссылок', tables: 'таблиц', grids: 'гридов', codeBlocks: 'блоков кода', name: 'Название', kind: 'Тип', size: 'Размер',
    hash: 'SHA-256', reason: 'Причина', action: 'Что делать', category: 'Категория', phase: 'Этап', occurrences: 'Повторения', noFiles: 'Переносимых файлов нет.',
    noComments: 'Комментариев в source нет.', noIssues: 'Проблем для страницы нет.', previewUnavailable: 'Предпросмотр недоступен.', sourcePreview: 'Source preview', destinationPreview: 'Destination preview',
    downloadJson: 'Скачать report.json', outputs: 'Результаты', state: 'State', runId: 'Run ID', theme: 'Тема', language: 'Язык', system: 'Системная', light: 'Светлая', dark: 'Тёмная',
    retryAttempt: 'Попытка retry', retryRoot: 'Корень retry', previousRun: 'Предыдущий запуск', retrySelection: 'Выбрано для retry', contextPages: 'контекстных страниц', carriedForward: 'переиспользовано', remaining: 'Осталось', terminal: 'неисправимых автоматически',
    close: 'Закрыть', metadataIncomplete: 'Provider не раскрыл достаточно метаданных для точного положения страницы.', archive: 'Архив', revision: 'ревизия', stale: 'устарел',
    complete: 'Готово', partial: 'Частично', failed: 'Ошибка', blocked: 'Заблокировано', conflict: 'Конфликт', planned: 'Запланировано', 'not-started': 'Не начато',
    discovered: 'Найдено', 'skeleton-created': 'Bootstrap создан', skipped: 'Пропущено', excludedStatus: 'Исключено', warning: 'Предупреждение', error: 'Ошибка',
    degradation: 'Деградация', adaptation: 'Адаптация', normalization: 'Безопасная нормализация', externalReferences: 'внешних ссылок сохранено', technical: 'Техническая диагностика', technicalDetails: 'Технические детали', resultLink: 'Открыть результат', notAvailable: 'Нет данных',
  },
} as const;

export type TranslationKey = keyof typeof dictionaries.en;

export function translator(locale: Locale): (key: TranslationKey) => string {
  return (key) => dictionaries[locale][key];
}

export function initialLocale(): Locale {
  return navigator.languages.some((value) => value.toLocaleLowerCase().startsWith('ru')) ? 'ru' : 'en';
}
