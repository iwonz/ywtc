import {execFile} from 'node:child_process';
import {readdir, readFile, stat} from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import {promisify} from 'node:util';

const root = process.cwd();
const execFileAsync = promisify(execFile);
const ignoredDirectories = new Set(['.git', 'coverage', 'dist', 'node_modules']);
const localRuntimeNames = new Set(['.env', '.states', 'ywtc.config.yaml']);
const runtimeDirectoryPrefixes = ['.states/'];
const forbiddenExtensions = new Set(['.key', '.p12', '.pem', '.pfx']);
const textExtensions = new Set([
  '', '.cjs', '.css', '.env', '.example', '.html', '.js', '.json', '.jsonc', '.md', '.mjs', '.ts', '.yaml', '.yml',
]);
const expectedReadmeHeadings = [
  'Описание',
  'Возможности',
  'Установка',
  'Минимальный сценарий',
  'Конфигурация',
  'Направления и совместимость',
  'Как получить токены',
  'Параметры',
  'Частые примеры',
  'Файловый экспорт',
  'State',
  'Отчёты',
  'Разработка',
];
const findings = [];

function relative(filename) {
  return path.relative(root, filename) || '.';
}

function add(filename, reason, line) {
  findings.push({file: relative(filename), reason, ...(line ? {line} : {})});
}

async function walk(directory) {
  for (const entry of await readdir(directory, {withFileTypes: true})) {
    const filename = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      if (ignoredDirectories.has(entry.name)) continue;
      if (localRuntimeNames.has(entry.name)) continue;
      await walk(filename);
      continue;
    }
    if (!entry.isFile()) continue;
    if (localRuntimeNames.has(entry.name) || entry.name.startsWith('.env.')) continue;
    if (forbiddenExtensions.has(path.extname(entry.name).toLocaleLowerCase())) {
      add(filename, 'private key or certificate file must not be published');
      continue;
    }
    await scanText(filename);
  }
}

async function scanText(filename) {
  if (!textExtensions.has(path.extname(filename).toLocaleLowerCase())) return;
  if ((await stat(filename)).size > 5_000_000) return;
  const content = await readFile(filename, 'utf8');
  const lines = content.split(/\r?\n/);
  lines.forEach((line, index) => {
    const lineNumber = index + 1;
    if (/(?:^|["'`\s])(?:\/Users\/[^/\s]+|\/home\/[^/\s]+|[A-Za-z]:\\Users\\[^\\\s]+)/.test(line)) {
      add(filename, 'absolute user home path', lineNumber);
    }
    if (/Authorization\s*[:=]\s*["'`]?(?:Bearer|OAuth)\s+[A-Za-z0-9._~+/-]{16,}/i.test(line)) {
      add(filename, 'literal authorization credential', lineNumber);
    }
    if (/-----BEGIN (?:OPENSSH |RSA |EC )?PRIVATE KEY-----/.test(line)) {
      add(filename, 'inline private key', lineNumber);
    }
    if (/\beyJ[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{10,}\b/.test(line)) {
      add(filename, 'JWT-like credential', lineNumber);
    }

    for (const email of line.matchAll(/\b[A-Z0-9._%+-]+@([A-Z0-9.-]+\.[A-Z]{2,})\b/gi)) {
      const domain = email[1]?.toLocaleLowerCase();
      if (domain && !['example.com', 'example.org', 'example.test', 'users.noreply.github.com'].includes(domain)) {
        add(filename, 'non-example email address', lineNumber);
      }
    }

    if (path.basename(filename) === 'ywtc.config.example.yaml') {
      const credential = line.match(/^\s*(token|email):\s*(.*?)\s*$/);
      if (credential?.[2] && credential[2] !== '""' && credential[2] !== "''") {
        add(filename, `filled ${credential[1]} value`, lineNumber);
      }
    }
  });
}

const gitignore = await readFile(path.join(root, '.gitignore'), 'utf8');
for (const required of ['.env', '.env.*', 'ywtc.config.yaml', '.states/', 'dist/']) {
  if (!gitignore.split(/\r?\n/).includes(required)) add(path.join(root, '.gitignore'), `missing required ignore rule: ${required}`);
}

const readmeFilename = path.join(root, 'README.md');
const readme = await readFile(readmeFilename, 'utf8');
const readmeHeadings = [...readme.matchAll(/^##[ \t]+(.+?)[ \t]*$/gm)].map((match) => match[1]);
if (JSON.stringify(readmeHeadings) !== JSON.stringify(expectedReadmeHeadings)) {
  add(readmeFilename, `second-level headings must be exactly: ${expectedReadmeHeadings.join(' → ')}`);
}

await walk(root);

try {
  const {stdout} = await execFileAsync('git', ['ls-files', '-z'], {cwd: root, encoding: 'utf8'});
  for (const tracked of stdout.split('\0').filter(Boolean)) {
    if (
      tracked === '.env'
      || tracked === '.ywtc-workspace.json'
      || tracked === 'ywtc.config.yaml'
      || tracked.startsWith('.env.')
      || runtimeDirectoryPrefixes.some((prefix) => tracked.startsWith(prefix))
    ) {
      const filename = path.join(root, tracked);
      try {
        await stat(filename);
        add(filename, 'local runtime data is tracked by Git');
      } catch (error) {
        if ((error).code !== 'ENOENT') throw error;
      }
    }
  }
} catch {
  // The project may be checked before git init; filesystem and package checks still apply.
}

const retiredContracts = [
  ['schemaVersion', 'retired schemaVersion field'],
  ['ywtc-state-v2', 'retired state schema namespace'],
  ['.ywtc-workspace.json', 'retired workspace marker'],
  ['tokenEnv', 'retired token indirection'],
  ['emailEnv', 'retired email indirection'],
];
for (const relativeFilename of ['README.md', 'AGENTS.md', 'package.json', 'ywtc.config.example.yaml']) {
  const filename = path.join(root, relativeFilename);
  const content = await readFile(filename, 'utf8');
  for (const [needle, reason] of retiredContracts) {
    if (content.includes(needle)) add(filename, reason);
  }
}
for (const directory of ['src']) {
  const filenames = [];
  const collect = async (current) => {
    for (const entry of await readdir(current, {withFileTypes: true})) {
      const filename = path.join(current, entry.name);
      if (entry.isDirectory()) await collect(filename);
      else if (entry.isFile()) filenames.push(filename);
    }
  };
  await collect(path.join(root, directory));
  for (const filename of filenames) {
    if (!textExtensions.has(path.extname(filename).toLocaleLowerCase())) continue;
    const content = await readFile(filename, 'utf8');
    for (const [needle, reason] of retiredContracts) {
      if (content.includes(needle)) add(filename, reason);
    }
  }
}

if (findings.length > 0) {
  process.stderr.write('Release check failed:\n');
  for (const finding of findings) {
    process.stderr.write(`- ${finding.file}${finding.line ? `:${finding.line}` : ''}: ${finding.reason}\n`);
  }
  process.exitCode = 1;
} else {
  process.stdout.write('Release check passed: no tracked runtime data or obvious credentials in publishable files.\n');
}
