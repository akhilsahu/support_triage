# Delivery Pipeline Hardening — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make every push to `main` pass backend unit tests, frontend type-check/lint/tests, and print-hygiene checks *before* the VPS deploy runs — while clearing the tracked-junk, failing-test, and logging debts that would otherwise make that gate red on day one.

**Architecture:** CI jobs are added to the existing `.github/workflows/deploy.yml` so the `deploy` job gets `needs: [backend-tests, frontend-checks]` (GitHub Actions gates across jobs within one workflow). Repo hygiene is git-only (`git rm --cached` + `.gitignore` fixes). Print hygiene is enforced by ruff rule `T20` with explicit per-file exemptions for the 14 intentional CLI/demo scripts.

**Tech Stack:** FastAPI + pytest + ruff (backend), Vite + TypeScript + ESLint + Vitest (frontend), GitHub Actions, git.

**Spec:** Derived from the 2026-09-04 codebase analysis. Strategy context lives in `implementation.md` §13 (test/CI baseline is listed as P0 "Remaining first-sprint work").

## Global Constraints

- CI Python is **3.11** (repo floor per README/pyproject); local dev venv is 3.14 — everything must pass on both.
- `pytest tests/unit -q -o addopts=""` must pass with **no Postgres/Redis** running (verified 2026-09-04: 224 passed in 1.26s).
- ruff is pinned `==0.1.14` (matches the `[tool.ruff]` top-level `select` schema already in `pyproject.toml`).
- Frontend runs on Node 20; `ui/package-lock.json` exists, so `npm ci` is valid.
- The `deploy` job fires only on `push` to `refs/heads/main` — never on pull requests.
- All new identifiers use `space`, never `org` (README naming convention).
- No new runtime dependencies.
- Every command the CI will run must be verified locally in the task that introduces it — the gate must be green when it lands.

## Out of Scope (separate plans, per scope check)

1. Splitting oversized files: `app/api/customer.py` (1,262 LOC), `ui/src/screens/KnowledgeBase.tsx` (2,182), `SuperAdmin.tsx` (1,767), `Agents.tsx` (1,589).
2. Database-backed tenant-isolation integration tests for the canonical `/api/chat` path.
3. Coordinated `org → space` route/identifier rename.

---

### Task 0: Land or shelve in-flight work (prerequisite)

The working tree has 15 modified files (superadmin, integration routes, `main.py`, `SuperAdmin.tsx`, …) from the feature-gating work. Do not mix them with hardening changes.

**Files:** none (git state only)

- [ ] **Step 1: Inspect state**

Run: `git status --short`
Expected: ~15 modified files + untracked `.kilo/`.

- [ ] **Step 2: Land or stash**

If the feature-gating work is complete and reviewed, commit it:
```bash
git add -A && git commit -m "feat(datasource): in-flight feature gating work"
```
Otherwise stash everything including untracked files:
```bash
git stash push -u -m "feature-gating WIP before hardening"
```

- [ ] **Step 3: Verify clean tree**

Run: `git status --short`
Expected: empty output.

---

### Task 1: Untrack committed build/OS junk

168 `__pycache__` `.pyc` files, 9 `.DS_Store` files, and 3 `.bin` test binaries (~4.5 MB) are tracked. `ui/dist/`, `htmlcov/`, `.DS_Store`, and `__pycache__/` are *already* in `.gitignore` — this junk was committed before those rules existed. The `.bin` files have zero references in code, scripts, or tests (verified by grep).

**Files:**
- Modify: `.gitignore` (append rules)

- [ ] **Step 1: Confirm the inventory**

Run:
```bash
git ls-files | grep -c '__pycache__' ; git ls-files | grep -cE '\.DS_Store$' ; git ls-files | grep -cE '\.bin$'
```
Expected: `168`, `9`, `3`.

- [ ] **Step 2: Untrack the files (keep on disk), then delete the orphaned .bin files**

Verified paths contain no spaces, so the plain pipeline is safe and portable across GNU/BSD grep:

