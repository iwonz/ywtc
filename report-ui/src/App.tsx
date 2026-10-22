import {
  ActionIcon,
  Alert,
  Badge,
  Box,
  Button,
  Code,
  Collapse,
  Container,
  Group,
  MantineProvider,
  Modal,
  ScrollArea,
  Select,
  SimpleGrid,
  Stack,
  Table,
  Tabs,
  Text,
  TextInput,
  Title,
  Tooltip,
  createTheme,
} from '@mantine/core';
import {useVirtualizer} from '@tanstack/react-virtual';
import {
  AlertTriangle,
  Archive,
  Ban,
  CheckCircle2,
  ChevronRight,
  CircleDashed,
  Database,
  Download,
  ExternalLink,
  Eye,
  FileImage,
  FileWarning,
  FolderTree,
  Info,
  Monitor,
  MessageSquare,
  Moon,
  Paperclip,
  Search,
  ShieldAlert,
  Sun,
  Timer,
  XCircle,
} from 'lucide-react';
import {type CSSProperties, type ReactNode, useEffect, useMemo, useRef, useState} from 'react';
import type {
  ReportPresentationPayload,
  TransferReportData,
  TransferReportIssue,
} from '../../src/report-contract';
import reportHeader from '../../docs/assets/report-header-transparent.png';
import {initialLocale, type Locale, translator, type TranslationKey} from './i18n';
import {formatBytes, guardedStorageGet, guardedStorageSet, safeLink} from './lib';
import {buildReportTree, problemCount, type ReportTreeFilter, type ReportTreeNode, visibleTreeNodes} from './model';
import {positiveCounts, visibleDetailSections, visibleSummarySections} from './presentation';

type Theme = 'system' | 'light' | 'dark';
type Translate = (key: TranslationKey) => string;
type DefinitionItem = [label: string, value: ReactNode | undefined | null];

const reportTheme = createTheme({
  fontFamily: 'Inter Variable, sans-serif',
  fontFamilyMonospace: 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace',
  primaryColor: 'blue',
  defaultRadius: 'md',
  headings: {fontFamily: 'Inter Variable, sans-serif'},
});

const categoryLabels: Record<Locale, Record<TransferReportIssue['category'], string>> = {
  en: {
    network: 'network', 'rate-limit': 'rate limit', authorization: 'authorization', permissions: 'permissions',
    'provider-api': 'provider API', parsing: 'parsing', 'rendering-layout': 'rendering / layout', verification: 'verification',
    hierarchy: 'hierarchy', conflict: 'conflict', 'attachment-image': 'attachment / image', comment: 'comment', filtering: 'filtering', dependency: 'dependency', unknown: 'unknown',
  },
  ru: {
    network: 'сеть', 'rate-limit': 'лимит запросов', authorization: 'авторизация', permissions: 'права',
    'provider-api': 'API провайдера', parsing: 'разбор', 'rendering-layout': 'разметка / вёрстка', verification: 'проверка',
    hierarchy: 'иерархия', conflict: 'конфликт', 'attachment-image': 'вложение / изображение', comment: 'комментарий', filtering: 'фильтрация', dependency: 'зависимость', unknown: 'неизвестно',
  },
};

const filterValues: ReportTreeFilter[] = ['all', 'problems', 'partial', 'failed', 'blocked', 'conflict', 'excluded'];

function issueActionLabel(issue: TransferReportIssue, locale: Locale): string {
  if (locale === 'en') return issue.action;
  if (issue.severity === 'blocked') return 'Устраните ошибку вышестоящей страницы и повторите ту же миграцию.';
  if (issue.retryable) return 'Повторите ту же миграцию: объект будет обработан заново.';
  if (issue.severity === 'degradation') return 'Сравните source и destination во вкладке сравнения.';
  if (issue.severity === 'adaptation') return 'Действие не требуется: данные сохранены в эквивалентном представлении.';
  if (issue.severity === 'normalization') return 'Действие не требуется.';
  if (issue.category === 'authorization') return 'Проверьте токен подключения, выполните doctor и повторите миграцию.';
  if (issue.category === 'permissions') return 'Предоставьте пользователю токена доступ к объекту и повторите миграцию.';
  if (issue.category === 'conflict') return 'Проверьте ownership и identity destination-объекта, затем повторите миграцию.';
  return 'Проверьте причину, затронутый объект и техническую диагностику.';
}

function statusTranslation(status: string): TranslationKey | undefined {
  if (status === 'excluded') return 'excludedStatus';
  if (status === 'completed') return 'complete';
  if (status === 'completed-with-warnings') return 'warning';
  return ['complete', 'partial', 'failed', 'blocked', 'conflict', 'planned', 'not-started', 'discovered', 'skeleton-created', 'skipped'].includes(status)
    ? status as TranslationKey
    : undefined;
}

function statusColor(status: string): string {
  if (status === 'complete' || status === 'completed') return 'teal';
  if (status === 'failed') return 'red';
  if (status === 'conflict') return 'grape';
  if (status === 'partial' || status === 'planned' || status === 'completed-with-warnings') return 'yellow';
  if (status === 'blocked' || status === 'not-started' || status === 'excluded') return 'gray';
  return 'blue';
}

