import {readFile} from 'node:fs/promises';
import {describe, expect, it} from 'vitest';
import {validateReadmeContract} from '../scripts/readme-contract.mjs';

describe('README contract', () => {
  it('accepts the maintained README', async () => {
    expect(validateReadmeContract(await readFile('README.md', 'utf8'))).toEqual([]);
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
    expect(validateReadmeContract(readme.replace('# Открыть последний корректный отчёт', ''))).toEqual(
      expect.arrayContaining([
        'CLI examples are missing: Открыть последний корректный отчёт',
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
