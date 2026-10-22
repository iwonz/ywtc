const expectedReadmeHeadings = [
  'Быстрый старт',
  'Возможности',
  'Совместимость',
  'Конфигурация',
  'CLI',
  'Файловый экспорт',
  'State и повторные запуски',
  'Отчёты и статусы',
  'Разработка',
];

const requiredQuickStartCommands = [
  'npm install -g @iwonz/ywtc',
  'ywtc init --interactive',
  'ywtc migrate --interactive',
];

const requiredExampleLabels = [
  '# Перенести структурное поддерево',
  '# Перенести рекурсивно связанные страницы',
  '# Создать автономный HTML и ZIP',
  '# Повторить только исправимые проблемы выбранной миграции',
];

const statusHeadings = [
  'Статусы страниц',
  'Статусы файлов',
  'Статусы архивов комментариев',
  'Статусы Grid',
  'Статусы упоминаний',
  'Статусы запуска',
  'Статусы обхода ссылок',
  'Статусы инвентаризации',
];

const statusColumns = ['Статус', 'Условия назначения', 'Что делать'];

function h2Section(readme, heading) {
  const marker = `## ${heading}`;
  const start = readme.indexOf(marker);
  if (start < 0) return '';
  const contentStart = start + marker.length;
  const next = readme.indexOf('\n## ', contentStart);
  return readme.slice(contentStart, next < 0 ? readme.length : next);
}

function statusSections(readme, heading) {
  const reports = h2Section(readme, 'Отчёты и статусы');
  const headings = [...reports.matchAll(/^###\s+(.+?)[ \t]*$/gm)];
  return headings.flatMap((match, index) => match[1] === heading
    ? [reports.slice(match.index + match[0].length, headings[index + 1]?.index ?? reports.length)]
    : []);
}

function tableRows(section) {
  return section.split('\n')
    .map((line) => line.trim())
    .filter((line) => line.startsWith('|'))
    .map((line) => line.replace(/^\||\|$/g, '').split(/(?<!\\)\|/).map((cell) => cell.trim()));
}

export function readmeStatusValues(readme, heading) {
  const section = statusSections(readme, heading)[0];
  return section === undefined ? [] : tableRows(section).slice(2).map((cells) => cells[0].replace(/^`|`$/g, ''));
}

function validateStatusTables(readme) {
  const findings = [];
  for (const heading of statusHeadings) {
    const sections = statusSections(readme, heading);
    if (sections.length === 0) {
      findings.push(`status table is missing: ${heading}`);
      continue;
    }
    if (sections.length !== 1) findings.push(`status table heading must occur exactly once: ${heading}`);
    const rows = tableRows(sections[0]);
    if (JSON.stringify(rows[0]) !== JSON.stringify(statusColumns)) {
      findings.push(`status table columns must be ${statusColumns.join(' / ')} in ${heading}`);
    }
    if (rows[1]?.length !== 3 || !rows[1].every((cell) => /^:?-{3,}:?$/.test(cell))) {
      findings.push(`status table separator must have exactly three columns in ${heading}`);
    }
    if (rows.length < 3) findings.push(`status table must contain status rows in ${heading}`);
    const seen = new Set();
    for (const cells of rows.slice(2)) {
      if (cells.length !== 3) {
        findings.push(`status rows must have exactly three columns in ${heading}`);
        continue;
      }
      const [statusCell, conditions, action] = cells;
      const status = statusCell.replace(/^`|`$/g, '');
      if (!/^`[a-z]+(?:-[a-z]+)*`$/.test(statusCell)) findings.push(`status must be one code-formatted value in ${heading}`);
      if (seen.has(status)) findings.push(`duplicate status ${status} in ${heading}`);
      seen.add(status);
      const items = conditions.split(/<br\s*\/?>/i).map((item) => item.trim());
      if (!items.every((item, index) => {
        const numbered = item.match(/^(\d+)\.[ \t]+(\S.*)$/);
        return numbered && Number(numbered[1]) === index + 1;
      })) {
        findings.push(`status conditions must be a nonempty sequential numbered list for ${status} in ${heading}`);
      }
      if (!action) findings.push(`status action is missing for ${status} in ${heading}`);
    }
  }
  return findings;
}

export function validateReadmeContract(readme) {
  const findings = [];
  const headings = [...readme.matchAll(/^##[ \t]+(.+?)[ \t]*$/gm)].map((match) => match[1]);
  if (JSON.stringify(headings) !== JSON.stringify(expectedReadmeHeadings)) {
    findings.push(`second-level headings must be exactly: ${expectedReadmeHeadings.join(' → ')}`);
  }

  const quickStart = h2Section(readme, 'Быстрый старт');
  for (const command of requiredQuickStartCommands) {
    if (!quickStart.includes(command)) findings.push(`quick start is missing: ${command}`);
  }

  const cli = h2Section(readme, 'CLI');
  for (const label of requiredExampleLabels) {
    if (!cli.includes(label)) findings.push(`CLI examples are missing: ${label.slice(2)}`);
  }
  const labelledExamples = cli.match(/^# (?:Перенести|Создать|Открыть|Повторить)/gm) ?? [];
  if (labelledExamples.length !== requiredExampleLabels.length) {
    findings.push(`CLI must contain exactly ${requiredExampleLabels.length} labelled common examples`);
  }

  return [...findings, ...validateStatusTables(readme)];
}
