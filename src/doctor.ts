import {createConfluenceClient} from './clients/confluence-factory.js';
import {YandexWikiClient} from './clients/yandex-wiki.js';
import type {AppConfig} from './config.js';
import {parseWikiSource} from './input.js';

export interface DoctorResult {
  deployment: string;
  platform?: string;
  version?: string;
  source?: {id: number; slug: string; title: string};
  target?: {id: string; title: string; spaceKey: string};
  warnings: string[];
}

export async function runCapabilityDoctor(config: AppConfig, source: string, target: string): Promise<DoctorResult> {
  const yandex = new YandexWikiClient(config.yandex, config.timeoutMs, config.networkLimits.yandex);
  const confluence = createConfluenceClient(config);
  const sourceSlug = parseWikiSource(source, config.yandex.webUrl);
  const [page, platform] = await Promise.all([
    yandex.getPageBySlug(sourceSlug),
    confluence.preflight?.(),
  ]);
  const targetPage = await confluence.resolveTarget(target);
  return {
    deployment: config.confluence.deployment,
    ...(platform ? {platform: platform.product, ...(platform.version ? {version: platform.version} : {})} : {}),
    source: {id: page.id, slug: page.slug, title: page.title},
    target: {id: targetPage.id, title: targetPage.title, spaceKey: targetPage.space.key},
    warnings: [],
  };
}