```bash
git ls-files | grep '__pycache__'  | xargs git rm --cached -q
git ls-files | grep -E '\.DS_Store$' | xargs git rm --cached -q
git rm --cached -q exactly1m.bin large.bin small.bin
rm exactly1m.bin large.bin small.bin
```

- [ ] **Step 3: Append prevention rules to `.gitignore`**

```gitignore

# Committed-junk prevention (2026-09 hardening)
*.bin
.kilo/
.cortex/
```

- [ ] **Step 4: Verify nothing junk remains tracked**

Run: `git ls-files | grep -cE '__pycache__|\.DS_Store$|\.bin$'`
Expected: `0` (grep exits 1).

- [ ] **Step 5: Verify the test suite is still intact**

Run: `git ls-files tests | grep -c 'test_.*\.py$'`
Expected: `28` (unchanged).

- [ ] **Step 6: Commit**

```bash
git add .gitignore && git commit -m "chore: untrack pycache/DS_Store/bin artifacts; ignore *.bin and .kilo"
```
---

### Task 2: Stop gitignoring the real test suite

`.gitignore:176-179` contains `test/`, `tests/`, `test_*`, `tests_*`. The `tests/` rule silently ignores **new** test files (`git check-ignore -v tests/unit/api/test_new.py` → matched by line 177) even though the existing 28 are tracked. The scratch diagnostics dir `test/` stays ignored on purpose.

**Files:**
- Modify: `.gitignore:174-180`

- [ ] **Step 1: Edit the tail of `.gitignore`**

Replace:
```gitignore
# Expendable files
expendable/
test/
tests/
test_*
tests_*
scripts/finetuning/
```
with:
```gitignore
# Expendable files
expendable/
test/
scripts/finetuning/
```

- [ ] **Step 2: Verify new test files are no longer ignored**

Run: `git check-ignore -v tests/unit/core/test_redis.py ; echo "exit: $?"`
Expected: no match output, `exit: 1`.

- [ ] **Step 3: Verify the scratch dir is still hidden**

Run: `git status --short test/`
Expected: empty output.

- [ ] **Step 4: Commit**

```bash
git add .gitignore && git commit -m "chore: stop ignoring tests/ so new test files are tracked"
```

---

### Task 3: Implement the KB preview quality banner (fixes the failing vitest test)

The `ui` suite currently has **1 failing test**: `KnowledgeBase.preview.test.tsx > "shows prominent quality guidance for poor extraction"`. The test mocks `apiClient.previewUrl` returning `quality: { rating: 'poor', reasons: ['boilerplate_heavy'] }` and expects guidance text matching `/poor extraction quality/i` and `/try deep preview/i`. The component (`KBModal`) renders **no such guidance** — this is an unimplemented TDD spec, not a broken test. We implement the banner. This must land before the CI gate (Task 7) includes `npm run test`.

**Files:**
- Modify: `ui/src/screens/KnowledgeBase.tsx:653-656` (inside the `selectedPreview && (...)` block, right after the opening container `<div>`)
- Test (exists, do not modify): `ui/src/screens/KnowledgeBase.preview.test.tsx:65-69`

- [ ] **Step 1: Confirm the failure**

Run: `cd ui && npx vitest run src/screens/KnowledgeBase.preview.test.tsx`
Expected: FAIL — `TestingLibraryElementError: Unable to find an element with the text: /poor extraction quality/i` (the other 3 tests pass).

- [ ] **Step 2: Add the banner**

