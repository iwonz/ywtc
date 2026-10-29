import type {CliCommand} from './cli-arguments.js';
import {runManagedExport} from './jobs/command.js';

export function runMentionExportCommand(command: Extract<CliCommand, {command: 'mentions-export' | 'hashtags-export'}>): Promise<number> {
  return runManagedExport(command);
}
