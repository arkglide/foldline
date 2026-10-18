import fs from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { validateDialogue } from '../game/dialogue.js';

const repoRoot = fileURLToPath(new URL('../', import.meta.url));
const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');

/** Standard RIFF PCM16 only. WAV remains browser-decodable without external codecs. */
export function readPcmWave(bytes) {
  const b = Buffer.from(bytes);
  if (b.length < 44 || b.toString('ascii', 0, 4) !== 'RIFF' || b.toString('ascii', 8, 12) !== 'WAVE' || b.readUInt32LE(4) + 8 !== b.length)
    throw Error('Expected an intact RIFF/WAVE file');
  let format, pcm;
  for (let offset = 12; offset + 8 <= b.length;) {
    const name = b.toString('ascii', offset, offset + 4), size = b.readUInt32LE(offset + 4), start = offset + 8;
    if (start + size > b.length) throw Error('Truncated WAVE chunk');
    if (name === 'fmt ') {
      if (size < 16) throw Error('Invalid WAVE fmt chunk');
      format = { encoding: b.readUInt16LE(start), channels: b.readUInt16LE(start + 2), sampleRate: b.readUInt32LE(start + 4),
        blockAlign: b.readUInt16LE(start + 12), bits: b.readUInt16LE(start + 14) };
    }
    if (name === 'data') pcm = b.subarray(start, start + size);
    offset = start + size + (size % 2);
  }
  if (!format || !pcm || format.encoding !== 1 || format.bits !== 16 || ![1, 2].includes(format.channels) ||
    format.sampleRate < 8000 || format.sampleRate > 96000 || format.blockAlign !== format.channels * 2 || pcm.length % format.blockAlign)
    throw Error('Expected PCM16 mono/stereo WAVE at 8–96 kHz');
  const frames = pcm.length / format.blockAlign, duration = frames / format.sampleRate;
  if (duration < .1 || duration > 30) throw Error('Speech must last 0.1–30 seconds');
  const samples = new Float64Array(frames);
  let peak = 0;
  for (let frame = 0; frame < frames; frame++) {
    let value = 0;
    for (let channel = 0; channel < format.channels; channel++) value += pcm.readInt16LE(frame * format.blockAlign + channel * 2) / 32768;
    samples[frame] = value / format.channels; peak = Math.max(peak, Math.abs(samples[frame]));
  }
  if (peak < .0001) throw Error('Silent speech file rejected; do not use placeholder WAV assets');
  return { sampleRate: format.sampleRate, samples, duration, peak };
}

export function processPcmWave(bytes, processing) {
  const { sampleRate, samples } = readPcmWave(bytes);
  const hp = processing.highPassHz, lp = processing.lowPassHz, target = processing.peak;
  if (!(hp >= 0 && hp < lp && lp < sampleRate / 2 && target > 0 && target <= 1)) throw Error('Invalid speech filter settings');
  const highAlpha = Math.exp(-2 * Math.PI * hp / sampleRate), lowAlpha = 1 - Math.exp(-2 * Math.PI * lp / sampleRate);
  let previousInput = 0, high = 0, low = 0, peak = 0;
  const fadeFrames = Math.max(1, Math.round(sampleRate * .01));
  for (let i = 0; i < samples.length; i++) {
    const input = samples[i];
    high = highAlpha * (high + input - previousInput); previousInput = input;
    low += lowAlpha * (high - low);
    samples[i] = low * Math.min(1, i / fadeFrames, (samples.length - 1 - i) / fadeFrames);
    peak = Math.max(peak, Math.abs(samples[i]));
  }
  if (peak < .000001) throw Error('Filtering removed the complete signal');
  const output = Buffer.alloc(44 + samples.length * 2);
  output.write('RIFF', 0); output.writeUInt32LE(output.length - 8, 4); output.write('WAVEfmt ', 8);
  output.writeUInt32LE(16, 16); output.writeUInt16LE(1, 20); output.writeUInt16LE(1, 22);
  output.writeUInt32LE(sampleRate, 24); output.writeUInt32LE(sampleRate * 2, 28);
  output.writeUInt16LE(2, 32); output.writeUInt16LE(16, 34); output.write('data', 36);
  output.writeUInt32LE(samples.length * 2, 40);
  for (let i = 0; i < samples.length; i++) output.writeInt16LE(Math.max(-32768, Math.min(32767, Math.round(samples[i] * target / peak * 32767))), 44 + i * 2);
  return output;
}

