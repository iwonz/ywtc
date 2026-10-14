#!/usr/bin/env node
import {ConfluenceClient} from './clients/confluence.js';
import {YandexWikiClient} from './clients/yandex-wiki.js';
import {CLI_HELP, parseCliArguments} from './cli-arguments.js';
import {readConfig, secretValues} from './config.js';
import {parseWikiSource} from './input.js';
import {createLogger, redact} from './logger.js';
import {Migrator} from './migrator.js';
import {TerminalMigrationProgress} from './progress.js';

export async function main(argv: string[] = process.argv.slice(2)): Promise<number> {
  const arguments_ = parseCliArguments(argv);
  if (arguments_.help) {
    console.log(CLI_HELP);
    return 0;
  }

  const config = readConfig();
  const secrets = secretValues(config);
  const logger = createLogger(secrets);
  const concurrency = arguments_.concurrency ?? config.concurrency;
  const sourceSlug = parseWikiSource(arguments_.source, config.yandex.webUrl);
  const progress = new TerminalMigrationProgress();
  progress.start({
    source: arguments_.source,
    target: arguments_.target,
    dryRun: arguments_.dryRun,
    singlePage: arguments_.singlePage,
    fresh: arguments_.fresh,
    stateFilename: arguments_.stateFilename ?? 'automatic · resolved after source/target preflight',
    orchestrationConcurrency: concurrency,
    networkLimits: config.networkLimits,
  });
  const yandex = new YandexWikiClient(config.yandex, config.timeoutMs, config.networkLimits.yandex);
  const confluence = new ConfluenceClient(config.confluence, config.timeoutMs, config.networkLimits.confluence);
  const migrator = new Migrator({yandex, confluence, config, logger, progress, secrets});
  try {
    const result = await migrator.run({
      sourceSlug,
      target: arguments_.target,
      dryRun: arguments_.dryRun,
      singlePage: arguments_.singlePage,
      fresh: arguments_.fresh,
      concurrency,
      ...(arguments_.stateFilename ? {stateFilename: arguments_.stateFilename} : {}),
    });
    return result.hasErrors ? 1 : 0;
  } catch (error) {
    progress.fail(redact(error, secrets));
    throw error;
  }
}

main()
  .then((code) => {
    process.exitCode = code;
  })
  .catch((error) => {
    let secrets: string[] = [];
    try {
      secrets = secretValues(readConfig());
    } catch {
      // Configuration errors do not expose secret values.
    }
    console.error(`ERROR ${redact(error, secrets)}`);
    process.exitCode = 1;
  });
