import path from 'node:path';
import type {AppConfig, ConnectionProfile} from './config.js';
import {readWorkspaceConfig} from './config.js';
import type {ExportFormat, ProviderKind, TransferScope} from './domain.js';
import {safeFilename} from './input.js';
import {runInteractiveInit} from './interactive-init.js';
import type {
  MigrationCommandOutcome,
  ParsedMigrationCommand,
  ReadyMigrationCommand,
} from './migration-command.js';
import {runMigrationCommand} from './migration-command.js';
import {openReportFile} from './report-catalog.js';
import type {TransferReportSummary} from './report.js';
import {type WizardPrompter, WizardCancelledError} from './wizard-prompts.js';
import {resolveWorkspace, type Workspace, workspaceIsInitialized} from './workspace.js';

type RemoteDestinationKind = 'yandex-wiki' | 'confluence';
type DestinationKind = RemoteDestinationKind | ExportFormat;
type Navigation = 'continue' | 'back' | 'cancel';
type ReviewAction = 'dry-run' | 'live' | 'edit' | 'exit';

interface MigrationDraft {
  workspace?: Workspace;
  config?: AppConfig;
  sourceProvider: ProviderKind;
  sourceProfile?: string;
  source: string;
  destinationKind: DestinationKind;
  destinationProfile?: string;
  destination: string;
  scope: TransferScope;
  sourceStatus: ParsedMigrationCommand['sourceStatus'];
  comments: boolean;
  archive: boolean;
}

export interface InteractiveMigrationOptions {
  command: ParsedMigrationCommand;
  prompter: WizardPrompter;
  cwd?: string;
  homeDirectory?: string;
  execute?: (command: ReadyMigrationCommand) => Promise<MigrationCommandOutcome>;
  initialize?: (workdir: string, prompter: WizardPrompter) => Promise<{code: number; status: string}>;
  openReport?: (filename: string) => Promise<unknown>;
}

export interface InteractiveMigrationResult {
  status: 'completed' | 'cancelled' | 'exited';
  code: number;
  command?: ReadyMigrationCommand;
  outcome?: MigrationCommandOutcome;
}

function required(value: string): string | undefined {
  return value.trim() ? undefined : 'Value is required.';
}

