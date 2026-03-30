# Multi-Agent Content System

面向内容工作者的多 Agent 系统 —— 把内容生产能力从"提示词层"推进到"可执行接口层"。

## 核心理念

```
不是 SOP 文档，不是 SKILL.md 提示词
而是：能力 → CLI → SKILL.md(说明层) → 工作流编排
```

每个内容能力都是一个**真正能跑的 CLI 工具**，SKILL.md 只是它的说明书，供 Agent 发现和调用。

## 架构

```
┌───────────────────────────────────────────────────┐
│              工作流编排层                            │
│   content-studio: 写稿 → 打分 → 重写循环 → 输出     │
├───────────────────────────────────────────────────┤
│              SKILL.md 发现层                        │
│   skills/ai-news.SKILL.md                          │
│   skills/content-studio.SKILL.md                   │
├───────────────────────────────────────────────────┤
│              CLI 能力层                             │
│   tools/ai-news/          ← 资讯抓取 (已实现)       │
│   tools/content-studio/   ← 写作+评审工作流 (已实现) │
│   tools/content-adapt/    ← 多平台适配 (规划中)      │
│   tools/content-publish/  ← 自动发布 (规划中)        │
├───────────────────────────────────────────────────┤
│              外部能力层 (可选)                       │
│   lark-cli                ← 飞书: 文档/表格/消息/任务│
└───────────────────────────────────────────────────┘
```

## 已实现

### 1. ai-news — AI 资讯抓取与格式化

```bash
pip install -r tools/ai-news/requirements.txt
python tools/ai-news/ai_news.py pipeline --style brief
```

详见 [skills/ai-news.SKILL.md](skills/ai-news.SKILL.md)

### 2. content-studio — 带质量门控的内容生产工作流

```bash
pip install -r tools/content-studio/requirements.txt

# 一键生产：抓取 → 写稿 → 打分 → 不到9分退回重写 → 输出
python tools/content-studio/content_studio.py produce -t "本周AI大事" -s xiaohongshu

# 公众号长文
python tools/content-studio/content_studio.py produce -t "大模型趋势" -s wechat -l zh

# 检查系统状态
python tools/content-studio/content_studio.py status
```

详见 [skills/content-studio.SKILL.md](skills/content-studio.SKILL.md)

## 质量门控工作流

```
素材 → LLM写稿 → LLM打分(4维度) → 不到9分? → 带反馈重写 → 再评 → 通过 → 输出
                                       ↑                              |
                                       └──────────── 最多3轮 ─────────┘
```

评分维度：内容质量、结构质量、洞察深度、可读性。每项1-10分，综合达标才通过。

## 能力单元

| CLI 工具 | 能力 | 状态 |
|----------|------|------|
| `ai-news` | 抓取 AI 资讯，多平台格式化 | ✅ 已实现 |
| `content-studio` | 写稿+多轮评审+质量门控 | ✅ 已实现 |
| `content-adapt` | 一篇内容适配多平台格式 | 📋 规划中 |
| `content-publish` | 自动发布到各平台 | 📋 规划中 |

## 飞书集成（可选）

安装 [lark-cli](https://github.com/larksuite/cli) 后，content-studio 自动接入飞书：
- 完成后在飞书建文档
- 通知编辑群审核
- 记录到电子表格

```bash
npm install -g @larksuite/cli
npx skills add larksuite/cli -y -g
lark-cli config init
lark-cli auth login --recommend
```

## 设计原则

1. **工作流优于Agent**: 内容生产需要可控性，不需要自主决策
2. **CLI-first**: 每个能力先是一个能跑的命令行工具
3. **质量门控**: 写和评分离，多轮迭代，不达标不放行
4. **管道可组合**: 工具之间通过 JSON stdin/stdout 通信
5. **人机协同**: 工作流做重复劳动，人做最终判断
