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

export async function runNpm(args, cwd, {
  npmExecPath = process.env.npm_execpath,
  nodeExecPath = process.execPath,
  platform = process.platform,
  quiet = false,
} = {}) {
  // npm run supplies the actual JavaScript CLI, including on Windows where
  // npm.cmd cannot be launched by spawn() without a command interpreter.
  // Calling Node directly also preserves spaces and shell characters in paths.
  if (!npmExecPath && platform === 'win32') {
    const bundled = path.join(path.dirname(nodeExecPath), 'node_modules/npm/bin/npm-cli.js');
    if (await exists(bundled)) npmExecPath = bundled;
  }
  if (npmExecPath) return run(nodeExecPath, [npmExecPath, ...args], cwd, { quiet });
  if (platform === 'win32')
    throw new Error('Cannot locate npm-cli.js. Start with npm run dev or npm run setup:engine so npm_execpath is available.');
  return run('npm', args, cwd, { quiet });
}

export async function verifyCheckout(directory, expectedCommit = ENGINE_COMMIT) {
  const checkoutRoot = await run('git', ['rev-parse', '--show-toplevel'], directory, { quiet: true });
  if (await realpath(checkoutRoot) !== await realpath(directory))
    throw new Error(`Engine cache is not an independent Git checkout: ${directory}`);
  const actual = await run('git', ['rev-parse', 'HEAD'], directory, { quiet: true });
  if (actual !== expectedCommit)
    throw new Error(`ArkGlide must be pinned to ${expectedCommit}; found ${actual} in ${directory}`);
  // On Windows sync-wasm can mix LF with a CRLF checkout. Git status then
  // reports M even when Git's normalized diff is empty. Compare actual content
  // against the pinned tree instead; never reset or rewrite an existing cache.
  const diff = ['--name-only', '--no-ext-diff', '--no-textconv', 'HEAD', '--'];
  const changed = await run('git', ['diff', ...diff], directory, { quiet: true });
  // Check the index too: a staged edit can be hidden by reverting the working
  // file to HEAD without unstaging it. It must still be preserved and reported.
  const staged = await run('git', ['diff', '--cached', ...diff], directory, { quiet: true });
  if (changed || staged)
    throw new Error(`ArkGlide has tracked changes in ${directory}:\n${changed || staged}\n` +
      'Preserve these edits before retrying. To create a fresh cache, rename .cache/arkglide to a backup directory; do not delete your changes.');
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
      // Scope LF checkout rules to this newly provisioned cache only. Existing
      // caches and FOLDLINE_ENGINE_SOURCE keep their local/user configuration.
      await run('git', ['config', '--local', 'core.autocrlf', 'false'], temporary);
      await run('git', ['config', '--local', 'core.eol', 'lf'], temporary);
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
    await runNpm(['ci', '--ignore-scripts', '--no-audit', '--no-fund', '--cache', path.join(cacheRoot, 'npm')], directory);
    await writeFile(marker, `${fingerprint}\n`);
  }
  await verifyCheckout(directory);
  return directory;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url))
  console.log(await ensureEngine());
