<p align="center">
  <img src="docs/assets/readme-header.png" alt="Yandex Wiki and Confluence content moving through the ywtc pipeline" width="100%">
</p>

# ywtc

`ywtc` — CLI для контролируемого переноса страниц между Yandex Wiki и Confluence, а также экспорта в Markdown или автономный HTML. Утилита сохраняет структуру, ссылки и вложения, отмечает деградации, проверяет результат и продолжает прерванную операцию по state-файлу. Исходные данные и страницы назначения автоматически не удаляются.

Требуются Node.js `>=24` и npm `>=11.5.1`.

## Возможности

| Что переносится | Результат |
| --- | --- |
| Страницы и иерархия | Одна страница, структурное поддерево или граф связанных страниц |
| Заголовки, текст, списки, цитаты, код, таблицы | Нативная разметка назначения, насколько это допускает формат |
| Внутренние ссылки и якоря | Переписываются на перенесённые страницы; внешние остаются внешними |
| Изображения и вложения | Потоковая передача с проверкой имени, размера и SHA-256 |
| Yandex notes, cuts, tabs и Grid | Ближайший нативный эквивалент; Grid становится статической таблицей |
| Confluence macros и resource identifiers | Сохраняются напрямую для same-vendor transfer либо преобразуются |
| Неподдерживаемые vendor-конструкции | Читаемый fallback и raw snapshot: attachment или файл в `_source/` |
| История, комментарии, пользователи, права, watchers | Не переносятся |

## Минимальный сценарий

- [ ] Установите CLI: `npm install -g @iwonz/ywtc`.
- [ ] Создайте workspace: `ywtc init`.
- [ ] Заполните `~/.ywtc/ywtc.config.yaml` и секреты в `~/.ywtc/.env`.
- [ ] Проверьте доступ: `ywtc doctor --source <source> --destination <destination>`.
- [ ] Выполните dry-run: `ywtc migrate --source <source> --destination <destination> --dry-run`.
- [ ] Повторите команду без `--dry-run`.

## Установка

```bash
# npm
npm install -g @iwonz/ywtc

# без глобальной установки
npx @iwonz/ywtc@latest --version

# Homebrew
brew tap iwonz/ywtc https://github.com/iwonz/ywtc.git
brew install ywtc
```

Проверить или установить обновление:

```bash
ywtc update
ywtc update --install             # только global npm или Homebrew
ywtc update --install --via brew
```

## Профили и workspace

Workspace выбирается в порядке `--workdir` → текущий каталог с `.ywtc-workspace.json` → `~/.ywtc`. Команда `init` идемпотентна и не перезаписывает существующие файлы:

```text
~/.ywtc/
├── .ywtc-workspace.json
├── .env                    # только секреты, mode 0600
├── ywtc.config.yaml        # подключения без секретов
└── .states/                # state, cache и HTML-отчёты
```

Минимальная конфигурация двух подключений:

```yaml
schemaVersion: 2
defaults:
  timeoutMs: 30000
  concurrency: 4

connections:
  wiki-prod:
    type: yandex-wiki
    apiUrl: https://api.wiki.yandex.net/v1
    webUrl: https://wiki.example.ru
    authType: oauth
    tokenEnv: YANDEX_WIKI_TOKEN
    organization: {type: yandex360, id: organization-id}

  confluence-prod:
    type: confluence
    deployment: data-center
    baseUrl: https://confluence.example.ru/confluence
    authType: pat
    tokenEnv: CONFLUENCE_TOKEN
```

```dotenv
YANDEX_WIKI_TOKEN=
CONFLUENCE_TOKEN=
# Для Confluence Cloud:
CONFLUENCE_EMAIL=
```

Полный шаблон с сетевыми лимитами находится в [`ywtc.config.example.yaml`](ywtc.config.example.yaml). Значения process environment имеют приоритет над `.env`. Секреты проверяются только для профилей, участвующих в текущей операции.

## Как получить токены

### Yandex Wiki

