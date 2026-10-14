import type {AppConfig} from '../config.js';
import type {ConfluenceApi} from '../types.js';
import {CloudConfluenceClient} from './confluence-cloud.js';
import {DataCenterConfluenceClient} from './confluence.js';

export function createConfluenceClient(config: AppConfig): ConfluenceApi {
  return config.confluence.deployment === 'cloud'
    ? new CloudConfluenceClient(config.confluence, config.timeoutMs, config.networkLimits.confluence)
    : new DataCenterConfluenceClient(config.confluence, config.timeoutMs, config.networkLimits.confluence);
}
