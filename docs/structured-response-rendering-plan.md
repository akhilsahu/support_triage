# Structured response rendering: LLM-chosen layout and LLM-initiated questions

Two different asks get grouped under "make responses more structured," but they
are not the same kind of feature:

1. **The model picks a layout** — a fee comparison renders as a table, a list of
   plans renders as cards. Presentational. The turn still ends normally.
2. **The model asks the customer something** — radio choice, checkbox, or free
   text. Control-flow. The run **stops mid-way** and must resume with the
   answer, not start a new turn.

This doc covers both, and how they share one mechanism. It also folds in the
"structured options" transport that used to live in
`docs/ambiguous-question-clarification-plan.md` — see
[Relationship to the clarification doc](#relationship-to-the-clarification-doc)
at the bottom for exactly what moved and why.

## Shared mechanism: tool-calling, not fenced markdown

Both scenarios could be done by teaching the model to emit a special markdown
fence (` ```table `, ` ```clarify `) containing JSON. Rejected for both: LLMs are
unreliable at hand-writing valid nested JSON inside prose, especially under
paraphrase pressure across turns, and every malformed block needs a fallback
path.

Instead, both scenarios go through **Agno tool-calling**. The model calls a
typed tool; Agno constrains the arguments to a schema instead of hoping free
text parses; the backend reads the structured data back out of the tool-call
trace — the same place `_extract_citations` already reads tool messages from
today ([agno.py:110-123](../app/orchestra/ai/orchestrators/agno.py)).

- **Scenario 2** already has its tool: `agno.tools.user_feedback.UserFeedbackTools.ask_user`.
  Verified working against our agents (see the clarification doc's "Measured
  behaviour" section) — nothing to build here, only wiring.
- **Scenario 1** needs a new toolkit, proposed below as `RenderTools`, mirroring
  `UserFeedbackTools`'s shape: functions that do nothing but validate their
  arguments and return a confirmation string, while the wrapper captures the
  call args from the tool-call trace.

One extraction path in `_result()`/the stream loop serves both, instead of a
text-parsing pipeline for layout and a separate pause/resume pipeline for
questions.

## Scenario 2 — the model asks the customer something

### Transport

Add to `CustomerChatResponse`:

```python
clarify: {question: str, header: str, options: list[str], multi_select: bool} | None
```

`options` empty → render as a text input. `multi_select=False` → radio.
`multi_select=True` → checkboxes.

Add `pending_run_id` to `ChatSession`. When present, the next customer message
resumes that run via `continue_run(run_id=...)` instead of starting a new
`runner.arun(message, ...)`.

### Transcript rendering — decided: looks like a normal exchange

The requirement: the question and the customer's picked answer should read in
the transcript exactly like an ordinary back-and-forth, not a visibly special
"system prompt" moment.

Concretely:

- **While live and unanswered**, the assistant bubble shows the question text
  and, inline in that same bubble, the interactive widget (radio group /
  checkboxes / text input) built from `clarify`.
- **The customer's pick is sent as a normal chat message** — clicking "SBI Card
  PRIME" sends the literal text `"SBI Card PRIME"` through the same send path
  as if they had typed it. No special "answer" envelope.
- **Once answered**, both messages are just ordinary assistant/customer text in
  history. Nothing about them needs to be flagged as "this was a clarification"
  on reload — a restored session just shows two normal lines.

This has a real simplifying consequence worth calling out: because the
persisted transcript needs no special replay logic, **`pending_run_id` is
short-lived scratch state**, not something the history renderer needs to know
about after the fact. It only has to survive between "the run paused" and "the
very next customer message arrives." A session that never gets that next
message just times out (see Expiry below) — it does not leave any lingering
mark on the conversation record.

One pitfall carried over unchanged from the clarification doc: a paused run's
raw `content` is Agno's internal placeholder,
`"I have tools to execute, but I need user input."` That string must never
reach the customer — the assistant bubble renders the actual question text
from `clarify.question`, and the placeholder is discarded.

### Resume matching

When the next customer message arrives against a `pending_run_id`, don't try to
match it against `clarify.options` in code (e.g. fuzzy-matching typed text to a
button label). Feed whatever the customer sent straight into
`continue_run(run_id=..., message=...)` and let the model interpret it — that
is exactly the kind of loose matching an LLM is good at and a hand-rolled
matcher is not. This also means a customer who ignores the question and asks
something else entirely still gets a reasonable response, because the model
sees both the pending question and the new message.

### Expiry

A customer who never answers leaves a run paused indefinitely. Needs a
time-based cutoff (e.g. session-level: if `pending_run_id` is older than N
minutes, drop it and treat the next message as a fresh turn instead of a
resume). Exact N is a product call, not an engineering one — start
conservative (~30 min) and adjust from real abandonment data.

## Scenario 1 — the model picks the layout

### Decided: sequential, not appended-below

Blocks must preserve their position relative to surrounding prose — a table
that belongs after paragraph two must render after paragraph two, not lumped
at the bottom of the message. This rules out the simpler "stream text
normally, append structured blocks after" design discussed earlier.

### Wire format

Replace the single `reply: str` as the *rendering* source with an ordered list:

```python
segments: [
  {"type": "text",  "content": "..."},
  {"type": "table", "headers": [...], "rows": [[...], ...]},
  {"type": "cards",  "items": [{"title": ..., "body": ..., ...}, ...]},
  {"type": "tabs",   "tabs": [{"label": ..., "content": ...}, ...]},
  {"type": "text",  "content": "..."},
]
```

`reply: str` stays on the response too, as a flattened plain-text/markdown
rendition (segments concatenated, structured ones reduced to their markdown-table
equivalent or dropped) — anything that only consumes text today (logs, admin
dashboard read-outs, an eventual email-escalation transcript) keeps working
unchanged.

### `RenderTools` toolkit

```
render_table(headers: list[str], rows: list[list[str]])
render_cards(items: list[{title, body, ...}])
render_tabs(tabs: list[{label, content}])
```

Each function's only job is argument validation; the actual payload is read
back from the tool-call trace, not from the function's return value.

### Open risk — must be verified before this is buildable

Sequential ordering assumes Agno's tool-call events arrive **interleaved with
text-content deltas in true generation order** during a streamed run, not
batched and surfaced only after the text finishes. This has not been checked
against the installed Agno version. If tool calls only surface after the fact,
true interleaving isn't achievable from a single streamed turn, and the
fallback (forcing the model to also emit a placeholder token marking "the
table goes here" in the text stream, which the frontend then splices the block
into) is materially more work and more fragile. **This needs a small
throwaway probe against a real streamed run with a tool call in the middle,
before committing engineering time to the segment-based design.**

### Frontend

`MarkdownMessage` currently renders one string end to end
([CustomerChat.tsx:150](../ui/src/screens/CustomerChat.tsx)). It becomes a
segment loop: text segments still go through the existing `ReactMarkdown`
pipeline unchanged — so all current table/list/code/heading styling is reused
for text segments as-is — while `table`/`cards`/`tabs` segments render through
new dedicated components. (Note: markdown tables already render correctly
today via `remark-gfm` — a `"table"` *segment* from `render_table` is for when
the model wants a table INSIDE a longer structured layout the tool-calling
path controls; a plain markdown table typed inline in a text segment still
works exactly as it does now and needs no new component.)

## Sequencing

1. **Scenario 2 first** — mechanism already exists (`UserFeedbackTools`), and it
   is the higher-value fix given the sticky-routing/ambiguity findings already
   measured. Build: `clarify` field, `pending_run_id`, resume path, expiry,
   frontend widget.
2. **Verify the streaming-interleaving risk for scenario 1** with a short probe
   before scoping real work.
3. **Scenario 1 build**, reusing the tool-call-extraction path scenario 2 will
   have already built.

## Relationship to the clarification doc

`docs/ambiguous-question-clarification-plan.md` originally specified its own
"Phase 2 — Structured options (buttons)" and a sequencing step for `clarify` /
`pending_run_id` / chip rendering. That was scoped narrowly to the
which-product case. This doc generalizes the same transport to any reason the
model might ask (not just product ambiguity), so the transport design now
lives here as the single source of truth. The clarification doc has been
trimmed to point here for transport, and keeps everything specific to *when a
product agent should ask* — the prompt directives, the stickiness memory
(Phase 3), the chatbot-vs-agent toggle decision, and the measured model
reliability data, none of which is general-purpose and all of which stays
where it is.
