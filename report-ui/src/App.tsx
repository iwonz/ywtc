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
  Languages,
  MessageSquare,
  Network,
  Paperclip,
  Palette,
  Search,
  ShieldAlert,
  Timer,
  XCircle,
} from 'lucide-react';
import {useEffect, useMemo, useRef, useState} from 'react';
import type {
  ReportPresentationPayload,
  TransferReportData,
  TransferReportIssue,
} from '../../src/report-contract';
import reportHeader from '../../docs/assets/report-header-transparent.png';
import {initialLocale, type Locale, translator, type TranslationKey} from './i18n';
import {formatBytes, guardedStorageGet, guardedStorageSet, safeLink} from './lib';
import {buildReportTree, problemCount, type ReportTreeFilter, type ReportTreeNode, visibleTreeNodes} from './model';
import {
  Alert,
  Badge,
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  Input,
  Progress,
  ScrollArea,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
  buttonVariants,
} from './ui';

type Theme = 'system' | 'light' | 'dark';

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

function issueActionLabel(issue: TransferReportIssue, locale: Locale): string {
  if (locale === 'en') return issue.action;
  if (issue.severity === 'blocked') return 'Устраните ошибку вышестоящей страницы и повторите ту же миграцию.';
  if (issue.retryable) return 'Повторите ту же миграцию: объект будет обработан заново.';
  if (issue.severity === 'degradation') return 'Сравните source и destination во вкладке сравнения.';
  if (issue.severity === 'normalization') return 'Действие не требуется.';
  if (issue.category === 'authorization') return 'Проверьте токен подключения, выполните doctor и повторите миграцию.';
  if (issue.category === 'permissions') return 'Предоставьте пользователю токена доступ к объекту и повторите миграцию.';
  if (issue.category === 'conflict') return 'Проверьте изменение или конфликт заголовка в destination перед повторным запуском.';
  return 'Проверьте причину, затронутый объект и техническую диагностику.';
}

const filterValues: ReportTreeFilter[] = ['all', 'problems', 'partial', 'failed', 'blocked', 'conflict', 'excluded'];

function statusTranslation(status: string): TranslationKey | undefined {
  if (status === 'excluded') return 'excludedStatus';
  if (status === 'completed') return 'complete';
  if (status === 'completed-with-warnings') return 'warning';
  return ['complete', 'partial', 'failed', 'blocked', 'conflict', 'planned', 'not-started', 'discovered', 'skeleton-created', 'skipped'].includes(status)
    ? status as TranslationKey
    : undefined;
}

function badgeVariant(status: string): 'success' | 'warning' | 'danger' | 'blocked' | 'conflict' | 'outline' {
  if (status === 'complete' || status === 'completed') return 'success';
  if (status === 'failed') return 'danger';
  if (status === 'blocked' || status === 'not-started' || status === 'excluded') return 'blocked';
  if (status === 'conflict') return 'conflict';
  if (status === 'partial' || status === 'planned' || status === 'completed-with-warnings') return 'warning';
  return 'outline';
}

function StatusIcon({status, className = 'size-4'}: {status: string; className?: string}) {
  if (status === 'complete' || status === 'completed') return <CheckCircle2 className={className} aria-hidden="true" />;
  if (status === 'failed') return <XCircle className={className} aria-hidden="true" />;
  if (status === 'blocked') return <Ban className={className} aria-hidden="true" />;
  if (status === 'conflict') return <ShieldAlert className={className} aria-hidden="true" />;
  if (status === 'excluded') return <Archive className={className} aria-hidden="true" />;
  if (status === 'not-started' || status === 'planned') return <Timer className={className} aria-hidden="true" />;
  if (status === 'partial' || status === 'completed-with-warnings') return <AlertTriangle className={className} aria-hidden="true" />;
  return <CircleDashed className={className} aria-hidden="true" />;
}

function StatusBadge({status, t}: {status: string; t: (key: TranslationKey) => string}) {
  const key = statusTranslation(status);
  return <Badge variant={badgeVariant(status)}><StatusIcon status={status} className="size-3" />{key ? t(key) : status}</Badge>;
}

function ExternalIcon({href, label, children}: {href?: string | undefined; label: string; children: React.ReactNode}) {
  const safe = safeLink(href);
  if (!safe) return <span role="img" className={`${buttonVariants({variant: 'ghost', size: 'icon'})} cursor-not-allowed opacity-35`} aria-label={`${label}: unavailable`}>{children}</span>;
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <a className={buttonVariants({variant: 'ghost', size: 'icon'})} href={safe} target="_blank" rel="noreferrer" aria-label={label} onClick={(event) => event.stopPropagation()}>{children}</a>
      </TooltipTrigger>
      <TooltipContent>{label}</TooltipContent>
    </Tooltip>
  );
}