In `KnowledgeBase.tsx`, find (line ~653):
```tsx
              {selectedPreview && (
                <div className="relative rounded-2xl border-2 border-indigo-500/30 dark:border-indigo-500/20 bg-indigo-500/[0.03] dark:bg-indigo-500/[0.05] overflow-hidden shadow-[0_0_22px_rgba(99,102,241,0.08)] dark:shadow-[0_0_22px_rgba(99,102,241,0.05)] transition-all">
```
Insert immediately **after** that opening `<div>` (before the "Floating stats badge" comment):
```tsx
                  {/* Quality guidance: quick (httpx) previews can come back boilerplate-heavy */}
                  {selectedPreview.quality?.rating === 'poor' && (
                    <div
                      role="alert"
                      className="mx-5 mt-4 flex flex-wrap items-center gap-2 rounded-xl border border-amber-300 bg-amber-50 px-3 py-2 text-xs font-bold text-amber-800 dark:border-amber-700/60 dark:bg-amber-950/40 dark:text-amber-300"
                    >
                      <span>⚠️ Poor extraction quality — this quick preview may be missing page content.</span>
                      <button
                        type="button"
                        onClick={() => setSelectedPreviewMode('deep')}
                        className="underline underline-offset-2 hover:text-amber-900 dark:hover:text-amber-200"
                      >
                        Try Deep Preview
                      </button>
                    </div>
                  )}
```
Notes: `setSelectedPreviewMode` already exists (line 171). `quality?.rating` is optional-chained because `quality` is server-computed. The button's accessible name "Try Deep Preview" does **not** collide with the existing `/generate deep preview/i` button queries used by the other three tests in this file.

- [ ] **Step 3: Run the target test file**

Run: `cd ui && npx vitest run src/screens/KnowledgeBase.preview.test.tsx`
Expected: 4 passed.

- [ ] **Step 4: Run the full frontend suite**

Run: `cd ui && npm run test`
Expected: 5 files, 20 tests, all passed.

- [ ] **Step 5: Type-check**

Run: `cd ui && npx tsc --noEmit`
Expected: exit 0.

- [ ] **Step 6: Commit**

```bash
git add ui/src/screens/KnowledgeBase.tsx && git commit -m "fix(kb): render poor-extraction quality guidance in URL preview"
```
---

### Task 4: Add an ESLint config so `npm run lint` actually works

`ui/` has **no ESLint config file** — `npm run lint` prints ESLint's "looked for configuration files" help text instead of linting. The standard Vite React-TS baseline matches the devDependencies already present (`@typescript-eslint/*`, `eslint-plugin-react-hooks`, `eslint-plugin-react-refresh`). The CI gate (Task 7) runs `npm run lint`, so this must land first.

**Files:**
- Create: `ui/.eslintrc.cjs`

- [ ] **Step 1: Create `ui/.eslintrc.cjs`**

```js
module.exports = {
  root: true,
  env: { browser: true, es2020: true },
  extends: [
    'eslint:recommended',
    'plugin:@typescript-eslint/recommended',
    'plugin:react-hooks/recommended',
  ],
  ignorePatterns: ['dist', 'node_modules'],
  parser: '@typescript-eslint/parser',
  plugins: ['react-refresh'],
  rules: {
    // The codebase uses `any` extensively (api client, render blocks); tightening
    // this is a separate, dedicated effort — not part of this gate.
    '@typescript-eslint/no-explicit-any': 'off',
    '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
    'react-refresh/only-export-components': ['warn', { allowConstantExport: true }],
  },
}
```

- [ ] **Step 2: Lint and fix what it reports**

Run: `cd ui && npm run lint`
Expected: either passes, or a short list of `no-unused-vars` / `react-hooks` errors. Fix each mechanically: delete genuinely unused imports/variables; prefix intentionally-unused parameters with `_` (the config exempts the `_` prefix). Do not weaken other rules to make it pass. Repeat until exit 0. (With `--max-warnings 0` in the npm script, any remaining `react-refresh` warnings must also be resolved — usually by moving non-component exports out of component files or into `.ts` utility modules.)

- [ ] **Step 3: Confirm suite + types still green**

Run: `cd ui && npx tsc --noEmit && npm run test`
Expected: both exit 0.

- [ ] **Step 4: Commit**

```bash
git add ui/.eslintrc.cjs ui/src && git commit -m "chore(ui): add ESLint config (Vite React-TS baseline)"
```

---

### Task 5: Real Redis status in `/health` via `ping()` (TDD)

