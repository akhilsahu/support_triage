# Coding Agent Instructions

## Working style and scope

- Be concise. Report the outcome, meaningful verification and remaining gaps; do not dump internal reasoning or routine tool output.
- Inspect applicable instructions, the selected plan, current code and git status before editing. Preserve unrelated and uncommitted work.
- Treat an explicit implementation request as authorization to complete that scope. Do not repeatedly ask permission for routine edits, reads or checks.
- If the user requests planning only or step-by-step approval, respect that boundary. Ask concise questions only for material ambiguities, destructive actions or decisions not already authorized.
- Implement one selected form/feature at a time, including its required backend and frontend integration. Do not expand into unrelated plans.
- Verify the actual behavior with focused checks. Distinguish implemented code from verified integration and database migrations from applied migrations.
- Update the selected plan with completion status, files/endpoints changed, verification and pending work so the next session can continue without chat history.
- Do not commit, push, deploy or modify production data unless explicitly authorized. Existing authorization remains valid within its stated scope; do not ask again unnecessarily.

## File placement and repository hygiene

- Follow the existing directory structure. Before creating a file, search for an existing module or suitable directory and extend it where appropriate.
- Do not create unnecessary files in the repository root. Root files are reserved for genuine repository-wide entry points, configuration and documentation required by tooling, such as this AGENTS.md. A root file must have a clear purpose; task convenience is not sufficient.
- Put Yullo frontend code under `ui/src/yullo/`; form components under `ui/src/yullo/forms/`, with form-specific folders and shared Yullo fields under `forms/core/`.
- Put Yullo backend code under `app/yullo/`, using its existing `api/`, `schemas/`, `services/`, `adapters/` and `bootstrap/` packages. Reuse neutral infrastructure in its established shared backend location.
- Keep reusable form plans in `yullo/auraplans/form/` and Home plans in `yullo/auraplans/home/`. Update the relevant existing plan instead of creating competing implementation/status documents at the root.
- Put database migrations only in `alembic/versions/`; check migration history and applied revision before changes. Never rewrite an applied migration.
- Put tests in the appropriate existing `tests/` or frontend test location. Put reusable developer scripts in a suitable `scripts/` subdirectory; keep the Yullo bootstrap entry point under `app/yullo/bootstrap/`.
- Put checked-in fixtures or bootstrap sample JSON in the relevant feature fixture/example directory, following existing conventions. Update readers/docs if moving an existing file; never silently break a documented path.
- Use the operating system's temporary directory for one-off probes, scratch scripts, diagnostic outputs, screenshots and intermediate artifacts. Keep secrets, source bodies and personal data out of committed fixtures/logs.
- Direct generated coverage/build/cache output to the project's configured output directories, not ad hoc root files. Add narrowly scoped ignore rules only when needed; do not hide accidental source files with broad patterns.
- Before finishing, inspect the diff and untracked files. Remove only unnecessary temporary files created by your own task, verify references after moving files, and leave no task-created root clutter.
- Do not delete or move pre-existing unfamiliar files as cleanup. Report existing clutter separately unless cleanup is authorized.

## Reuse and product isolation

- Keep Yullo and Support247 frontend components, styling and product flows isolated. Reuse UI primitives/components within Yullo, not Support247 screens or forms.
- Reuse existing shared database tables, ingestion infrastructure, storage and provider utilities when their authorization and lifecycle contracts fit. Do not create duplicate truth or parallel service implementations merely for a new form.
- Use the same canonical business services from UI routes, bootstrap scripts and background jobs. Do not bypass validation, permissions, publication or event handling with direct inserts for demonstrations.
- Make solutions configuration-driven, pluggable and isolated. Keep provider/model selection, supported capabilities and limits in validated configuration with safe defaults. Never commit secrets.
- Use focused interfaces and replaceable adapters; keep abstractions proportional to current needs. Do not build speculative plugin frameworks or agent hierarchies.
- Use `get_async_openai_clients` from `app.core.llm_provider` for supported OpenAI-compatible providers; do not instantiate independent clients that bypass configured provider priority/fallback. Inspect the existing utility contract before use.

## Data correctness and access boundaries

- Enforce authenticated owner, product and Space boundaries in reads/writes, references, source retrieval, tools, caches, sessions and credentials. Configuration cannot relax authorization.
- Aura v1 uses only the current Space's authorized knowledge/tools. No cross-Space inference, shared context, routing or delegation.
- Validate inputs server-side for every entry path, including bootstrap and extraction; browser validation is additional UX. Preserve schema/version compatibility and enforce same-Space references.
- Respect revision checks, idempotency and transaction boundaries. Handle duplicate operations without losing valid writes or masking unrelated failures.
- Apply visibility and disclosure rules before sending data to public APIs, model context, tool results or generated UI. Never rely on hidden UI elements or prompts to protect private data.
- Do not fabricate metrics, provenance, timestamps, source claims or provider availability. Extracted data remains a review candidate until its authority and visibility permit use. Never silently overwrite owner-approved values.
- Changes to shared tables or data require checking Support247 compatibility. Deferring a Yullo feature does not authorize deleting shared records or capabilities.

## UI, logging and verification

- Follow the selected form plan's fields, placement, theme tokens, library choices, motion, mobile and accessibility requirements. Build only the shared controls this form needs.
- Ensure form selection states, active focus borders, and interactive buttons adapt dynamically to the configured Yullo theme accent color CSS variables (`var(--accent)`) and other things like text should to dashboard theme color.

- Keep UI copy simple; do not expose implementation jargon or internal errors to users. Respect reduced motion and keyboard operation.
- Add concise comments for non-obvious decisions and constraints, not comments on every line.
- Add structured logs at meaningful boundaries and failures, with safe identifiers. Never log credentials, tokens, private source content or complete sensitive request bodies.
- Run focused tests/checks appropriate to the changed behavior; do not add redundant tests solely to mirror implementation. Report failures and unverified paths honestly.
- Use an isolated test database/blob/index namespace for integration tests that create durable data. Do not run destructive tests or bootstrap against a live user implicitly.
