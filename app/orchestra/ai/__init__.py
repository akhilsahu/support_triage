"""
app/orchestra/ai_claude — Agno-based agent orchestration POC.

Drop-in replacement for DynamicAgentExecutor built on Agno's framework.

Key wins over the custom executor:
  - Single LLM call per request (Team routing replaces triage LLM call)
  - Native parallel tool execution
  - Native streaming
  - Model-validated tool schemas (no hand-parsed JSON)
  - Built-in mem0 memory backend

Entry point: OrchestraExecutor (executor.py)
"""