`app/main.py:359` reports `"redis": "connected"` whenever the client *object* exists (`redis_client.redis is not None`) — even if Redis is down after boot. Add `RedisClient.ping()` and use it.

**Files:**
- Create: `tests/unit/core/test_redis.py`
- Modify: `app/core/redis.py` (add `ping` after `disconnect`)
- Modify: `app/main.py:359` (`health_check`)

- [ ] **Step 1: Write the failing test**

Create `tests/unit/core/test_redis.py`:
```python
"""Unit tests for RedisClient.ping (health-check semantics).

No real Redis: the wrapper's contract is exercised with a fake aioredis client.
"""
from app.core.redis import RedisClient


class FakeRedis:
    def __init__(self, *, healthy: bool = True) -> None:
        self.healthy = healthy
        self.ping_calls = 0

    async def ping(self) -> bool:
        self.ping_calls += 1
        if not self.healthy:
            raise ConnectionError("redis down")
        return True


async def test_ping_true_when_redis_responds():
    client = RedisClient()
    client.redis = FakeRedis(healthy=True)
    assert await client.ping() is True


async def test_ping_false_when_never_connected():
    client = RedisClient()  # .redis is None until connect() succeeds
    assert await client.ping() is False


async def test_ping_false_when_redis_raises():
    client = RedisClient()
    client.redis = FakeRedis(healthy=False)
    assert await client.ping() is False
```
(Plain `async def` tests work because `pyproject.toml` sets `asyncio_mode = "auto"`.)

- [ ] **Step 2: Run to verify failure**

Run: `.venv/bin/python -m pytest tests/unit/core/test_redis.py -q -o addopts=""`
Expected: FAIL — `AttributeError: 'RedisClient' object has no attribute 'ping'`.

- [ ] **Step 3: Implement `ping` in `app/core/redis.py`**

Insert after the `disconnect` method (after line 38):
```python
    async def ping(self) -> bool:
        """Return True only if Redis answers a PING right now."""
        if self.redis is None:
            return False
        try:
            return bool(await self.redis.ping())
        except Exception as e:
            logger.warning("Redis PING failed", error=str(e))
            return False
```

- [ ] **Step 4: Run to verify pass**

Run: `.venv/bin/python -m pytest tests/unit/core/test_redis.py -q -o addopts=""`
Expected: 3 passed.

- [ ] **Step 5: Use it in the health endpoint**

In `app/main.py`, replace line 359:
```python
    redis_status = redis_client.redis is not None
```
with:
```python
    redis_status = await redis_client.ping()
```

- [ ] **Step 6: Full unit suite**

Run: `.venv/bin/python -m pytest tests/unit -q -o addopts=""`
Expected: 227 passed.

- [ ] **Step 7: Commit**

```bash
git add tests/unit/core/test_redis.py app/core/redis.py app/main.py && git commit -m "fix(health): report real Redis status via PING, not client-object existence"
```
---

### Task 6: print() hygiene — convert `langgraph_persistence.py`, enforce with ruff `T20`

Of the 208 `print()` calls in `app/`, verified import analysis shows all but two files are intentional stdout surfaces: 12 are demo/CLI maintenance scripts (run via `python -m …`, prints inside `if __name__ == "__main__"`), and `app/services/inbox/email_notify.py`'s `_dev_print` is a deliberate dev-console fallback that already emits `logger.warning("email.dev_fallback", …)` alongside. The only offender in a real import path is `app/core/langgraph_persistence.py` — 3 bare error prints in `except` blocks (the module currently has no importers, but it must not re-enter the codebase printing).

**Files:**
- Modify: `pyproject.toml` (`[tool.ruff]` section)
- Modify: `app/core/langgraph_persistence.py:15-27` (imports), `:103`, `:123`, `:144`

- [ ] **Step 1: Install ruff locally (matches CI pin)**

Run: `.venv/bin/pip install -q ruff==0.1.14`
Expected: installed; `.venv/bin/ruff --version` → `ruff 0.1.14`.

