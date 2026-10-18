import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { createDialogue, validateDialogue } from '../game/dialogue.js';
import { loadVoiceAssets, processPcmWave, processVoiceAssets, readPcmWave } from '../scripts/voice-assets.mjs';

const data = JSON.parse(await fs.readFile(new URL('../game/data/l01-dialogue.json', import.meta.url), 'utf8'));
function harness({ available = data.lines.map(line => line.audioId), reject = false, duration = 1 } = {}) {
  const calls = [], voices = [], speakers = [], hud = new Map();
  const ctx = { audio: { list: () => available,
    play(id, options) {
      if (reject) throw Error('decoder unavailable');
      assert.equal(voices.filter(v => v.playing).length, 0, 'only one dialogue voice may be live');
      const voice = { id, options, playing: true, paused: false, position: 0, duration, stops: 0,
        stop() { this.playing = false; this.stops++; }, pause() { this.paused = true; }, resume() { this.paused = false; } };
      calls.push({ id, options }); voices.push(voice); return voice;
    } }, ui: { get(id) {
      if (!hud.has(id)) hud.set(id, { text: '', visible: false, setText(text) { this.text = text; }, setVisible(v) { this.visible = v; } });
      return hud.get(id);
    } } };
  const dialogue = createDialogue(ctx, data, { onSpeaker: (id, line) => speakers.push({ id, line: line?.id }) });
  function tick(dt, paused = false) {
    for (const voice of voices) if (voice.playing && !voice.paused && !paused) {
      voice.position += dt; if (voice.position >= voice.duration) voice.playing = false;
    }
    dialogue.update(dt, { paused });
  }
  return { dialogue, calls, voices, speakers, hud, tick };
}

test('L01 data has unique replaceable assets and all required event situations', () => {
  assert.equal(validateDialogue(data), data);
  for (const event of ['court.enter', 'exit.seen', 'route.blocked', 'fold.ready', 'fold.crossed', 'return.open', 'level.complete'])
    assert(data.lines.some(line => line.trigger === event), event);
  const duplicate = structuredClone(data); duplicate.lines.push(duplicate.lines[0]);
  assert.throws(() => validateDialogue(duplicate), /unique/);
  const unsafe = structuredClone(data); unsafe.lines[0].file = '../secret.wav';
  assert.throws(() => validateDialogue(unsafe), /Invalid dialogue/);
});

test('missing assets retain subtitles, never call audio.play, and repeated entry does not replay', () => {
  const h = harness({ available: [] });
  assert.match(h.hud.get('audioStatus').text, /Windows.*0\/11/);
  assert(h.hud.get('audioStatus').visible);
  assert(h.dialogue.emit('court.enter')); assert.equal(h.dialogue.emit('court.enter'), false);
  h.tick(0);
  assert.equal(h.dialogue.snapshot().currentMode, 'subtitle');
  assert.equal(h.hud.get('dialogue').text, `栈雀：${data.lines[0].subtitle}`);
  assert(h.hud.get('dialogue').visible); assert.equal(h.hud.get('audioStatus').visible, false);
  h.tick(4); assert.equal(h.dialogue.snapshot().currentLine, null);
  assert.equal(h.dialogue.emit('court.enter'), false); assert.equal(h.calls.length, 0);
  h.dialogue.dispose(); assert.equal(h.hud.get('dialogue').visible, false);
});

test('queued dialogue is serial, ordered by priority, and obsolete speculation is cancelled', () => {
  const h = harness();
  h.dialogue.emit('court.enter'); h.tick(0); assert.equal(h.calls.length, 1);
  h.dialogue.emit('exit.seen'); h.dialogue.emit('fold.ready'); h.dialogue.emit('fold.crossed');
  assert.equal(h.calls.length, 1, 'events never interrupt an active line');
  assert.equal(h.dialogue.snapshot().cancelled, 3, 'exit observation and both queued fold-ready lines are obsolete');
  h.tick(1.1); h.tick(.7);
  assert.equal(h.calls.length, 2);
  assert.equal(h.dialogue.snapshot().currentLine, 'C01-L01-ZQ-006');
  assert.equal(h.calls[1].options.bus, 'CompanionVoice');
  h.tick(1.1); h.tick(.7);
  h.dialogue.emit('level.complete'); h.tick(0);
  assert.equal(h.dialogue.snapshot().currentLine, 'C01-L01-HW-003');
  assert.equal(h.calls.at(-1).options.bus, 'BroadcastVoice');
  h.dialogue.dispose(); assert(h.voices.every(v => !v.playing));
});

