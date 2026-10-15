import type {Document} from 'yaml';
import {verifyConnection, type ConnectionVerification, ConnectionVerificationError} from './connection-verifier.js';
import type {
  AppConfig,
  ConfluenceConnectionProfile,
  ConnectionProfile,
  YandexConnectionProfile,
} from './config.js';
import {
  commitInteractiveConfig,
  createInteractiveConfigDocument,
  defaultConfluenceProfile,
  defaultYandexProfile,
  type ExistingInteractiveConfig,
  readExistingInteractiveConfig,
  updateInteractiveProfile,
  validateInteractiveDocument,
} from './interactive-config.js';
import {type InitPrompter, WizardCancelledError} from './init-prompts.js';
import {redact} from './logger.js';
import {resolveInitWorkspace, type Workspace} from './workspace.js';

type SetupMode = 'new' | 'edit' | 'reset';
type Navigation = 'continue' | 'back' | 'cancel';

interface ProfileDraft<T extends ConnectionProfile> {
  profile: T;
  previousName?: string;
}
interface WizardContext {
  workspace: Workspace;
  mode: SetupMode;
  original?: ExistingInteractiveConfig;
  baseDocument: Document;
  baseConfig?: AppConfig;
  yandex?: ProfileDraft<YandexConnectionProfile>;
  confluence?: ProfileDraft<ConfluenceConnectionProfile>;
}
export interface InteractiveInitResult {
  status: 'completed' | 'cancelled' | 'no-op';
  code: 0 | 130;
  workspace?: Workspace;
  configFile?: string;
  backupFile?: string;
  dryRunCommand?: string;
}

export interface InteractiveInitOptions {
  workdir?: string;
  cwd?: string;
  homeDirectory?: string;
  prompter: InitPrompter;
  verify?: typeof verifyConnection;
}

class InteractiveTerminalError extends Error {
  constructor() {
    super('init --interactive requires an interactive TTY. Run "ywtc init" and edit ywtc.config.yaml for non-interactive setup.');
    this.name = 'InteractiveTerminalError';
  }
}
export function assertInteractiveTerminal(inputIsTTY: boolean | undefined, outputIsTTY: boolean | undefined): void {
  if (!inputIsTTY || !outputIsTTY) throw new InteractiveTerminalError();
}

function required(value: string): string | undefined {
  return value.trim() ? undefined : 'Value is required.';
}

function profileName(value: string): string | undefined {
  return /^[a-z0-9][a-z0-9._-]*$/.test(value.trim())
    ? undefined
    : 'Use lowercase letters, digits, dots, underscores, or dashes; start with a letter or digit.';
}

function httpUrl(value: string): string | undefined {
  try {
    const url = new URL(value.trim());
    return ['http:', 'https:'].includes(url.protocol) ? undefined : 'Use an absolute HTTP(S) URL.';
  } catch {
    return 'Use an absolute HTTP(S) URL.';
  }
}

function email(value: string): string | undefined {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim()) ? undefined : 'Enter a valid email address.';
}

function withoutTrailingSlash(value: string): string {
  return value.trim().replace(/\/+$/, '');
}

function availableName(base: string, used: Set<string>): string {
  if (!used.has(base)) return base;
  for (let suffix = 2; ; suffix += 1) {
    const candidate = `${base}-${suffix}`;
    if (!used.has(candidate)) return candidate;
  }
}

function usedProfileNames(context: WizardContext, excluding: string[] = []): Set<string> {
  const names = new Set(Object.keys(context.baseConfig?.profiles ?? {}));
  for (const name of excluding) names.delete(name);
  if (!excluding.includes(context.yandex?.profile.name ?? '')) names.add(context.yandex?.profile.name ?? '');
  if (!excluding.includes(context.confluence?.profile.name ?? '')) names.add(context.confluence?.profile.name ?? '');
  names.delete('');
  return names;
}

function uniqueProfileName(context: WizardContext, ...excluding: Array<string | undefined>) {
  return (value: string): string | undefined => {
    const syntax = profileName(value);
    if (syntax) return syntax;
    if (usedProfileNames(context, excluding.filter((item): item is string => Boolean(item))).has(value.trim())) return 'Another connection already uses this name.';
    return undefined;
  };
}

