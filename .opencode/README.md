# 🤖 OpenCode Multiagent System - Auto Tools Audit

Complete agent-based system for executing the 23-task security and performance audit.

## 📁 File Structure

```
.opencode/agents/
├── coder.md                    # Core implementation agent
├── reviewer.md                 # Code review & QA agent
├── researcher.md               # General research agent
├── orchestrator.md             # Coordination & workflow management
├── security-specialist.md      # Sprint 1 security focus
├── performance-specialist.md   # Sprint 2 performance focus
├── security-researcher.md      # Security research specialist
├── perf-researcher.md          # Performance research specialist
└── architecture-researcher.md  # Architecture research specialist
```

## 🎯 Core Agents (4)

### 1. **@coder** (Subagent)
**Role**: Implementation specialist
- Implements code tasks with full testing
- Writes and validates tests
- Creates commits with exact messages
- Invokes @reviewer when done

**Use when**: "Implement Sprint 1, Task 1.1"

### 2. **@reviewer** (Subagent)
**Role**: Quality assurance & merge authority
- Reviews code for security, performance, quality
- Validates tests (100% pass rate)
- Approves and merges to main
- Invokes @researcher if questions arise

**Use when**: Code needs validation before merge

### 3. **@researcher** (Subagent)
**Role**: Technical research specialist
- Investigates alternatives and best practices
- Provides secure-by-default recommendations
- Fetches documentation and benchmarks
- Read-only (cannot modify code)

**Use when**: "Research Firebase + Electron security patterns"

### 4. **@orchestrator** (Primary Agent - Optional)
**Role**: Coordination and workflow management
- Manages task sequencing
- Tracks progress across sprints
- Handles task delegation
- Coordinates between agents

**Use when**: Starting a full sprint or multiple tasks

## 🚀 Quick Start

### Option A: Manual Task Execution
```bash
# Start OpenCode
opencode

# In OpenCode, ask coder directly:
@coder Implement Tarefa 1.1 - Firebase Credentials

# Prompt appears in terminal. Copy from docs/QUICK_PROMPTS_IA.md P1.1
# Paste and coder starts implementing

# When done, coder invokes reviewer:
@reviewer Validate Tarefa 1.1
```

### Option B: Orchestrated Execution (Recommended)
```bash
opencode

# Start with orchestrator:
@orchestrator Start Sprint 1, Task 1.1

# Orchestrator manages workflow:
# 1. Gets task prompt
# 2. Invokes @coder
# 3. Monitors @coder progress
# 4. Invokes @reviewer
# 5. Handles feedback loop
# 6. Moves to next task
```

## 📋 Task Workflow

```
1. You: Describe task or invoke agent
   └─ "Implement Tarefa 1.1 - Firebase Credentials"

2. @coder:
   ├─ Reads task
   ├─ Implements code
   ├─ Writes tests
   ├─ Runs tests (100% pass?)
   ├─ Commits with message
   └─ Invokes @reviewer

3. @reviewer:
   ├─ Checks security
   ├─ Checks performance
   ├─ Checks quality
   ├─ Validates tests
   └─ Either:
      ├─ APPROVE → MERGE
      └─ REQUEST CHANGES → back to @coder

4. @researcher (if needed):
   ├─ Investigates questions
   ├─ Provides recommendations
   └─ Returns to @reviewer

5. Result:
   └─ Merged to main branch ✅
```

## 🎓 Example Commands

### Single Task
```
@coder Implement Tarefa 1.1 - Firebase Credentials

Prompt:
TAREFA: 1.1 - Firebase Credentials

AÇÕES:
1. Editar package.json
2. Editar electron/main.cjs
3. Criar docs/SETUP_FIREBASE.md

TESTES:
- [ ] firebase-credentials.json NÃO está no bundle
- [ ] App inicia corretamente

COMMIT: "Tarefa 1.1 - Firebase credentials"
```

### Research Question
```
@researcher What are the security best practices for storing Firebase credentials in Electron?

Topics:
1. DPAPI security on Windows
2. Alternative approaches
3. Known vulnerabilities
4. Industry recommendations
```

