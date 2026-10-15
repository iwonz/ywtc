import {createConfluenceClient} from '../clients/confluence-factory.js';
import {YandexWikiClient} from '../clients/yandex-wiki.js';
import type {AppConfig, ConnectionProfile} from '../config.js';
import type {DestinationAdapter, SourceAdapter} from '../domain.js';
import {ConfluenceAdapter} from './confluence.js';
import {YandexAdapter} from './yandex.js';

export function createProviderAdapter(profile: ConnectionProfile, config: AppConfig): SourceAdapter & DestinationAdapter {
  if (profile.type === 'yandex-wiki') {
    return new YandexAdapter(profile, new YandexWikiClient(profile, config.timeoutMs, profile.limits));
  }
  return new ConfluenceAdapter(profile, createConfluenceClient(profile, config.timeoutMs));
}