async function navigation(prompter: InitPrompter, id: string, canBack = true): Promise<Navigation> {
  return prompter.select({
    id,
    message: 'Next step',
    options: [
      {value: 'continue', label: 'Continue'},
      ...(canBack ? [{value: 'back' as const, label: 'Back'}] : []),
      {value: 'cancel', label: 'Cancel'},
    ],
    initialValue: 'continue',
  });
}

async function selectExistingProfile<T extends ConnectionProfile>(input: {
  context: WizardContext;
  prompter: InitPrompter;
  type: T['type'];
  current?: ProfileDraft<T>;
  id: string;
  label: string;
}): Promise<ProfileDraft<T> | null | undefined> {
  if (input.context.mode !== 'edit') return input.current;
  const profiles = Object.values(input.context.baseConfig?.profiles ?? {}).filter((profile) => profile.type === input.type) as T[];
  const currentIsUnsaved = input.current !== undefined
    && input.current.previousName === undefined
    && !profiles.some((profile) => profile.name === input.current?.profile.name);
  const choices = [
    ...profiles.map((profile) => ({value: profile.name, label: profile.name, hint: 'existing'})),
    ...(currentIsUnsaved ? [{value: '__draft__', label: input.current!.profile.name, hint: 'current draft'}] : []),
    {value: '__new__', label: `Add ${input.label} connection`, hint: 'new profile'},
  ];
  const selected = await input.prompter.select({
    id: input.id,
    message: `${input.label} profile to configure`,
    options: choices,
    initialValue: input.current?.previousName ?? (currentIsUnsaved ? '__draft__' : input.current?.profile.name) ?? profiles[0]?.name ?? '__new__',
  });
  if (selected === '__new__') {
    return null;
  }
  if (selected === '__draft__'
    || selected === input.current?.previousName
    || selected === input.current?.profile.name) {
    return input.current;
  }
  const profile = input.context.baseConfig?.profiles[selected];
  return profile?.type === input.type ? {profile: profile as T, previousName: selected} : undefined;
}

async function yandexStep(context: WizardContext, prompter: InitPrompter): Promise<Navigation> {
  prompter.info('Step 2 of 4 · Yandex Wiki');
  const selected = await selectExistingProfile<YandexConnectionProfile>({
    context, prompter, type: 'yandex-wiki', ...(context.yandex ? {current: context.yandex} : {}), id: 'yandex.profile', label: 'Yandex Wiki',
  });
  const draft = selected === null
    ? defaultYandexProfile(availableName('yandex', usedProfileNames(context, [context.yandex?.profile.name ?? ''])))
    : selected?.profile ?? context.yandex?.profile ?? defaultYandexProfile(availableName('yandex', usedProfileNames(context)));
  const previousName = selected?.previousName;
  const name = (await prompter.text({
    id: 'yandex.name', message: 'Yandex Wiki profile name', initialValue: draft.name,
    validate: uniqueProfileName(context, previousName, context.yandex?.profile.name),
  })).trim();
  const apiUrl = withoutTrailingSlash(await prompter.text({
    id: 'yandex.apiUrl', message: 'Yandex Wiki API URL', initialValue: draft.apiUrl, validate: httpUrl,
  }));
  const webUrl = withoutTrailingSlash(await prompter.text({
    id: 'yandex.webUrl', message: 'Yandex Wiki web URL', initialValue: draft.webUrl, validate: httpUrl,
  }));
  const authType = await prompter.select({
    id: 'yandex.authType', message: 'Yandex authentication', initialValue: draft.authType,
    options: [
      {value: 'oauth', label: 'OAuth', hint: 'Yandex 360 or Identity Hub'},
      {value: 'iam', label: 'IAM token', hint: 'Yandex Cloud only'},
    ],
  });
  const organizationType = authType === 'iam'
    ? 'cloud'
    : await prompter.select({
      id: 'yandex.organization.type', message: 'Yandex organization type', initialValue: draft.organization.type,
      options: [
        {value: 'yandex360', label: 'Yandex 360'},
        {value: 'cloud', label: 'Yandex Cloud / Identity Hub'},
      ],
    });
  if (authType === 'iam') prompter.info('IAM uses the Yandex Cloud organization header.');
  const organizationId = (await prompter.text({
    id: 'yandex.organization.id', message: 'Yandex organization ID', initialValue: draft.organization.id, validate: required,
  })).trim();
  const enteredToken = await prompter.password({
    id: 'yandex.token',
    message: draft.token ? 'Yandex token (leave empty to keep the configured token)' : 'Yandex token',
    validate: (value) => draft.token || value.trim() ? undefined : 'Token is required.',
  });
  context.yandex = {
    ...(previousName ? {previousName} : {}),
    profile: {
      ...draft,
      name,
      apiUrl,
      webUrl,
      authType,
      token: enteredToken.trim() || draft.token,
      organization: {type: organizationType, id: organizationId},
    },
  };
  return navigation(prompter, 'yandex.navigation');
}