function formatDate(value: string | undefined, locale: Locale): string {
  if (!value) return '—';
  const date = new Date(value);
  return Number.isNaN(date.valueOf()) ? value : new Intl.DateTimeFormat(locale === 'ru' ? 'ru-RU' : 'en-US', {dateStyle: 'medium', timeStyle: 'short'}).format(date);
}

function OutcomeList({counts, t}: {counts: Record<string, number>; t: (key: TranslationKey) => string}) {
  const entries = Object.entries(counts).filter(([, count]) => count > 0);
  if (entries.length === 0) return <span className="text-muted-foreground">0</span>;
  return <div className="flex flex-wrap gap-1.5">{entries.map(([status, count]) => <span key={status} className="inline-flex items-center gap-1"><StatusBadge status={status} t={t} /><strong className="text-xs tabular-nums">{count}</strong></span>)}</div>;
}

function SummaryTable({report, t}: {report: TransferReportData; t: (key: TranslationKey) => string}) {
  const summary = report.summary;
  const sourceBytes = summary.sourceBytes + summary.commentBytes;
  return (
    <Card aria-labelledby="summary-title">
      <CardHeader className="pb-3">
        <CardTitle id="summary-title">{t('summary')}</CardTitle>
        <CardDescription>{report.source.title} → {report.destination.profile ?? report.destination.format ?? report.destination.provider}</CardDescription>
      </CardHeader>
      <CardContent>
        <Table className="summary-table table-fixed [&_td]:px-1 [&_th]:px-1 sm:[&_td]:px-3 sm:[&_th]:px-3">
          <TableHeader><TableRow><TableHead>{t('metric')}</TableHead><TableHead>{t('source')}</TableHead><TableHead>{t('destination')}</TableHead></TableRow></TableHeader>
          <TableBody>
            <TableRow>
              <TableCell className="font-medium"><span className="inline-flex items-center gap-2"><FolderTree className="size-4 text-primary" />{t('pages')}</span></TableCell>
              <TableCell>{summary.returnedDescendants + 1} {t('found')} · {summary.pages} {t('selected')} · <span className={summary.excludedPages ? 'font-semibold text-amber-700 dark:text-amber-300' : ''}>{summary.excludedPages} {t('excluded')}</span></TableCell>
              <TableCell><OutcomeList counts={summary.pageStatuses} t={t} /></TableCell>
            </TableRow>
            <TableRow>
              <TableCell className="font-medium"><span className="inline-flex items-center gap-2"><Paperclip className="size-4 text-primary" />{t('files')}</span></TableCell>
              <TableCell>{summary.resources} · {summary.attachments} {t('attachments')} · {summary.resourceImages} {t('images')} · {summary.commentAttachments} {t('commentAttachments')}</TableCell>
              <TableCell><OutcomeList counts={summary.resourceStatuses} t={t} /></TableCell>
            </TableRow>
            <TableRow>
              <TableCell className="font-medium"><span className="inline-flex items-center gap-2"><MessageSquare className="size-4 text-primary" />{t('comments')}</span></TableCell>
              <TableCell>{summary.commentThreads} {t('threads')} · {summary.comments} {t('entries')} · {summary.commentParticipants} {t('participants')}</TableCell>
              <TableCell><OutcomeList counts={summary.commentStatuses} t={t} /></TableCell>
            </TableRow>
            <TableRow>
              <TableCell className="font-medium"><span className="inline-flex items-center gap-2"><Database className="size-4 text-primary" />{t('data')}</span></TableCell>
              <TableCell>{formatBytes(sourceBytes)} {t('known')} · {summary.bytesUnknown} {t('unknownSizes')}</TableCell>
              <TableCell><strong>{formatBytes(summary.bytes)}</strong> {t('transferred')}</TableCell>
            </TableRow>
          </TableBody>
        </Table>
        {!summary.inventoryComplete && <Alert className="mt-4 border-amber-500/35 bg-amber-500/8 text-amber-800 dark:text-amber-200"><AlertTriangle className="mr-2 inline size-4" />{t('inventoryIncomplete')}: {summary.inventoriedPages}/{summary.pages}</Alert>}
      </CardContent>
    </Card>
  );
}

