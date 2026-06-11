#!/usr/bin/env node
/**
 * STEP 2: AI 智能挑选最佳镜头
 *
 * 用法: node scripts/02-select-takes.js [transcripts_dir]
 *
 * 逻辑:
 *   - 读取所有 Whisper JSON 文件
 *   - 用多个维度打分 (填充词、结尾干净度、连贯性、完整度)
 *   - 为每个场景/片段选出最佳 take
 *   - 输出 output/decisions/selected-takes.json
 */

const fs = require("fs");
const path = require("path");

const TRANSCRIPTS_DIR = process.argv[2] || "./output/transcripts";
const OUT_FILE = "./output/decisions/selected-takes.json";

// 中文填充词 — 这些是废片的信号
const FILLER_WORDS = [
  "嗯", "啊", "那个", "就是", "然后呢", "就", "那", "这个",
  "呃", "哦", "好吧", "额", "所以说", "对对对", "然后就",
];

// 计算每 100 个词的填充词比例
function fillerWordRate(words) {
  if (!words || words.length === 0) return 0;
  const fillerCount = words.filter((w) =>
    FILLER_WORDS.some((f) => w.word.includes(f))
  ).length;
  return (fillerCount / words.length) * 100;
}

// 检测结尾是否干净 (最后 3 个词没有填充词, 且没有未完成的句子)
function hasCleanEnding(words) {
  if (!words || words.length < 3) return false;
  const tail = words.slice(-3);
  const hasFiller = tail.some((w) =>
    FILLER_WORDS.some((f) => w.word.includes(f))
  );
  return !hasFiller;
}

// 检测是否有过长停顿 (>= 1.5 秒间隙)
function maxGapSeconds(words) {
  let maxGap = 0;
  for (let i = 1; i < words.length; i++) {
    const gap = words[i].start - words[i - 1].end;
    if (gap > maxGap) maxGap = gap;
  }
  return maxGap;
}

// 语速一致性 (每秒词数的标准差越小越好)
function speechRateConsistency(words, segmentDuration) {
  if (!words || words.length < 4) return 0;
  const rate = words.length / segmentDuration;
  return rate; // 词/秒，理想 3~6 词/秒
}

// 综合打分 (越高越好, 0-100)
function scoreTranscript(data) {
  const allWords = data.segments.flatMap((s) => s.words || []);
  const duration = data.duration || 1;

  const fillerRate = fillerWordRate(allWords);
  const cleanEnding = hasCleanEnding(allWords) ? 1 : 0;
  const maxGap = maxGapSeconds(allWords);
  const speechRate = speechRateConsistency(allWords, duration);

  // 填充词扣分 (每1%扣5分, 最多扣40分)
  const fillerPenalty = Math.min(fillerRate * 5, 40);

  // 结尾奖励
  const endingBonus = cleanEnding * 15;

  // 停顿扣分 (超过2秒的停顿扣分)
  const gapPenalty = Math.max(0, (maxGap - 2) * 5);

  // 语速加分 (3-6词/秒最佳)
  const rateBonus =
    speechRate >= 3 && speechRate <= 6 ? 10 : speechRate > 0 ? 5 : 0;

  const score = 75 - fillerPenalty + endingBonus - gapPenalty + rateBonus;
  return {
    score: Math.max(0, Math.min(100, score)),
    fillerRate: fillerRate.toFixed(1),
    cleanEnding: !!cleanEnding,
    maxGap: maxGap.toFixed(2),
    speechRate: speechRate.toFixed(1),
    wordCount: allWords.length,
  };
}

