# 多 Agent 协作模式调研报告

> 整理日期：2026-04-03
> 用途：为"面向非技术用户的对抗式多 Agent 协作平台"提供参考依据

---

## 主题一：OpenClaw Agent 模式

### 核心概念

OpenClaw 是开源自治 AI Agent 框架，其多 Agent 机制基于**消息路由**：单个 Gateway 承载多个独立 Agent 实例，每个实例有独立 persona、workspace、session 历史、模型配置和工具权限，通过绑定规则路由消息。

2026 年引入**嵌套子 Agent（Nested Sub-Agents）**和 **Lobster 工作流引擎**，支持顶层 Manager Agent 动态派生子 Agent，实现确定性多 Agent 流水线。

典型角色分工：**Planner → Developer → Verifier → Tester → Reviewer**，形成闭环。ClawTeam 实现了 Swarm 协调模式，支持任务拆分、Worker 派发和结果合并。

### 关键资源

| 来源 | 链接 |
|------|------|
| OpenClaw 官方多 Agent 路由文档 | https://docs.openclaw.ai/concepts/multi-agent |
| OpenClaw 官方 AGENTS.md | https://github.com/openclaw/openclaw/blob/main/AGENTS.md |
| shenhao-stu/openclaw-agents（9 角色团队） | https://github.com/shenhao-stu/openclaw-agents |
| win4r/ClawTeam-OpenClaw（Swarm 协调） | https://github.com/win4r/ClawTeam-OpenClaw |
| Antfarm（一键构建 Agent 团队） | https://github.com/snarktank/antfarm |
| DEV.to：确定性多 Agent 流水线实践 | https://dev.to/ggondim/how-i-built-a-deterministic-multi-agent-dev-pipeline-inside-openclaw-and-contributed-a-missing-4ool |
| OpenClaw 嵌套子 Agent 指南 | https://openclawnews.online/article/openclaw-nested-sub-agents-guide |

### 对平台设计的参考价值

- **角色分工模板可直接复用**：Planner/Reviewer 分工契合"起草-对抗-精炼"写作流程
- **消息路由机制**：单 Gateway 多 Agent 适合封装统一入口，用户无需感知底层 Agent 切换
- **Lobster 工作流引擎**：提供确定性流水线控制，适合构建可审计、可回溯的内容生产链路

---

## 主题二：多 Agent 协作 / 写作模式

### 核心概念

主流框架各有侧重：
- **AutoGen（AG2）**：事件驱动的 GroupChat，多 Agent 轮流发言、互相辩论
- **CrewAI**：角色驱动团队协作，对非技术用户最友好
- **LangGraph**：有向图管理 Agent 状态流转，适合复杂条件分支
- **MetaGPT**：模拟完整软件公司角色（PM/架构师/开发/测试）

**对抗式精炼（Adversarial Refinement）** 有坚实学术支撑：
- Du et al.（2023）MAD 论文证明多 Agent 辩论显著提升事实性和推理准确率
- 2025 年 FREE-MAD 研究可降低 94.5% token 消耗
- 多 Agent 对比单 Agent 成功率从 60% 提升至 92.1%

典型内容生产链路：**Researcher → Writer → Critic → Editor → Publisher**

### 关键资源

| 来源 | 链接 |
|------|------|
| Du et al.（2023）多 Agent 辩论论文 | https://arxiv.org/abs/2305.14325 |
| 多 Agent 协作机制综述（2025） | https://arxiv.org/pdf/2501.06322 |
| FREE-MAD：高效多 Agent 辩论 | https://arxiv.org/pdf/2509.11035 |
| LangGraph vs CrewAI vs AutoGen 2026 对比 | https://o-mega.ai/articles/langgraph-vs-crewai-vs-autogen-top-10-agent-frameworks-2026 |
| DataCamp：框架选型指南 | https://www.datacamp.com/tutorial/crewai-vs-langgraph-vs-autogen |
| MetaGPT GitHub | https://github.com/FoundationAgents/MetaGPT |
| Multi-Agent Debate Strategies | https://www.emergentmind.com/topics/multi-agent-debate-mad-strategies |