export async function loadVoiceAssets(data, { root = repoRoot, strict = false } = {}) {
  validateDialogue(data);
  let manifest;
  try { manifest = JSON.parse(await fs.readFile(path.join(root, 'assets/voice/l01/manifest.json'), 'utf8')); }
  catch (error) { if (error.code !== 'ENOENT') throw error; }
  if (manifest && (manifest.version !== 1 || !Array.isArray(manifest.generated))) throw Error('Invalid voice asset manifest');
  const assets = [], buffers = new Map(), report = { generated: [], missing: [] };
  for (const line of data.lines) {
    let bytes;
    try { bytes = await fs.readFile(path.join(root, line.file)); }
    catch (error) {
      if (error.code !== 'ENOENT') throw error;
      report.missing.push({ id: line.id, character: line.character, file: line.file }); continue;
    }
    const wave = readPcmWave(bytes);
    if (manifest) {
      const record = manifest.generated.find(item => item.id === line.id);
      if (!record || record.file !== line.file || record.text !== line.subtitle || record.sha256 !== sha256(bytes))
        throw Error(`Voice asset or subtitle changed for ${line.id}; regenerate and process the take before packaging`);
    }
    const buffer = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
    buffers.set(line.audioId, buffer);
    assets.push({ id: line.audioId, name: `${data.characters[line.character].name} / ${line.id}`,
      mime: 'audio/wav', byteLength: bytes.byteLength, stream: false });
    report.generated.push({ id: line.id, file: line.file, duration: wave.duration, sha256: sha256(bytes), bytes: bytes.byteLength });
  }
  if (strict && report.missing.length) throw Error(`Missing Windows voice assets: ${report.missing.map(line => line.id).join(', ')}`);
  return { assets, buffers, report };
}

export async function processVoiceAssets(data, { root = repoRoot, rawDirectory = path.join(root, '.cache/voice/raw') } = {}) {
  validateDialogue(data);
  const production = JSON.parse(await fs.readFile(path.join(rawDirectory, 'production.json'), 'utf8'));
  if (production.version !== 1 || production.engine !== 'Windows System.Speech' || !Array.isArray(production.lines))
    throw Error('Expected provenance from scripts/tts.ps1 on Windows');
  const generated = [], missing = [], outputFiles = [];
  for (const line of data.lines) {
    const take = production.lines.find(take => take.id === line.id);
    if (!take) { missing.push(line.id); continue; }
    if (take.text !== line.subtitle || take.character !== line.character || take.culture !== data.characters[line.character].voice.culture ||
      take.file !== `${line.id}.wav` || typeof take.voice !== 'string' || !take.voice)
      throw Error(`Outdated or invalid take metadata for ${line.id}; regenerate this line on Windows`);
    const raw = await fs.readFile(path.join(rawDirectory, take.file));
    if (sha256(raw) !== take.sha256) throw Error(`Raw take hash differs for ${line.id}`);
    const processed = processPcmWave(raw, data.characters[line.character].processing);
    outputFiles.push({ target: path.join(root, line.file), processed });
    generated.push({ id: line.id, character: line.character, file: line.file, text: line.subtitle, voice: take.voice, rate: take.rate,
      culture: take.culture, duration: readPcmWave(processed).duration, sha256: sha256(processed), processing: data.characters[line.character].processing });
  }
  // Validate every take before writing any output, so a stale later sentence
  // cannot leave an apparently successful half-update of the voice package.
  for (const { target, processed } of outputFiles) {
    await fs.mkdir(path.dirname(target), { recursive: true }); await fs.writeFile(target, processed);
  }
  const manifest = { version: 1, engine: production.engine, generated, missing };
  const target = path.join(root, 'assets/voice/l01/manifest.json');
  await fs.mkdir(path.dirname(target), { recursive: true }); await fs.writeFile(target, JSON.stringify(manifest, null, 2) + '\n');
  return manifest;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const data = JSON.parse(await fs.readFile(path.join(repoRoot, 'game/data/l01-dialogue.json'), 'utf8'));
  const args = process.argv.slice(2);
  if (args.some(arg => !['--process', '--check', '--strict'].includes(arg))) throw Error('Usage: node scripts/voice-assets.mjs [--process] [--check] [--strict]');
  if (args.includes('--process')) {
    const result = await processVoiceAssets(data);
    console.log(`Windows takes processed: ${result.generated.length}; missing: ${result.missing.length}`);
  }
  const { report } = await loadVoiceAssets(data, { strict: args.includes('--strict') });
  console.log(JSON.stringify(report, null, 2));
}
