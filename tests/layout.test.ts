import {describe, expect, it} from 'vitest';
import {hasYfmLayouts, parseYfmDocumentSegments} from '../src/layout.js';

describe('YFM layout scanner', () => {
  it('preserves adjacent content, gap, cells, and multiple layouts in order', () => {
    const source = [
      'Before',
      '',
      '{% layout gap=l %}',
      '',
      '{% block %}',
      '',
      'Left',
      '',
      '{% endblock %}',
      '',
      '{% block %}',
      '',
      'Right',
      '',
      '{% endblock %}',
      '',
      '{% endlayout %}',
      '',
      'After',
      '',
      '{% layout %}',
      '{% block %}',
      'Only',
      '{% endblock %}',
      '{% endlayout %}',
    ].join('\n');
    const segments = parseYfmDocumentSegments(source);
    expect(segments.map((segment) => segment.type)).toEqual(['content', 'layout', 'content', 'layout']);
    expect(segments[1]).toMatchObject({type: 'layout', gap: 'l', cells: ['Left', 'Right']});
    expect(segments[3]).toMatchObject({type: 'layout', cells: ['Only']});
    expect(hasYfmLayouts(segments)).toBe(true);
  });

  it('does not interpret directives inside fenced code or malformed layouts', () => {
    const fenced = ['```yfm', '{% layout %}', '{% block %}', 'Example', '{% endblock %}', '{% endlayout %}', '```'].join('\n');
    expect(parseYfmDocumentSegments(fenced)).toEqual([{type: 'content', raw: fenced}]);
    const malformed = '{% layout %}\nContent without a block\n{% endlayout %}';
    expect(parseYfmDocumentSegments(malformed)).toEqual([{type: 'content', raw: malformed}]);
  });
});
