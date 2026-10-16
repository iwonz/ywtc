<p align="center">
  <img src="docs/assets/readme-header.png" alt="Yandex Wiki and Confluence sources moving through ywtc to Confluence, Yandex Wiki, Markdown, and HTML destinations" width="100%">
</p>

# ywtc

## Описание

`ywtc` — CLI для переноса страниц между Yandex Wiki и Confluence и экспорта в Markdown или автономный HTML. Утилита сохраняет структуру, ссылки и вложения, явно отмечает деградации и продолжает прерванные операции по state-файлу. Исходные данные и страницы назначения автоматически не удаляются.

Требуются Node.js `>=24` и npm `>=11.5.1`. Лицензия — [MIT](LICENSE).

## Возможности

| Исходный материал | Как переносится |
| --- | --- |
| Страницы и структура | Одна страница, полное структурное поддерево или граф связанных страниц. Иерархия восстанавливается, циклы обрабатываются без повторного переноса. |
| Текст и оформление | Заголовки, абзацы, базовое начертание, списки, цитаты, разделители, inline/preformatted code и обычные таблицы преобразуются в нативную или семантически эквивалентную разметку destination. |
| Ссылки и якоря | Ссылки между выбранными страницами переписываются на destination, якоря сохраняются. Внешние ссылки и ссылки за пределы выбранного набора остаются исходными. |
| Вложения | Переносятся все доступные через API для скачивания файлы, включая PNG/JPEG/GIF/WebP/SVG, PDF, ZIP, DOC/DOCX, XLS/XLSX и PPT/PPTX. Файлы передаются потоково, совпадения имён разрешаются стабильно, размер и SHA-256 проверяются. |
| Изображения | Прикреплённые изображения становятся attachments destination или локальными файлами экспорта. Внешние изображения остаются внешними; подписи и размеры сохраняются, если destination это поддерживает. |
| Специальная разметка Yandex Wiki | Notes становятся `info`/`tip`/`warning`, cuts — `expand`, tabs — статическими секциями с заголовками, tree — `children` macro или статической навигацией, Grid — статической таблицей. |
| Специальная разметка Confluence | Безопасный Storage Format сохраняется при переносе между Confluence. В других направлениях code становится блоком кода, info/tip/warning/note — callout, expand — раскрываемым или статическим блоком, anchor — якорем; остальные macros получают fallback. |
| Комментарии | По умолчанию все доступные комментарии страницы собираются в один архивный комментарий: отдельные раскрываемые ветки сохраняют участников, авторов, даты, статусы, inline-контекст, удалённые записи и вложенность ответов. Вложения, на которые есть ссылки в тексте комментариев, складываются в один проверяемый ZIP с hash-prefixed именами и manifest. Для Markdown/HTML создаются локальные секции и ZIP. |
| Конструкции без точного эквивалента | Создаётся читаемый fallback и сохраняется raw snapshot. Проверка destination отражает упрощения как degradation или `partial`, поэтому потеря не маскируется успешным статусом. |

### Не переносится

| Ограничение | Поведение ywtc |
| --- | --- |
| История версий | Переносится только актуальное содержимое страницы. |
| Реакции на комментарии | Не копируются и не влияют на список участников архива. |
| Комментарии непосредственно к attachments, blog posts и custom content | Не входят в архив страницы; читаются только footer/inline page comments. |
| Пользовательские сущности, watchers, права и ограничения доступа | Не создаются; исходное авторство комментариев сохраняется в архивном тексте, а destination-объекты создаются пользователем текущего токена и наследуют права destination. |
| Удалённые, недоступные или не возвращённые source API страницы | Не восстанавливаются; недоступность и пропуски фиксируются в state и отчёте. |
| Внешние файлы и изображения, которых нет среди доступных для скачивания ресурсов | Не копируются; сохраняется внешняя или исходная ссылка. |
| Активные скрипты, iframe, формы и интерактивное поведение embed-объектов | Не исполняются в destination; вместо них сохраняется безопасное статическое представление или raw snapshot. |
| Пиксельная идентичность и поведение vendor-specific элементов без эквивалента | Используется ближайшее семантическое представление; различия явно отмечаются в отчёте. |

## Установка

