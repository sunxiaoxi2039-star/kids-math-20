#!/usr/bin/env python3
"""
content-studio: 内容生产工作流引擎

架构: 工作流（非Agent），带质量门控的确定性流水线。

流程:
    抓取素材 → LLM写稿 → LLM打分 → 不到9分退回重写 → 通过 → 输出/发布

为什么不用Agent:
    内容生产是有明确质量标准的流水线任务。
    工作流 = 每步可控、可审计、可重现。
    Agent = 自主决策、不可控、不适合质量敏感场景。

用法:
    python content_studio.py produce --topic "本周AI大事" --style xiaohongshu
    python content_studio.py produce --topic "GPT-5发布" --style wechat --threshold 8
    python content_studio.py produce --from-file output/raw.json --style brief
"""

import json
import os
import subprocess
import sys
import time
from datetime import datetime
from pathlib import Path

import click

# ── 配置 ─────────────────────────────────────────────

DEFAULT_THRESHOLD = 9
MAX_REWRITE_ROUNDS = 3

# 支持多种 LLM 后端
LLM_BACKENDS = {
    "anthropic": {
        "env_key": "ANTHROPIC_API_KEY",
        "model": "claude-sonnet-4-20250514",
    },
    "openai": {
        "env_key": "OPENAI_API_KEY",
        "model": "gpt-4o",
    },
}


def get_llm_backend():
    """检测可用的 LLM 后端"""
    for name, config in LLM_BACKENDS.items():
        if os.environ.get(config["env_key"]):
            return name, config
    return None, None


# ── LLM 调用层 ──────────────────────────────────────

def call_llm(prompt, system_prompt="", backend=None):
    """统一的 LLM 调用接口

    支持 Anthropic Claude 和 OpenAI GPT。
    如果没有 API key，回退到本地模拟模式（用于测试）。
    """
    if backend is None:
        backend, config = get_llm_backend()

    if backend == "anthropic":
        return _call_anthropic(prompt, system_prompt, config)
    elif backend == "openai":
        return _call_openai(prompt, system_prompt, config)
    else:
        return _call_mock(prompt, system_prompt)


def _call_anthropic(prompt, system_prompt, config):
    """调用 Anthropic Claude API"""
    import anthropic
    client = anthropic.Anthropic()
    message = client.messages.create(
        model=config["model"],
        max_tokens=4096,
        system=system_prompt,
        messages=[{"role": "user", "content": prompt}],
    )
    return message.content[0].text


def _call_openai(prompt, system_prompt, config):
    """调用 OpenAI API"""
    import openai
    client = openai.OpenAI()
    messages = []
    if system_prompt:
        messages.append({"role": "system", "content": system_prompt})
    messages.append({"role": "user", "content": prompt})
    response = client.chat.completions.create(
        model=config["model"],
        messages=messages,
        max_tokens=4096,
    )
    return response.choices[0].message.content


def _call_mock(prompt, system_prompt):
    """无 API key 时的本地模拟模式（用于测试流程）"""
    click.echo("  ⚠ 未检测到 LLM API key，使用模拟模式", err=True)
    click.echo("  设置 ANTHROPIC_API_KEY 或 OPENAI_API_KEY 以使用真实 LLM", err=True)

    if "打分" in prompt or "score" in prompt.lower() or "评分" in prompt:
        return json.dumps({
            "overall_score": 8,
            "content_score": 8,
            "structure_score": 8,
            "insight_score": 7,
            "readability_score": 8,
            "feedback": "模拟评分：内容结构完整，但缺乏独特洞察。建议增加原创观点和数据支撑。",
        }, ensure_ascii=False)
    else:
        return f"[模拟生成] 这是基于以下素材的模拟内容输出。\n\n实际使用时，LLM将根据素材生成高质量内容。\n\n素材摘要: {prompt[:200]}..."


# ── 写作模块 ────────────────────────────────────────

