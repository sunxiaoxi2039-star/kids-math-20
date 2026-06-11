#!/usr/bin/env bash
# ══════════════════════════════════════════════════════════════════════════════
# AI 视频制作流水线 — 主编排脚本
# 复刻自 Fable 发布视频的制作方式
#
# 用法:
#   bash scripts/pipeline.sh [--footage <dir>] [--skip-transcribe] [--apply-lut]
#
# 步骤:
#   1. Whisper 全量语音转写 + 毫秒级单词时间戳
#   2. AI Subagent 挑选最佳镜头
#   3. FFmpeg 自动粗剪
#   4. (手动) 打开调色工具, 导出参数
#   5. 生成 .cube LUT
#   6. Remotion 渲染动画
#   (可选) 7. Figma 设计同步
#
# ══════════════════════════════════════════════════════════════════════════════

set -euo pipefail

# ── 颜色输出 ──────────────────────────────────────────────────────────────────
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
BOLD='\033[1m'
NC='\033[0m'

info()    { echo -e "${CYAN}ℹ${NC}  $*"; }
success() { echo -e "${GREEN}✅${NC} $*"; }
warn()    { echo -e "${YELLOW}⚠️${NC}  $*"; }
error()   { echo -e "${RED}❌${NC} $*"; exit 1; }
step()    { echo -e "\n${BOLD}${BLUE}━━ $* ━━${NC}\n"; }

# ── 参数解析 ──────────────────────────────────────────────────────────────────
FOOTAGE_DIR="./footage"
SKIP_TRANSCRIBE=false
APPLY_LUT=false
SKIP_RENDER=false
RUN_FIGMA=false

while [[ $# -gt 0 ]]; do
  case $1 in
    --footage)       FOOTAGE_DIR="$2"; shift 2 ;;
    --skip-transcribe) SKIP_TRANSCRIBE=true; shift ;;
    --apply-lut)     APPLY_LUT=true; shift ;;
    --skip-render)   SKIP_RENDER=true; shift ;;
    --figma)         RUN_FIGMA=true; shift ;;
    *) warn "未知参数: $1"; shift ;;
  esac
done