```bash
# npm
npm install -g @iwonz/ywtc

# npx без глобальной установки
npx @iwonz/ywtc@latest --version

# Homebrew
brew tap iwonz/ywtc https://github.com/iwonz/ywtc.git
brew trust --tap iwonz/ywtc
brew install ywtc
```

Homebrew 7 требует доверить сторонний tap; команда `brew trust` относится только к `iwonz/ywtc`.

Обновление:

```bash
ywtc update                       # только проверка
ywtc update --install             # канал текущей установки
ywtc update --install --via brew  # явно через Homebrew
```

## Минимальный сценарий

- [ ] Установите CLI одним из способов выше.
- [ ] Запустите `ywtc init --interactive` и настройте обязательные подключения Yandex Wiki и Confluence.
- [ ] Дождитесь read-only проверки API и авторизации: конфиг сохраняется только после её успеха.
- [ ] Выполните предложенную wizard команду первой миграции с `--dry-run`, подставив полные URL страниц.
- [ ] Проверьте план и повторите команду без `--dry-run`.

## Конфигурация

Для рабочих команд каталог выбирается в порядке: `--workdir` → текущий каталог, если непосредственно в нём есть `ywtc.config.yaml` → `~/.ywtc`. Поиск по родительским каталогам не выполняется. `ywtc init --interactive` предлагает путь с default `~/.ywtc`; переданный `--workdir` становится редактируемым начальным значением. `migrate` автоматически инициализирует отсутствующий workspace.

```text
~/.ywtc/
├── ywtc.config.yaml        # подключения, настройки и токены; mode 0600 при создании
└── .states/                # state, cache и отчёты
```

`ywtc init --interactive` требует TTY, проводит через обязательные настройки обоих провайдеров, скрывает токены и делает только read-only connection probes. Проверка подтверждает API и авторизацию, но не права конкретных страниц: они проверяются `doctor` или `migrate`. Для существующего workspace доступны изменение выбранных профилей, выход без изменений и настройка с нуля с backup прежнего YAML в `.states/backups/`; state не удаляется.

Обычный `ywtc init` без wizard создаёт безопасный пустой шаблон для автоматизации или ручного управления. Полный пример с Yandex Wiki, Confluence Data Center, Confluence Cloud и сетевыми лимитами: [`ywtc.config.example.yaml`](ywtc.config.example.yaml).

### Поля профилей

| Поле | Для кого | Обязательность / значения | Назначение |
| --- | --- | --- | --- |
| `defaults.timeoutMs` | файл | `1000..300000`, default `30000` | Таймаут HTTP-запроса |
| `defaults.concurrency` | файл | `1..64`, default `4` | Общая параллельность операции |
| `connections.<name>` | файл | минимум один; имя `[a-z0-9._-]+` | Именованное подключение |
| `type` | все профили | `yandex-wiki` или `confluence` | Тип провайдера |
| `token` | все профили | непустой для используемого профиля | OAuth, IAM, PAT или API token |
| `apiUrl` | Yandex Wiki | URL Public API v1 | API endpoint |
| `webUrl` | Yandex Wiki | URL | Базовый адрес Wiki для ссылок и выбора профиля |
| `authType` | Yandex Wiki | `oauth` (default) или `iam` | Схема авторизации |
| `organization.type` | Yandex Wiki | `yandex360` (default) или `cloud` | Заголовок `X-Org-Id` или `X-Cloud-Org-Id` |
| `organization.id` | Yandex Wiki | непустая строка | ID организации |
| `deployment` | Confluence | `data-center` или `cloud` | Тип развёртывания |
| `baseUrl` | Confluence | URL | Адрес инстанса, включая context path |
| `authType` | Confluence | `pat` для Data Center; `api-token` для Cloud | Схема авторизации |
| `email` | Confluence Cloud | непустой для используемого профиля | Email Atlassian-аккаунта |
| `limits.readConcurrency` | все профили | `1..64`, default `4` | Параллельные чтения |
| `limits.writeConcurrency` | все профили | `1..32`, default `2` | Параллельные записи |
| `limits.downloadConcurrency` | все профили | `1..32`, default `2` | Параллельные скачивания |
| `limits.uploadConcurrency` | все профили | `1..32`, default `2` | Параллельные загрузки |
| `limits.requestsPerSecond` | все профили | `1..1000`, default `8` | Средняя частота запросов |
| `limits.burst` | все профили | `1..1000`, default `8` | Допустимый кратковременный burst |

