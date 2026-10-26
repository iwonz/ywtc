import {describe, expect, it} from 'vitest';
import {normalizePageContent} from '../src/content-model.js';
import type {SourcePage} from '../src/domain.js';
import {protectYfmMentions, renderSafeCommentMentions, scanMentions } from '../src/mentions.js';

describe('shared source-only mention scanner', () => {
  it('shares recognition with page normalization without rendering for export', () => {
    const page: SourcePage = {provider: 'yandex-wiki', profile: 'wiki', id: '1', canonicalId: 'wiki:1', locator: 'a', title: 'A', url: 'https://wiki.example.com/a', references: [], rawFormat: 'yfm', rawContent: 'Hello @ivan and @{иван}'};
    expect(scanMentions(page.rawContent, page.rawFormat).mentions.map(m => m.identity))
      .toEqual(normalizePageContent(page).mentions?.map(m => m.identity));
  });
  it('ignores code, diagrams, URL/email, attributes and escapes', () => {
    const source = 'mail a@example.com https://example.com/@path \\@escape <span title="@attr">@visible</span> <code>@htmlcode</code> `@inline`\n~~~text\n@tilde\n~~~\n````\n@backtick\n````\n{% diagram %}\n@diagram\n{% enddiagram %}\n@real';
    expect(scanMentions(source, 'yfm').mentions.map(m => m.identity.username)).toEqual(['visible', 'real']);
  });
  it('reads native Confluence users without treating plain prose as a native mention', () => {
    const source = '<p>@prose <ac:link><ri:user ri:username="ivan"/></ac:link><ac:link><ri:user ri:account-id="a"/><ac:plain-text-link-body><![CDATA[Ivan]]></ac:plain-text-link-body></ac:link></p>';
    expect(scanMentions(source, 'confluence-storage').mentions.map(m => m.identity)).toEqual([
      {source: '@ivan', username: 'ivan'}, {source: 'Ivan', accountId: 'a', id: 'a', displayName: 'Ivan'},
    ]);
  });
  it('never activates native markup while archiving comments', () => {
    const result = renderSafeCommentMentions('<p><ac:link><ri:user ri:username="ivan"/></ac:link></p>', {mode: 'off'}, 'confluence-storage');
    expect(result.mentions).toHaveLength(1);expect(result.content).not.toContain('ri:user');expect(result.content).toContain('@ivan');
  });
  it('handles megabyte payloads and repeated malformed braces with bounded work', () => {
    const input = `data:image/png;base64,${'A'.repeat(1_100_000)}\n${'@{ '.repeat(10_000)}\n@last`;
    const start = performance.now();const result = protectYfmMentions(input);
    expect(result.mentions.map(m => m.identity.username)).toEqual(['last']);expect(performance.now() - start).toBeLessThan(1_500);
    expect(result.restore(result.content)).toBe(input);
  });
});
