<p align="center">
  <img src="docs/assets/readme-header.png" alt="Yandex Wiki and Confluence sources moving through ywtc to Confluence, Yandex Wiki, Markdown, and HTML destinations" width="100%">
</p>

# ywtc

`ywtc` переносит страницы между Yandex Wiki и Confluence и экспортирует их в Markdown или автономный HTML. Иерархия, доступное содержимое и прогресс сохраняются; автоматического удаления нет.

Требуются Node.js `>=24` и npm `>=11.5.1`. Лицензия — [MIT](LICENSE).

## Быстрый старт

```bash
npm install -g @iwonz/ywtc
ywtc init --interactive
ywtc migrate --interactive
```

`init` создаёт workspace, настраивает оба подключения и проверяет их. `migrate` собирает параметры, сначала выполняет dry-run и запускает live только после подтверждения.

### Какой сценарий выбрать

| Сценарий | Минимальный путь |
| --- | --- |
| Первый перенос | Три команды выше: настройка → dry-run → подтверждённый live. |
| Личное пространство Yandex Wiki → Confluence | Готовые dry-run/live [команды](#перенос-личного-пространства-yandex-wiki--confluence). |
| Личное пространство Confluence → Yandex Wiki | Второй пример в [том же блоке](#перенос-личного-пространства-yandex-wiki--confluence). |
| Статический экспорт | Передать каталог назначения и `--format markdown|html`; для ZIP добавить `--archive`. |
| Продолжить или исправить перенос | `migrate` — resume, `retry <run-id>` — ошибки, `sync <run-id>` — изменения. |

Для автоматизации укажите `--source`, `--destination` и сначала добавьте `--dry-run`. Остальные способы установки:

```bash
# Без глобальной установки
npx @iwonz/ywtc@latest --version

# Homebrew
brew tap iwonz/ywtc https://github.com/iwonz/ywtc.git
brew trust --tap iwonz/ywtc
brew install ywtc
```

`ywtc update` проверяет версию, `ywtc update --install` обновляет через найденный канал, `--via npm|brew` задаёт его явно. `ywtc ui` запускает локальный центр на `127.0.0.1`; одноразовый адрес печатается в терминале, внешних UI-ресурсов и телеметрии нет.

## Возможности

| Материал | Результат |
| --- | --- |
| Страницы и структура | Обычные и личные страницы, целые Confluence-пространства; `page`, структурное `subtree` или граф `linked`. Иерархия восстанавливается, циклы не дублируют страницы, пустые разделы остаются пустыми страницами. |
| Текст и компоновка | Заголовки, форматирование и цвет, списки/задачи, цитаты, код с языком, таблицы, секции и колонки. Destination получает нативную либо семантически равную разметку; Markdown сохраняет порядок ячеек. |
| Ссылки | Внутренние ссылки выбранного набора переписываются на destination, якоря сохраняются; внешние и выходящие за набор ссылки не меняются. |
| Hashtags и упоминания | Текстовые теги и Yandex/Confluence mentions сохраняются либо заменяются готовым текстом/обычной ссылкой по ручному mapping. Код, URL, diagram source и page labels не затрагиваются; native notifications не создаются. |
| Файлы и изображения | API-вложения передаются потоково с проверкой размера/SHA-256. Любой скачиваемый формат; стабильные имена, подтверждённая Yandex-загрузка продолжается с byte-range, несовместимая — безопасно перезапускается. |
| Диаграммы | Mermaid, PlantUML, D2 и Draw.io остаются нативными при доказанной поддержке; иначе сохраняются точный source и доступное статическое представление. |
| Специальная разметка | Notes/callouts, cuts/expand, tree/children, tabs, code, anchors, page/attachment links и изображения получают ближайший эквивалент. Доступный Grid становится проверяемой статической таблицей. |
| Комментарии | Footer/inline comments архивируются с авторами, датами, статусами и ответами; упомянутые вложения входят в проверяемый ZIP с manifest. |
| Надёжность | Страница сразу создаётся с полным body. Сбой ресурса оставляет source-ссылку и повторяемый outcome; чрезмерный inline payload получает fallback и raw snapshot. После записи destination перечитывается и проверяется. |
| Наблюдаемость | Фазы показывают подтверждённые счётчики, очередь и активные объекты; при устойчивом темпе — скорость и ETA. Heartbeat и мягкая остановка работают и во время CPU-batches. |
| Различия платформ | Полная normalization/adaptation остаётся `complete`. Если полнота не доказана, сохраняются читаемый fallback и при необходимости raw snapshot, а итог становится degradation. |

### Ограничения

| Не переносится как исходная сущность | Что сохраняется |
| --- | --- |
| История версий | Текущее содержимое; последующие обновления destination образуют его обычную историю версий. |
| Реакции; attachment/blog/custom-content comments | Только footer/inline comments страницы. |
| Пользователи, watchers и права | Авторство остаётся в архивном тексте; объекты создаёт владелец токена и они наследуют права destination. |
| Страницы, скрытые API | Известный отказ попадает в state/отчёт; полностью скрытое нельзя перечислить или включить в totals. |
| Grid без доступного payload | Объяснение и ссылка на source, страница `partial`; временный сбой исправляется через `retry`. |
| Сторонние diagram macros | Известная macro-разметка сохраняется только Confluence → Confluence; иначе сохраняются source и безопасное представление без угадывания plugin API. |
| Файл выше лимита destination | Cache и source-ссылка сохраняются; файл `failed`, проверенная страница `partial`. После увеличения лимита повторите `migrate`; файл не разбивается. |
| CSS, scripts, неизвестные widgets/macros или чрезмерный inline payload | Безопасный fallback/raw snapshot; страница `partial`, остальные продолжаются. |
| Внешние файлы и изображения | Сохраняются URL, alt и размеры; внешние данные не скачиваются. Недоступный source-managed ресурс означает неполный перенос. |

## Совместимость

| Source | Destination |
| --- | --- |
| Yandex Wiki | Confluence, Yandex Wiki, Markdown, HTML |
| Confluence | Yandex Wiki, Confluence, Markdown, HTML |

| Система | Поддерживаемый контракт | Авторизация |
| --- | --- | --- |
| Yandex Wiki | Public API v1; новые необязательные поля допускаются | OAuth или пользовательский IAM; `X-Org-Id`/`X-Cloud-Org-Id` |
| Confluence Data Center | 7.9+ без искусственной верхней границы | Bearer PAT |
| Confluence Cloud | REST v2 для страниц, REST v1 для attachments | Email + API token |

Не поддерживаются Confluence Server, DC Basic Auth и OAuth app-flow. `doctor`/`migrate` проверяет REST readiness: maintenance HTML/неполный JSON останавливает запуск без state/destination writes. После восстановления повторите команду; затем проверьте `baseUrl`/`deployment`. Тесты не заменяют live-сертификацию patch-версий.

## Конфигурация

Workspace выбирается так: `--workdir` → `ywtc.config.yaml` в текущем каталоге → `~/.ywtc`. Родительские каталоги не просматриваются.

```text
~/.ywtc/
├── ywtc.config.yaml   # подключения, настройки и токены
└── .states/           # state, cache, backups и отчёты
```

`init -i` настраивает API/auth обоих провайдеров; `ywtc init` создаёт пустой шаблон. Его каталог — `--workdir` или `~/.ywtc`. Мастер проверяет подключения, не права конкретных страниц: их проверяют `doctor`/`migrate`. Строгий YAML не переопределяется environment, игнорируется Git, создаётся с mode `0600`; секреты маскируются. Шаблон: [`ywtc.config.example.yaml`](ywtc.config.example.yaml).

Невалидный config исправляется в UI после полной проверки и подтверждения; исходник уходит в `.states/backups/`, токены/email не показываются. Нечитаемый YAML требует повторного ввода и до исправления блокирует операции.

### Поля `ywtc.config.yaml`

| Поле | Профиль | Значения / default | Назначение |
| --- | --- | --- | --- |
| `defaults.timeoutMs` | общий | `1000..300000`; `30000` | Таймаут HTTP-запроса |
| `defaults.concurrency` | общий | `1..64`; `4` | Общая параллельность операции |
| `hashtags.mode` | общий | `off` (default), `mapping` | Сохранить текстовые теги или применить `skip/text/url` из JSON |
| `hashtags.mappingFile` | `mapping` | обязательный путь | От config, абсолютный или `~`; source-bound snapshot до API |
| `mentions.mode` | общий | `off` (default), `mapping` | Сохранить представление или применить явные решения из JSON; без поиска пользователей |
| `mentions.mappingFile` | `mapping` | обязательный путь | От config, абсолютный или `~`; проверка/snapshot до API |
| `connections.<name>` | общий | имя `[a-z0-9][a-z0-9._-]*` | Именованное подключение |
| `type` | любой | `yandex-wiki` или `confluence` | Провайдер |
| `token` | любой | непустой | OAuth, IAM, PAT или API token |
| `apiUrl` / `webUrl` | Yandex Wiki | URL API v1 / базовый web URL | API-запросы, ссылки и выбор профиля |
| `authType` | Yandex Wiki | `oauth` или `iam`; `oauth` | Схема авторизации; IAM допустим только с Cloud Organization |
| `organization.type` | Yandex Wiki | `yandex360` или `cloud`; `yandex360` | Выбирает `X-Org-Id` или `X-Cloud-Org-Id` |
| `organization.id` | Yandex Wiki | непустой | ID организации |
| `deployment` | Confluence | `data-center` или `cloud` | Тип инстанса |
| `baseUrl` | Confluence | URL, включая context path | Базовый адрес API и web |
| `authType` | Confluence | `pat` или `api-token` | PAT для Data Center; API token для Cloud |
| `email` | Confluence Cloud | непустой | Atlassian account email для Basic Auth |
| `limits.readConcurrency` | любой | `1..64`; `4` | Параллельные чтения |
| `limits.writeConcurrency` | любой | `1..32`; `2` | Параллельные записи |
| `limits.downloadConcurrency` / `uploadConcurrency` | любой | `1..32`; `2` | Параллельные передачи файлов |
| `limits.requestsPerSecond` | любой | `1..1000`; `8` | Устойчивая частота запросов |
| `limits.burst` | любой | `1..1000`; `8` | Кратковременный burst; в примере для Confluence явно задано `10` |

### Токены

#### Yandex Wiki

1. Создайте приложение в [Яндекс OAuth](https://oauth.yandex.ru/) с [правами Wiki](https://yandex.ru/support/wiki/ru/api-ref/access): чтение source, запись destination.
2. Получите OAuth-токен пользователя; для федеративного пользователя Cloud допустим IAM.
3. Возьмите ID в **Tracker → Администрирование → Организации**; задайте `organization.type: yandex360|cloud`, для IAM — `authType: iam` и Cloud Organization.

#### Confluence Data Center

1. Создайте PAT: **Avatar → Settings → Personal access tokens → Create token** ([инструкция Atlassian](https://confluence.atlassian.com/enterprise/using-personal-access-tokens-1026032365.html)).
2. Задайте `deployment: data-center`, `authType: pat`; нужны чтение source и запись destination.

#### Confluence Cloud

1. Создайте [Atlassian API token](https://id.atlassian.com/manage-profile/security/api-tokens).
2. Задайте `deployment: cloud`, `authType: api-token`, `email`, `token`; нужен доступ к обоим spaces.

## CLI

### Команды

| Команда | Назначение |
| --- | --- |
| `ywtc init [-i] [-w <path>]` | Создать workspace; `-i` настроит подключения |
| `ywtc ui [-w <path>] [-p <port>] [--no-open]` | Локальный UI, порт `3000`; занятый порт не освобождается |
| `ywtc migrations [list --all] [-w <path>]` | Текущие задачи или вся история |
| `ywtc migrations show <job-id> [--json]` | Запрос, lifecycle, Run ID и результат |
| `ywtc migrations logs <job-id> [-f]` | Журнал; `-f` ждёт новые события |
| `ywtc migrations stop <job-id>` | Запросить мягкую остановку |
| `ywtc doctor [options]` | Проверить workspace или read-only preflight locators |
| `ywtc migrate -i` | Мастер: параметры → dry-run → подтверждённый live |
| `ywtc migrate -s <locator> -d <locator\|directory> [options]` | Неинтерактивный перенос или экспорт |
| `ywtc hashtags export -s <locator> -o <directory> [options]` | Source-only теги и автономный редактор |
| `ywtc mentions export -s <locator> -o <directory> [options]` | Source-only упоминания и автономный редактор |
| `ywtc retry <run-id> [options]` | Повторить исправимые объекты последней live-итерации |
| `ywtc sync <run-id> [-s <subtree>] [-w <path>]` | Построить план новых/изменённых страниц и ссылок без записи |
| `ywtc sync apply <plan-id> [-w <path>] [--confirm-trash]` | Применить план; trash подтверждается отдельно |
| `ywtc reports list [-w <path>]` | Показать локальные отчёты от новых к старым |
| `ywtc reports open [run-id\|last] [-w <path>]` | Открыть выбранный или последний корректный отчёт |
| `ywtc update [-i] [-c npm\|brew]` | Проверить или установить обновление |

### Опции

| Полная / short | Команды | Значения и назначение |
| --- | --- | --- |
| `--interactive`, `-i` | `init`, `migrate` | TTY-мастер; переданные опции — редактируемые defaults |
| `--workdir`, `-w` | `init`, `doctor`, `migrate`, `retry`, `sync`, `reports`, `mentions/hashtags export`, `ui`, `migrations` | Workspace, включая `~/...` |
| `--background`, `-b` | `migrate`, `retry`, `mentions/hashtags export` | Сохранить задачу, вернуть Job ID; dry-run допустим, не с `--interactive`/`--open-report` |
| `--port`, `-p` / `--no-open` | `ui` | Loopback `1..65535` (`3000`) / не открывать браузер |
| `--all` / `--json` / `--follow`, `-f` | `migrations list` / `show` / `logs` | История / JSON / следить за журналом |
| `--source`, `-s` | `doctor`, `migrate`, `mentions/hashtags export` | URL, page ID или Yandex slug; обязателен без мастера |
| `--output`, `-o` | `mentions/hashtags export` | Новый/пустой каталог для `decisions.json` и `index.html` |
| `--destination`, `-d` | `doctor`, `migrate` | Родительская страница или каталог; обязателен в неинтерактивном `migrate` |
| `--source-profile`, `-S` | `doctor`, `migrate`, `mentions/hashtags export` | Имя source-профиля при неоднозначном коротком locator |
| `--destination-profile`, `-D` | `doctor`, `migrate` | Remote-профиль; запрещён для файлового экспорта |
| `--scope`, `-m` | `doctor`, `migrate`, `mentions/hashtags export` | `page`, `subtree` (default), `linked` |
| `--source-status`, `-t` | `doctor`, `migrate`, `mentions/hashtags export` | `all` (default) или `current`; root включается всегда |
| `--comments`, `-C` / `--no-comments`, `-N` | `doctor`, `migrate`, `mentions/hashtags export` | Default включены; `-N` исключает comment API |
| `--format`, `-f` | `doctor`, `migrate` | `markdown` или `html`; делает destination файловым |
| `--archive`, `-a` | `migrate` | Дополнительный ZIP для файлового экспорта |
| `--dry-run`, `-n` | `migrate`, `retry` | Discovery/render или retry-план без записи |
| `--fresh`, `-F` | `migrate` | Игнорировать mappings; live-state сохранить как backup |
| `--rewrite`, `-R` | `migrate`, `retry` | Новая версия существующих IDs; нужны mappings, не с `--fresh`/`--format` |
| `--open-report`, `-o` | `migrate`, `retry` | Открыть HTML; ошибка opener не меняет outcome |
| `--concurrency`, `-j` | `migrate`, `retry`, `mentions/hashtags export` | `1..64`; иначе `defaults.concurrency` |
| `--state`, `-r` | `migrate` | Явный state path внутри workspace |
| `--install`, `-i` | `update` | Установить найденное обновление |
| `--via`, `-c` | `update` | `npm` или `brew` |
| `--help`, `-h` / `--version`, `-v` | CLI | Справка / версия |

Short-алиасы локальны для команды: `migrate -i` запускает мастер, `update -i` устанавливает обновление.

### Задачи и локальный центр

Workspace в UI — локальная папка с config и результатами, не Confluence space.

| Ситуация | Контракт |
| --- | --- |
| Очередь | В workspace одна FIFO-операция; workspace независимы. Закрытие UI/терминала не отменяет background job. |
| Foreground/background | Foreground ждёт итог; background возвращает `0` после принятия. Итог — в `migrations show`/UI/report. Job ID — задача, Run ID — migration report. |
| Параметры | Фиксируются при постановке, токены читаются при старте. Новая connection identity требует подтверждения; изменение формы сбрасывает live-confirmation. |
| Остановка | `Ctrl+C`/`SIGTERM` мягко останавливают foreground (`130/143`). Потеря heartbeat — не failure; после падения worker продолжение явное, checkpoints остаются. |
| Sync/retry | Plans — в `.states/sync/`, revision защищает от stale UI. Изменение baseline/source/destination/dependencies требует нового preview; ownership ambiguity не обходится, live подтверждается. |
| Decisions | Source-only UI разделяет draft/published. Повторный анализ сохраняет решения, новым ставит `skip`; revision conflict требует перечитать данные. |

### Решения для упоминаний

```bash
ywtc mentions export --source "https://wiki.example.com/team" --output "./mentions"
```

Defaults: `subtree`, `all`, comments; опции `-S/-w/-m/-t/-C/-N/-j`. Экспорт читает pages/comments, не destination/Grid/files. Exit: `0` полный, `1` неполный с находками, `2` input/config, `130/143` signal.

Откройте напечатанный `file://` URL, выберите Skip/URL и скачайте JSON. Редактор не использует сервер или сеть; невалидный импорт не меняет текущие решения. Затем подключите файл:

```yaml
mentions:
  mode: mapping
  mappingFile: ./mentions/decisions.json
```

```json
{
  "source": {"provider": "yandex-wiki", "instance": "https://wiki.example.com"},
  "entries": [
    {"identity": {"username": "maria"}, "mention": "@maria", "decision": "url", "url": "https://people.example.com/maria", "text": "@maria"}
  ]
}
```

Запись действует для identity во всех страницах и комментариях. Ключ: `accountId → userKey → username → id`; только username сравнивается без регистра, display name пользователей не объединяет. Отсутствующая/удалённая/`skip` запись сохраняет исходное представление. `url` требует HTTP(S) без credentials; label по умолчанию — `@username` или `mention`. Значения буквальные, повторы/неизвестные поля запрещены.

Mapping привязан к provider/canonical instance, не к profile/root/scope. Новое решение применяется обычным `migrate` без `--fresh`; URL/users не проверяются. JSON содержит частные identity/source-контексты — храните вне Git.

### Решения для тегов

```bash
ywtc hashtags export --source "https://wiki.example.com/team" --output "./hashtags"
```

Параметры/exit codes те же. Сканируются pages/comments, не Grid или page labels. Редактор: **Как есть / Текст / Ссылка**; чужой JSON отклоняется.

```yaml
hashtags:
  mode: mapping
  mappingFile: ./hashtags/decisions.json
```

```json
{
  "source": {"provider": "yandex-wiki", "instance": "https://wiki.example.com"},
  "entries": [
    {"tag": "#документация", "decision": "url", "url": "https://docs.example.com", "text": "Документация"}
  ]
}
```

Решение применяется к точному регистрозависимому тегу. Имя поддерживает Unicode-буквы/цифры/marks, `_` и `-`; код, diagram source, anchors, URL/fragments, escapes, атрибуты и macro-параметры не меняются. Если подпись ссылки состоит только из тега, `text` заменяет ссылку текстом, `url` — адрес и подпись; смешанная подпись остаётся исходной.

`skip`, отсутствующая или удалённая запись сохраняет тег. `text` — буквальный непустой текст без добавления `#`; `url` — HTTP(S) без credentials с исходным тегом как default-label. Повторы и несовместимые поля запрещены. Source binding и обновление без `--fresh` работают как для mentions; политики независимы, URL по сети не проверяется.

### Locators и выбор страниц

- Yandex Wiki: полный URL, числовой page ID или slug вида `team/start`.
- Confluence: числовой page ID, URL с `pageId=<id>`, `/pages/<id>` или `/content/<id>`; Data Center также принимает `/display/<space>/<title>` с `+` вместо пробелов в title.
- Полный URL выбирает профиль по нормализованному base URL. Для неоднозначного ID/slug укажите профиль явно.
- Каталог считается destination только с `--format`.

| Scope | Выбор |
| --- | --- |
| `page` | Только root |
| `subtree` | Root и все доступные структурные descendants до последнего уровня; default |
| `linked` | Детерминированный BFS по внутренним ссылкам и page/include references; циклы завершаются безопасно |

`--source-status all` включает все доступные descendants: в Yandex Wiki — `actual` и `obsolete`; `current` оставляет только `actual/current`. Confluence зависит от hierarchy API и может не возвращать archived, trashed и historical versions.

### Перенос личного пространства: Yandex Wiki ↔ Confluence

Настройте подключения через `ywtc init --interactive`. Source ниже — корень личного пространства, destination — существующая родительская страница, не корень Confluence space. Полные URL выбирают профили.

#### Yandex Wiki → Confluence

```bash
# Проверить без записи в Confluence
ywtc migrate \
  --source "https://wiki.example.com/users/alex/" \
  --destination "https://confluence.example.com/confluence/pages/viewpage.action?pageId=123" \
  --scope subtree \
  --dry-run

# Выполнить перенос
ywtc migrate \
  --source "https://wiki.example.com/users/alex/" \
  --destination "https://confluence.example.com/confluence/pages/viewpage.action?pageId=123" \
  --scope subtree
```

Доступное поддерево `/users/alex/` появится под указанной Confluence-страницей.

#### Confluence → Yandex Wiki

```bash
# Проверить без записи в Yandex Wiki
ywtc migrate \
  --source "https://confluence.example.com/confluence/display/~alex" \
  --destination "https://wiki.example.com/users/alex/import" \
  --scope subtree \
  --dry-run

# Выполнить перенос
ywtc migrate \
  --source "https://confluence.example.com/confluence/display/~alex" \
  --destination "https://wiki.example.com/users/alex/import" \
  --scope subtree
```

DC source также принимает `/spaces/viewspace.action?key=~alex`, Cloud — `/wiki/spaces/~accountId/overview`. `subtree` переносит доступные ветки в один раздел; `page` — home, `linked` — граф от home. Без home доступен только `subtree`; пустое space допустимо.

Переносятся API-доступные pages, но не space settings/permissions, профиль или blogs. Те же locators/scopes работают в `doctor`, мастере и decisions export.

### Примеры

```bash
# Перенести структурное поддерево
ywtc migrate -s https://wiki.example.com/team/start \
  -d https://confluence.example.com/confluence/pages/viewpage.action?pageId=123

# Перенести рекурсивно связанные страницы
ywtc migrate -s https://wiki.example.com/team/start \
  -d https://confluence.example.com/confluence/pages/viewpage.action?pageId=123 \
  -m linked

# Создать автономный HTML и ZIP
ywtc migrate -s https://wiki.example.com/team/start \
  -d ./exports/knowledge-base -f html -a

# Повторить только исправимые проблемы выбранной миграции
ywtc retry 870f6e43-e7c5-46f4-a858-4d67f4f50be4
```

## Файловый экспорт

Markdown создаёт `index.md`, `pages/`, `attachments/`, `.ywtc-export.json`; HTML — автономный адаптивный сайт без CDN/runtime для `file://` и static hosting. `_source/` содержит только необходимые raw snapshots. Ссылки/resources становятся относительными, comments — раскрываемыми ветками; их файлы входят в ZIP с `manifest.json`. Для space индекс — навигация, реальные pages считаются отдельно.

Сборка идёт в соседнем staging. Разрешён отсутствующий/пустой каталог; непустой заменяется только с актуальным ywtc manifest той же identity, а прежний становится timestamped backup. `--archive` создаёт новый ZIP, не перезаписывая старый.

## State и повторные запуски

State: `<workdir>/.states/<automatic-id>.json`; относительный `--state` остаётся внутри workspace. ID задают профили/immutable page IDs и формат экспорта, но не locator/scope/status. Confluence space определяется immutable ID; контейнер и home — разные roots/mappings, смена home не создаёт дубликат.

| Задача | Действие и эффект |
| --- | --- |
| Продолжить или обновить | Повторить `migrate`: mappings, cache и checkpoints переиспользуются; изменённые mapped-страницы обновляются source-authoritative, unmapped/неоднозначные не перезаписываются. |
| Расширить `current → all` | Запустить тот же перенос с `all`. Обратный выбор и удаление в source не удаляют прежние mappings или destination. |
| Повторить исправимые ошибки | `retry <run-id>` выбирает незавершённые retryable-объекты и зависимости последней live-итерации; `--dry-run` только показывает план. Одни permanent-причины дают код `1`. |
| Принудительно пересобрать body | `--rewrite` использует существующие IDs и прежний state, повторно читает source и переиспользует проверенные attachments. Отсутствующий/недоступный mapping даёт ошибку, не новый объект; страницы не удаляются. |
| Начать без mappings | `--fresh` сохраняет старый live-state как backup и создаёт snapshot; destination может получить новые объекты. |
| Сопоставить новые и изменившиеся данные | `sync <run-id>` строит проверяемый план и требует решений; это не обычный resume. |

Snapshot сохраняется после dry-run, ошибки и сигнала. Файлы сверяются по immutable ID/размеру/SHA-256; cache и подтверждённые `.part` checkpoints переиспользуются. Неизвестный hierarchy/body/resource inventory блокирует запись; сбой известного Grid оставляет retryable fallback. Исчезнувший comment archive остаётся `stale`.

### Синхронизация существующего переноса

`sync` восстанавливает identity/settings полного отчёта и без записи сравнивает body/title, hierarchy, files, comments, decisions. `--source <subtree>` ограничивает discovery, не state. Provider/instance проверяются до API, roots используют immutable IDs. Неполный baseline/mapping coverage требует нового отчёта или решения.

Файлы сравниваются по потоковому SHA-256 и кэшируются приватно. Для изменённой страницы выберите `update`, `keep` или допустимый `trash`, затем выполните `sync apply <plan-id>`; новые страницы добавляются сверху вниз, неизменённые тела не пишутся. Изменение inventory, policy, destination или state после preview требует нового анализа. Входящие ссылки проверяются по всей миграции и исправляются минимально; неоднозначные остаются исходными. Недоступная выбранная страница/предок блокирует apply.

`trash` разрешён только для mapped published Confluence leaf, если API свежо подтвердил отсутствие детей, права и version. Нужны `--confirm-trash`/UI-confirmation и исправленные входящие ссылки. Source, attachments, comments, versions и trash не очищаются; mapping и exclusion сохраняются, восстановление — отдельное решение. Без доказательств provider действие недоступно.

Live-run держит exclusive lock; доказанно stale lock восстанавливается. При сигнале новые задачи не стартуют, безопасные операции завершаются, state/report сохраняются. Итоги и exit codes — ниже.

## Отчёты и статусы

Отчёт: `<workdir>/.states/reports/<run-id>/index.html`; рядом — очищенный `report.json`. Открытие: `--open-report`, `reports list`, `reports open [run-id|last]`. Retry показывает цепочку Run ID, попытку, отбор, переиспользованные outcomes и оставшиеся retryable/terminal проблемы. Sync показывает всю миграцию, provenance, добавления, обновления, Keep, исключения и ссылки. Завершённый анализ означает готовый план, не успешный перенос; Keep сохраняет последний проверенный outcome.

### Классификация плана sync

Это решения анализа, а не outcomes переноса или job lifecycle.

| Значение | Объекты и исчерпывающие условия назначения | Действие |
| --- | --- | --- |
| `add` | 1. Source доступен, immutable destination mapping отсутствует. | Добавить после подтверждения. |
| `unchanged` | 1. Source body/hierarchy/resources/comments/decisions совпадают и проверка destination не нашла расхождений. | Не писать body; link patches отдельно. |
| `changed` | 1. Изменён source hash.<br>2. При том же baseline расходятся destination body, title, parent или mapped-файл. | Выбрать Update, Keep или допустимый Trash. |
| `unknown-baseline` | 1. Подтверждённого source-снимка недостаточно для сравнения. | Проверить diff; отсутствие доказательств не равно неизменности. |
| `kept` | 1. Keep относится к текущему effective source hash. | Не писать body; новый hash снова потребует решения. |
| `excluded` | 1. Сохранён `operator-trash` с immutable destination ID. | Не восстанавливать автоматически; восстановление решать отдельно. |
| `blocked` | Зарезервирован; анализатор не назначает. Inventory errors запрещают apply. | Исправить inventory и повторить анализ. |

### Состояние плана sync

| Значение | Объекты и исчерпывающие условия назначения | Действие |
| --- | --- | --- |
| `review` | 1. Inventory готов, решения не применены.<br>2. После apply осталась ошибка выбранного объекта. Неполный внешний link audit отмечается отдельно. | Проверить решения; применить или продолжить после исправления. |
| `partial` | 1. Source/destination/dependency inventory или preview неполон. | Исправить и повторить анализ; apply запрещён. |
| `applied` | 1. Выбранные объекты применены без оставшейся ошибки.<br>2. Операций не было, Keep сохранён. Прочие старые outcomes не меняются. | Проверить итог; вся миграция может быть `partial`. |

Отчёт показывает ненулевые показатели, identity/иерархию, исключения, issues, checkpoints и независимые Grid outcomes; детали содержат files, comments и comparison. `report.json` не содержит body, тексты комментариев, скрытые email или preview HTML.

В таблицах нумерованные пункты — альтернативные причины, «и» связывает совместные условия. `failed`/`blocked`/`not-started` текущей операции не доказывает отсутствия прежнего содержимого или bootstrap. Точная причина — в issues; автоматический повтор отдельно задаёт `retryable`.

### Статусы задач

Lifecycle задачи не заменяет результат run или outcome объектов. Очередь/журналы лежат в `.states/`; migration state остаётся источником mappings.

| Статус | Условия назначения | Что делать |
| --- | --- | --- |
| `queued` | 1. Проверенный запрос сохранён и ждёт worker workspace. | Дождаться или отменить. |
| `running` | 1. Worker назначен, финал не подтверждён. | Следить за progress/log; при необходимости остановить. |
| `stopping` | 1. Запрошена мягкая остановка, worker ещё не завершился. | Дождаться checkpoint/финала. |
| `finished` | 1. Сохранены результат и exit code, включая failure/cancellation.<br>2. Ожидающая задача отменена. | Проверить `result.status`, `exitCode`, отчёт; это не признак успеха. |
| `interrupted` | 1. Worker исчез до результата.<br>2. Потерял coordinator, сохранив checkpoints.<br>3. После restart прежний worker отсутствует. | Явно продолжить; автоматического повтора записей нет. |

### Статусы запуска

| Статус | Условия назначения | Что делать |
| --- | --- | --- |
| `running` | 1. Run зарегистрирован, но не финализирован: live — в state, dry-run — в памяти. | Следить за фазой/heartbeat. |
| `completed` | 1. Нормальный финал без errors, warnings и degradations; adaptations/normalizations/external links допустимы. | Проверить dry-run/live: статус не доказывает запись. |
| `completed-with-warnings` | 1. Нормальный финал без errors, но с warnings/degradations; возможны `partial` pages. | Проверить ненулевые outcomes. |
| `partial` | 1. Нормальный финал хотя бы с одним unresolved error; число успешных страниц не влияет. | Исправить root errors и выполнить `retry`. |
| `failed` | 1. Обязательный discovery/inventory не завершён.<br>2. Pipeline аварийно закончился, включая export/result-save; записи могут существовать. | Устранить причину; mappings сохраняются. |
| `cancelled` | 1. Pipeline получил AbortSignal/SIGINT/SIGTERM и сохранил доступный финал. | Продолжить по Run ID; код `130/143`. |
| `interrupted` | 1. При чтении state незавершённый `running` помечен прерванным; старый отчёт не переписывается. | Продолжить state; retry требует корректный report. |

Exit `migrate`: `0` — нормальный финал без errors (warnings допустимы); `1` — с errors; `2` — args/config/preflight/pipeline exception; `130/143` — SIGINT/SIGTERM. `retry` даёт `1`, пока остаётся retryable/terminal работа, иначе `0`. До создания run Run ID/report может отсутствовать.

### Статусы инвентаризации

Отдельное поле страницы `inventoryStatus` описывает подготовку обязательных source-данных, а не результат записи destination.

| Статус | Условия назначения | Что делать |
| --- | --- | --- |
| `pending` | 1. Identity зарегистрирована, но обязательная инвентаризация ещё не получила результата. | Дождаться inventory; при остановке продолжить запуск. |
| `complete` | 1. Обязательные details/body, иерархия и перечисление ресурсов подготовлены. Независимый сбой Grid или комментариев учитывается отдельно. | Проверить итог страницы и независимых ресурсов. |
| `failed` | 1. Обязательные details, body, перечисление ресурсов либо normalization не удалось завершить. | Исправить указанную операцию и продолжить; до полного обязательного inventory destination-запись не начинается. |

### Статусы страниц

Тот же жизненный цикл записи и проверки применяется к созданному разделу пространства. Он показан отдельным узлом и не увеличивает source page totals; его ошибка блокирует зависимые страницы с одной первопричиной.

| Статус | Условия назначения | Что делать |
| --- | --- | --- |
| `complete` | 1. Итоговый body прочитан и прошёл семантическую проверку, нет деградаций и проблем managed-файлов, а комментарии завершены либо отключены. Семантически пустой body допустим; normalization, adaptation, внешняя ссылка или warning упоминания не мешают этому статусу. | Ничего; обычный `migrate` обновит страницу при изменении source или политики. |
| `partial` | 1. Body проверен, но renderer зафиксировал потерю или недоказанную полноту блока, Grid, диаграммы либо raw fallback.<br>2. Body проверен, но managed-файл не перенесён или не проверен.<br>3. Destination сохранил содержимое, но упростил значимую структуру, которую verification не признал эквивалентной.<br>4. Архив комментариев имеет незавершённый исход, включая `partial`, `failed` или `stale`.<br>5. Финальная операция завершилась ошибкой, но повторный GET подтвердил полное последнее представление либо bootstrap, если финальное ещё не было построено. | Открыть проблему; `retry` повторит исправимые операции, постоянную причину сначала устранить. |
| `failed` | 1. Не удалось получить обязательные details/body, перечислить ресурсы или нормализовать исходную страницу.<br>2. Не удалось создать, восстановить, переместить или подтвердить mapped-страницу.<br>3. Перенос, update или read-back завершились ошибкой, и повторная проверка не доказала полноту body: например, отсутствуют текст, ссылка, ресурс либо остался placeholder. Потеря только форматной структуры может дать `partial`. | Проверить root error и `retryable`; запись могла уже состояться. |
| `blocked` | 1. Ожидаемый destination-родитель отсутствует или не подтверждён из-за upstream `failed`, `conflict`, API, прав, сети либо неудачного восстановления иерархии. Страница не создаётся под другим родителем. | Исправить указанный `blockedByPageId`; `retry` включит зависимую ветку, если первопричина исправима. |
| `conflict` | 1. Несколько source mappings претендуют на один destination page ID.<br>2. Provider при проверке возвращает immutable ID, отличный от запрошенного. | Проверить `conflictEvidence` и candidate IDs. Ручная правка body, версия, title collision и обычный HTTP `409` сами по себе этот статус не создают. |
| `planned` | 1. Dry-run построил план страницы без destination-записи.<br>2. В выполняющемся live-run страница подготовлена к обработке; при завершении этот промежуточный статус заменяется итоговым. | Для dry-run запустить live; во время live дождаться финала. |
| `not-started` | 1. Live-run завершился или был остановлен, пока страница оставалась `discovered`, `planned` или `skeleton-created` и финальный перенос не был подтверждён. Полный bootstrap уже может существовать. | Продолжить через `retry`; `--fresh` не нужен. |
| `excluded` | 1. Автоматически найденная страница не прошла `--source-status current`.<br>2. Details подтвердили перемещение страницы за пределы выбранного subtree (`inventory-drift`).<br>3. Сохранено отдельное явное исключение `operator-trash` после подтверждения sync-корзины; mapping остаётся, автоматическое пересоздание запрещено. | Это исключение из выбора, а не destination failure. Для фильтра изменить выбор; для `operator-trash` отдельно проверить/восстановить объект и решение. |
| `discovered` | 1. Страница зарегистрирована в inventory, но её обработка ещё не закончена. Это промежуточный статус. | Дождаться финала; завершённый live-report заменяет его на `not-started`, если работа не дошла до итога. |
| `skeleton-created` | 1. Новая/восстановленная destination-страница создана с полным source-derived bootstrap и ожидает финальной обработки.<br>2. Существующая mapped-страница и её parent подтверждены; текущее body ещё ожидает согласования с source. Это промежуточный статус. | Дождаться финала или продолжить перенос после остановки. |

### Статусы файлов

Относятся к managed-изображениям, attachments и файлам диаграмм. Grid учитывается отдельно; файлы комментариев дополнительно проверяются внутри архива.

| Статус | Условия назначения | Что делать |
| --- | --- | --- |
| `complete` | 1. Проверенные bytes получены из download/cache, attachment загружен или согласован с существующим, destination-list подтвердил его наличие и размер, если API раскрывает размер.<br>2. Файл записан в проверенный файловый экспорт или переиспользован из совместимого экспорта. | Ничего. SHA-256 подтверждает source/cache; destination hash сверяется при reconciliation, когда API допускает чтение bytes. |
| `partial` | 1. Есть подтверждённый upload и destination ID, но последующий attachment-list/read-back недоступен, поэтому окончательная проверка не выполнена. | Повторить проверку через `retry`; подтверждённый upload переиспользуется. |
| `failed` | 1. Не завершились download, проверка cache, upload либо согласование имени/содержимого.<br>2. Read-back не нашёл файл или выявил несовпадение размера/содержимого.<br>3. Destination отклонил файл из-за attachment-size limit. | Для временной причины — `retry`; для лимита увеличить его и повторить `migrate`. Source-ссылка и проверенный cache сохраняются, когда доступны. |
| `blocked` | 1. Destination-страница или её upstream-зависимость имеет `failed`, `conflict` либо `blocked`, поэтому текущая файловая операция не выполняется. | Устранить причину страницы; прежнее вложение при этом может существовать. |
| `not-started` | 1. Live-run завершился до окончательного исхода подготовленной файловой операции и нет причинной блокировки страницы. | Продолжить через `retry`; использовать сохранённые bytes и mappings. |
| `planned` | 1. Файл включён в dry-run без копирования.<br>2. В live-run download/upload ещё подготавливается; при финализации статус станет итоговым, `blocked` или `not-started`. | Запустить live либо дождаться его завершения. |

### Статусы Grid

Grid outcome показывает доступность исходного снимка. Он не заменяет проверку destination-таблицы: её полнота влияет на статус страницы.

| Статус | Условия назначения | Что делать |
| --- | --- | --- |
| `complete` | 1. Grid перечислен, его source payload прочитан и нет inventory failure для этого Grid. | Проверить исход страницы, если destination-представление вызывает вопросы. |
| `failed` | 1. Известен immutable Grid ID, но payload недоступен или не прошёл чтение/валидацию после recovery; сохранён отдельный inventory failure. | Для временной причины — `retry`; при ограничении source API останется объяснение и source-ссылка. |
| `blocked` | 1. Report пометил ресурсы страницы заблокированными из-за недоступного destination-родителя/страницы. | Исправить upstream-причину. |
| `not-started` | 1. Live-run закончился до обработки запланированного Grid без причинной блокировки страницы. | Продолжить перенос. |
| `planned` | 1. Снимок входит в dry-run без destination-записи.<br>2. Подготовленная страница ещё ожидает обработки; live-финализация заменит этот статус. | Запустить live либо дождаться финала. |

### Статусы архивов комментариев

Один outcome относится ко всему архиву обсуждения страницы, включая ветки, участников и ZIP связанных файлов, а не к публикации каждого ответа от исходного автора.

| Статус | Условия назначения | Что делать |
| --- | --- | --- |
| `complete` | 1. Source подтвердил отсутствие комментариев и прежнего mapped-архива нет.<br>2. Архив создан, обновлён или переиспользован, прошёл read-back, и inventory не содержит предупреждений. Проверенный quote/code/Markdown-attachment fallback допустим. | Ничего; отсутствие комментариев также является завершённым результатом. |
| `partial` | 1. Архив проверен, но source inventory содержит warnings: например, повреждённая иерархия, orphan/cycle или неразрешённая ссылка на файл. | Открыть точную причину; повторять только исправимые случаи. |
| `failed` | 1. Не удалось прочитать source-комментарии.<br>2. Отсутствует обязательный fingerprint или destination не поддерживает запись/чтение архива.<br>3. Ошибка download, ZIP, upload, создания, обновления, локальной записи или семантической проверки архива. | Проверить issue; `retry` повторит исправимую архивацию, проверенный body страницы сохранится. |
| `stale` | 1. Source теперь возвращает пустое обсуждение, но state содержит прежний destination comment ID; архив сохранён без удаления. | Сверить доступ к source и оригинал; автоматического удаления нет. |
| `skipped` | 1. Передан `--no-comments`.<br>2. В remote pipeline нет comment inventory для архивации. Это не доказательство пустого обсуждения. | Если комментарии нужны, включить их и проверить inventory. |
| `blocked` | 1. Destination-страница или обязательная upstream-зависимость недоступна; archive-operation не может начаться. | Сначала исправить страницу; причинная ссылка указана в отчёте. |
| `not-started` | 1. Live-run завершился с ещё подготовленным архивом и без причинной блокировки страницы. | Продолжить через `retry`. |
| `planned` | 1. Dry-run запланировал непустой архив без записи.<br>2. Архив ожидает обработки внутри live-run; финализация заменит этот статус. | Запустить live либо дождаться финала. |
| `conflict` | 1. Значение предусмотрено текущим форматом state/report, но нынешний архиватор его автоматически не назначает: mapped-архив обновляется по source-authoritative политике. | При таком входном outcome проверить evidence; ручное редактирование комментария само по себе не является причиной. |

### Статусы упоминаний

Outcomes описывают представление, не доставку уведомления. Текущая обработка создаёт только `preserved` и `linked`; read-back потерянного представления ухудшает итог страницы, а не создаёт отдельный mention outcome.

| Статус | Условия назначения | Что делать |
| --- | --- | --- |
| `preserved` | 1. Политика отсутствует или имеет `mode: off`.<br>2. В `mapping` identity отсутствует в файле, удалена либо имеет `decision: skip`. Исходное представление сохранено с безопасной межформатной адаптацией. | Ничего; при необходимости задать URL-решение и повторить обычный migrate. |
| `linked` | 1. В `mapping` найдена запись `decision: url`; построена обычная ссылка с заданным URL и текстом либо default-label.<br>2. Исторический отчёт содержит прежний шаблонный link outcome; старый режим не запускается. | Ничего; доступность URL пользователь проверяет самостоятельно. |
| `native` | 1. Только исторические state/report: прежний auto-режим подтвердил пользователя и создал native marker. Нынешний обработчик этот outcome не назначает. | Для новой ссылки использовать ручной mapping; старое успешное представление не требует retry. |
| `text` | 1. Только исторические state/report: прежний шаблонный режим сформировал текст без URL. Нынешний обработчик этот outcome не назначает. | Ничего либо задать явное URL-решение. |
| `unresolved` | 1. Только исторические state/report: прежний placeholder не заполнен либо user lookup не подтвердил identity и сохранил fallback. Нынешний обработчик этот outcome не назначает. | Разметить mapping при необходимости; старый lookup warning не запускает retry успешной страницы. |
| `failed` | 1. Зарезервированное значение исторического формата; текущего отдельного producer нет. | Проверить verification и issues страницы; статус не считать доказательством потери упоминания сам по себе. |

### Статусы представления hashtags

Относятся к вхождениям в основном body и архивируемых комментариях. Счётчики решений не означают подтверждённую запись: отдельно хранится verification. Нулевые показатели и пустая вкладка скрыты.

| Статус | Условия назначения | Что делать |
| --- | --- | --- |
| `preserved` | 1. Режим `off`.<br>2. В `mapping` выбрано `skip`.<br>3. Запись отсутствует или удалена. | Ничего либо разметить mapping. |
| `text` | 1. Найдена точная запись с `decision: text`; подготовлен её буквальный текст. | Проверить preview и verification. |
| `linked` | 1. Найдена точная запись с `decision: url`; подготовлены её URL и явный/default-текст. | Проверить preview; доступность URL проверяется вручную. |

### Статусы проверки hashtags

Поле `verification` описывает подтверждение основного объекта, отдельно от подготовленного решения.

| Статус | Условия назначения | Что делать |
| --- | --- | --- |
| `pending` | 1. Dry-run.<br>2. Основной объект ещё не получил завершённый проверяемый исход: промежуточный, blocked, not-started, skipped или stale. | Дождаться завершения; при необходимости устранить зависимость и повторить перенос. |
| `verified` | 1. Для body страницы подтверждён `complete/partial`.<br>2. Для архивного комментария подтверждён `complete`. | Ничего; общий объект может иметь независимые проблемы файлов или комментариев. |
| `unverified` | 1. Страница получила `failed/conflict`.<br>2. Архив получил `failed/partial/conflict`. | Проверить ошибку объекта; не считать подготовленное решение подтверждённым переносом. |

### Статусы обхода ссылок

Эти статусы относятся к рёбрам `linked`, а не к страницам. При `page`/`subtree` отдельный граф переходов не собирается.

| Статус | Условия назначения | Что делать |
| --- | --- | --- |
| `resolved` | 1. Внутренняя ссылка разрешена в доступную выбранную страницу, которая ещё не обработана обходом. | Ничего. |
| `cycle` | 1. Ссылка ведёт к уже выбранной и обработанной странице: self-link, обратный или повторный переход. Повторная обработка не нужна. | Ничего; это безопасно завершённый переход, а не ошибка переноса. |
| `external` | 1. Ссылка внешняя по виду или origin.<br>2. Это attachment/anchor, а не переход к новой странице.<br>3. Цель исключена фильтром source-status. | Исходная ссылка сохраняется; для включения страницы изменить выбор. |
| `inaccessible` | 1. Разрешение внутренней ссылки завершилось диагностикой доступа: `401`, `403`, forbidden, permission или access. | Проверить доступ токена к указанной странице. |
| `broken` | 1. Resolver не нашёл цель.<br>2. Разрешение завершилось другой ошибкой, не классифицированной как отказ доступа: например, `404`, сеть или provider failure.<br>3. Reference не удалось классифицировать как поддерживаемый переход. | Открыть точную диагностику; статус сам по себе не доказывает удаления source-страницы. |
| `unsupported` | 1. Источник пометил конструкцию ссылки как неподдерживаемую для обхода. | Проверить source-ссылку; автоматически граф по ней не расширяется. |

### Качество преобразования

| Категория | Влияние |
| --- | --- |
| Normalization | Безопасная разница сериализации или нативный эквивалент; остаётся `complete` |
| Adaptation | Другое представление с проверенной полнотой, например Grid → static table; остаётся `complete` |
| Preserved external reference | Внешний URL сохранён как внешний и не требует копирования; остаётся `complete` |
| Degradation | Данные или значимая структура отсутствуют либо полнота не доказана; даёт `partial` |
| Warning | Требует внимания, но сам по себе не доказывает потерю |
| Error | Неудавшаяся API/record/verification операция; итог зависит от сохранности полного body и объекта |

HTML, JSON, terminal summary и `reports list` используют одинаковые totals; зависимые `blocked` объекты не считаются отдельными root errors. Адаптация и normalization не создают warning; warning не обязательно означает неполный перенос.

## Разработка

```bash
git clone https://github.com/iwonz/ywtc.git
cd ywtc
npm ci
npm run workspace:init
npm run check
```

`npm run check` включает release/security checks, TypeScript, Biome, Knip, Vitest, Playwright, сборку, package smoke-test и OpenSpec. Процесс изменений: [`AGENTS.md`](AGENTS.md). Релизный архив: `npm run package:pack -- /tmp/ywtc-release`; прямой `npm pack` не поддерживает используемое сочетание overrides и bundled dependencies.

Release Please рассчитывает SemVer из Conventional Commits. Push исходного изменения и открытый release PR означают pending release, а не завершённый релиз. Проверьте версию и влейте release PR: workflow создаст GitHub tag/release, опубликует npm с OIDC provenance и обновит Homebrew.

Релиз завершает только успешный `Verify complete release`: он сверяет metadata/CHANGELOG, GitHub assets/notes, npm tarball и `Formula/ywtc.rb`. Ручная read-only проверка: `npm run release:verify -- vX.Y.Z`. Сбой восстанавливают через `workflow_dispatch` для существующего tag; tag вручную не создают и не перемещают.