Конфигурация строгая: неизвестные поля считаются ошибкой. Все значения, включая токены, email, таймауты и лимиты, читаются только из `ywtc.config.yaml`; process environment их не переопределяет. Файл рабочего каталога игнорируется Git, а токены маскируются в диагностике и отчётах.

## Направления и совместимость

| Source | Destination | Поддержка |
| --- | --- | --- |
| Yandex Wiki | Confluence | Да |
| Yandex Wiki | Yandex Wiki | Да, включая другой профиль или инстанс |
| Confluence | Yandex Wiki | Да |
| Confluence | Confluence | Да, включая другой профиль или инстанс |
| Yandex Wiki или Confluence | Markdown | Да |
| Yandex Wiki или Confluence | статический HTML | Да |

| Система | Контракт | Авторизация |
| --- | --- | --- |
| Yandex Wiki | Public API v1; новые необязательные поля принимаются | OAuth или пользовательский IAM; `X-Org-Id`/`X-Cloud-Org-Id` |
| Confluence Data Center | 7.9+ без верхней границы; capabilities проверяются до записи | Bearer PAT |
| Confluence Cloud | REST v2 для страниц и REST v1 для attachments | Email + API token |

Confluence Server, Data Center Basic Auth и OAuth app-flow не поддерживаются. Совместимость определяется preflight-проверкой необходимых API/capabilities, а не сертификацией каждой patch-версии.

## Как получить токены

### Yandex Wiki

