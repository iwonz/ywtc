import {createRequire} from 'node:module';
import {log} from '@diplodoc/transform/lib/log.js';
import type {OptionsType, OutputType} from '@diplodoc/transform/lib/typings.js';

type CommonJsLoad = (request: string, parent: unknown, isMain: boolean) => unknown;

interface CommonJsModuleInternals {
  _load: CommonJsLoad;
}

interface MarkdownItInstance {
  parse(source: string, environment: object): Array<{constructor: unknown}>;
  utils: unknown;
}

type MarkdownItConstructor = new () => MarkdownItInstance;
type DiplodocTransform = (content: string, options?: OptionsType) => OutputType;

export const MAX_YFM_LEXICAL_TOKEN_CHARS = 64 * 1024;
export const BOUNDED_YFM_DIAGNOSTIC = 'ywtc bounded source payload';

export interface PreparedYfmInput {
  content: string;
  diagnostics: string[];
  boundedTokens: number;
  literalTemplates?: Array<{token: string; value: string}>;
}

function isWhitespace(character: string): boolean {
  const code = character.charCodeAt(0);
  return (code >= 9 && code <= 13)
    || code === 32
    || code === 133
    || code === 160
    || code === 5760
    || (code >= 8192 && code <= 8202)
    || code === 8232
    || code === 8233
    || code === 8239
    || code === 8287
    || code === 12288
    || code === 65279;
}

function payloadKind(token: string): 'inline data' | 'lexical' {
  const boundedPrefix = token.slice(0, 512).toLocaleLowerCase();
  return boundedPrefix.includes('data:') && boundedPrefix.includes(';base64,') ? 'inline data' : 'lexical';
}

function protectLiteralTemplateSyntax(content: string): {content: string; literals: Array<{token: string; value: string}>} {
  const literals: Array<{token: string; value: string}> = [];
  const protect = (value: string): string => {
    let token = `YWTC_LITERAL_TEMPLATE_${literals.length}_${value.length}_TOKEN`;
    while (content.includes(token)) token += '_';
    literals.push({token, value});
    return token;
  };
  const externalControl = /^\{%-?\s*(?:if|else|elif|endif|for|endfor|range|with|endwith|define|end|assign|capture|endcapture|case|when|endcase|unless|endunless|macro|endmacro|set|raw|endraw)\b/i;
  const variablesProtected = content.replace(/\{\{[\s\S]*?\}\}/g, protect);
  const protectedContent = variablesProtected.replace(/\{%-?[\s\S]*?-?%\}/g, (value) => (
    externalControl.test(value) ? protect(value) : value
  ));
  return {content: protectedContent, literals};
}

function restoreLiteralTemplates(html: string, literals: PreparedYfmInput['literalTemplates']): string {
  if (!literals) return html;
  const escapeHtml = (value: string): string => value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;');
  let restored = html;
  for (const literal of literals) restored = restored.replaceAll(literal.token, escapeHtml(literal.value));
  return restored;
}

/**
 * Diplodoc and its Markdown plugins contain synchronous regular-expression
 * paths. Keep untrusted, whitespace-free payloads out of those paths while
 * leaving the original source untouched for fingerprints and raw snapshots.
 */
export function prepareYfmInput(content: string, maximumTokenChars = MAX_YFM_LEXICAL_TOKEN_CHARS): PreparedYfmInput {
  if (!content || maximumTokenChars < 1) {
    const protectedInput = protectLiteralTemplateSyntax(content);
    return {
      content: protectedInput.content,
      diagnostics: [],
      boundedTokens: 0,
      ...(protectedInput.literals.length > 0 ? {literalTemplates: protectedInput.literals} : {}),
    };
  }
  const output: string[] = [];
  const diagnostics: string[] = [];
  let cursor = 0;
  let tokenStart = 0;
  let boundedTokens = 0;
  const visitToken = (end: number): void => {
    const length = end - tokenStart;
    if (length <= maximumTokenChars) return;
    output.push(content.slice(cursor, tokenStart));
    const kind = payloadKind(content.slice(tokenStart, end));
    const marker = `[Oversized ${kind} payload (${length} characters); exact source preserved in the ywtc raw snapshot]`;
    output.push(marker);
    diagnostics.push(`${BOUNDED_YFM_DIAGNOSTIC}: oversized ${kind} payload (${length} characters) was replaced in the rendered view; exact source is preserved in the raw snapshot`);
    cursor = end;
    boundedTokens += 1;
  };
  for (let index = 0; index <= content.length; index += 1) {
    if (index < content.length && !isWhitespace(content[index]!)) continue;
    visitToken(index);
    tokenStart = index + 1;
  }
  if (boundedTokens === 0) {
    const protectedInput = protectLiteralTemplateSyntax(content);
    return {
      content: protectedInput.content,
      diagnostics,
      boundedTokens,
      ...(protectedInput.literals.length > 0 ? {literalTemplates: protectedInput.literals} : {}),
    };
  }
  output.push(content.slice(cursor));
  const protectedInput = protectLiteralTemplateSyntax(output.join(''));
  return {
    content: protectedInput.content,
    diagnostics,
    boundedTokens,
    ...(protectedInput.literals.length > 0 ? {literalTemplates: protectedInput.literals} : {}),
  };
}

function loadDiplodocTransform(): DiplodocTransform {
  const require = createRequire(import.meta.url);
  const moduleInternals = require('node:module') as CommonJsModuleInternals;
  const MarkdownIt = require('markdown-it') as MarkdownItConstructor;
  const markdown = new MarkdownIt();
  const token = markdown.parse('token', {})[0]?.constructor;
  if (!token) throw new Error('markdown-it did not provide its token constructor');
  const originalLoad = moduleInternals._load;
  moduleInternals._load = function loadWithMarkdownItCompatibility(request, parent, isMain) {
    if (request === 'markdown-it/lib/token') return token;
    if (request === 'markdown-it/lib/common/utils') return markdown.utils;
    return originalLoad.call(this, request, parent, isMain);
  };
  try {
    return require('@diplodoc/transform') as DiplodocTransform;
  } finally {
    moduleInternals._load = originalLoad;
  }
}

const transform = loadDiplodocTransform();

/**
 * Diplodoc 4.x keeps diagnostics in a module-global logger. Isolate every
 * synchronous invocation so one page cannot inherit another page's warnings.
 */
export function transformYfm(content: string, options?: OptionsType): OutputType {
  log.clear();
  try {
    const prepared = prepareYfmInput(content);
    const output = transform(prepared.content, options);
    const logs = Object.fromEntries(Object.entries(output.logs).map(([level, messages]) => [level, [...messages]])) as OutputType['logs'];
    if (prepared.diagnostics.length > 0) logs.warn = [...(logs.warn ?? []), ...prepared.diagnostics];
    return {
      ...output,
      result: {
        ...output.result,
        html: restoreLiteralTemplates(output.result.html, prepared.literalTemplates),
      },
      logs,
    };
  } finally {
    log.clear();
  }
}