WRITER_SYSTEM_PROMPT = """你是一位资深 AI 领域内容创作者。你的任务是基于提供的资讯素材，
撰写高质量的内容。要求：
1. 信息准确，有数据支撑
2. 有独立观点和深度洞察，不是简单堆砌新闻
3. 语言流畅，适合目标平台的调性
4. 结构清晰，有吸引力的标题和开头"""

STYLE_PROMPTS = {
    "brief": """输出格式：专业简报
- 开头用一句话概括核心趋势
- 每条资讯2-3句话点评
- 结尾给出前瞻判断
- 语气：专业、克制、有洞察""",

    "xiaohongshu": """输出格式：小红书帖子
- 标题要有吸引力，可用emoji
- 正文口语化、轻松、有个人感受
- 每个要点简短有力
- 结尾引导互动（提问或投票）
- 加5-8个相关标签
- 总长度300-500字""",

    "wechat": """输出格式：微信公众号文章
- 标题正式但有吸引力
- 开头用场景或问题引入
- 正文分小节，每节有小标题
- 引用数据和原文来源
- 结尾有总结和展望
- 总长度1500-3000字""",

    "twitter": """输出格式：Twitter/X 线程
- 第一条推文要抓眼球
- 每条推文独立可读，但串联成故事
- 最后一条总结+CTA
- 每条不超过280字符
- 5-10条推文""",
}


def write_content(materials, topic, style="brief", rewrite_feedback=None):
    """基于素材生成内容

    Args:
        materials: 资讯素材（JSON列表或文本）
        topic: 主题
        style: 输出风格
        rewrite_feedback: 重写时的修改意见（来自打分环节）
    """
    if isinstance(materials, list):
        materials_text = "\n\n".join([
            f"【{item.get('source_name', '未知来源')}】{item['title']}\n{item.get('summary', '')}"
            for item in materials
        ])
    else:
        materials_text = str(materials)

    style_instruction = STYLE_PROMPTS.get(style, STYLE_PROMPTS["brief"])

    prompt = f"""## 任务
基于以下AI领域资讯素材，围绕主题「{topic}」撰写一篇内容。

## 风格要求
{style_instruction}

## 素材
{materials_text}
"""

    if rewrite_feedback:
        prompt += f"""
## ⚠️ 重写指示
上一版未通过质量审核，以下是修改意见：
{rewrite_feedback}

请根据以上意见重写，重点改进指出的问题。
"""

    return call_llm(prompt, system_prompt=WRITER_SYSTEM_PROMPT)


# ── 打分模块 ────────────────────────────────────────

SCORER_SYSTEM_PROMPT = """你是一位严格的内容质量审核员。你的任务是对AI领域的内容作品进行多维度打分。

评分标准（每项1-10分）：
1. content_score（内容质量）：信息准确性、时效性、覆盖面
2. structure_score（结构质量）：逻辑清晰、层次分明、有节奏感
3. insight_score（洞察深度）：有原创观点、不人云亦云、能引发思考
4. readability_score（可读性）：语言流畅、适合目标读者、有吸引力

overall_score = 四项平均分（四舍五入到整数）

你必须严格打分。7分是及格，8分是良好，9分是优秀，10分极少给出。
普通的信息堆砌最多7分。有独特视角才能到8分。真正有洞察才能9分。"""


def score_content(content, style="brief"):
    """对内容进行多维度打分

    Returns:
        dict: {overall_score, content_score, structure_score,
               insight_score, readability_score, feedback}
    """
    prompt = f"""请对以下内容进行严格评分。

## 内容风格
{style}

## 待评内容
{content}

## 输出格式
请严格以JSON格式输出（不要包含其他文字）：
{{
    "overall_score": <1-10整数>,
    "content_score": <1-10整数>,
    "structure_score": <1-10整数>,
    "insight_score": <1-10整数>,
    "readability_score": <1-10整数>,
    "feedback": "<具体改进建议，200字以内>"
}}"""

    result = call_llm(prompt, system_prompt=SCORER_SYSTEM_PROMPT)

    # 解析JSON（容错处理）
    try:
        # 尝试提取JSON块
        if "```json" in result:
            result = result.split("```json")[1].split("```")[0]
        elif "```" in result:
            result = result.split("```")[1].split("```")[0]
        return json.loads(result.strip())
    except (json.JSONDecodeError, IndexError):
        # 如果解析失败，返回默认低分
        return {
            "overall_score": 5,
            "content_score": 5,
            "structure_score": 5,
            "insight_score": 5,
            "readability_score": 5,
            "feedback": f"评分解析失败，原始响应: {result[:200]}",
        }