function RootCauses({report, locale, t, onOpen}: {report: TransferReportData; locale: Locale; t: (key: TranslationKey) => string; onOpen: (id: string) => void}) {
  const roots = report.issues.filter((issue) => issue.severity === 'error');
  return (
    <Card aria-labelledby="root-causes-title">
      <CardHeader className="pb-3"><CardTitle id="root-causes-title" className="flex items-center gap-2"><Network className="size-4 text-red-500" />{t('rootCauses')}</CardTitle></CardHeader>
      <CardContent className="space-y-3">
        {roots.length === 0 ? <p className="text-sm text-muted-foreground">{t('noRootCauses')}</p> : roots.map((issue) => {
          const rootId = issue.rootCauseId ?? `${issue.pageId ?? 'run'}:${issue.code}`;
          const dependentIssues = report.issues.filter((candidate) => candidate !== issue && (candidate.rootCauseId === rootId || (candidate.blockedByPageId === issue.pageId && candidate.blockedByCode === issue.code)));
          return (
            <Alert key={`${issue.code}:${issue.objectId ?? issue.pageId ?? 'run'}`} className="border-red-500/30 bg-red-500/6">
              <div className="flex flex-wrap items-center gap-2"><StatusBadge status="failed" t={t} /><Badge variant="outline">{categoryLabels[locale][issue.category]}</Badge>{issue.retryable && <Badge variant="warning">{t('retryable')}</Badge>}{dependentIssues.length > 0 && <Badge variant="blocked">{dependentIssues.length} {t('dependent')}</Badge>}</div>
              <p className="mt-2 font-medium">{issue.pageTitle ?? issue.objectId ?? issue.code}</p>
              <p className="mt-1 text-muted-foreground">{issue.message}</p>
              {dependentIssues.length > 0 && <ul className="mt-2 list-inside list-disc text-xs text-muted-foreground">{dependentIssues.map((dependent) => <li key={`${dependent.code}:${dependent.objectId ?? dependent.pageId}`}>{dependent.pageTitle ?? dependent.objectId ?? dependent.code}: {dependent.message}</li>)}</ul>}
              <div className="mt-3 flex items-center justify-between gap-3"><span className="text-xs text-muted-foreground">{issueActionLabel(issue, locale)}</span>{issue.pageId && <Button variant="outline" size="sm" onClick={() => onOpen(issue.pageId!)}><Eye className="size-3.5" />{t('details')}</Button>}</div>
            </Alert>
          );
        })}
      </CardContent>
    </Card>
  );
}

function TreeRow({node, expanded, hasChildren, t, toggle, open}: {node: ReportTreeNode; expanded: boolean; hasChildren: boolean; t: (key: TranslationKey) => string; toggle: () => void; open: () => void}) {
  const sourceUrl = node.page?.sourceUrl ?? node.excluded?.sourceUrl;
  const destinationUrl = node.page?.destinationUrl;
  const resources = node.page?.resourceItems.length ?? 0;
  const comments = node.page?.comments.comments ?? 0;
  return (
    <div
      role="treeitem"
      aria-level={node.depth + 1}
      aria-expanded={hasChildren ? expanded : undefined}
      tabIndex={0}
      className={`tree-row status-${node.status} group flex min-h-[58px] cursor-pointer items-center gap-1 rounded-lg border border-border/70 px-2 py-2 outline-none transition hover:border-primary/35 hover:shadow-sm focus-visible:ring-2 focus-visible:ring-ring`}
      style={{'--tree-indent': `${Math.min(node.depth, 12) * 20 + 8}px`} as React.CSSProperties}
      onClick={open}
      onKeyDown={(event) => {
        if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); open(); }
        if (event.key === 'ArrowRight' && hasChildren && !expanded) { event.preventDefault(); toggle(); }
        if (event.key === 'ArrowLeft' && hasChildren && expanded) { event.preventDefault(); toggle(); }
      }}
    >
      <Button variant="ghost" size="icon" className={hasChildren ? '' : 'invisible'} aria-label={expanded ? t('collapse') : t('expand')} onClick={(event) => { event.stopPropagation(); toggle(); }}>
        <ChevronRight className={`size-4 transition-transform ${expanded ? 'rotate-90' : ''}`} />
      </Button>
      <ExternalIcon href={sourceUrl} label={t('sourceLink')}><ExternalLink className="size-4 text-red-500" /></ExternalIcon>
      <ExternalIcon href={destinationUrl} label={t('destinationLink')}><ExternalLink className="size-4 text-blue-500" /></ExternalIcon>
      <Tooltip><TooltipTrigger asChild><Button variant="ghost" size="icon" aria-label={t('details')} onClick={(event) => { event.stopPropagation(); open(); }}><Eye className="size-4" /></Button></TooltipTrigger><TooltipContent>{t('details')}</TooltipContent></Tooltip>
      <div className="min-w-0 flex-1 px-1">
        <div className="flex flex-wrap items-center gap-2"><span className="truncate font-medium">{node.synthetic ? t('unknownPosition') : node.title}</span><StatusBadge status={node.status} t={t} /></div>
        <div className="mt-1 flex flex-wrap gap-x-3 text-xs text-muted-foreground">
          {node.page && <><span>{resources} {t('files')}</span><span>{comments} {t('comments')}</span><span>{node.page.links} {t('links')}</span></>}
          {node.excluded && <span>{node.excluded.reason}{node.excluded.sourceStatus ? ` · ${node.excluded.sourceStatus}` : ''}</span>}
        </div>
      </div>
    </div>
  );
}