function StatusIcon({status, size = 13}: {status: string; size?: number}) {
  if (status === 'complete' || status === 'completed') return <CheckCircle2 size={size} aria-hidden="true" />;
  if (status === 'failed') return <XCircle size={size} aria-hidden="true" />;
  if (status === 'blocked') return <Ban size={size} aria-hidden="true" />;
  if (status === 'conflict') return <ShieldAlert size={size} aria-hidden="true" />;
  if (status === 'excluded') return <Archive size={size} aria-hidden="true" />;
  if (status === 'not-started' || status === 'planned') return <Timer size={size} aria-hidden="true" />;
  if (status === 'partial' || status === 'completed-with-warnings') return <AlertTriangle size={size} aria-hidden="true" />;
  return <CircleDashed size={size} aria-hidden="true" />;
}

function StatusBadge({status, t}: {status: string; t: Translate}) {
  const key = statusTranslation(status);
  return (
    <Badge color={statusColor(status)} variant="light" size="sm" leftSection={<StatusIcon status={status} size={12} />}>
      {key ? t(key) : status}
    </Badge>
  );
}

function ExternalIcon({href, label, color = 'gray', children}: {href?: string | undefined; label: string; color?: string; children: ReactNode}) {
  const safe = safeLink(href);
  if (!safe) return null;
  return (
    <Tooltip label={label} withArrow openDelay={250}>
      <ActionIcon
        component="a"
        href={safe}
        target="_blank"
        rel="noreferrer"
        aria-label={label}
        variant="subtle"
        color={color}
        size="sm"
        onClick={(event) => event.stopPropagation()}
      >
        {children}
      </ActionIcon>
    </Tooltip>
  );
}

function formatDate(value: string | undefined, locale: Locale): string {
  if (!value) return '';
  const date = new Date(value);
  return Number.isNaN(date.valueOf()) ? value : new Intl.DateTimeFormat(locale === 'ru' ? 'ru-RU' : 'en-US', {dateStyle: 'medium', timeStyle: 'short'}).format(date);
}

function countText(entries: Array<[number, string]>): string | undefined {
  const visible = entries.filter(([count]) => count > 0);
  return visible.length > 0 ? visible.map(([count, label]) => `${count} ${label}`).join(' · ') : undefined;
}

function byteSummary(knownBytes: number, unknownSizes: number, t: Translate): string | undefined {
  const parts: string[] = [];
  if (knownBytes > 0) parts.push(`${formatBytes(knownBytes)} ${t('known')}`);
  if (unknownSizes > 0) parts.push(`${unknownSizes} ${t('unknownSizes')}`);
  return parts.length > 0 ? parts.join(' · ') : undefined;
}

function OutcomeList({counts, t}: {counts: Record<string, number>; t: Translate}) {
  const entries = positiveCounts(counts);
  if (entries.length === 0) return null;
  return (
    <Group gap={6} wrap="wrap">
      {entries.map(([status, count]) => {
        const key = statusTranslation(status);
        return <Badge key={status} color={statusColor(status)} variant="light" size="sm">{key ? t(key) : status} · {count}</Badge>;
      })}
    </Group>
  );
}

function SummaryTable({report, t}: {report: TransferReportData; t: Translate}) {
  const summary = report.summary;
  const sourceBytes = summary.sourceBytes + summary.commentBytes;
  const sections = visibleSummarySections(summary);
  const inventoryTelemetry = countText([
    [summary.inventoryReusedPages ?? 0, t('reused')],
    [summary.inventoryFreshPages ?? 0, t('fresh')],
    [summary.inventoryRecoveryAttempts ?? 0, t('recoveryAttempts')],
    [summary.inventoryRemainingFailures ?? 0, t('remainingFailures')],
  ]);
  const rows: Array<{
    id: string;
    icon: ReactNode;
    label: string;
    source?: ReactNode;
    destination?: ReactNode;
    sourceRequired?: boolean;
    destinationRequired?: boolean;
  }> = [
    {
      id: 'pages', icon: <FolderTree size={16} />, label: t('pages'),
      sourceRequired: true,
      destinationRequired: true,
      source: countText([
        [summary.returnedDescendants + 1, t('found')],
        [summary.pages, t('selected')],
        [summary.excludedPages, t('excluded')],
      ]),
      destination: <OutcomeList counts={summary.pageStatuses} t={t} />,
    },
    ...(sections.includes('files') ? [{
      id: 'files', icon: <Paperclip size={16} />, label: t('files'),
      source: countText([
        [summary.resources, t('files').toLocaleLowerCase()],
        [summary.attachments, t('attachments')],
        [summary.resourceImages, t('images')],
        [summary.commentAttachments, t('commentAttachments')],
      ]),
      destination: <OutcomeList counts={summary.resourceStatuses} t={t} />,
    }] : []),
    ...(sections.includes('comments') ? [{
      id: 'comments', icon: <MessageSquare size={16} />, label: t('comments'),
      source: countText([
        [summary.commentThreads, t('threads')],
        [summary.comments, t('entries')],
        [summary.commentParticipants, t('participants')],
      ]),
      destination: <OutcomeList counts={summary.commentStatuses} t={t} />,
    }] : []),
    ...(sections.includes('data') ? [{
      id: 'data', icon: <Database size={16} />, label: t('data'),
      source: byteSummary(sourceBytes, summary.bytesUnknown, t),
      destination: summary.bytes > 0 ? `${formatBytes(summary.bytes)} ${t('transferred')}` : undefined,
    }] : []),
    ...(sections.includes('quality') ? [{
      id: 'quality', icon: <ShieldAlert size={16} />, label: t('quality'),
      source: countText([
        [summary.normalizations, t('normalization').toLocaleLowerCase()],
        [summary.adaptations, t('adaptation').toLocaleLowerCase()],
        [summary.preservedExternalReferences, t('externalReferences')],
      ]),
      destination: countText([
        [summary.errors, t('error').toLocaleLowerCase()],
        [summary.warnings, t('warning').toLocaleLowerCase()],
        [summary.degradations, t('degradation').toLocaleLowerCase()],
      ]),
    }] : []),
  ];

  return (
    <Stack gap="sm">
      <Box className="summary-table-container">
        <Table className="summary-table" verticalSpacing="sm" aria-label={t('summary')}>
          <Table.Tbody>
            {rows.map((row) => (
              <Table.Tr key={row.id}>
                <Table.Td><Group gap="xs" wrap="nowrap" className="metric-label">{row.icon}<Text fw={600} size="sm">{row.label}</Text></Group></Table.Td>
                <Table.Td>
                  <span className="visually-hidden">{t('source')}: </span>
                  {row.source ?? (row.sourceRequired ? <Text component="span" size="sm" c="dimmed">{t('notAvailable')}</Text> : null)}
                </Table.Td>
                <Table.Td>
                  <span className="visually-hidden">{t('destination')}: </span>
                  {row.destination ?? (row.destinationRequired ? <Text component="span" size="sm" c="dimmed">{t('notAvailable')}</Text> : null)}
                </Table.Td>
              </Table.Tr>
            ))}
          </Table.Tbody>
        </Table>
      </Box>
      {!summary.inventoryComplete && (
        <Alert color="yellow" icon={<AlertTriangle size={16} />} title={t('inventoryIncomplete')}>
          {summary.inventoriedPages}/{summary.pages} {t('pages').toLocaleLowerCase()}
          {inventoryTelemetry ? ` · ${inventoryTelemetry}` : ''}
        </Alert>
      )}
      {summary.inventoryComplete && inventoryTelemetry && (
        <Text size="sm" c="dimmed">{t('inventory')} · {inventoryTelemetry}</Text>
      )}
    </Stack>
  );
}