# ── 飞书集成层 ──────────────────────────────────────

def lark_available():
    """检查 lark-cli 是否可用"""
    try:
        subprocess.run(["lark-cli", "--version"], capture_output=True, timeout=5)
        return True
    except (FileNotFoundError, subprocess.TimeoutExpired):
        return False


def lark_create_doc(title, content):
    """在飞书创建文档"""
    try:
        result = subprocess.run(
            ["lark-cli", "docs", "+create", "--title", title, "--markdown", content],
            capture_output=True, text=True, timeout=30,
        )
        if result.returncode == 0:
            return result.stdout.strip()
        else:
            click.echo(f"  ⚠ 飞书文档创建失败: {result.stderr}", err=True)
            return None
    except FileNotFoundError:
        click.echo("  ⚠ lark-cli 未安装，跳过飞书集成", err=True)
        return None


def lark_send_message(chat_id, text):
    """发送飞书消息"""
    try:
        subprocess.run(
            ["lark-cli", "im", "+messages-send", "--chat-id", chat_id, "--text", text],
            capture_output=True, text=True, timeout=15,
        )
    except FileNotFoundError:
        pass


def lark_append_to_sheet(spreadsheet_id, values_json):
    """追加数据到飞书电子表格"""
    try:
        subprocess.run(
            ["lark-cli", "sheets", "+append",
             "--spreadsheet-id", spreadsheet_id,
             "--values", values_json],
            capture_output=True, text=True, timeout=15,
        )
    except FileNotFoundError:
        pass


# ── 工作流引擎 ──────────────────────────────────────

