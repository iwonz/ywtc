<p align="center">
  <img src="docs/assets/readme-header.png" alt="Yandex Wiki and Confluence sources moving through ywtc to Confluence, Yandex Wiki, Markdown, and HTML destinations" width="100%">
</p>

# ywtc

`ywtc` — CLI для переноса страниц между Yandex Wiki и Confluence и экспорта в Markdown или автономный HTML. Он сохраняет иерархию и доступное содержимое, проверяет результат, продолжает прерванные операции и ничего не удаляет автоматически.

Требуются Node.js `>=24` и npm `>=11.5.1`. Лицензия — [MIT](LICENSE).

## Быстрый старт

```bash
npm install -g @iwonz/ywtc
ywtc init --interactive
ywtc migrate --interactive
```

Первый мастер создаёт рабочий каталог, настраивает Yandex Wiki и Confluence и проверяет соединения. Второй собирает параметры переноса и по умолчанию выполняет dry-run; live-запуск начинается только после подтверждения.

Другие способы запуска:

```bash
# Без глобальной установки
npx @iwonz/ywtc@latest --version

# Homebrew
brew tap iwonz/ywtc https://github.com/iwonz/ywtc.git
brew trust --tap iwonz/ywtc
brew install ywtc
```

Обновление: `ywtc update` проверяет версию, `ywtc update --install` обновляет через обнаруженный канал, `--via npm|brew` выбирает канал явно.

## Возможности

| Материал | Результат |
| --- | --- |
| Страницы и структура | `page`, полное `subtree` или рекурсивный граф `linked`. Иерархия восстанавливается, циклы не создают повторов, пустая страница-раздел остаётся корректной пустой страницей. |
| Текст и таблицы | Сохраняются заголовки, начертания и цвет, списки и задачи, цитаты, разделители, inline/preformatted code с языком и обычные таблицы. Destination получает нативную или семантически эквивалентную разметку. |
| Секции и колонки | YFM `layout/block` и Confluence layouts преобразуются в нативные секции и колонки. HTML использует адаптивную сетку; Markdown сохраняет содержимое ячеек в исходном порядке. |
| Ссылки и якоря | Ссылки внутри выбранного набора переписываются на destination; якоря сохраняются. Внешние ссылки и переходы за границу набора остаются исходными. |
| Файлы и изображения | Доступные через API вложения передаются потоково с проверкой размера и SHA-256. Поддерживаются любые скачиваемые файлы, включая PNG/JPEG/GIF/WebP/SVG, PDF, ZIP, DOCX, XLSX и PPTX. Коллизии имён разрешаются стабильно. |
| Специальная разметка | Notes ↔ callout macros, cuts ↔ expand, tree ↔ children, задачи, code, anchors, page/attachment links и изображения получают ближайший эквивалент. Tabs становятся секциями, Grid — проверяемой статической таблицей. |
| Комментарии | По умолчанию footer/inline page comments архивируются с авторами, датами, статусами и иерархией ответов. Явно упомянутые вложения собираются в проверяемый ZIP с hash-prefixed именами и manifest. |
| Надёжность содержимого | Новая страница сразу создаётся с полным source-derived body, а не placeholder. Ошибка отдельного ресурса не блокирует текст: остаётся source-ссылка и повторяемый outcome. После записи destination перечитывается и проверяется. |
| Различия платформ | Безопасная normalization и полная adaptation считаются `complete`. Если эквивалента нет, ywtc сохраняет читаемый fallback и при необходимости raw snapshot; недоказанная полнота становится degradation. |

### Ограничения

| Не переносится как исходная сущность | Что сохраняется |
| --- | --- |
| История версий | Текущее содержимое; последующие обновления destination образуют его обычную историю версий. |
| Реакции; комментарии к attachments, blog posts и custom content | Только footer/inline comments страницы. |
| Пользователи, watchers, права и ограничения доступа | Авторство комментариев остаётся в архивном тексте; новые объекты создаёт владелец токена и они наследуют права destination. |
| Недоступные или не возвращённые API страницы | Причина и незавершённая ветка фиксируются в state и отчёте. |
| Произвольный CSS, scripts и неизвестные интерактивные widgets/macros | Безопасное статическое представление, fallback или raw snapshot; тихой потери быть не должно. |
| Внешние файлы и изображения | Исходный абсолютный URL, alt и доступные размеры; внешние данные не скачиваются. Недоступный source-managed ресурс считается неполным переносом. |

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