function RussianFlag() {
  return <svg viewBox="0 0 24 18" className="language-flag" aria-hidden="true"><path fill="#fff" d="M0 0h24v6H0z"/><path fill="#1c57a7" d="M0 6h24v6H0z"/><path fill="#d52b1e" d="M0 12h24v6H0z"/></svg>;
}

function EnglishFlag() {
  return <svg viewBox="0 0 24 18" className="language-flag" aria-hidden="true"><path fill="#17365d" d="M0 0h24v18H0z"/><path stroke="#fff" strokeWidth="4" d="m0 0 24 18M24 0 0 18"/><path stroke="#cf142b" strokeWidth="2" d="m0 0 24 18M24 0 0 18"/><path fill="#fff" d="M0 6h24v6H0zM9 0h6v18H9z"/><path fill="#cf142b" d="M0 7.5h24v3H0zM10.5 0h3v18h-3z"/></svg>;
}

function PreferenceButton({label, onClick, children}: {label: string; onClick: () => void; children: ReactNode}) {
  return (
    <Tooltip label={label} withArrow openDelay={250}>
      <ActionIcon type="button" variant="default" size="lg" aria-label={label} onClick={onClick}>{children}</ActionIcon>
    </Tooltip>
  );
}

function TreeRow({node, expanded, hasChildren, t, toggle, open}: {node: ReportTreeNode; expanded: boolean; hasChildren: boolean; t: Translate; toggle: () => void; open: () => void}) {
  const sourceUrl = node.page?.sourceUrl ?? node.excluded?.sourceUrl;
  const destinationUrl = node.page?.destinationUrl;
  const counters = node.page ? countText([
    [node.page.resources, t('files').toLocaleLowerCase()],
    [node.page.grids, t('grids')],
    [node.page.comments.comments, t('comments').toLocaleLowerCase()],
    [node.page.links, t('links')],
  ]) : undefined;
  return (
    <Box
      role="treeitem"
      aria-level={node.depth + 1}
      aria-expanded={hasChildren ? expanded : undefined}
      tabIndex={0}
      className={`tree-row status-${node.status}`}
      style={{'--tree-indent': `${Math.min(node.depth, 12) * 20 + 8}px`} as CSSProperties}
      onClick={open}
      onKeyDown={(event) => {
        if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); open(); }
        if (event.key === 'ArrowRight' && hasChildren && !expanded) { event.preventDefault(); toggle(); }
        if (event.key === 'ArrowLeft' && hasChildren && expanded) { event.preventDefault(); toggle(); }
      }}
    >
      <ActionIcon
        type="button"
        variant="subtle"
        color="gray"
        size="sm"
        className={hasChildren ? 'tree-toggle' : 'tree-toggle tree-toggle-hidden'}
        aria-label={expanded ? t('collapse') : t('expand')}
        onClick={(event) => { event.stopPropagation(); toggle(); }}
      >
        <ChevronRight size={16} className={expanded ? 'tree-chevron tree-chevron-expanded' : 'tree-chevron'} />
      </ActionIcon>
      <ExternalIcon href={sourceUrl} label={t('sourceLink')} color="red"><ExternalLink size={16} /></ExternalIcon>
      <ExternalIcon href={destinationUrl} label={t('destinationLink')} color="blue"><ExternalLink size={16} /></ExternalIcon>
      <Tooltip label={t('details')} withArrow openDelay={250}>
        <ActionIcon type="button" variant="subtle" color="gray" size="sm" aria-label={t('details')} onClick={(event) => { event.stopPropagation(); open(); }}>
          <Eye size={16} />
        </ActionIcon>
      </Tooltip>
      <Box className="tree-row-content">
        <Group gap="xs" wrap="wrap">
          <Text fw={600} size="sm" className="tree-title">{node.synthetic ? t('unknownPosition') : node.title}</Text>
          <StatusBadge status={node.status} t={t} />
        </Group>
        {counters && <Text size="xs" c="dimmed" mt={3}>{counters}</Text>}
        {node.excluded && <Text size="xs" c="dimmed" mt={3}>{node.excluded.reason}{node.excluded.sourceStatus ? ` · ${node.excluded.sourceStatus}` : ''}</Text>}
      </Box>
    </Box>
  );
}