test('pause freezes the voice and subtitle clock, then resumes the same line', () => {
  const h = harness({ duration: 9 }); h.dialogue.emit('court.enter'); h.tick(0); h.tick(.5);
  const before = h.dialogue.snapshot(), voice = h.voices[0];
  h.tick(0, true); assert(voice.paused); assert.equal(h.hud.get('dialogue').visible, false);
  h.tick(100, true);
  assert.equal(h.dialogue.snapshot().elapsed, before.elapsed); assert.equal(voice.position, .5);
  assert(h.hud.get('audioStatus').visible);
  h.tick(0); assert.equal(voice.paused, false); assert(h.hud.get('dialogue').visible);
  assert.equal(h.dialogue.snapshot().currentLine, before.currentLine); assert.equal(h.calls.length, 1);
  h.dialogue.dispose();
});

test('checkpoint restore stops transient audio, drops queued speech, and does not replay consumed events', () => {
  const h = harness({ duration: 9 }); h.dialogue.emit('court.enter'); h.tick(0);
  h.dialogue.emit('exit.seen'); const checkpoint = h.dialogue.capture();
  h.dialogue.emit('fold.ready'); h.dialogue.restore(checkpoint);
  assert.equal(h.voices[0].playing, false); assert.equal(h.dialogue.snapshot().currentLine, null);
  assert.deepEqual(h.dialogue.snapshot().queue, []);
  assert.equal(h.dialogue.emit('court.enter'), false); assert.equal(h.dialogue.emit('exit.seen'), false);
  assert(h.dialogue.emit('fold.ready'), 'events after the checkpoint are allowed after restoration');
  h.tick(0); assert.equal(h.calls.length, 2);
  h.dialogue.reset(); assert.equal(h.voices[1].playing, false);
  assert(h.dialogue.emit('court.enter'), 'a full level retry starts a fresh event timeline');
  assert.throws(() => h.dialogue.restore({ version: 1, consumedEvents: ['unknown'], startedLines: [] }), /checkpoint/);
  h.dialogue.dispose();
});

test('voice and subtitle preferences are independent and survive a level retry', () => {
  const h = harness({ duration: 9 }); h.dialogue.emit('court.enter'); h.tick(0);
  h.dialogue.setSubtitlesEnabled(false); assert.equal(h.hud.get('dialogue').visible, false); assert(h.voices[0].playing);
  h.dialogue.setVoiceEnabled(false); assert.equal(h.voices[0].playing, false);
  h.dialogue.reset(); h.dialogue.emit('exit.seen'); h.tick(0);
  assert.equal(h.calls.length, 1); assert.equal(h.hud.get('dialogue').visible, false);
  h.dialogue.setSubtitlesEnabled(true); assert(h.hud.get('dialogue').visible);
  h.dialogue.setVoiceEnabled(true); assert.equal(h.calls.length, 1, 'do not restart a sentence halfway through');
  h.tick(4); h.tick(.7); h.dialogue.emit('level.complete'); h.tick(0); assert.equal(h.calls.length, 2);
  h.dialogue.dispose(); assert.equal(h.dialogue.emit('route.blocked'), false);
});

test('failed native playback falls back without blocking events or retry', () => {
  const h = harness({ reject: true }); h.dialogue.emit('court.enter'); h.tick(0);
  assert.equal(h.dialogue.snapshot().currentMode, 'subtitle'); assert.equal(h.dialogue.snapshot().errors.length, 1);
  h.tick(4); assert.equal(h.dialogue.snapshot().currentLine, null);
  h.dialogue.reset(); assert(h.dialogue.emit('court.enter')); h.tick(0);
  assert(h.hud.get('dialogue').visible); h.dialogue.dispose();
});

test('stale events expire rather than playing an old location hint later', () => {
  const h = harness({ duration: 25 }); h.dialogue.emit('level.complete'); h.tick(0);
  h.dialogue.emit('court.enter'); h.tick(9);
  assert.equal(h.dialogue.snapshot().expired, 1); assert(!h.dialogue.snapshot().queue.includes('C01-L01-ZQ-001'));
  h.dialogue.dispose();
});

