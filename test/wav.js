// Lit un WAV PCM 16 bits mono et renvoie des échantillons flottants.
const fs = require("node:fs");
function readWav(file) {
  const buffer = fs.readFileSync(file);
  let offset = 12;
  while (offset < buffer.length) {
    const id = buffer.toString("ascii", offset, offset + 4);
    const size = buffer.readUInt32LE(offset + 4);
    if (id === "data") {
      const samples = new Float32Array(size / 2);
      for (let i = 0; i < samples.length; i++) samples[i] = buffer.readInt16LE(offset + 8 + i * 2) / 32768;
      return samples;
    }
    offset += 8 + size + (size % 2);
  }
  throw new Error("WAV sans données");
}
module.exports = { readWav };
