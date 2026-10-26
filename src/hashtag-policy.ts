import {readFileSync} from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {type AppConfig, ConfigurationError, type ConnectionProfile} from './config.js';
import {profileBaseUrl} from './locators.js';
import {canonicalMentionInstance} from './mention-decisions.js';
import {type HashtagProcessingPolicy, parseHashtagDecisions} from './hashtag-decisions.js';

function freeze<T>(value: T): T {if (value && typeof value === 'object') {for (const child of Object.values(value)) freeze(child);Object.freeze(value);}return value;}
export function loadHashtagPolicy(config: AppConfig, source?: ConnectionProfile): HashtagProcessingPolicy {
  const policy = config.hashtags ?? {mode: 'off'};
  if (policy.mode === 'off') return {mode: 'off'};
  const expanded = policy.mappingFile === '~' ? os.homedir() : policy.mappingFile.startsWith('~/') ? path.join(os.homedir(), policy.mappingFile.slice(2)) : policy.mappingFile;
  const filename = path.resolve(path.dirname(config.configFile), expanded);
  try {
    const document = parseHashtagDecisions(JSON.parse(readFileSync(filename, 'utf8')));
    if (source && (document.source.provider !== source.type || document.source.instance !== canonicalMentionInstance(profileBaseUrl(source)))) throw new Error('source.provider/source.instance mismatch');
    return freeze({mode: 'mapping', document});
  } catch (error) {throw new ConfigurationError([`hashtags.mappingFile (${filename}: ${(error as Error).message})`], config.configFile);}
}