function Hierarchy({report, t, selectedId, onSelect}: {report: TransferReportData; t: Translate; selectedId?: string | undefined; onSelect: (id: string) => void}) {
  const tree = useMemo(() => buildReportTree(report), [report]);
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<ReportTreeFilter>('all');
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set([...tree.nodes.values()].filter((node) => node.children.length > 0).map((node) => node.id)));
  const visible = useMemo(() => visibleTreeNodes(tree, expanded, filter, search), [tree, expanded, filter, search]);
  const scrollRef = useRef<HTMLDivElement>(null);
  const virtualizer = useVirtualizer({count: visible.length, getScrollElement: () => scrollRef.current, estimateSize: () => 66, overscan: 12});
  useEffect(() => { virtualizer.measure(); }, [virtualizer]);
  const filterOptions = filterValues.map((value) => ({
    value,
    label: value === 'all' ? t('all') : value === 'problems' ? `${t('problems')} (${problemCount(report)})` : statusTranslation(value) ? t(statusTranslation(value)!) : value,
  }));
  return (
    <Box component="section" aria-labelledby="hierarchy-title" className="report-section hierarchy-section">
      <Stack gap="md">
        <Group justify="space-between" align="end" gap="md" className="hierarchy-header">
          <Box>
            <Group gap="xs"><FolderTree size={18} color="var(--mantine-primary-color-filled)" /><Title order={2} id="hierarchy-title" size="h4">{t('hierarchy')}</Title></Group>
            <Text size="sm" c="dimmed" mt={4}>{t('hierarchyDescription')} · {visible.length}/{tree.nodes.size}</Text>
          </Box>
          <Group gap="sm" className="hierarchy-controls">
            <TextInput
              id="report-search"
              aria-label={t('search')}
              value={search}
              onChange={(event) => setSearch(event.currentTarget.value)}
              placeholder={t('search')}
              leftSection={<Search size={16} />}
              className="hierarchy-search"
            />
            <Select
              aria-label={t('filter')}
              value={filter}
              onChange={(value) => setFilter((value ?? 'all') as ReportTreeFilter)}
              data={filterOptions}
              allowDeselect={false}
              className="hierarchy-filter"
            />
          </Group>
        </Group>
        {visible.length === 0 ? (
          <Alert color="gray" icon={<Info size={16} />}>{t('noResults')}</Alert>
        ) : (
          <ScrollArea className="tree-scroll" viewportRef={scrollRef} type="auto">
            <Box role="tree" aria-label={t('hierarchy')} className="tree-virtual" style={{height: virtualizer.getTotalSize() + 16}}>
              {virtualizer.getVirtualItems().map((item) => {
                const node = visible[item.index]!;
                return (
                  <Box key={node.id} ref={virtualizer.measureElement} data-index={item.index} className="virtual-row" style={{transform: `translateY(${item.start}px)`}}>
                    <TreeRow
                      node={node}
                      expanded={expanded.has(node.id)}
                      hasChildren={node.children.length > 0}
                      t={t}
                      toggle={() => setExpanded((current) => {
                        const next = new Set(current);
                        if (next.has(node.id)) next.delete(node.id); else next.add(node.id);
                        return next;
                      })}
                      open={() => onSelect(node.id)}
                    />
                  </Box>
                );
              })}
            </Box>
          </ScrollArea>
        )}
        {selectedId && <span className="visually-hidden" aria-live="polite">{selectedId}</span>}
      </Stack>
    </Box>
  );
}

function hasDefinitionValue(value: ReactNode | undefined | null): value is ReactNode {
  return value !== undefined && value !== null && value !== '';
}

function DefinitionGrid({items}: {items: DefinitionItem[]}) {
  const visible = items.filter(([, value]) => hasDefinitionValue(value));
  if (visible.length === 0) return null;
  return (
    <Box component="dl" className="definition-list">
      {visible.map(([label, value]) => (
        <Box key={label} component="div" className="definition-item">
          <Text component="dt" size="xs" fw={700} c="dimmed" tt="uppercase">{label}</Text>
          <Box component="dd" className="definition-value">{value}</Box>
        </Box>
      ))}
    </Box>
  );
}

