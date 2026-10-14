<p align="center">
  <img src="docs/assets/readme-header.png" alt="Yandex Wiki content moving through the ywtc pipeline into Confluence" width="100%">
</p>

# ywtc

`ywtc` переносит доступную страницу или раздел Yandex Wiki в Confluence, сохраняя иерархию, форматирование, ссылки, изображения, вложения и статические снимки Grid. Миграция возобновляется по state-файлу и никогда автоматически не удаляет данные назначения.

## Установка и запуск

Требуется Node.js `>=22.12`.

```bash
# npm, глобальная команда
npm install -g @iwonz/ywtc
ywtc --version

# либо одноразовый запуск
npx @iwonz/ywtc@latest --version

# Homebrew: текущий репозиторий используется как tap
brew tap iwonz/ywtc https://github.com/iwonz/ywtc.git
brew install ywtc
```

### Минимальный сценарий

- [ ] Инициализируйте рабочую директорию:

  ```bash
  ywtc init
  ```

- [ ] Заполните созданный файл `~/.ywtc/.env` по [таблице настроек](#переменные-окружения).

- [ ] Проверьте план миграции без записи в Confluence:

  ```bash
  ywtc migrate --source "team/docs" --target "12345" --dry-run
  ```

- [ ] Если dry-run завершился без критических ошибок, запустите миграцию:

  ```bash
  ywtc migrate --source "team/docs" --target "12345"
  ```

### Частые примеры

```bash
# Проверить конфигурацию и доступ к конкретным страницам
ywtc doctor --source "team/docs" --target "12345"

# Перенести только исходную страницу, без дочерних
ywtc migrate --source "team/docs" --target "12345" --single-page --dry-run

# Передать source и target полными URL
ywtc migrate \
  --source "https://wiki.yandex.ru/team/docs/" \
  --target "https://confluence.example.com/confluence/pages/viewpage.action?pageId=12345" \
  --dry-run

# Использовать отдельную рабочую директорию
ywtc migrate --source "team/docs" --target "12345" --workdir "./migration" --dry-run

# Построить план без существующих mappings state
ywtc migrate --source "team/docs" --target "12345" --fresh --dry-run
```

Live-запуск с `--fresh` может создать дубликаты; правила повторного запуска описаны в разделе [State, отчёты и повторный запуск](#state-отчёты-и-повторный-запуск).

## Совместимость

Матрица пересмотрена 14 октября 2026 года. Поддержка означает проверку документированных контрактов и mock-профилей, а не live-сертификацию каждой patch-версии.

| Система | Поддержка | Авторизация и API |
| --- | --- | --- |
| Yandex Wiki | Public API `v1` | OAuth или пользовательский IAM; `X-Org-Id` либо `X-Cloud-Org-Id` |
| Confluence Data Center | `7.9+`, без искусственной верхней границы | PAT как Bearer; `/rest/api`; версия и capabilities проверяются до записи |
| Confluence Cloud | Текущий публичный REST | Email + API token; REST v2 для pages/spaces, REST v1 для attachments |
| Confluence Data Center `<7.9` | Нет | PAT появился в 7.9 |
| Confluence Server, DC Basic Auth, Cloud PAT/OAuth app | Нет | Эти профили отклоняются конфигурацией |

Ссылки: [Yandex Wiki API v1](https://yandex.ru/support/wiki/ru/api-ref/access), [Data Center REST](https://developer.atlassian.com/server/confluence/rest/latest/), [Data Center PAT](https://confluence.atlassian.com/enterprise/using-personal-access-tokens-1026032365.html), [Cloud REST v2](https://developer.atlassian.com/cloud/confluence/rest/v2/), [Cloud attachments v1](https://developer.atlassian.com/cloud/confluence/rest/v1/api-group-content---attachments/).

## Токены

### Yandex Wiki

- [ ] В [Яндекс OAuth](https://oauth.yandex.ru/) создайте приложение «Для доступа к API или отладки».
- [ ] Добавьте только `wiki:read` и получите токен под пользователем, который видит исходный раздел.
- [ ] Для OAuth задайте `YANDEX_WIKI_AUTH_TYPE=oauth`; для федеративного пользователя Yandex Cloud — `iam`.
- [ ] Скопируйте ID организации из **Yandex Tracker → Администрирование → Организации**.
- [ ] Для Яндекс 360 используйте `YANDEX_WIKI_ORG_TYPE=yandex360`; для Cloud Organization — `cloud`.

### Confluence Data Center

- [ ] Откройте **Avatar → Settings → Personal access tokens → Create token**.
- [ ] Скопируйте PAT и задайте профиль `data-center` + `pat`.
- [ ] У пользователя должны быть права просмотра target, создания/редактирования страниц и вложений. PAT наследует его права.

### Confluence Cloud

- [ ] Создайте [Atlassian API token](https://id.atlassian.com/manage-profile/security/api-tokens).
- [ ] Задайте профиль `cloud` + `api-token`, email Atlassian-аккаунта и token.
- [ ] Проверьте, что аккаунт видит target space и может добавлять pages/attachments.

Токены записываются только в `<workdir>/.env`; этот файл и `.states/` исключены из Git и npm-пакета.

## Workspace

Рабочая директория выбирается строго так:

1. `--workdir <path>`;
2. текущий каталог с `.ywtc-workspace.json`;
3. `~/.ywtc`.

`ywtc init` идемпотентно создаёт marker, `.env` и `.states/`, не заменяя существующие файлы. `migrate` автоматически создаёт отсутствующий workspace, но при незаполненной конфигурации останавливается до API-запросов и показывает путь к `.env`. Переменные процесса имеют приоритет над значениями файла.

Для продолжения state из checkout v1 выполните один раз:

```bash
ywtc init --workdir .
```

## Команды и параметры

| Команда / параметр | Тип | Обязательность | Значения и примеры | По умолчанию | Назначение |
| --- | --- | --- | --- | --- | --- |
| `init` | command | — | `ywtc init --workdir ./migration` | выбранный workspace | Создаёт workspace без перезаписи данных |
| `doctor` | command | — | без страниц или с обеими `--source`/`--target` | local-only | Проверяет config; с парой страниц — read-only preflight |
| `migrate` | command | — | `ywtc migrate ...` | — | Планирует или выполняет перенос |
| `update` | command | — | `ywtc update [--install] [--via npm\|brew]` | check-only | Проверяет npm latest; безопасно обновляет только global npm/Homebrew |
| `--source <value>` | string | Для `migrate`; парно для `doctor` | `team/docs`, `/team/docs/`, `https://wiki.yandex.ru/team/docs/` | — | Slug или URL на host из `YANDEX_WIKI_WEB_URL`; ID и Markdown-ссылки не принимаются |
| `--target <value>` | string | Для `migrate`; парно для `doctor` | `12345`; DC `...?pageId=12345`, `/pages/12345`, `/display/DOC/Page+Title`; Cloud `/wiki/spaces/DOC/pages/12345/Title` | — | Существующая родительская страница на origin из `CONFLUENCE_BASE_URL` |
| `--workdir <path>` | path | Нет | `./migration`, `/opt/ywtc`, `~/.ywtc` | marker CWD, затем `~/.ywtc` | Workspace для `init`, `doctor`, `migrate` |
| `--dry-run` | flag | Нет | Без значения | `false` | Полный анализ без Confluence `POST`/`PUT` |
| `--single-page` | flag | Нет | Без значения | `false` | Переносит только source; ссылки за scope остаются Yandex Wiki |
| `--concurrency <n>` | integer | Нет | `1..32` | `MIGRATION_CONCURRENCY` | Параллельность подготовки; API-лимиты действуют отдельно |
| `--state <path>` | path | Нет | `.states/custom.json` | `.states/<state-id>.json` | Явный state; относительный путь считается от workdir и не может выйти за его пределы |
| `--fresh` | flag | Нет | Без значения | `false` | Игнорирует mappings; live сохраняет backup, dry-run не изменяет state |
| `--install` | flag | Нет | Только `update` | `false` | Разрешает update изменить подходящую global npm/Homebrew установку |
| `--via <channel>` | enum | Нет | `npm`, `brew` | автоопределение | Выбирает поддерживаемый канал update |
| `--help`, `-h` | flag | Нет | Global или после команды | — | Показывает справку без workspace/config |
| `--version`, `-v` | flag | Нет | Global | — | Печатает версию без workspace/config |

Прежний вызов `ywtc --source ...` удалён в `2.0.0`; используйте `ywtc migrate --source ...`.

## Переменные окружения

| Переменная | Обязательность | Значения / default | Описание |
| --- | --- | --- | --- |
| `YANDEX_WIKI_TOKEN` | Да | secret | OAuth или пользовательский IAM token |
| `YANDEX_WIKI_AUTH_TYPE` | Нет | `oauth` (default), `iam` | Схема Authorization |
| `YANDEX_WIKI_ORG_ID` | Да | string | ID организации |
| `YANDEX_WIKI_ORG_TYPE` | Нет | `yandex360` (default), `cloud` | Выбирает org header |
| `YANDEX_WIKI_API_URL` | Нет | `https://api.wiki.yandex.net/v1` | Public API v1 base URL |
| `YANDEX_WIKI_WEB_URL` | Нет | `https://wiki.yandex.ru` | Основа source URL и внешних ссылок |
| `CONFLUENCE_DEPLOYMENT` | Да | `data-center`, `cloud` | Адаптер назначения |
| `CONFLUENCE_AUTH_TYPE` | Да | `pat` для DC, `api-token` для Cloud | Несовместимая пара отклоняется |
| `CONFLUENCE_BASE_URL` | Да | DC: `https://confluence.example.com/confluence`; Cloud: `https://example.atlassian.net` | Base/context URL; Cloud `/wiki` нормализуется автоматически |
| `CONFLUENCE_TOKEN` | Да | secret | PAT или Atlassian API token |
| `CONFLUENCE_EMAIL` | Только Cloud | `person@example.com` | Email для Basic API-token auth |
| `HTTP_TIMEOUT_MS` | Нет | `30000`, `1000..300000` | Timeout одного HTTP-запроса |
| `MIGRATION_CONCURRENCY` | Нет | `4`, `1..32` | Подготовка страниц |
| `YANDEX_API_CONCURRENCY` | Нет | `4`, `1..32` | Одновременные metadata-запросы |
| `YANDEX_DOWNLOAD_CONCURRENCY` | Нет | `2`, `1..16` | Одновременные загрузки файлов |
| `YANDEX_API_RPS` / `YANDEX_API_BURST` | Нет | `8` / `8` | Общий token bucket Yandex |
| `CONFLUENCE_READ_CONCURRENCY` | Нет | `4`, `1..32` | Одновременные чтения |
| `CONFLUENCE_WRITE_CONCURRENCY` | Нет | `2`, `1..16` | Одновременные page writes |
| `CONFLUENCE_UPLOAD_CONCURRENCY` | Нет | `2`, `1..16` | Одновременные attachments |
| `CONFLUENCE_API_RPS` / `CONFLUENCE_API_BURST` | Нет | `8` / `10` | Общий token bucket Confluence |

Для внутреннего TLS используйте `NODE_EXTRA_CA_CERTS`; отключение проверки сертификатов не поддерживается.

## State, отчёты и повторный запуск

Автоматический ID зависит от Yandex instance/organization/page и Confluence deployment/instance/space/target, но не от токенов. Эквивалентные формы одного source/target выбирают один state; разные пары — разные файлы.

- Повторный запуск обновляет только сопоставленные страницы и attachments, не создаёт дубликаты и ничего не удаляет.
- Data Center v1-state сохраняет прежнюю canonical identity. Cloud дополнительно использует deployment и space ID.
- `--fresh` сохраняет live-state как `.backup-*`; возможны дубликаты, поскольку несопоставленные страницы не присваиваются автоматически.
- Одну пару source/target нельзя безопасно запускать параллельно в двух процессах.
- Каждый запуск пишет ignored bundle `.states/reports/<run-id>/index.html` + `report.json`: дерево, статусы, объёмы, ссылки, attachments, ошибки и side-by-side preview.

## Что переносится

| Объект | Статус | Результат и ограничения |
| --- | --- | --- |
| Страницы и вложенность | Переносится | Текущая версия исходного дерева создаётся под выбранной target-страницей |
| Текст и базовое форматирование | Переносится | YFM-текст, заголовки, абзацы, списки, цитаты, код и обычные таблицы преобразуются в Confluence Storage Format |
| Notes, cuts и tabs | С преобразованием | Notes становятся `info`/`tip`/`warning`, cuts — `expand`, tabs — статическими секциями |
| Ссылки и anchors | Переносится | Внутренние ссылки и якоря переписываются на созданные страницы; ссылки вне дерева остаются ведущими в Yandex Wiki |
| Изображения и файлы Wiki | Переносится | Ресурсы загружаются как Confluence attachments; внешние изображения остаются внешними |
| Grid | С преобразованием | Динамическая таблица становится статической таблицей без интерактивности |
| Неподдерживаемый rich content | С деградацией | Формулы, диаграммы и интерактивные элементы получают читаемый fallback и warning с сохранением исходного текста, когда это возможно |
| История, comments, users, permissions, watchers | Не переносится | Эти сущности не входят в текущую версию мигратора |

## Обновление

```bash
ywtc update                 # только проверка
ywtc update --install       # global npm или Homebrew
ywtc update --install --via brew
```

Для npx, local dependency и source checkout команда не меняет окружение, а печатает безопасную инструкцию. Homebrew после установки обновляется обычными `brew update && brew upgrade ywtc`.

## Разработка и релизы

```bash
git clone https://github.com/iwonz/ywtc.git
cd ywtc
npm ci
npm run workspace:init
npm run check
```

Все изменения проходят [полный OpenSpec-цикл](AGENTS.md). `npm run check` выполняет hygiene scan, typecheck, Biome, Knip,  tests, build, установку packed package и strict OpenSpec validation.

Release Please формирует SemVer PR: `feat` → minor; `fix`/`perf`/`revert` → patch; `!`/`BREAKING CHANGE` → major. Остальные Conventional Commit-типы попадают в notes, но сами не создают релиз. После merge workflow публикует npm через GitHub OIDC с provenance, прикладывает tarball/checksum к GitHub Release и после macOS-проверок коммитит `Formula/ywtc.rb` в `master`.

Одноразовый bootstrap нового npm-пакета:

```bash
npm run release:bootstrap
npx npm@12.2.0 trust github @iwonz/ywtc \
  --file release.yml --repository iwonz/ywtc --allow-publish
```

Bootstrap публикуется как `0.0.0`; OTP вводится только локально и не попадает в Git/логи. Затем release PR должен быть слит в пределах срока действия trust-настройки. Лицензия: [MIT](LICENSE).