### 对平台设计的参考价值

- **学术背书充分**：MAD 系列论文提供"对抗式精炼"的理论依据，可作为平台核心叙事
- **AutoGen GroupChat**：可复用"多 Agent 轮流发言 + 裁判 Agent 决策"模式
- **CrewAI 角色抽象**：Role-Task-Crew 三层模型适合参考 UI/UX 设计
- **FREE-MAD 效率优化**：94.5% token 节省对控制平台运营成本有直接价值

---

## 主题三：Claude Code 多 Agent 协作模式

### 核心概念

Claude Code 提供两种多 Agent 机制：

**Subagents（轻量委托）**
- 由主 Agent 派生，各自拥有独立 context window，只向父 Agent 汇报结果
- 支持并发运行，适合"快速分发、结果聚合"场景
- 可通过代码（`AgentDefinition`）或文件系统（`.claude/agents/*.md`）定义

**Agent Teams（深度协作，实验性）**
- Team Lead + Teammates 架构，共享任务列表、点对点消息通信（Mailbox）、文件锁防冲突
- 支持 Plan Approval 门控（Reviewer 模式）和 Hooks 质量门
- 官方推荐 3-5 个 Teammate，推荐用例：**多 Teammate 测试不同假设、互相驳斥**

Claude Agent SDK（2025 年 9 月更名自 Claude Code SDK）将以上能力封装为 Python/TypeScript 库。

### 关键资源

| 来源 | 链接 |
|------|------|
| Claude Code 官方：创建自定义 Subagents | https://code.claude.com/docs/en/sub-agents |
| Claude Code 官方：Agent Teams 文档 | https://code.claude.com/docs/en/agent-teams |
| Claude Agent SDK：Subagents | https://platform.claude.com/docs/en/agent-sdk/subagents |
| DEV.to：10+ Claude 实例并发编排实践 | https://dev.to/bredmond1019/multi-agent-orchestration-running-10-claude-instances-in-parallel-part-3-29da |
| Shipyard：Claude Code 多 Agent 编排 2026 | https://shipyard.build/blog/claude-code-multi-agent |
| MindStudio：Agent Teams 解析 | https://www.mindstudio.ai/blog/what-is-claude-code-agent-teams |
| claude-code-ultimate-guide / agent-teams.md | https://github.com/FlorianBruniaux/claude-code-ultimate-guide/blob/main/guide/workflows/agent-teams.md |

### 对平台设计的参考价值

- **Agent Teams "竞争假设"模式**：官方明确推荐多 Teammate 互相驳斥，与对抗式精炼直接对应
- **Plan Approval 门控**：Reviewer Teammate 可拒绝方案并要求修改，天然实现迭代闭环
- **Hooks 质量门**：`TeammateIdle` hook 可强制触发对抗评审，构建不可跳过的质量关卡
- **Context 隔离**：对抗过程对用户透明，只展示最终结论，契合产品需求

---

## 横向对比与平台设计建议

| 维度 | OpenClaw | AutoGen / CrewAI / LangGraph | Claude Code Agent SDK |
|------|----------|------------------------------|----------------------|
| 角色分工 | Planner/Coder/Reviewer/Manager | Role-driven / GroupChat | Subagent 定义 + Team Lead/Teammate |
| 对抗机制 | Critic Agent / Swarm 辩论 | MAD 辩论 / Adversarial Gate | 竞争假设模式 / Plan Approval |
| 面向非技术用户 | 中（需配置 SOUL 文件） | 中高（CrewAI 较友好） | 高（SDK 可完整封装交互层） |
| 并发支持 | 是 | 是（AutoGen 异步） | 是（Subagent 并发 / Agent Teams） |
| 最适合借鉴 | 角色定义模板、路由机制 | 对抗精炼学术框架、GroupChat 模式 | 底层 SDK 实现、质量门 Hooks |

**结论：** 用 Claude Agent SDK 作为底层实现，借鉴 CrewAI 的角色抽象做用户界面，参考 MAD 论文作为核心叙事，是目前性价比最高的路径。