async function confluenceStep(context: WizardContext, prompter: InitPrompter): Promise<Navigation> {
  prompter.info('Step 3 of 4 · Confluence');
  const selected = await selectExistingProfile<ConfluenceConnectionProfile>({
    context, prompter, type: 'confluence', ...(context.confluence ? {current: context.confluence} : {}), id: 'confluence.profile', label: 'Confluence',
  });
  const draft = selected === null
    ? defaultConfluenceProfile(availableName('confluence', usedProfileNames(context, [context.confluence?.profile.name ?? ''])))
    : selected?.profile ?? context.confluence?.profile ?? defaultConfluenceProfile(availableName('confluence', usedProfileNames(context)));
  const previousName = selected?.previousName;
  const name = (await prompter.text({
    id: 'confluence.name', message: 'Confluence profile name', initialValue: draft.name,
    validate: uniqueProfileName(context, previousName, context.confluence?.profile.name),
  })).trim();
  const deployment = await prompter.select({
    id: 'confluence.deployment', message: 'Confluence deployment', initialValue: draft.deployment,
    options: [
      {value: 'data-center', label: 'Data Center', hint: 'PAT authentication'},
      {value: 'cloud', label: 'Cloud', hint: 'email and Atlassian API token'},
    ],
  });
  const baseUrl = withoutTrailingSlash(await prompter.text({
    id: 'confluence.baseUrl',
    message: 'Confluence base URL',
    initialValue: draft.baseUrl,
    placeholder: deployment === 'cloud' ? 'https://example.atlassian.net' : 'https://confluence.example.com/confluence',
    validate: (value) => required(value) ?? httpUrl(value),
  }));
  const cloudEmail = deployment === 'cloud'
    ? (await prompter.text({
      id: 'confluence.email', message: 'Atlassian account email', initialValue: draft.email ?? '', validate: email,
    })).trim()
    : undefined;
  const enteredToken = await prompter.password({
    id: 'confluence.token',
    message: draft.token
      ? `Confluence ${deployment === 'cloud' ? 'API token' : 'PAT'} (leave empty to keep the configured token)`
      : `Confluence ${deployment === 'cloud' ? 'API token' : 'PAT'}`,
    validate: (value) => draft.token || value.trim() ? undefined : 'Token is required.',
  });
  context.confluence = {
    ...(previousName ? {previousName} : {}),
    profile: {
      ...draft,
      name,
      deployment,
      baseUrl,
      authType: deployment === 'cloud' ? 'api-token' : 'pat',
      token: enteredToken.trim() || draft.token,
      ...(cloudEmail !== undefined ? {email: cloudEmail} : {}),
    },
  };
  if (deployment === 'data-center') delete context.confluence!.profile.email;
  return navigation(prompter, 'confluence.navigation');
}

function buildDocument(context: WizardContext): Document {
  if (!context.yandex || !context.confluence) throw new Error('Both connection stages must be complete.');
  const document = context.baseDocument.clone();
  updateInteractiveProfile(document, context.yandex.previousName, context.yandex.profile);
  updateInteractiveProfile(document, context.confluence.previousName, context.confluence.profile);
  return document;
}

function selectedProfiles(config: AppConfig, context: WizardContext): [YandexConnectionProfile, ConfluenceConnectionProfile] {
  const yandex = config.profiles[context.yandex!.profile.name];
  const confluence = config.profiles[context.confluence!.profile.name];
  if (yandex?.type !== 'yandex-wiki' || confluence?.type !== 'confluence') {
    throw new Error('Configured connection profiles could not be resolved.');
  }
  return [yandex, confluence];
}