function isolatedPreview(body: string): string {
  const csp = "default-src 'none'; style-src 'unsafe-inline'; img-src data: blob:; font-src data:; object-src 'none'; base-uri 'none'; form-action 'none'";
  return `<!doctype html><html><head><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="${csp}"><style>body{font:14px/1.55 system-ui,sans-serif;margin:18px;color:#182230;overflow-wrap:anywhere}img{max-width:100%;height:auto}table{border-collapse:collapse;max-width:100%}td,th{border:1px solid #ccd;padding:6px}pre{white-space:pre-wrap;background:#f3f4f6;padding:10px;border-radius:6px}a{color:#175cd3}.ywtc-layout{display:grid;gap:18px}.ywtc-layout-section{display:grid;grid-template-columns:repeat(var(--columns,1),minmax(0,1fr));gap:18px;align-items:start}.ywtc-layout-columns-2{--columns:2}.ywtc-layout-columns-3{--columns:3}.ywtc-layout-cell{min-width:0}@media(max-width:620px){.ywtc-layout-section{grid-template-columns:1fr}}</style></head><body>${body}</body></html>`;
}

function issueColor(issue: TransferReportIssue): string {
  if (issue.severity === 'error') return 'red';
  if (issue.severity === 'degradation' || issue.severity === 'warning') return 'yellow';
  if (issue.severity === 'blocked') return 'gray';
  return 'blue';
}

function IssueList({issues, locale, t}: {issues: TransferReportIssue[]; locale: Locale; t: Translate}) {
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  if (issues.length === 0) return <Alert color="gray" icon={<Info size={16} />}>{t('noIssues')}</Alert>;
  return (
    <Stack gap="sm">
      {issues.map((issue) => {
        const key = `${issue.code}:${issue.objectId ?? issue.pageId ?? 'run'}`;
        const opened = expanded.has(key);
        return (
          <Alert key={key} color={issueColor(issue)} title={issue.code} icon={<StatusIcon status={issue.severity} size={16} />}>
            <Stack gap="xs">
              <Group gap={6} wrap="wrap">
                <Badge color={issueColor(issue)} variant="light">{t(issue.severity)}</Badge>
                <Badge color="gray" variant="outline">{categoryLabels[locale][issue.category]}</Badge>
                <Badge color="gray" variant="outline">{issue.phase}</Badge>
                {issue.retryable && <Badge color="yellow" variant="light">{t('retryable')}</Badge>}
                {issue.occurrences > 1 && <Badge color="gray" variant="outline">×{issue.occurrences}</Badge>}
              </Group>
              <Text size="sm"><strong>{t('action')}:</strong> {issueActionLabel(issue, locale)}</Text>
              <Box>
                <Button
                  type="button"
                  variant="subtle"
                  color="gray"
                  size="compact-sm"
                  onClick={() => setExpanded((current) => {
                    const next = new Set(current);
                    if (next.has(key)) next.delete(key); else next.add(key);
                    return next;
                  })}
                >
                  {t('technical')}
                </Button>
                <Collapse expanded={opened}>
                  <Box mt="xs" className="technical-diagnostics">
                    <Text size="xs"><strong>ID:</strong> {issue.objectId ?? issue.pageId ?? 'run'}</Text>
                    {issue.rootCauseId && <Text size="xs"><strong>Root cause:</strong> {issue.rootCauseId}</Text>}
                    <Text size="xs" className="diagnostic-message"><strong>Message:</strong> {issue.message}</Text>
                  </Box>
                </Collapse>
              </Box>
            </Stack>
          </Alert>
        );
      })}
    </Stack>
  );
}

function ResourcesTable({node, t}: {node: ReportTreeNode; t: Translate}) {
  const resources = node.page?.resourceItems ?? [];
  return (
    <Table.ScrollContainer minWidth={760}>
      <Table striped highlightOnHover verticalSpacing="sm">
        <Table.Thead><Table.Tr><Table.Th>{t('name')}</Table.Th><Table.Th>{t('kind')}</Table.Th><Table.Th>{t('size')}</Table.Th><Table.Th>{t('status')}</Table.Th><Table.Th>{t('reason')}</Table.Th></Table.Tr></Table.Thead>
        <Table.Tbody>
          {resources.map((resource) => (
            <Table.Tr key={resource.sourceId}>
              <Table.Td>
                <Group gap="xs" align="flex-start" wrap="nowrap">
                  {resource.kind === 'image'
                    ? <FileImage size={16} color="var(--mantine-primary-color-filled)" />
                    : resource.kind === 'grid'
                      ? <Database size={16} color="var(--mantine-primary-color-filled)" />
                      : <Paperclip size={16} color="var(--mantine-primary-color-filled)" />}
                  <Box>
                    <Text size="sm" fw={600}>{resource.sourceName}</Text>
                    {resource.destinationName && resource.destinationName !== resource.sourceName && <Text size="xs" c="dimmed">→ {resource.destinationName}</Text>}
                    <Group gap={4} mt={4}>
                      <ExternalIcon href={resource.sourceUrl} label={t('sourceLink')} color="red"><ExternalLink size={14} /></ExternalIcon>
                      <ExternalIcon href={resource.destinationUrl} label={t('destinationLink')} color="blue"><ExternalLink size={14} /></ExternalIcon>
                    </Group>
                  </Box>
                </Group>
              </Table.Td>
              <Table.Td><Text size="sm">{resource.kind}</Text></Table.Td>
              <Table.Td>
                {resource.sourceBytes !== undefined && resource.sourceBytes > 0 && <Text size="sm">{formatBytes(resource.sourceBytes)}</Text>}
                {resource.sha256 && <Code className="hash-code" title={resource.sha256}>{resource.sha256}</Code>}
              </Table.Td>
              <Table.Td><StatusBadge status={resource.status} t={t} /></Table.Td>
              <Table.Td><Text size="sm" c="dimmed">{resource.error ?? resource.blockedReason}</Text></Table.Td>
            </Table.Tr>
          ))}
        </Table.Tbody>
      </Table>
    </Table.ScrollContainer>
  );
}

