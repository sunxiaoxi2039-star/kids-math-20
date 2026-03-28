#!/usr/bin/env python3
"""
ai-news: AI 资讯抓取、筛选、格式化 CLI 工具

这是多Agent内容系统的第一个可执行能力单元。
它不是一个提示词，而是一个真正能跑的CLI接口。

用法:
    python ai_news.py fetch                    # 抓取所有源
    python ai_news.py fetch --category industry # 只抓行业新闻
    python ai_news.py fetch --language zh       # 只抓中文源
    python ai_news.py format --style brief      # 输出简报格式
    python ai_news.py format --style xiaohongshu # 输出小红书格式
    python ai_news.py format --style wechat     # 输出公众号格式
    python ai_news.py pipeline                  # 一键: 抓取 → 筛选 → 格式化
"""

import json
import os
import sys
from datetime import datetime, timedelta, timezone
from pathlib import Path

import click
import feedparser
import yaml
from dateutil import parser as dateparser


# ── 配置 ─────────────────────────────────────────────

def load_sources(config_path=None):
    """加载资讯源配置"""
    if config_path is None:
        config_path = Path(__file__).parent / "sources.yaml"
    with open(config_path, "r", encoding="utf-8") as f:
        return yaml.safe_load(f)


# ── 抓取层 ───────────────────────────────────────────

def fetch_rss(source, max_age_days=3, max_items=5):
    """从单个 RSS 源抓取条目"""
    items = []
    try:
        feed = feedparser.parse(source["url"])
        cutoff = datetime.now(timezone.utc) - timedelta(days=max_age_days)

        for entry in feed.entries[:max_items * 2]:  # 多取一些，后面按时间过滤
            # 解析发布时间
            published = None
            for date_field in ["published", "updated", "created"]:
                if hasattr(entry, date_field) and getattr(entry, date_field):
                    try:
                        published = dateparser.parse(getattr(entry, date_field))
                        if published.tzinfo is None:
                            published = published.replace(tzinfo=timezone.utc)
                        break
                    except (ValueError, TypeError):
                        continue

            # 如果没有日期或太旧，跳过
            if published and published < cutoff:
                continue

            # 提取摘要
            summary = ""
            if hasattr(entry, "summary"):
                summary = entry.summary
            elif hasattr(entry, "description"):
                summary = entry.description

            # 清理 HTML 标签（简单处理）
            import re
            summary = re.sub(r"<[^>]+>", "", summary).strip()
            if len(summary) > 500:
                summary = summary[:500] + "..."

            items.append({
                "title": entry.get("title", "无标题"),
                "url": entry.get("link", ""),
                "summary": summary,
                "published": published.isoformat() if published else None,
                "source_name": source["name"],
                "language": source.get("language", "en"),
                "category": source.get("category", "general"),
            })

            if len(items) >= max_items:
                break

    except Exception as e:
        click.echo(f"  ⚠ 抓取 {source['name']} 失败: {e}", err=True)

    return items


def fetch_all(config, category=None, language=None):
    """抓取所有配置的源"""
    defaults = config.get("defaults", {})
    max_age = defaults.get("max_age_days", 3)
    max_items = defaults.get("max_items_per_source", 5)

    all_items = []
    sources = config["sources"]

    # 过滤
    if category:
        sources = [s for s in sources if s.get("category") == category]
    if language:
        sources = [s for s in sources if s.get("language") == language]

    for source in sources:
        click.echo(f"  抓取: {source['name']}...", err=True)
        if source["type"] == "rss":
            items = fetch_rss(source, max_age_days=max_age, max_items=max_items)
            all_items.extend(items)
            click.echo(f"    获取 {len(items)} 条", err=True)

    # 按发布时间排序（最新在前）
    all_items.sort(key=lambda x: x.get("published") or "", reverse=True)
    return all_items


# ── 格式化层 ─────────────────────────────────────────

def format_brief(items, title=None):
    """简报格式 - 适合快速阅读"""
    today = datetime.now().strftime("%Y-%m-%d")
    title = title or f"AI 资讯简报 | {today}"

    lines = [f"# {title}\n"]
    lines.append(f"> 共 {len(items)} 条资讯，抓取时间: {datetime.now().strftime('%Y-%m-%d %H:%M')}\n")

    # 按分类分组
    by_category = {}
    for item in items:
        cat = item.get("category", "general")
        by_category.setdefault(cat, []).append(item)

    category_names = {
        "industry": "行业动态",
        "research": "研究前沿",
        "opensource": "开源生态",
        "newsletter": "深度解读",
        "general": "其他",
    }

    for cat, cat_items in by_category.items():
        lines.append(f"\n## {category_names.get(cat, cat)}\n")
        for i, item in enumerate(cat_items, 1):
            lines.append(f"### {i}. {item['title']}")
            lines.append(f"来源: {item['source_name']}")
            if item.get("summary"):
                lines.append(f"\n{item['summary']}\n")
            if item.get("url"):
                lines.append(f"[阅读原文]({item['url']})\n")

    return "\n".join(lines)


def format_xiaohongshu(items, max_items=8):
    """小红书格式 - 短平快、emoji丰富"""
    today = datetime.now().strftime("%m.%d")
    lines = [f"AI日报 {today} | 今天AI圈发生了什么\n"]

    for i, item in enumerate(items[:max_items], 1):
        emoji = ["🔥", "⚡", "🚀", "💡", "🎯", "✨", "📢", "🔬"][i % 8]
        lines.append(f"{emoji} {item['title']}")
        if item.get("summary"):
            # 小红书摘要要短
            short = item["summary"][:100]
            if len(item["summary"]) > 100:
                short += "..."
            lines.append(f"{short}\n")

    lines.append("\n#AI #人工智能 #科技资讯 #AI日报 #ChatGPT")
    return "\n".join(lines)


