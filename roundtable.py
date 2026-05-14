"""
圆桌深度对谈系统
多AI智者围绕一个话题展开多轮深度讨论，互相评分，产出洞见排名

架构：
- 5位思想家角色（各有独特视角和风格）
- N轮对谈：每轮每位角色发言，回应他人观点
- 评分阶段：每轮结束后互评（深度/逻辑/创新/启发性）
- 最终：排名榜 + 综合总结
"""

from openai import OpenAI
import json
import time
import sys
import os
from dataclasses import dataclass, field
from typing import Optional

# ─── 角色定义 ────────────────────────────────────────────────────────────────

THINKERS = [
    {
        "id": "socrates",
        "name": "苏格拉底",
        "role": "追问本质的哲学家",
        "emoji": "🏛️",
        "system": """你是苏格拉底，圆桌对谈的参与者。

你的思维方式：
- 永远追问"这究竟意味着什么？"和"这个前提成立吗？"
- 用反问和思想实验颠覆看似显然的结论
- 承认自己的无知，但通过追问揭示他人的矛盾
- 不给出答案，而是让答案在对话中自然浮现

对谈规则：
- 直接回应其他参与者的具体观点，称呼他们的名字
- 找出他们论点中最脆弱的环节进行质疑
- 每次发言200-350字，不多不少
- 语言简洁有力，每句话都有重量""",
    },
    {
        "id": "curie",
        "name": "居里",
        "role": "追求证据的科学家",
        "emoji": "⚗️",
        "system": """你是玛丽·居里，圆桌对谈的参与者。

你的思维方式：
- 要求具体证据和可验证的论据，不接受空泛断言
- 识别论证中的认知偏差和逻辑谬误
- 区分"我们知道的"和"我们假设的"
- 科学不是绝对真理，但比猜测更可靠

对谈规则：
- 直接回应其他参与者的具体观点，称呼他们的名字
- 指出哪些主张需要证据支撑，哪些是合理推断
- 每次发言200-350字，不多不少
- 语言精确严谨，但不失人情温度""",
    },
    {
        "id": "nietzsche",
        "name": "尼采",
        "role": "颠覆价值的批判者",
        "emoji": "⚡",
        "system": """你是尼采，圆桌对谈的参与者。

你的思维方式：
- 怀疑所有被称为"理所当然"的东西背后的权力动机
- 追问：谁从这个观点中获益？这是强者的道德还是弱者的怨恨？
- 不怕孤立，甚至享受成为唯一清醒者的孤独
- 批判但不虚无，始终指向更高的可能性

对谈规则：
- 直接回应其他参与者的具体观点，称呼他们的名字
- 揭示他们思想中隐藏的奴隶道德或自我欺骗
- 每次发言200-350字，不多不少
- 语言充满激情，偶尔格言化，但洞见真实""",
    },
    {
        "id": "tesla",
        "name": "特斯拉",
        "role": "跨界连接的创新者",
        "emoji": "🔬",
        "system": """你是尼古拉·特斯拉，圆桌对谈的参与者。

你的思维方式：
- 在看似无关的领域之间发现深层联系
- 用物理学、工程学的眼光重新框架哲学问题
- 不被主流范式束缚，提出激进但有内在逻辑的新框架
- 思维跳跃，但每一跳都有隐含的推理路径

对谈规则：
- 直接回应其他参与者的具体观点，称呼他们的名字
- 用跨学科类比和系统性思维重新构建问题
- 每次发言200-350字，不多不少
- 语言充满好奇和活力，带着发现新大陆的兴奋感""",
    },
    {
        "id": "confucius",
        "name": "孔子",
        "role": "寻求实践智慧的导师",
        "emoji": "📜",
        "system": """你是孔子，圆桌对谈的参与者。

你的思维方式：
- 一切洞见最终都要回答：人应当如何生活？
- 从历史经验中寻找规律，但不迷信先例
- 关注思想对人际关系和社会秩序的影响
- 平衡理想与现实，道德原则与情境智慧

对谈规则：
- 直接回应其他参与者的具体观点，称呼他们的名字
- 将抽象争论落回到人的实践与修身
- 每次发言200-350字，不多不少
- 语言凝练，时而格言，但始终接地气""",
    },
]

SCORE_DIMENSIONS = ["深度", "逻辑", "创新", "启发性"]

# ─── 数据结构 ────────────────────────────────────────────────────────────────

@dataclass
class ThinkerState:
    config: dict
    round_scores: list = field(default_factory=list)  # 每轮收到的平均分

# ─── 显示工具 ────────────────────────────────────────────────────────────────

def hr(char="─", width=64):
    print(char * width)

def header(text, char="═"):
    print()
    hr(char)
    print(f"  {text}")
    hr(char)

def thinker_header(thinker):
    print(f"\n{thinker['emoji']} 【{thinker['name']} · {thinker['role']}】")
    print("  " + "·" * 40)

def score_bar(score, max_score=10, width=20):
    filled = int(score / max_score * width)
    return "█" * filled + "░" * (width - filled) + f"  {score:.1f}"

