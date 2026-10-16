import {describe, expect, it} from 'vitest';
import {safeLink} from '../report-ui/src/lib.js';

describe('report link safety', () => {
  it('keeps supported canonical report links active', () => {
    expect(safeLink('https://wiki.example.com/root')).toBe('https://wiki.example.com/root');
    expect(safeLink('http://confluence.example.com/pages/10')).toBe('http://confluence.example.com/pages/10');
    expect(safeLink('file:///tmp/export/index.html')).toBe('file:///tmp/export/index.html');
  });

  it('leaves unsafe or absent metadata locators inactive', () => {
    expect(safeLink('javascript:alert(1)')).toBeUndefined();
    expect(safeLink('data:text/html,unsafe')).toBeUndefined();
    expect(safeLink(undefined)).toBeUndefined();
  });
});