function review(context: WizardContext): string {
  const yandex = context.yandex!.profile;
  const confluence = context.confluence!.profile;
  return [
    `Workdir: ${context.workspace.root}`,
    `Yandex Wiki: ${yandex.name} · ${yandex.authType} · ${yandex.organization.type} · ${yandex.webUrl}`,
    `Confluence: ${confluence.name} · ${confluence.deployment} · ${confluence.baseUrl}`,
    'Credentials: configured and hidden',
  ].join('\n');
}

function firstDryRun(context: WizardContext): string {
  const workdir = JSON.stringify(context.workspace.root);
  const sourceProfile = JSON.stringify(context.yandex!.profile.name);
  const destinationProfile = JSON.stringify(context.confluence!.profile.name);
  return `ywtc migrate --source "<yandex-page-url-or-slug>" --source-profile ${sourceProfile} --destination "<confluence-page-url-or-id>" --destination-profile ${destinationProfile} --scope subtree --dry-run --workdir ${workdir}`;
}

async function workspaceStep(
  options: InteractiveInitOptions,
  prior: WizardContext | undefined,
): Promise<WizardContext | InteractiveInitResult> {
  const {prompter} = options;
  prompter.info('Step 1 of 4 · Workspace');
  let initialPath = prior?.workspace.root ?? options.workdir ?? '~/.ywtc';
  while (true) {
    const selectedPath = (await prompter.text({
      id: 'workspace.path', message: 'Working directory', initialValue: initialPath, validate: required,
    })).trim();
    let workspace: Workspace;
    try {
      workspace = resolveInitWorkspace({
        explicit: selectedPath,
        ...(options.cwd ? {cwd: options.cwd} : {}),
        ...(options.homeDirectory ? {homeDirectory: options.homeDirectory} : {}),
      });
    } catch (error) {
      prompter.error(error instanceof Error ? error.message : String(error));
      initialPath = selectedPath;
      continue;
    }
    const original = await readExistingInteractiveConfig(workspace);
    if (!original) {
      const same = prior?.workspace.root === workspace.root && prior.mode === 'new';
      return same ? prior : {workspace, mode: 'new', baseDocument: createInteractiveConfigDocument()};
    }

    if (original.error) prompter.error(`Existing configuration is invalid: ${original.error}`);
    const action = await prompter.select({
      id: 'workspace.action',
      message: `Workspace already exists at ${workspace.root}`,
      options: [
        ...(!original.error ? [{value: 'edit' as const, label: 'Change connection settings', hint: 'preserve other profiles and state'}] : []),
        {value: 'reset', label: 'Configure from scratch', hint: 'backup config; preserve .states'},
        {value: 'change', label: 'Choose another directory'},
        {value: 'exit', label: 'Do nothing and exit'},
      ],
      initialValue: original.error ? 'reset' : 'edit',
    });
    if (action === 'exit') {
      prompter.outro('Workspace left unchanged.');
      return {status: 'no-op', code: 0, workspace};
    }
    if (action === 'change') {
      initialPath = workspace.root;
      continue;
    }
    const same = prior?.workspace.root === workspace.root && prior.mode === action
      && prior.original?.fingerprint === original.fingerprint;
    if (same) return prior;
    if (action === 'edit' && original.document && original.config) {
      return {
        workspace,
        mode: 'edit',
        original,
        baseDocument: original.document.clone(),
        baseConfig: original.config,
      };
    }
    return {workspace, mode: 'reset', original, baseDocument: createInteractiveConfigDocument()};
  }
}

