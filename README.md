# Multi-Agent Content System

面向内容工作者的多 Agent 系统 —— 把内容生产能力从"提示词层"推进到"可执行接口层"。

## 核心理念

```
不是 SOP 文档，不是 SKILL.md 提示词
而是：能力 → CLI → SKILL.md(说明层) → Agent 编排
```

每个内容能力都是一个**真正能跑的 CLI 工具**，SKILL.md 只是它的说明书，供 Agent 发现和调用。

## 架构

```
┌─────────────────────────────────────────────┐
│              Agent 编排层                     │
│   (Claude Code / 自定义 Agent / MCP)         │
├─────────────────────────────────────────────┤
│              SKILL.md 发现层                  │
│   skills/ai-news.SKILL.md                    │
│   skills/content-writer.SKILL.md  (planned)  │
│   skills/content-adapt.SKILL.md   (planned)  │
├─────────────────────────────────────────────┤
│              CLI 能力层                       │
│   tools/ai-news/       ← 已实现              │
│   tools/content-writer/ ← 规划中             │
│   tools/content-adapt/  ← 规划中             │
│   tools/content-publish/← 规划中             │
├─────────────────────────────────────────────┤
│              数据流                           │
│   output/raw.json → output/draft.md → 发布   │
└─────────────────────────────────────────────┘
```

## 已实现

### ai-news — AI 资讯抓取与格式化

```bash
# 安装依赖
pip install -r tools/ai-news/requirements.txt

# 一键生成今日 AI 简报
python tools/ai-news/ai_news.py pipeline --style brief

# 小红书格式
python tools/ai-news/ai_news.py pipeline --style xiaohongshu

# 微信公众号格式
python tools/ai-news/ai_news.py pipeline --style wechat
```

详见 [skills/ai-news.SKILL.md](skills/ai-news.SKILL.md)

## 规划中的能力单元

| CLI 工具 | 能力 | 状态 |
|----------|------|------|
| `ai-news` | 抓取 AI 资讯，多平台格式化 | ✅ 已实现 |
| `content-writer` | 基于素材深度改写、生成长文 | 📋 规划中 |
| `content-adapt` | 一篇内容适配多平台格式 | 📋 规划中 |
| `content-publish` | 自动发布到各平台 | 📋 规划中 |
| `asset-manage` | 素材库管理（图片、数据、引用） | 📋 规划中 |

## 设计原则

1. **CLI-first**: 每个能力先是一个能跑的命令行工具，而不是一段提示词
2. **SKILL.md 是说明层**: 自动/手动生成，供 Agent 发现，但能力本体在 CLI
3. **管道可组合**: 工具之间通过 JSON stdin/stdout 通信，可自由组合
4. **人机协同**: Agent 做重复劳动，人做判断和审核
