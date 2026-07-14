---
name: adversarial-content
description: Generate content through adversarial refinement — Writer vs Critic, judged by Editor
user_invocable: true
---

# Adversarial Content Generation

Generate high-quality content through a Writer-Critic-Editor adversarial loop.

## Usage

The user provides:
- A topic or content brief
- Optional: intensity level (light / medium / intense) — defaults to medium
- Optional: content type (title, article, copy, script) — defaults to title

## Process

### Step 1: Writer Draft
Spawn the **Writer** agent with the user's topic. Ask it to produce the initial draft.

```
Agent(subagent_type="Writer", prompt="[user's topic + content type instructions]")
```

### Step 2: Critic Review
Spawn the **Critic** agent with the Writer's output. Ask it to tear it apart.

```
Agent(subagent_type="Critic", prompt="Review this draft and identify all weaknesses:\n\n[writer output]")
```

### Step 3: Writer Revision (medium/intense only)
Send the Critic's feedback back to a new **Writer** agent. Ask it to defend or improve.

```
Agent(subagent_type="Writer", prompt="A critic reviewed your draft. Respond to their feedback — defend your choices or make them better. Do NOT water down your voice.\n\nOriginal draft:\n[draft]\n\nCritic feedback:\n[feedback]")
```

### Step 4: Second Critic Pass (intense only)
Spawn another **Critic** agent to evaluate the revision.

```
Agent(subagent_type="Critic", prompt="The writer revised after criticism. Is the revision actually better? Be honest.\n\nOriginal:\n[original]\n\nRevision:\n[revision]\n\nOriginal criticism:\n[first criticism]")
```

### Step 5: Editor Final Cut
Spawn the **Editor** agent with the full exchange. It produces the final version.

```
Agent(subagent_type="Editor", prompt="You are the final editor. Here is the full adversarial exchange. Produce the definitive final version.\n\n[full exchange]")
```

### Step 6: Present to User
Show the user:
1. The final polished content
2. The Editor's quality score
3. A one-line summary of how the adversarial process improved the output

Optionally save the full exchange to a file if the user wants to review the process.

## Intensity Levels

| Level | Rounds | Steps |
|-------|--------|-------|
| light | 1 | Writer → Critic → Editor |
| medium | 2 | Writer → Critic → Writer revision → Editor |
| intense | 3+ | Writer → Critic → Writer revision → Critic again → Editor |
