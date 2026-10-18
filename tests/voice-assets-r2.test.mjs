import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { loadVoiceAssets, processVoiceAssets } from '../scripts/voice-assets.mjs';

const source = JSON.parse(await fs.readFile(new URL('../game/data/l01-dialogue.json', import.meta.url), 'utf8'));
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
function dataFor(count = 2) {
  const data = structuredClone(source);
  data.lines = ['zhanque', 'hengwu'].slice(0, count).map(character => data.lines.find(line => line.character === character));
  for (const line of data.lines) delete line.after;
  return data;
}
function fixtureWave(frequency = 440) {
  // A temporary PCM validator fixture, NEVER a generated English speech asset.
  const sampleRate = 22050, frames = 6615, wave = Buffer.alloc(44 + frames * 2);
  wave.write('RIFF'); wave.writeUInt32LE(wave.length - 8, 4); wave.write('WAVEfmt ', 8);
  wave.writeUInt32LE(16, 16); wave.writeUInt16LE(1, 20); wave.writeUInt16LE(1, 22);
  wave.writeUInt32LE(sampleRate, 24); wave.writeUInt32LE(sampleRate * 2, 28);
  wave.writeUInt16LE(2, 32); wave.writeUInt16LE(16, 34); wave.write('data', 36); wave.writeUInt32LE(frames * 2, 40);
  for (let i = 0; i < frames; i++) wave.writeInt16LE(Math.round(Math.sin(i * Math.PI * 2 * frequency / sampleRate) * 12000), 44 + i * 2);
  return wave;
}
async function workspace(t) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'foldline-r2-voice-'));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  const rawDirectory = path.join(root, 'raw'); await fs.mkdir(rawDirectory);
  return { root, rawDirectory };
}
async function take(data, line, rawDirectory, frequency = 440) {
  const raw = fixtureWave(frequency), settings = data.characters[line.character].voice;
  await fs.writeFile(path.join(rawDirectory, `${line.id}.wav`), raw);
  return { id: line.id, character: line.character, voiceText: line.voiceText, file: `${line.id}.wav`,
    voice: 'English test provenance fixture', culture: 'en-GB', rate: settings.rate, volume: settings.volume, sha256: hash(raw) };
}
async function writeProduction(rawDirectory, lines, additions = {}) {
  const production = { version: 2, engine: 'Windows System.Speech', spokenLanguage: 'en', lines, ...additions };
  await fs.writeFile(path.join(rawDirectory, 'production.json'), JSON.stringify(production));
  return production;
}
async function createPackage(t, count = 2) {
  const locations = await workspace(t), data = dataFor(count), takes = [];
  for (const [index, line] of data.lines.entries()) takes.push(await take(data, line, locations.rawDirectory, 440 + index * 80));
  await writeProduction(locations.rawDirectory, takes);
  const manifest = await processVoiceAssets(data, locations);
  return { ...locations, data, takes, manifest };
}

test('an entirely missing English set is an honest subtitle fallback, strict delivery rejects it', async t => {
  const { root } = await workspace(t), data = dataFor();
  const result = await loadVoiceAssets(data, { root });
  assert.equal(result.assets.length, 0); assert.equal(result.report.generated.length, 0);
  assert.deepEqual(result.report.missing.map(line => line.id), data.lines.map(line => line.id));
  await assert.rejects(loadVoiceAssets(data, { root, strict: true }), /Missing Windows voice assets/);
});

test('stable IDs cannot package unmanifested WAV or a version 1 Chinese manifest', async t => {
  const { root } = await workspace(t), data = dataFor(1), line = data.lines[0];
  await fs.mkdir(path.dirname(path.join(root, line.file)), { recursive: true });
  await fs.writeFile(path.join(root, line.file), fixtureWave());
  await assert.rejects(loadVoiceAssets(data, { root }), /Unverified voice asset.*English manifest/);
  await fs.writeFile(path.join(root, 'assets/voice/l01/manifest.json'), JSON.stringify({ version: 1, generated: [] }));
  await assert.rejects(loadVoiceAssets(data, { root }), /old Chinese audio must not reuse stable line IDs/);
});

test('English processing records actual alternate English culture, hashes and separate voiceText', async t => {
  const { root, data, manifest } = await createPackage(t);
  assert.equal(manifest.version, 2); assert.equal(manifest.spokenLanguage, 'en');
  const result = await loadVoiceAssets(data, { root, strict: true });
  assert.equal(result.assets.length, 2); assert.equal(result.report.missing.length, 0);
  assert.equal(result.report.generated[0].culture, 'en-GB', 'actual English voice culture may differ from preferred en-US');
  assert.equal(manifest.generated[0].voiceText, data.lines[0].voiceText);
  assert.equal('text' in manifest.generated[0], false, 'ambiguous legacy subtitle field is not audio identity');
  assert.match(manifest.generated[0].rawSha256, /^[a-f0-9]{64}$/);
  assert.equal(result.buffers.get(data.lines[0].audioId).byteLength, result.assets[0].byteLength);
});