# ── 环境检查 ──────────────────────────────────────────────────────────────────
check_deps() {
  local missing=()
  command -v node   &>/dev/null || missing+=("node (https://nodejs.org)")
  command -v ffmpeg &>/dev/null || missing+=("ffmpeg (https://ffmpeg.org)")

  if [ ${#missing[@]} -gt 0 ]; then
    error "缺少依赖:\n$(printf '  - %s\n' "${missing[@]}")"
  fi

  # 检查 Remotion
  if [ ! -d node_modules ]; then
    warn "node_modules 不存在, 正在安装依赖..."
    npm install
  fi
}

# ──────────────────────────────────────────────────────────────────────────────

echo ""
echo -e "${BOLD}╔══════════════════════════════════════════════════════════╗${NC}"
echo -e "${BOLD}║        AI 视频制作流水线 — kids-math-20                 ║${NC}"
echo -e "${BOLD}║        Claude Code × Whisper × FFmpeg × Remotion       ║${NC}"
echo -e "${BOLD}╚══════════════════════════════════════════════════════════╝${NC}"
echo ""
echo -e "  素材目录 : ${CYAN}${FOOTAGE_DIR}${NC}"
echo -e "  应用 LUT : ${APPLY_LUT}"
echo -e "  Figma 同步: ${RUN_FIGMA}"
echo ""

check_deps

# ══════════════════════════════════════════════════════════════════════════════
step "STEP 1 · Whisper 语音转写"
# ══════════════════════════════════════════════════════════════════════════════

if [ "$SKIP_TRANSCRIBE" = true ]; then
  warn "跳过转写 (--skip-transcribe)"
elif [ ! -d "$FOOTAGE_DIR" ]; then
  warn "素材目录不存在: $FOOTAGE_DIR"
  info "将使用示例转写文件 (data/sample-transcript.json)"
  mkdir -p output/transcripts
  cp data/sample-transcript.json output/transcripts/sample.json
else
  bash scripts/01-transcribe.sh "$FOOTAGE_DIR"
fi

success "Step 1 完成"

# ══════════════════════════════════════════════════════════════════════════════
step "STEP 2 · AI 挑选最佳镜头"
# ══════════════════════════════════════════════════════════════════════════════

node scripts/02-select-takes.js

success "Step 2 完成"

# ══════════════════════════════════════════════════════════════════════════════
step "STEP 3 · FFmpeg 粗剪"
# ══════════════════════════════════════════════════════════════════════════════

if [ "$APPLY_LUT" = true ]; then
  node scripts/03-rough-cut.js --apply-lut
else
  node scripts/03-rough-cut.js
fi

success "Step 3 完成"

# ══════════════════════════════════════════════════════════════════════════════
step "STEP 4 · 调色工具"
# ══════════════════════════════════════════════════════════════════════════════

if [ ! -f "output/luts/grade-params.json" ]; then
  info "正在打开调色工具..."
  info "请在浏览器中:"
  info "  1. 拖入视频截帧"
  info "  2. 调整色温/对比度等参数"
  info "  3. 点击「导出参数」"
  info "  4. 保存到 output/luts/grade-params.json"
  echo ""

  # 尝试打开浏览器
  if command -v open &>/dev/null; then
    open "scripts/04-color-grading.html"
  elif command -v xdg-open &>/dev/null; then
    xdg-open "scripts/04-color-grading.html"
  else
    info "请手动打开: $(pwd)/scripts/04-color-grading.html"
  fi

  echo ""
  read -r -p "调色完成后按 Enter 继续..." || true
fi

success "Step 4 完成"

# ══════════════════════════════════════════════════════════════════════════════
step "STEP 5 · 生成 .cube LUT"
# ══════════════════════════════════════════════════════════════════════════════

node scripts/05-generate-lut.js

success "Step 5 完成"

# ══════════════════════════════════════════════════════════════════════════════
step "STEP 6 · Remotion 渲染动画"
# ══════════════════════════════════════════════════════════════════════════════

if [ "$SKIP_RENDER" = true ]; then
  warn "跳过 Remotion 渲染 (--skip-render)"
else
  info "开始渲染 4K 24fps 视频..."
  info "预计耗时: 5~30 分钟 (取决于视频时长和硬件)"
  echo ""

  mkdir -p output/renders

  # 渲染主视频
  npx remotion render TimelineVideo output/renders/timeline-4k.mp4 \
    --scale 1 \
    --log verbose \
    2>&1 | tee output/renders/render.log || {
      warn "4K 渲染失败, 尝试预览分辨率..."
      npx remotion render TimelineVideo output/renders/timeline-preview.mp4 \
        --scale 0.5 2>&1 | tee -a output/renders/render.log
    }
fi

success "Step 6 完成"

# ══════════════════════════════════════════════════════════════════════════════
# Figma 同步 (可选)
# ══════════════════════════════════════════════════════════════════════════════

if [ "$RUN_FIGMA" = true ]; then
  step "STEP 7 (可选) · Figma 设计同步"

  if [ -z "${FIGMA_TOKEN:-}" ] || [ -z "${FIGMA_FILE_KEY:-}" ]; then
    warn "未设置 FIGMA_TOKEN / FIGMA_FILE_KEY, 跳过 Figma 同步"
  else
    node scripts/06-figma-sync.js pull
    success "Figma 同步完成"
  fi
fi

# ══════════════════════════════════════════════════════════════════════════════
echo ""
echo -e "${BOLD}${GREEN}╔══════════════════════════════════════════════════════════╗${NC}"
echo -e "${BOLD}${GREEN}║             🎬  流水线执行完成！                        ║${NC}"
echo -e "${BOLD}${GREEN}╚══════════════════════════════════════════════════════════╝${NC}"
echo ""
echo -e "  产物目录: ${CYAN}output/${NC}"
echo -e "  ├─ transcripts/   Whisper 转写 JSON"
echo -e "  ├─ decisions/     AI 镜头选择决策"
echo -e "  ├─ luts/          .cube 调色查找表"
echo -e "  └─ renders/       最终视频"
echo ""
