import {createHash, randomUUID} from 'node:crypto';
import {createWriteStream} from 'node:fs';
import {mkdir, rename, rm} from 'node:fs/promises';
import path from 'node:path';
import {Readable} from 'node:stream';
import {pipeline} from 'node:stream/promises';
import type {DiagramKind, NormalizedDiagram, SourcePage, SourceResource, TransformationNotice} from './domain.js';

const BASE64_CHUNK_CHARS = 64 * 1024;
const MARKER_PREFIX = 'YWTC_DIAGRAM_';

interface DiagramOccurrence {
  start: number;
  end: number;
  kind: DiagramKind;
  sourceText?: string;
  data?: {
    mediaType: string;
    payloadStart: number;
    payloadEnd: number;
    sha256?: string;
    size?: number;
    previewSafe?: boolean;
    error?: string;
  };
  width?: string;
  height?: string;
}

export interface DiagramDiscovery {
  preparedContent: string;
  diagrams: NormalizedDiagram[];
  resources: SourceResource[];
  diagnostics: TransformationNotice[];
}

export function diagramKindForFilename(filename: string, mimeType?: string): DiagramKind | undefined {
  const lower = filename.toLocaleLowerCase();
  if (/\.(?:drawio|dio)(?:\.xml)?$/u.test(lower) || mimeType === 'application/vnd.jgraph.mxfile') return 'drawio';
  if (/\.(?:mmd|mermaid)$/u.test(lower)) return 'mermaid';
  if (/\.(?:puml|plantuml|pu)$/u.test(lower)) return 'plantuml';
  if (/\.d2$/u.test(lower)) return 'd2';
  return undefined;
}

function sha256(value: string | Buffer): string {
  return createHash('sha256').update(value).digest('hex');
}

function directiveEnd(content: string, start: number): number | undefined {
  let quote: '"' | "'" | undefined;
  for (let index = start; index < content.length - 1; index += 1) {
    const character = content[index]!;
    if (quote) {
      if (character === quote && content[index - 1] !== '\\') quote = undefined;
      continue;
    }
    if (character === '"' || character === "'") {
      quote = character;
      continue;
    }
    if (character === '%' && content[index + 1] === '}') return index + 2;
  }
  return undefined;
}

interface AttributeBounds {
  start: number;
  end: number;
}

function attributeBounds(content: string, start: number, end: number, requested: string): AttributeBounds | undefined {
  let index = start;
  while (index < end) {
    while (index < end && /\s/.test(content[index]!)) index += 1;
    const nameStart = index;
    while (index < end && /[a-z0-9_-]/i.test(content[index]!)) index += 1;
    const name = content.slice(nameStart, index).toLocaleLowerCase();
    const nameEnd = index;
    while (index < end && /\s/.test(content[index]!)) index += 1;
    if (content[index] !== '=') {
      index = Math.max(nameEnd, nameStart + 1);
      continue;
    }
    index += 1;
    while (index < end && /\s/.test(content[index]!)) index += 1;
    const quote = content[index];
    if (quote !== '"' && quote !== "'") {
      const valueStart = index;
      while (index < end && !/\s/.test(content[index]!) && content.slice(index, index + 2) !== '%}') index += 1;
      if (name === requested) return {start: valueStart, end: index};
      continue;
    }
    index += 1;
    const valueStart = index;
    while (index < end && content[index] !== quote) index += 1;
    if (name === requested) return {start: valueStart, end: index};
    index += 1;
  }
  return undefined;
}

function attributeValue(content: string, start: number, end: number, requested: string, maximumLength = 256): string | undefined {
  const bounds = attributeBounds(content, start, end, requested);
  if (!bounds || bounds.end - bounds.start > maximumLength) return undefined;
  return content.slice(bounds.start, bounds.end);
}

function validBase64Character(character: string): boolean {
  const code = character.charCodeAt(0);
  return (code >= 65 && code <= 90)
    || (code >= 97 && code <= 122)
    || (code >= 48 && code <= 57)
    || character === '+'
    || character === '/'
    || character === '=';
}