# ─── 核心系统 ────────────────────────────────────────────────────────────────

class RoundtableSession:
    def __init__(self, topic: str, rounds: int = 3):
        self.topic = topic
        self.rounds = rounds
        self.client = OpenAI(
            api_key="ollama",
            base_url="http://localhost:11434/v1",
        )
        self.thinkers = {t["id"]: ThinkerState(config=t) for t in THINKERS}
        self.log: list[dict] = []  # 完整对话记录

    def _build_context(self, current_thinker_id: str) -> str:
        """为当前发言者构建上下文"""
        ctx = f"【本次圆桌话题】：{self.topic}\n\n"

        if not self.log:
            ctx += "你是第一位发言者，请率先提出你最犀利的核心观点，为讨论定下基调。"
            return ctx

        ctx += "【对谈记录】\n"
        for entry in self.log:
            t = self.thinkers[entry["id"]].config
            ctx += f"\n{t['emoji']} {t['name']}：\n{entry['content']}\n"

        ctx += f"\n\n现在轮到你（{self.thinkers[current_thinker_id].config['name']}）发言。"
        ctx += "\n请深入回应上面的观点，尤其是那些与你立场不同的论述。"
        return ctx

    def _speak(self, thinker_id: str) -> str:
        """让一位思想家发言（流式输出）"""
        thinker = self.thinkers[thinker_id].config
        thinker_header(thinker)
        print("  ", end="", flush=True)

        prompt = self._build_context(thinker_id)
        full_text = ""

        stream = self.client.chat.completions.create(
            model="gemma3:2b",
            max_tokens=700,
            messages=[
                {"role": "system", "content": thinker["system"]},
                {"role": "user", "content": prompt},
            ],
            stream=True,
        )
        for chunk in stream:
            text = chunk.choices[0].delta.content or ""
            text_display = text.replace("\n", "\n  ")
            print(text_display, end="", flush=True)
            full_text += text

        print("\n")
        return full_text

    def _score_round(self, round_responses: dict[str, str]) -> dict:
        """
        每位思想家对其他人的本轮发言打分
        返回：{thinker_id: {scorer_id: {dim: score, comment: str}}}
        """
        all_scores: dict[str, dict] = {tid: {} for tid in self.thinkers}

        for scorer_id, scorer in self.thinkers.items():
            others_text = ""
            for tid, response in round_responses.items():
                if tid == scorer_id:
                    continue
                name = self.thinkers[tid].config["name"]
                # 只取前300字用于评分，避免过长
                excerpt = response[:300] + ("..." if len(response) > 300 else "")
                others_text += f"【{name}】：{excerpt}\n\n"

            score_prompt = f"""话题：{self.topic}

以下是本轮其他参与者的发言：

{others_text}

请以JSON格式对每位参与者打分（每项1-10分整数），格式：
{{
  "参与者名字": {{
    "深度": 整数,
    "逻辑": 整数,
    "创新": 整数,
    "启发性": 整数,
    "评语": "一句话点评（20字内）"
  }}
}}

只返回JSON，不要任何前缀或后缀。"""

            try:
                resp = self.client.chat.completions.create(
                    model="gemma3:2b",
                    max_tokens=600,
                    messages=[
                        {"role": "system", "content": scorer.config["system"]},
                        {"role": "user", "content": score_prompt},
                    ],
                )
                raw = resp.choices[0].message.content.strip()
                # 提取JSON
                start = raw.find("{")
                end = raw.rfind("}") + 1
                if start >= 0 and end > start:
                    parsed = json.loads(raw[start:end])
                    # 将名字映射回ID
                    for name, dims in parsed.items():
                        for tid, state in self.thinkers.items():
                            if state.config["name"] == name:
                                all_scores[tid][scorer_id] = dims
                                break
            except Exception as e:
                pass  # 评分失败时跳过，不中断对谈

        return all_scores

    def _display_scores(self, round_num: int, all_scores: dict) -> dict[str, float]:
        """展示本轮评分，返回每人本轮平均分"""
        header(f"第 {round_num} 轮 · 互评结果", char="─")

        round_avgs: dict[str, float] = {}

        for tid, state in self.thinkers.items():
            scores_for_this = all_scores.get(tid, {})
            if not scores_for_this:
                continue

            all_dim_scores = {d: [] for d in SCORE_DIMENSIONS}
            comments = []

            for scorer_id, dims in scores_for_this.items():
                for d in SCORE_DIMENSIONS:
                    if d in dims:
                        try:
                            all_dim_scores[d].append(int(dims[d]))
                        except (ValueError, TypeError):
                            pass
                if "评语" in dims:
                    scorer_name = self.thinkers[scorer_id].config["name"]
                    comments.append(f"{scorer_name}：{dims['评语']}")

            # 计算平均
            dim_avgs = {}
            for d in SCORE_DIMENSIONS:
                if all_dim_scores[d]:
                    dim_avgs[d] = sum(all_dim_scores[d]) / len(all_dim_scores[d])

            if dim_avgs:
                overall = sum(dim_avgs.values()) / len(dim_avgs)
                round_avgs[tid] = overall
                state.round_scores.append(overall)

                t = state.config
                print(f"\n  {t['emoji']} {t['name']}")
                for d, avg in dim_avgs.items():
                    print(f"    {d:<5} {score_bar(avg)}")
                print(f"    综合  {score_bar(overall)}  ← 本轮")
                if comments:
                    print(f"    评语：{' / '.join(comments[:3])}")

        return round_avgs

    def _final_leaderboard(self):
        """最终总排名"""
        header("总排名 · 对谈落幕", char="═")

        rankings = []
        for tid, state in self.thinkers.items():
            if state.round_scores:
                total_avg = sum(state.round_scores) / len(state.round_scores)
                rankings.append((tid, state, total_avg))

        rankings.sort(key=lambda x: x[2], reverse=True)

        medals = ["🥇", "🥈", "🥉", "  4.", "  5."]
        print()
        for i, (tid, state, avg) in enumerate(rankings):
            t = state.config
            bar = score_bar(avg)
            print(f"  {medals[i]} {t['emoji']} {t['name']:<8} {bar}")
            round_detail = "  ".join(f"R{j+1}:{s:.1f}" for j, s in enumerate(state.round_scores))
            print(f"       ({round_detail})")

        # 总结
        header("智慧总结", char="─")
        winner = rankings[0][1].config
        print(f"\n  最高分：{winner['emoji']} {winner['name']}（{rankings[0][2]:.2f}分）\n")

        synthesis_prompt = f"""你是一位深刻的圆桌主持人，刚刚主持了一场关于"{self.topic}"的深度对谈。

参与者：{', '.join(t['name'] for t in THINKERS)}

以下是最后一轮发言摘要：
"""
        for entry in self.log[-len(THINKERS):]:
            t = self.thinkers[entry["id"]].config
            excerpt = entry["content"][:200]
            synthesis_prompt += f"\n{t['name']}：{excerpt}...\n"

        synthesis_prompt += """

请用400字以内：
1. 点出本次对谈最深刻的3个洞见
2. 揭示各方的核心分歧所在
3. 提出一个还未被任何人触及的深层问题

不要评价谁对谁错，而是提炼集体智慧的结晶。"""

        print("  ", end="", flush=True)
        stream = self.client.chat.completions.create(
            model="gemma3:2b",
            max_tokens=600,
            messages=[{"role": "user", "content": synthesis_prompt}],
            stream=True,
        )
        for chunk in stream:
            text = chunk.choices[0].delta.content or ""
            text_display = text.replace("\n", "\n  ")
            print(text_display, end="", flush=True)

        print("\n")
        hr("═")

    def run(self):
        """启动圆桌对谈"""
        header(f"圆 桌 深 度 对 谈", char="═")
        print(f"\n  话题：{self.topic}")
        print(f"  参与者：{'  '.join(t['emoji'] + t['name'] for t in THINKERS)}")
        print(f"  轮次：{self.rounds} 轮对谈 + 互评 + 总结")
        hr("═")

        for round_num in range(1, self.rounds + 1):
            header(f"第 {round_num} 轮 · 深度发言", char="─")

            round_responses: dict[str, str] = {}

            for thinker_id in self.thinkers:
                response = self._speak(thinker_id)
                round_responses[thinker_id] = response
                self.log.append({"id": thinker_id, "round": round_num, "content": response})
                time.sleep(0.3)

            # 评分
            print("\n  ⏳ 思想家们正在互评本轮发言...\n")
            all_scores = self._score_round(round_responses)
            self._display_scores(round_num, all_scores)

        # 最终排名与总结
        self._final_leaderboard()


