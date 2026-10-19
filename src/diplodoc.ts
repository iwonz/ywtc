import transform from '@diplodoc/transform';
import {log} from '@diplodoc/transform/lib/log.js';

/**
 * Diplodoc 4.x keeps diagnostics in a module-global logger. Isolate every
 * synchronous invocation so one page cannot inherit another page's warnings.
 */
export function transformYfm(content: string, options?: transform.Options): transform.Output {
  log.clear();
  try {
    const output = transform(content, options);
    return {
      ...output,
      logs: Object.fromEntries(Object.entries(output.logs).map(([level, messages]) => [level, [...messages]])) as transform.Output['logs'],
    };
  } finally {
    log.clear();
  }
}