async function verifyAndCommit(
  context: WizardContext,
  prompter: InitPrompter,
  verify: typeof verifyConnection,
): Promise<InteractiveInitResult | 0 | 1 | 2> {
  prompter.info('Step 4 of 4 · Review and verify');
  prompter.note(review(context), 'Configuration summary');
  const action = await prompter.select({
    id: 'review.action',
    message: 'Review action',
    options: [
      {value: 'save', label: 'Verify connections and save'},
      {value: 'yandex', label: 'Back to Yandex Wiki'},
      {value: 'confluence', label: 'Back to Confluence'},
      {value: 'workspace', label: 'Back to workspace'},
      {value: 'cancel', label: 'Cancel'},
    ],
    initialValue: 'save',
  });
  if (action === 'workspace') return 0;
  if (action === 'yandex') return 1;
  if (action === 'confluence') return 2;
  if (action === 'cancel') throw new WizardCancelledError();

  const document = buildDocument(context);
  const config = validateInteractiveDocument(document, context.workspace.configFile);
  const [yandex, confluence] = selectedProfiles(config, context);
  while (true) {
    try {
      await prompter.task('Checking Yandex Wiki API and credentials', () => verify(config, yandex), verifiedLabel);
      await prompter.task('Checking Confluence API and credentials', () => verify(config, confluence), verifiedLabel);
      break;
    } catch (error) {
      const safe = redact(error, [yandex.token, confluence.token, confluence.email ?? '']);
      prompter.error(safe);
      const failureAction = await prompter.select({
        id: 'verification.failure',
        message: 'Connection verification failed',
        options: [
          {value: 'retry', label: 'Retry'},
          {value: 'yandex', label: 'Edit Yandex Wiki'},
          {value: 'confluence', label: 'Edit Confluence'},
          {value: 'workspace', label: 'Back to workspace'},
          {value: 'cancel', label: 'Cancel'},
        ],
        initialValue: error instanceof ConnectionVerificationError && error.provider === 'confluence' ? 'confluence' : 'yandex',
      });
      if (failureAction === 'retry') continue;
      if (failureAction === 'workspace') return 0;
      if (failureAction === 'yandex') return 1;
      if (failureAction === 'confluence') return 2;
      throw new WizardCancelledError();
    }
  }

  const committed = await prompter.task(
    'Saving verified workspace configuration',
    () => commitInteractiveConfig({
      workspace: context.workspace,
      document,
      ...(context.original ? {original: context.original} : {}),
      reset: context.mode === 'reset',
    }),
    () => 'Workspace configuration saved',
  );
  const dryRunCommand = firstDryRun(context);
  prompter.success(`Config: ${committed.configFile}`);
  if (committed.backupFile) prompter.info(`Backup: ${committed.backupFile}`);
  prompter.note(dryRunCommand, 'First migration dry-run');
  prompter.info('Connection checks passed. Page-specific read/write access is checked by doctor or migrate.');
  prompter.outro('ywtc workspace is ready.');
  return {
    status: 'completed',
    code: 0,
    workspace: context.workspace,
    configFile: committed.configFile,
    ...(committed.backupFile ? {backupFile: committed.backupFile} : {}),
    dryRunCommand,
  };
}

function verifiedLabel(value: ConnectionVerification): string {
  return `${value.product}${value.version ? ` ${value.version}` : ''} authenticated`;
}

export async function runInteractiveInit(options: InteractiveInitOptions): Promise<InteractiveInitResult> {
  const {prompter} = options;
  prompter.intro('ywtc interactive setup');
  let context: WizardContext | undefined;
  let step = 0;
  try {
    while (true) {
      if (step === 0) {
        const result = await workspaceStep(options, context);
        if ('status' in result) return result;
        context = result;
        step = 1;
        continue;
      }
      if (!context) throw new Error('Workspace step did not complete.');
      if (step === 1) {
        const next = await yandexStep(context, prompter);
        if (next === 'cancel') throw new WizardCancelledError();
        step = next === 'back' ? 0 : 2;
        continue;
      }
      if (step === 2) {
        const next = await confluenceStep(context, prompter);
        if (next === 'cancel') throw new WizardCancelledError();
        step = next === 'back' ? 1 : 3;
        continue;
      }
      const result = await verifyAndCommit(context, prompter, options.verify ?? verifyConnection);
      if (typeof result !== 'number') return result;
      step = result;
    }
  } catch (error) {
    if (!(error instanceof WizardCancelledError)) throw error;
    prompter.cancel('Interactive setup cancelled; no configuration was changed.');
    return {status: 'cancelled', code: 130, ...(context ? {workspace: context.workspace} : {})};
  }
}
