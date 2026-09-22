#!/usr/bin/env node
/**
 * 生成 PWA / iOS 所需的 PNG 图标（零依赖：自带 SDF 光栅化 + PNG 编码）。
 *
 * 用法：node tools/gen-icons.mjs
 * 产物写在 app/public/：
 *   icon-192.png            Android / manifest
 *   icon-512.png            Android / splash
 *   icon-maskable-512.png   Android 自适应图标（内容收在安全区内）
 *   apple-touch-icon-180.png iOS 添加到主屏幕
 *
 * 图形与 app/public/icon.svg 同源：蓝色圆角方块 + 白色 "AI" 字样。
 * 改图只需要动本文件的 SHAPES，然后重跑脚本。
 */
import zlib from "node:zlib";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const OUT_DIR = path.join(ROOT, "app", "public");

/* ---------- 几何：全部基于 192x192 设计稿坐标 ---------- */

const BRAND = "#3b82f6";

/**
 * "A" 的字形：左右两条等宽斜腿 + 一条横杠，顶部留出平口。
 * 设计稿坐标 62x72（宽 x 高）。
 */
function letterA(x, y, w, h) {
  const sx = (v) => x + (v / 62) * w;
  const sy = (v) => y + (v / 72) * h;
  return [
    { type: "poly", points: [[sx(0), sy(72)], [sx(26), sy(0)], [sx(36), sy(0)], [sx(14), sy(72)]] },
    { type: "poly", points: [[sx(62), sy(72)], [sx(36), sy(0)], [sx(26), sy(0)], [sx(48), sy(72)]] },
    { type: "rect", x: sx(9), y: sy(46), w: sx(53) - sx(9), h: sy(58) - sy(46), r: 1 }
  ];
}

/** "I" 的字形：竖杠。 */
function letterI(x, y, w, h) {
  return [{ type: "rect", x, y, w, h, r: 2 }];
}

/**
 * 画布形状表。scale 用于 maskable 缩小内容，radius 用于圆角。
 * 说明：glyph 组在设计稿里水平居中于 96。
 */
function buildShapes({ size, radius, glyphScale, glyphFill, bgFill }) {
  const s = (v) => (v / 192) * size;
  const shapes = [{ type: "roundRect", x: 0, y: 0, w: size, h: size, r: s(radius), fill: bgFill }];

  const k = 80 / 72; // 让 "AI" 撑满一些
  const aWidth = s(62 * k), iWidth = s(14 * k), gap = s(18 * k);
  const glyphWidth = aWidth + gap + iWidth;
  const glyphHeight = s(80);
  const glyphX = size / 2 - glyphWidth / 2;
  const glyphY = size / 2 - glyphHeight / 2 + s(6);

  // 以字形组中心对齐画布中心，glyphScale 围绕该中心缩放
  const cx = size / 2, cy = size / 2;
  const groupCx = glyphX + glyphWidth / 2;
  const groupCy = glyphY + glyphHeight / 2;
  const tx = (px) => cx + (px - groupCx) * glyphScale;
  const ty = (py) => cy + (py - groupCy) * glyphScale;
  const push = (list) =>
    list.forEach((shape) => {
      const moved = { ...shape, fill: glyphFill };
      if ("points" in shape) {
        moved.points = shape.points.map(([px, py]) => [tx(px), ty(py)]);
        if (shape.holes) {
          moved.holes = shape.holes.map((hole) => hole.map(([px, py]) => [tx(px), ty(py)]));
        }
      } else {
        moved.x = tx(shape.x);
        moved.y = ty(shape.y);
        moved.w = shape.w * glyphScale;
        moved.h = shape.h * glyphScale;
        moved.r = (shape.r ?? 0) * glyphScale;
      }
      shapes.push(moved);
    });

  push(letterA(glyphX, glyphY, aWidth, glyphHeight));
  push(letterI(glyphX + aWidth + gap, glyphY, iWidth, glyphHeight));
  return shapes;
}

/* ---------- 命中测试 ---------- */

function insideRoundRect(px, py, shape) {
  const { x, y, w, h, r } = shape;
  if (px < x || py < y || px > x + w || py > y + h) return false;
  if (!r) return true;
  const dx = Math.min(Math.max(px, x + r), x + w - r);
  const dy = Math.min(Math.max(py, y + r), y + h - r);
  const ox = px - dx, oy = py - dy;
  return ox * ox + oy * oy <= r * r;
}