function CommentsPanel({node, locale, t}: {node: ReportTreeNode; locale: Locale; t: Translate}) {
  const comments = node.page!.comments;
  const commentCount = countText([
    [comments.threads, t('threads')],
    [comments.comments, t('entries')],
    [comments.participants, t('participants')],
    [comments.attachments, t('attachments')],
  ]);
  return (
    <Stack gap="md">
      <DefinitionGrid items={[
        [t('status'), <StatusBadge key="comment-status" status={comments.status} t={t} />],
        [t('comments'), commentCount],
        [t('archive'), comments.archiveName ? <Group key="comment-archive" gap={4}><Text size="sm">{comments.archiveName}</Text><ExternalIcon href={comments.archiveUrl} label={t('archive')} color="blue"><ExternalLink size={14} /></ExternalIcon></Group> : undefined],
        [t('size'), comments.bytes > 0 ? formatBytes(comments.bytes) : undefined],
      ]} />
      {comments.error && <Alert color="red" icon={<XCircle size={16} />}>{comments.error}</Alert>}
      {comments.items?.length ? (
        <Table.ScrollContainer minWidth={680}>
          <Table striped highlightOnHover verticalSpacing="sm">
            <Table.Thead><Table.Tr><Table.Th>ID</Table.Th><Table.Th>{t('participants')}</Table.Th><Table.Th>{t('status')}</Table.Th><Table.Th>{t('reason')}</Table.Th></Table.Tr></Table.Thead>
            <Table.Tbody>
              {comments.items.map((comment) => (
                <Table.Tr key={comment.commentId}>
                  <Table.Td>
                    <Code>{comment.commentId}</Code>
                    {comment.createdAt && <Text size="xs" c="dimmed" mt={3}>{formatDate(comment.createdAt, locale)}</Text>}
                    <Group gap={4} mt={4}>
                      <ExternalIcon href={comment.sourceUrl} label={t('sourceLink')} color="red"><ExternalLink size={14} /></ExternalIcon>
                      <ExternalIcon href={comment.destinationUrl} label={t('destinationLink')} color="blue"><ExternalLink size={14} /></ExternalIcon>
                    </Group>
                  </Table.Td>
                  <Table.Td><Text size="sm">{comment.author}</Text></Table.Td>
                  <Table.Td><StatusBadge status={comment.outcome} t={t} /></Table.Td>
                  <Table.Td><Text size="sm">{comment.error ?? comment.sourceStatus}</Text></Table.Td>
                </Table.Tr>
              ))}
            </Table.Tbody>
          </Table>
        </Table.ScrollContainer>
      ) : null}
    </Stack>
  );
}