function exportDirectory(value: string): string | undefined {
  return required(value) ?? (/^https?:\/\//i.test(value.trim()) ? 'Use a filesystem directory, not an HTTP(S) URL.' : undefined);
}

function navigation(prompter: WizardPrompter, id: string): Promise<Navigation> {
  return prompter.select({
    id,
    message: 'Next step',
    options: [
      {value: 'continue', label: 'Continue'},
      {value: 'back', label: 'Back'},
      {value: 'cancel', label: 'Cancel'},
    ],
    initialValue: 'continue',
  });
}

function profileBase(profile: ConnectionProfile): string {
  return profile.type === 'yandex-wiki' ? profile.webUrl : profile.baseUrl;
}

function matchesUrl(locator: string, profile: ConnectionProfile): boolean {
  try {
    const candidate = new URL(locator);
    const base = new URL(profileBase(profile));
    const basePath = base.pathname.replace(/\/+$/, '');
    return candidate.origin === base.origin
      && (!basePath || candidate.pathname === basePath || candidate.pathname.startsWith(`${basePath}/`));
  } catch {
    return false;
  }
}

function profilesFor(config: AppConfig, provider: ProviderKind): ConnectionProfile[] {
  return Object.values(config.profiles)
    .filter((profile) => profile.type === provider)
    .sort((left, right) => left.name.localeCompare(right.name));
}

function suggestedProfile(
  config: AppConfig,
  provider: ProviderKind,
  locator: string,
  requested: string | undefined,
): string | undefined {
  const profiles = profilesFor(config, provider);
  if (requested && profiles.some((profile) => profile.name === requested)) return requested;
  const matches = profiles
    .filter((profile) => matchesUrl(locator, profile))
    .sort((left, right) => profileBase(right).length - profileBase(left).length);
  if (matches.length > 0) return matches[0]!.name;
  return profiles[0]?.name;
}

function inferredProvider(
  config: AppConfig,
  locator: string,
  requestedProfile: string | undefined,
  fallback: ProviderKind,
): ProviderKind {
  const requested = requestedProfile ? config.profiles[requestedProfile] : undefined;
  if (requested) return requested.type;
  const matches = Object.values(config.profiles)
    .filter((profile) => matchesUrl(locator, profile))
    .sort((left, right) => profileBase(right).length - profileBase(left).length);
  return matches[0]?.type ?? fallback;
}

function safeSourceName(locator: string): string {
  let value = locator.trim();
  try {
    const url = new URL(value);
    value = decodeURIComponent(url.pathname).replace(/\/+$/, '').split('/').pop() ?? '';
  } catch {
    value = value.replace(/\/+$/, '').split('/').pop() ?? value;
  }
  return safeFilename(value || 'export').replace(/\.[^.]+$/, '').slice(0, 80) || 'export';
}

function defaultExportPath(source: string): string {
  return path.join('.', 'exports', safeSourceName(source));
}

async function defaultInitialize(workdir: string, prompter: WizardPrompter): Promise<{code: number; status: string}> {
  return runInteractiveInit({workdir, prompter});
}

async function loadWorkspace(
  options: InteractiveMigrationOptions,
  explicit: string,
): Promise<{workspace: Workspace; config?: AppConfig; error?: string}> {
  const workspace = await resolveWorkspace({
    explicit,
    ...(options.cwd ? {cwd: options.cwd} : {}),
    ...(options.homeDirectory ? {homeDirectory: options.homeDirectory} : {}),
  });
  if (!await workspaceIsInitialized(workspace)) return {workspace, error: `Missing ${workspace.configFile}`};
  try {
    return {workspace, config: readWorkspaceConfig(workspace.configFile)};
  } catch (error) {
    return {workspace, error: error instanceof Error ? error.message : String(error)};
  }
}

async function workspaceStep(options: InteractiveMigrationOptions, draft: MigrationDraft): Promise<'continue' | 'exit'> {
  const {prompter} = options;
  prompter.info('Step 1 of 6 · Workspace');
  const initialWorkspace = draft.workspace ?? await resolveWorkspace({
    ...(options.command.workdir ? {explicit: options.command.workdir} : {}),
    ...(options.cwd ? {cwd: options.cwd} : {}),
    ...(options.homeDirectory ? {homeDirectory: options.homeDirectory} : {}),
  });
  let initialPath = initialWorkspace.root;
  while (true) {
    const selected = (await prompter.text({
      id: 'migration.workspace.path',
      message: 'Working directory',
      initialValue: initialPath,
      validate: required,
    })).trim();
    const loaded = await loadWorkspace(options, selected);
    if (loaded.config) {
      draft.workspace = loaded.workspace;
      draft.config = loaded.config;
      draft.sourceProvider = inferredProvider(
        loaded.config,
        draft.source,
        draft.sourceProfile ?? options.command.sourceProfile,
        draft.sourceProvider,
      );
      if (!draft.destinationKind || ['yandex-wiki', 'confluence'].includes(draft.destinationKind)) {
        draft.destinationKind = inferredProvider(
          loaded.config,
          draft.destination,
          draft.destinationProfile ?? options.command.destinationProfile,
          draft.destinationKind === 'yandex-wiki' ? 'yandex-wiki' : 'confluence',
        );
      }
      return 'continue';
    }
    prompter.error(loaded.error ?? 'Workspace configuration is unavailable.');
    const action = await prompter.select({
      id: 'migration.workspace.unavailable',
      message: 'Workspace is not ready',
      options: [
        {value: 'configure', label: 'Configure this workspace', hint: 'open the initialization wizard'},
        {value: 'change', label: 'Choose another directory'},
        {value: 'exit', label: 'Exit without changes'},
      ],
      initialValue: 'configure',
    });
    if (action === 'exit') return 'exit';
    if (action === 'change') {
      initialPath = loaded.workspace.root;
      continue;
    }
    const initialized = await (options.initialize ?? defaultInitialize)(loaded.workspace.root, prompter);
    if (initialized.code === 130 || initialized.status === 'cancelled') throw new WizardCancelledError();
    const reloaded = await loadWorkspace(options, loaded.workspace.root);
    if (reloaded.config) {
      draft.workspace = reloaded.workspace;
      draft.config = reloaded.config;
      draft.sourceProvider = inferredProvider(
        reloaded.config,
        draft.source,
        draft.sourceProfile ?? options.command.sourceProfile,
        draft.sourceProvider,
      );
      if (draft.destinationKind === 'yandex-wiki' || draft.destinationKind === 'confluence') {
        draft.destinationKind = inferredProvider(
          reloaded.config,
          draft.destination,
          draft.destinationProfile ?? options.command.destinationProfile,
          draft.destinationKind,
        );
      }
      return 'continue';
    }
    prompter.error(reloaded.error ?? 'Workspace is still not ready.');
    initialPath = loaded.workspace.root;
  }
}

async function sourceStep(draft: MigrationDraft, prompter: WizardPrompter): Promise<Navigation> {
  if (!draft.config) throw new Error('Workspace configuration must be loaded before source selection.');
  prompter.info('Step 2 of 6 · Source');
  while (true) {
    const provider = await prompter.select<ProviderKind>({
      id: 'migration.source.provider',
      message: 'Source provider',
      options: [
        {value: 'yandex-wiki', label: 'Yandex Wiki'},
        {value: 'confluence', label: 'Confluence'},
      ],
      initialValue: draft.sourceProvider,
    });
    const available = profilesFor(draft.config, provider);
    if (available.length === 0) {
      prompter.error(`No ${provider} connection exists in ${draft.config.configFile}.`);
      continue;
    }
    const locator = (await prompter.text({
      id: 'migration.source.locator',
      message: 'Source page URL, ID, or slug',
      initialValue: draft.source,
      validate: required,
    })).trim();
    const initialProfile = suggestedProfile(draft.config, provider, locator, draft.sourceProfile);
    const profile = await prompter.select({
      id: 'migration.source.profile',
      message: 'Source connection',
      options: available.map((item) => ({value: item.name, label: item.name, hint: profileBase(item)})),
      ...(initialProfile ? {initialValue: initialProfile} : {}),
    });
    const selected = draft.config.profiles[profile];
    if (!selected || selected.type !== provider) {
      prompter.error('Selected source connection is not compatible with the provider.');
      continue;
    }
    if (/^https?:\/\//i.test(locator) && !matchesUrl(locator, selected)) {
      prompter.error(`Source URL does not belong to ${profileBase(selected)}.`);
      continue;
    }
    draft.sourceProvider = provider;
    draft.source = locator;
    draft.sourceProfile = profile;
    return navigation(prompter, 'migration.source.navigation');
  }
}

async function destinationStep(draft: MigrationDraft, prompter: WizardPrompter): Promise<Navigation> {
  if (!draft.config) throw new Error('Workspace configuration must be loaded before destination selection.');
  prompter.info('Step 3 of 6 · Destination');
  while (true) {
    const kind = await prompter.select<DestinationKind>({
      id: 'migration.destination.kind',
      message: 'Destination',
      options: [
        {value: 'yandex-wiki', label: 'Yandex Wiki'},
        {value: 'confluence', label: 'Confluence'},
        {value: 'markdown', label: 'Markdown directory'},
        {value: 'html', label: 'Static HTML directory'},
      ],
      initialValue: draft.destinationKind,
    });
    if (kind === 'markdown' || kind === 'html') {
      const initialDirectory = !draft.destination || /^https?:\/\//i.test(draft.destination)
        ? defaultExportPath(draft.source)
        : draft.destination;
      const directory = (await prompter.text({
        id: 'migration.destination.directory',
        message: `${kind === 'html' ? 'HTML' : 'Markdown'} output directory`,
        initialValue: initialDirectory,
        validate: exportDirectory,
      })).trim();
      draft.destinationKind = kind;
      draft.destination = directory;
      delete draft.destinationProfile;
      return navigation(prompter, 'migration.destination.navigation');
    }
    const available = profilesFor(draft.config, kind);
    if (available.length === 0) {
      prompter.error(`No ${kind} connection exists in ${draft.config.configFile}.`);
      continue;
    }
    const locator = (await prompter.text({
      id: 'migration.destination.locator',
      message: 'Destination parent page URL, ID, or slug',
      initialValue: draft.destination,
      validate: required,
    })).trim();
    const initialProfile = suggestedProfile(draft.config, kind, locator, draft.destinationProfile);
    const profile = await prompter.select({
      id: 'migration.destination.profile',
      message: 'Destination connection',
      options: available.map((item) => ({value: item.name, label: item.name, hint: profileBase(item)})),
      ...(initialProfile ? {initialValue: initialProfile} : {}),
    });
    const selected = draft.config.profiles[profile];
    if (!selected || selected.type !== kind) {
      prompter.error('Selected destination connection is not compatible with the provider.');
      continue;
    }
    if (/^https?:\/\//i.test(locator) && !matchesUrl(locator, selected)) {
      prompter.error(`Destination URL does not belong to ${profileBase(selected)}.`);
      continue;
    }
    draft.destinationKind = kind;
    draft.destination = locator;
    draft.destinationProfile = profile;
    draft.archive = false;
    return navigation(prompter, 'migration.destination.navigation');
  }
}

async function scopeStep(draft: MigrationDraft, prompter: WizardPrompter): Promise<Navigation> {
  prompter.info('Step 4 of 6 · Scope');
  draft.scope = await prompter.select({
    id: 'migration.scope',
    message: 'Pages to transfer',
    options: [
      {value: 'page', label: 'Current page only'},
      {value: 'subtree', label: 'Page and all descendants'},
      {value: 'linked', label: 'Page and all reachable internal links'},
    ],
    initialValue: draft.scope,
  });
  return navigation(prompter, 'migration.scope.navigation');
}

async function commentsStep(draft: MigrationDraft, prompter: WizardPrompter): Promise<Navigation> {
  prompter.info('Step 5 of 6 · Comments');
  const comments = await prompter.select({
    id: 'migration.comments',
    message: 'Archive page comments',
    options: [
      {value: 'yes', label: 'Transfer comments'},
      {value: 'no', label: 'Skip comments'},
    ],
    initialValue: draft.comments ? 'yes' : 'no',
  });
  draft.comments = comments === 'yes';
  return navigation(prompter, 'migration.comments.navigation');
}

async function archiveStep(draft: MigrationDraft, prompter: WizardPrompter): Promise<Navigation> {
  prompter.info('Step 6 of 6 · Archive');
  const archive = await prompter.select({
    id: 'migration.archive',
    message: 'Also create a ZIP archive',
    options: [
      {value: 'no', label: 'Do not create ZIP'},
      {value: 'yes', label: 'Create ZIP next to the export directory'},
    ],
    initialValue: draft.archive ? 'yes' : 'no',
  });
  draft.archive = archive === 'yes';
  return navigation(prompter, 'migration.archive.navigation');
}

function draftSummary(draft: MigrationDraft): string {
  const destination = draft.destinationKind === 'markdown' || draft.destinationKind === 'html'
    ? `${draft.destinationKind.toUpperCase()} · ${draft.destination}`
    : `${draft.destinationKind} · ${draft.destinationProfile} · ${draft.destination}`;
  return [
    `Workspace: ${draft.workspace?.root ?? 'not selected'}`,
    `Source: ${draft.sourceProvider} · ${draft.sourceProfile} · ${draft.source}`,
    `Destination: ${destination}`,
    `Scope: ${draft.scope} · source status ${draft.sourceStatus}`,
    `Comments: ${draft.comments ? 'enabled' : 'disabled'}`,
    ...(draft.destinationKind === 'markdown' || draft.destinationKind === 'html'
      ? [`ZIP archive: ${draft.archive ? 'enabled' : 'disabled'}`]
      : []),
  ].join('\n');
}

function readyCommand(draft: MigrationDraft, input: ParsedMigrationCommand, dryRun: boolean): ReadyMigrationCommand {
  if (!draft.workspace || !draft.config) throw new Error('Workspace is not ready.');
  if (!draft.source || !draft.destination || !draft.sourceProfile) throw new Error('Source and destination are required.');
  const fileDestination = draft.destinationKind === 'markdown' || draft.destinationKind === 'html';
  if (!fileDestination && !draft.destinationProfile) throw new Error('Remote destination profile is required.');
  const common = {
    command: 'migrate',
    source: draft.source,
    destination: draft.destination,
    sourceProfile: draft.sourceProfile,
    scope: draft.scope,
    sourceStatus: draft.sourceStatus,
    comments: draft.comments,
    archive: fileDestination && draft.archive,
    workdir: draft.workspace.root,
    dryRun,
    fresh: input.fresh,
    ...(input.rewrite ? {rewrite: true} : {}),
    openReport: input.openReport,
    ...(input.concurrency !== undefined ? {concurrency: input.concurrency} : {}),
    ...(input.stateFilename ? {stateFilename: input.stateFilename} : {}),
  } as const;
  if (fileDestination) return {...common, format: draft.destinationKind as ExportFormat};
  return {...common, destinationProfile: draft.destinationProfile!};
}

export function liveAllowedAfterDryRun(summary: TransferReportSummary): boolean {
  return summary.inventoryComplete
    && summary.rootErrors === 0
    && summary.failed === 0
    && summary.blocked === 0
    && summary.conflicts === 0;
}

async function reviewAction(draft: MigrationDraft, prompter: WizardPrompter): Promise<ReviewAction> {
  prompter.note(draftSummary(draft), 'Migration summary');
  return prompter.select({
    id: 'migration.review.action',
    message: 'What should ywtc do?',
    options: [
      {value: 'dry-run', label: 'Run dry-run first', hint: 'read-only discovery and report'},
      {value: 'live', label: 'Run transfer now'},
      {value: 'edit', label: 'Edit parameters'},
      {value: 'exit', label: 'Exit without running'},
    ],
    initialValue: 'dry-run',
  });
}

async function editStep(prompter: WizardPrompter, draft: MigrationDraft): Promise<number> {
  const section = await prompter.select({
    id: 'migration.edit.section',
    message: 'Parameter group to edit',
    options: [
      {value: 'workspace', label: 'Workspace'},
      {value: 'source', label: 'Source'},
      {value: 'destination', label: 'Destination'},
      {value: 'scope', label: 'Scope'},
      {value: 'comments', label: 'Comments'},
      ...((draft.destinationKind === 'markdown' || draft.destinationKind === 'html')
        ? [{value: 'archive' as const, label: 'Archive'}]
        : []),
      {value: 'review', label: 'Back to summary'},
      {value: 'cancel', label: 'Cancel'},
    ],
    initialValue: 'source',
  });
  if (section === 'cancel') throw new WizardCancelledError();
  return {workspace: 0, source: 1, destination: 2, scope: 3, comments: 4, archive: 5, review: 6}[section];
}

function initialDraft(command: ParsedMigrationCommand): MigrationDraft {
  const format = command.format;
  return {
    sourceProvider: 'yandex-wiki',
    ...(command.sourceProfile ? {sourceProfile: command.sourceProfile} : {}),
    source: command.source ?? '',
    destinationKind: format ?? 'confluence',
    ...(command.destinationProfile ? {destinationProfile: command.destinationProfile} : {}),
    destination: command.destination ?? '',
    scope: command.scope,
    sourceStatus: command.sourceStatus,
    comments: command.comments,
    archive: command.archive,
  };
}

export async function runInteractiveMigration(options: InteractiveMigrationOptions): Promise<InteractiveMigrationResult> {
  const {prompter} = options;
  const execute = options.execute ?? runMigrationCommand;
  const openReport = options.openReport ?? openReportFile;
  const draft = initialDraft(options.command);
  let step = 0;
  let lastCode = 0;
  let lastOutcome: MigrationCommandOutcome | undefined;
  let lastCommand: ReadyMigrationCommand | undefined;
  prompter.intro('ywtc interactive migration');
  try {
    while (true) {
      if (step === 0) {
        if (await workspaceStep(options, draft) === 'exit') {
          prompter.outro('Migration was not started.');
          return {status: 'exited', code: lastCode, ...(lastCommand ? {command: lastCommand} : {}), ...(lastOutcome ? {outcome: lastOutcome} : {})};
        }
        step = 1;
        continue;
      }
      if (step === 1) {
        const next = await sourceStep(draft, prompter);
        if (next === 'cancel') throw new WizardCancelledError();
        step = next === 'back' ? 0 : 2;
        continue;
      }
      if (step === 2) {
        const next = await destinationStep(draft, prompter);
        if (next === 'cancel') throw new WizardCancelledError();
        step = next === 'back' ? 1 : 3;
        continue;
      }
      if (step === 3) {
        const next = await scopeStep(draft, prompter);
        if (next === 'cancel') throw new WizardCancelledError();
        step = next === 'back' ? 2 : 4;
        continue;
      }
      if (step === 4) {
        const next = await commentsStep(draft, prompter);
        if (next === 'cancel') throw new WizardCancelledError();
        step = next === 'back' ? 3 : (draft.destinationKind === 'markdown' || draft.destinationKind === 'html' ? 5 : 6);
        continue;
      }
      if (step === 5) {
        const next = await archiveStep(draft, prompter);
        if (next === 'cancel') throw new WizardCancelledError();
        step = next === 'back' ? 4 : 6;
        continue;
      }

      const action = await reviewAction(draft, prompter);
      if (action === 'exit') {
        prompter.outro(lastOutcome ? 'Migration wizard finished.' : 'Migration was not started.');
        return {status: 'exited', code: lastCode, ...(lastCommand ? {command: lastCommand} : {}), ...(lastOutcome ? {outcome: lastOutcome} : {})};
      }
      if (action === 'edit') {
        step = await editStep(prompter, draft);
        continue;
      }
      if (action === 'live') {
        lastCommand = readyCommand(draft, options.command, false);
        try {
          lastOutcome = await execute(lastCommand);
          lastCode = lastOutcome.code;
          prompter.outro(lastCode === 0 ? 'Migration completed.' : 'Migration finished with issues.');
          return {status: 'completed', code: lastCode, command: lastCommand, outcome: lastOutcome};
        } catch (error) {
          prompter.error(error instanceof Error ? error.message : String(error));
          prompter.outro('Migration failed. Review the printed report or diagnostic, then rerun the wizard.');
          return {status: 'completed', code: 2, command: lastCommand};
        }
      }

      while (true) {
        lastCommand = readyCommand(draft, options.command, true);
        try {
          lastOutcome = await execute(lastCommand);
          lastCode = lastOutcome.code;
        } catch (error) {
          lastCode = 2;
          prompter.error(error instanceof Error ? error.message : String(error));
          const failureAction = await prompter.select({
            id: 'migration.dry-run.failure',
            message: 'Dry-run could not complete',
            options: [
              {value: 'edit', label: 'Edit parameters'},
              {value: 'repeat', label: 'Repeat dry-run'},
              {value: 'exit', label: 'Exit'},
            ],
            initialValue: 'edit',
          });
          if (failureAction === 'repeat') continue;
          if (failureAction === 'edit') {
            step = await editStep(prompter, draft);
            break;
          }
          prompter.outro('Dry-run failed; migration was not started.');
          return {status: 'exited', code: lastCode, command: lastCommand};
        }
        if (lastOutcome.code === 130 || lastOutcome.code === 143) {
          return {status: 'completed', code: lastOutcome.code, command: lastCommand, outcome: lastOutcome};
        }
        const allowLive = Boolean(lastOutcome.result && liveAllowedAfterDryRun(lastOutcome.result.summary));
        const next = await prompter.select({
          id: 'migration.after-dry-run',
          message: allowLive ? 'Dry-run finished. What next?' : 'Dry-run found blocking issues. What next?',
          options: [
            ...(lastOutcome.reportPaths ? [{value: 'report' as const, label: 'Open HTML report'}] : []),
            ...(allowLive ? [{value: 'live' as const, label: 'Run live transfer'}] : []),
            {value: 'edit', label: 'Edit parameters'},
            {value: 'repeat', label: 'Repeat dry-run'},
            {value: 'exit', label: 'Finish'},
          ],
          initialValue: allowLive ? 'live' : (lastOutcome.reportPaths ? 'report' : 'edit'),
        });
        if (next === 'report' && lastOutcome.reportPaths) {
          try {
            await openReport(lastOutcome.reportPaths.html);
            prompter.success(`Opened ${lastOutcome.reportPaths.html}`);
          } catch (error) {
            prompter.error(error instanceof Error ? error.message : String(error));
          }
          continue;
        }
        if (next === 'repeat') continue;
        if (next === 'edit') {
          step = await editStep(prompter, draft);
          break;
        }
        if (next === 'live') {
          lastCommand = readyCommand(draft, options.command, false);
          try {
            lastOutcome = await execute(lastCommand);
            lastCode = lastOutcome.code;
            prompter.outro(lastCode === 0 ? 'Migration completed.' : 'Migration finished with issues.');
            return {status: 'completed', code: lastCode, command: lastCommand, outcome: lastOutcome};
          } catch (error) {
            prompter.error(error instanceof Error ? error.message : String(error));
            prompter.outro('Migration failed. Review the printed report or diagnostic, then rerun the wizard.');
            return {status: 'completed', code: 2, command: lastCommand};
          }
        }
        prompter.outro('Migration wizard finished after dry-run.');
        return {status: 'completed', code: lastCode, command: lastCommand, outcome: lastOutcome};
      }
    }
  } catch (error) {
    if (!(error instanceof WizardCancelledError)) throw error;
    prompter.cancel('Interactive migration cancelled; no new operation was started.');
    return {status: 'cancelled', code: 130, ...(lastCommand ? {command: lastCommand} : {}), ...(lastOutcome ? {outcome: lastOutcome} : {})};
  }
}
