# ai-news

AI 资讯抓取与多平台格式化工具。

## 能力描述

从多个 AI 领域 RSS 源（OpenAI、Google AI、HuggingFace、Anthropic、机器之心、量子位等）抓取最新资讯，自动筛选、分类，并格式化为不同平台（简报、小红书、微信公众号）的发布格式。

## 接口

```bash
# 可执行文件位置
tools/ai-news/ai_news.py

# 依赖安装
pip install -r tools/ai-news/requirements.txt
```

## 命令

### fetch - 抓取资讯

```bash
python tools/ai-news/ai_news.py fetch [OPTIONS]
```

| 参数 | 说明 | 可选值 |
|------|------|--------|
| `--category, -t` | 按分类过滤 | industry, research, opensource, newsletter |
| `--language, -l` | 按语言过滤 | zh, en |
| `--output, -o` | 输出到文件 | 文件路径 |

输出: JSON 格式的资讯列表（stdout 或文件）

### format - 格式化

```bash
python tools/ai-news/ai_news.py format [OPTIONS]
```

| 参数 | 说明 | 可选值 |
|------|------|--------|
| `--style, -s` | 输出风格 | brief, xiaohongshu, wechat, json |
| `--input, -i` | 输入 JSON 文件 | 文件路径（或 stdin） |
| `--output, -o` | 输出到文件 | 文件路径 |

输入: 接受 fetch 命令输出的 JSON（文件或 stdin 管道）

### pipeline - 一键执行

```bash
python tools/ai-news/ai_news.py pipeline [OPTIONS]
```

将 fetch + format 合并为一步。支持 fetch 和 format 的所有参数。

### sources - 列出资讯源

```bash
python tools/ai-news/ai_news.py sources
```

## 使用示例

```bash
# 一键生成今日AI简报
python tools/ai-news/ai_news.py pipeline --style brief

# 只看中文源，输出小红书格式
python tools/ai-news/ai_news.py pipeline -l zh --style xiaohongshu

# 抓取后存为JSON，供其他Agent消费
python tools/ai-news/ai_news.py fetch -o output/raw.json

# 管道组合: 抓取英文研究类 → 格式化为公众号
python tools/ai-news/ai_news.py fetch -t research -l en | python tools/ai-news/ai_news.py format -s wechat
```

## 数据格式

每条资讯的 JSON 结构:

```json
{
  "title": "文章标题",
  "url": "原文链接",
  "summary": "摘要（最长500字符）",
  "published": "2026-03-28T10:00:00+00:00",
  "source_name": "来源名称",
  "language": "en",
  "category": "industry"
}
```

## 配置

资讯源在 `tools/ai-news/sources.yaml` 中配置。可添加新的 RSS 源。

## 在多Agent编排中的角色

此工具是内容生产流水线的**信息输入端**。它的输出可被下游 Agent 消费:

```
ai-news (抓取原料) → content-writer (深度改写) → content-adapt (多平台适配) → content-publish (发布)
```
