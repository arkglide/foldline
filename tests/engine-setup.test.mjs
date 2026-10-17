import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { runNpm } from '../scripts/engine.mjs';

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
