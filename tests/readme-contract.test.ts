import {readFile} from 'node:fs/promises';
import {describe, expect, it} from 'vitest';
import {readmeStatusValues, validateReadmeContract} from '../scripts/readme-contract.mjs';

const statusTables = [
  {heading: 'Статусы страниц', source: 'src/state.ts', type: 'PageTransferStatus', extra: ['excluded']},
  {heading: 'Статусы файлов', source: 'src/state.ts', type: 'ResourceTransferStatus'},
  {heading: 'Статусы архивов комментариев', source: 'src/state.ts', type: 'CommentTransferStatus'},
  {heading: 'Статусы Grid', values: ['planned', 'not-started', 'blocked', 'complete', 'failed']},
  {heading: 'Статусы упоминаний', source: 'src/domain.ts', type: 'MentionOutcome'},
  {heading: 'Статусы запуска', source: 'src/state.ts', type: 'RunStatus'},
  {heading: 'Статусы обхода ссылок', source: 'src/domain.ts', type: 'GraphEdgeStatus'},
  {heading: 'Статусы инвентаризации', source: 'src/report-contract.ts', type: 'ReportInventoryStatus'},
];

function statusTable(heading: string, rows = '| `complete` | 1. Проверено.<br>2. Подтверждено. | Ничего. |'): string {
  return `### ${heading}\n\n| Статус | Условия назначения | Что делать |\n| --- | --- | --- |\n${rows}\n`;
}

function withStatusTables(readme: string, firstTable?: string): string {
  const sections = statusTables.map(({heading}, index) => index === 0 && firstTable ? firstTable : statusTable(heading)).join('\n');
  return readme.replace(/## Отчёты и статусы[\s\S]*?(?=\n## |$)/, `## Отчёты и статусы\n\n${sections}`);
}

describe('README contract', () => {
  it('accepts the maintained README', async () => {
    expect(validateReadmeContract(await readFile('README.md', 'utf8'))).toEqual([]);
  });

  it.each(statusTables)('documents exactly the current vocabulary: $heading', async ({heading, source, type, extra, values}) => {
    const readme = await readFile('README.md', 'utf8');
    const union = source ? (await readFile(source, 'utf8')).match(new RegExp(`export type ${type} = ([^;]+);`))?.[1] : undefined;
    if (source) expect(union, `Missing runtime type ${type}`).toBeDefined();
    const expected = values ?? [...(union?.matchAll(/'([^']+)'/g) ?? [])].map((match) => match[1]!);
    const documented = readmeStatusValues(readme, heading);
    expect(documented).toHaveLength(new Set(documented).size);
    expect([...documented].sort()).toEqual([...expected, ...(extra ?? [])].sort());
  });

  it('accepts separate status tables with numbered conditions', async () => {
    const readme = withStatusTables(await readFile('README.md', 'utf8'));
    expect(validateReadmeContract(readme)).toEqual([]);
    expect(readmeStatusValues(readme, 'Статусы страниц')).toEqual(['complete']);
  });

  it('allows escaped pipes inside a status condition', async () => {
    const readme = await readFile('README.md', 'utf8');
    const table = statusTable('Статусы страниц', '| `complete` | 1. Выбрано `all\\|current`. | Ничего. |');
    expect(validateReadmeContract(withStatusTables(readme, table))).toEqual([]);
  });

  it.each(statusTables)('rejects a missing status table: $heading', async ({heading}) => {
    const readme = withStatusTables(await readFile('README.md', 'utf8')).replace(statusTable(heading), '');
    expect(validateReadmeContract(readme)).toContain(`status table is missing: ${heading}`);
  });

  it('rejects status tables placed outside the reports section', async () => {
    const readme = withStatusTables(await readFile('README.md', 'utf8')).replace(statusTable('Статусы страниц'), '');
    expect(validateReadmeContract(`${readme}\n${statusTable('Статусы страниц')}`)).toContain('status table is missing: Статусы страниц');
  });

  it('rejects duplicate status rows and headings', async () => {
    const readme = await readFile('README.md', 'utf8');
    const duplicatedRow = statusTable('Статусы страниц', '| `complete` | 1. Проверено. | Ничего. |\n| `complete` | 1. Проверено снова. | Ничего. |');
    expect(validateReadmeContract(withStatusTables(readme, duplicatedRow))).toContain('duplicate status complete in Статусы страниц');
    const duplicatedHeading = withStatusTables(readme, `${statusTable('Статусы страниц')}\n${statusTable('Статусы страниц')}`);
    expect(validateReadmeContract(duplicatedHeading)).toContain('status table heading must occur exactly once: Статусы страниц');
  });

  it.each([
    '',
    'Проверено.',
    '2. Проверено.',
    '1. Проверено.<br>3. Подтверждено.',
    '1. Проверено.<br>1. Подтверждено.',
    '1. Проверено.<br>2.',
  ])('rejects absent or malformed numbered conditions: %s', async (conditions) => {
    const readme = await readFile('README.md', 'utf8');
    const table = statusTable('Статусы страниц', `| \`complete\` | ${conditions} | Ничего. |`);
    expect(validateReadmeContract(withStatusTables(readme, table))).toContain('status conditions must be a nonempty sequential numbered list for complete in Статусы страниц');
  });

  it('rejects an empty action or malformed table columns', async () => {
    const readme = await readFile('README.md', 'utf8');
    const emptyAction = statusTable('Статусы страниц', '| `complete` | 1. Проверено. | |');
    expect(validateReadmeContract(withStatusTables(readme, emptyAction))).toContain('status action is missing for complete in Статусы страниц');
    const extraColumn = statusTable('Статусы страниц', '| `complete` | 1. Проверено. | Ничего. | Лишнее. |');
    expect(validateReadmeContract(withStatusTables(readme, extraColumn))).toContain('status rows must have exactly three columns in Статусы страниц');
    const wrongHeader = statusTable('Статусы страниц').replace('Условия назначения', 'Описание');
    expect(validateReadmeContract(withStatusTables(readme, wrongHeader))).toContain('status table columns must be Статус / Условия назначения / Что делать in Статусы страниц');
  });

  it.each([
    'npm install -g @iwonz/ywtc',
    'ywtc init --interactive',
    'ywtc migrate --interactive',
  ])('rejects a missing quick-start command: %s', async (command) => {
    const readme = await readFile('README.md', 'utf8');
    expect(validateReadmeContract(readme.replace(command, ''))).toContain(`quick start is missing: ${command}`);
  });

  it('rejects missing or extra common examples', async () => {
    const readme = await readFile('README.md', 'utf8');
    expect(validateReadmeContract(readme.replace('# Повторить только исправимые проблемы выбранной миграции', ''))).toEqual(
      expect.arrayContaining([
        'CLI examples are missing: Повторить только исправимые проблемы выбранной миграции',
        'CLI must contain exactly 4 labelled common examples',
      ]),
    );
    expect(validateReadmeContract(readme.replace('```\n\n## Файловый экспорт', '# Открыть ещё один отчёт\n```\n\n## Файловый экспорт'))).toContain(
      'CLI must contain exactly 4 labelled common examples',
    );
  });

  it('rejects a reordered information architecture', async () => {
    const readme = await readFile('README.md', 'utf8');
    const reordered = readme.replace('## Возможности', '## TEMP').replace('## Совместимость', '## Возможности').replace('## TEMP', '## Совместимость');
    expect(validateReadmeContract(reordered)).toEqual(
      expect.arrayContaining([expect.stringContaining('second-level headings must be exactly')]),
    );
  });
});
