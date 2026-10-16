interface YfmContentSegment {
  type: 'content';
  raw: string;
}

interface YfmLayoutSegment {
  type: 'layout';
  raw: string;
  gap?: string;
  cells: string[];
}

export type YfmDocumentSegment = YfmContentSegment | YfmLayoutSegment;

interface ParsedLayout {
  segment: YfmLayoutSegment;
  endIndex: number;
}

const fencePattern = /^\s*(`{3,}|~{3,})/;
const layoutStartPattern = /^\s*{%\s*layout\b([^%]*?)%}\s*$/i;
const layoutEndPattern = /^\s*{%\s*endlayout\s*%}\s*$/i;
const blockStartPattern = /^\s*{%\s*block\s*%}\s*$/i;
const blockEndPattern = /^\s*{%\s*endblock\s*%}\s*$/i;

function splitLines(value: string): string[] {
  if (!value) return [];
  return value.match(/[^\r\n]*(?:\r\n|\n|\r|$)/g)?.filter(Boolean) ?? [];
}

function lineBody(line: string): string {
  return line.replace(/[\r\n]+$/, '');
}

function fenceMarker(line: string): string | undefined {
  return lineBody(line).match(fencePattern)?.[1];
}

function gapFrom(attributes: string): string | undefined {
  const quoted = attributes.match(/\bgap\s*=\s*["']([^"']+)["']/i)?.[1];
  const bare = attributes.match(/\bgap\s*=\s*([^\s%]+)/i)?.[1];
  const gap = (quoted ?? bare)?.trim().toLocaleLowerCase();
  return gap || undefined;
}

function parseLayout(lines: string[], startIndex: number, attributes: string): ParsedLayout | undefined {
  const cells: string[] = [];
  let current: string[] | undefined;
  let fence: string | undefined;
  for (let index = startIndex + 1; index < lines.length; index += 1) {
    const line = lines[index]!;
    const body = lineBody(line);
    const marker = fenceMarker(line);
    if (marker) {
      if (!fence) fence = marker;
      else if (marker[0] === fence[0] && marker.length >= fence.length) fence = undefined;
      if (current) current.push(line);
      continue;
    }
    if (fence) {
      if (current) current.push(line);
      continue;
    }
    if (blockStartPattern.test(body)) {
      if (current) return undefined;
      current = [];
      continue;
    }
    if (blockEndPattern.test(body)) {
      if (!current) return undefined;
      cells.push(current.join('').replace(/^(?:\r?\n)+|(?:\r?\n)+$/g, ''));
      current = undefined;
      continue;
    }
    if (layoutEndPattern.test(body)) {
      if (current || cells.length === 0) return undefined;
      const raw = lines.slice(startIndex, index + 1).join('');
      const gap = gapFrom(attributes);
      return {
        segment: {
          type: 'layout',
          raw,
          ...(gap ? {gap} : {}),
          cells,
        },
        endIndex: index,
      };
    }
    if (layoutStartPattern.test(body)) return undefined;
    if (current) current.push(line);
    else if (body.trim()) return undefined;
  }
  return undefined;
}

function pushContent(segments: YfmDocumentSegment[], raw: string): void {
  if (!raw) return;
  const previous = segments.at(-1);
  if (previous?.type === 'content') previous.raw += raw;
  else segments.push({type: 'content', raw});
}

/**
 * Extract explicit YFM layout boundaries before Diplodoc discards them.
 * Only balanced line directives outside fenced code are interpreted.
 */
export function parseYfmDocumentSegments(value: string): YfmDocumentSegment[] {
  const lines = splitLines(value);
  if (lines.length === 0) return [{type: 'content', raw: value}];
  const segments: YfmDocumentSegment[] = [];
  let pending: string[] = [];
  let fence: string | undefined;

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index]!;
    const marker = fenceMarker(line);
    if (marker) {
      if (!fence) fence = marker;
      else if (marker[0] === fence[0] && marker.length >= fence.length) fence = undefined;
      pending.push(line);
      continue;
    }
    if (!fence) {
      const start = lineBody(line).match(layoutStartPattern);
      if (start) {
        const parsed = parseLayout(lines, index, start[1] ?? '');
        if (parsed) {
          pushContent(segments, pending.join(''));
          pending = [];
          segments.push(parsed.segment);
          index = parsed.endIndex;
          continue;
        }
      }
    }
    pending.push(line);
  }
  pushContent(segments, pending.join(''));
  return segments.length > 0 ? segments : [{type: 'content', raw: value}];
}

export function hasYfmLayouts(segments: YfmDocumentSegment[]): boolean {
  return segments.some((segment) => segment.type === 'layout');
}
