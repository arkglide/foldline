import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { createDialogue, validateDialogue } from '../game/dialogue.js';
import { processPcmWave, readPcmWave } from '../scripts/voice-assets.mjs';

const data = JSON.parse(await fs.readFile(new URL('../game/data/l01-dialogue.json', import.meta.url), 'utf8'));
function harness({ input = data, available = input.lines.map(line => line.audioId), reject = false, duration = 1,
  storage = { async read() { return null; }, async write() {} } } = {}) {
  const calls = [], voices = [], speakers = [], hud = new Map();
  const ctx = { storage, audio: { list: () => available,
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
  const dialogue = createDialogue(ctx, input, { onSpeaker: (id, line) => speakers.push({ id, line: line?.id }) });
  function tick(dt, paused = false) {
    for (const voice of voices) if (voice.playing && !voice.paused && !paused) {
      voice.position += dt; if (voice.position >= voice.duration) voice.playing = false;
    }
    dialogue.update(dt, { paused });
  }
  return { dialogue, calls, voices, speakers, hud, tick };
}
function causalFixture() {
  const input = structuredClone(data);
  input.lines = data.lines.slice(0, 3).map((line, index) => ({ ...structuredClone(line), id: `line-${index}`,
    audioId: `voice-${index}`, trigger: index === 2 ? 'obsolete' : 'cause', delay: 0,
    duration: 1, maxAge: 4, priority: index === 1 ? 50 : 10, cancelOn: [] }));
  input.lines[0].cancelOn = ['obsolete'];
  input.lines[1].after = 'line-0';
  return input;
}

test('R2 data separates English voice and both subtitles, with valid unique assets and causal delivery', () => {
  assert.equal(validateDialogue(data), data);
  assert.equal(data.lines.length, 15);
  for (const event of ['court.enter', 'exit.seen', 'route.blocked', 'fold.ready', 'fold.crossed', 'upper.lookback', 'return.open', 'level.complete'])
    assert(data.lines.some(line => line.trigger === event), event);
  for (const line of data.lines) { assert.equal(line.voiceText, line.subtitles.en); assert(line.subtitles['zh-CN']); }
  const duplicate = structuredClone(data); duplicate.lines.push(duplicate.lines[0]);
  assert.throws(() => validateDialogue(duplicate), /unique/);
  const unsafe = structuredClone(data); unsafe.lines[0].file = '../secret.wav';
  assert.throws(() => validateDialogue(unsafe), /Invalid dialogue/);
  const missingLanguage = structuredClone(data); delete missingLanguage.lines[0].subtitles.en;
  assert.throws(() => validateDialogue(missingLanguage), /Invalid dialogue/);
  const notEnglish = structuredClone(data); notEnglish.characters.zhanque.voice.culture = 'zh-CN';
  assert.throws(() => validateDialogue(notEnglish), /bilingual/);
  const cycle = causalFixture(); cycle.lines[0].after = cycle.lines[1].id;
  assert.throws(() => validateDialogue(cycle), /after/);
  const missingDependency = causalFixture(); missingDependency.lines[1].after = 'missing';
  assert.throws(() => validateDialogue(missingDependency), /after/);
  const badDelivery = structuredClone(data); badDelivery.lines[0].delivery = 'loud';
  assert.throws(() => validateDialogue(badDelivery), /delivery/);
});

test('missing voice assets honestly report 0/15 and retain localized subtitles without replay', () => {
  const h = harness({ available: [] });
  assert.match(h.hud.get('audioStatus').text, /Windows.*0\/15/);
  assert(h.hud.get('audioStatus').visible);
  assert(h.dialogue.emit('court.enter')); assert.equal(h.dialogue.emit('court.enter'), false);
  h.tick(0);
  assert.equal(h.dialogue.snapshot().currentMode, 'subtitle');
  assert.equal(h.hud.get('dialogue').text, `栈雀：${data.lines[0].subtitles['zh-CN']}`);
  assert(h.hud.get('dialogue').visible); assert.equal(h.hud.get('audioStatus').visible, false);
  h.tick(data.lines[0].duration + .1); assert.equal(h.dialogue.snapshot().currentLine, null);
  assert.equal(h.dialogue.emit('court.enter'), false); assert.equal(h.calls.length, 0);
  h.dialogue.dispose(); assert.equal(h.hud.get('dialogue').visible, false);
});

test('switching an active subtitle updates text and name immediately without restarting English audio or its clock', () => {
  const h = harness({ duration: 12 }); h.dialogue.emit('court.enter'); h.tick(0); h.tick(1.2);
  const before = h.dialogue.snapshot();
  h.dialogue.setSubtitleLanguage('en');
  const after = h.dialogue.snapshot();
  assert.equal(after.currentLine, before.currentLine); assert.equal(after.elapsed, before.elapsed);
  assert.equal(after.currentText, data.lines[0].voiceText); assert.equal(after.localizedSpeaker, 'Zhanque');
  assert.equal(after.currentDelivery, data.lines[0].delivery);
  assert.equal(h.hud.get('dialogue').text, `Zhanque: ${data.lines[0].subtitles.en}`);
  assert.equal(h.calls.length, 1); assert.equal(h.calls[0].id, data.lines[0].audioId);
  assert.match(h.hud.get('dialogueSettings').text, /Voice: On.*Subtitles: On.*English/);
  h.tick(data.lines[0].duration + 1);
  assert.equal(h.dialogue.snapshot().currentLine, data.lines[0].id, 'live audio length determines line end, not fallback subtitle duration');
  h.dialogue.setSubtitleLanguage('zh-CN'); assert.equal(h.calls.length, 1);
  h.tick(12); assert.equal(h.dialogue.snapshot().currentLine, null);
  assert.throws(() => h.dialogue.setSubtitleLanguage('fr'), /Invalid dialogue preference/);
  h.dialogue.dispose();
});

test('serial priority queue never plays a reply before its parent actually starts', () => {
  const input = causalFixture(), h = harness({ input });
  h.dialogue.emit('cause'); h.tick(0);
  assert.equal(h.dialogue.snapshot().currentLine, 'line-0', 'higher-priority reply waits for actual parent');
  assert.equal(h.calls.length, 1);
  h.tick(1.1); h.tick(.7);
  assert.equal(h.dialogue.snapshot().currentLine, 'line-1'); assert.equal(h.calls.length, 2);
  assert.deepEqual(h.dialogue.snapshot().startedLines, ['line-0', 'line-1']);
  h.dialogue.dispose(); assert(h.voices.every(v => !v.playing));
});

test('a consumed event is insufficient for a reply, and cancelled or expired parents produce no orphan response', () => {
  const input = causalFixture(), h = harness({ input, duration: 8 });
  h.dialogue.emit('obsolete'); h.tick(0);
  h.dialogue.emit('cause'); h.tick(0);
  assert(!h.dialogue.snapshot().queue.includes('line-0'), 'past cancellation events prevent late hints');
  assert(h.dialogue.snapshot().queue.includes('line-1'), 'reply is waiting for a parent that never started');
  h.tick(5);
  assert(!h.dialogue.snapshot().queue.includes('line-1'));
  h.tick(4); h.tick(.7);
  assert.equal(h.dialogue.snapshot().currentLine, null);
  assert.deepEqual(h.dialogue.snapshot().startedLines, ['line-2']);
  assert.equal(h.dialogue.snapshot().cancelled, 1); assert.equal(h.dialogue.snapshot().expired, 1);
  h.dialogue.dispose();
});

test('new progression cancels queued observations without interrupting the line already playing', () => {
  const h = harness({ duration: 9 }); h.dialogue.emit('court.enter'); h.tick(0);
  h.dialogue.emit('exit.seen'); h.dialogue.emit('maintenance.observed'); h.dialogue.emit('fold.crossed');
  assert.equal(h.calls.length, 1); assert.equal(h.dialogue.snapshot().cancelled, 2);
  h.tick(9); h.tick(.7);
  assert.equal(h.dialogue.snapshot().currentLine, 'C01-L01-ZQ-006');
  assert.equal(h.calls[1].options.bus, 'CompanionVoice');
  h.dialogue.dispose();
});

test('pause freezes the voice and subtitle clock, then resumes the same line', () => {
  const h = harness({ duration: 9 }); h.dialogue.emit('court.enter'); h.tick(0); h.tick(.5);
  const before = h.dialogue.snapshot(), voice = h.voices[0];
  h.tick(0, true); assert(voice.paused); assert.equal(h.hud.get('dialogue').visible, false);
  h.tick(100, true);
  assert.equal(h.dialogue.snapshot().elapsed, before.elapsed); assert.equal(voice.position, .5);
  assert(h.hud.get('audioStatus').visible); assert(h.hud.get('dialogueSettings').visible);
  h.tick(0); assert.equal(voice.paused, false); assert(h.hud.get('dialogue').visible);
  assert.equal(h.dialogue.snapshot().currentLine, before.currentLine); assert.equal(h.calls.length, 1);
  h.dialogue.dispose();
});

test('checkpoint v1 stores event progression separately from settings and drops live audio/queue on restore', () => {
  const h = harness({ duration: 9 }); h.dialogue.emit('court.enter'); h.tick(0);
  h.dialogue.emit('exit.seen'); const checkpoint = h.dialogue.capture();
  assert.deepEqual(Object.keys(checkpoint).sort(), ['consumedEvents', 'startedLines', 'version']);
  h.dialogue.setSubtitleLanguage('en'); h.dialogue.setSubtitlesEnabled(false);
  h.dialogue.emit('fold.ready'); h.dialogue.restore(checkpoint);
  assert.equal(h.voices[0].playing, false); assert.equal(h.dialogue.snapshot().currentLine, null);
  assert.deepEqual(h.dialogue.snapshot().queue, []);
  assert.equal(h.dialogue.snapshot().subtitleLanguage, 'en'); assert.equal(h.dialogue.snapshot().subtitlesEnabled, false);
  assert.equal(h.dialogue.emit('court.enter'), false); assert.equal(h.dialogue.emit('exit.seen'), false);
  assert(h.dialogue.emit('fold.ready'), 'events after the checkpoint are allowed after restoration');
  h.tick(0); assert.equal(h.calls.length, 2);
  h.dialogue.reset(); assert.equal(h.voices[1].playing, false);
  assert(h.dialogue.emit('court.enter'), 'a full level retry starts a fresh event timeline');
  assert.throws(() => h.dialogue.restore({ version: 1, consumedEvents: ['unknown'], startedLines: [] }), /checkpoint/);
  h.dialogue.dispose();
});

test('voice/subtitles/language remain independent through retry; enabling voice never restarts a partial sentence', () => {
  const h = harness({ duration: 9 }); h.dialogue.emit('court.enter'); h.tick(0);
  h.dialogue.setSubtitlesEnabled(false); assert.equal(h.hud.get('dialogue').visible, false); assert(h.voices[0].playing);
  h.dialogue.setVoiceEnabled(false); assert.equal(h.voices[0].playing, false);
  h.dialogue.setSubtitleLanguage('en'); h.dialogue.reset(); h.dialogue.emit('exit.seen'); h.tick(0);
  assert.equal(h.calls.length, 1); assert.equal(h.hud.get('dialogue').visible, false);
  h.dialogue.setSubtitlesEnabled(true); assert(h.hud.get('dialogue').visible);
  h.dialogue.setVoiceEnabled(true); assert.equal(h.calls.length, 1);
  h.tick(5); h.tick(.7); h.dialogue.emit('level.complete'); h.tick(0); assert.equal(h.calls.length, 2);
  assert.equal(h.dialogue.snapshot().subtitleLanguage, 'en');
  h.dialogue.dispose(); assert.equal(h.dialogue.emit('route.blocked'), false);
});

test('failed native playback falls back without blocking events, retries, or later queue progress', () => {
  const h = harness({ reject: true }); h.dialogue.emit('court.enter'); h.tick(0);
  assert.equal(h.dialogue.snapshot().currentMode, 'subtitle'); assert.equal(h.dialogue.snapshot().errors.length, 1);
  h.tick(4); assert.equal(h.dialogue.snapshot().currentLine, null);
  h.dialogue.reset(); assert(h.dialogue.emit('court.enter')); h.tick(0);
  assert(h.hud.get('dialogue').visible); h.dialogue.dispose();
});

test('native read preference failure is non-blocking and a later explicit setting write can recover', async () => {
  let writes = 0;
  const h = harness({ storage: { async read() { throw Error('Storage blocked'); }, async write() { writes++; } } });
  h.dialogue.emit('court.enter'); h.tick(0); assert.equal(h.calls.length, 1, 'play does not wait for storage');
  await h.dialogue.ready;
  assert.equal(h.dialogue.snapshot().preferencesReady, true); assert.match(h.dialogue.snapshot().persistenceError, /blocked/);
  h.dialogue.setSubtitleLanguage('en');
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(writes, 1); assert.equal(h.dialogue.snapshot().persistenceError, null);
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