function polygonHits(points, px, py) {
  let inside = false;
  for (let i = 0, j = points.length - 1; i < points.length; j = i++) {
    const [xi, yi] = points[i];
    const [xj, yj] = points[j];
    if (yi > py !== yj > py && px < ((xj - xi) * (py - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

function pointInPoly(shape, px, py) {
  if (!polygonHits(shape.points, px, py)) return false;
  // even-odd：落在洞里就挖掉
  if (shape.holes?.some((hole) => polygonHits(hole, px, py))) return false;
  return true;
}

function hit(shape, px, py) {
  if (shape.type === "roundRect" || shape.type === "rect") return insideRoundRect(px, py, shape);
  if (shape.type === "poly") return pointInPoly(shape, px, py);
  if (shape.type === "circle") {
    const dx = px - shape.x, dy = py - shape.y;
    return dx * dx + dy * dy <= shape.r * shape.r;
  }
  throw new Error(`未知形状 ${shape.type}`);
}

function hexToRgb(hex) {
  const v = parseInt(hex.replace("#", ""), 16);
  return [(v >> 16) & 255, (v >> 8) & 255, v & 255];
}

/* ---------- 光栅化：4x 超采样后盒式降采样，得到抗锯齿边缘 ---------- */

const SS = 4;

function render(size, shapes) {
  const big = size * SS;
  const acc = new Float64Array(size * size * 3);
  const rgb = shapes.map((s) => hexToRgb(s.fill));

  for (let by = 0; by < big; by++) {
    for (let bx = 0; bx < big; bx++) {
      // 采样点换算回输出坐标（形状表也用输出坐标），子像素偏移即为超采样
      const sx = (bx + 0.5) / SS;
      const sy = (by + 0.5) / SS;
      let color = null;
      for (let i = shapes.length - 1; i >= 0; i--) {
        if (hit(shapes[i], sx, sy)) {
          color = rgb[i];
          break;
        }
      }
      if (!color) continue;
      const o = ((by / SS) | 0) * size * 3 + (((bx / SS) | 0) * 3);
      acc[o] += color[0];
      acc[o + 1] += color[1];
      acc[o + 2] += color[2];
    }
  }

  const per = SS * SS;
  const rgba = Buffer.alloc(size * size * 4);
  for (let i = 0; i < size * size; i++) {
    rgba[i * 4] = Math.round(acc[i * 3] / per);
    rgba[i * 4 + 1] = Math.round(acc[i * 3 + 1] / per);
    rgba[i * 4 + 2] = Math.round(acc[i * 3 + 2] / per);
    rgba[i * 4 + 3] = 255;
  }
  return rgba;
}

/* ---------- PNG 编码 ---------- */

const CRC_TABLE = (() => {
  const table = new Int32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c;
  }
  return table;
})();

function crc32(buf) {
  let c = -1;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ -1) >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, "ascii"), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([len, body, crc]);
}

function encodePng(rgba, size) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8;   // bit depth
  ihdr[9] = 6;   // color type: RGBA
  const raw = Buffer.alloc(size * (size * 4 + 1));
  for (let y = 0; y < size; y++) {
    raw[y * (size * 4 + 1)] = 0; // filter: none
    rgba.copy(raw, y * (size * 4 + 1) + 1, y * size * 4, (y + 1) * size * 4);
  }
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", ihdr),
    chunk("IDAT", zlib.deflateSync(raw, { level: 9 })),
    chunk("IEND", Buffer.alloc(0))
  ]);
}

/* ---------- 出图 ---------- */

// radius 一律使用 192 设计稿单位；iOS 自己会切圆角，所以 apple-touch-icon 用满幅方形。
const TARGETS = [
  { file: "icon-192.png", size: 192, radius: 42, glyphScale: 1, bg: BRAND },
  { file: "icon-512.png", size: 512, radius: 42, glyphScale: 1, bg: BRAND },
  { file: "icon-maskable-512.png", size: 512, radius: 0, glyphScale: 0.62, bg: BRAND },
  { file: "apple-touch-icon-180.png", size: 180, radius: 0, glyphScale: 1, bg: BRAND }
];

fs.mkdirSync(OUT_DIR, { recursive: true });
for (const t of TARGETS) {
  const shapes = buildShapes({
    size: t.size,
    radius: t.radius,
    glyphScale: t.glyphScale,
    glyphFill: "#ffffff",
    bgFill: t.bg
  });
  const png = encodePng(render(t.size, shapes), t.size);
  fs.writeFileSync(path.join(OUT_DIR, t.file), png);
  console.log(`✓ ${t.file}  ${t.size}x${t.size}  ${(png.length / 1024).toFixed(1)} KB`);
}
console.log(`图标已写入 ${path.relative(ROOT, OUT_DIR)}`);