- [ ] **Step 2: Extend `[tool.ruff]` in `pyproject.toml`**

Replace:
```toml
[tool.ruff]
line-length = 100
target-version = "py311"
select = ["E", "F", "I", "N", "W", "UP"]
ignore = ["E501"]
```
with:
```toml
[tool.ruff]
line-length = 100
target-version = "py311"
select = ["E", "F", "I", "N", "W", "UP", "T20"]
ignore = ["E501"]

[tool.ruff.per-file-ignores]
# Intentional stdout demos / CLI maintenance scripts (run via `python -m ...`)
"app/orchestra/ai/run.py" = ["T201"]
"app/orchestra/ai/demochat.py" = ["T201"]
"app/orchestra/poc.py" = ["T201"]
"app/orchestra/legacy/poc.py" = ["T201"]
"app/orchestra/ai/ingestion/demo.py" = ["T201"]
"app/orchestra/ai/ingestion/retrieval_quality_demo.py" = ["T201"]
"app/orchestra/ai/chunking/demo.py" = ["T201"]
"app/orchestra/ai/knowledge/demo.py" = ["T201"]
"app/orchestra/ai/knowledge/rag_quality_eval.py" = ["T201"]
"app/orchestra/ai/facts/demo.py" = ["T201"]
"app/renderengine/democheck.py" = ["T201"]
"app/utils/ai/document_ingestion.py" = ["T201"]
"app/utils/ai/triage_prompt_generator.py" = ["T201"]
# Deliberate dev-console fallback; a structured `email.dev_fallback` warning is
# emitted via structlog immediately before each print.
"app/services/inbox/email_notify.py" = ["T201"]
```

- [ ] **Step 3: Convert the 3 prints in `app/core/langgraph_persistence.py`**

> **DEVIATION (executed 2026-09-04):** During execution the component-usage check the reviewer
> requested proved the module is **dead code**: zero importers repo-wide, `langgraph` absent from
> `requirements.txt` (the prod image cannot import it), untouched since the first commits, and
> superseded by the Agno session store. Decision: **delete the module** and fix the two stale
> LangGraph claims in `README.md` (lines 591, 1264) instead of converting prints. Original
> conversion instructions preserved below for reference.

After the existing app imports (line 27, `from app.core.database import get_db`), add:
```python
import structlog

logger = structlog.get_logger()
```
Then replace each bare print in the `except` blocks:
- Line 103: `print(f"Error retrieving checkpoint: {e}")` → `logger.error("checkpoint.get_failed", error=str(e))`
- Line 123: `print(f"Error storing checkpoint: {e}")` → `logger.error("checkpoint.put_failed", error=str(e))`
- Line 144: `print(f"Error listing checkpoints: {e}")` → `logger.error("checkpoint.list_failed", error=str(e))`

- [ ] **Step 4: Verify the rule is clean**

Run: `.venv/bin/ruff check --select T20 app`
Expected: `All checks passed!`

- [ ] **Step 5: Verify the suite is unaffected**

Run: `.venv/bin/python -m pytest tests/unit -q -o addopts=""`
Expected: 227 passed.

- [ ] **Step 6: Commit**

```bash
git add pyproject.toml app/core/langgraph_persistence.py && git commit -m "chore(logging): structlog for langgraph checkpoint errors; enforce no-print via ruff T20 with demo/CLI exemptions"
```
---

### Task 7: CI gate — backend + frontend jobs ahead of the VPS deploy

> **DEVIATION (executed 2026-09-04):** Task 4's lint baseline surfaced 73 violations (24 files),
> beyond quick cleanup — the Completion-Notes contingency applies: `npm run lint` runs inside
> `frontend-checks` with `continue-on-error: true` (non-blocking) until the baseline is cleaned.
> `type-check` and `npm run test` remain hard gates.

