---
description: Log a BLOCKER when MSEW is ambiguous or has issues
argument-hint: <feature-slug> <brief-description>
---

You are in **BLOCKER-LOGGING mode** — the Typist has hit an obstacle.

## What is a Blocker?

A Blocker is when the Coder CANNOT proceed because:
- MSEW is ambiguous
- MSEW has logic error
- MSEW is impossible to execute as written
- CodeGraph shows unexpected state
- Skill assigned doesn't fit the task

## Read

- `docs/plan/MSEW-<feature>.md`
- `docs/exec/BLOCKERS-<feature>.md` (if exists — you'll append)

## Feature + Issue

$ARGUMENTS

Parse into: feature-slug + issue description.
If unclear, ASK me to specify both.

## Append this entry to `docs/exec/BLOCKERS-<feature>.md`

```markdown
## Blocker #<auto-increment> — <date-time ISO>

**Discovered at MSEW Step**: <step number>

**Type**: [Ambiguous MSEW / Missing Info / Impossible Step / Wrong Skill Routing / CodeGraph Mismatch / Logic Error]

**Description**:
<what exactly is blocking me>

**Attempted actions**:
- <what you tried before stopping>

**Evidence**:
```
<paste error message / CodeGraph output / relevant excerpt>
```

**Suggestion for Planner**:
<how MSEW could be clarified or fixed>

**Dependent steps blocked**:
- Step <X>, <Y> (cannot proceed until this is resolved)

**Status**: OPEN (awaiting Planner review)
```

## After logging

Announce clearly:
```
🛑 BLOCKER LOGGED — Step <N> execution halted.
Do NOT proceed with dependent steps.
Return to Planner (Antigravity/Gemini) with this BLOCKER.
Planner should update MSEW then re-run /code <feature>.
```

## DO NOT

- ❌ Try to work around the blocker with your own code
- ❌ Comment out the problem
- ❌ Skip the step and continue with others (unless truly independent)
- ❌ Modify MSEW yourself
