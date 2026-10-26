import '@mantine/core/styles.css';
import '@fontsource-variable/inter';
import './style.css';
import {ActionIcon, Alert, Anchor, Badge, Button, Container, Group, MantineProvider, Modal, SegmentedControl, Stack, Text, TextInput, Title} from '@mantine/core';
import {useVirtualizer} from '@tanstack/react-virtual';
import {Download, Moon, Search, Sun, Trash2, Undo2, Upload } from 'lucide-react';
import {useRef, useState} from 'react';
import {createRoot} from 'react-dom/client';
import {safeMentionUrl } from '../../src/mention-decisions.js';
import {filterDecisions} from './model';
import {changeDecision, changeText, defaultLabel, entryKey, entryName, parseDocument, rowError, serializeDocument, type EditorDocument, type EditorEntry, type EditorKind} from './adapter';
const kind: EditorKind = window.document.getElementById('ywtc-mentions-data')?.dataset.kind === 'hashtags' ? 'hashtags' : 'mentions';
const subject = kind === 'hashtags' ? 'тегов' : 'упоминаний';
window.document.title = `ywtc · Решения для ${subject}`;

function initialTheme(): 'light' | 'dark' {
  try {const theme = localStorage.getItem('ywtc-mentions-theme');if (theme === 'light' || theme === 'dark') return theme;} catch {}
  return matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

function Editor({initial}: {initial: EditorDocument}) {
  const [document, setDocument] = useState(initial), [baseline, setBaseline] = useState(JSON.stringify(initial));
  const [theme, setTheme] = useState(initialTheme), [search, setSearch] = useState(''), [filter, setFilter] = useState('all');
  const [error, setError] = useState(''), [pending, setPending] = useState<EditorDocument>(), [removed, setRemoved] = useState<{entry: EditorEntry; index: number}>();
  const fileInput = useRef<HTMLInputElement>(null), scroll = useRef<HTMLDivElement>(null);
  const rows = filterDecisions(document.entries, search, filter), dirty = JSON.stringify(document) !== baseline;
  const virtual = useVirtualizer({count: rows.length, getScrollElement: () => scroll.current, estimateSize: () => 160, overscan: 8});
  const virtualized = rows.length > 80;
  const replaceDocument = (value: EditorDocument) => {setDocument(value);setBaseline(JSON.stringify(value));setRemoved(undefined);setPending(undefined);setSearch('');setFilter('all');setError('');};
  const update = (index: number, entry: EditorEntry) => {setDocument(current => ({...current, entries: current.entries.map((value, position) => position === index ? entry : value)}));};
  const importFile = async (file: File) => {
    try {const value = parseDocument(JSON.parse(await file.text()), kind);if (dirty) setPending(value);else replaceDocument(value);}
    catch (failure) {setError(`Файл не открыт: ${(failure as Error).message}`);}
  };
  const save = () => {
    try {
      const json = serializeDocument(document, kind), url = URL.createObjectURL(new Blob([json], {type: 'application/json'}));
      const link = window.document.createElement('a');link.href = url;link.download = 'decisions.json';link.click();setTimeout(() => URL.revokeObjectURL(url), 0);
      setBaseline(JSON.stringify(document));setError('');
    } catch (failure) {setError((failure as Error).message);}
  };
  const renderRow = ({entry, index}: {entry: EditorEntry; index: number}) => {
    const label = entry.decision === 'skip' ? entryName(entry) : entry.text ?? defaultLabel(entry);
    const count = entry.occurrences?.reduce((sum, occurrence) => sum + occurrence.count, 0) ?? 0;
    return <div className="decision-row" data-testid="decision-row">
      <Group justify="space-between" align="start" wrap="wrap">
        <Stack gap={4} className="identity"><Text fw={600}>{entryName(entry)}</Text><Text size="xs" c="dimmed">{entryKey(entry)}</Text>{count > 0 && <Badge variant="light">{count} вхождений</Badge>}</Stack>
        <Group gap="xs"><SegmentedControl aria-label={`Решение ${entryName(entry)}`} value={entry.decision} data={[{label: 'Как есть', value: 'skip'}, ...(kind === 'hashtags' ? [{label: 'Текст', value: 'text'}] : []), {label: 'Ссылка', value: 'url'}]} onChange={value => update(index, changeDecision(entry, value))}/>
          <ActionIcon variant="subtle" color="red" aria-label={`Удалить ${entryName(entry)}`} onClick={() => {setRemoved({entry, index});setDocument(current => ({...current, entries: current.entries.filter((_, position) => position !== index)}));}}><Trash2 size={17}/></ActionIcon></Group>
      </Group>
      {entry.decision !== 'skip' && <div className="link-fields">{entry.decision === 'url' && <TextInput label="URL" aria-label={`URL ${entryName(entry)}`} value={entry.url} error={rowError(entry) ? 'Укажите корректный HTTP(S) URL и текст' : undefined} onChange={event => update(index, {...entry, url: event.currentTarget.value})}/>}<TextInput label={entry.decision === 'url' ? 'Текст ссылки' : 'Текст'} aria-label={`Текст ${entryName(entry)}`} placeholder={defaultLabel(entry)} value={entry.text ?? ''} onChange={event => update(index, changeText(entry, event.currentTarget.value))}/>
        {entry.decision === 'url' && safeMentionUrl(entry.url) && <Anchor className="preview" href={entry.url} target="_blank" rel="noopener noreferrer" aria-label={`Предпросмотр ${entryName(entry)}`}>{label}</Anchor>}</div>}
      {!!entry.occurrences?.length && <details onToggle={() => virtual.measure()}><summary>Где встречается</summary>{entry.occurrences.map((occurrence) => <div className="context" key={`${occurrence.pageId}:${occurrence.location}:${occurrence.commentId ?? ""}`}>{safeMentionUrl(occurrence.pageUrl) ? <Anchor href={occurrence.pageUrl} target="_blank" rel="noopener noreferrer">{occurrence.pageTitle || occurrence.pageId}</Anchor> : <Text>{occurrence.pageTitle || occurrence.pageId}</Text>}<Text size="xs" c="dimmed">{occurrence.location === 'comment' ? `Комментарий ${occurrence.commentId}` : 'Страница'} · {occurrence.count} ×</Text></div>)}</details>}
    </div>;
  };
  return <MantineProvider forceColorScheme={theme}><Container size="lg" py="xl">
    <Group justify="space-between"><div><Text size="xs" c="dimmed">YWTC / {kind.toUpperCase()}</Text><Title order={1} size="h2">Решения для {subject}</Title></div><ActionIcon variant="subtle" aria-label={theme === 'light' ? 'Тёмная тема' : 'Светлая тема'} onClick={() => {const next = theme === 'light' ? 'dark' : 'light';setTheme(next);try {localStorage.setItem('ywtc-mentions-theme', next);} catch {}}}>{theme === 'light' ? <Moon size={20}/> : <Sun size={20}/>}</ActionIcon></Group>
    <Text c="dimmed" mt="xs">{document.source.provider} · {document.source.instance}</Text>
    <Text size="sm" c="dimmed">Одно решение для всех вхождений. Удалённые и отсутствующие записи переносятся как есть.</Text>
    <Group my="lg"><Button variant="light" leftSection={<Upload size={16}/>} onClick={() => fileInput.current?.click()}>Открыть JSON</Button><Button leftSection={<Download size={16}/>} onClick={save}>Сохранить JSON</Button>{removed && <Button variant="subtle" leftSection={<Undo2 size={16}/>} onClick={() => {setDocument(current => {const entries = [...current.entries];entries.splice(removed.index, 0, removed.entry);return {...current, entries};});setRemoved(undefined);}}>Отменить удаление</Button>}{dirty && <Text size="sm" c="orange">Есть несохранённые изменения</Text>}</Group>
    <input ref={fileInput} type="file" accept=".json,application/json" hidden aria-label="Файл решений" onChange={event => {const file = event.currentTarget.files?.[0];event.currentTarget.value = '';if (file) void importFile(file);}}/>
    {error && <Alert color="red" role="alert" mb="md" title="Проверьте данные">{error}</Alert>}
    {document.inventory && !document.inventory.complete && <Alert color="orange" mb="md" title="Инвентаризация неполная">Прочитано {document.inventory.scannedPages} из {document.inventory.selectedPages} страниц. <details><summary>Диагностика</summary>{document.inventory.issues.map((issue) => <Text size="sm" key={JSON.stringify(issue)}>{issue.pageId ? `[${issue.pageId}] ` : ''}{issue.phase} · {issue.code}: {issue.message}</Text>)}</details></Alert>}
    <Group mb="md" grow><TextInput aria-label={`Поиск ${subject}`} placeholder={kind === 'hashtags' ? 'Тег или страница' : 'Упоминание, identity или страница'} leftSection={<Search size={16}/>} value={search} onChange={event => setSearch(event.currentTarget.value)}/><SegmentedControl aria-label="Фильтр решений" value={filter} onChange={setFilter} data={[{label: 'Все', value: 'all'}, {label: 'Skip', value: 'skip'}, ...(kind === 'hashtags' ? [{label: 'Текст', value: 'text'}] : []), {label: 'URL', value: 'url'}]}/></Group>
    {rows.length > 0 ? <><Text size="sm" c="dimmed" mb="xs">Показано {rows.length} / {document.entries.length}</Text><div className="decision-list" ref={scroll} role="tree" aria-label={`Список ${subject}`} onKeyDown={event => {if (!['ArrowDown', 'ArrowUp'].includes(event.key) || (event.target as HTMLElement).tagName !== 'DIV') return;const current = Number((event.target as HTMLElement).dataset.index);if (!Number.isFinite(current)) return;event.preventDefault();const next = Math.max(0, Math.min(rows.length - 1, current + (event.key === 'ArrowDown' ? 1 : -1)));virtual.scrollToIndex(next);requestAnimationFrame(() => scroll.current?.querySelector<HTMLElement>(`[data-index="${next}"]`)?.focus());}}>
      {virtualized ? <div style={{height: virtual.getTotalSize(), position: 'relative'}}>{virtual.getVirtualItems().map(item => <div key={entryKey(rows[item.index]!.entry)} data-index={item.index} ref={virtual.measureElement} role="treeitem" aria-level={1} tabIndex={0} style={{position: 'absolute', top: 0, width: '100%', transform: `translateY(${item.start}px)`}}>{renderRow(rows[item.index]!)}</div>)}</div> : rows.map((row, index) => <div key={entryKey(row.entry)} data-index={index} role="treeitem" aria-level={1} tabIndex={0}>{renderRow(row)}</div>)}
    </div></> : <Text py="xl" c="dimmed">{document.entries.length ? 'По вашему запросу ничего не найдено.' : kind === 'hashtags' ? 'Тегов нет. Можно открыть другой JSON.' : 'Упоминаний нет. Можно открыть другой JSON.'}</Text>}
    <Modal opened={Boolean(pending)} onClose={() => setPending(undefined)} title="Заменить текущие решения?" closeButtonProps={{'aria-label': 'Отмена'}}><Text>Несохранённые изменения будут потеряны.</Text><Group mt="lg" justify="end"><Button variant="default" onClick={() => setPending(undefined)}>Отмена</Button><Button onClick={() => {if (pending) replaceDocument(pending);}}>Заменить</Button></Group></Modal>
  </Container></MantineProvider>;
}

const root = createRoot(window.document.getElementById('root')!);
try {root.render(<Editor initial={parseDocument(JSON.parse(window.document.getElementById('ywtc-mentions-data')!.textContent!), kind)}/>);}
catch {root.render(<p role="alert">Невалидный начальный JSON решений. Создайте экспорт заново.</p>);}
