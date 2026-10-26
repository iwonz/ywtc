import {describe, expect, it} from 'vitest';
import {filterDecisions, serializeDecisions} from '../mentions-ui/src/model.js';
import {parseMentionDecisions} from '../src/mention-decisions.js';
import {embedMentionDocument} from '../src/mention-export.js';

const document = () => parseMentionDecisions({source: {provider: 'yandex-wiki', instance: 'https://wiki.example'}, entries: [
  {identity: {username: 'ivan'}, mention: '@ivan', decision: 'skip'},
  {identity: {username: 'maria'}, mention: '@maria', decision: 'url', url: 'https://people.example/maria'},
]});
describe('mention editor data boundaries', () => {
  it('filters identities and decisions without reordering or hiding their original positions', () => {
    expect(filterDecisions(document().entries, 'MARIA', 'url').map(item => item.index)).toEqual([1]);
    expect(filterDecisions(document().entries, '', 'skip').map(item => item.index)).toEqual([0]);
  });
  it('saves strict JSON accepted by the migrator and rejects invalid links with row evidence', () => {
    const doc = document();expect(parseMentionDecisions(JSON.parse(serializeDecisions(doc)))).toEqual(doc);
    const entry = doc.entries[1]!;if (entry.decision === 'url') entry.url = 'javascript:alert(1)';
    expect(() => serializeDecisions(doc)).toThrow(/username:maria/);
  });
  it('escapes hostile embedded JSON and literal replacement-string tokens', () => {
    const doc = document();doc.entries[0]!.mention = '</script><script>alert(1)</script>$&';
    const html = embedMentionDocument('<script type="application/json">{"__ywtc_mentions_payload__":true}</script>', doc);
    expect(html.match(/<script/g)).toHaveLength(1);expect(JSON.parse(html.slice(html.indexOf('>') + 1, html.lastIndexOf('</script>'))).entries[0].mention).toBe(doc.entries[0]!.mention);
    expect(() => embedMentionDocument('missing', doc)).toThrow(/exactly one/);
  });
});
