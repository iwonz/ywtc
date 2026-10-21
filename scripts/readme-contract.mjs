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

function h2Section(readme, heading) {
  const marker = `## ${heading}`;
  const start = readme.indexOf(marker);
  if (start < 0) return '';
  const contentStart = start + marker.length;
  const next = readme.indexOf('\n## ', contentStart);
  return readme.slice(contentStart, next < 0 ? readme.length : next);
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

  return findings;
}