Confluence Server, Data Center Basic Auth и OAuth app-flow не поддерживаются. Перед записью `doctor`/`migrate` проверяет необходимые API и capabilities; контрактные тесты не заменяют live-сертификацию каждой patch-версии.

## Конфигурация

Рабочий каталог выбирается в порядке `--workdir` → `ywtc.config.yaml` непосредственно в текущем каталоге → `~/.ywtc`. Родительские каталоги не просматриваются.

```text
~/.ywtc/
├── ywtc.config.yaml   # подключения, настройки и токены
└── .states/           # state, cache, backups и отчёты
```

`ywtc init --interactive` настраивает и проверяет оба провайдера; `ywtc init` создаёт пустой шаблон для автоматизации. `migrate` создаёт отсутствующий workspace, но до API-запросов требует заполнить обязательные поля. Проверка мастера подтверждает API и авторизацию, но не права конкретных страниц: их проверяют `doctor` или `migrate`. Конфигурация строгая, неизвестные поля отклоняются; process environment её не переопределяет. Локальный файл игнорируется Git, новый создаётся с mode `0600`, секреты маскируются в выводе. Полный шаблон: [`ywtc.config.example.yaml`](ywtc.config.example.yaml).

### Поля `ywtc.config.yaml`

| Поле | Профиль | Значения / default | Назначение |
| --- | --- | --- | --- |
| `defaults.timeoutMs` | общий | `1000..300000`; `30000` | Таймаут HTTP-запроса |
| `defaults.concurrency` | общий | `1..64`; `4` | Общая параллельность операции |
| `connections.<name>` | общий | имя `[a-z0-9._-]+` | Именованное подключение |
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
| `limits.burst` | любой | `1..1000`; Yandex `8`, Confluence `10` | Кратковременный burst |

### Токены

#### Yandex Wiki

