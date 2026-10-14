import {spawn} from 'node:child_process';
import {execFile} from 'node:child_process';
import {mkdtemp, rm, writeFile} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {promisify} from 'node:util';

const execFileAsync = promisify(execFile);
const packageName = '@iwonz/ywtc';

async function packageExists(): Promise<boolean> {
  try {
    await execFileAsync('npm', ['view', `${packageName}@0.0.0`, 'version'], {encoding: 'utf8'});
    return true;
  } catch {
    return false;
  }
}

function publish(directory: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn('npm', ['publish', directory, '--access', 'public', '--tag', 'bootstrap'], {
      shell: false,
      stdio: 'inherit',
    });
    child.once('error', reject);
    child.once('exit', (code, signal) => {
      if (code === 0) resolve();
      else reject(new Error(`npm bootstrap publish failed with ${signal ? `signal ${signal}` : `exit code ${code}`}`));
    });
  });
}

if (await packageExists()) {
  process.stdout.write(`${packageName}@0.0.0 already exists; bootstrap is complete.\n`);
  process.exit(0);
}

const whoami = (await execFileAsync('npm', ['whoami'], {encoding: 'utf8'})).stdout.trim();
if (whoami !== 'iwonz') throw new Error(`npm bootstrap requires owner iwonz; current account is ${whoami || 'unknown'}`);

const temporary = await mkdtemp(path.join(os.tmpdir(), 'ywtc-bootstrap-'));
try {
  await writeFile(path.join(temporary, 'package.json'), `${JSON.stringify({
    name: packageName,
    version: '0.0.0',
    description: 'Bootstrap placeholder for ywtc trusted publishing',
    license: 'MIT',
    repository: 'https://github.com/iwonz/ywtc',
  }, null, 2)}\n`, {encoding: 'utf8', mode: 0o600});
  await writeFile(path.join(temporary, 'README.md'), '# ywtc\n\nBootstrap package. Install the current release with `npm install -g @iwonz/ywtc@latest`.\n', 'utf8');
  await publish(temporary);
} finally {
  await rm(temporary, {recursive: true, force: true});
}
