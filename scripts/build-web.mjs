import {spawnSync} from 'node:child_process';
import {cp, mkdir, readFile, readdir, rm, writeFile} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {redactCheckoutPaths} from './build-paths.mjs';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const result = spawnSync(process.execPath, [path.join(root, 'node_modules/next/dist/bin/next'), 'build', 'web', '--webpack'], {cwd: root, env: {...process.env, NEXT_TELEMETRY_DISABLED: '1'}, stdio: 'inherit'});
if (result.status !== 0) process.exit(result.status ?? 1);
const output = path.join(root, 'dist/web');await rm(output, {recursive: true, force: true});await mkdir(output, {recursive: true});
await cp(path.join(root, 'web/.next/standalone/web'), output, {recursive: true, filter: file => !file.split(path.sep).includes('node_modules') && !file.includes(`${path.sep}.next${path.sep}cache`)});
await cp(path.join(root, 'web/.next/static'), path.join(output, '.next/static'), {recursive: true});
await writeFile(path.join(output, 'package.json'), JSON.stringify({private: true, type: 'commonjs'}));
async function portable(directory) {
  for (const entry of await readdir(directory, {withFileTypes: true})) {
    const filename = path.join(directory, entry.name);
    if (entry.isDirectory()) await portable(filename);
    else if (/\.(?:js|json|map)$/.test(entry.name)) {
      const source = await readFile(filename, 'utf8');
      if (source.includes(root)) await writeFile(filename, redactCheckoutPaths(source, root));
    }
  }
}
await portable(output);
await mkdir(path.join(output, 'public'), {recursive: true});
await cp(path.join(root, 'web/public'), path.join(output, 'public'), {recursive: true});
await cp(path.join(root, 'node_modules/@fontsource-variable/inter/files/inter-latin-cyrillic-wght-normal.woff2'), path.join(output, 'public/inter.woff2')).catch(async () => cp(path.join(root, 'node_modules/@fontsource-variable/inter/files/inter-latin-wght-normal.woff2'), path.join(output, 'public/inter.woff2')));
