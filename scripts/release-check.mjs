import {execFile} from 'node:child_process';
import {readdir, readFile, stat} from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import {promisify} from 'node:util';
import {URL} from 'node:url';

const root = process.cwd();
const execFileAsync = promisify(execFile);
const ignoredDirectories = new Set(['.git', 'coverage', 'dist', 'node_modules']);
const localRuntimeNames = new Set(['.env', '.states']);
const runtimeDirectoryPrefixes = ['.states/'];
const forbiddenExtensions = new Set(['.key', '.p12', '.pem', '.pfx']);
const textExtensions = new Set([
  '', '.cjs', '.css', '.env', '.example', '.html', '.js', '.json', '.jsonc', '.md', '.mjs', '.ts', '.yaml', '.yml',
]);
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
    if (localRuntimeNames.has(entry.name) || (entry.name.startsWith('.env.') && entry.name !== '.env.example')) continue;
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
      if (domain && !['example.com', 'example.org', 'example.test'].includes(domain)) {
        add(filename, 'non-example email address', lineNumber);
      }
    }

    const environment = line.match(/^\s*(YANDEX_WIKI_TOKEN|CONFLUENCE_TOKEN|YANDEX_WIKI_ORG_ID)\s*=\s*(.*?)\s*$/);
    if (environment?.[2] && environment[2] !== '...' && !/^<[^>]+>$/.test(environment[2])) {
      add(filename, `filled ${environment[1]} value`, lineNumber);
    }

    const confluenceUrl = line.match(/^\s*CONFLUENCE_BASE_URL\s*=\s*(https?:\/\/[^\s#]+)/);
    if (confluenceUrl) {
      try {
        const hostname = new URL(confluenceUrl[1]).hostname;
        if (!['example.com', 'example.test', 'localhost'].some((allowed) => hostname === allowed || hostname.endsWith(`.${allowed}`))) {
          add(filename, 'non-example Confluence hostname', lineNumber);
        }
      } catch {
        add(filename, 'invalid Confluence URL', lineNumber);
      }
    }
  });
}

const gitignore = await readFile(path.join(root, '.gitignore'), 'utf8');
for (const required of ['.env', '.env.*', '.states/', 'dist/']) {
  if (!gitignore.split(/\r?\n/).includes(required)) add(path.join(root, '.gitignore'), `missing required ignore rule: ${required}`);
}

await walk(root);

try {
  const {stdout} = await execFileAsync('git', ['ls-files', '-z'], {cwd: root, encoding: 'utf8'});
  for (const tracked of stdout.split('\0').filter(Boolean)) {
    if (
      tracked === '.env'
      || tracked.startsWith('.env.') && tracked !== '.env.example'
      || runtimeDirectoryPrefixes.some((prefix) => tracked.startsWith(prefix))
    ) {
      add(path.join(root, tracked), 'local runtime data is tracked by Git');
    }
  }
} catch {
  // The project may be checked before git init; filesystem and package checks still apply.
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