Rewrite `.github/workflows/deploy.yml` so `deploy` runs **only after** `backend-tests` and `frontend-checks` pass, and only on pushes to `main` (PRs get the checks without deploying). Note: `pytest`/`pytest-asyncio` are dev-only (not in `requirements.txt`), so the backend job installs them explicitly; `-o addopts=""` neutralizes the `--cov` options from `pyproject.toml` so `pytest-cov` is not needed in CI.

**Files:**
- Modify: `.github/workflows/deploy.yml` (full rewrite)

- [ ] **Step 1: Replace the entire file with**

```yaml
name: CI & Deploy

on:
  push:
    branches: [main]
  pull_request:
    branches: [main]

jobs:
  backend-tests:
    name: Backend — unit tests + print hygiene
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-python@v5
        with:
          python-version: "3.11"
          cache: pip
      - name: Install dependencies
        run: pip install -r requirements.txt pytest pytest-asyncio ruff==0.1.14
      - name: Unit tests (no DB required)
        run: pytest tests/unit -q -o addopts=""
      - name: print() hygiene (ruff T20)
        run: ruff check --select T20 app

  frontend-checks:
    name: Frontend — type-check, lint, tests
    runs-on: ubuntu-latest
    defaults:
      run:
        working-directory: ui
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 20
          cache: npm
          cache-dependency-path: ui/package-lock.json
      - run: npm ci
      - run: npm run type-check
      - run: npm run lint
      - run: npm run test

  deploy:
    name: Build on VPS and restart
    needs: [backend-tests, frontend-checks]
    if: github.event_name == 'push' && github.ref == 'refs/heads/main'
    runs-on: ubuntu-latest

    env:
      SECRET_KEY:          ${{ secrets.SECRET_KEY }}
      FRONTEND_URL:        ${{ secrets.FRONTEND_URL }}
      POSTGRES_DB:         ${{ secrets.POSTGRES_DB }}
      POSTGRES_USER:       ${{ secrets.POSTGRES_USER }}
      POSTGRES_PASSWORD:   ${{ secrets.POSTGRES_PASSWORD }}
      SMTP_HOST:           ${{ secrets.SMTP_HOST }}
      SMTP_PORT:           ${{ secrets.SMTP_PORT }}
      SMTP_USER:           ${{ secrets.SMTP_USER }}
      SMTP_PASS:           ${{ secrets.SMTP_PASS }}
      SMTP_FROM:           ${{ secrets.SMTP_FROM }}
      ANTHROPIC_API_KEY:   ${{ secrets.ANTHROPIC_API_KEY }}
      OPENAI_API_KEY:      ${{ secrets.OPENAI_API_KEY }}
      SUPER_ADMIN_KEY:     ${{ secrets.SUPER_ADMIN_KEY }}
      CORS_ORIGINS:        ${{ secrets.CORS_ORIGINS }}

    steps:
      - name: Deploy via SSH
        uses: appleboy/ssh-action@v1.0.3
        with:
          host:     ${{ secrets.VPS_HOST }}
          username: ${{ secrets.VPS_USER }}
          key:      ${{ secrets.VPS_SSH_KEY }}
          envs: >-
            SECRET_KEY,FRONTEND_URL,
            POSTGRES_DB,POSTGRES_USER,POSTGRES_PASSWORD,
            SMTP_HOST,SMTP_PORT,SMTP_USER,SMTP_PASS,SMTP_FROM,
            ANTHROPIC_API_KEY,OPENAI_API_KEY,SUPER_ADMIN_KEY,CORS_ORIGINS
          script: |
            set -e
            cd /var/www/support247
            git fetch origin
            git reset --hard origin/main
            sudo cp deploy/nginx/api.support247.chat.conf /etc/nginx/sites-available/
            sudo cp deploy/nginx/support247.chat.conf     /etc/nginx/sites-available/
            sudo nginx -t && sudo systemctl reload nginx || echo "Nginx reload skipped (no config change)"
            printf '%s\n' \
              "ENVIRONMENT=production" \
              "FRONTEND_URL=${FRONTEND_URL}" \
              "SECRET_KEY=${SECRET_KEY}" \
              "DATABASE_URL=postgresql+asyncpg://${POSTGRES_USER}:${POSTGRES_PASSWORD}@postgres:5432/${POSTGRES_DB}" \
              "POSTGRES_DB=${POSTGRES_DB}" \
              "POSTGRES_USER=${POSTGRES_USER}" \
              "POSTGRES_PASSWORD=${POSTGRES_PASSWORD}" \
              "SMTP_HOST=${SMTP_HOST}" \
              "SMTP_PORT=${SMTP_PORT:-465}" \
              "SMTP_USER=${SMTP_USER}" \
              "SMTP_PASS=${SMTP_PASS}" \
              "SMTP_FROM=${SMTP_FROM}" \
              "ANTHROPIC_API_KEY=${ANTHROPIC_API_KEY}" \
              "OPENAI_API_KEY=${OPENAI_API_KEY}" \
              "SUPER_ADMIN_KEY=${SUPER_ADMIN_KEY}" \
              "CORS_ORIGINS=${CORS_ORIGINS}" \
              > .env
            cd ui && npm ci --prefer-offline && NODE_OPTIONS="--max-old-space-size=4096" npm run build && cd ..
            docker compose -f deploy/docker-compose.prod.yml --env-file .env up --build -d --remove-orphans
            docker compose -f deploy/docker-compose.prod.yml --env-file .env exec -T api alembic upgrade head
            docker image prune -f
            echo "Deploy complete"
```

