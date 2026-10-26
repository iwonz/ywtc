import {createProviderAdapter} from './adapters/factory.js';
import type {CliCommand} from './cli-arguments.js';
import {readWorkspaceConfig, secretValues, validateProfileSecrets} from './config.js';
import {resolveSourceLocator} from './locators.js';
import {redact} from './logger.js';
import {collectHashtagDecisions, writeHashtagBundle} from './hashtag-export.js';
import {collectMentionDecisions, withMentionOutput, writeMentionBundle} from './mention-export.js';
import {resolveWorkspace, workspaceIsInitialized} from './workspace.js';

export async function runMentionExportCommand(command: Extract<CliCommand, {command: 'mentions-export' | 'hashtags-export'}>): Promise<number> {
  const workspace = await resolveWorkspace(command.workdir ? {explicit: command.workdir} : {});
  if (!await workspaceIsInitialized(workspace)) throw new Error('Workspace is not initialized; run ywtc init first.');
  const config = readWorkspaceConfig(workspace.configFile);
  // Deliberately do not load the configured mapping: export creates the input for that mapping.
  const source = resolveSourceLocator(config, command.source, command.sourceProfile);
  validateProfileSecrets(config, [source.profile]);
  const secrets = secretValues(config), controller = new AbortController();
  let signalCode: number | undefined;
  const interrupt = () => {signalCode = 130;controller.abort(new Error('Interrupted by SIGINT'));};
  const terminate = () => {signalCode = 143;controller.abort(new Error('Interrupted by SIGTERM'));};
  process.once('SIGINT', interrupt);process.once('SIGTERM', terminate);
  try {
    return await withMentionOutput(command.output, async output => {
      const adapter = createProviderAdapter(source.profile, config);
      const collect = command.command === 'hashtags-export' ? collectHashtagDecisions : collectMentionDecisions;
      const document = await collect({adapter, locator: source.value, scope: command.scope, sourceStatus: command.sourceStatus, comments: command.comments, concurrency: command.concurrency ?? config.concurrency,
        signal: controller.signal, secrets, onProgress: message => console.log(`  ${redact(message, secrets)}`),
      });
      const paths = command.command === 'hashtags-export'
        ? await writeHashtagBundle(output, document as Awaited<ReturnType<typeof collectHashtagDecisions>>)
        : await writeMentionBundle(output, document as Awaited<ReturnType<typeof collectMentionDecisions>>);
      console.log(`\n◆ ${command.command === 'hashtags-export' ? 'Hashtag' : 'Mention'} decisions exported\n  ${command.command === 'hashtags-export' ? 'Tags      ' : 'Identities'}  ${document.entries.length}\n  Inventory   ${document.inventory?.complete ? 'complete' : 'incomplete'}\n  JSON        ${paths.json}\n  Editor      ${paths.html}\n  URL         ${paths.url}`);
      for (const issue of document.inventory?.issues ?? []) console.error(`  ${issue.code}${issue.pageId ? ` [${issue.pageId}]` : ''}: ${issue.message}`);
      return signalCode ?? (document.inventory?.complete ? 0 : 1);
    });
  } finally {process.removeListener('SIGINT', interrupt);process.removeListener('SIGTERM', terminate);}
}