1. Создайте приложение в [Яндекс OAuth](https://oauth.yandex.ru/) и выдайте ему [права Wiki](https://yandex.ru/support/wiki/ru/api-ref/access) на чтение, а для destination — на запись.
2. Получите OAuth-токен пользователя с доступом к нужным страницам. Для федеративного пользователя Yandex Cloud допустим IAM-токен.
3. Найдите ID в **Yandex Tracker → Администрирование → Организации** и выберите `organization.type: yandex360` либо `cloud`.
4. Запишите значения в Yandex-профиль; для IAM используйте `authType: iam` и Cloud Organization.

#### Confluence Data Center

1. Откройте **Avatar → Settings → Personal access tokens → Create token**; порядок действий описан в [документации Atlassian](https://confluence.atlassian.com/enterprise/using-personal-access-tokens-1026032365.html).
2. Запишите PAT в профиль с `deployment: data-center` и `authType: pat`.
3. Убедитесь, что пользователь может читать source и создавать страницы и attachments в destination.

#### Confluence Cloud

1. Создайте [Atlassian API token](https://id.atlassian.com/manage-profile/security/api-tokens).
2. Используйте `deployment: cloud`, `authType: api-token`, `email` и `token`; аккаунту нужен доступ к исходному и целевому spaces.

## CLI

### Команды

| Команда | Назначение |
| --- | --- |
| `ywtc init [-i] [-w <path>]` | Создать workspace или настроить оба подключения в TTY-мастере |
| `ywtc doctor [options]` | Проверить workspace; с source и destination — выполнить read-only preflight |
| `ywtc migrate -i` | Выбрать параметры, выполнить dry-run и при допустимом результате явно перейти к live |
| `ywtc migrate -s <locator> -d <locator\|directory> [options]` | Неинтерактивный перенос или экспорт |
| `ywtc reports list [-w <path>]` | Показать локальные отчёты от новых к старым |
| `ywtc reports open [run-id\|last] [-w <path>]` | Открыть выбранный или последний корректный отчёт |
| `ywtc update [-i] [-c npm\|brew]` | Проверить или установить обновление безопасным для текущего канала способом |

### Опции

| Полная / short | Команды | Значения и назначение |
| --- | --- | --- |
| `--interactive`, `-i` | `init`, `migrate` | TTY-мастер; в `migrate` переданные опции становятся редактируемыми defaults |
| `--workdir`, `-w` | `init`, `doctor`, `migrate`, `reports` | Явный workspace; поддерживается `~/...` |
| `--source`, `-s` | `doctor`, `migrate` | URL, page ID или Yandex slug; обязателен в неинтерактивном `migrate` |
| `--destination`, `-d` | `doctor`, `migrate` | Родительская страница или каталог; обязателен в неинтерактивном `migrate` |
| `--source-profile`, `-S` | `doctor`, `migrate` | Имя source-профиля при неоднозначном коротком locator |
| `--destination-profile`, `-D` | `doctor`, `migrate` | Имя remote destination-профиля; запрещён для файлового экспорта |
| `--scope`, `-m` | `doctor`, `migrate` | `page`, `subtree` (default), `linked` |
| `--source-status`, `-t` | `doctor`, `migrate` | `all` (default) или `current`; root включается всегда |
| `--comments`, `-C` / `--no-comments`, `-N` | `doctor`, `migrate` | Комментарии включены по умолчанию; `-N` исключает все comment API calls |
| `--format`, `-f` | `doctor`, `migrate` | `markdown` или `html`; делает destination файловым |
| `--archive`, `-a` | `migrate` | Дополнительный ZIP для файлового экспорта |
| `--dry-run`, `-n` | `migrate` | Полный discovery/render без destination writes |
| `--fresh`, `-F` | `migrate` | Игнорировать mappings; существующий live-state сохранить как backup |
| `--open-report`, `-o` | `migrate` | Открыть итоговый HTML; ошибка opener не меняет outcome переноса |
| `--concurrency`, `-j` | `migrate` | `1..64`; иначе `defaults.concurrency` |
| `--state`, `-r` | `migrate` | Явный state path внутри workspace |
| `--install`, `-i` | `update` | Установить найденное обновление |
| `--via`, `-c` | `update` | `npm` или `brew` |
| `--help`, `-h` / `--version`, `-v` | CLI | Справка / версия |

Short-алиасы локальны для команды: `migrate -i` запускает мастер, `update -i` устанавливает обновление.

### Locators и выбор страниц

- Yandex Wiki: полный URL, числовой page ID или slug вида `team/start`.
- Confluence: числовой page ID, URL с `pageId=<id>`, `/pages/<id>` или `/content/<id>`.
- Полный URL выбирает профиль по нормализованному base URL. Для неоднозначного ID/slug укажите профиль явно.
- Каталог считается destination только с `--format`.

| Scope | Выбор |
| --- | --- |
| `page` | Только root |
| `subtree` | Root и все доступные структурные descendants до последнего уровня; default |
| `linked` | Детерминированный BFS по внутренним ссылкам и page/include references; циклы завершаются безопасно |

`--source-status all` включает все доступные descendants: в Yandex Wiki — `actual` и `obsolete`; `current` оставляет только `actual/current`. Confluence зависит от hierarchy API и может не возвращать archived, trashed и historical versions.

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

# Открыть последний корректный отчёт
ywtc reports open last
```

## Файловый экспорт

Markdown создаёт `index.md`, `pages/`, `attachments/` и `.ywtc-export.json`. HTML создаёт автономный адаптивный сайт с локальным CSS, который работает через `file://` и на static hosting без CDN или внешнего runtime. `_source/` появляется только для страниц, которым нужен raw snapshot.

Внутренние ссылки и resources становятся относительными. Комментарии входят в страницу раскрываемыми ветками; явно связанные с ними файлы находятся в одном ZIP с `manifest.json`.

Экспорт строится в соседнем staging-каталоге. Существующий каталог заменяется только при актуальном manifest с `tool: ywtc` и той же canonical identity; предыдущая версия сохраняется как timestamped backup. `--archive` оставляет каталог и создаёт новый ZIP, не перезаписывая существующий.

## State и повторные запуски

State находится в `<workdir>/.states/<automatic-id>.json`. ID зависит от канонических профилей и page IDs, а для экспорта — ещё от формата; URL/ID/slug, `scope` и `source-status` его не меняют. Относительный `--state` разрешается только внутри workspace.

- Повтор одинакового направления подхватывает mappings, cache и незавершённые операции без дубликатов.
- Для доказанной mapping source авторитетен: body, title и parent обновляются поверх текущей destination-версии, а прежнее содержимое остаётся в истории. Unmapped и неоднозначно принадлежащие объекты не перезаписываются.
- Неверная иерархия исправляется сверху вниз; временные `404` повторяются, пропавшая mapped-страница восстанавливается под ожидаемым родителем без удаления старого объекта.
- Файлы согласуются по immutable ID, размеру и SHA-256; проверенный cache переиспользуется, занятые имена получают стабильный суффикс.
- Комментарии и их ZIP проверяются и переиспользуются. Confluence-архив обновляется версией, Yandex Wiki получает новую ревизию; исчезнувший source-архив сохраняется как stale.
- `current → all` расширяет тот же state; обратное переключение не удаляет прежние mappings. Удаление в source также не удаляет destination.
- `--fresh` игнорирует mappings и сохраняет прежний state как backup; destination при этом может получить новые объекты.

Live-run использует exclusive lock; stale lock восстанавливается. При SIGINT/SIGTERM новые задачи не запускаются, безопасные активные операции завершаются, state и отчёт сохраняются. Коды выхода: `0` — completed, `1` — partial/verification failure, `2` — usage/config/preflight, `130`/`143` — сигнал.

## Отчёты и статусы

Каждый запуск создаёт `<workdir>/.states/reports/<run-id>/index.html` и очищенный `report.json`, затем печатает URL и команду открытия. Используйте `--open-report`, `ywtc reports list` или `ywtc reports open [run-id|last]`; без selector `open` также выбирает последний корректный отчёт.

Автономный отчёт показывает только ненулевые показатели, канонические source/destination, исходную иерархию, исключённые страницы и проблемы. Дерево поддерживает поиск и фильтры; детали страницы содержат доступные files, comments, side-by-side comparison и диагностику. RU/EN и system/light/dark переключаются иконками. `report.json` не содержит body страниц, тексты комментариев или preview HTML.

### Outcomes объектов

| Outcome | Объекты | Значение и действие |
| --- | --- | --- |
| `complete` | страницы, файлы, comment archives | Записано и проверено; действий не требуется |
| `partial` | страницы, файлы, comment archives | Основное представление доступно, но часть данных отсутствует или не проверена; изучить degradation и повторить retryable-операцию |
| `failed` | все | Операция началась, но корректная запись или проверка не получилась; исправить root error и повторить запуск |
| `blocked` | страницы, файлы, comment archives | Операция не начиналась из-за недоступного parent/dependency; сначала исправить upstream failure/conflict |
| `conflict` | mapped-объекты | Immutable ownership/identity неоднозначна; проверить candidate IDs. Обычная новая версия, ручное изменение, title collision или HTTP `409` конфликтом не считаются |
| `planned` | все | Объект рассчитан в dry-run, записи не было; запустить live |
| `not-started` | все | Live-run остановился до независимой операции; повторить запуск |

### Качество преобразования

| Категория | Влияние |
| --- | --- |
| Normalization | Безопасная разница сериализации или нативный эквивалент; остаётся `complete` |
| Adaptation | Другое представление с проверенной полнотой, например Grid → static table; остаётся `complete` |
| Preserved external reference | Внешний URL сохранён как внешний и не требует копирования; остаётся `complete` |
| Degradation | Данные или значимая структура отсутствуют либо полнота не доказана; даёт `partial` |
| Warning | Требует внимания, но сам по себе не доказывает потерю |
| Error | Неудавшаяся API/record/verification операция; итог зависит от сохранности полного body и объекта |

Итог запуска: `completed`, `completed-with-warnings`, `partial`, `failed`, `cancelled` или `interrupted`. HTML, JSON, terminal summary и `reports list` используют одинаковые totals; зависимые `blocked` объекты не считаются отдельными root errors.

## Разработка

```bash
git clone https://github.com/iwonz/ywtc.git
cd ywtc
npm ci
npm run workspace:init
npm run check
```

`npm run check` запускает release hygiene и security audit, TypeScript, Biome, Knip, Vitest, Playwright, сборку, package smoke-test и строгую OpenSpec-валидацию. Любое изменение проходит цикл из [`AGENTS.md`](AGENTS.md).

Release Please рассчитывает SemVer из Conventional Commits. После merge release PR GitHub Actions публикует GitHub Release и npm-пакет с OIDC provenance, затем генерирует, устанавливает и тестирует Homebrew-формулу.
