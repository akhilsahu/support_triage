# Yullo Aura Operations Manual

This document outlines the operational controls, deployment flags, and telemetry mechanisms for Yullo Aura, ensuring safe scaling and rollback capability.

## Feature Flags

All Aura rollout is governed by flags in `app/config.py`. These flags can be toggled via environment variables:

- `YULLO_AURA_ENABLED`: Global master switch for Aura inference.
- `YULLO_AURA_PUBLIC_ENABLED`: Whether the public unauthenticated widget endpoints are allowed.
- `YULLO_RESOURCE_UI_ENABLED`: Enables generative UI tool calls (e.g., `show_ui_card`).
- `YULLO_AURA_EVALUATIONS_ENABLED`: Controls if the evaluation suite runner is permitted to execute Aura headless runs.
- `YULLO_PUBLICATION_GATE_ENABLED`: If true, restricts Aura RAG to `published` facts only (ignoring drafts).

## Telemetry and Cost Attribution

Aura is a high-volume inference service. To track costs securely without polluting Support247 reports, all usage is logged to `ai_usage_events` via `AiUsageEvent`.

### Context Vars

Aura uses `app.services.ai_usage_context.AiUsageContext` to propagate attribution. The `app.yullo.adapters.usage` adapter sets this context.

Fields recorded:
- `space_id`
- `session_id`
- `message_id`
- `product = "yullo"`
- `runtime_kind = "yullo_aura"`
- `aura_id`
- `aura_version_id`

Usage is recorded asynchronously after the stream completes to avoid blocking user latency.

## Rollback Procedure

If Aura begins hallucinating or crashing:
1. Set `YULLO_AURA_ENABLED=False` and restart the backend.
2. For prompt iterations, draft changes and test via the Evaluations API.
3. Once tests pass, publish the new `aura_version` and rollback via deployment tools.
