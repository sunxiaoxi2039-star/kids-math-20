#!/usr/bin/env node
/**
 * STEP 5: 生成 .cube LUT 文件
 *
 * 用法: node scripts/05-generate-lut.js [params_file]
 *
 * 读取调色参数 JSON (由 04-color-grading.html 导出),
 * 生成符合工业标准的 .cube 3D LUT 文件,
 * 可直接用于 FFmpeg lut3d 滤镜或 DaVinci Resolve.
 *
 * 若不传参数文件, 使用内置默认预设 (轻微暖调, 增加微对比)
 */

const fs = require("fs");
const path = require("path");

const PARAMS_FILE = process.argv[2] || "./output/luts/grade-params.json";
const OUT_LUT = "./output/luts/grade.cube";
const LUT_SIZE = 33; // 33x33x33 = 35937 entries, high quality

// ──────────────────────────────────────────────────────────────────────────────
// 色彩处理函数
// ──────────────────────────────────────────────────────────────────────────────

function clamp(v) {
  return Math.max(0, Math.min(1, v));
}

// 色温偏移 (温度: -100 冷 → +100 暖)
function applyTemperature(r, g, b, temp) {
  const t = temp / 100;
  return [
    clamp(r + t * 0.1),
    g,
    clamp(b - t * 0.1),
  ];
}

// 色调偏移 (绿/洋红: -100 绿 → +100 洋红)
function applyTint(r, g, b, tint) {
  const t = tint / 100;
  return [r, clamp(g - t * 0.07), b];
}

// 曝光 (EV stops)
function applyExposure(r, g, b, ev) {
  const factor = Math.pow(2, ev);
  return [clamp(r * factor), clamp(g * factor), clamp(b * factor)];
}

// S 型对比度曲线 (contrast: -100 → +100)
function sCurve(v, strength) {
  if (strength === 0) return v;
  const s = strength / 100;
  // 贝塞尔近似 S 曲线
  const mid = 0.5;
  if (v < mid) {
    const t = v / mid;
    const curved = mid * (t * t * (3 - 2 * t));
    return v + (curved - v) * s;
  } else {
    const t = (v - mid) / (1 - mid);
    const curved = mid + (1 - mid) * (t * t * (3 - 2 * t));
    return v + (curved - v) * s;
  }
}

function applyContrast(r, g, b, contrast) {
  return [sCurve(r, contrast), sCurve(g, contrast), sCurve(b, contrast)];
}

// 高光压缩 (highlights: -100 → 0, 负值才有效)
function applyHighlights(r, g, b, highlights) {
  if (highlights >= 0) return [r, g, b];
  const lum = 0.2126 * r + 0.7152 * g + 0.0722 * b;
  const mask = Math.max(0, (lum - 0.6) / 0.4); // 只影响亮部
  const strength = (-highlights / 100) * mask;
  return [
    clamp(r - r * strength * 0.3),
    clamp(g - g * strength * 0.3),
    clamp(b - b * strength * 0.3),
  ];
}

// 阴影提亮 (shadows: 0 → +100, 正值才有效)
function applyShadows(r, g, b, shadows) {
  if (shadows <= 0) return [r, g, b];
  const lum = 0.2126 * r + 0.7152 * g + 0.0722 * b;
  const mask = Math.max(0, (0.4 - lum) / 0.4); // 只影响暗部
  const lift = (shadows / 100) * mask * 0.2;
  return [clamp(r + lift), clamp(g + lift), clamp(b + lift)];
}

// RGB → HSL → RGB 饱和度调整
function rgbToHsl(r, g, b) {
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  let h, s;
  const l = (max + min) / 2;
  if (max === min) {
    h = s = 0;
  } else {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    switch (max) {
      case r: h = (g - b) / d + (g < b ? 6 : 0); break;
      case g: h = (b - r) / d + 2; break;
      default: h = (r - g) / d + 4;
    }
    h /= 6;
  }
  return [h, s, l];
}

function hue2rgb(p, q, t) {
  if (t < 0) t += 1;
  if (t > 1) t -= 1;
  if (t < 1 / 6) return p + (q - p) * 6 * t;
  if (t < 1 / 2) return q;
  if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
  return p;
}

function hslToRgb(h, s, l) {
  if (s === 0) return [l, l, l];
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
  const p = 2 * l - q;
  return [hue2rgb(p, q, h + 1 / 3), hue2rgb(p, q, h), hue2rgb(p, q, h - 1 / 3)];
}

function applySaturation(r, g, b, saturation) {
  if (saturation === 0) return [r, g, b];
  const [h, s, l] = rgbToHsl(r, g, b);
  const newS = clamp(s * (1 + saturation / 100));
  return hslToRgb(h, newS, l);
}

