import { createHash } from 'node:crypto';
import { spawn } from 'node:child_process';
import { access, mkdir, mkdtemp, readFile, realpath, rename, rm, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const ENGINE_COMMIT = 'da8ea1cf098ad99ccc89451d34bf4e272cdc15aa';
const ENGINE_REPOSITORY = 'https://github.com/arkglide/arkglide.git';
const PROJECT_ROOT = fileURLToPath(new URL('../', import.meta.url));

async function run(command, args, cwd, { quiet = false } = {}) {
  return await new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd,
      stdio: quiet ? ['ignore', 'pipe', 'pipe'] : ['ignore', 'inherit', 'inherit'],
      env: { ...process.env, GIT_TERMINAL_PROMPT: '0', npm_config_update_notifier: 'false' },
    });
    let stdout = '', stderr = '';
    if (quiet) {
      child.stdout.setEncoding('utf8').on('data', chunk => { stdout += chunk; });
      child.stderr.setEncoding('utf8').on('data', chunk => { stderr += chunk; });
    }
    child.once('error', reject);
    child.once('close', code => code === 0
      ? resolve(stdout.trim())
      : reject(new Error(`${command} ${args.join(' ')} failed (${code})${stderr ? `: ${stderr.trim()}` : ''}`)));
  });
}

async function exists(file) {
  try { await access(file); return true; }
  catch (error) { if (error.code === 'ENOENT') return false; throw error; }
}

async function verifyCheckout(directory) {
  const checkoutRoot = await run('git', ['rev-parse', '--show-toplevel'], directory, { quiet: true });
  if (await realpath(checkoutRoot) !== await realpath(directory))
    throw new Error(`Engine cache is not an independent Git checkout: ${directory}`);
  const actual = await run('git', ['rev-parse', 'HEAD'], directory, { quiet: true });
  if (actual !== ENGINE_COMMIT)
    throw new Error(`ArkGlide must be pinned to ${ENGINE_COMMIT}; found ${actual} in ${directory}`);
  const changed = await run('git', ['status', '--porcelain', '--untracked-files=no'], directory, { quiet: true });
  if (changed)
    throw new Error(`ArkGlide has tracked changes in ${directory}; preserve or remove this cache before retrying.`);
}

/**
 * Provision the exact upstream engine and its locked npm dependencies.
 * Returns the absolute checkout path; no editor or WASM build is performed.
 * `source` is an optional verified local checkout used only as a Git-object seed.
 * A fresh machine uses the official HTTPS repository with the same pinned SHA.
 */
export async function ensureEngine({ root = PROJECT_ROOT, source = process.env.FOLDLINE_ENGINE_SOURCE } = {}) {
  const [major, minor] = process.versions.node.split('.').map(Number);
  if (major < 20 || (major === 20 && minor < 19))
    throw new Error('ArkGlide requires Node.js >= 20.19.0.');

  const cacheRoot = path.resolve(root, '.cache');
  const directory = path.join(cacheRoot, 'arkglide');
  await mkdir(cacheRoot, { recursive: true });
  if (!(await exists(directory))) {
    if (source) {
      source = path.resolve(source);
      await verifyCheckout(source);
    }
    const temporary = await mkdtemp(path.join(cacheRoot, 'arkglide-bootstrap-'));
    try {
      await run('git', ['init', '--quiet'], temporary);
      await run('git', ['remote', 'add', 'origin', ENGINE_REPOSITORY], temporary);
      await run('git', ['fetch', '--no-tags', '--depth', '1', source || 'origin', ENGINE_COMMIT], temporary);
      await run('git', ['checkout', '--quiet', '--detach', ENGINE_COMMIT], temporary);
      await verifyCheckout(temporary);
      await rename(temporary, directory);
    } finally {
      // A failed fetch never leaves a half-initialized engine cache behind.
      await rm(temporary, { recursive: true, force: true });
    }
  }
  await verifyCheckout(directory);

  const lock = await readFile(path.join(directory, 'package-lock.json'));
  const fingerprint = createHash('sha256').update(lock).update(`${major}:${process.platform}:${process.arch}`).digest('hex');
  const marker = path.join(directory, 'node_modules', '.foldline-lock');
  let installed = false;
  try {
    installed = (await readFile(marker, 'utf8')).trim() === fingerprint;
    for (const dependency of ['vite', 'fflate', '@babylonjs/core', '@playwright/test'])
      installed &&= (await stat(path.join(directory, 'node_modules', dependency, 'package.json'))).isFile();
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
  }
  if (!installed) {
    await run('npm', ['ci', '--ignore-scripts', '--no-audit', '--no-fund', '--cache', path.join(cacheRoot, 'npm')], directory);
    await writeFile(marker, `${fingerprint}\n`);
  }
  await verifyCheckout(directory);
  return directory;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url))
  console.log(await ensureEngine());