function digestBase64(content: string, start: number, end: number): {sha256: string; size: number; previewSafe: boolean} {
  const length = end - start;
  if (length === 0 || length % 4 !== 0) throw new Error('base64 payload length is invalid');
  let paddingStarted = false;
  for (let index = start; index < end; index += 1) {
    const character = content[index]!;
    if (!validBase64Character(character)) throw new Error(`base64 payload contains an invalid character at offset ${index - start}`);
    if (character === '=') paddingStarted = true;
    else if (paddingStarted) throw new Error('base64 payload has non-padding data after padding');
  }
  const hash = createHash('sha256');
  let size = 0;
  let previewSafe = true;
  let safetyTail = '';
  for (let cursor = start; cursor < end; cursor += BASE64_CHUNK_CHARS) {
    const remaining = end - cursor;
    const chunkLength = remaining > BASE64_CHUNK_CHARS ? BASE64_CHUNK_CHARS : remaining;
    const decoded = Buffer.from(content.slice(cursor, cursor + chunkLength), 'base64');
    hash.update(decoded);
    size += decoded.length;
    if (previewSafe) {
      const inspect = `${safetyTail}${decoded.toString('utf8')}`.toLocaleLowerCase();
      previewSafe = !/<(?:script|iframe|object|embed)\b/u.test(inspect)
        && !/\bon[a-z]+\s*=/u.test(inspect)
        && !/(?:href|src)\s*=\s*["']\s*(?:javascript:|data:text\/html|https?:|\/\/)/u.test(inspect)
        && !/(?:@import|url\(\s*["']?\s*(?:https?:|\/\/|javascript:))/u.test(inspect)
        && !/<!doctype\b/u.test(inspect);
      safetyTail = inspect.slice(-512);
    }
  }
  return {sha256: hash.digest('hex'), size, previewSafe};
}

function sha256Range(content: string, start: number, end: number): string {
  const hash = createHash('sha256');
  for (let cursor = start; cursor < end; cursor += BASE64_CHUNK_CHARS) {
    hash.update(content.slice(cursor, Math.min(end, cursor + BASE64_CHUNK_CHARS)));
  }
  return hash.digest('hex');
}

function scanDrawio(content: string): DiagramOccurrence[] {
  const occurrences: DiagramOccurrence[] = [];
  let cursor = 0;
  while (cursor < content.length) {
    const start = content.indexOf('{%', cursor);
    if (start === -1) break;
    const prefixEnd = Math.min(content.length, start + 64);
    const prefix = content.slice(start + 2, prefixEnd).trimStart().toLocaleLowerCase();
    if (!prefix.startsWith('drawio') || /[a-z0-9_-]/i.test(prefix[6] ?? '')) {
      cursor = start + 2;
      continue;
    }
    const end = directiveEnd(content, start + 2);
    if (end === undefined) {
      cursor = start + 2;
      continue;
    }
    const data = attributeBounds(content, start + 2, end - 2, 'data');
    const width = attributeValue(content, start + 2, end - 2, 'width');
    const height = attributeValue(content, start + 2, end - 2, 'height');
    const occurrence: DiagramOccurrence = {start, end, kind: 'drawio', ...(width ? {width} : {}), ...(height ? {height} : {})};
    if (!data) {
      occurrence.data = {mediaType: 'application/octet-stream', payloadStart: start, payloadEnd: end, error: 'Draw.io directive is missing its data attribute'};
    } else {
      const candidateComma = content.indexOf(',', data.start);
      const comma = candidateComma >= data.start && candidateComma < data.end && candidateComma - data.start <= 256 ? candidateComma : -1;
      const header = comma === -1 ? '' : content.slice(data.start, comma).toLocaleLowerCase();
      const mediaType = header.startsWith('data:') ? header.slice(5).split(';', 1)[0] || 'application/octet-stream' : 'application/octet-stream';
      const payloadStart = comma === -1 ? data.start : comma + 1;
      const payloadEnd = data.end;
      if (comma === -1 || !header.includes(';base64') || mediaType !== 'image/svg+xml') {
        occurrence.data = {mediaType, payloadStart, payloadEnd, error: 'Draw.io data must be an image/svg+xml base64 data URI'};
      } else {
        try {
          occurrence.data = {mediaType, payloadStart, payloadEnd, ...digestBase64(content, payloadStart, payloadEnd)};
        } catch (error) {
          occurrence.data = {mediaType, payloadStart, payloadEnd, error: error instanceof Error ? error.message : String(error)};
        }
      }
    }
    occurrences.push(occurrence);
    cursor = end;
  }
  return occurrences;
}

function lineEnd(content: string, start: number): number {
  const next = content.indexOf('\n', start);
  return next === -1 ? content.length : next;
}

function lineAfter(content: string, end: number): number {
  return end < content.length ? end + 1 : end;
}

function scanTextDiagrams(content: string, occupied: DiagramOccurrence[]): DiagramOccurrence[] {
  const occurrences: DiagramOccurrence[] = [];
  let cursor = 0;
  let occupiedIndex = 0;
  while (cursor < content.length) {
    while (occupiedIndex < occupied.length && occupied[occupiedIndex]!.end <= cursor) occupiedIndex += 1;
    const covering = occupied[occupiedIndex];
    if (covering && cursor >= covering.start && cursor < covering.end) {
      cursor = lineAfter(content, lineEnd(content, covering.end));
      continue;
    }
    const end = lineEnd(content, cursor);
    const line = content.slice(cursor, Math.min(end, cursor + 160)).trim();
    const fence = /^```(mermaid|d2|plantuml)\s*$/i.exec(line);
    if (fence) {
      const kind = fence[1]!.toLocaleLowerCase() as Exclude<DiagramKind, 'drawio'>;
      const bodyStart = lineAfter(content, end);
      let closeStart = bodyStart;
      let closeEnd: number | undefined;
      while (closeStart <= content.length) {
        const candidateEnd = lineEnd(content, closeStart);
        if (content.slice(closeStart, candidateEnd).trim() === '```') {
          closeEnd = lineAfter(content, candidateEnd);
          break;
        }
        if (candidateEnd === content.length) break;
        closeStart = candidateEnd + 1;
      }
      if (closeEnd !== undefined) {
        occurrences.push({start: cursor, end: closeEnd, kind, sourceText: content.slice(bodyStart, closeStart).replace(/\n$/, '')});
        cursor = closeEnd;
        continue;
      }
    }
    if (/^\{%\s*diagram(?:\s+[^%]*)?%\}\s*$/i.test(line)) {
      const bodyStart = lineAfter(content, end);
      let closeStart = bodyStart;
      let closeEnd: number | undefined;
      while (closeStart <= content.length) {
        const candidateEnd = lineEnd(content, closeStart);
        if (/^\{%\s*enddiagram\s*%\}\s*$/i.test(content.slice(closeStart, candidateEnd).trim())) {
          closeEnd = lineAfter(content, candidateEnd);
          break;
        }
        if (candidateEnd === content.length) break;
        closeStart = candidateEnd + 1;
      }
      if (closeEnd !== undefined) {
        occurrences.push({start: cursor, end: closeEnd, kind: 'plantuml', sourceText: content.slice(bodyStart, closeStart).replace(/\n$/, '')});
        cursor = closeEnd;
        continue;
      }
    }
    cursor = lineAfter(content, end);
  }
  return occurrences;
}

function label(kind: DiagramKind, index: number): string {
  return `${kind === 'drawio' ? 'Draw.io' : kind === 'plantuml' ? 'PlantUML' : kind === 'd2' ? 'D2' : 'Mermaid'} diagram ${index + 1}`;
}

export function discoverPageDiagrams(page: SourcePage): DiagramDiscovery {
  if (page.rawFormat !== 'yfm' || !page.rawContent) return {preparedContent: page.rawContent, diagrams: [], resources: [], diagnostics: []};
  const drawio = scanDrawio(page.rawContent);
  const occurrences = [...drawio, ...scanTextDiagrams(page.rawContent, drawio)]
    .sort((left, right) => left.start - right.start)
    .filter((item, index, all) => index === 0 || item.start >= all[index - 1]!.end);
  const diagrams: NormalizedDiagram[] = [];
  const resources: SourceResource[] = [];
  const diagnostics: TransformationNotice[] = [];
  const output: string[] = [];
  let cursor = 0;
  for (const [index, occurrence] of occurrences.entries()) {
    output.push(page.rawContent.slice(cursor, occurrence.start));
    const sourceHash = occurrence.data?.sha256
      ?? (occurrence.sourceText !== undefined ? sha256(occurrence.sourceText) : sha256Range(page.rawContent, occurrence.start, occurrence.end));
    const id = `${occurrence.kind}-${index + 1}-${sourceHash.slice(0, 16)}`;
    const marker = `${MARKER_PREFIX}${index + 1}_${sourceHash.slice(0, 16)}_TOKEN`;
    const valid = !occurrence.data?.error;
    const diagram: NormalizedDiagram = {
      id,
      kind: occurrence.kind,
      marker,
      label: label(occurrence.kind, index),
      valid,
      sourceHash,
      ...(occurrence.sourceText !== undefined ? {sourceText: occurrence.sourceText} : {}),
      ...(occurrence.width ? {width: occurrence.width} : {}),
      ...(occurrence.height ? {height: occurrence.height} : {}),
      ...(occurrence.data?.previewSafe !== undefined ? {previewSafe: occurrence.data.previewSafe} : {}),
      ...(occurrence.data?.error ? {error: occurrence.data.error} : {}),
    };
    if (occurrence.kind === 'drawio' && occurrence.data && valid && occurrence.data.sha256 !== undefined && occurrence.data.size !== undefined) {
      const resourceId = `embedded:${page.id}:${id}`;
      const name = `diagram-${index + 1}-${sourceHash.slice(0, 12)}.drawio.svg`;
      const reference = name;
      diagram.resourceId = resourceId;
      diagram.resourceReference = reference;
      resources.push({
        provider: page.provider,
        id: resourceId,
        pageId: page.id,
        name,
        preferredName: name,
        referenceAliases: [reference],
        size: occurrence.data.size,
        mimeType: occurrence.data.mediaType,
        sourceUrl: page.url,
        kind: 'diagram',
        embedded: {
          type: 'yfm-data-uri',
          diagramKind: 'drawio',
          encoding: 'base64',
          mediaType: occurrence.data.mediaType,
          payloadStart: occurrence.data.payloadStart,
          payloadEnd: occurrence.data.payloadEnd,
          sha256: occurrence.data.sha256,
          size: occurrence.data.size,
          previewSafe: occurrence.data.previewSafe ?? false,
        },
      });
    } else if (!valid) {
      const message = `${diagram.label} payload is invalid: ${occurrence.data?.error ?? 'unknown payload error'}; exact source remains in the raw snapshot`;
      diagnostics.push({code: 'diagram-payload-invalid', kind: 'degradation', message, objectId: id, verification: 'raw-snapshot-retained'});
    }
    diagrams.push(diagram);
    output.push(`\n${marker}\n`);
    cursor = occurrence.end;
  }
  output.push(page.rawContent.slice(cursor));
  return {preparedContent: output.join(''), diagrams, resources, diagnostics};
}

function base64Chunks(value: string, start: number, end: number): Iterable<Buffer> {
  return {
    *[Symbol.iterator]() {
      for (let cursor = start; cursor < end; cursor += BASE64_CHUNK_CHARS) {
        yield Buffer.from(value.slice(cursor, Math.min(end, cursor + BASE64_CHUNK_CHARS)), 'base64');
      }
    },
  };
}

export async function materializeEmbeddedDiagram(
  page: SourcePage,
  resource: SourceResource,
  destination: string,
): Promise<{path: string; size: number; sha256: string; mimeType?: string}> {
  const descriptor = resource.embedded;
  if (descriptor?.type !== 'yfm-data-uri') throw new Error(`Resource ${resource.id} is not an embedded diagram`);
  const digest = digestBase64(page.rawContent, descriptor.payloadStart, descriptor.payloadEnd);
  if (digest.sha256 !== descriptor.sha256 || digest.size !== descriptor.size) {
    throw new Error(`Embedded diagram ${resource.id} changed after inventory; expected ${descriptor.size} bytes/${descriptor.sha256}, received ${digest.size} bytes/${digest.sha256}`);
  }
  await mkdir(path.dirname(destination), {recursive: true});
  const temporary = `${destination}.part-${randomUUID()}`;
  try {
    await pipeline(Readable.from(base64Chunks(page.rawContent, descriptor.payloadStart, descriptor.payloadEnd)), createWriteStream(temporary, {mode: 0o600}));
    await rename(temporary, destination);
    return {path: destination, size: digest.size, sha256: digest.sha256, mimeType: descriptor.mediaType};
  } catch (error) {
    await rm(temporary, {force: true});
    throw error;
  }
}