# ─── 入口 ────────────────────────────────────────────────────────────────────

def main():
    print("\n" + "═" * 64)
    print("  🎭  圆桌深度对谈系统  v1.0")
    print("  苏格拉底 · 居里 · 尼采 · 特斯拉 · 孔子")
    print("  五位思想家，围绕你的话题，深度碰撞，互相打分")
    print("═" * 64 + "\n")

    # 检查 Ollama 是否在运行
    import urllib.request
    try:
        urllib.request.urlopen("http://localhost:11434", timeout=2)
    except Exception:
        print("  ❌ Ollama 未运行，请先启动：ollama serve")
        sys.exit(1)

    topic = input("  请输入对谈话题（回车使用示例）：").strip()
    if not topic:
        topic = "人工智能究竟是人类智慧的延伸，还是对人类价值的根本威胁？"
        print(f"  使用示例话题：{topic}")

    print()
    rounds_str = input("  对谈轮次（建议2-4轮，默认3）：").strip()
    rounds = int(rounds_str) if rounds_str.isdigit() and 1 <= int(rounds_str) <= 6 else 3

    print(f"\n  ▶ 开始对谈，共 {rounds} 轮，预计 {rounds * 3 + 2} 分钟...\n")
    time.sleep(1)

    session = RoundtableSession(topic=topic, rounds=rounds)
    session.run()


if __name__ == "__main__":
    main()
