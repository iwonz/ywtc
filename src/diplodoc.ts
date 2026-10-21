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
    const output = transform(content, options);
    return {
      ...output,
      logs: Object.fromEntries(Object.entries(output.logs).map(([level, messages]) => [level, [...messages]])) as OutputType['logs'],
    };
  } finally {
    log.clear();
  }
}
