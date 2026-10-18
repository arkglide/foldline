import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdir, mkdtemp, readFile, writeFile, rm } from 'node:fs/promises';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import os from 'node:os';
import path from 'node:path';
import { ENGINE_COMMIT, runNpm, verifyCheckout } from '../scripts/engine.mjs';

const execute = promisify(execFile);
const mathSource = 'const factory = () => import.meta.url;\nexport default factory;\n';
// Exact transformation used by the pinned engine's scripts/sync-wasm.mjs.
const classicMath = source => 'globalThis.ArkGlideMathScriptURL = document.currentScript.src;\n' + source
  .replaceAll('import.meta.url', 'globalThis.ArkGlideMathScriptURL')
  .replace(/export default (\w+);?\s*$/, 'globalThis.createArkGlideMath = $1;\n');

async function engineFixture(t) {
  const root = await mkdtemp(path.join(os.tmpdir(), 'foldline git & 空格 '));
  t.after(() => rm(root, { recursive: true, force: true }));
  const git = async args => (await execute('git', args, { cwd: root, encoding: 'utf8' })).stdout.trim();
  await git(['init', '--quiet']);
  await git(['config', '--local', 'core.autocrlf', 'true']);
  await git(['config', '--local', 'core.safecrlf', 'false']);
  await mkdir(path.join(root, 'src/wasm'), { recursive: true });
  await mkdir(path.join(root, 'public/lib'), { recursive: true });
  await writeFile(path.join(root, 'src/wasm/arkglide_math.js'), mathSource);
  await writeFile(path.join(root, 'public/lib/arkglide_math.js'), classicMath(mathSource));
  await writeFile(path.join(root, 'runtime.bin'), Buffer.from([0, 1, 13, 10, 255]));
  await git(['add', '.']);
  await git(['-c', 'commit.gpgsign=false', '-c', 'user.name=Fixture', '-c', 'user.email=fixture@example.test',
    'commit', '--quiet', '-m', 'Fixture pin']);
  const commit = await git(['rev-parse', 'HEAD']);
  // Force a real CRLF checkout, rather than just pretending to be Windows.
  await rm(path.join(root, 'src/wasm/arkglide_math.js'));
  await rm(path.join(root, 'public/lib/arkglide_math.js'));
  await git(['checkout-index', '--index', '--force', '--all']);
  return { root, git, commit };
}

test('npm CLI launch preserves arguments with spaces and shell characters on Windows', async t => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'foldline npm & 空格 '));
  t.after(() => rm(root, { recursive: true, force: true }));
  const cli = path.join(root, 'npm-cli.cjs');
  await writeFile(cli, 'console.log(JSON.stringify({ args: process.argv.slice(2), cwd: process.cwd() }));\n');
  const args = ['ci', '--ignore-scripts', '--cache', path.join(root, 'cache & (files) %PATH% !')];
  const output = await runNpm(args, root, { platform: 'win32', npmExecPath: cli, quiet: true });
  const actual = JSON.parse(output);
  assert.deepEqual(actual.args, args);
  assert.equal(actual.cwd, root);
});

test('failed npm CLI remains an installation failure', async t => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'foldline-npm-failure-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const cli = path.join(root, 'npm-cli.cjs');
  await writeFile(cli, 'console.error("fixture installation failed"); process.exit(7);\n');
  await assert.rejects(runNpm(['ci'], root, { platform: 'win32', npmExecPath: cli, quiet: true }),
    /failed \(7\): fixture installation failed/);
});

test('direct Windows invocation gives a useful error when no npm CLI is available', async t => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'foldline-npm-missing-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  await assert.rejects(runNpm(['ci'], root, { platform: 'win32', npmExecPath: '',
    nodeExecPath: path.join(root, 'node.exe'), quiet: true }), /Start with npm run dev or npm run setup:engine/);
});

test('installed npm CLI can be launched through the same runner', async () => {
  const output = await runNpm(['--version'], process.cwd(), { quiet: true });
  assert.match(output, /^\d+\.\d+\.\d+$/);
});

test('CRLF runtime sync can look dirty in status while pinned content stays unchanged', async t => {
  const { root, git, commit } = await engineFixture(t);
  const source = path.join(root, 'src/wasm/arkglide_math.js');
  const output = path.join(root, 'public/lib/arkglide_math.js');
  const sourceBytes = await readFile(source);
  assert.match(sourceBytes.toString(), /\r\n/);
  assert.equal(await git(['status', '--porcelain', '--untracked-files=no']), '');
  await writeFile(output, classicMath(sourceBytes.toString()));
  const generatedBytes = await readFile(output);
  assert.match(await git(['status', '--porcelain', '--untracked-files=no']), /M public\/lib\/arkglide_math\.js/);
  assert.equal(await git(['diff', '--name-only', 'HEAD', '--']), '');
  for (let i = 0; i < 3; i++) await verifyCheckout(root, commit);
  assert.deepEqual(await readFile(output), generatedBytes, 'validation does not rewrite the generated file');
  assert.deepEqual(await readFile(source), sourceBytes, 'validation preserves the CRLF source');
  assert.equal(await git(['config', '--local', 'core.autocrlf']), 'true');
});

test('real source and binary edits are reported and preserved', async t => {
  const { root, commit } = await engineFixture(t);
  const source = path.join(root, 'src/wasm/arkglide_math.js');
  const binary = path.join(root, 'runtime.bin');
  const edited = (await readFile(source, 'utf8')) + '// local repair\r\n';
  const binaryBytes = Buffer.from([0, 2, 13, 10, 255]);
  await writeFile(source, edited); await writeFile(binary, binaryBytes);
  await assert.rejects(verifyCheckout(root, commit), error => {
    assert.match(error.message, /src\/wasm\/arkglide_math\.js/);
    assert.match(error.message, /runtime\.bin/);
    assert.match(error.message, /rename .*backup/);
    return true;
  });
  assert.equal(await readFile(source, 'utf8'), edited);
  assert.deepEqual(await readFile(binary), binaryBytes);
});

test('staged edits are still refused when the working file is reverted to HEAD', async t => {
  const { root, git, commit } = await engineFixture(t);
  const source = path.join(root, 'src/wasm/arkglide_math.js');
  await writeFile(source, mathSource + '// staged local repair\n');
  await git(['add', 'src/wasm/arkglide_math.js']);
  await writeFile(source, mathSource);
  assert.equal(await git(['diff', '--name-only', 'HEAD', '--']), '');
  await assert.rejects(verifyCheckout(root, commit), /tracked changes.*[\s\S]*src\/wasm\/arkglide_math\.js/);
  assert.match(await git(['show', ':src/wasm/arkglide_math.js']), /staged local repair/);
  assert.equal(await readFile(source, 'utf8'), mathSource);
});

test('checkout verification still rejects the wrong pin and nested checkouts', async t => {
  const { root, commit } = await engineFixture(t);
  await assert.rejects(verifyCheckout(root), new RegExp(`must be pinned to ${ENGINE_COMMIT}`));
  await assert.rejects(verifyCheckout(path.join(root, 'src'), commit), /not an independent Git checkout/);
});
