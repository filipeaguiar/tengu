import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';

const outDir = path.resolve('public');
fs.mkdirSync(outDir, { recursive: true });

for (const size of [192, 512]) {
  const png = makePng(size);
  fs.writeFileSync(path.join(outDir, `icon-${size}.png`), png);
}

function makePng(size) {
  const pixels = Buffer.alloc(size * size * 4);
  const cx = size / 2;
  const cy = size / 2;
  const radius = size * 0.42;
  const bg = hexToRgb('#111827');
  const accent = hexToRgb('#8b5cf6');
  const accent2 = hexToRgb('#22c55e');
  const white = hexToRgb('#f8fafc');

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const i = (y * size + x) * 4;
      const dx = x - cx;
      const dy = y - cy;
      const dist = Math.hypot(dx, dy);
      const t = Math.max(0, 1 - dist / radius);
      const glow = Math.max(0, 1 - Math.hypot(dx + size * 0.07, dy - size * 0.08) / (radius * 1.05));
      const pulse = Math.max(0, 1 - Math.hypot(dx - size * 0.05, dy + size * 0.05) / (radius * 1.1));
      pixels[i + 0] = mix(bg[0], accent[0], t * 0.7 + glow * 0.25);
      pixels[i + 1] = mix(bg[1], accent[1], t * 0.7 + pulse * 0.25);
      pixels[i + 2] = mix(bg[2], accent[2], t * 0.65);
      pixels[i + 3] = 255;
    }
  }

  drawRing(pixels, size, cx, cy, radius * 0.9, white, 0.92);
  drawPlayTriangle(pixels, size, accent2, white);

  const raw = Buffer.alloc((size * 4 + 1) * size);
  for (let y = 0; y < size; y++) {
    raw[(size * 4 + 1) * y] = 0;
    pixels.copy(raw, (size * 4 + 1) * y + 1, y * size * 4, (y + 1) * size * 4);
  }

  return encodePng(size, size, raw);
}

function drawRing(buffer, size, cx, cy, radius, color, alpha) {
  const inner = radius - Math.max(2, Math.round(size * 0.025));
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const d = Math.hypot(x - cx, y - cy);
      if (d <= radius && d >= inner) {
        paint(buffer, size, x, y, color, alpha);
      }
    }
  }
}

function drawPlayTriangle(buffer, size, primary, shadow) {
  const left = Math.round(size * 0.39);
  const top = Math.round(size * 0.31);
  const width = Math.round(size * 0.24);
  const height = Math.round(size * 0.38);

  for (let y = 0; y < height; y++) {
    const t = y / height;
    const xStart = left + Math.round(t * width * 0.25);
    const xEnd = left + width + Math.round(t * width * 0.25);
    for (let x = xStart; x <= xEnd; x++) {
      paint(buffer, size, x + 7, top + y + 7, shadow, 0.18);
    }
  }

  for (let y = 0; y < height; y++) {
    const t = y / height;
    const xStart = left + Math.round(t * width * 0.2);
    const xEnd = left + width + Math.round(t * width * 0.2);
    for (let x = xStart; x <= xEnd; x++) {
      paint(buffer, size, x, top + y, primary, 1);
    }
  }
}

function paint(buffer, size, x, y, color, alpha) {
  if (x < 0 || y < 0 || x >= size || y >= size) return;
  const i = (y * size + x) * 4;
  buffer[i + 0] = Math.round(buffer[i + 0] * (1 - alpha) + color[0] * alpha);
  buffer[i + 1] = Math.round(buffer[i + 1] * (1 - alpha) + color[1] * alpha);
  buffer[i + 2] = Math.round(buffer[i + 2] * (1 - alpha) + color[2] * alpha);
}

function encodePng(width, height, raw) {
  const chunks = [];
  chunks.push(signature());
  chunks.push(chunk('IHDR', ihdr(width, height)));
  chunks.push(chunk('IDAT', zlib.deflateSync(raw)));
  chunks.push(chunk('IEND', Buffer.alloc(0)));
  return Buffer.concat(chunks);
}

function signature() {
  return Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
}

function ihdr(width, height) {
  const data = Buffer.alloc(13);
  data.writeUInt32BE(width, 0);
  data.writeUInt32BE(height, 4);
  data[8] = 8;
  data[9] = 6;
  data[10] = 0;
  data[11] = 0;
  data[12] = 0;
  return data;
}

function chunk(type, data) {
  const name = Buffer.from(type);
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length, 0);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([name, data])), 0);
  return Buffer.concat([length, name, data, crc]);
}

function crc32(buffer) {
  let crc = 0xffffffff;
  for (const byte of buffer) {
    crc ^= byte;
    for (let i = 0; i < 8; i++) {
      crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1));
    }
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function hexToRgb(hex) {
  const clean = hex.replace('#', '');
  return [0, 2, 4].map((index) => Number.parseInt(clean.slice(index, index + 2), 16));
}

function mix(a, b, t) {
  return Math.round(a + (b - a) * Math.min(1, Math.max(0, t)));
}
