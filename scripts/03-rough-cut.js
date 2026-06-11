#!/usr/bin/env node
/**
 * STEP 3: FFmpeg 自动粗剪
 *
 * 用法: node scripts/03-rough-cut.js [decisions_file]
 *
 * 读取 Step 2 的决策 JSON, 用 ffmpeg 把选出的片段拼接成粗剪视频
 * 可选: --apply-lut  使用 output/luts/grade.cube 调色
 */

const { execSync, spawnSync } = require("child_process");
const fs = require("fs");
const path = require("path");

const DECISIONS_FILE = process.argv[2] || "./output/decisions/selected-takes.json";
const OUT_DIR = "./output/renders";
const LUT_FILE = "./output/luts/grade.cube";
const APPLY_LUT = process.argv.includes("--apply-lut");

function checkFFmpeg() {
  const result = spawnSync("ffmpeg", ["-version"], { encoding: "utf-8" });
  if (result.status !== 0) {
    console.error("❌  未找到 ffmpeg。请安装: https://ffmpeg.org/download.html");
    process.exit(1);
  }
  const version = result.stdout.split("\n")[0];
  console.log(`✓ ffmpeg: ${version}`);
}

function buildFFmpegCommand({ inputFile, inPoint, outPoint, outputFile, lutFile }) {
  const args = ["ffmpeg", "-y"];

  // 精确seek (先 -ss 再 -i 可以实现关键帧对齐)
  args.push("-ss", String(inPoint));
  args.push("-i", `"${inputFile}"`);
  args.push("-to", String(outPoint - inPoint));

  const vfilters = [];

  if (lutFile && fs.existsSync(lutFile)) {
    vfilters.push(`lut3d='${lutFile}'`);
    console.log(`  🎨 应用 LUT: ${lutFile}`);
  }

  // 轻微去噪
  vfilters.push("hqdn3d=1.5:1.5:6:6");

  if (vfilters.length > 0) {
    args.push("-vf", `"${vfilters.join(",")}"`);
  }

  // 输出规格: H.264, 4K, 24fps, AAC 320k
  args.push(
    "-c:v", "libx264",
    "-preset", "slow",
    "-crf", "18",
    "-pix_fmt", "yuv420p",
    "-r", "24",
    "-c:a", "aac",
    "-b:a", "320k",
    "-movflags", "+faststart",
    `"${outputFile}"`
  );

  return args.join(" ");
}

function main() {
  console.log("=== STEP 3: FFmpeg 自动粗剪 ===\n");

  checkFFmpeg();

  if (!fs.existsSync(DECISIONS_FILE)) {
    console.error(`❌  决策文件不存在: ${DECISIONS_FILE}`);
    console.error("    请先运行: npm run pipeline:select");
    process.exit(1);
  }

  const decisions = JSON.parse(fs.readFileSync(DECISIONS_FILE, "utf-8"));
  fs.mkdirSync(OUT_DIR, { recursive: true });

  console.log(`\n最佳 take: ${decisions.bestTake.take}`);
  console.log(`原始文件: ${decisions.bestTake.file}`);
  console.log(`总时长: ${decisions.bestTake.duration}s\n`);

  if (!fs.existsSync(decisions.bestTake.file)) {
    console.warn(`⚠️  视频文件不存在: ${decisions.bestTake.file}`);
    console.warn("   (演示模式: 跳过 ffmpeg 执行, 仅生成命令)\n");
  }

  const clips = decisions.bestTake.clips;
  const outputFiles = [];

  clips.forEach((clip, i) => {
    const outputFile = path.join(OUT_DIR, `rough-cut-clip-${String(i + 1).padStart(2, "0")}.mp4`);
    const lutFile = APPLY_LUT && fs.existsSync(LUT_FILE) ? LUT_FILE : null;

    const cmd = buildFFmpegCommand({
      inputFile: decisions.bestTake.file,
      inPoint: clip.in,
      outPoint: clip.out,
      outputFile,
      lutFile,
    });

    console.log(`📹 片段 ${i + 1}: ${clip.in}s → ${clip.out}s (${clip.duration}s)`);

    if (clip.longPauses && clip.longPauses.length > 0) {
      console.log(`   ⚠️  发现 ${clip.longPauses.length} 处长停顿:`);
      clip.longPauses.forEach((p) => {
        console.log(`      ${p.gapStart}s → ${p.gapEnd}s (${p.gapDuration}s)`);
      });
    }

    console.log(`   输出: ${outputFile}`);
    console.log(`   命令: ${cmd}\n`);

    if (fs.existsSync(decisions.bestTake.file)) {
      try {
        execSync(cmd, { stdio: "inherit" });
        console.log(`   ✅ 完成\n`);
        outputFiles.push(outputFile);
      } catch (e) {
        console.error(`   ❌ 失败: ${e.message}\n`);
      }
    } else {
      // 演示模式：只写命令不执行
      const demoFile = outputFile + ".cmd.txt";
      fs.writeFileSync(demoFile, cmd, "utf-8");
      console.log(`   📄 (演示模式) 命令已保存: ${demoFile}\n`);
    }
  });

  // 如果有多个片段, 用 concat demuxer 合并
  if (outputFiles.length > 1) {
    const concatListFile = path.join(OUT_DIR, "concat-list.txt");
    const concatContent = outputFiles.map((f) => `file '${path.resolve(f)}'`).join("\n");
    fs.writeFileSync(concatListFile, concatContent, "utf-8");

    const finalOutput = path.join(OUT_DIR, "rough-cut-final.mp4");
    const concatCmd = [
      "ffmpeg", "-y",
      "-f", "concat",
      "-safe", "0",
      "-i", `"${concatListFile}"`,
      "-c", "copy",
      `"${finalOutput}"`,
    ].join(" ");

    console.log("🔗 合并所有片段...");
    console.log(`   ${concatCmd}`);
    try {
      execSync(concatCmd, { stdio: "inherit" });
      console.log(`✅ 粗剪完成: ${finalOutput}`);
    } catch (e) {
      console.error(`❌ 合并失败: ${e.message}`);
    }
  } else if (outputFiles.length === 1) {
    console.log(`✅ 粗剪完成: ${outputFiles[0]}`);
  }

  // 更新决策文件, 记录输出路径
  decisions.roughCut = {
    completedAt: new Date().toISOString(),
    outputFiles,
    lutApplied: !!(APPLY_LUT && fs.existsSync(LUT_FILE)),
  };
  fs.writeFileSync(DECISIONS_FILE, JSON.stringify(decisions, null, 2), "utf-8");

  console.log("\n下一步: 打开 scripts/04-color-grading.html 进行调色");
  console.log("        然后运行: npm run pipeline:grade");
}

main();
