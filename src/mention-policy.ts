import {readFileSync} from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {type AppConfig, ConfigurationError, type ConnectionProfile} from './config.js';
import type {MentionProcessingPolicy} from './domain.js';
import {profileBaseUrl} from './locators.js';
import {canonicalMentionInstance, parseMentionDecisions} from './mention-decisions.js';

function freeze<T>(value: T): T {
  if (value && typeof value === 'object') { for (const child of Object.values(value)) freeze(child); Object.freeze(value); }
  return value;
}

export function loadMentionPolicy(config: AppConfig, source?: ConnectionProfile): MentionProcessingPolicy {
  const policy = config.mentions ?? {mode: 'off'};
  if (policy.mode === 'off') return {mode: 'off'};
  const expanded = policy.mappingFile === '~' ? os.homedir() : policy.mappingFile.startsWith('~/') ? path.join(os.homedir(), policy.mappingFile.slice(2)) : policy.mappingFile;
  const filename = path.resolve(path.dirname(config.configFile), expanded);
  let value: unknown;
  try { value = JSON.parse(readFileSync(filename, 'utf8')); }
  catch { throw new ConfigurationError([`mentions.mappingFile (${filename}: unreadable or invalid JSON)`], config.configFile); }
  let document: ReturnType<typeof parseMentionDecisions>;
  try { document = parseMentionDecisions(value); }
  catch (error) { throw new ConfigurationError([`mentions.mappingFile (${filename}: ${(error as Error).message})`], config.configFile); }
  if (source && (document.source.provider !== source.type || document.source.instance !== canonicalMentionInstance(profileBaseUrl(source)))) {
    throw new ConfigurationError([`mentions.mappingFile (${filename}: source.provider/source.instance mismatch)`], config.configFile);
  }
  return freeze({mode: 'mapping', document});
}
