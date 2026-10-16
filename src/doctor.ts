import {createProviderAdapter} from './adapters/factory.js';
import type {AppConfig} from './config.js';
import {assertTransferCapabilities, type SourceStatus, type TransferScope} from './domain.js';
import {discoverPageGraph} from './graph.js';
import {sameRemoteInstance, type ResolvedLocator, type RemoteLocator} from './locators.js';

export interface DoctorResult {
  source: {profile: string; provider: string; product: string; version?: string; id: string; title: string};
  destination: {profile?: string; provider: string; product: string; version?: string; id: string};
  pages: number;
  returnedDescendants: number;
  selectedDescendants: number;
  excludedPages: number;
  maximumDepth: number;
  sourceStatus: SourceStatus;
  links: number;
  warnings: string[];
  comments: {enabled: boolean; readable: boolean; threads: number; entries: number; destinationWrite: 'supported' | 'unproven' | 'skipped'};
}

export async function runCapabilityDoctor(
  config: AppConfig,
  sourceLocator: RemoteLocator,
  destinationLocator: ResolvedLocator,
  scope: TransferScope,
  sourceStatus: SourceStatus = 'all',
  comments = true,
): Promise<DoctorResult> {
  const source = createProviderAdapter(sourceLocator.profile, config);
  const destination = destinationLocator.type === 'remote' ? createProviderAdapter(destinationLocator.profile, config) : undefined;
  assertTransferCapabilities(source, destination, scope, sourceStatus, comments);
  const [sourcePlatform, destinationPlatform] = await Promise.all([
    source.preflight(),
    destination?.preflight(),
  ]);
  const [root, container] = await Promise.all([
    source.resolvePage(sourceLocator.value),
    destinationLocator.type === 'remote' && destination ? destination.resolveContainer(destinationLocator.value) : undefined,
  ]);
  const graph = await discoverPageGraph({adapter: source, root, scope, sourceStatus});
  const commentInventory = comments && source.readComments ? await source.readComments(root) : undefined;
  const commentWarnings = [...(commentInventory?.warnings ?? [])];
  const destinationCommentWrite = !comments || destinationLocator.type === 'directory'
    ? 'skipped' as const
    : destination?.capabilities.writeComments
      ? 'supported' as const
      : 'unproven' as const;
  if (destinationCommentWrite === 'unproven') {
    commentWarnings.push(`${destination?.profile.name ?? 'Destination'} comment write access cannot be proven read-only; migrate will preserve the page and report a partial result if writing is denied.`);
  }
  if (
    container
    && destinationLocator.type === 'remote'
    && sameRemoteInstance(sourceLocator.profile, destinationLocator.profile)
    && graph.pages.some((page) => page.id === container.id)
  ) {
    throw new Error('The destination belongs to the selected source graph. Choose a destination outside that graph.');
  }
  return {
    source: {
      profile: source.profile.name,
      provider: source.kind,
      product: sourcePlatform.product,
      ...(sourcePlatform.version ? {version: sourcePlatform.version} : {}),
      id: root.id,
      title: root.title,
    },
    destination: destinationLocator.type === 'directory'
      ? {provider: 'filesystem', product: `${destinationLocator.format} export`, id: destinationLocator.path}
      : {
        profile: destination!.profile.name,
        provider: destination!.kind,
        product: destinationPlatform?.product ?? destination!.kind,
        ...(destinationPlatform?.version ? {version: destinationPlatform.version} : {}),
        id: container!.id,
      },
    pages: graph.pages.length,
    returnedDescendants: graph.selection.returnedDescendants,
    selectedDescendants: graph.selection.selectedDescendants,
    excludedPages: graph.selection.excluded.length,
    maximumDepth: graph.selection.maximumDepth,
    sourceStatus: graph.selection.effectiveStatus,
    links: graph.edges.length,
    warnings: [...sourcePlatform.warnings, ...(destinationPlatform?.warnings ?? []), ...graph.warnings, ...commentWarnings],
    comments: {
      enabled: comments,
      readable: !comments || Boolean(commentInventory),
      threads: commentInventory?.threads.length ?? 0,
      entries: commentInventory?.comments ?? 0,
      destinationWrite: destinationCommentWrite,
    },
  };
}
