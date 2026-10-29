import {mkdtemp, readFile, writeFile} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {expect, test} from '@playwright/test';
import {parseMentionDecisions} from '../../src/mention-decisions.js';
import {writeMentionBundle} from '../../src/mention-export.js';

let url: string, temporary: string, replacement: string;
test.beforeAll(async () => {
  temporary = await mkdtemp(path.join(os.tmpdir(), 'ywtc-mentions-browser-'));
  const document = parseMentionDecisions({source: {provider: 'yandex-wiki', instance: 'https://wiki.example.com'}, entries: [
    {identity: {username: 'ivan'}, mention: '@ivan', decision: 'skip', occurrences: [{pageId: '1', pageTitle: 'Example page', pageUrl: 'https://wiki.example.com/page', location: 'page', count: 2}]},
    {identity: {username: 'maria'}, mention: '@maria', decision: 'skip'},
  ]});
  url = (await writeMentionBundle(path.join(temporary, 'editor'), document)).url;
  replacement = path.join(temporary, 'other.json');await writeFile(replacement, JSON.stringify({...document, entries: []}));
});

test('offline decisions support editing, validation, delete/undo, download and safe import', async ({page}) => {
  const requests: string[] = [], errors: string[] = [];
  page.on('request', request => {if (/^https?:/.test(request.url())) requests.push(request.url());});
  page.on('pageerror', error => errors.push(error.message));
  await page.goto(url);
  await expect(page.getByRole('heading', {name: 'Решения для упоминаний'})).toBeVisible();
  await page.getByText('Где встречается').click();
  await expect(page.getByRole('link', {name: 'Example page'})).toHaveAttribute('href', 'https://wiki.example.com/page');
  await page.getByRole('radiogroup', {name: 'Решение @ivan'}).getByText('Ссылка', {exact: true}).click();
  await page.getByRole('button', {name: 'Сохранить JSON'}).click();
  await expect(page.getByRole('alert')).toContainText('username:ivan');
  await page.getByRole('textbox', {name: 'URL @ivan', exact: true}).fill('https://people.example.com/ivan');
  await page.getByRole('textbox', {name: 'Текст @ivan', exact: true}).fill('@{ivan}');
  await expect(page.getByRole('link', {name: 'Предпросмотр @ivan'})).toHaveText('@{ivan}');
  await page.getByRole('button', {name: 'Удалить @maria'}).click();
  await expect(page.getByTestId('decision-row')).toHaveCount(1);
  await page.getByRole('button', {name: 'Отменить удаление'}).click();
  await expect(page.getByTestId('decision-row')).toHaveCount(2);
  await page.getByRole('textbox', {name: 'Поиск упоминаний'}).fill('maria');
  await expect(page.getByTestId('decision-row')).toHaveCount(1);
  await page.getByRole('textbox', {name: 'Поиск упоминаний'}).fill('');
  const downloadPromise = page.waitForEvent('download');await page.getByRole('button', {name: 'Сохранить JSON'}).click();
  const download = await downloadPromise;const saved = path.join(temporary, 'downloaded.json');await download.saveAs(saved);
  const document = parseMentionDecisions(JSON.parse(await readFile(saved, 'utf8')));
  expect(document.entries[0]).toMatchObject({decision: 'url', text: '@{ivan}', url: 'https://people.example.com/ivan'});
  await page.getByLabel('Файл решений').setInputFiles(saved);
  await page.getByRole('textbox', {name: 'Текст @ivan', exact: true}).fill('Changed');
  await page.getByLabel('Файл решений').setInputFiles(replacement);
  await expect(page.getByRole('dialog')).toBeVisible();
  await page.getByRole('button', {name: 'Отмена', exact: true}).last().click();
  await expect(page.getByRole('textbox', {name: 'Текст @ivan', exact: true})).toHaveValue('Changed');
  await page.getByLabel('Файл решений').setInputFiles({name: 'bad.json', mimeType: 'application/json', buffer: Buffer.from('{"entries":[]}')});
  await expect(page.getByRole('alert')).toContainText('Файл не открыт');
  await expect(page.getByTestId('decision-row')).toHaveCount(2);
  await page.getByLabel('Файл решений').setInputFiles(replacement);await page.getByRole('button', {name: 'Заменить', exact: true}).click();
  await expect(page.getByText('Упоминаний нет. Можно открыть другой JSON.')).toBeVisible();
  expect(requests).toEqual([]);expect(errors).toEqual([]);
});

test('virtualized large lists work on mobile in both themes with keyboard and hostile content', async ({page}) => {
  await page.setViewportSize({width: 390, height: 844});await page.goto(url);
  const entries = Array.from({length: 10000}, (_, index) => ({identity: {username: `user${index}`}, mention: `@user${index}`, decision: 'skip'}));
  entries[9999]!.mention = '<script>window.injected=true</script>';
  await page.getByLabel('Файл решений').setInputFiles({name: 'large.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify({source: {provider: 'yandex-wiki', instance: 'https://wiki.example.com'}, entries}))});
  await expect(page.getByText('Показано 10000 / 10000')).toBeVisible();
  expect(await page.getByTestId('decision-row').count()).toBeLessThan(60);
  await page.getByRole('treeitem').first().focus();await page.keyboard.press('ArrowDown');
  await expect(page.getByRole('treeitem').nth(1)).toBeFocused();
  await page.getByRole('textbox', {name: 'Поиск упоминаний'}).fill('user9999');
  await expect(page.getByText('<script>window.injected=true</script>', {exact: true})).toBeVisible();
  for (let index = 0; index < 2; index++) await page.getByRole('button', {name: /тема/}).click();
  await expect(page.locator('html')).toHaveClass(/dark|light/);
  expect(await page.evaluate(() => 'injected' in window)).toBe(false);
  expect(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)).toBe(false);
});