function Hierarchy({report, t, selectedId, onSelect}: {report: TransferReportData; t: (key: TranslationKey) => string; selectedId?: string | undefined; onSelect: (id: string) => void}) {
  const tree = useMemo(() => buildReportTree(report), [report]);
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<ReportTreeFilter>('all');
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set([...tree.nodes.values()].filter((node) => node.children.length > 0).map((node) => node.id)));
  const visible = useMemo(() => visibleTreeNodes(tree, expanded, filter, search), [tree, expanded, filter, search]);
  const scrollRef = useRef<HTMLDivElement>(null);
  const virtualizer = useVirtualizer({count: visible.length, getScrollElement: () => scrollRef.current, estimateSize: () => 66, overscan: 12});
  useEffect(() => { virtualizer.measure(); }, [virtualizer]);
  return (
    <Card aria-labelledby="hierarchy-title">
      <CardHeader>
        <div className="flex flex-col justify-between gap-4 lg:flex-row lg:items-end">
          <div><CardTitle id="hierarchy-title" className="flex items-center gap-2"><FolderTree className="size-4 text-primary" />{t('hierarchy')}</CardTitle><CardDescription>{t('hierarchyDescription')} · {visible.length}/{tree.nodes.size}</CardDescription></div>
          <div className="flex w-full flex-col gap-2 sm:flex-row lg:w-auto">
            <label htmlFor="report-search" className="relative min-w-0 flex-1 lg:w-80"><Search className="pointer-events-none absolute left-3 top-2.5 size-4 text-muted-foreground" /><span className="sr-only">{t('search')}</span><Input id="report-search" className="pl-9" value={search} onChange={(event) => setSearch(event.target.value)} placeholder={t('search')} /></label>
            <Select value={filter} onValueChange={(value) => setFilter(value as ReportTreeFilter)}><SelectTrigger aria-label={t('filter')}><SelectValue /></SelectTrigger><SelectContent>{filterValues.map((value) => <SelectItem key={value} value={value}>{value === 'all' ? t('all') : value === 'problems' ? `${t('problems')} (${problemCount(report)})` : statusTranslation(value) ? t(statusTranslation(value)!) : value}</SelectItem>)}</SelectContent></Select>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        {visible.length === 0 ? <Alert>{t('noResults')}</Alert> : (
          <ScrollArea className="h-[min(68vh,720px)] rounded-xl border border-border/60 bg-background/45" viewportRef={scrollRef}>
            <div role="tree" aria-label={t('hierarchy')} className="relative p-2" style={{height: `${virtualizer.getTotalSize() + 16}px`}}>
              {virtualizer.getVirtualItems().map((item) => {
                const node = visible[item.index]!;
                return <div key={node.id} ref={virtualizer.measureElement} data-index={item.index} className="absolute left-2 right-2 top-0 pb-2" style={{transform: `translateY(${item.start}px)`}}><TreeRow node={node} expanded={expanded.has(node.id)} hasChildren={node.children.length > 0} t={t} toggle={() => setExpanded((current) => { const next = new Set(current); if (next.has(node.id)) next.delete(node.id); else next.add(node.id); return next; })} open={() => onSelect(node.id)} /></div>;
              })}
            </div>
          </ScrollArea>
        )}
        {selectedId && <span className="sr-only" aria-live="polite">{selectedId}</span>}
      </CardContent>
    </Card>
  );
}

function DefinitionGrid({items}: {items: Array<[string, React.ReactNode]>}) {
  return <dl className="grid gap-3 sm:grid-cols-2">{items.map(([label, value]) => <div key={label} className="rounded-lg border border-border/70 bg-muted/25 p-3"><dt className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{label}</dt><dd className="mt-1 break-words text-sm">{value || '—'}</dd></div>)}</dl>;
}