- [ ] Создайте приложение в [Яндекс OAuth](https://oauth.yandex.ru/).
- [ ] Выдайте права Wiki на чтение; для destination также нужны права записи.
- [ ] Получите OAuth-токен пользователя с доступом к страницам. Для федеративного пользователя Yandex Cloud допустим IAM-токен и `authType: iam`.
- [ ] Найдите ID организации в **Yandex Tracker → Администрирование → Организации**.
- [ ] Укажите `organization.type: yandex360` для Яндекс 360 или `cloud` для Cloud Organization.
- [ ] Запишите токен в `connections.<name>.token` выбранного профиля.

### Confluence Data Center

- [ ] Откройте **Avatar → Settings → Personal access tokens → Create token**.
- [ ] Создайте PAT и запишите его в `connections.<name>.token`.
- [ ] Используйте `deployment: data-center` и `authType: pat`.
- [ ] Проверьте права на чтение source и создание/изменение страниц и вложений destination.

### Confluence Cloud

- [ ] Создайте [Atlassian API token](https://id.atlassian.com/manage-profile/security/api-tokens).
- [ ] Используйте `deployment: cloud`, `authType: api-token`, `token` и `email`.
- [ ] Запишите API token и email аккаунта непосредственно в выбранный профиль.
- [ ] Проверьте доступ аккаунта к source и destination spaces.

## Параметры

### Команды

| Команда | Назначение |
| --- | --- |
| `ywtc init [--workdir <path>] [--interactive]` | Создать шаблон либо настроить и проверить подключения в TTY wizard |
| `ywtc doctor [options]` | Проверить workspace; с source и destination выполнить read-only preflight |
| `ywtc migrate --source <locator> --destination <locator\|directory> [options]` | Перенести или экспортировать выбранный граф страниц |
| `ywtc reports list [--workdir <path>]` | Показать локальные отчёты от новых к старым |
| `ywtc reports open [run-id\|last] [--workdir <path>]` | Открыть выбранный отчёт; `last` или отсутствие аргумента открывает последний корректный |
| `ywtc update [--install] [--via npm\|brew]` | Проверить или установить обновление безопасным для текущего канала способом |
| `ywtc --help`, `ywtc <command> --help` | Показать общую или командную справку |
| `ywtc --version` | Показать версию |

### Опции

| Опция | Команды | Обязательность / значения | Назначение |
| --- | --- | --- | --- |
| `--source <value>` | `doctor`, `migrate` | обязательно для `migrate`; в `doctor` вместе с destination | URL, page ID или Yandex slug |
| `--destination <value>` | `doctor`, `migrate` | обязательно для `migrate`; в `doctor` вместе с source | Родительская страница или каталог экспорта |
| `--source-profile <name>` | `doctor`, `migrate` | при неоднозначном коротком locator | Профиль source из `connections` |
| `--destination-profile <name>` | `doctor`, `migrate` | при неоднозначном remote locator | Профиль destination; несовместим с файловым экспортом |
| `--scope <mode>` | `doctor`, `migrate` | `page`, `subtree` (default), `linked` | Граница выбора страниц |
| `--source-status <status>` | `doctor`, `migrate` | `all` (default) или `current` | Статус автоматически обнаруживаемых страниц; явно заданный root включается всегда |
| `--comments`, `--no-comments` | `doctor`, `migrate` | комментарии включены по умолчанию | Архивировать page comments или полностью отключить их чтение и запись |
| `--format <format>` | `doctor`, `migrate` | `markdown` или `html` | Делает destination файловым каталогом |
| `--archive` | `migrate` | только вместе с `--format` | Дополнительно создать ZIP рядом с каталогом |
| `--dry-run` | `migrate` | default `false` | Discovery и план без записи в destination |
| `--fresh` | `migrate` | default `false` | Игнорировать mappings текущего state |
| `--open-report` | `migrate` | default `false` | Открыть итоговый HTML-отчёт; ошибка браузера не меняет результат миграции |
| `--concurrency <n>` | `migrate` | `1..64`; иначе config default | Общая параллельность; профильные лимиты сохраняются |
| `--state <path>` | `migrate` | внутри workspace | Явный state вместо автоматического |
| `--workdir <path>` | `init`, `doctor`, `migrate`, `reports` | config в CWD или `~/.ywtc` | Явно выбрать workspace; поддерживается `~/...` |
| `--interactive` | `init` | требует stdin/stdout TTY | Обязательный wizard Yandex Wiki + Confluence; без частично сохранённого конфига |
| `--install` | `update` | default `false` | Установить найденное обновление |
| `--via <channel>` | `update` | `npm` или `brew` | Явно выбрать совместимый канал обновления |
| `-h`, `--help` | CLI и команды | необязательно | Справка |
| `-v`, `--version` | CLI | необязательно | Версия |

### Локаторы

- Yandex Wiki: полный URL, числовой page ID или slug, например `team/start`.
- Confluence: числовой page ID, URL с `pageId=<id>` либо URL с `/pages/<id>` или `/content/<id>`.
- Полный URL автоматически выбирает профиль по нормализованному base URL.
- Короткий ID/slug выбирается автоматически только при единственном подходящем профиле; иначе нужен `--source-profile` или `--destination-profile`.
- Каталог является файловой destination только вместе с `--format`.

### Scope

- `page` — только исходная страница.
- `subtree` — страница и все доступные структурные потомки до последнего уровня; default. С `all` Yandex Wiki включает `actual` и `obsolete`, а с `current` — только `actual`. Confluence переносит страницы, доступные через hierarchy API; archived, trashed и historical versions могут не возвращаться этим API.
- `linked` — детерминированный BFS по внутренним ссылкам и page/include references до фиксированной точки. Циклы завершаются безопасно, каждая страница обрабатывается один раз; внешние и недоступные ссылки не обходятся и попадают в отчёт.

## Частые примеры

```bash
# Перенести всё структурное поддерево
ywtc migrate --source https://wiki.example.com/team/start \
  --destination https://confluence.example.com/confluence/pages/viewpage.action?pageId=123

# Перенести граф рекурсивно связанных страниц
ywtc migrate --source https://wiki.example.com/team/start \
  --destination https://confluence.example.com/confluence/pages/viewpage.action?pageId=123 \
  --scope linked

# Перенести только исходную страницу
ywtc migrate --source https://wiki.example.com/team/start \
  --destination https://confluence.example.com/confluence/pages/viewpage.action?pageId=123 \
  --scope page

# Создать автономный HTML-экспорт
ywtc migrate --source https://wiki.example.com/team/start \
  --destination ./exports/knowledge-base \
  --format html

# Открыть последний корректный отчёт
ywtc reports open last
```

Wizard проверяет только доступность API и авторизацию без страниц и внешних записей. `doctor` принимает те же endpoints, profiles, `scope`, `source-status` и `format`: без endpoints он проверяет workspace, конфигурацию и секреты, а с обоими endpoints выполняет page-specific read-only capability-preflight.

## Файловый экспорт

Markdown создаёт `index.md`, `pages/`, `attachments/`, `.ywtc-export.json` и, при деградациях, `_source/`. HTML создаёт автономный адаптивный сайт с локальным `assets/site.css`; он работает через `file://` и на static hosting без CDN или внешнего runtime.

При включённых комментариях каждая страница получает секцию `Комментарии` с раскрываемыми ветками. Связанные из комментариев файлы находятся в одном ZIP рядом с attachments страницы; `manifest.json` внутри ZIP связывает source comment ID, исходную ссылку, исходное и архивное имя, размер и SHA-256.

Экспорт сначала строится в staging-каталоге. Существующий каталог заменяется только при строгом актуальном manifest с `tool: ywtc` и той же canonical identity, а прежний каталог сохраняется как timestamped backup. `--archive` оставляет каталог и создаёт новый ZIP, не перезаписывая существующий архив.

## State

По умолчанию state хранится в `<workdir>/.states/<automatic-id>.json`. ID строится из канонических профилей и ID source/destination, а для файлового экспорта также из формата; форма locator, `scope` и `source-status` на ID не влияют. State имеет единственный строгий актуальный формат без поля версии. Несоответствующий файл не преобразуется и не изменяется. Относительный `--state` разрешается внутри workspace, выход за его границы запрещён.

### Повторные запуски

- Одинаковые source и destination автоматически подхватывают один state независимо от формы URL/ID/slug.
- Переключение `current → all` расширяет тот же state новыми страницами без дубликатов; обратное переключение не удаляет mappings вне текущего выбора.
- Если ранее страница была создана под временно ближайшим выбранным предком, повторный запуск безопасно перемещает неизменённую страницу под найденного родителя; пользовательские изменения дают `conflict`.
- Уже сопоставленные страницы и вложения сверяются по ID, фактическому размеру и SHA-256; проверенный cache повторно не скачивается.
- Неудачные mappings вложений автоматически получают безопасные уникальные имена и повторяются без `--fresh`.
- Временный `404` подтверждённой destination-страницы повторяется с backoff; устойчиво пропавшая mapping восстанавливается под ожидаемым родителем с сохранением прежнего ID в state.
- Страница с прежним неизменённым служебным placeholder ywtc автоматически получает полноценный source-derived контент.
- Ошибка отдельного файла оставляет полный текст и source-ссылку, фиксирует `partial` и повторяет ресурс при следующем запуске.
- Неизменённые архивы комментариев и ZIP проверяются и переиспользуются без дубликатов. Confluence-архив обновляется, а Yandex Wiki при изменении source получает новую ревизию, поскольку Public API не предоставляет update comments.
- Ручное изменение destination-комментария даёт `conflict`; удалённый комментарий создаётся заново. Исчезнувшие из доступного source API комментарии отмечаются `stale` и автоматически не удаляются.
- Запуск с `--no-comments` не обращается к comment API и не удаляет ранее созданные архивы; следующий обычный запуск дополнит тот же state.
- Страница, изменённая вручную после прошлого запуска, получает `conflict` и не перезаписывается.
- `--fresh` игнорирует mappings; перед live-run прежний state сохраняется как backup, а destination может получить новые объекты.
- Удалённые из source объекты автоматически не удаляются из destination.

При SIGINT/SIGTERM новые задачи не ставятся, активные безопасные операции завершаются, state и отчёт сохраняются. Коды выхода: `0` — completed; `1` — partial или verification failure; `2` — usage/config/preflight; `130`/`143` — остановка сигналом.

## Отчёты

Каждый запуск создаёт `<workdir>/.states/reports/<run-id>/index.html` и очищенный `report.json`, затем печатает run ID, `file://` URL и команду повторного открытия. `--open-report` открывает отчёт сразу; `ywtc reports list` показывает историю, `ywtc reports open <run-id>` — выбранный запуск, а `ywtc reports open last` или `ywtc reports open` — последний корректный.

Автономный HTML-отчёт работает без сети. В краткой таблице сопоставлены source inventory и destination outcomes для страниц, файлов, комментариев и байтов. Ниже находится раскрытое дерево исходной иерархии, включая исключённые страницы; доступны поиск, фильтры проблем и прямые ссылки на source/destination. Строка страницы открывает детали файлов, комментариев, родителей, первопричин и рекомендуемых действий, а вкладка сравнения показывает sandboxed source/destination preview. Зависимые `blocked` объекты сгруппированы под root error. Интерфейс поддерживает RU/EN, системную/светлую/тёмную тему и мобильный экран.

HTML/JSON, итог терминала и `reports list` используют одинаковые счётчики. Известный source volume отделён от подтверждённых transferred bytes; неизвестные размеры отмечены явно. `report.json` не содержит содержимое страниц, тексты комментариев или preview HTML — они остаются только в локальном `index.html`.

### Статусы переноса

Статусы страниц:

| Статус | Смысл | Данные записаны | Что делать |
|---|---|---:|---|
| `complete` | Страница и связанные объекты записаны и проверены | Да | Ничего |
| `partial` | Основной контент проверен, но применён fallback или зафиксирована деградация | Да | Посмотреть различия в отчёте; повторить запуск для retryable-проблем |
| `failed` | Операция страницы началась, но корректная запись или проверка не удалась | Возможно частично | Исправить root error и повторить ту же миграцию |
| `blocked` | Страница не запускалась из-за failed/conflict родителя или другой зависимости | Нет в этом запуске | Исправить указанную upstream-страницу и повторить запуск |
| `conflict` | Destination изменён пользователем и защищён от перезаписи | Сохранены существующие данные | Сверить изменения и разрешить конфликт вручную |
| `planned` | Объект рассчитан в `--dry-run`; запись не выполнялась | Нет | Убрать `--dry-run` для переноса |
| `not-started` | Live-run остановился до начала независимой операции | Нет | Повторить ту же миграцию |

Статусы файлов:

| Статус | Смысл | Данные записаны | Что делать |
|---|---|---:|---|
| `complete` | Файл загружен и проверен | Да | Ничего |
| `partial` | Файл доступен через сохранённый fallback, но нативная передача неполна | Частично | Проверить fallback и повторить retryable-операцию |
| `failed` | Download, upload или verification файла выполнялся и завершился ошибкой | Возможно частично | Проверить причину и повторить запуск |
| `blocked` | Файл не обрабатывался, потому что destination-страница недоступна | Нет в этом запуске | Сначала устранить указанную ошибку страницы |
| `planned` | Файл только запланирован в `--dry-run` | Нет | Запустить без `--dry-run` |
| `not-started` | Live-run прерван до начала обработки файла | Нет | Повторить ту же миграцию |

`failed` означает неудавшуюся попытку самого объекта; `blocked` — сознательно не начатую операцию из-за upstream-зависимости. Поэтому зависимые блокировки показываются отдельно и не увеличивают число root errors.

Итоговый статус запуска: `completed`, `completed-with-warnings`, `partial`, `failed`, `cancelled` или `interrupted`. Provider-aware verification допускает безопасные различия сериализации, отмечает значимое упрощение оформления как `partial`, а потерю текста, ссылок, ячеек таблиц, кода, изображений, вложений или anchors — как ошибку. Технический статус `skeleton-created` уже содержит source-derived bootstrap, а не progress-placeholder.

## Разработка

```bash
git clone https://github.com/iwonz/ywtc.git
cd ywtc
npm ci
npm run workspace:init
npm run check
```

`npm run check` запускает проверку репозитория и секретов, production audit уровня high/critical, TypeScript, Biome, Knip, тесты, сборку, проверку npm-пакета и строгую OpenSpec-валидацию. Любое изменение проходит полный OpenSpec-цикл из [`AGENTS.md`](AGENTS.md).

Release Please рассчитывает SemVer из Conventional Commits. После merge release PR GitHub Actions проверяет релиз, публикует GitHub Release и npm-пакет через OIDC provenance, затем обновляет и проверяет Homebrew-формулу. Версии и changelog вручную не изменяются.
