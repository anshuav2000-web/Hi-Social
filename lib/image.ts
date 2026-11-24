/** Minimal, dependency-free image dimension sniffing for PNG/JPEG/GIF/WebP. */
export function imageSize(buffer: Buffer): { width: number; height: number } | null {
  try {
    if (buffer.length > 24 && buffer.readUInt32BE(0) === 0x89504e47) {
      return { width: buffer.readUInt32BE(16), height: buffer.readUInt32BE(20) };
    }
    if (buffer.length > 10 && buffer.toString("ascii", 0, 3) === "GIF") {
      return { width: buffer.readUInt16LE(6), height: buffer.readUInt16LE(8) };
    }
    if (buffer.length > 30 && buffer.toString("ascii", 0, 4) === "RIFF" && buffer.toString("ascii", 8, 12) === "WEBP") {
      const format = buffer.toString("ascii", 12, 16);
      if (format === "VP8X") {
        const width = 1 + (buffer.readUIntLE(24, 3) & 0xffffff);
        const height = 1 + (buffer.readUIntLE(27, 3) & 0xffffff);
        return { width, height };
      }
      if (format === "VP8 ") {
        return { width: buffer.readUInt16LE(26) & 0x3fff, height: buffer.readUInt16LE(28) & 0x3fff };
      }
      if (format === "VP8L") {
        const bits = buffer.readUInt32LE(21);
        return { width: (bits & 0x3fff) + 1, height: ((bits >> 14) & 0x3fff) + 1 };
      }
    }
    if (buffer.length > 4 && buffer[0] === 0xff && buffer[1] === 0xd8) {
      let offset = 2;
      while (offset < buffer.length - 9) {
        if (buffer[offset] !== 0xff) {
          offset += 1;
          continue;
        }
        const marker = buffer[offset + 1]!;
        const size = buffer.readUInt16BE(offset + 2);
        if (marker >= 0xc0 && marker <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(marker)) {
          return { height: buffer.readUInt16BE(offset + 5), width: buffer.readUInt16BE(offset + 7) };
        }
        offset += 2 + size;
      }
    }
    if (buffer.toString("utf8", 0, 5).toLowerCase().includes("<svg")) {
      const text = buffer.toString("utf8", 0, 2000);
      const w = /width="(\d+)"/.exec(text)?.[1];
      const h = /height="(\d+)"/.exec(text)?.[1];
      if (w && h) return { width: Number(w), height: Number(h) };
      return { width: 1080, height: 1080 };
    }
  } catch {
    return null;
  }
  return null;
}

export function aspectLabel(width: number | null, height: number | null): string {
  if (!width || !height) return "—";
  const ratio = width / height;
  const known: [number, string][] = [
    [1, "1:1"],
    [0.8, "4:5"],
    [1.7778, "16:9"],
    [0.5625, "9:16"],
    [1.3333, "4:3"],
  ];
  const match = known.find(([r]) => Math.abs(r - ratio) < 0.03);
  return match ? match[1] : `${ratio.toFixed(2)}:1`;
}