- [ ] **Step 2: Validate the YAML parses**

Run: `.venv/bin/pip install -q pyyaml && .venv/bin/python -c "import yaml; yaml.safe_load(open('.github/workflows/deploy.yml')); print('YAML OK')"`
Expected: `YAML OK`.

- [ ] **Step 3: Re-verify every command CI runs (all must be green — they were validated in Tasks 3–6)**

Run:
```bash
.venv/bin/python -m pytest tests/unit -q -o addopts="" && .venv/bin/ruff check --select T20 app && cd ui && npm run type-check && npm run lint && npm run test
```
Expected: all exit 0.

- [ ] **Step 4: Commit**

```bash
git add .github/workflows/deploy.yml && git commit -m "ci: gate VPS deploy on backend tests and frontend checks"
```

---

### Task 8: End-to-end verification

- [ ] **Step 1: Push and watch the workflow**

```bash
git push origin main
```
On github.com → Actions → "CI & Deploy": `backend-tests` and `frontend-checks` must both go green, and only then may `deploy` start. Open a throwaway PR against `main` to confirm the two check jobs run (and `deploy` is skipped) on pull requests.

- [ ] **Step 2: Confirm the junk is gone from a fresh clone**

Run:
```bash
git ls-files | grep -cE '__pycache__|\.DS_Store$|\.bin$'   # → 0
git clone --depth 1 git@github.com:akhilsahu/support_triage.git /tmp/hardening-check && ls /tmp/hardening-check | grep -c '\.bin$'   # → 0
```

- [ ] **Step 3: Confirm `/health` still serves correctly**

With the stack running: `curl -s localhost:8000/health` → `{"status":"healthy",…,"redis":"connected"}` with Redis up, and `"redis":"disconnected"` (status `unhealthy`) with Redis stopped — the new PING semantics.

---

## Completion Notes

- Every task lands as an independent, revertable commit. Ordering matters only in that Task 0 precedes everything, and Tasks 3–6 must land before Task 7 (the gate) so CI is green on its first run.
- If `npm run lint` (Task 4) surfaces a violation volume beyond quick unused-vars cleanup, ship the lint config but move `npm run lint` out of the `frontend-checks` job into a separate non-blocking job — the type-check and vitest gates are the non-negotiable part. Do not disable rules to force it green.
- Follow-up plans (deliberately out of scope here): mega-file splits (`app/api/customer.py`, `KnowledgeBase.tsx`, `SuperAdmin.tsx`, `Agents.tsx`), DB-backed tenant-isolation tests for `/api/chat`, and the coordinated `org → space` rename.





