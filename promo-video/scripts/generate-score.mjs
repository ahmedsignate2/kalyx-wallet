import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "../public/kalyx-score.wav");
const sampleRate = 48_000;
const seconds = 60;
const channels = 2;
const samples = sampleRate * seconds;
const bytesPerSample = 2;
const dataBytes = samples * channels * bytesPerSample;
const buffer = Buffer.alloc(44 + dataBytes);

buffer.write("RIFF", 0);
buffer.writeUInt32LE(36 + dataBytes, 4);
buffer.write("WAVE", 8);
buffer.write("fmt ", 12);
buffer.writeUInt32LE(16, 16);
buffer.writeUInt16LE(1, 20);
buffer.writeUInt16LE(channels, 22);
buffer.writeUInt32LE(sampleRate, 24);
buffer.writeUInt32LE(sampleRate * channels * bytesPerSample, 28);
buffer.writeUInt16LE(channels * bytesPerSample, 32);
buffer.writeUInt16LE(16, 34);
buffer.write("data", 36);
buffer.writeUInt32LE(dataBytes, 40);

const chords = [
  [146.83, 174.61, 220, 261.63],
  [116.54, 146.83, 174.61, 220],
  [87.31, 130.81, 174.61, 220],
  [130.81, 164.81, 196, 246.94],
];
const bar = 60 / 84 * 4;
const TAU = Math.PI * 2;
const clampSample = (value) => Math.max(-1, Math.min(1, value));

await mkdir(dirname(root), { recursive: true });
for (let i = 0; i < samples; i++) {
  const time = i / sampleRate;
  const chordIndex = Math.floor(time / bar) % chords.length;
  const chordTime = time % bar;
  const chord = chords[chordIndex];
  const attack = Math.min(1, chordTime / 1.8);
  const release = Math.min(1, (bar - chordTime) / 0.6);
  const padEnvelope = Math.min(attack, release);
  let left = 0;
  let right = 0;

  chord.forEach((frequency, index) => {
    const fundamental = Math.sin(TAU * frequency * time);
    const overtone = Math.sin(TAU * frequency * 2.003 * time + index * 0.17) * 0.17;
    const voice = (fundamental + overtone) * padEnvelope * (index === 0 ? 0.11 : 0.065);
    left += voice * (index % 2 === 0 ? 1 : 0.78);
    right += voice * (index % 2 === 0 ? 0.78 : 1);
  });

  const beatTime = time % (60 / 84);
  const bellEnvelope = Math.exp(-beatTime * 4.4);
  const bellFrequency = chord[(Math.floor(time / (60 / 84)) + chordIndex) % chord.length] * 2;
  const bell = Math.sin(TAU * bellFrequency * time) * bellEnvelope * 0.055;
  const lowPulseEnvelope = Math.exp(-beatTime * 5.2);
  const pulse = Math.sin(TAU * 48 * time) * lowPulseEnvelope * 0.035;
  const fadeIn = Math.min(1, time / 2.5);
  const fadeOut = Math.min(1, (seconds - time) / 3.2);
  const master = Math.min(fadeIn, fadeOut) * 0.88;

  left = clampSample((left + bell + pulse) * master);
  right = clampSample((right + bell * 0.94 + pulse * 0.82) * master);
  buffer.writeInt16LE(Math.round(left * 32767), 44 + i * 4);
  buffer.writeInt16LE(Math.round(right * 32767), 46 + i * 4);
}

await writeFile(root, buffer);
console.log(`Score exportée : ${root} (${seconds} s, ${sampleRate} Hz, stéréo).`);
