import {createProviderAdapter} from './adapters/factory.js';
import type {AppConfig} from './config.js';
import {assertTransferCapabilities, type TransferScope} from './domain.js';
import {discoverPageGraph} from './graph.js';
import {sameRemoteInstance, type ResolvedLocator, type RemoteLocator} from './locators.js';

export interface DoctorResult {
  source: {profile: string; provider: string; product: string; version?: string; id: string; title: string};
  destination: {profile?: string; provider: string; product: string; version?: string; id: string};
  pages: number;
  links: number;
  warnings: string[];
}

export async function runCapabilityDoctor(
  config: AppConfig,
  sourceLocator: RemoteLocator,
  destinationLocator: ResolvedLocator,
  scope: TransferScope,
): Promise<DoctorResult> {
  const source = createProviderAdapter(sourceLocator.profile, config);
  const destination = destinationLocator.type === 'remote' ? createProviderAdapter(destinationLocator.profile, config) : undefined;
  assertTransferCapabilities(source, destination, scope);
  const [sourcePlatform, destinationPlatform, root, container] = await Promise.all([
    source.preflight(),
    destination?.preflight(),
    source.resolvePage(sourceLocator.value),
    destinationLocator.type === 'remote' && destination ? destination.resolveContainer(destinationLocator.value) : undefined,
  ]);
  const graph = await discoverPageGraph({adapter: source, root, scope});
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
    links: graph.edges.length,
    warnings: [...sourcePlatform.warnings, ...(destinationPlatform?.warnings ?? []), ...graph.warnings],
  };
}
