// 渲染应用图标源 PNG（1024px）——scripts/icon.svg 的纯 Node 等价实现，
// 零依赖（node:zlib + 手写 PNG chunk），离线可用。
// 产物 src-tauri/icons/icon-source.png，供 `pnpm tauri icon` 生成全套 ico/icns/png（M7-9）。
import { deflateSync } from "node:zlib";
import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const S = 1024;
const INK = [0x10, 0x11, 0x13];
const GREEN = [0x4c, 0xc3, 0x8a];
const R = 185;

// 品牌切块 = BrandMark（viewBox 24 → 40 倍 + 居中平移 32,32）
const P1 = [
  [272, 212],
  [664, 212],
  [540, 472],
  [272, 472],
];
const P2 = [
  [488, 552],
  [752, 552],
  [752, 812],
  [356, 812],
];

function insideRounded(x, y) {
  const cx = Math.min(Math.max(x, R), S - R);
  const cy = Math.min(Math.max(y, R), S - R);
  const dx = x - cx;
  const dy = y - cy;
  return dx * dx + dy * dy <= R * R;
}

// 凸四边形内点判定（叉积符号一致）
function insidePoly(x, y, pts) {
  let sign = 0;
  for (let i = 0; i < 4; i++) {
    const [x1, y1] = pts[i];
    const [x2, y2] = pts[(i + 1) % 4];
    const cross = (x2 - x1) * (y - y1) - (y2 - y1) * (x - x1);
    if (cross !== 0) {
      const s = cross > 0 ? 1 : -1;
      if (sign === 0) sign = s;
      else if (s !== sign) return false;
    }
  }
  return true;
}

// 3×3 超采样抗锯齿
const SAMPLES = 3;
const px = new Uint8Array(S * S * 4);
for (let y = 0; y < S; y++) {
  for (let x = 0; x < S; x++) {
    let bg = 0;
    let mark = 0;
    for (let sy = 0; sy < SAMPLES; sy++) {
      for (let sx = 0; sx < SAMPLES; sx++) {
        const sxp = x + (sx + 0.5) / SAMPLES;
        const syp = y + (sy + 0.5) / SAMPLES;
        if (insideRounded(sxp, syp)) {
          bg++;
          if (insidePoly(sxp, syp, P1) || insidePoly(sxp, syp, P2)) mark++;
        }
      }
    }
    const i = (y * S + x) * 4;
    const n = SAMPLES * SAMPLES;
    if (bg === 0) {
      px[i + 3] = 0;
      continue;
    }
    const markA = mark / n;
    px[i] = Math.round(INK[0] * (1 - markA) + GREEN[0] * markA);
    px[i + 1] = Math.round(INK[1] * (1 - markA) + GREEN[1] * markA);
    px[i + 2] = Math.round(INK[2] * (1 - markA) + GREEN[2] * markA);
    px[i + 3] = 255;
  }
}

// ---- PNG 编码（RGBA8，逐行 filter 0）----
const crcTable = (() => {
  const t = new Int32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c;
  }
  return t;
})();
function crc32(buf) {
  let c = 0xffffffff;
  for (const b of buf) c = crcTable[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}
function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, "ascii"), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([len, body, crc]);
}

const ihdr = Buffer.alloc(13);
ihdr.writeUInt32BE(S, 0);
ihdr.writeUInt32BE(S, 4);
ihdr[8] = 8; // bit depth
ihdr[9] = 6; // RGBA
const raw = Buffer.alloc(S * (S * 4 + 1));
for (let y = 0; y < S; y++) {
  const rowStart = y * (S * 4 + 1);
  raw[rowStart] = 0; // filter: none
  Buffer.from(px.buffer, y * S * 4, S * 4).copy(raw, rowStart + 1);
}
const png = Buffer.concat([
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
  chunk("IHDR", ihdr),
  chunk("IDAT", deflateSync(raw, { level: 9 })),
  chunk("IEND", Buffer.alloc(0)),
]);

const out = join(dirname(fileURLToPath(import.meta.url)), "..", "src-tauri", "icons", "icon-source.png");
writeFileSync(out, png);
console.log(`rendered ${out} (${png.length} bytes)`);
