<p align="center">
  <img src="docs/assets/readme-header.png" alt="Yandex Wiki and Confluence sources moving through ywtc to Confluence, Yandex Wiki, Markdown, and HTML destinations" width="100%">
</p>

# ywtc

## Описание

`ywtc` — CLI для переноса страниц между Yandex Wiki и Confluence и экспорта в Markdown или автономный HTML. Утилита сохраняет структуру, ссылки и вложения, явно отмечает деградации и продолжает прерванные операции по state-файлу. Исходные данные и страницы назначения автоматически не удаляются.

Требуются Node.js `>=24` и npm `>=11.5.1`. Лицензия — [MIT](LICENSE).

## Возможности

| Что переносится | Результат |
| --- | --- |
| Страницы и иерархия | Одна страница, структурное поддерево или граф связанных страниц |
| Заголовки, текст, списки, цитаты, код и таблицы | Нативная разметка назначения, насколько это допускает формат |
| Внутренние ссылки и якоря | Переписываются на перенесённые страницы; внешние остаются внешними |
| Изображения и вложения | Потоковая передача с проверкой имени, размера и SHA-256 |
| Yandex notes, cuts, tabs и Grid | Ближайший нативный эквивалент; Grid становится статической таблицей |
| Confluence macros и resource identifiers | Сохраняются напрямую при переносе между Confluence либо преобразуются |
| Неподдерживаемые vendor-конструкции | Читаемый fallback и raw snapshot в attachment или `_source/` |
| История, комментарии, пользователи, права и watchers | Не переносятся |

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
- [ ] Выполните предложенную wizard команду первой миграции с `--dry-run`, заменив placeholders страниц.
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
| `--format <format>` | `doctor`, `migrate` | `markdown` или `html` | Делает destination файловым каталогом |
| `--archive` | `migrate` | только вместе с `--format` | Дополнительно создать ZIP рядом с каталогом |
| `--dry-run` | `migrate` | default `false` | Discovery и план без записи в destination |
| `--fresh` | `migrate` | default `false` | Игнорировать mappings текущего state |
| `--concurrency <n>` | `migrate` | `1..64`; иначе config default | Общая параллельность; профильные лимиты сохраняются |
| `--state <path>` | `migrate` | внутри workspace | Явный state вместо автоматического |
| `--workdir <path>` | `init`, `doctor`, `migrate` | config в CWD или `~/.ywtc` | Явно выбрать workspace; поддерживается `~/...` |
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
- `subtree` — страница и все структурные потомки; default.
- `linked` — детерминированный BFS по внутренним ссылкам и page/include references до фиксированной точки. Циклы завершаются безопасно, каждая страница обрабатывается один раз; внешние и недоступные ссылки не обходятся и попадают в отчёт.

## Частые примеры

```bash
# Wizard в отдельном workspace
ywtc init --interactive --workdir ./migration

# Неинтерактивная инициализация для ручного или автоматизированного заполнения YAML
ywtc init --workdir ./migration

# Yandex Wiki → Confluence: граф связанных страниц
ywtc migrate --source https://wiki.example.com/team/start \
  --destination https://confluence.example.com/confluence/pages/viewpage.action?pageId=123 \
  --scope linked

# Confluence → Yandex Wiki
ywtc migrate --source-profile confluence-prod --source 123456 \
  --destination-profile wiki-prod --destination team/archive

# Yandex Wiki → Yandex Wiki: одна страница
ywtc migrate --source-profile wiki-prod --source team/start \
  --destination-profile wiki-archive --destination archive/start --scope page

# Confluence → Confluence: новый state в отдельном workspace
ywtc migrate --workdir ./migration --source-profile confluence-prod --source 123456 \
  --destination-profile confluence-archive --destination 654321 --fresh

# Автономный HTML и ZIP
ywtc migrate --source-profile confluence-prod --source 123456 \
  --destination ./exports/knowledge-base --format html --scope linked --archive

# Markdown dry-run
ywtc migrate --source-profile wiki-prod --source team/start \
  --destination ./exports/knowledge-base --format markdown --dry-run
```

Wizard проверяет только доступность API и авторизацию без страниц и внешних записей. `doctor` принимает те же endpoints, profiles, `scope` и `format`: без endpoints он проверяет workspace, конфигурацию и секреты, а с обоими endpoints выполняет page-specific read-only capability-preflight.

## Файловый экспорт

Markdown создаёт `index.md`, `pages/`, `attachments/`, `.ywtc-export.json` и, при деградациях, `_source/`. HTML создаёт автономный адаптивный сайт с локальным `assets/site.css`; он работает через `file://` и на static hosting без CDN или внешнего runtime.

Экспорт сначала строится в staging-каталоге. Существующий каталог заменяется только при строгом актуальном manifest с `tool: ywtc` и той же canonical identity, а прежний каталог сохраняется как timestamped backup. `--archive` оставляет каталог и создаёт новый ZIP, не перезаписывая существующий архив.

## State

По умолчанию state хранится в `<workdir>/.states/<automatic-id>.json`. ID строится из канонических профилей и ID source/destination, а для файлового экспорта также из формата; форма locator и `scope` на ID не влияют. State имеет единственный строгий актуальный формат без поля версии. Несоответствующий файл не преобразуется и не изменяется. Относительный `--state` разрешается внутри workspace, выход за его границы запрещён.

### Повторные запуски

- Одинаковые source и destination автоматически подхватывают один state независимо от формы URL/ID/slug.
- Уже сопоставленные страницы и вложения обновляются без создания дубликатов.
- Страница, изменённая вручную после прошлого запуска, получает `conflict` и не перезаписывается.
- `--fresh` игнорирует mappings; перед live-run прежний state сохраняется как backup, а destination может получить новые объекты.
- Удалённые из source объекты автоматически не удаляются из destination.

При SIGINT/SIGTERM новые задачи не ставятся, активные безопасные операции завершаются, state и отчёт сохраняются. Коды выхода: `0` — completed; `1` — partial или verification failure; `2` — usage/config/preflight; `130`/`143` — остановка сигналом.

## Отчёты

Каждый запуск создаёт `<workdir>/.states/reports/<run-id>/index.html` и `report.json`. Отчёт содержит направление, профили, дерево и link graph, циклы, вложения, размеры, деградации, raw snapshots, ошибки и side-by-side preview страниц; unversioned JSON доступен для автоматической обработки.

Итоговый статус запуска: `completed`, `completed-with-warnings`, `partial`, `failed`, `cancelled` или `interrupted`. Для страниц фиксируются `discovered`, `planned`, `skeleton-created`, `complete`, `partial`, `conflict`, `failed` и `blocked`.

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
