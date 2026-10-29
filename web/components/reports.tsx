'use client';
import { useEffect, useState } from 'react';
import {
	ActionIcon,
	Alert,
	Badge,
	Button,
	Checkbox,
	Group,
	Modal,
	NativeSelect,
	Stack,
	Tabs,
	TextInput,
	Tooltip,
} from '@mantine/core';
import { ChevronDown, ChevronRight, ExternalLink, Eye } from 'lucide-react';
import { api, download, safeLink, statusColor, type Translate } from './api';

const isolated = (body: string) =>
	`<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; img-src data: blob:; base-uri 'none'; form-action 'none'"><style>body{font:14px system-ui;padding:16px;overflow-wrap:anywhere}img{max-width:100%}table{border-collapse:collapse}td,th{border:1px solid #ddd;padding:5px}</style>${body}`;
function LinkIcon({ url, label }: { url?: string; label: string }) {
	const href = safeLink(url);
	return (
		<Tooltip label={label}>
			<ActionIcon
				component={href ? 'a' : 'button'}
				{...(href
					? { href, target: '_blank', rel: 'noopener noreferrer' }
					: { disabled: true })}
				aria-label={label}
				variant="subtle"
			>
				<ExternalLink size={15} />
			</ActionIcon>
		</Tooltip>
	);
}
export function Reports({
	root,
	t,
	initialRun,
	onError,
	onJob,
}: {
	root: string;
	t: Translate;
	initialRun?: string;
	onError: (e: unknown) => void;
	onJob: (id: string) => void;
}) {
	const [reports, setReports] = useState<any[]>([]),
    [invalidReports, setInvalidReports] = useState<string[]>([]),
		[run, setRun] = useState(initialRun),
		[report, setReport] = useState<any>(),
		[rows, setRows] = useState<any[]>([]),
		[total, setTotal] = useState(0),
		[offset, setOffset] = useState(0),
		[query, setQuery] = useState(''),
		[filter, setFilter] = useState('all'),
		[details, setDetails] = useState<any>(),
		[selected, setSelected] = useState<string[]>([]),
		[resources, setResources] = useState<Record<string, string[]>>({}),
		[comments, setComments] = useState<string[]>([]),
		[override, setOverride] = useState(false),
		[collapsed, setCollapsed] = useState<string[]>([]),
		[state, setState] = useState<any>(),
		[stateOffset, setStateOffset] = useState(0),
		[reportOffset, setReportOffset] = useState(0),
		[reportTotal, setReportTotal] = useState(0);
	useEffect(() => {
		api(`${root}/reports?offset=${reportOffset}`)
			.then((d) => {
				setReports(d.items);
        setInvalidReports(d.invalid ?? []);
				setReportTotal(d.total);
			})
			.catch(onError);
	}, [root, reportOffset, onError]);
	useEffect(() => {
		if (run) {
			api(`${root}/reports/${run}`).then(setReport).catch(onError);
			setSelected([]);
			setResources({});
			setComments([]);
		}
	}, [root, run, onError]);
	useEffect(() => {
		if (run)
			api(
				`${root}/reports/${run}/rows?offset=${offset}&q=${encodeURIComponent(query)}&filter=${filter}`,
			)
				.then((d) => {
					setRows(d.items);
					setTotal(d.total);
				})
				.catch(onError);
	}, [root, run, offset, query, filter, onError]);
	const toggle = (items: string[], id: string) =>
		items.includes(id) ? items.filter((i) => i !== id) : [...items, id];
	const open = (id: string) =>
		api(`${root}/reports/${run}/page?id=${encodeURIComponent(id)}`)
			.then(setDetails)
			.catch(onError);
	const preview = () =>
		api(`${root}/jobs`, 'POST', {
			request: {
				kind: 'targeted',
				runId: run,
				action: 'retry',
				dryRun: true,
				selection: {
					pageIds: selected,
					resourceIds: resources,
					commentPageIds: comments,
					terminalOverride: override,
				},
			},
		})
			.then((j) => onJob(j.id))
			.catch(onError);
	const grouped = Object.groupBy(reports, (r) => r.state?.id ?? 'unknown');
	const hidden = new Set<string>();
	for (const row of rows)
		if (collapsed.includes(row.parentId) || hidden.has(row.parentId))
			hidden.add(row.id);
	return (
		<>
			<div className="section-title">
				{t('Миграции и история запусков', 'Migrations & run history')}
			</div>
      {invalidReports.length > 0 && <Alert color="orange" mb="md">{t('Не удалось прочитать bundles: повреждённый JSON, неполные данные или небезопасный путь. Сохранённые файлы не изменены.', 'Some bundles could not be read: corrupted JSON, incomplete data or unsafe paths. Existing files were preserved.')}<div className="mono">{invalidReports.join(', ')}</div></Alert>}
			{Object.entries(grouped).map(([id, runs]) => (
				<section key={id} className="section">
					<div className="mono muted">STATE {id}</div>
					{runs!.map((r) => (
						<div className="row" key={r.runId}>
							<Badge color={statusColor(r.status)}>
								{r.dryRun ? 'dry-run' : r.status}
							</Badge>
							<Button
								variant="subtle"
								onClick={() => {
									setRun(r.runId);
									setOffset(0);
									setQuery('');
								}}
							>
								{r.source?.title ?? r.runId.slice(0, 8)}
							</Button>
							<span className="grow muted">
								{new Date(r.finishedAt ?? r.startedAt).toLocaleString()}
							</span>
							{r.sync&&<span className="mono">sync · {r.sync.planId.slice(0,8)}</span>}
							{r.retry&&!r.sync && (
								<span className="mono">
									retry {r.retry.attempt} · {r.retry.rootRunId.slice(0, 8)}
								</span>
							)}
							{r.summary.pages > 0 && (
								<Badge variant="outline">{r.summary.pages} pages</Badge>
							)}
							{r.summary.errors > 0 && (
								<Badge color="red">{r.summary.errors} errors</Badge>
							)}
						</div>
					))}
				</section>
			))}
			{!reports.length && (
				<div className="empty">
					{t(
						'Отчётов пока нет. Можно запустить dry-run или подключить существующий workspace.',
						'No reports yet. Start a dry-run or connect an existing workspace.',
					)}
				</div>
			)}
			{reportTotal > 100 && (
				<Group>
					<Button
						disabled={!reportOffset}
						onClick={() => setReportOffset(Math.max(0, reportOffset - 100))}
					>
						←
					</Button>
					<Button
						disabled={reportOffset + 100 >= reportTotal}
						onClick={() => setReportOffset(reportOffset + 100)}
					>
						→
					</Button>
				</Group>
			)}
			{report && (
				<section className="section">
					<Group justify="space-between">
						<h2>{report.source.title}</h2>
						<Badge color={statusColor(report.status)}>{report.status}</Badge>
					</Group>
					<div className="summary">
						{[
							['pages', t('страниц', 'pages')],
							['resources', t('файлов', 'files')],
							['comments', t('комментариев', 'comments')],
							['errors', t('ошибок', 'errors')],
							['warnings', t('предупреждений', 'warnings')],
							['adaptations', t('адаптаций', 'adaptations')],
						].map(([key, label]) =>
							report.summary[key] > 0 ? (
								<span key={key}>
									<strong>{report.summary[key]}</strong>
									{label}
								</span>
							) : null,
						)}
					</div>
          <Stack gap="xs" my="md">
            {[
              [t('Страницы', 'Pages'), report.summary.pageStatuses],
              [t('Файлы', 'Files'), report.summary.resourceStatuses],
              ['Grid', report.summary.gridStatuses],
              [t('Архивы комментариев', 'Comment archives'), report.summary.commentStatuses],
              ['Mentions', report.summary.mentionOutcomes],
              ['Hashtags', report.summary.hashtags && {preserved: report.summary.hashtags.preserved, text: report.summary.hashtags.text, linked: report.summary.hashtags.linked}],
            ].map(([label, counts]: any[]) => {
              const values = Object.entries(counts ?? {}).filter(([key, count]) => key !== 'total' && Number(count) > 0);
              return values.length ? <Group key={label} aria-label={label}><span className="muted">{label}</span>{values.map(([status, count]) => <Badge key={status} variant="light" color={statusColor(status)}>{status} {String(count)}</Badge>)}</Group> : null;
            })}
            {report.summary.excludedPages > 0 && <span className="muted">{t('Исключено фильтром источника', 'Excluded by source filter')}: {report.summary.excludedPages}</span>}
            {!report.summary.inventoryComplete && <Alert color="orange">{t('Inventory неполон: totals отражают только известные объекты.', 'Inventory is incomplete: totals cover only known objects.')}</Alert>}
          </Stack>
					<dl className="meta">
						<dt>RUN ID</dt>
						<dd className="mono">{report.runId}</dd>
						<dt>STATE</dt>
						<dd>
							<Button
								variant="subtle"
								size="compact-sm"
								onClick={() => {
									setStateOffset(0);
									api(`${root}/states/${report.state.id}`)
										.then(setState)
										.catch(onError);
								}}
							>
								{report.state.id}
							</Button>
						</dd>
						<dt>SOURCE</dt>
						<dd>
							{safeLink(report.source.url) ? (
								<a
									href={safeLink(report.source.url)}
									target="_blank"
									rel="noreferrer"
								>
									{report.source.url}
								</a>
							) : (
								report.source.url
							)}
						</dd>
						<dt>DESTINATION</dt>
						<dd>
							{safeLink(report.destination.url) ? (
								<a
									href={safeLink(report.destination.url)}
									target="_blank"
									rel="noreferrer"
								>
									{report.destination.url}
								</a>
							) : (
								(report.destination.url ?? report.destination.id)
							)}
						</dd>
					</dl>
					<Group>
						<Button
							variant="light"
							onClick={() =>
								api(`${root}/jobs`, 'POST', {
									request: { kind: 'retry', runId: run, dryRun: true },
								})
									.then((j) => onJob(j.id))
									.catch(onError)
							}
							disabled={report.dryRun}
						>
							{t('План автоматического retry', 'Preview automatic retry')}
						</Button>
						<Button
							variant="subtle"
							onClick={() => download(report, `run-${run}-summary.json`)}
						>
							{t('Скачать сводку', 'Download summary')}
						</Button>
					</Group>
					<div className="toolbar">
						<TextInput
							aria-label={t('Поиск в дереве', 'Search tree')}
							placeholder={t(
								'Название, файл, ID или диагностика',
								'Title, file, ID or diagnostic',
							)}
							value={query}
							onChange={(e) => {
								setQuery(e.target.value);
								setOffset(0);
							}}
							style={{ flex: 1, minWidth: 220 }}
						/>
						<NativeSelect
							aria-label={t('Статус', 'Status')}
							value={filter}
							data={[
								'all',
								'problems',
								'partial',
								'failed',
								'blocked',
								'conflict',
								'excluded',
							]}
							onChange={(e) => {
								setFilter(e.target.value);
								setOffset(0);
							}}
						/>
					</div>
					<div role="tree" aria-label={t('Иерархия страниц', 'Page hierarchy')}>
						{rows
							.filter((row) => !hidden.has(row.id))
							.map((row) => (
								<div
									role="treeitem"
									onClick={(event) => {
										if (
											!(event.target as HTMLElement).closest(
												'button,a,input,label',
											)
										)
											open(row.id);
									}}
									tabIndex={0}
									onKeyDown={(event) => {
										if (event.target !== event.currentTarget) return;
										if (event.key === 'Enter' || event.key === ' ') {
											event.preventDefault();
											open(row.id);
										}
										if (event.key === 'ArrowLeft')
											setCollapsed([...collapsed, row.id]);
										if (event.key === 'ArrowRight')
											setCollapsed(collapsed.filter((id) => id !== row.id));
										if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
											event.preventDefault();
											const sibling =
												event.key === 'ArrowDown'
													? event.currentTarget.nextElementSibling
													: event.currentTarget.previousElementSibling;
											(sibling as HTMLElement | null)?.focus();
										}
									}}
									aria-level={row.depth + 1}
									aria-expanded={!collapsed.includes(row.id)}
									className={`row ${['failed', 'conflict'].includes(row.status) ? 'danger' : !['complete', 'planned'].includes(row.status) ? 'problem' : ''}`}
									key={row.id}
									style={
										{
											'--row-indent': `${8 + Math.min(row.depth, 12) * 18}px`,
										} as React.CSSProperties
									}
								>
									<Checkbox
										aria-label={`${t('Выбрать', 'Select')} ${row.title}`}
										disabled={['complete', 'excluded', 'conflict'].includes(
											row.status,
										)}
										checked={selected.includes(row.id)}
										onChange={() => setSelected(toggle(selected, row.id))}
									/>
									<ActionIcon
										variant="subtle"
										aria-label={t('Свернуть ветку', 'Toggle branch')}
										onClick={() => setCollapsed(toggle(collapsed, row.id))}
									>
										{collapsed.includes(row.id) ? (
											<ChevronRight size={14} />
										) : (
											<ChevronDown size={14} />
										)}
									</ActionIcon>
									<LinkIcon url={row.sourceUrl} label="Source" />
									<LinkIcon url={row.destinationUrl} label="Destination" />
									<Tooltip label={t('Детали', 'Details')}>
										<ActionIcon
											variant="subtle"
											aria-label={`${t('Детали', 'Details')} ${row.title}`}
											onClick={() => open(row.id)}
										>
											<Eye size={16} />
										</ActionIcon>
									</Tooltip>
									<Button
										variant="transparent"
										color="gray"
										className="grow"
										justify="flex-start"
										onClick={() => open(row.id)}
									>
										{row.title}
									</Button>
									<Badge variant="light" color={statusColor(row.status)}>
										{row.status}
									</Badge>
									{row.files > 0 && (
										<span className="mono">{row.files} files</span>
									)}
									{row.comments > 0 && (
										<span className="mono">{row.comments} comments</span>
									)}
								</div>
							))}
					</div>
					<Group mt="md">
						<Button
							variant="subtle"
							disabled={!offset}
							onClick={() => setOffset(Math.max(0, offset - 100))}
						>
							←
						</Button>
						<span className="muted">
							{total
								? `${offset + 1}–${Math.min(offset + 100, total)} / ${total}`
								: t('Нет совпадений', 'No matches')}
						</span>
						<Button
							variant="subtle"
							disabled={offset + 100 >= total}
							onClick={() => setOffset(offset + 100)}
						>
							→
						</Button>
					</Group>
					{Boolean(
						selected.length ||
							Object.values(resources).some((a) => a.length) ||
							comments.length,
					) && (
						<Stack mt="lg">
							<Checkbox
								label={t(
									'Включить выбранные terminal/non-retryable ошибки (ownership не обходится)',
									'Include selected terminal/non-retryable errors (ownership is never bypassed)',
								)}
								checked={override}
								onChange={(e) => setOverride(e.target.checked)}
							/>
							<Button onClick={preview}>
								{t('Подготовить точечный retry', 'Preview selected retry')}
							</Button>
						</Stack>
					)}
				</section>
			)}
			<Modal
				opened={Boolean(details)}
				onClose={() => setDetails(undefined)}
				title={details?.page.sourceTitle}
				size="90%"
			>
				<Tabs defaultValue="overview">
					<Tabs.List>
						{[
							['overview', t('Обзор', 'Overview')],
							['files', t('Файлы', 'Files')],
							['comments', t('Комментарии', 'Comments')],
							['compare', t('Сравнение', 'Compare')],
							['issues', t('Проблемы', 'Issues')],
						].map(([value, label]) => (
							<Tabs.Tab value={value} key={value}>
								{label}
							</Tabs.Tab>
						))}
					</Tabs.List>
					<Tabs.Panel value="overview" pt="md">
						<dl className="meta">
							{details &&
								Object.entries(details.page)
									.filter(
										([key, value]) =>
											![
												'resourceItems',
												'comments',
												'mentions',
												'hashtags',
											].includes(key) &&
											typeof value !== 'object' &&
											value !== 0 &&
											value !== undefined,
									)
									.map(([key, value]) => (
										<div style={{ display: 'contents' }} key={key}>
											<dt>{key}</dt>
											<dd className="mono">{String(value)}</dd>
										</div>
									))}
						</dl>
					</Tabs.Panel>
					<Tabs.Panel value="files" pt="md">
						{details?.page.resourceItems?.map((file: any) => (
							<div className="row" key={file.sourceId}>
								<Checkbox
									disabled={
										file.status === 'complete' ||
										details.page.status === 'conflict'
									}
									checked={(
										resources[details.page.sourceCanonicalId] ?? []
									).includes(file.sourceId)}
									aria-label={`Retry ${file.sourceName}`}
									onChange={() =>
										setResources({
											...resources,
											[details.page.sourceCanonicalId]: toggle(
												resources[details.page.sourceCanonicalId] ?? [],
												file.sourceId,
											),
										})
									}
								/>
								<div className="grow">
									<strong>{file.sourceName}</strong>
									<p className="mono">
										{file.destinationName}{' '}
										{file.transferredBytes
											? `· ${file.transferredBytes} B`
											: ''}
									</p>
									{file.error && <Alert color="red">{file.error}</Alert>}
									<div className="mono">{file.sha256}</div>
								</div>
								<LinkIcon url={file.sourceUrl} label="Source file" />
								<LinkIcon url={file.destinationUrl} label="Destination file" />
								<Badge color={statusColor(file.status)}>{file.status}</Badge>
							</div>
						))}
					</Tabs.Panel>
					<Tabs.Panel value="comments" pt="md">
						{details?.page.comments && (
							<>
								<Checkbox
									label={t(
										'Повторить только архив комментариев',
										'Retry comment archive only',
									)}
									disabled={
										details.page.status === 'conflict' ||
										!report?.commentsEnabled
									}
									checked={comments.includes(details.page.sourceCanonicalId)}
									onChange={() =>
										setComments(
											toggle(comments, details.page.sourceCanonicalId),
										)
									}
								/>
								<p>
									{details.page.comments.status}{' '}
									{details.page.comments.comments || ''}
								</p>
								{details.page.comments.error && (
									<Alert color="red">{details.page.comments.error}</Alert>
								)}
								{details.page.comments.items?.map((item: any) => (
									<div className="row" key={item.commentId}>
										<span>
											{item.author} · {item.createdAt}
										</span>
										<span className="mono">{item.commentId}</span>
										<Badge>{item.outcome}</Badge>
										{item.error}
									</div>
								))}
							</>
						)}
					</Tabs.Panel>
					<Tabs.Panel value="compare" pt="md">
						{details?.preview ? (
							<div className="preview-grid">
								<div>
									<strong>Source</strong>
									<iframe
										title="Source preview"
										sandbox=""
										referrerPolicy="no-referrer"
										srcDoc={isolated(details.preview.source)}
									/>
								</div>
								<div>
									<strong>Destination</strong>
									<iframe
										title="Destination preview"
										sandbox=""
										referrerPolicy="no-referrer"
										srcDoc={isolated(details.preview.destination)}
									/>
								</div>
							</div>
						) : (
							<Alert>
								{t(
									'Preview отсутствует в этом отчёте.',
									'Preview is unavailable in this report.',
								)}
							</Alert>
						)}
					</Tabs.Panel>
					<Tabs.Panel value="issues" pt="md">
						{details?.issues.map((issue: any) => (
							<div
								className="section"
								key={
									issue.id ?? `${issue.code}-${issue.objectId ?? issue.pageId}`
								}
							>
								<Badge
									color={statusColor(
										issue.severity === 'error' ? 'failed' : issue.severity,
									)}
								>
									{issue.severity}
								</Badge>
								<h4>{issue.message}</h4>
								<p>{issue.action}</p>
								<div className="mono">
									{issue.code} · {issue.phase} · {issue.category} ·{' '}
									{issue.retryable ? 'retryable' : 'terminal'}
									{issue.rootCauseId && ` · depends on ${issue.rootCauseId}`}
								</div>
								<details>
									<summary>{t('Диагностика', 'Technical details')}</summary>
									<pre className="code">{JSON.stringify(issue, null, 2)}</pre>
								</details>
							</div>
						))}
					</Tabs.Panel>
				</Tabs>
			</Modal>
			<Modal
				opened={Boolean(state)}
				onClose={() => setState(undefined)}
				title={t('State · только чтение', 'State · read only')}
				size="xl"
			>
				<pre className="code">{JSON.stringify(state, null, 2)}</pre>
				{state?.items[0]?.pageCount > 100 && (
					<Group>
						<Button
							disabled={!stateOffset}
							onClick={() => {
								setStateOffset(Math.max(0, stateOffset - 100));
								api(
									`${root}/states/${report.state.id}?offset=${Math.max(0, stateOffset - 100)}`,
								)
									.then(setState)
									.catch(onError);
							}}
						>
							←
						</Button>
						<Button
							disabled={stateOffset + 100 >= state.items[0].pageCount}
							onClick={() => {
								setStateOffset(stateOffset + 100);
								api(
									`${root}/states/${report.state.id}?offset=${stateOffset + 100}`,
								)
									.then(setState)
									.catch(onError);
							}}
						>
							→
						</Button>
					</Group>
				)}
			</Modal>
		</>
	);
}
