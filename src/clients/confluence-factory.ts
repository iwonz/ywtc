import type {ConfluenceConnectionProfile} from '../config.js';
import type {ConfluenceApi} from '../types.js';
import {CloudConfluenceClient} from './confluence-cloud.js';
import {DataCenterConfluenceClient} from './confluence.js';

export function createConfluenceClient(profile: ConfluenceConnectionProfile, timeoutMs: number): ConfluenceApi {
  return profile.deployment === 'cloud'
    ? new CloudConfluenceClient(profile, timeoutMs, profile.limits)
    : new DataCenterConfluenceClient(profile, timeoutMs, profile.limits);
}