// Vibrance (智能饱和度 — 对已饱和的颜色影响更小)
function applyVibrance(r, g, b, vibrance) {
  if (vibrance === 0) return [r, g, b];
  const [h, s, l] = rgbToHsl(r, g, b);
  const vibranceFactor = (1 - s) * (vibrance / 100);
  const newS = clamp(s + vibranceFactor * 0.5);
  return hslToRgb(h, newS, l);
}

// ──────────────────────────────────────────────────────────────────────────────
// 主函数
// ──────────────────────────────────────────────────────────────────────────────

function applyGrade(r, g, b, params) {
  let [R, G, B] = [r, g, b];
  [R, G, B] = applyTemperature(R, G, B, params.temperature);
  [R, G, B] = applyTint(R, G, B, params.tint);
  [R, G, B] = applyExposure(R, G, B, params.exposure);
  [R, G, B] = applyContrast(R, G, B, params.contrast);
  [R, G, B] = applyHighlights(R, G, B, params.highlights);
  [R, G, B] = applyShadows(R, G, B, params.shadows);
  [R, G, B] = applySaturation(R, G, B, params.saturation);
  [R, G, B] = applyVibrance(R, G, B, params.vibrance);
  return [R, G, B];
}

function generateLUT(params) {
  console.log("=== STEP 5: 生成 .cube 3D LUT ===\n");
  console.log("调色参数:");
  Object.entries(params).forEach(([k, v]) => {
    if (k !== "name" && k !== "generatedAt") {
      const bar = v > 0 ? "+" : v < 0 ? "" : " ";
      console.log(`  ${k.padEnd(14)}: ${bar}${v}`);
    }
  });
  console.log("");

  const size = LUT_SIZE;
  const lines = [];

  lines.push(`# Created by kids-math-20 AI Video Pipeline`);
  lines.push(`# Grade: ${params.name || "Custom"}`);
  lines.push(`# Generated: ${new Date().toISOString()}`);
  lines.push(`TITLE "${params.name || "Custom Grade"}"`);
  lines.push(`LUT_3D_SIZE ${size}`);
  lines.push("");

  let count = 0;
  const total = size * size * size;

  // .cube format: B varies fastest, then G, then R
  for (let bi = 0; bi < size; bi++) {
    for (let gi = 0; gi < size; gi++) {
      for (let ri = 0; ri < size; ri++) {
        const r = ri / (size - 1);
        const g = gi / (size - 1);
        const b = bi / (size - 1);

        const [ro, go, bo] = applyGrade(r, g, b, params);
        lines.push(
          `${ro.toFixed(6)} ${go.toFixed(6)} ${bo.toFixed(6)}`
        );
        count++;
      }
    }
    // Progress every 10%
    if ((bi + 1) % Math.ceil(size / 10) === 0) {
      const pct = Math.round((count / total) * 100);
      process.stdout.write(`\r  生成进度: ${pct}%`);
    }
  }

  process.stdout.write("\r  生成进度: 100%\n");
  return lines.join("\n");
}

function main() {
  // 默认预设: 轻微暖调 + 微增对比 (适合人文历史视频)
  const defaultParams = {
    name: "Warm History",
    temperature: 18,   // 轻微暖调
    tint: -5,          // 微绿补偿 (室内灯光常见偏洋红)
    exposure: 0.1,     // 轻微提亮
    contrast: 22,      // 增加对比
    highlights: -15,   // 轻压高光
    shadows: 12,       // 提亮阴影
    saturation: 8,     // 微增饱和
    vibrance: 15,      // Vibrance 优先
  };

  let params = defaultParams;

  if (fs.existsSync(PARAMS_FILE)) {
    const loaded = JSON.parse(fs.readFileSync(PARAMS_FILE, "utf-8"));
    params = { ...defaultParams, ...loaded };
    console.log(`✓ 读取调色参数: ${PARAMS_FILE}\n`);
  } else {
    console.log(`ℹ️  未找到参数文件 (${PARAMS_FILE}), 使用默认预设\n`);
    console.log('   提示: 先打开 scripts/04-color-grading.html 调色并导出参数\n');
  }

  const lut = generateLUT(params);

  fs.mkdirSync(path.dirname(OUT_LUT), { recursive: true });
  fs.writeFileSync(OUT_LUT, lut, "utf-8");

  const stats = fs.statSync(OUT_LUT);
  console.log(`\n✅ LUT 已保存: ${OUT_LUT}`);
  console.log(`   大小: ${(stats.size / 1024).toFixed(1)} KB`);
  console.log(`   条目: ${LUT_SIZE}³ = ${LUT_SIZE ** 3} 个 RGB 映射`);
  console.log("\nFFmpeg 调色命令:");
  console.log(`  ffmpeg -i input.mp4 -vf "lut3d='${OUT_LUT}'" output-graded.mp4`);
  console.log("\n下一步: npm run pipeline:cut -- --apply-lut");
  console.log("        或: npm run remotion:render");
}

main();