test('Chinese subtitle and display-name edits do not require an English rerecord; English edits do', async t => {
  const { root, rawDirectory, data } = await createPackage(t);
  const translated = structuredClone(data);
  translated.lines[0].subtitles['zh-CN'] = '只修改自然的中文字幕。';
  translated.characters[translated.lines[0].character].names['zh-CN'] = '测试显示名';
  assert.equal((await loadVoiceAssets(translated, { root, strict: true })).assets.length, 2);
  assert.equal((await processVoiceAssets(translated, { root, rawDirectory })).generated.length, 2);
  const rewritten = structuredClone(data);
  rewritten.lines[0].voiceText = rewritten.lines[0].subtitles.en = 'This is a new English line.';
  await assert.rejects(loadVoiceAssets(rewritten, { root }), /English voiceText changed/);
  await assert.rejects(processVoiceAssets(rewritten, { root, rawDirectory }), /Outdated or invalid English take metadata/);
});

test('Chinese takes, outdated rate, duplicate IDs and corrupted raw hashes are rejected before output changes', async t => {
  const { root, rawDirectory, data, takes } = await createPackage(t);
  const output = path.join(root, data.lines[0].file), before = await fs.readFile(output);
  for (const change of [take => { take.culture = 'zh-CN'; }, take => { take.rate += 1; }, take => { take.voiceText = 'Old text'; }]) {
    const records = structuredClone(takes); change(records[1]); await writeProduction(rawDirectory, records);
    await assert.rejects(processVoiceAssets(data, { root, rawDirectory }), /Outdated or invalid English take metadata/);
    assert.deepEqual(await fs.readFile(output), before);
  }
  await writeProduction(rawDirectory, [...takes, takes[0]]);
  await assert.rejects(processVoiceAssets(data, { root, rawDirectory }), /Duplicate/);
  await writeProduction(rawDirectory, takes);
  await fs.writeFile(path.join(rawDirectory, takes[1].file), fixtureWave(900));
  await assert.rejects(processVoiceAssets(data, { root, rawDirectory }), /Raw take hash differs/);
  assert.deepEqual(await fs.readFile(output), before);
});

test('replaced or malformed processed WAV cannot bypass the English package manifest', async t => {
  const { root, data } = await createPackage(t);
  await fs.writeFile(path.join(root, data.lines[0].file), fixtureWave(850));
  await assert.rejects(loadVoiceAssets(data, { root }), /Voice asset or English voiceText changed/);
  const manifestFile = path.join(root, 'assets/voice/l01/manifest.json');
  const manifest = JSON.parse(await fs.readFile(manifestFile, 'utf8'));
  manifest.generated[0].sha256 = hash(Buffer.from('not a wave'));
  await fs.writeFile(manifestFile, JSON.stringify(manifest));
  await fs.writeFile(path.join(root, data.lines[0].file), 'not a wave');
  await assert.rejects(loadVoiceAssets(data, { root }), /WAVE/);
});

test('a merged partial rerecord replaces its take and preserves untouched voice metadata and output', async t => {
  const { root, rawDirectory, data, takes } = await createPackage(t);
  const before = await loadVoiceAssets(data, { root, strict: true });
  const replacement = await take(data, data.lines[0], rawDirectory, 970);
  replacement.voice = 'Different English fixture voice';
  // This exercises the processor with the merged result of a one-ID rerecord.
  // Actual PowerShell execution/metadata writing is still a Windows-only check.
  const newRecords = [replacement];
  const merged = takes.filter(record => !newRecords.some(newRecord => newRecord.id === record.id)).concat(newRecords);
  await writeProduction(rawDirectory, merged);
  const manifest = await processVoiceAssets(data, { root, rawDirectory });
  const after = await loadVoiceAssets(data, { root, strict: true });
  assert.notEqual(after.report.generated[0].sha256, before.report.generated[0].sha256);
  assert.equal(after.report.generated[1].sha256, before.report.generated[1].sha256);
  assert.equal(manifest.generated[0].voice, replacement.voice);
  assert.equal(manifest.generated[1].voice, takes[1].voice);
});

test('partial English production packages only verified takes and rejects old raw metadata', async t => {
  const { root, rawDirectory } = await workspace(t), data = dataFor();
  const record = await take(data, data.lines[0], rawDirectory);
  await writeProduction(rawDirectory, [record]);
  const partial = await processVoiceAssets(data, { root, rawDirectory });
  assert.equal(partial.generated.length, 1); assert.deepEqual(partial.missing, [data.lines[1].id]);
  const loaded = await loadVoiceAssets(data, { root });
  assert.equal(loaded.assets.length, 1); assert.equal(loaded.report.missing.length, 1);
  await writeProduction(rawDirectory, [record], { version: 1 });
  await assert.rejects(processVoiceAssets(data, { root, rawDirectory }), /old Chinese audio must not reuse stable line IDs/);
});
