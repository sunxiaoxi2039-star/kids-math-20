#!/usr/bin/env node
/**
 * STEP 6: Figma MCP 协作打磨
 *
 * 用法: node scripts/06-figma-sync.js <command> [options]
 *
 * Commands:
 *   export  -- 将 Remotion 渲染帧导出到 Figma 文件
 *   pull    -- 从 Figma 拉取最新设计稿，更新 Remotion 组件 tokens
 *   watch   -- 监听 Figma 文件变更，自动同步
 *
 * 环境变量:
 *   FIGMA_TOKEN      -- Figma Personal Access Token
 *   FIGMA_FILE_KEY   -- Figma 文件 ID (URL 中 /file/<KEY>/)
 *   FIGMA_PAGE_NAME  -- 要同步的 Page 名称 (默认: "Video Assets")
 *
 * 产物:
 *   output/figma-tokens.json -- 颜色/字体/间距 tokens, 供 Remotion 组件使用
 */

const https = require("https");
const fs = require("fs");
const path = require("path");

const FIGMA_TOKEN = process.env.FIGMA_TOKEN;
const FILE_KEY = process.env.FIGMA_FILE_KEY;
const PAGE_NAME = process.env.FIGMA_PAGE_NAME || "Video Assets";
const TOKENS_FILE = "./output/figma-tokens.json";
const FRAMES_DIR = "./output/renders/frames";

const COMMAND = process.argv[2] || "help";

// ──────────────────────────────────────────────────────────────────────────────
// Figma REST API client
// ──────────────────────────────────────────────────────────────────────────────
function figmaRequest(endpoint) {
  return new Promise((resolve, reject) => {
    const options = {
      hostname: "api.figma.com",
      path: `/v1/${endpoint}`,
      headers: { "X-Figma-Token": FIGMA_TOKEN },
    };
    https.get(options, (res) => {
      let data = "";
      res.on("data", (chunk) => (data += chunk));
      res.on("end", () => {
        try {
          resolve(JSON.parse(data));
        } catch (e) {
          reject(new Error(`Invalid JSON: ${data.slice(0, 200)}`));
        }
      });
    }).on("error", reject);
  });
}

// ──────────────────────────────────────────────────────────────────────────────
// Extract design tokens from Figma file
// ──────────────────────────────────────────────────────────────────────────────
function extractColors(node, tokens = {}) {
  if (node.fills) {
    node.fills.forEach((fill) => {
      if (fill.type === "SOLID" && node.name.startsWith("color/")) {
        const { r, g, b, a = 1 } = fill.color;
        const hex = "#" + [r, g, b].map((c) => Math.round(c * 255).toString(16).padStart(2, "0")).join("");
        tokens[node.name.replace("color/", "")] = { hex, rgba: `rgba(${Math.round(r*255)},${Math.round(g*255)},${Math.round(b*255)},${a})` };
      }
    });
  }
  if (node.children) {
    node.children.forEach((child) => extractColors(child, tokens));
  }
  return tokens;
}

function extractTextStyles(styles) {
  const result = {};
  Object.entries(styles || {}).forEach(([key, style]) => {
    if (style.styleType === "TEXT") {
      result[style.name] = {
        fontFamily: style.style?.fontFamily,
        fontSize: style.style?.fontSize,
        fontWeight: style.style?.fontWeight,
        lineHeight: style.style?.lineHeightPx,
        letterSpacing: style.style?.letterSpacing,
      };
    }
  });
  return result;
}

