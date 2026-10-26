import {mkdir, mkdtemp, writeFile} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {describe, expect, it} from 'vitest';
import {parseWorkspaceConfig} from '../src/config.js';
import {decisionIdentityKey, decisionPresentation, parseMentionDecisions} from '../src/mention-decisions.js';
import {loadMentionPolicy} from '../src/mention-policy.js';

const source = {provider: 'yandex-wiki', instance: 'https://wiki.example.com'};
const entry = {identity: {username: 'ivan'}, mention: '@ivan', decision: 'skip'};
const document = (entries: unknown[] = [entry]) => ({source, entries});

describe('strict mention decisions', () => {
  it('accepts an empty explicit mapping', () => expect(parseMentionDecisions(document([])).entries).toEqual([]));
  it('defaults link text without interpreting templates', () => {
    const parsed = parseMentionDecisions(document([{...entry, decision: 'url', url: 'https://people.example.com/{ivan}'}]));
    expect(decisionPresentation({source: '@{ivan}', username: 'IVAN'}, parsed)).toEqual({outcome: 'linked', label: '@ivan', url: 'https://people.example.com/{ivan}', retryable: false});
  });
  it('uses readable source when only an immutable identity exists', () => {
    const parsed = parseMentionDecisions(document([{identity: {accountId: 'abc'}, mention: 'Ivan', decision: 'url', url: 'https://people.example.com/ivan'}]));
    expect(decisionPresentation({source: 'Ivan', accountId: 'abc'}, parsed).label).toBe('Ivan');
  });
  it('preserves missing and skip entries exactly', () => {
    const parsed = parseMentionDecisions(document());
    for (const username of ['ivan', 'maria']) expect(decisionPresentation({source: `@{${username}}`, username}, parsed))
      .toEqual({outcome: 'preserved', label: `@{${username}}`, retryable: false});
  });
  it.each([
    {...entry, url: 'https://example.com'}, {...entry, text: 'Ivan'},
    {...entry, decision: 'native'}, {...entry, identity: {}},
    {...entry, decision: 'url', url: 'javascript:alert(1)'},
    {...entry, decision: 'url', url: 'https://user:secret@example.com'},
    {...entry, decision: 'url', url: 'https://example.com', text: ' '},
    {...entry, unexpected: true},
  ])('rejects invalid or ambiguous entry %#', invalid => expect(() => parseMentionDecisions(document([invalid]))).toThrow(/Invalid mention decisions/));
  it('rejects case-folded duplicate usernames but not distinct immutable IDs', () => {
    expect(() => parseMentionDecisions(document([entry, {...entry, identity: {username: 'IVAN'}}]))).toThrow(/entries.1.identity/);
    expect(parseMentionDecisions(document([
      {...entry, identity: {accountId: 'a', username: 'ivan'}},
      {...entry, identity: {accountId: 'b', username: 'ivan'}},
    ])).entries).toHaveLength(2);
  });
  it('prioritizes immutable identities and never uses display names', () => {
    expect(decisionIdentityKey({accountId: 'A', userKey: 'K', username: 'IVAN', id: '1'})).toBe('accountId:A');
    expect(decisionIdentityKey({userKey: 'K', username: 'IVAN'})).toBe('userKey:K');
    expect(decisionIdentityKey({username: 'IVAN'})).toBe('username:ivan');
    expect(decisionIdentityKey({})).toBeUndefined();
  });
  it('validates optional inventory and occurrence metadata', () => {
    expect(parseMentionDecisions({...document([{...entry, occurrences: [{pageId: '1', pageTitle: 'Page', pageUrl: 'https://wiki.example.com/a', location: 'page', count: 2}]}]), inventory: {
      complete: false, selectedPages: 2, scannedPages: 1, scannedComments: 0,
      issues: [{pageId: '2', phase: 'page', code: 'page-read-failed', message: 'Unavailable', retryable: true}],
    }}).inventory?.complete).toBe(false);
    expect(() => parseMentionDecisions({...document(), schemaVersion: 1})).toThrow(/schemaVersion/);
  });
});

describe('pinned mapping files', () => {
  async function workspace(mappingFile = './mentions/decisions.json') {
    const root = await mkdtemp(path.join(os.tmpdir(), 'ywtc-decision-test-'));
    const config = parseWorkspaceConfig({mentions: {mode: 'mapping', mappingFile}, connections: {wiki: {
      type: 'yandex-wiki', apiUrl: 'https://api.wiki.yandex.net/v1', webUrl: source.instance,
      token: '', organization: {type: 'yandex360', id: '1'},
    }}}, path.join(root, 'ywtc.config.yaml'));
    await mkdir(path.join(root, 'mentions'));
    await writeFile(path.join(root, 'mentions', 'decisions.json'), JSON.stringify(document()));
    return {root, config};
  }
  it('resolves relative paths from config and pins an immutable snapshot', async () => {
    const {root, config} = await workspace();
    const loaded = loadMentionPolicy(config, config.profiles.wiki);
    await writeFile(path.join(root, 'mentions', 'decisions.json'), '{}');
    expect(loaded.mode).toBe('mapping');
    if (loaded.mode === 'mapping') {
      expect(loaded.document.entries).toHaveLength(1);
      expect(Object.isFrozen(loaded.document.entries[0])).toBe(true);
    }
  });
  it('rejects a foreign instance before any provider operation', async () => {
    const {config} = await workspace();
    const profile = config.profiles.wiki!;
    if (profile.type !== 'yandex-wiki') throw new Error('fixture requires Yandex');
    expect(() => loadMentionPolicy(config, {...profile, webUrl: 'https://other.example.com'})).toThrow(/source.instance/);
  });
  it('does not read a file while off', async () => {
    const {config} = await workspace();config.mentions = {mode: 'off'};
    expect(loadMentionPolicy(config)).toEqual({mode: 'off'});
  });
  it('accepts an absolute mapping path independently of process CWD', async () => {
    const {root, config} = await workspace();config.mentions = {mode: 'mapping', mappingFile: path.join(root, 'mentions/decisions.json')};
    expect(loadMentionPolicy(config).mode).toBe('mapping');
  });
});