function fixtureWave(seconds = .3) {
  // Synthetic signal is exclusively a temporary unit fixture, never shipped as dialogue.
  const sampleRate = 22050, frames = Math.round(sampleRate * seconds), wave = Buffer.alloc(44 + frames * 2);
  wave.write('RIFF'); wave.writeUInt32LE(wave.length - 8, 4); wave.write('WAVEfmt ', 8);
  wave.writeUInt32LE(16, 16); wave.writeUInt16LE(1, 20); wave.writeUInt16LE(1, 22);
  wave.writeUInt32LE(sampleRate, 24); wave.writeUInt32LE(sampleRate * 2, 28); wave.writeUInt16LE(2, 32); wave.writeUInt16LE(16, 34);
  wave.write('data', 36); wave.writeUInt32LE(frames * 2, 40);
  for (let i = 0; i < frames; i++) wave.writeInt16LE(Math.round(Math.sin(i * Math.PI * 2 * 440 / sampleRate) * 12000), 44 + i * 2);
  return wave;
}

test('PCM processing preserves browser-decodable duration, controls peak, fades edges, and rejects invalid/silent WAV', () => {
  const raw = fixtureWave(), output = processPcmWave(raw, data.characters.hengwu.processing);
  const parsed = readPcmWave(output);
  assert.equal(parsed.duration, readPcmWave(raw).duration);
  assert(Math.abs(parsed.peak - data.characters.hengwu.processing.peak) < .0001);
  assert.equal(parsed.samples[0], 0); assert.equal(parsed.samples.at(-1), 0);
  assert.throws(() => readPcmWave(Buffer.from('not a wave')), /WAVE/);
  const silent = Buffer.from(raw); silent.fill(0, 44); assert.throws(() => readPcmWave(silent), /Silent/);
});

test('asset loading reports missing files honestly and only packages validated local WAV', async t => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'foldline-voice-assets-'));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  const empty = await loadVoiceAssets(data, { root });
  assert.equal(empty.assets.length, 0); assert.equal(empty.report.missing.length, 11);
  await assert.rejects(loadVoiceAssets(data, { root, strict: true }), /Missing Windows/);
  const line = data.lines[0], file = path.join(root, line.file);
  await fs.mkdir(path.dirname(file), { recursive: true }); await fs.writeFile(file, fixtureWave());
  const partial = await loadVoiceAssets(data, { root });
  assert.equal(partial.assets.length, 1); assert.equal(partial.report.missing.length, 10);
  assert.equal(partial.buffers.get(line.audioId).byteLength, partial.assets[0].byteLength);
  await fs.writeFile(file, 'invalid'); await assert.rejects(loadVoiceAssets(data, { root }), /WAVE/);
});

test('offline processing checks take text and hashes before producing an asset manifest', async t => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'foldline-voice-process-'));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  const rawDirectory = path.join(root, 'raw'), line = data.lines[0], raw = fixtureWave();
  await fs.mkdir(rawDirectory);
  await fs.writeFile(path.join(rawDirectory, `${line.id}.wav`), raw);
  // Metadata is a test fixture for validator coverage, not evidence of generated Windows audio.
  const metadata = { version: 1, engine: 'Windows System.Speech', lines: [{ id: line.id, text: line.subtitle,
    character: line.character, file: `${line.id}.wav`, voice: 'Unit Fixture', culture: 'zh-CN', rate: 1,
    sha256: createHash('sha256').update(raw).digest('hex') }] };
  const production = path.join(rawDirectory, 'production.json');
  await fs.writeFile(production, JSON.stringify(metadata));
  const manifest = await processVoiceAssets(data, { root, rawDirectory });
  assert.equal(manifest.generated.length, 1); assert.equal(manifest.missing.length, 10);
  assert.equal((await loadVoiceAssets(data, { root })).assets.length, 1);
  const changedData = structuredClone(data); changedData.lines[0].subtitle = 'different subtitle';
  await assert.rejects(loadVoiceAssets(changedData, { root }), /subtitle changed/);
  metadata.lines[0].text = 'outdated'; await fs.writeFile(production, JSON.stringify(metadata));
  await assert.rejects(processVoiceAssets(data, { root, rawDirectory }), /Outdated/);
  metadata.lines[0].text = line.subtitle; metadata.lines[0].sha256 = 'wrong'; await fs.writeFile(production, JSON.stringify(metadata));
  await assert.rejects(processVoiceAssets(data, { root, rawDirectory }), /hash differs/);
});
