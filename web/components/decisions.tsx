'use client';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';
import {
	ActionIcon,
	Alert,
	Badge,
	Button,
	Checkbox,
	FileButton,
	Group,
	Modal,
	NativeSelect,
	Select,
	Stack,
	TextInput,
	Tooltip,
} from '@mantine/core';
import { Trash2, Undo2 } from 'lucide-react';
import {
	changeDecision,
	changeText,
	defaultLabel,
	entryKey,
	entryName,
	parseDocument,
	rowError,
	serializeDocument,
} from '../../mentions-ui/src/adapter';
import { filterDecisions } from '../../mentions-ui/src/model';
import { api, download, safeLink, type Translate } from './api';

export function Decisions({
	root,
	t,
	onError,
	onJob,
}: {
	root: string;
	t: Translate;
	onError: (e: unknown) => void;
	onJob: (id: string) => void;
}) {
	const [catalogs, setCatalogs] = useState<any[]>([]),
		[catalog, setCatalog] = useState<any>(),
		[document, setDocument] = useState<any>(),
		[dirty, setDirty] = useState(false),
		[search, setSearch] = useState(''),
		[filter, setFilter] = useState('all'),
		[deleted, setDeleted] = useState<{ entry: any; index: number }>(),
		[analysis, setAnalysis] = useState(false),
		[source, setSource] = useState(''),
		[profile, setProfile] = useState(''),
		[scope, setScope] = useState('subtree'),
		[sourceStatus, setSourceStatus] = useState('all'),
		[comments, setComments] = useState(true),
		[kind, setKind] = useState('both'),
		[profiles, setProfiles] = useState<string[]>([]),
		[applying, setApplying] = useState(false),
		[reports, setReports] = useState<any[]>([]),
		[run, setRun] = useState(''),
		[mentionRevision, setMentionRevision] = useState<string | null>(null),
		[hashtagRevision, setHashtagRevision] = useState<string | null>(null);
	const container = useRef<HTMLDivElement>(null);
	const refresh = useCallback(
		() =>
			api(`${root}/decisions?limit=500`)
				.then((d) => setCatalogs(d.items))
				.catch(onError),
		[root, onError],
	);
	useEffect(() => {
		refresh();
		api(`${root}/settings`)
			.then((s) => {
				setProfiles(Object.keys(s.connections));
				setProfile(Object.keys(s.connections)[0] ?? '');
			})
			.catch(onError);
	}, [root, refresh, onError]);
	useEffect(() => {
		if (!dirty) return;
		const handler = (e: BeforeUnloadEvent) => {
			e.preventDefault();
		};
		window.addEventListener('beforeunload', handler);
		return () => window.removeEventListener('beforeunload', handler);
	}, [dirty]);
	const entries = useMemo(
		() => filterDecisions(document?.entries ?? [], search, filter),
		[document, search, filter],
	);
	const virtualizer = useVirtualizer({
		count: entries.length,
		getScrollElement: () => container.current,
		estimateSize: () => 170,
		overscan: 6,
	});
	const valid = !document || document.entries.every((e: any) => !rowError(e));
	const replace = (index: number, entry: any) => {
		setDocument({
			...document,
			entries: document.entries.map((e: any, i: number) =>
				i === index ? entry : e,
			),
		});
		setDirty(true);
	};
	const accept = (next: any) => {
		setCatalog(next);
		setDocument(structuredClone(next.document));
		setDirty(false);
		setDeleted(undefined);
		setSearch('');
		setFilter('all');
	};
	const load = async (id: string) => {
		if (
			dirty &&
			!window.confirm(
				t('Заменить несохранённый черновик?', 'Replace unsaved changes?'),
			)
		)
			return;
		try {
			accept(await api(`${root}/decisions/${id}`));
		} catch (e) {
			onError(e);
		}
	};
	const save = async () => {
		try {
			const next = await api(
				`${root}/decisions${catalog?.published || !catalog?.id ? '' : `/${catalog.id}`}`,
				catalog?.published || !catalog?.id ? 'POST' : 'PUT',
				{
					kind: catalog.kind,
					document: parseDocument(document, catalog.kind),
					...(!catalog.published && catalog.id
						? { revision: catalog.revision }
						: {}),
				},
			);
			accept(next);
			refresh();
			return next;
		} catch (e) {
			onError(e);
		}
	};
	const publish = async () => {
		const saved = dirty || catalog.published ? await save() : catalog;
		if (!saved) return;
		try {
			accept(
				await api(`${root}/decisions/${saved.id}/publish`, 'POST', {
					revision: saved.revision,
				}),
			);
			refresh();
		} catch (e) {
			onError(e);
		}
	};
	const activate = async () => {
		try {
			const settings = await api(`${root}/settings`);
			if (
				!window.confirm(
					t(
						'Подключить эту опубликованную версию к следующим миграциям workspace?',
						'Activate this published revision for future workspace migrations?',
					),
				)
			)
				return;
			await api(`${root}/decisions/${catalog.id}/activate`, 'POST', {
				configRevision: settings.revision,
			});
		} catch (e) {
			onError(e);
		}
	};
	const importFile = async (file: File | null) => {
		if (!file) return;
		try {
			const next = parseDocument(
				JSON.parse(await file.text()),
				catalog?.kind ?? 'mentions',
			);
			if (
				dirty &&
				!window.confirm(
					t('Заменить несохранённый черновик?', 'Replace unsaved changes?'),
				)
			)
				return;
			setDocument(next);
			setCatalog({ kind: catalog?.kind ?? 'mentions', published: false });
			setDirty(true);
			setDeleted(undefined);
		} catch (e) {
			onError(e);
		}
	};
	const scan = () =>
		api(`${root}/jobs`, 'POST', {
			request: {
				kind: 'scan',
				source,
				sourceProfile: profile,
				scope,
				sourceStatus,
				comments,
				kinds: kind === 'both' ? ['mentions', 'hashtags'] : [kind],
				...(catalog?.id ? { catalogId: catalog.id } : {}),
			},
		})
			.then((j) => {
				setAnalysis(false);
				onJob(j.id);
			})
			.catch(onError);
	const apply = () =>
		api(`${root}/jobs`, 'POST', {
			request: {
				kind: 'targeted',
				runId: run,
				action: 'decisions',
				dryRun: true,
				selection: {
					pageIds: [],
					resourceIds: {},
					commentPageIds: [],
					terminalOverride: false,
				},
				revisions: {
					...(mentionRevision ? { mentions: mentionRevision } : {}),
					...(hashtagRevision ? { hashtags: hashtagRevision } : {}),
				},
			},
		})
			.then((j) => onJob(j.id))
			.catch(onError);
	return (
		<>
			<Group justify="space-between">
				<div className="section-title">
					{t('Анализы и версии решений', 'Analyses & decision revisions')}
				</div>
				<Group>
					<Button variant="light" onClick={() => setAnalysis(true)}>
						{t('Анализ source', 'Analyze source')}
					</Button>
					<Button
						variant="subtle"
						onClick={() => {
							api(`${root}/reports?limit=500`)
								.then((d) => setReports(d.items.filter((r: any) => !r.dryRun)))
								.catch(onError);
							setApplying(true);
						}}
					>
						{t('Применить к миграции', 'Apply to migration')}
					</Button>
				</Group>
			</Group>
			{catalogs.map((c) => (
				<div className="row" key={c.id}>
					<Badge variant="light">{c.kind}</Badge>
					<Button variant="subtle" onClick={() => load(c.id)}>
						{c.id.slice(0, 8)}
					</Button>
					<span className="grow muted">
						{c.source.instance} · {new Date(c.updatedAt).toLocaleString()}
					</span>
					{c.entries > 0 && (
						<Badge variant="outline">{c.entries} entries</Badge>
					)}
					<Badge color={c.published ? 'teal' : 'gray'}>
						{c.published
							? t('Опубликовано', 'Published')
							: t('Черновик', 'Draft')}
					</Badge>
				</div>
			))}
			{!catalogs.length && (
				<div className="empty">
					{t(
						'Запустите анализ источника или импортируйте decisions.json.',
						'Analyze a source or import decisions.json.',
					)}
				</div>
			)}
			<Group mt="md">
				<NativeSelect
					aria-label="Import kind"
					data={['mentions', 'hashtags']}
					value={catalog?.kind ?? 'mentions'}
					onChange={(e) => {
						if (
							dirty &&
							!window.confirm(
								t(
									'Отбросить несохранённые изменения?',
									'Discard unsaved changes?',
								),
							)
						)
							return;
						setCatalog({ kind: e.target.value });
						setDocument(undefined);
						setDirty(false);
					}}
				/>
				<FileButton accept="application/json,.json" onChange={importFile}>
					{(props) => (
						<Button {...props} variant="light">
							{t('Открыть JSON', 'Open JSON')}
						</Button>
					)}
				</FileButton>
			</Group>
			{document && (
				<section className="section">
					<Group justify="space-between">
						<strong>
							{catalog.kind} · {document.source.instance}
							{dirty ? ' *' : ''}
						</strong>
						<Group>
							<Button
								variant="subtle"
								disabled={!valid}
								onClick={() => {
									try {
										download(
											JSON.parse(serializeDocument(document, catalog.kind)),
											'decisions.json',
										);
									} catch (e) {
										onError(e);
									}
								}}
							>
								{t('Скачать JSON', 'Download JSON')}
							</Button>
							<Button disabled={!valid} onClick={save}>
								{t('Сохранить черновик', 'Save draft')}
							</Button>
							<Button disabled={!valid} variant="light" onClick={publish}>
								{t('Опубликовать версию', 'Publish revision')}
							</Button>
							{catalog.published && !dirty && (
								<Button variant="light" onClick={activate}>
									{t('Подключить к workspace', 'Activate in workspace')}
								</Button>
							)}
						</Group>
					</Group>
					{document.inventory?.complete === false && (
						<Alert color="orange" mt="md">
							{t(
								'Inventory неполон. Доступные решения сохранены; проблемы перечислены ниже.',
								'Inventory is incomplete. Available decisions are retained; issues are listed below.',
							)}
							<details>
								<summary>{t('Проблемы inventory', 'Inventory issues')}</summary>
								<pre className="code">
									{JSON.stringify(document.inventory, null, 2)}
								</pre>
							</details>
						</Alert>
					)}
					{!valid && (
						<Alert color="red" mt="md">
							{t(
								'Исправьте невалидные строки перед сохранением.',
								'Fix invalid rows before saving.',
							)}
						</Alert>
					)}
					<div className="toolbar">
						<TextInput
							aria-label={t('Поиск решений', 'Search decisions')}
							value={search}
							onChange={(e) => setSearch(e.target.value)}
							placeholder={t(
								'Упоминание, тег, identity или контекст',
								'Mention, tag, identity or context',
							)}
							style={{ flex: 1 }}
						/>
						<NativeSelect
							aria-label="Decision filter"
							value={filter}
							onChange={(e) => setFilter(e.target.value)}
							data={
								catalog.kind === 'hashtags'
									? ['all', 'skip', 'text', 'url']
									: ['all', 'skip', 'url']
							}
						/>
						{deleted && (
							<Button
								leftSection={<Undo2 size={15} />}
								variant="subtle"
								onClick={() => {
									const next = [...document.entries];
									next.splice(deleted.index, 0, deleted.entry);
									setDocument({ ...document, entries: next });
									setDeleted(undefined);
									setDirty(true);
								}}
							>
								{t('Отменить удаление', 'Undo delete')}
							</Button>
						)}
					</div>
					<div ref={container} className="scroll-list">
						<ul
							aria-label="Decisions"
							style={{
								height: virtualizer.getTotalSize(),
								position: 'relative',
								listStyle: 'none',
								padding: 0,
								margin: 0,
							}}
						>
							{virtualizer.getVirtualItems().map((v) => {
								const row = entries[v.index],
									entry = row.entry as any,
									index = row.index;
								return (
									<li
										key={entryKey(entry)}
										data-index={v.index}
										ref={virtualizer.measureElement}
										style={{
											position: 'absolute',
											top: 0,
											left: 0,
											width: '100%',
											transform: `translateY(${v.start}px)`,
										}}
										className="decision-row"
									>
										<Group>
											<strong className="grow">{entryName(entry)}</strong>
											<span className="mono muted">
												{'identity' in entry
													? Object.entries(entry.identity)
															.map(([k, v]) => `${k}: ${v}`)
															.join(' · ')
													: ''}
											</span>
											<NativeSelect
												aria-label={`Decision ${entryName(entry)}`}
												value={entry.decision}
												data={
													catalog.kind === 'hashtags'
														? ['skip', 'text', 'url']
														: ['skip', 'url']
												}
												onChange={(e) =>
													replace(index, changeDecision(entry, e.target.value))
												}
											/>
											<Tooltip
												label={t(
													'Удалить (означает skip)',
													'Delete (means skip)',
												)}
											>
												<ActionIcon
													aria-label={`Delete ${entryName(entry)}`}
													color="red"
													variant="subtle"
													onClick={() => {
														setDeleted({ entry, index });
														setDocument({
															...document,
															entries: document.entries.filter(
																(_: any, i: number) => i !== index,
															),
														});
														setDirty(true);
													}}
												>
													<Trash2 size={16} />
												</ActionIcon>
											</Tooltip>
										</Group>
										{entry.decision !== 'skip' && (
											<div className="decision-inputs">
												{entry.decision === 'url' && (
													<TextInput
														aria-label={`URL ${entryName(entry)}`}
														placeholder="https://…"
														value={entry.url}
														error={
															!safeLink(entry.url) ? 'HTTP(S) URL' : undefined
														}
														onChange={(e) =>
															replace(index, { ...entry, url: e.target.value })
														}
													/>
												)}
												<TextInput
													aria-label={`Text ${entryName(entry)}`}
													placeholder={defaultLabel(entry)}
													value={entry.text ?? ''}
													onChange={(e) =>
														replace(index, changeText(entry, e.target.value))
													}
												/>
												{entry.decision === 'url' && safeLink(entry.url) && (
													<a
														href={safeLink(entry.url)}
														target="_blank"
														rel="noreferrer"
													>
														{entry.text ?? defaultLabel(entry)}
													</a>
												)}
											</div>
										)}
										{entry.occurrences?.length > 0 && (
											<details style={{ marginTop: 10 }}>
												<summary className="muted">
													{entry.occurrences.reduce(
														(n: number, o: any) => n + (o.count ?? 1),
														0,
													)}{' '}
													{t('вхождений · контексты', 'occurrences · contexts')}
												</summary>
												{entry.occurrences.map((o: any) => (
													<div
														className="row"
														key={`${o.pageId}-${o.location}-${o.commentId ?? ''}`}
													>
														{safeLink(o.pageUrl) ? (
															<a
																href={safeLink(o.pageUrl)}
																target="_blank"
																rel="noreferrer"
															>
																{o.pageTitle ?? o.pageId}
															</a>
														) : (
															(o.pageTitle ?? o.pageId)
														)}
														<span className="mono">
															{o.location} {o.commentId ?? ''}
														</span>
													</div>
												))}
											</details>
										)}
									</li>
								);
							})}
						</ul>
					</div>
					{!document.entries.length && (
						<div className="empty">
							{t(
								'Упоминаний или тегов нет. Отсутствующие записи означают skip.',
								'No mentions or tags. Missing entries mean skip.',
							)}
						</div>
					)}
				</section>
			)}
			<Modal
				opened={analysis}
				onClose={() => setAnalysis(false)}
				title={t('Source-only анализ', 'Source-only analysis')}
			>
				<Stack>
					<Select
						label={t('Профиль', 'Profile')}
						value={profile}
						onChange={(v) => setProfile(v ?? '')}
						data={profiles}
					/>
					<TextInput
						label="Source URL / ID / slug / space URL"
						value={source}
						onChange={(e) => setSource(e.target.value)}
					/>
					<Group grow>
						<NativeSelect
							label="Scope"
							data={['page', 'subtree', 'linked']}
							value={scope}
							onChange={(e) => setScope(e.target.value)}
						/>
						<NativeSelect
							label="Source status"
							data={['all', 'current']}
							value={sourceStatus}
							onChange={(e) => setSourceStatus(e.target.value)}
						/>
					</Group>
					<NativeSelect
						label={t('Сканировать', 'Scan')}
						data={['both', 'mentions', 'hashtags']}
						value={kind}
						onChange={(e) => setKind(e.target.value)}
					/>
					<Checkbox
						label={t('Комментарии', 'Comments')}
						checked={comments}
						onChange={(e) => setComments(e.target.checked)}
					/>
					<Button disabled={!source || !profile} onClick={scan}>
						{t('Запустить анализ', 'Start analysis')}
					</Button>
				</Stack>
			</Modal>
			<Modal
				opened={applying}
				onClose={() => setApplying(false)}
				title={t('Применение decisions · preview', 'Apply decisions · preview')}
			>
				<Stack>
					<Select
						searchable
						label={t('Миграция', 'Migration')}
						data={reports.map((r) => ({
							value: r.runId,
							label: `${r.source.title} · ${r.runId.slice(0, 8)}`,
						}))}
						value={run}
						onChange={(v) => setRun(v ?? '')}
					/>
					<Select
						clearable
						label="Mentions"
						data={catalogs
							.filter((c) => c.kind === 'mentions' && c.published)
							.map((c) => ({
								value: c.id,
								label: `${c.id.slice(0, 8)} · ${c.source.instance}`,
							}))}
						value={mentionRevision}
						onChange={setMentionRevision}
					/>
					<Select
						clearable
						label="Hashtags"
						data={catalogs
							.filter((c) => c.kind === 'hashtags' && c.published)
							.map((c) => ({
								value: c.id,
								label: `${c.id.slice(0, 8)} · ${c.source.instance}`,
							}))}
						value={hashtagRevision}
						onChange={setHashtagRevision}
					/>
					<Alert>
						{t(
							'Невыбранный тип решений сохраняется. Будут изменены только затронутые страницы и архивы, без создания страниц и изменения родителей.',
							'Unselected policy is preserved. Only affected pages and archives change; no pages are created or moved.',
						)}
					</Alert>
					<Button
						disabled={!run || (!mentionRevision && !hashtagRevision)}
						onClick={apply}
					>
						{t('Подготовить preview', 'Prepare preview')}
					</Button>
				</Stack>
			</Modal>
		</>
	);
}
