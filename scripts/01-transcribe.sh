#!/usr/bin/env bash
# STEP 1: Whisper 全量语音转写 + 毫秒级单词时间戳
#
# 用法:
#   bash scripts/01-transcribe.sh [footage_dir]
#
# 依赖: pip install openai-whisper (本地), 或 pip install faster-whisper (推荐, 速度更快)
# 产物: output/transcripts/<take_name>.json  (Whisper word-level JSON)

set -euo pipefail

FOOTAGE_DIR="${1:-./footage}"
OUT_DIR="./output/transcripts"
MODEL="${WHISPER_MODEL:-large-v3}"
LANGUAGE="${WHISPER_LANGUAGE:-zh}"

mkdir -p "$OUT_DIR"

if ! command -v whisper &>/dev/null && ! python3 -c "import faster_whisper" &>/dev/null 2>&1; then
  echo "❌  未找到 Whisper。请先安装："
  echo "    pip install faster-whisper"
  exit 1
fi

if [ ! -d "$FOOTAGE_DIR" ]; then
  echo "❌  素材目录不存在: $FOOTAGE_DIR"
  echo "    用法: bash scripts/01-transcribe.sh <footage_dir>"
  exit 1
fi

echo "=== STEP 1: Whisper 转写 (模型: $MODEL, 语言: $LANGUAGE) ==="
echo "素材目录: $FOOTAGE_DIR"
echo ""

TAKES=$(find "$FOOTAGE_DIR" -type f \( -name "*.mp4" -o -name "*.mov" -o -name "*.mts" -o -name "*.m4v" \) | sort)
TOTAL=$(echo "$TAKES" | grep -c . || true)

if [ "$TOTAL" -eq 0 ]; then
  echo "❌  未找到视频文件"
  exit 1
fi

echo "发现 $TOTAL 个素材文件"
echo ""

COUNT=0
for VIDEO in $TAKES; do
  COUNT=$((COUNT + 1))
  BASENAME=$(basename "$VIDEO" | sed 's/\.[^.]*$//')
  OUT_JSON="$OUT_DIR/${BASENAME}.json"

  if [ -f "$OUT_JSON" ]; then
    echo "[$COUNT/$TOTAL] 跳过 (已有转写): $BASENAME"
    continue
  fi

  echo "[$COUNT/$TOTAL] 转写: $BASENAME"
  START_TIME=$(date +%s)

  python3 - <<PYEOF
import json, sys

# 优先使用 faster-whisper (速度快 4-5x)
try:
    from faster_whisper import WhisperModel
    model = WhisperModel("$MODEL", device="auto", compute_type="auto")
    segments_gen, info = model.transcribe(
        "$VIDEO",
        language="$LANGUAGE",
        word_timestamps=True,
        vad_filter=True,
        vad_parameters={"min_silence_duration_ms": 500},
    )
    segments = []
    all_words = []
    for seg in segments_gen:
        words = []
        if seg.words:
            for w in seg.words:
                word_data = {"word": w.word.strip(), "start": round(w.start, 3), "end": round(w.end, 3)}
                words.append(word_data)
                all_words.append(word_data)
        segments.append({
            "id": seg.id,
            "start": round(seg.start, 3),
            "end": round(seg.end, 3),
            "text": seg.text.strip(),
            "words": words,
        })
    result = {
        "file": "$VIDEO",
        "take": "$BASENAME",
        "text": " ".join(s["text"] for s in segments),
        "language": info.language,
        "duration": round(info.duration, 3),
        "segments": segments,
    }
except ImportError:
    # 回退到 openai-whisper
    import whisper
    model = whisper.load_model("$MODEL")
    raw = model.transcribe("$VIDEO", language="$LANGUAGE", word_timestamps=True)
    segments = []
    for seg in raw["segments"]:
        words = [{"word": w["word"].strip(), "start": round(w["start"], 3), "end": round(w["end"], 3)}
                 for w in seg.get("words", [])]
        segments.append({
            "id": seg["id"],
            "start": round(seg["start"], 3),
            "end": round(seg["end"], 3),
            "text": seg["text"].strip(),
            "words": words,
        })
    result = {
        "file": "$VIDEO",
        "take": "$BASENAME",
        "text": raw["text"],
        "language": raw.get("language", "zh"),
        "duration": round(raw["segments"][-1]["end"] if raw["segments"] else 0, 3),
        "segments": segments,
    }

with open("$OUT_JSON", "w", encoding="utf-8") as f:
    json.dump(result, f, ensure_ascii=False, indent=2)

print(f"  ✓ 保存: $OUT_JSON")
print(f"  文本长度: {len(result['text'])} 字符")
print(f"  总时长: {result['duration']:.1f}s")
PYEOF

  END_TIME=$(date +%s)
  echo "  耗时: $((END_TIME - START_TIME))s"
  echo ""
done

echo "✅ 转写完成！产物在: $OUT_DIR/"
echo ""
echo "下一步: npm run pipeline:select"