- [ ] Создайте приложение в [Яндекс OAuth](https://oauth.yandex.ru/) для доступа к API.
- [ ] Выдайте приложению права Wiki на чтение; для destination также нужны права записи.
- [ ] Получите OAuth-токен пользователя, имеющего доступ к нужным страницам. Для федеративного пользователя Yandex Cloud можно использовать IAM-токен и `authType: iam`.
- [ ] Найдите ID организации в **Yandex Tracker → Администрирование → Организации**.
- [ ] Укажите `organization.type: yandex360` для Яндекс 360 либо `cloud` для Cloud Organization.
- [ ] Сохраните токен в env-переменной, указанной в `tokenEnv`.

### Confluence Data Center

- [ ] Откройте **Avatar → Settings → Personal access tokens → Create token**.
- [ ] Создайте PAT и сохраните его в env-переменной из `tokenEnv`.
- [ ] Используйте `deployment: data-center` и `authType: pat`.
- [ ] Убедитесь, что пользователь может читать source и создавать/изменять страницы и вложения destination.

### Confluence Cloud

- [ ] Создайте [Atlassian API token](https://id.atlassian.com/manage-profile/security/api-tokens).
- [ ] Используйте `deployment: cloud`, `authType: api-token`, `tokenEnv` и `emailEnv`.
- [ ] Сохраните API token и email Atlassian-аккаунта в соответствующих env-переменных.
- [ ] Проверьте доступ аккаунта к source/destination space.

## Направления и совместимость

| Source | Destination | Поддержка |
| --- | --- | --- |
| Yandex Wiki | Confluence | Да |
| Yandex Wiki | Yandex Wiki | Да, включая другой профиль/инстанс |
| Confluence | Yandex Wiki | Да |
| Confluence | Confluence | Да, включая другой профиль/инстанс |
| Yandex Wiki или Confluence | Markdown | Да |
| Yandex Wiki или Confluence | статический HTML | Да |

| Система | Поддерживаемый контракт | Авторизация |
| --- | --- | --- |
| Yandex Wiki | Public API v1; tolerant parsing новых необязательных полей | OAuth или пользовательский IAM; `X-Org-Id`/`X-Cloud-Org-Id` |
| Confluence Data Center | 7.9+ без искусственной верхней границы; capabilities проверяются до записи | Bearer PAT |
| Confluence Cloud | Текущий публичный REST v2 для страниц и v1 для attachments | Email + API token |

Confluence Server, Data Center Basic Auth и OAuth app-flow пока не поддерживаются. Совместимость определяется preflight-проверкой используемых API/capabilities, а не обещанием для каждой patch-версии.

## Параметры `migrate`

```text
ywtc migrate --source <locator> --destination <locator|directory> [options]
```

| Параметр | Обязателен | Значения / default | Назначение |
| --- | --- | --- | --- |
| `--source <value>` | Да | URL, page ID или slug | Исходная страница |
| `--destination <value>` | Да | URL, page ID, slug или каталог | Родительская страница либо каталог экспорта |
| `--source-profile <name>` | Иногда | имя из `connections` | Нужен для неоднозначного короткого ID/slug |
| `--destination-profile <name>` | Иногда | имя из `connections` | То же для удалённой destination |
| `--scope <mode>` | Нет | `page`, `subtree` (default), `linked` | Граница выбора страниц |
| `--format <format>` | Для каталога | `markdown`, `html` | Однозначно включает файловый экспорт |
| `--archive` | Нет | только с `--format` | Оставляет каталог и создаёт ZIP рядом |
| `--dry-run` | Нет | `false` | Полный discovery/план без destination writes |
| `--workdir <path>` | Нет | marker CWD или `~/.ywtc` | Выбирает workspace |
| `--state <path>` | Нет | `.states/<automatic-id>.json` | Явный state внутри workspace |
| `--fresh` | Нет | `false` | Не использует mappings; live-run сохраняет backup state |
| `--concurrency <n>` | Нет | `1..64`, config default `4` | Параллельность оркестрации; профильные лимиты действуют отдельно |

Полный URL автоматически сопоставляется с профилем по нормализованному base URL. Для короткого ID/slug профиль выбирается автоматически только при единственном подходящем подключении; иначе CLI перечисляет допустимые имена. Каталог считается файловой destination только вместе с `--format`.

### Scope

- `page` — только исходная страница.
- `subtree` — страница и все структурные потомки; режим по умолчанию.
- `linked` — детерминированный BFS по внутренним ссылкам и page/include references до фиксированной точки. Циклы безопасно завершаются, страница обрабатывается один раз. Внешние и недоступные ссылки не обходятся и отражаются в отчёте.

## Частые примеры

```bash
# Связанные страницы Yandex Wiki → Confluence
ywtc migrate \
  --source https://wiki.example.ru/team/start \
  --destination https://confluence.example.ru/pages/viewpage.action?pageId=123 \
  --scope linked

# Confluence → Yandex Wiki по коротким идентификаторам
ywtc migrate \
  --source-profile confluence-prod --source 123456 \
  --destination-profile wiki-prod --destination team/archive \
  --scope subtree

# Одна страница без потомков
ywtc migrate --source-profile wiki-prod --source team/start \
  --destination-profile confluence-prod --destination 123 --scope page

# Автономный HTML-сайт и ZIP
ywtc migrate --source-profile confluence-prod --source 123456 \
  --destination ./exports/knowledge-base --format html --scope linked --archive

# Markdown-экспорт в отдельном workspace
ywtc migrate --workdir ./migration --source-profile wiki-prod --source team/start \
  --destination ./export --format markdown --dry-run
```

`doctor` принимает те же `source`, `destination`, profile, `scope` и `format`; с endpoints выполняет только read-only capability-preflight. Без endpoints проверяет workspace, конфигурацию и все секреты.

## Файловый экспорт

Markdown создаёт `index.md`, `pages/`, `attachments/`, manifest `.ywtc-export.json` и, при деградациях, `_source/`. HTML создаёт автономный адаптивный сайт с теми же данными и локальным `assets/site.css`; он работает через `file://` и на обычном static hosting без CDN/runtime.

Экспорт строится в staging-каталоге. Существующий каталог заменяется только при совпадающем ywtc manifest; предыдущая версия сохраняется как timestamped backup. ZIP не перезаписывает уже существующий архив.

## State, отчёты и повторный запуск

Автоматический state ID строится из канонических профилей и ID source/destination; форма URL/slug/ID и `scope` на него не влияют. Поэтому одна и та же пара endpoints возобновляет один state, а разные пары получают разные файлы.

- Повторный запуск обновляет только сопоставленные объекты и не создаёт дубликаты.
- Страница, изменённая вручную после прошлого запуска, получает `conflict` и не перезаписывается.
- `--fresh` начинает с чистых mappings; live-run сохраняет прежний state как backup и может создать новые страницы.
- State schema v1 не мигрируется автоматически и остаётся нетронутой.
- SIGINT/SIGTERM останавливает постановку новых задач, сохраняет state/report и возвращает `130`/`143`.
- Каждый запуск создаёт `.states/reports/<run-id>/index.html` и `report.json`: направление, дерево, link graph, циклы, вложения, размеры, деградации, ошибки и side-by-side preview.

Коды выхода: `0` — завершено; `1` — partial/ошибка verification; `2` — usage/config/preflight; `130`/`143` — остановка сигналом.

## Переход на 2.0

Обратной совместимости с предварительным CLI и state v1 нет:

| Было | Стало |
| --- | --- |
| `--target <value>` | `--destination <value>` |
| `--single-page` | `--scope page` |
| Один набор env-подключений | Именованные подключения в `ywtc.config.yaml`; `.env` содержит только секреты |
| State schema v1 | Новый автоматический provider-neutral state v2 |

Старые флаги отклоняются с точной подсказкой. Для переноса создайте новый workspace или сохраните старые state-файлы отдельно и выполните `ywtc init`.

## Разработка

```bash
git clone https://github.com/iwonz/ywtc.git
cd ywtc
npm ci
npm run workspace:init
npm run check
```

`npm run check` запускает release/hygiene checks, аудит production-зависимостей (high/critical), TypeScript, Biome, Knip, тесты, сборку, проверку устанавливаемого tarball и строгую OpenSpec-валидацию. Изменения оформляются полным OpenSpec-циклом согласно [`AGENTS.md`](AGENTS.md).

Release Please формирует SemVer-релизы из Conventional Commits; breaking change выпускается как major. GitHub Actions публикует `@iwonz/ywtc` с provenance, GitHub Release и обновлённую Homebrew-формулу.

Лицензия: [MIT](LICENSE).
