import {describe, expect, it} from 'vitest';
import {BOUNDED_YFM_DIAGNOSTIC, MAX_YFM_LEXICAL_TOKEN_CHARS, prepareYfmInput, transformYfm} from '../src/diplodoc.js';

describe('bounded Diplodoc input', () => {
  it('leaves ordinary YFM unchanged', () => {
    const content = '# Heading\n\nText with https://example.com and `code`.';
    expect(prepareYfmInput(content)).toEqual({content, diagnostics: [], boundedTokens: 0});
  });

  it('replaces oversized inline and lexical payloads without exposing them in diagnostics', () => {
    const secretPayload = `data:image/png;base64,${'A'.repeat(MAX_YFM_LEXICAL_TOKEN_CHARS)}`;
    const lexicalPayload = `x${'B'.repeat(MAX_YFM_LEXICAL_TOKEN_CHARS)}`;
    const prepared = prepareYfmInput(`Before ${secretPayload} middle ${lexicalPayload} after`);

    expect(prepared.boundedTokens).toBe(2);
    expect(prepared.content).toContain('Before [Oversized inline data payload');
    expect(prepared.content).toContain('middle [Oversized lexical payload');
    expect(prepared.content).toContain('after');
    expect(prepared.content).not.toContain(secretPayload);
    expect(prepared.content).not.toContain(lexicalPayload);
    expect(prepared.diagnostics).toHaveLength(2);
    expect(prepared.diagnostics.every((message) => message.startsWith(BOUNDED_YFM_DIAGNOSTIC))).toBe(true);
    expect(prepared.diagnostics.join(' ')).not.toContain('AAAA');
    expect(prepared.diagnostics.join(' ')).not.toContain('BBBB');
  });

  it('passes the bounded marker to Diplodoc and returns a stable warning', () => {
    const payload = `data:image/png;base64,${'A'.repeat(MAX_YFM_LEXICAL_TOKEN_CHARS)}`;
    const output = transformYfm(`# Before\n\n${payload}\n\nAfter`, {linkify: false});

    expect(output.result.html).toContain('Before');
    expect(output.result.html).toContain('Oversized inline data payload');
    expect(output.result.html).toContain('After');
    expect(output.logs.warn).toContainEqual(expect.stringContaining(BOUNDED_YFM_DIAGNOSTIC));
  });
});