function PageDialog({node, payload, locale, t, onOpenChange}: {node?: ReportTreeNode | undefined; payload: ReportPresentationPayload; locale: Locale; t: Translate; onOpenChange: (open: boolean) => void}) {
  const page = node?.page;
  const excluded = node?.excluded;
  const issues = node ? payload.report.issues.filter((issue) =>
    (issue.pageId === node.id || issue.blockedByPageId === node.id)
    && issue.severity !== 'adaptation'
    && issue.severity !== 'normalization') : [];
  const preview = node ? payload.previews[node.id] : undefined;
  const sections = visibleDetailSections({page, hasPreview: Boolean(preview), issueCount: issues.length});
  const tabs = [
    {value: 'overview', label: t('overview'), visible: true},
    {value: 'files', label: t('files'), visible: sections.includes('files')},
    {value: 'comments', label: t('comments'), visible: sections.includes('comments')},
    {value: 'comparison', label: t('comparison'), visible: sections.includes('comparison')},
    {value: 'issues', label: `${t('issues')} · ${issues.length}`, visible: sections.includes('issues')},
  ].filter((tab) => tab.visible);
  const inventory = page ? countText([
    [page.links, t('links')],
    [page.tables, t('tables')],
    [page.grids, t('grids')],
    [page.codeBlocks, t('codeBlocks')],
  ]) : undefined;
  const title = (
    <Group gap="xs" wrap="wrap">
      <Text fw={700}>{node?.synthetic ? t('unknownPosition') : node?.title}</Text>
      {node && <StatusBadge status={node.status} t={t} />}
    </Group>
  );
  return (
    <Modal
      key={node?.id}
      opened={Boolean(node)}
      onClose={() => onOpenChange(false)}
      title={title}
      size="min(1180px, 96vw)"
      centered
      overlayProps={{backgroundOpacity: 0.72, blur: 3}}
      scrollAreaComponent={ScrollArea.Autosize}
      classNames={{content: 'page-modal', body: 'page-modal-body'}}
    >
      {node && (
        <Tabs defaultValue="overview" keepMounted={false}>
          <ScrollArea type="auto" scrollbarSize={6}>
            <Tabs.List className="details-tabs">{tabs.map((tab) => <Tabs.Tab key={tab.value} value={tab.value}>{tab.label}</Tabs.Tab>)}</Tabs.List>
          </ScrollArea>
          <Tabs.Panel value="overview" pt="md">
            <Stack gap="md">
              <DefinitionGrid items={[
                [t('sourceId'), page?.sourceId ?? excluded?.sourceId],
                [t('destinationId'), page?.destinationId],
                [t('sourceParent'), page?.sourceParentId ?? excluded?.sourceParentId],
                [t('expectedParent'), page?.projectedParentId ?? page?.parentId ?? excluded?.projectedParentId],
                [t('actualParent'), page?.destinationParentId],
                [t('depth'), node.depth > 0 ? String(node.depth) : undefined],
                [t('inventory'), inventory ?? excluded?.reason],
                [t('status'), <StatusBadge key="page-status" status={node.status} t={t} />],
                [t('conflictEvidence'), page?.conflictEvidence ? `${page.conflictEvidence.reason}: ${page.conflictEvidence.candidateIds.join(', ')}` : undefined],
              ]} />
              <Group gap="xs">
                <ExternalIcon href={page?.sourceUrl ?? excluded?.sourceUrl} label={t('sourceLink')} color="red"><ExternalLink size={16} /></ExternalIcon>
                <ExternalIcon href={page?.destinationUrl} label={t('destinationLink')} color="blue"><ExternalLink size={16} /></ExternalIcon>
              </Group>
              {excluded && !excluded.metadataComplete && <Alert color="yellow" icon={<AlertTriangle size={16} />}>{t('metadataIncomplete')}</Alert>}
              {page?.error && <Alert color="red" icon={<XCircle size={16} />}>{page.error}</Alert>}
              {page?.warnings.map((warning) => <Alert key={warning} color="yellow" icon={<AlertTriangle size={16} />}>{warning}</Alert>)}
              {page?.adaptations?.map((adaptation) => <Alert key={adaptation} color="blue" icon={<Info size={16} />}>{adaptation}</Alert>)}
            </Stack>
          </Tabs.Panel>
          {sections.includes('files') && <Tabs.Panel value="files" pt="md"><ResourcesTable node={node} t={t} /></Tabs.Panel>}
          {sections.includes('comments') && <Tabs.Panel value="comments" pt="md"><CommentsPanel node={node} locale={locale} t={t} /></Tabs.Panel>}
          {preview && (
            <Tabs.Panel value="comparison" pt="md">
              <SimpleGrid cols={{base: 1, lg: 2}} spacing="md">
                <Box><Text size="sm" fw={700} mb="xs">{t('sourcePreview')}</Text><iframe title={t('sourcePreview')} className="preview-frame" sandbox="" srcDoc={isolatedPreview(preview.source)} /></Box>
                <Box><Text size="sm" fw={700} mb="xs">{t('destinationPreview')}</Text><iframe title={t('destinationPreview')} className="preview-frame" sandbox="" srcDoc={isolatedPreview(preview.destination)} /></Box>
              </SimpleGrid>
            </Tabs.Panel>
          )}
          {issues.length > 0 && <Tabs.Panel value="issues" pt="md"><IssueList issues={issues} locale={locale} t={t} /></Tabs.Panel>}
        </Tabs>
      )}
    </Modal>
  );
}

function MetadataLink({href, fallback}: {href?: string | undefined; fallback: string}) {
  const safe = safeLink(href);
  if (!safe) return <Text component="span" size="sm" c="dimmed">{href || fallback}</Text>;
  return (
    <Text component="a" href={safe} target="_blank" rel="noreferrer" size="sm" className="metadata-link">
      {href}
      <ExternalLink size={13} aria-hidden="true" />
    </Text>
  );
}

