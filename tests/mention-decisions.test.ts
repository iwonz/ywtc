import {describe, expect, it} from 'vitest';
import {parseWorkspaceConfig} from '../src/config.js';

const config = (mentions: unknown) => ({
  mentions,
  connections: {wiki: {
    type: 'yandex-wiki', apiUrl: 'https://api.wiki.yandex.net/v1', webUrl: 'https://wiki.example.com',
    authType: 'oauth', token: '', organization: {type: 'yandex360', id: '1'},
  }},
});

describe('explicit mention decision configuration', () => {
  it('accepts the mapping-file policy without loading its file during config parsing', () => {
    expect(parseWorkspaceConfig(config({mode: 'mapping', mappingFile: './mentions/decisions.json'}), '/tmp/ywtc.config.yaml').mentions)
      .toEqual({mode: 'mapping', mappingFile: './mentions/decisions.json'});
  });
});