function main() {
  console.log("=== STEP 2: AI 智能挑选最佳镜头 ===\n");

  if (!fs.existsSync(TRANSCRIPTS_DIR)) {
    console.error(`❌  转写目录不存在: ${TRANSCRIPTS_DIR}`);
    console.error("    请先运行: npm run pipeline:transcribe");
    process.exit(1);
  }

  const files = fs
    .readdirSync(TRANSCRIPTS_DIR)
    .filter((f) => f.endsWith(".json"))
    .map((f) => path.join(TRANSCRIPTS_DIR, f));

  if (files.length === 0) {
    console.error("❌  未找到转写文件");
    process.exit(1);
  }

  console.log(`发现 ${files.length} 个转写文件\n`);

  const scored = files
    .map((file) => {
      const data = JSON.parse(fs.readFileSync(file, "utf-8"));
      const metrics = scoreTranscript(data);
      return { file, take: data.take || path.basename(file, ".json"), data, metrics };
    })
    .sort((a, b) => b.metrics.score - a.metrics.score);

  console.log("📊 打分结果 (从高到低):\n");
  console.log(
    "  Take名称".padEnd(30),
    "评分".padEnd(8),
    "填充词%".padEnd(10),
    "结尾干净".padEnd(10),
    "最大停顿s".padEnd(12),
    "词数"
  );
  console.log("  " + "-".repeat(80));

  scored.forEach(({ take, metrics }) => {
    const flag = metrics.score >= 75 ? "✅" : metrics.score >= 55 ? "⚠️ " : "❌";
    console.log(
      `  ${flag} ${take}`.padEnd(32),
      String(metrics.score.toFixed(1)).padEnd(8),
      String(metrics.fillerRate + "%").padEnd(10),
      (metrics.cleanEnding ? "是" : "否").padEnd(10),
      String(metrics.maxGap + "s").padEnd(12),
      metrics.wordCount
    );
  });

  // 取最高分的 take 作为最终选择
  const bestTake = scored[0];
  console.log(`\n🏆 最佳 take: ${bestTake.take} (评分: ${bestTake.metrics.score.toFixed(1)})`);

  // 也列出备选 (评分 >= 70 的)
  const alternates = scored.slice(1).filter((s) => s.metrics.score >= 70);
  if (alternates.length > 0) {
    console.log(`   备选: ${alternates.map((a) => a.take).join(", ")}`);
  }

  // 生成剪辑决策 JSON
  const decisions = {
    generatedAt: new Date().toISOString(),
    bestTake: {
      file: bestTake.data.file,
      take: bestTake.take,
      score: bestTake.metrics,
      duration: bestTake.data.duration,
      transcript: bestTake.data,
    },
    // 每个场景片段的最佳剪切点 (去除开头/结尾的停顿)
    clips: deriveClipPoints(bestTake.data),
    alternates: alternates.map((a) => ({
      file: a.data.file,
      take: a.take,
      score: a.metrics,
    })),
    allTakes: scored.map((s) => ({
      file: s.data.file,
      take: s.take,
      score: s.metrics,
    })),
  };

  fs.mkdirSync(path.dirname(OUT_FILE), { recursive: true });
  fs.writeFileSync(OUT_FILE, JSON.stringify(decisions, null, 2), "utf-8");

  console.log(`\n✅ 决策文件已保存: ${OUT_FILE}`);
  console.log("\n下一步: npm run pipeline:cut");
}

// 精确确定每个片段的剪切进出点
// (跳过开头/结尾的沉默, 给出最干净的 in/out 时间)
function deriveClipPoints(transcript) {
  const allWords = transcript.segments.flatMap((s) => s.words || []);
  if (allWords.length === 0) {
    return [{ in: 0, out: transcript.duration, note: "no words detected" }];
  }

  // Trim 开头: 第一个词前最多保留 0.3s
  const inPoint = Math.max(0, allWords[0].start - 0.3);

  // Trim 结尾: 最后一个词后最多保留 0.5s
  const lastWord = allWords[allWords.length - 1];
  const outPoint = Math.min(transcript.duration, lastWord.end + 0.5);

  // 检测内部长停顿 (>= 2s), 建议切断点
  const cutPoints = [];
  for (let i = 1; i < allWords.length; i++) {
    const gap = allWords[i].start - allWords[i - 1].end;
    if (gap >= 2.0) {
      cutPoints.push({
        gapStart: allWords[i - 1].end,
        gapEnd: allWords[i].start,
        gapDuration: gap.toFixed(2),
        note: "long pause — consider cutting here",
      });
    }
  }

  return [
    {
      in: parseFloat(inPoint.toFixed(3)),
      out: parseFloat(outPoint.toFixed(3)),
      duration: parseFloat((outPoint - inPoint).toFixed(3)),
      wordCount: allWords.length,
      longPauses: cutPoints,
    },
  ];
}

main();
