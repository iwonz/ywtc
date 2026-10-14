<p align="center">
  <img src="docs/assets/readme-header.png" alt="Migration of a wiki tree, links, tables and attachments into a structured documentation space" width="100%">
</p>

# ywtc

`ywtc` — CLI на TypeScript для переноса разделов Yandex Wiki в Confluence Data Center через официальные REST API. Утилита сохраняет иерархию, форматирование, ссылки, изображения, вложения и статические снимки динамических таблиц. Повторный запуск продолжает миграцию по state-файлу и не удаляет данные в Confluence.

## Совместимость

Матрица актуальна на 14 октября 2026 года.

| Система | Версия | Статус | Условия |
| --- | --- | --- | --- |
| Yandex Wiki | [Public API v1](https://yandex.ru/support/wiki/ru/api-ref/access) | Поддерживается | Облачный сервис без устанавливаемой версии. Используются `https://api.wiki.yandex.net/v1` и пользовательский OAuth- или IAM-токен. |
| Confluence Data Center | `7.9–10.2.x` | Поддерживается | Требуются стандартные `/rest/api`, Confluence Storage Format, PAT и встроенные macros. Нижняя граница связана с появлением [PAT в 7.9](https://confluence.atlassian.com/enterprise/using-personal-access-tokens-1026032365.html). Актуальная документация Data Center — [10.2](https://confluence.atlassian.com/doc/confluence-data-center-and-server-documentation-135922.html). |
| Confluence Data Center | Ниже `7.9` | Не поддерживается | Basic Auth не реализован; используется PAT как Bearer-токен. |
| Confluence Data Center | Выше `10.2.x` | Не заявлено | Возможна совместимость при сохранении REST/storage-контракта; требуется предварительный `--dry-run`. |
| Confluence Server | Любая | Не заявлено | Отдельная матрица и live-проверки отсутствуют. |
| Confluence Cloud | Любая | Не поддерживается | API и авторизация Cloud несовместимы с текущей реализацией. |

Поддержка означает соответствие документированному [Confluence Data Center REST API](https://developer.atlassian.com/server/confluence/rest/latest/) и покрытие mock-интеграционными тестами, но не live-сертификацию каждой patch-версии. Перед миграцией выполняйте `--dry-run`; в production используйте поддерживаемую Atlassian версию.

## Как получить токены

### Yandex Wiki OAuth

- [ ] Убедитесь, что Wiki API включён, а пользователь видит переносимый раздел.
- [ ] В [Яндекс OAuth](https://oauth.yandex.ru/) выберите **Создать** → **Для доступа к API или отладки**.
- [ ] Добавьте разрешение **Чтение из Вики (`wiki:read`)**. Разрешение `wiki:write` не требуется.
- [ ] Скопируйте `ClientID` и под нужным пользователем откройте `https://oauth.yandex.ru/authorize?response_type=token&client_id=<ClientID>`.
- [ ] Сохраните токен в `.env`:

```dotenv
YANDEX_WIKI_TOKEN=<OAuth-токен>
YANDEX_WIKI_AUTH_TYPE=oauth
```

- [ ] В Yandex Tracker откройте **Администрирование → Организации** и скопируйте идентификатор в `YANDEX_WIKI_ORG_ID`.
- [ ] Используйте `YANDEX_WIKI_ORG_TYPE=yandex360` для Яндекс 360 или `cloud` для Yandex Cloud.

Для федеративного аккаунта задайте `YANDEX_WIKI_AUTH_TYPE=iam` и `YANDEX_WIKI_ORG_TYPE=cloud`. Поддерживается только пользовательский IAM-токен; сервисные аккаунты не поддерживаются. Срок действия IAM-токена — не более 12 часов. Подробнее: [Доступ к API Яндекс Вики](https://yandex.ru/support/wiki/ru/api-ref/access).

### Confluence Data Center PAT

- [ ] Используйте Confluence Data Center `7.9–10.2.x` и пользователя с правами на целевую страницу, создание и редактирование страниц и вложений.
- [ ] Откройте **Avatar → Settings → Personal access tokens → Create token**.
- [ ] Укажите имя, например `ywtc`, и срок действия.
- [ ] Создайте и сразу скопируйте токен: повторный просмотр недоступен.
- [ ] Заполните `.env`, включая context path базового URL:

```dotenv
CONFLUENCE_BASE_URL=https://confluence.example.com/confluence
CONFLUENCE_TOKEN=<PAT>
```

PAT наследует права пользователя. Если раздел **Personal access tokens** отсутствует, функцию должен включить администратор. Подробнее: [Using Personal Access Tokens](https://confluence.atlassian.com/enterprise/using-personal-access-tokens-1026032365.html).

Храните реальные токены только в локальном `.env`; файл исключён из Git.

## Быстрый запуск

- [ ] Установите Node.js 22.12+.
- [ ] Установите проект и подготовьте конфигурацию:

```bash
git clone https://github.com/iwonz/ywtc.git
cd ywtc
npm ci
cp .env.example .env
```

- [ ] Заполните `.env`: токены, `YANDEX_WIKI_ORG_ID`, тип организации и базовые URL.
- [ ] Выполните dry-run:

```bash
npm run migrate -- \
  --source "team/documentation" \
  --target "https://confluence.example.com/confluence/pages/viewpage.action?pageId=12345" \
  --dry-run
```

- [ ] Откройте напечатанный CLI путь `Report`. Отчёт находится в `.states/reports/<run-id>/` и содержит `index.html` со скачиваемым `report.json`.
- [ ] Проверьте структуру, переименования, ошибки, вложения и сравнение страниц; затем запустите миграцию:

```bash
npm run migrate -- --source "team/documentation" --target "12345"
```

Только одна страница, без дочерних:

```bash
npm run migrate -- \
  --source "team/documentation/specific-page" \
  --target "12345" \
  --single-page
```

`--concurrency` переопределяет общую параллельность. `--state` обычно не требуется: CLI создаёт отдельный state для каждой миграции. Сетевые лимиты задаются через [.env.example](.env.example).

## Параметры CLI

Параметры указываются после `npm run migrate --`; позиционные аргументы не поддерживаются.

| Параметр | Тип | Обязательный | Допустимые значения / формат | По умолчанию | Описание |
| --- | --- | --- | --- | --- | --- |
| `--source <value>` | `string` | Да | Slug: `team/documentation` или `/team/documentation/`<br>URL: `https://wiki.yandex.ru/team/documentation/` | — | Корневая страница. По умолчанию переносится всё доступное поддерево. |
| `--target <value>` | `string` | Да | ID: `12345`<br>Query: `https://confluence.example.com/confluence/pages/viewpage.action?pageId=12345`<br>ID в пути: `https://confluence.example.com/confluence/pages/12345` или `https://confluence.example.com/confluence/content/12345`<br>Современный URL: `https://confluence.example.com/confluence/spaces/DOC/pages/12345/Page+Title`<br>Display URL: `https://confluence.example.com/confluence/display/DOC/Page+Title` | — | Существующая родительская страница Confluence для корня миграции. |
| `--dry-run` | `boolean`-флаг | Нет | Без значения | `false` | Анализирует и конвертирует без `POST`/`PUT` в Confluence. |
| `--single-page` | `boolean`-флаг | Нет | Без значения | `false` | Переносит только `--source`, не запрашивая и не создавая дочерние страницы. Ссылки на них остаются ссылками Yandex Wiki. |
| `--concurrency <number>` | `integer` | Нет | От `1` до `32` | `MIGRATION_CONCURRENCY`, иначе `4` | Задаёт параллельность подготовки страниц; сетевые лимиты действуют отдельно. |
| `--state <path>` | `string` | Нет | Непустой путь, например `.states/custom/docs.json` | `.states/<state-id>.json` | Использует точно указанный JSON-файл вместо автоматического state. |
| `--fresh` | `boolean`-флаг | Нет | Без значения; совместим с автоматическим и явным state | `false` | Запускает миграцию без прежних сопоставлений. В live-режиме сохраняет текущий state как backup; в dry-run не изменяет файлы. Возможны дубликаты или суффиксы заголовков. |
| `--help`, `-h` | `boolean`-флаг | Нет | Без значения | `false` | Показывает справку без запуска миграции. |

Правила ввода:

- Передавайте значение без Markdown-обёртки `[название](URL)`.
- `--source` принимает slug или абсолютный URL с host из `YANDEX_WIKI_WEB_URL`, но не page ID.
- `--target` принимает page ID или абсолютный URL с origin из `CONFLUENCE_BASE_URL`, но не относительный URL, space key или URL пространства.
- Для display URL заголовок должен совпадать точно; пробелы допускаются как `+` или URL encoding.

Все переменные окружения, допустимые значения и сетевые лимиты описаны в [.env.example](.env.example).

## State и повторные запуски

Без `--state` CLI вычисляет ID из Yandex instance, организации и page ID, а также Confluence instance, space key и target page ID. Токены не участвуют. Эквивалентные slug/URL и ID/URL выбирают один state; другая source/target-пара — отдельный `.states/<state-id>.json`.

- Параллельные разные миграции используют независимые state-файлы.
- Повтор той же пары обновляет сопоставленные страницы и вложения без дубликатов.
- `--state <path>` использует только заданный файл. Несовпадение source/target останавливает запуск до изменений в Confluence.
- `--fresh` начинает с пустых сопоставлений и в live-режиме сохраняет прежний файл как `<state>.backup-<UTC timestamp>-<id>`. Новый state остаётся доступным для продолжения. Существующие страницы Confluence автоматически не принимаются в state, поэтому возможны дубликаты.
- `--fresh --dry-run` не создаёт и не изменяет state или backup; отчёт сохраняется в `.states/reports/`.

Не запускайте одну source/target-пару одновременно в нескольких процессах: атомарная запись предотвращает повреждение JSON, но не объединяет независимые сопоставления. При ошибке восстановите подходящий `.backup-*`, проверьте права на каталог или выберите корректный `--state`; CLI указывает проблемный путь и допустимые действия.

## Что переносится

- Иерархия текущих версий страниц и внутренние/внешние ссылки.
- Заголовки, списки, таблицы, код, notes, cuts, tabs и legacy inline-разметка с читаемыми fallback-блоками.
- Файлы и Wiki-изображения как Confluence attachments; внешние изображения остаются внешними.
- Dynamic Grid как статическая таблица.

Не переносятся история, комментарии, пользователи, права и watchers. Данные в Confluence автоматически не удаляются. Runtime-данные, cache и отчёты находятся в `.states/` и не публикуются.

## Релизы

Версии следуют [Semantic Versioning](https://semver.org/). Release Please анализирует Conventional Commits в `master` и поддерживает один release PR.

| Коммит | Следующая версия |
| --- | --- |
| `fix:`, `perf:`, `revert:` | Patch: `1.0.0 → 1.0.1` |
| `feat:` | Minor: `1.0.0 → 1.1.0` |
| `feat!:`, `fix!:` или footer `BREAKING CHANGE:` | Major: `1.0.0 → 2.0.0` |
| `docs:`, `test:`, `build:`, `ci:`, `chore:` | Релиз не создаётся |

Порядок публикации:

1. Изменения проходят OpenSpec и `npm run check`, затем попадают в `master` с Conventional Commit message.
2. Release Please создаёт или обновляет PR с `CHANGELOG.md`, `package.json`, lockfile и release manifest.
3. Maintainer проверяет рассчитанную версию и changelog и сливает release PR.
4. Workflow повторяет проверки, создаёт тег `vX.Y.Z` и GitHub Release, затем прикладывает `ywtc-X.Y.Z.tgz` и SHA-256 checksum.

Для работы release PR в **Settings → Actions → General → Workflow permissions** включите **Read and write permissions** и **Allow GitHub Actions to create and approve pull requests**. Долгоживущий PAT не требуется: workflow использует ограниченный `GITHUB_TOKEN`.

`v1.0.0` публикуется один раз проверенным tag workflow как исходная версия; дальнейшие ручные теги предназначены только для восстановления. Тег должен быть валидным возрастающим SemVer и совпадать с package, lockfile, manifest и changelog. Повторный запуск заменяет только архив и checksum существующего Release. npm registry не используется.

## Локальная разработка

```bash
npm ci
npm run check
npm run test:watch
npm run format
```

`npm run check` выполняет release hygiene, typecheck, Biome, Knip, тесты, build и OpenSpec validation. Любая доработка проходит OpenSpec-цикл из [AGENTS.md](AGENTS.md); текущий контракт находится в [openspec/specs/wiki-migration/spec.md](openspec/specs/wiki-migration/spec.md).

Для внутреннего TLS используйте `NODE_EXTRA_CA_CERTS`; отключение проверки сертификатов не поддерживается.

## Ссылки

- [Yandex Wiki API](https://yandex.ru/support/wiki/ru/api-ref/access)
- [Confluence Data Center REST API](https://developer.atlassian.com/server/confluence/rest/latest/)
- [Репозиторий](https://github.com/iwonz/ywtc)
- [MIT License](LICENSE)