def format_wechat(items, max_items=10):
    """微信公众号格式 - 结构化、正式"""
    today = datetime.now().strftime("%Y年%m月%d日")
    lines = [f"# AI 前沿速递 | {today}\n"]
    lines.append("---\n")

    for i, item in enumerate(items[:max_items], 1):
        lines.append(f"**{i}. {item['title']}**\n")
        if item.get("summary"):
            lines.append(f"> {item['summary'][:200]}\n")
        lines.append(f"来源：{item['source_name']}  ")
        if item.get("url"):
            lines.append(f"原文链接：{item['url']}\n")
        lines.append("---\n")

    lines.append("\n*本文由 AI 资讯系统自动生成，经人工审核编辑。*")
    return "\n".join(lines)


def format_json(items):
    """JSON 格式 - 供其他 Agent/CLI 消费"""
    return json.dumps({
        "generated_at": datetime.now().isoformat(),
        "count": len(items),
        "items": items,
    }, ensure_ascii=False, indent=2)


FORMATTERS = {
    "brief": format_brief,
    "xiaohongshu": format_xiaohongshu,
    "wechat": format_wechat,
    "json": format_json,
}


# ── CLI 入口 ─────────────────────────────────────────

@click.group()
@click.option("--config", "-c", default=None, help="配置文件路径 (默认: sources.yaml)")
@click.pass_context
def cli(ctx, config):
    """ai-news: AI 资讯抓取与格式化工具

    多Agent内容系统的第一个可执行能力单元。
    """
    ctx.ensure_object(dict)
    ctx.obj["config_path"] = config


@cli.command()
@click.option("--category", "-t", default=None, help="过滤分类: industry/research/opensource/newsletter")
@click.option("--language", "-l", default=None, help="过滤语言: zh/en")
@click.option("--output", "-o", default=None, help="输出文件路径 (默认: stdout)")
@click.pass_context
def fetch(ctx, category, language, output):
    """抓取 AI 资讯源"""
    config = load_sources(ctx.obj.get("config_path"))
    items = fetch_all(config, category=category, language=language)

    result = json.dumps(items, ensure_ascii=False, indent=2)

    if output:
        Path(output).write_text(result, encoding="utf-8")
        click.echo(f"✓ 已保存 {len(items)} 条资讯到 {output}", err=True)
    else:
        click.echo(result)


@cli.command()
@click.option("--style", "-s", default="brief", type=click.Choice(FORMATTERS.keys()),
              help="输出风格: brief/xiaohongshu/wechat/json")
@click.option("--input", "-i", "input_file", default=None, help="输入JSON文件 (来自 fetch 命令)")
@click.option("--output", "-o", default=None, help="输出文件路径 (默认: stdout)")
def format(style, input_file, output):
    """格式化资讯为不同平台风格"""
    if input_file:
        items = json.loads(Path(input_file).read_text(encoding="utf-8"))
    else:
        # 从 stdin 读取
        items = json.loads(sys.stdin.read())

    formatter = FORMATTERS[style]
    result = formatter(items)

    if output:
        Path(output).write_text(result, encoding="utf-8")
        click.echo(f"✓ 已输出 {style} 格式到 {output}", err=True)
    else:
        click.echo(result)


@cli.command()
@click.option("--category", "-t", default=None, help="过滤分类")
@click.option("--language", "-l", default=None, help="过滤语言")
@click.option("--style", "-s", default="brief", type=click.Choice(FORMATTERS.keys()),
              help="输出风格")
@click.option("--output", "-o", default=None, help="输出文件路径")
@click.pass_context
def pipeline(ctx, category, language, style, output):
    """一键执行: 抓取 → 格式化 → 输出

    这是最常用的命令，将 fetch 和 format 合并为一步。

    示例:
        python ai_news.py pipeline --style xiaohongshu
        python ai_news.py pipeline -l zh --style wechat -o output/today.md
    """
    click.echo("═══ AI 资讯 Pipeline 启动 ═══\n", err=True)

    # Step 1: 抓取
    click.echo("📡 Step 1/2: 抓取资讯源...", err=True)
    config = load_sources(ctx.obj.get("config_path"))
    items = fetch_all(config, category=category, language=language)
    click.echo(f"   共获取 {len(items)} 条资讯\n", err=True)

    if not items:
        click.echo("⚠ 未获取到任何资讯，请检查网络或配置", err=True)
        return

    # Step 2: 格式化
    click.echo(f"📝 Step 2/2: 格式化为 {style}...", err=True)
    formatter = FORMATTERS[style]
    result = formatter(items)

    if output:
        os.makedirs(os.path.dirname(output) or ".", exist_ok=True)
        Path(output).write_text(result, encoding="utf-8")
        click.echo(f"\n✓ 完成! 已保存到 {output}", err=True)
    else:
        click.echo("\n" + result)

    click.echo("\n═══ Pipeline 完成 ═══", err=True)


@cli.command()
def sources():
    """列出所有已配置的资讯源"""
    config = load_sources()
    for s in config["sources"]:
        lang_flag = "🇨🇳" if s.get("language") == "zh" else "🇺🇸"
        click.echo(f"  {lang_flag} [{s['category']:>10}] {s['name']}")
        click.echo(f"     {s['url']}")


if __name__ == "__main__":
    cli()