### Review Task
```
@reviewer Check code quality and security for Tarefa 1.1

Please validate:
- No hardcoded secrets
- Tests pass 100%
- No security issues
- Code follows style guide
- Ready to merge?
```

### Full Sprint Orchestration
```
@orchestrator Execute Sprint 1 - Security Hardening

This will:
1. Run tasks P1.1 through P1.8 in sequence
2. Delegate to @coder for implementation
3. Validate with @reviewer
4. Research with @researcher when needed
5. Track progress and merge when ready
```

## 🔄 Agent Invocation Methods

### Direct @ Mention
```
@coder [task]
@reviewer [validation]
@researcher [research question]
```

### Via Task Tool
Agents can invoke each other:
- @coder invokes @reviewer when done
- @reviewer invokes @researcher for questions
- Automatic orchestration possible

### Via Orchestrator
```
@orchestrator Execute Sprint X, Task Y

Orchestrator handles:
- Getting task prompt
- Invoking appropriate agents
- Managing feedback loops
- Tracking completion
```

## 📊 Task Categories

### Sprint 1: Security (P1.1-P1.8)
Use: `@coder` + `@security-researcher` + `@reviewer`

### Sprint 2: Performance (P2.1-P2.8)
Use: `@coder` + `@perf-researcher` + `@reviewer`

### Sprint 3: Architecture (P3.1-P3.3)
Use: `@coder` + `@architecture-researcher` + `@reviewer`

### Sprint 4: Validation (P4.1-P4.3)
Use: `@coder` + `@reviewer` + all researchers

## 📚 Resources

### Task Prompts
- `docs/QUICK_PROMPTS_IA.md` - Compact task prompts (copy-paste ready)
- `docs/PROMPTS_IA_EXECUCAO.md` - Detailed task prompts with context

### Technical Analysis
- `docs/ANALISE_PARA_CORRECAO.md` - Full problem analysis (23 issues)
- `docs/PLANO_DE_ACAO.md` - Task dependencies and timeline
- `docs/RESUMO_EXECUTIVO.md` - Executive summary

### Validation
- `docs/VERIFICACAO_FINAL.md` - QA checklist (100% coverage)
- `docs/testes/` - Test templates and tracking

## ⚙️ Configuration

### opencode.json
- Model: Claude Haiku 4.5 (or your choice)
- Permissions: Configured per agent
- Schema: `https://opencode.ai/config.json`

### Agent Settings
- **@coder**: Full edit/bash permissions
- **@reviewer**: Read-only + git commands
- **@researcher**: Read + webfetch, no edits
- **@orchestrator**: Full permissions for coordination

## 🎯 Success Criteria

✅ All 23 tasks completed
✅ 0 security vulnerabilities (critical)
✅ 10x performance improvement
✅ Architecture refactored
✅ 100% test coverage
✅ Code merged to main
✅ Ready for production

## 🚨 Critical Dependencies

⚠️ **P1.5 must complete before P2.1**
- WAL mode prerequisite for better-sqlite3 migration

⚠️ **Sprint 1 must complete before Sprint 2**
- Security fixes needed before optimization

⚠️ **Sprint N must complete before Sprint N+1**
- Sequential dependencies enforced

## 💡 Tips & Tricks

### Get Help
```
@researcher [question]
```

### Check Progress
```
@orchestrator Status update - which tasks completed?
```

### Review Code
```
@reviewer Validate [task name]
```

### Fix Issues
```
@coder [description of issue to fix]
```

### Share with Team
Use `/share` command in OpenCode to share conversations

## 🔗 Related Documentation

- `opencode.json` - Agent configuration
- `.opencode/agents/` - Agent definitions
- `docs/GUIA_POR_AGENTE.md` - Detailed agent guide
- `docs/WORKFLOW_MULTIAGENT.md` - Complete workflow docs

## 🎉 Ready?

Start with:
```
@coder Implement Tarefa 1.1 - Firebase Credentials

[Copy prompt from docs/QUICK_PROMPTS_IA.md P1.1]
```

Or orchestrate a full sprint:
```
@orchestrator Execute Sprint 1 complete
```

---

**Total Tasks**: 23
**Estimated Time**: ~17 hours (parallel execution)
**Status**: 🟢 Ready to execute!