def run_pipeline(materials, topic, style="brief", threshold=DEFAULT_THRESHOLD,
                 max_rounds=MAX_REWRITE_ROUNDS, output_path=None,
                 lark_chat_id=None, lark_sheet_id=None):
    """执行完整的内容生产工作流

    流程: 写稿 → 打分 → [不及格则重写] → 通过 → 输出

    Args:
        materials: 素材列表
        topic: 主题
        style: 输出风格
        threshold: 质量门槛（默认9分）
        max_rounds: 最大重写轮次
        output_path: 输出文件路径
        lark_chat_id: 飞书通知群ID（可选）
        lark_sheet_id: 飞书记录表ID（可选）
    """
    click.echo(f"\n{'═' * 50}", err=True)
    click.echo(f"  内容工作流启动", err=True)
    click.echo(f"  主题: {topic}", err=True)
    click.echo(f"  风格: {style}", err=True)
    click.echo(f"  质量门槛: {threshold}/10", err=True)
    click.echo(f"  最大轮次: {max_rounds}", err=True)
    click.echo(f"{'═' * 50}\n", err=True)

    history = []  # 记录每轮的内容和分数
    feedback = None
    final_content = None
    passed = False

    for round_num in range(1, max_rounds + 1):
        # ── Step 1: 写稿 ──
        click.echo(f"📝 第 {round_num}/{max_rounds} 轮 — 生成内容...", err=True)
        content = write_content(materials, topic, style, rewrite_feedback=feedback)
        click.echo(f"   生成完毕 ({len(content)} 字符)\n", err=True)

        # ── Step 2: 打分 ──
        click.echo(f"🔍 第 {round_num}/{max_rounds} 轮 — 质量评分...", err=True)
        scores = score_content(content, style)

        overall = scores.get("overall_score", 0)
        click.echo(f"   总分: {overall}/10", err=True)
        click.echo(f"   内容: {scores.get('content_score', '?')}", err=True)
        click.echo(f"   结构: {scores.get('structure_score', '?')}", err=True)
        click.echo(f"   洞察: {scores.get('insight_score', '?')}", err=True)
        click.echo(f"   可读: {scores.get('readability_score', '?')}", err=True)
        click.echo(f"   反馈: {scores.get('feedback', '无')}\n", err=True)

        history.append({
            "round": round_num,
            "score": scores,
            "content_length": len(content),
            "timestamp": datetime.now().isoformat(),
        })

        # ── Step 3: 质量判断 ──
        if overall >= threshold:
            click.echo(f"✅ 第 {round_num} 轮通过！(得分 {overall} >= 门槛 {threshold})\n", err=True)
            final_content = content
            passed = True
            break
        else:
            click.echo(f"❌ 未通过 (得分 {overall} < 门槛 {threshold})", err=True)
            if round_num < max_rounds:
                click.echo(f"   → 将根据反馈重写...\n", err=True)
                feedback = scores.get("feedback", "请提高内容质量和洞察深度")
            else:
                click.echo(f"   已达最大轮次，使用最后一版\n", err=True)
                final_content = content

    # ── Step 4: 输出 ──
    if final_content:
        if output_path:
            os.makedirs(os.path.dirname(output_path) or ".", exist_ok=True)
            Path(output_path).write_text(final_content, encoding="utf-8")
            click.echo(f"💾 已保存到 {output_path}", err=True)
        else:
            click.echo("\n" + "─" * 40 + " 最终内容 " + "─" * 40, err=True)
            click.echo(final_content)
            click.echo("─" * 90, err=True)

    # ── Step 5: 飞书集成（如果可用）──
    if lark_available():
        status = "✅ 通过" if passed else "⚠️ 未达标（使用最后一版）"
        if lark_chat_id:
            lark_send_message(lark_chat_id,
                f"内容工作流完成\n主题: {topic}\n状态: {status}\n"
                f"轮次: {len(history)}\n最终得分: {history[-1]['score']['overall_score']}")

    # ── 输出工作流报告 ──
    report = {
        "topic": topic,
        "style": style,
        "threshold": threshold,
        "passed": passed,
        "total_rounds": len(history),
        "history": history,
        "final_content_length": len(final_content) if final_content else 0,
        "completed_at": datetime.now().isoformat(),
    }

    report_path = output_path.replace(".md", ".report.json") if output_path else None
    if report_path:
        Path(report_path).write_text(
            json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8")
        click.echo(f"📊 工作流报告: {report_path}", err=True)

    click.echo(f"\n{'═' * 50}", err=True)
    click.echo(f"  工作流完成 | {'通过' if passed else '未达标'} | {len(history)}轮", err=True)
    click.echo(f"{'═' * 50}\n", err=True)

    return final_content, report


# ── CLI 入口 ─────────────────────────────────────────

@click.group()
def cli():
    """content-studio: 带质量门控的内容生产工作流

    不是Agent，是工作流。每步可控、可审计、可重现。
    """
    pass


@cli.command()
@click.option("--topic", "-t", required=True, help="内容主题")
@click.option("--style", "-s", default="brief",
              type=click.Choice(["brief", "xiaohongshu", "wechat", "twitter"]),
              help="输出风格")
@click.option("--threshold", default=DEFAULT_THRESHOLD, help="质量门槛分数 (默认9)")
@click.option("--max-rounds", default=MAX_REWRITE_ROUNDS, help="最大重写轮次 (默认3)")
@click.option("--from-file", "-f", "input_file", default=None, help="从JSON文件读取素材")
@click.option("--output", "-o", default=None, help="输出文件路径")
@click.option("--fetch-news/--no-fetch", default=True, help="是否先抓取AI资讯")
@click.option("--language", "-l", default=None, help="资讯语言过滤: zh/en")
@click.option("--category", "-c", default=None, help="资讯分类过滤")
@click.option("--lark-chat-id", default=None, envvar="LARK_CHAT_ID", help="飞书通知群ID")
def produce(topic, style, threshold, max_rounds, input_file,
            output, fetch_news, language, category, lark_chat_id):
    """一键内容生产: 抓取素材 → 写稿 → 打分 → 重写循环 → 输出

    示例:
        # 基础用法
        python content_studio.py produce -t "本周AI大事" -s xiaohongshu

        # 从已有素材生成
        python content_studio.py produce -t "GPT-5" -f raw.json -s wechat

        # 降低门槛，快速出稿
        python content_studio.py produce -t "AI周报" --threshold 7

        # 完整流程 + 保存
        python content_studio.py produce -t "AI趋势" -s wechat -o output/weekly.md
    """
    # 获取素材
    if input_file:
        click.echo(f"📂 从文件加载素材: {input_file}", err=True)
        materials = json.loads(Path(input_file).read_text(encoding="utf-8"))
        # 兼容 fetch 输出格式（可能是裸列表或带items的对象）
        if isinstance(materials, dict) and "items" in materials:
            materials = materials["items"]
    elif fetch_news:
        click.echo("📡 抓取 AI 资讯...\n", err=True)
        # 调用 ai-news CLI
        ai_news_path = Path(__file__).parent.parent / "ai-news" / "ai_news.py"
        cmd = [sys.executable, str(ai_news_path), "fetch"]
        if language:
            cmd.extend(["--language", language])
        if category:
            cmd.extend(["--category", category])

        try:
            result = subprocess.run(cmd, capture_output=True, text=True, timeout=60)
            if result.returncode == 0 and result.stdout.strip():
                materials = json.loads(result.stdout)
            else:
                click.echo(f"  ⚠ 资讯抓取失败: {result.stderr}", err=True)
                click.echo("  使用 --from-file 指定素材文件", err=True)
                return
        except (subprocess.TimeoutExpired, FileNotFoundError) as e:
            click.echo(f"  ⚠ 无法调用 ai-news: {e}", err=True)
            return
    else:
        click.echo("⚠ 未提供素材来源，请使用 --from-file 或 --fetch-news", err=True)
        return

    click.echo(f"📋 共 {len(materials)} 条素材\n", err=True)

    # 设置默认输出路径
    if not output:
        today = datetime.now().strftime("%Y%m%d_%H%M")
        output = f"output/{today}_{style}.md"

    # 执行工作流
    run_pipeline(
        materials=materials,
        topic=topic,
        style=style,
        threshold=threshold,
        max_rounds=max_rounds,
        output_path=output,
        lark_chat_id=lark_chat_id,
    )


@cli.command()
def status():
    """显示系统状态: LLM后端、飞书连接、工具链"""
    click.echo("═══ Content Studio 状态 ═══\n")

    # LLM 后端
    backend, config = get_llm_backend()
    if backend:
        click.echo(f"🤖 LLM 后端: {backend} ({config['model']})")
    else:
        click.echo("🤖 LLM 后端: ⚠ 未配置 (将使用模拟模式)")
        click.echo("   设置 ANTHROPIC_API_KEY 或 OPENAI_API_KEY")

    # 飞书
    if lark_available():
        click.echo("📱 飞书CLI: ✅ 已安装")
    else:
        click.echo("📱 飞书CLI: ❌ 未安装 (可选)")
        click.echo("   npm install -g @larksuite/cli")

    # ai-news
    ai_news_path = Path(__file__).parent.parent / "ai-news" / "ai_news.py"
    if ai_news_path.exists():
        click.echo("📡 ai-news: ✅ 就绪")
    else:
        click.echo("📡 ai-news: ❌ 未找到")

    click.echo()


if __name__ == "__main__":
    cli()