function ReportOverview({report, locale, theme, setLocale, setTheme, t}: {
  report: TransferReportData;
  locale: Locale;
  theme: Theme;
  setLocale: (locale: Locale) => void;
  setTheme: (theme: Theme) => void;
  t: Translate;
}) {
  const nextLocale: Locale = locale === 'ru' ? 'en' : 'ru';
  const nextTheme: Theme = theme === 'system' ? 'light' : theme === 'light' ? 'dark' : 'system';
  const localeLabel = `${t('language')}: ${locale === 'ru' ? 'Русский' : 'English'}; ${t('next')}: ${nextLocale === 'ru' ? 'Русский' : 'English'}`;
  const themeLabel = `${t('theme')}: ${t(theme)}; ${t('next')}: ${t(nextTheme)}`;
  return (
    <Box component="section" aria-labelledby="report-title" className="report-section overview-section">
      <Title order={1} id="report-title" className="visually-hidden">{t('report')}</Title>
      <Group justify="flex-end" gap="xs" className="preference-controls">
        <PreferenceButton label={localeLabel} onClick={() => setLocale(nextLocale)}>{locale === 'ru' ? <RussianFlag /> : <EnglishFlag />}</PreferenceButton>
        <PreferenceButton label={themeLabel} onClick={() => setTheme(nextTheme)}>{theme === 'system' ? <Monitor size={17} /> : theme === 'light' ? <Sun size={17} /> : <Moon size={17} />}</PreferenceButton>
      </Group>
      <img src={reportHeader} className="report-header" alt="Yandex Wiki and Confluence sources pass pages, hierarchy, links, tables, images, comments, and attachments through ywtc to Confluence, Yandex Wiki, Markdown, and HTML" />
      <Stack align="center" gap="xs" className="run-status">
        <StatusBadge status={report.status} t={t} />
        <Group justify="center" gap="lg" wrap="wrap">
          <Text size="xs" c="dimmed">{t('started')}: <strong>{formatDate(report.startedAt, locale)}</strong></Text>
          {report.finishedAt && <Text size="xs" c="dimmed">{t('finished')}: <strong>{formatDate(report.finishedAt, locale)}</strong></Text>}
        </Group>
      </Stack>
      <Box className="overview-summary"><SummaryTable report={report} t={t} /></Box>
      <Box component="dl" className="run-details">
        {report.retry && <>
          <Box component="div" className="run-detail"><Text component="dt">{t('retryAttempt')}</Text><Text component="dd">#{report.retry.attempt}</Text></Box>
          <Box component="div" className="run-detail"><Text component="dt">{t('retryRoot')}</Text><Text component="dd" className="metadata-code">{report.retry.rootRunId}</Text></Box>
          <Box component="div" className="run-detail"><Text component="dt">{t('previousRun')}</Text><Text component="dd" className="metadata-code">{report.retry.parentRunId}</Text></Box>
          <Box component="div" className="run-detail"><Text component="dt">{t('retrySelection')}</Text><Text component="dd">{countText([
            [report.retry.selectedPages, t('pages').toLocaleLowerCase()],
            [report.retry.selectedResources, t('files').toLocaleLowerCase()],
            [report.retry.selectedComments, t('comments').toLocaleLowerCase()],
            [report.retry.contextPages, t('contextPages')],
            [report.retry.carriedForward, t('carriedForward')],
          ]) ?? t('notAvailable')}</Text></Box>
          {(report.retry.remainingRetryable > 0 || report.retry.remainingTerminal > 0) && <Box component="div" className="run-detail"><Text component="dt">{t('remaining')}</Text><Text component="dd">{countText([
            [report.retry.remainingRetryable, t('retryable')],
            [report.retry.remainingTerminal, t('terminal')],
          ])}</Text></Box>}
        </>}
        <Box component="div" className="run-detail"><Text component="dt">{t('runId')}</Text><Text component="dd" className="metadata-code">{report.runId}</Text></Box>
        <Box component="div" className="run-detail"><Text component="dt">{t('state')}</Text><Text component="dd" className="metadata-code">{report.state.path}</Text></Box>
        <Box component="div" className="run-detail"><Text component="dt">{t('source')}</Text><Box component="dd"><MetadataLink href={report.source.url} fallback={report.source.title || t('notAvailable')} /></Box></Box>
        <Box component="div" className="run-detail"><Text component="dt">{t('destination')}</Text><Box component="dd"><MetadataLink href={report.destination.url} fallback={report.destination.id || t('notAvailable')} /></Box></Box>
      </Box>
      <Group justify="flex-start" mt="md">
        <Button component="a" href="report.json" download="report.json" variant="subtle" leftSection={<Download size={16} />}>{t('downloadJson')}</Button>
      </Group>
    </Box>
  );
}

function ReportApplication({payload}: {payload: ReportPresentationPayload}) {
  const storedLocale = guardedStorageGet('ywtc-report-locale');
  const storedTheme = guardedStorageGet('ywtc-report-theme');
  const [locale, setLocale] = useState<Locale>(storedLocale === 'ru' || storedLocale === 'en' ? storedLocale : initialLocale());
  const [theme, setTheme] = useState<Theme>(storedTheme === 'light' || storedTheme === 'dark' || storedTheme === 'system' ? storedTheme : 'system');
  const [systemDark, setSystemDark] = useState(() => window.matchMedia('(prefers-color-scheme: dark)').matches);
  const [selectedId, setSelectedId] = useState<string>();
  const t = useMemo(() => translator(locale), [locale]);
  const tree = useMemo(() => buildReportTree(payload.report), [payload.report]);
  const selectedNode = selectedId ? tree.nodes.get(selectedId) : undefined;
  const effectiveTheme = theme === 'system' ? systemDark ? 'dark' : 'light' : theme;
  useEffect(() => {
    document.documentElement.lang = locale;
    document.title = `ywtc · ${t('report')} · ${payload.report.runId}`;
    guardedStorageSet('ywtc-report-locale', locale);
  }, [locale, payload.report.runId, t]);
  useEffect(() => {
    const media = window.matchMedia('(prefers-color-scheme: dark)');
    const update = () => setSystemDark(media.matches);
    media.addEventListener?.('change', update);
    return () => media.removeEventListener?.('change', update);
  }, []);
  useEffect(() => {
    const root = document.documentElement;
    root.classList.remove('light', 'dark');
    root.classList.add(effectiveTheme);
    guardedStorageSet('ywtc-report-theme', theme);
  }, [effectiveTheme, theme]);
  const report = payload.report;
  return (
    <MantineProvider theme={reportTheme} forceColorScheme={effectiveTheme} defaultColorScheme="light" deduplicateInlineStyles>
      <Box className="report-background">
        <Container component="main" fluid className="report-shell">
          <ReportOverview report={report} locale={locale} theme={theme} setLocale={setLocale} setTheme={setTheme} t={t} />
          <Hierarchy report={report} t={t} selectedId={selectedId} onSelect={setSelectedId} />
        </Container>
        <PageDialog node={selectedNode} payload={payload} locale={locale} t={t} onOpenChange={(open) => { if (!open) setSelectedId(undefined); }} />
      </Box>
    </MantineProvider>
  );
}

export function App({payload}: {payload: ReportPresentationPayload}) {
  return <ReportApplication payload={payload} />;
}

export function ReportLoadError({message}: {message: string}) {
  return (
    <MantineProvider theme={reportTheme} defaultColorScheme="light">
      <Container size="sm" py="xl">
        <Alert color="red" icon={<FileWarning size={20} />} title="Report could not be loaded.">{message}</Alert>
      </Container>
    </MantineProvider>
  );
}
