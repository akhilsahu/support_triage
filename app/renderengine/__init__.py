"""
Pluggable AI-recommendation engines for chatbot-context-aware UI rendering.

Each engine here follows the same shape (see base.py):
    admin override (if any) → Redis segment cache → timeout-guarded LLM call
    → validate against a fixed, developer-maintained pool → safe default.

Callers (existing API handlers, existing orchestrator code) import a single
function from the relevant module and treat it as a plain utility call — all
cache/LLM/fallback logic stays inside this package.
"""
