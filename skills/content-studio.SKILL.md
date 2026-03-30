# content-studio

带质量门控的AI内容生产工作流。

## 能力描述

基于LLM的内容生产流水线：抓取AI资讯素材 → 自动写稿 → 多维度打分（内容/结构/洞察/可读性）→ 不到门槛分数自动退回重写 → 通过后输出。支持小红书、微信公众号、简报、Twitter等多平台风格。可选接入飞书CLI进行文档创建和团队通知。

## 接口

```bash
tools/content-studio/content_studio.py
pip install -r tools/content-studio/requirements.txt
```

## 命令

### produce - 一键内容生产

```bash
python tools/content-studio/content_studio.py produce [OPTIONS]
```

| 参数 | 说明 | 可选值/默认值 |
|------|------|--------------|
| `--topic, -t` | 内容主题（必填） | 字符串 |
| `--style, -s` | 输出风格 | brief, xiaohongshu, wechat, twitter |
| `--threshold` | 质量门槛分数 | 1-10, 默认9 |
| `--max-rounds` | 最大重写轮次 | 默认3 |
| `--from-file, -f` | 从JSON文件读取素材 | 文件路径 |
| `--output, -o` | 输出文件路径 | 默认自动生成 |
| `--language, -l` | 资讯语言过滤 | zh, en |
| `--category, -c` | 资讯分类过滤 | industry, research, opensource |
| `--lark-chat-id` | 飞书通知群ID | 或设环境变量 LARK_CHAT_ID |

### status - 系统状态

```bash
python tools/content-studio/content_studio.py status
```

显示LLM后端、飞书连接、工具链状态。

## 工作流程

```
         ┌──────┐
         │ 素材  │ ← ai-news fetch 或 --from-file
         └──┬───┘
            ↓
      ┌───────────┐
      │  LLM 写稿  │ ← 带风格指令 + 前轮反馈
      └─────┬─────┘
            ↓
      ┌───────────┐     < 9分
      │  LLM 打分  │ ──────→ 反馈 → 回到写稿
      └─────┬─────┘
            ↓ >= 9分
      ┌───────────┐
      │  输出/发布  │ → 文件 + 飞书文档 + 通知
      └───────────┘
```

## 使用示例

```bash
# 基础：一键生成AI简报
python content_studio.py produce -t "本周AI大事" -s brief

# 小红书内容，降低门槛快速出稿
python content_studio.py produce -t "AI工具推荐" -s xiaohongshu --threshold 7

# 公众号长文，只用中文素材
python content_studio.py produce -t "大模型趋势" -s wechat -l zh

# 从已有素材文件生成
python content_studio.py produce -t "GPT-5" -f output/raw.json -s wechat -o output/gpt5.md
```

## 环境变量

| 变量 | 说明 |
|------|------|
| `ANTHROPIC_API_KEY` | Anthropic Claude API密钥（优先使用） |
| `OPENAI_API_KEY` | OpenAI API密钥（备选） |
| `LARK_CHAT_ID` | 飞书通知群聊ID |

## 在多Agent编排中的角色

此工具是内容生产的核心工作流引擎，上游接 ai-news，下游可接 content-adapt（多平台适配）。

```
ai-news (抓取) → content-studio (写+评+改) → content-adapt (适配) → publish
```