function isolatedPreview(body: string): string {
  const csp = "default-src 'none'; style-src 'unsafe-inline'; img-src data: blob:; font-src data:; object-src 'none'; base-uri 'none'; form-action 'none'";
  return `<!doctype html><html><head><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="${csp}"><style>body{font:14px/1.55 system-ui,sans-serif;margin:18px;color:#182230;overflow-wrap:anywhere}img{max-width:100%;height:auto}table{border-collapse:collapse;max-width:100%}td,th{border:1px solid #ccd;padding:6px}pre{white-space:pre-wrap;background:#f3f4f6;padding:10px;border-radius:6px}a{color:#175cd3}.ywtc-layout{display:grid;gap:18px}.ywtc-layout-section{display:grid;grid-template-columns:repeat(var(--columns,1),minmax(0,1fr));gap:18px;align-items:start}.ywtc-layout-columns-2{--columns:2}.ywtc-layout-columns-3{--columns:3}.ywtc-layout-cell{min-width:0}@media(max-width:620px){.ywtc-layout-section{grid-template-columns:1fr}}</style></head><body>${body}</body></html>`;
}

function IssueList({issues, locale, t}: {issues: TransferReportIssue[]; locale: Locale; t: (key: TranslationKey) => string}) {
  if (issues.length === 0) return <Alert><Info className="mr-2 inline size-4" />{t('noIssues')}</Alert>;
  return <div className="space-y-3">{issues.map((issue) => <Alert key={`${issue.code}:${issue.objectId ?? issue.pageId ?? 'run'}`} className={issue.severity === 'error' ? 'border-red-500/30' : issue.severity === 'degradation' ? 'border-amber-500/30' : ''}><div className="flex flex-wrap gap-2"><Badge variant={issue.severity === 'error' ? 'danger' : issue.severity === 'blocked' ? 'blocked' : 'warning'}>{t(issue.severity)}</Badge><Badge variant="outline">{categoryLabels[locale][issue.category]}</Badge><Badge variant="outline">{issue.phase}</Badge>{issue.retryable && <Badge variant="warning">{t('retryable')}</Badge>}{issue.occurrences > 1 && <Badge variant="outline">×{issue.occurrences}</Badge>}</div><p className="mt-3 font-medium">{issue.code}</p><p className="mt-3 text-xs"><strong>{t('action')}:</strong> {issueActionLabel(issue, locale)}</p><Collapsible className="mt-3"><CollapsibleTrigger asChild><Button variant="ghost" size="sm">{t('technical')}</Button></CollapsibleTrigger><CollapsibleContent className="mt-2 rounded-md border border-border/70 bg-muted/30 p-3 text-xs"><dl className="grid gap-1"><div><dt className="inline font-semibold">ID: </dt><dd className="inline break-all">{issue.objectId ?? issue.pageId ?? 'run'}</dd></div>{issue.rootCauseId && <div><dt className="inline font-semibold">Root cause: </dt><dd className="inline break-all">{issue.rootCauseId}</dd></div>}<div><dt className="inline font-semibold">Message: </dt><dd className="inline whitespace-pre-wrap break-words">{issue.message}</dd></div></dl></CollapsibleContent></Collapsible></Alert>)}</div>;
}

