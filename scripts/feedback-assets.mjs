import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// Original deterministic non-speech greybox feedback, not substitute TTS.
const root = fileURLToPath(new URL('../', import.meta.url));
const definitions = [
  ['mechanism-turn', .32, 160, .35], ['mechanism-connect', .48, 260, .15],
  ['mechanism-return', .42, 100, .5], ['mechanism-inspect', .18, 440, .25],
];
export async function feedbackAssets() {
  const assets = [], buffers = new Map();
  for (const [id, duration, frequency, grit] of definitions) {
    const rate = 22050, length = Math.floor(duration * rate);
    const bytes = Buffer.alloc(44 + length * 2);
    bytes.write('RIFF'); bytes.writeUInt32LE(bytes.length - 8, 4); bytes.write('WAVEfmt ', 8);
    bytes.writeUInt32LE(16, 16); bytes.writeUInt16LE(1, 20); bytes.writeUInt16LE(1, 22);
    bytes.writeUInt32LE(rate, 24); bytes.writeUInt32LE(rate * 2, 28);
    bytes.writeUInt16LE(2, 32); bytes.writeUInt16LE(16, 34); bytes.write('data', 36);
    bytes.writeUInt32LE(length * 2, 40);
    let seed = 91;
    for (let i = 0; i < length; i++) {
      seed = (seed * 1664525 + 1013904223) >>> 0;
      const t = i / rate, envelope = Math.min(1, t / .012) * Math.exp(-t * 8) * Math.min(1, (duration - t) / .04);
      const value = Math.sin(2 * Math.PI * (frequency * t - frequency * .15 * t * t)) * (1 - grit) +
        (seed / 2147483648 - 1) * grit;
      bytes.writeInt16LE(Math.round(value * envelope * 12000), 44 + i * 2);
    }
    const file = path.join(root, 'assets/audio/prototype', `${id}.wav`);
    await fs.mkdir(path.dirname(file), { recursive: true }); await fs.writeFile(file, bytes);
    assets.push({ id, name: `原创机械原型 / ${id}`, mime: 'audio/wav', byteLength: bytes.length, stream: false });
    buffers.set(id, bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.length));
  }
  return { assets, buffers };
}
