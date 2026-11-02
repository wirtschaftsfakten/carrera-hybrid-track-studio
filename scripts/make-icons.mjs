// Renders the app icons (hexagon track logo) as PNG without extra dependencies.
import { writeFileSync, mkdirSync } from 'node:fs';
import { deflateSync } from 'node:zlib';

const OUT = new URL('../public/icons/', import.meta.url);
mkdirSync(OUT, { recursive: true });

const BG = [18, 21, 28];
const TRACK = [38, 42, 51];
const RED = [227, 6, 27];
const BLUE = [30, 107, 255];

// hexagon in a 64-unit design space (same as the in-app logo)
const HEX = [[32, 10], [51, 21], [51, 43], [32, 54], [13, 43], [13, 21]];
const segs = HEX.map((p, i) => [p, HEX[(i + 1) % 6], i < 2 ? RED : BLUE]);

function distSeg(px, py, [ax, ay], [bx, by]) {
  const dx = bx - ax, dy = by - ay;
  const t = Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / (dx * dx + dy * dy)));
  return Math.hypot(px - ax - t * dx, py - ay - t * dy);
}

function render(size, scale) {
  const px = Buffer.alloc(size * size * 3);
  const ss = 4; // supersampling
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const acc = [0, 0, 0];
      for (let sy = 0; sy < ss; sy++) {
        for (let sx = 0; sx < ss; sx++) {
          // map pixel to design space, centred, scaled
          const u = 32 + (((x + (sx + 0.5) / ss) / size) * 64 - 32) / scale;
          const v = 32 + (((y + (sy + 0.5) / ss) / size) * 64 - 32) / scale;
          let c = BG;
          let dTrack = Infinity;
          let edge = null;
          for (const [a, b, col] of segs) {
            const d = distSeg(u, v, a, b);
            if (d < dTrack) dTrack = d;
            if (d < 1.6 && !edge) edge = col;
          }
          if (dTrack < 5) c = TRACK;
          if (edge) c = edge;
          acc[0] += c[0]; acc[1] += c[1]; acc[2] += c[2];
        }
      }
      const i = (y * size + x) * 3;
      px[i] = acc[0] / (ss * ss);
      px[i + 1] = acc[1] / (ss * ss);
      px[i + 2] = acc[2] / (ss * ss);
    }
  }
  return png(size, px);
}

function crc32(buf) {
  let c, crc = 0xffffffff;
  for (let n = 0; n < buf.length; n++) {
    c = (crc ^ buf[n]) & 0xff;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    crc = (crc >>> 8) ^ c;
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(td));
  return Buffer.concat([len, td, crc]);
}

function png(size, rgb) {
  const raw = Buffer.alloc((size * 3 + 1) * size);
  for (let y = 0; y < size; y++) rgb.copy(raw, y * (size * 3 + 1) + 1, y * size * 3, (y + 1) * size * 3);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; ihdr[9] = 2; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw)),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

writeFileSync(new URL('icon-192.png', OUT), render(192, 1.15));
writeFileSync(new URL('icon-512.png', OUT), render(512, 1.15));
writeFileSync(new URL('apple-touch-icon.png', OUT), render(180, 1.05));
writeFileSync(new URL('icon-maskable-512.png', OUT), render(512, 0.8));
writeFileSync(
  new URL('icon.svg', OUT),
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><rect width="64" height="64" rx="14" fill="#12151c"/><path d="M32 10 L51 21 L51 43 L32 54 L13 43 L13 21 Z" fill="none" stroke="#262a33" stroke-width="10" stroke-linejoin="round"/><path d="M32 10 L51 21 L51 43" fill="none" stroke="#e3061b" stroke-width="3" stroke-linejoin="round"/><path d="M51 43 L32 54 L13 43 L13 21 L32 10" fill="none" stroke="#1e6bff" stroke-width="3" stroke-linejoin="round"/></svg>\n`,
);
console.log('Icons geschrieben.');