// ──────────────────────────────────────────────────────────────────────────────
// Commands
// ──────────────────────────────────────────────────────────────────────────────
async function cmdPull() {
  console.log("=== STEP 6: Figma → 代码 同步 ===\n");

  if (!FIGMA_TOKEN || !FILE_KEY) {
    console.error("❌  缺少环境变量:");
    console.error("    export FIGMA_TOKEN=<your-personal-access-token>");
    console.error("    export FIGMA_FILE_KEY=<file-key-from-figma-url>");
    console.error("\n    获取 Token: Figma → Account Settings → Personal Access Tokens");
    process.exit(1);
  }

  console.log(`文件: https://www.figma.com/file/${FILE_KEY}`);
  console.log(`同步页面: ${PAGE_NAME}\n`);

  // 1. 获取文件结构
  console.log("1. 拉取 Figma 文件结构...");
  const file = await figmaRequest(`files/${FILE_KEY}`);

  if (file.err) {
    console.error(`❌  Figma API 错误: ${file.err}`);
    process.exit(1);
  }

  // 2. 找到目标 Page
  const page = file.document.children.find((p) => p.name === PAGE_NAME);
  if (!page) {
    console.warn(`⚠️  未找到页面 "${PAGE_NAME}", 使用第一个页面: ${file.document.children[0]?.name}`);
  }
  const targetPage = page || file.document.children[0];

  // 3. 提取颜色 tokens
  console.log("2. 提取颜色 tokens...");
  const colors = extractColors(targetPage);
  console.log(`   找到 ${Object.keys(colors).length} 个颜色`);

  // 4. 提取文字样式
  console.log("3. 提取文字样式...");
  const textStyles = extractTextStyles(file.styles);
  console.log(`   找到 ${Object.keys(textStyles).length} 个文字样式`);

  // 5. 获取 Frame 列表 (用于导出为图片)
  const frames = [];
  function findFrames(node) {
    if (node.type === "FRAME" || node.type === "COMPONENT") {
      frames.push({ id: node.id, name: node.name });
    }
    if (node.children) node.children.forEach(findFrames);
  }
  findFrames(targetPage);
  console.log(`4. 发现 ${frames.length} 个 Frame`);

  // 6. 保存 tokens
  const tokens = {
    syncedAt: new Date().toISOString(),
    figmaFile: FILE_KEY,
    page: targetPage.name,
    colors,
    textStyles,
    frames: frames.map((f) => f.name),
  };

  fs.mkdirSync(path.dirname(TOKENS_FILE), { recursive: true });
  fs.writeFileSync(TOKENS_FILE, JSON.stringify(tokens, null, 2), "utf-8");

  console.log(`\n✅ Design tokens 已保存: ${TOKENS_FILE}`);
  console.log("\nRemotionコンポーネントから以下のようにインポートできます:");
  console.log('  import tokens from "../../output/figma-tokens.json";');
  console.log('  // tokens.colors.primary.hex');

  // 7. 下载 Frame 截图
  if (frames.length > 0) {
    console.log("\n5. 导出 Frame 截图 (用于视频合成)...");
    const nodeIds = frames.slice(0, 20).map((f) => f.id).join(",");
    const imagesResp = await figmaRequest(
      `images/${FILE_KEY}?ids=${nodeIds}&format=png&scale=2`
    );

    if (imagesResp.images) {
      fs.mkdirSync(FRAMES_DIR, { recursive: true });
      const entries = Object.entries(imagesResp.images);
      console.log(`   下载 ${entries.length} 张截图...`);

      // 注: 实际下载需要额外的 https.get 调用
      // 此处记录 URL 供手动下载或后续处理
      const imageUrls = {};
      frames.forEach((f) => {
        if (imagesResp.images[f.id]) {
          imageUrls[f.name] = imagesResp.images[f.id];
        }
      });

      const urlsFile = path.join(FRAMES_DIR, "figma-image-urls.json");
      fs.writeFileSync(urlsFile, JSON.stringify(imageUrls, null, 2), "utf-8");
      console.log(`   Frame URLs 已保存: ${urlsFile}`);
    }
  }
}

async function cmdExport() {
  console.log("=== 导出渲染帧 → Figma ===\n");
  console.log("功能: 将 Remotion 渲染的关键帧上传到 Figma 文件, 供设计师标注和调整\n");

  if (!FIGMA_TOKEN || !FILE_KEY) {
    console.error("❌  需要 FIGMA_TOKEN 和 FIGMA_FILE_KEY 环境变量");
    process.exit(1);
  }

  // Figma REST API 不支持直接上传图片到 File;
  // 标准做法是: Remotion render → 截帧 → Figma Plugins 导入
  // 或使用 Figma API: 创建 IMAGE fill 类型的节点
  console.log("提示: Figma 官方推荐通过 Figma Plugin API 上传图片。");
  console.log("      请在 Figma 中安装 'Frame.io' 或 'Zeplin' 插件进行帧同步。");
  console.log("\n替代方案: 将渲染帧保存到共享 URL, 然后在 Figma 中通过 '插入 → 图片 → URL' 导入");
}

async function cmdWatch() {
  console.log("=== 监听 Figma 文件变更 ===\n");
  console.log("每 30 秒轮询 Figma 文件版本...\n");

  if (!FIGMA_TOKEN || !FILE_KEY) {
    console.error("❌  需要 FIGMA_TOKEN 和 FIGMA_FILE_KEY");
    process.exit(1);
  }

  let lastVersion = null;

  async function check() {
    const file = await figmaRequest(`files/${FILE_KEY}?depth=1`);
    if (file.version !== lastVersion) {
      if (lastVersion !== null) {
        console.log(`\n🔄 检测到 Figma 文件更新 (版本 ${file.version}), 重新同步...`);
        await cmdPull();
      }
      lastVersion = file.version;
      console.log(`[${new Date().toLocaleTimeString()}] 当前版本: ${file.version} — 等待变更...`);
    }
  }

  await check();
  setInterval(check, 30000);
}

function cmdHelp() {
  console.log(`
用法: node scripts/06-figma-sync.js <command>

命令:
  pull    从 Figma 拉取 design tokens 和 Frame 截图
  export  将 Remotion 渲染帧导出到 Figma (需要 Plugin)
  watch   监听 Figma 文件变更并自动同步

环境变量:
  FIGMA_TOKEN=<personal-access-token>
  FIGMA_FILE_KEY=<file-key-from-url>
  FIGMA_PAGE_NAME=<page-name>  (默认: "Video Assets")

示例:
  export FIGMA_TOKEN=figd_xxx
  export FIGMA_FILE_KEY=abc123
  node scripts/06-figma-sync.js pull
`);
}

// ──────────────────────────────────────────────────────────────────────────────
// Main
// ──────────────────────────────────────────────────────────────────────────────
(async () => {
  try {
    switch (COMMAND) {
      case "pull":   await cmdPull(); break;
      case "export": await cmdExport(); break;
      case "watch":  await cmdWatch(); break;
      default:       cmdHelp();
    }
  } catch (e) {
    console.error(`\n❌  错误: ${e.message}`);
    process.exit(1);
  }
})();