function PageDialog({node, payload, locale, t, onOpenChange}: {node?: ReportTreeNode | undefined; payload: ReportPresentationPayload; locale: Locale; t: (key: TranslationKey) => string; onOpenChange: (open: boolean) => void}) {
  const page = node?.page;
  const excluded = node?.excluded;
  const issues = node ? payload.report.issues.filter((issue) => issue.pageId === node.id || issue.blockedByPageId === node.id) : [];
  const preview = node ? payload.previews[node.id] : undefined;
  return (
    <Dialog open={Boolean(node)} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader><div className="flex flex-wrap items-center gap-2"><DialogTitle>{node?.synthetic ? t('unknownPosition') : node?.title}</DialogTitle>{node && <StatusBadge status={node.status} t={t} />}</div><DialogDescription>{node?.id}</DialogDescription></DialogHeader>
        <Tabs defaultValue="overview" className="min-h-0 px-6 pb-6">
          <TabsList className="w-full justify-start overflow-x-auto"><TabsTrigger value="overview">{t('overview')}</TabsTrigger><TabsTrigger value="files">{t('files')}</TabsTrigger><TabsTrigger value="comments">{t('comments')}</TabsTrigger><TabsTrigger value="comparison">{t('comparison')}</TabsTrigger><TabsTrigger value="issues">{t('issues')} ({issues.length})</TabsTrigger></TabsList>
          <ScrollArea className="mt-1 h-[min(68vh,650px)] pr-3">
            <TabsContent value="overview" className="space-y-4">
              <DefinitionGrid items={[
                [t('sourceId'), page?.sourceId ?? excluded?.sourceId],
                [t('destinationId'), page?.destinationId],
                [t('sourceParent'), page?.sourceParentId ?? excluded?.sourceParentId],
                [t('expectedParent'), page?.projectedParentId ?? page?.parentId ?? excluded?.projectedParentId],
                [t('actualParent'), page?.destinationParentId],
                [t('depth'), String(node?.depth ?? 0)],
                [t('inventory'), page ? `${page.links} ${t('links')} · ${page.tables} ${t('tables')} · ${page.grids} ${t('grids')} · ${page.codeBlocks} ${t('codeBlocks')}` : excluded?.reason],
                [t('status'), node ? <StatusBadge key="page-status" status={node.status} t={t} /> : '—'],
              ]} />
              <div className="flex flex-wrap gap-2"><ExternalIcon href={page?.sourceUrl ?? excluded?.sourceUrl} label={t('sourceLink')}><ExternalLink className="size-4" /></ExternalIcon><ExternalIcon href={page?.destinationUrl} label={t('destinationLink')}><ExternalLink className="size-4" /></ExternalIcon></div>
              {excluded && !excluded.metadataComplete && <Alert className="border-amber-500/30"><AlertTriangle className="mr-2 inline size-4" />{t('metadataIncomplete')}</Alert>}
              {page?.error && <Alert className="border-red-500/30"><XCircle className="mr-2 inline size-4" />{page.error}</Alert>}
              {page?.warnings.map((warning) => <Alert key={warning} className="border-amber-500/30">{warning}</Alert>)}
            </TabsContent>
            <TabsContent value="files">
              {!page || page.resourceItems.length === 0 ? <Alert>{t('noFiles')}</Alert> : <Table><TableHeader><TableRow><TableHead>{t('name')}</TableHead><TableHead>{t('kind')}</TableHead><TableHead>{t('size')}</TableHead><TableHead>{t('status')}</TableHead><TableHead>{t('reason')}</TableHead></TableRow></TableHeader><TableBody>{page.resourceItems.map((resource) => <TableRow key={resource.sourceId}><TableCell><div className="flex items-start gap-2">{resource.kind === 'image' ? <FileImage className="mt-0.5 size-4 text-primary" /> : <Paperclip className="mt-0.5 size-4 text-primary" />}<div><p className="font-medium">{resource.sourceName}</p>{resource.destinationName && resource.destinationName !== resource.sourceName && <p className="text-xs text-muted-foreground">→ {resource.destinationName}</p>}<div className="mt-1 flex gap-1"><ExternalIcon href={resource.sourceUrl} label={t('sourceLink')}><ExternalLink className="size-3.5" /></ExternalIcon><ExternalIcon href={resource.destinationUrl} label={t('destinationLink')}><ExternalLink className="size-3.5" /></ExternalIcon></div></div></div></TableCell><TableCell>{resource.kind}</TableCell><TableCell>{resource.sourceBytes === undefined ? '—' : formatBytes(resource.sourceBytes)}{resource.sha256 && <code className="mt-1 block max-w-40 truncate text-xs" title={resource.sha256}>{resource.sha256}</code>}</TableCell><TableCell><StatusBadge status={resource.status} t={t} /></TableCell><TableCell className="max-w-sm text-muted-foreground">{resource.error ?? resource.blockedReason ?? '—'}</TableCell></TableRow>)}</TableBody></Table>}
            </TabsContent>
            <TabsContent value="comments" className="space-y-4">
              {!page || (page.comments.comments === 0 && ['complete', 'skipped'].includes(page.comments.status)) ? <Alert>{t('noComments')}</Alert> : <><DefinitionGrid items={[[t('status'), <StatusBadge key="comment-status" status={page.comments.status} t={t} />], [t('comments'), `${page.comments.threads} ${t('threads')} · ${page.comments.comments} ${t('entries')} · ${page.comments.participants} ${t('participants')}`], [t('archive'), <span key="comment-archive" className="inline-flex items-center gap-2">{page.comments.archiveName ?? '—'}<ExternalIcon href={page.comments.archiveUrl} label={t('archive')}><ExternalLink className="size-3.5" /></ExternalIcon></span>], [t('size'), formatBytes(page.comments.bytes)]]} />{page.comments.error && <Alert className="border-red-500/30">{page.comments.error}</Alert>}{page.comments.items?.length ? <Table><TableHeader><TableRow><TableHead>ID</TableHead><TableHead>{t('participants')}</TableHead><TableHead>{t('status')}</TableHead><TableHead>{t('reason')}</TableHead></TableRow></TableHeader><TableBody>{page.comments.items.map((comment) => <TableRow key={comment.commentId}><TableCell><code>{comment.commentId}</code><p className="text-xs text-muted-foreground">{formatDate(comment.createdAt, locale)}</p><div className="mt-1 flex gap-1"><ExternalIcon href={comment.sourceUrl} label={t('sourceLink')}><ExternalLink className="size-3.5" /></ExternalIcon><ExternalIcon href={comment.destinationUrl} label={t('destinationLink')}><ExternalLink className="size-3.5" /></ExternalIcon></div></TableCell><TableCell>{comment.author}</TableCell><TableCell><StatusBadge status={comment.outcome} t={t} /></TableCell><TableCell>{comment.error ?? comment.sourceStatus ?? '—'}</TableCell></TableRow>)}</TableBody></Table> : null}</>}
            </TabsContent>
            <TabsContent value="comparison">
              {!preview ? <Alert>{t('previewUnavailable')}</Alert> : <div className="grid gap-4 lg:grid-cols-2"><div><h3 className="mb-2 text-sm font-semibold">{t('sourcePreview')}</h3><iframe title={t('sourcePreview')} className="preview-frame" sandbox="" srcDoc={isolatedPreview(preview.source)} /></div><div><h3 className="mb-2 text-sm font-semibold">{t('destinationPreview')}</h3><iframe title={t('destinationPreview')} className="preview-frame" sandbox="" srcDoc={isolatedPreview(preview.destination)} /></div></div>}
            </TabsContent>
            <TabsContent value="issues"><IssueList issues={issues} locale={locale} t={t} /></TabsContent>
          </ScrollArea>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}

function ControlSelect({label, value, values, onChange, t}: {label: string; value: string; values: string[]; onChange: (value: string) => void; t: (key: TranslationKey) => string}) {
  return <Select value={value} onValueChange={onChange}><SelectTrigger aria-label={label} className="min-w-28"><SelectValue /></SelectTrigger><SelectContent>{values.map((item) => <SelectItem key={item} value={item}>{item === 'ru' ? 'Русский' : item === 'en' ? 'English' : t(item as TranslationKey)}</SelectItem>)}</SelectContent></Select>;
}

export function App({payload}: {payload: ReportPresentationPayload}) {
  const storedLocale = guardedStorageGet('ywtc-report-locale');
  const storedTheme = guardedStorageGet('ywtc-report-theme');
  const [locale, setLocale] = useState<Locale>(storedLocale === 'ru' || storedLocale === 'en' ? storedLocale : initialLocale());
  const [theme, setTheme] = useState<Theme>(storedTheme === 'light' || storedTheme === 'dark' || storedTheme === 'system' ? storedTheme : 'system');
  const [selectedId, setSelectedId] = useState<string>();
  const t = useMemo(() => translator(locale), [locale]);
  const tree = useMemo(() => buildReportTree(payload.report), [payload.report]);
  const selectedNode = selectedId ? tree.nodes.get(selectedId) : undefined;
  useEffect(() => {
    document.documentElement.lang = locale;
    document.title = `ywtc · ${t('report')} · ${payload.report.runId}`;
    guardedStorageSet('ywtc-report-locale', locale);
  }, [locale, payload.report.runId, t]);
  useEffect(() => {
    const root = document.documentElement;
    const media = window.matchMedia('(prefers-color-scheme: dark)');
    const apply = () => {
      root.classList.remove('light', 'dark');
      root.classList.add(theme === 'system' ? media.matches ? 'dark' : 'light' : theme);
    };
    apply();
    guardedStorageSet('ywtc-report-theme', theme);
    media.addEventListener?.('change', apply);
    return () => media.removeEventListener?.('change', apply);
  }, [theme]);
  const report = payload.report;
  const accountedPages = report.status === 'running'
    ? report.summary.complete + report.summary.partial + report.summary.failed + report.summary.blocked + report.summary.conflicts
    : report.summary.pages;
  const progress = report.summary.pages === 0 ? 0 : Math.round((accountedPages / report.summary.pages) * 100);
  return (
    <TooltipProvider delayDuration={250}>
      <div className="report-background">
        <main className="mx-auto flex w-full max-w-[1480px] flex-col gap-5 px-4 py-6 sm:px-6 lg:px-8">
          <header className="relative overflow-hidden rounded-2xl border border-border/75 bg-card/80 px-4 pb-5 pt-3 shadow-sm backdrop-blur sm:px-7">
            <div className="flex justify-end gap-2"><div className="flex items-center gap-1 text-xs text-muted-foreground"><Languages className="size-3.5" /><ControlSelect label={t('language')} value={locale} values={['ru', 'en']} onChange={(value) => setLocale(value as Locale)} t={t} /></div><div className="flex items-center gap-1 text-xs text-muted-foreground"><Palette className="size-3.5" /><ControlSelect label={t('theme')} value={theme} values={['system', 'light', 'dark']} onChange={(value) => setTheme(value as Theme)} t={t} /></div></div>
            <img src={reportHeader} className="mx-auto mt-1 block h-auto max-h-56 w-full max-w-5xl object-contain" alt="Yandex Wiki and Confluence sources pass pages, hierarchy, links, tables, images, comments, and attachments through ywtc to Confluence, Yandex Wiki, Markdown, and HTML" />
            <div className="mx-auto mt-2 max-w-4xl text-center"><div className="flex flex-wrap items-center justify-center gap-2"><h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">{t('report')}</h1><StatusBadge status={report.status} t={t} /></div><p className="mt-2 text-sm text-muted-foreground">{report.direction} · {report.source.profile} → {report.destination.profile ?? report.destination.format ?? report.destination.provider} · {report.scope} · {report.sourceStatus} · {report.dryRun ? t('dryRun') : t('live')}</p><div className="mt-3 flex flex-wrap justify-center gap-x-5 gap-y-1 text-xs text-muted-foreground"><span>{t('started')}: <strong className="text-foreground">{formatDate(report.startedAt, locale)}</strong></span><span>{t('finished')}: <strong className="text-foreground">{formatDate(report.finishedAt, locale)}</strong></span><span>{t('runId')}: <code className="text-foreground">{report.runId}</code></span><ExternalIcon href={report.destination.url} label={t('resultLink')}><ExternalLink className="size-4" /></ExternalIcon></div><div className="mx-auto mt-4 max-w-xl"><Progress value={progress} aria-label={`${accountedPages}/${report.summary.pages}`} /><p className="mt-1 text-xs text-muted-foreground">{accountedPages}/{report.summary.pages} {t('pages')} · {progress}%</p></div></div>
          </header>
          <SummaryTable report={report} t={t} />
          <RootCauses report={report} locale={locale} t={t} onOpen={setSelectedId} />
          <Hierarchy report={report} t={t} selectedId={selectedId} onSelect={setSelectedId} />
          <Card><CardHeader><CardTitle>{t('outputs')}</CardTitle></CardHeader><CardContent><div className="grid gap-4 lg:grid-cols-2"><DefinitionGrid items={[[t('state'), <code key="state-path">{report.state.path}</code>], [t('runId'), <code key="run-id">{report.runId}</code>], [t('source'), `${report.source.provider} · ${report.source.profile}`], [t('destination'), `${report.destination.provider}${report.destination.profile ? ` · ${report.destination.profile}` : ''}`]]} /><div className="space-y-2">{report.outputs.map((output) => <div key={`${output.label}:${output.value}`} className="rounded-lg border border-border/70 p-3"><p className="text-xs font-semibold uppercase text-muted-foreground">{output.label}</p><code className="mt-1 block break-all text-xs">{output.value}</code></div>)}<a className={buttonVariants({variant: 'outline'})} href="report.json" download="report.json"><Download className="size-4" />{t('downloadJson')}</a></div></div></CardContent></Card>
          <footer className="pb-4 text-center text-xs text-muted-foreground">{t('footer')}</footer>
        </main>
        <PageDialog node={selectedNode} payload={payload} locale={locale} t={t} onOpenChange={(open) => { if (!open) setSelectedId(undefined); }} />
      </div>
    </TooltipProvider>
  );
}

export function ReportLoadError({message}: {message: string}) {
  return <main className="mx-auto max-w-2xl p-8"><Alert className="border-red-500/30"><FileWarning className="mr-2 inline size-5 text-red-500" /><strong>Report could not be loaded.</strong><p className="mt-2 text-muted-foreground">{message}</p></Alert></main>;
}
