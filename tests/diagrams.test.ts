import {createHash} from 'node:crypto';
import {mkdtemp, rm} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {describe, expect, it} from 'vitest';
import {discoverPageDiagrams, materializeEmbeddedDiagram} from '../src/diagrams.js';
import type {SourcePage} from '../src/domain.js';

function page(rawContent: string): SourcePage {
  return {
    provider: 'yandex-wiki',
    profile: 'wiki',
    id: '42',
    canonicalId: 'yandex:wiki:42',
    title: 'Diagrams',
    locator: 'team/diagrams',
    url: 'https://wiki.example.test/team/diagrams',
    rawContent,
    rawFormat: 'yfm',
    references: [],
  };
}

describe('diagram discovery', () => {
  it('extracts large inline Draw.io payloads before Diplodoc and creates stable resources', () => {
    const svg = `<svg xmlns="http://www.w3.org/2000/svg"><!--${'x'.repeat(1_100_000)}--><text>Inventory</text></svg>`;
    const encoded = Buffer.from(svg).toString('base64');
    const input = page(`# Architecture\n\n{% drawio data="data:image/svg+xml;base64,${encoded}" width=900 height=500 %}\n`);

    const first = discoverPageDiagrams(input);
    const second = discoverPageDiagrams(input);

    expect(first.preparedContent).not.toContain(encoded);
    expect(first.preparedContent).toContain('YWTC_DIAGRAM_');
    expect(first.diagrams).toHaveLength(1);
    expect(first.resources).toHaveLength(1);
    expect(first.resources[0]).toMatchObject({
      kind: 'diagram',
      pageId: '42',
      size: Buffer.byteLength(svg),
      mimeType: 'image/svg+xml',
    });
    expect(first.resources[0]?.id).toBe(second.resources[0]?.id);
    expect(first.resources[0]?.embedded?.sha256).toBe(createHash('sha256').update(svg).digest('hex'));
    expect(first.resources[0]?.embedded?.previewSafe).toBe(true);
    expect(JSON.stringify(first.resources[0])).not.toContain(encoded.slice(0, 256));
  });

  it('retains active Draw.io source but marks its inline preview unsafe', () => {
    const svg = '<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script><image href="https://example.test/pixel.png"/></svg>';
    const result = discoverPageDiagrams(page(`{% drawio data="data:image/svg+xml;base64,${Buffer.from(svg).toString('base64')}" %}`));

    expect(result.diagrams[0]).toMatchObject({kind: 'drawio', valid: true, previewSafe: false});
    expect(result.resources[0]?.embedded).toMatchObject({previewSafe: false, size: Buffer.byteLength(svg)});
  });

  it('discovers Mermaid, PlantUML, and D2 source without changing their text', () => {
    const input = page([
      '```mermaid',
      'flowchart LR',
      '  A --> B',
      '```',
      '',
      '{% diagram %}',
      '@startuml',
      'Alice -> Bob',
      '@enduml',
      '{% enddiagram %}',
      '',
      '```d2',
      'A -> B',
      '```',
    ].join('\n'));

    const result = discoverPageDiagrams(input);

    expect(result.diagrams.map((diagram) => diagram.kind)).toEqual(['mermaid', 'plantuml', 'd2']);
    expect(result.diagrams.map((diagram) => diagram.sourceText)).toEqual([
      'flowchart LR\n  A --> B',
      '@startuml\nAlice -> Bob\n@enduml',
      'A -> B',
    ]);
    expect(result.diagrams.every((diagram) => result.preparedContent.includes(diagram.marker))).toBe(true);
    expect(result.resources).toEqual([]);
  });

  it('keeps malformed inline diagram data out of Diplodoc and records a typed degradation', () => {
    const result = discoverPageDiagrams(page('{% drawio data="data:image/svg+xml;base64,@@not-base64@@" %}'));

    expect(result.preparedContent).not.toContain('@@not-base64@@');
    expect(result.resources).toEqual([]);
    expect(result.diagrams[0]).toMatchObject({kind: 'drawio', valid: false});
    expect(result.diagnostics[0]).toMatchObject({kind: 'degradation', code: 'diagram-payload-invalid'});
  });
});

describe('embedded diagram materialization', () => {
  it('writes the exact decoded payload and verifies its descriptor', async () => {
    const svg = '<svg xmlns="http://www.w3.org/2000/svg"><text>Diagram</text></svg>';
    const source = page(`{% drawio data="data:image/svg+xml;base64,${Buffer.from(svg).toString('base64')}" %}`);
    const discovered = discoverPageDiagrams(source);
    const resource = discovered.resources[0]!;
    const directory = await mkdtemp(path.join(os.tmpdir(), 'ywtc-diagram-'));
    const destination = path.join(directory, 'diagram.svg');

    const materialized = await materializeEmbeddedDiagram(source, resource, destination);

    expect(materialized).toMatchObject({size: Buffer.byteLength(svg), sha256: createHash('sha256').update(svg).digest('hex'), mimeType: 'image/svg+xml'});
    await rm(directory, {recursive: true, force: true});
  });
});
