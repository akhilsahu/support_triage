# Asking the customer which product they mean

Problem: with one agent covering several products (e.g. SBI Prime + SBI Cashback
in one KB), *"What is the annual fee?"* has no single correct answer. Today the
agent will pick something — probably whichever card's chunks scored highest —
and state it confidently. The customer has no idea a choice was made for them.

Desired: the bot asks *"Which card would you like to know about?"* instead of
guessing.

## Why this has to live in the agent

Triage cannot do it. `TRIAGE_COORDINATOR_PROMPT` forbids it from ever addressing
the customer and requires it to always delegate ("if the message is ambiguous or
off-topic, still pick the closest specialist"). So the clarification has to come
from the specialist agent, which is also the only component that has seen the
retrieved chunks and therefore knows the answer actually differs per product.

## What already exists

- **Chips are already wired to send.** `CustomerChat.tsx` renders a
  mid-conversation chip row and each chip calls `send(text)`. So if the backend
  can express "offer these options", the UI mechanism to act on them is already
  there.
- **`CustomerChatResponse` has no structured field for options** — only `reply`,
  `citations`, `agent`, etc. That is the missing piece for a button-based flow.
- **Chunk metadata carries the product** (`filename`, `kb_name`), so the set of
  candidate products is derivable rather than hardcoded.

## Phased plan

### Phase 1 — Prompt-only clarification (no code)

Give multi-product agents a system prompt that makes asking the default:

> These documents cover more than one product. If the answer to a question
> differs between them and the customer has not said which one they hold, do not
> pick one — briefly list the products and ask which they mean. If the answer is
> the same for all of them, just answer.

The customer replies in free text ("prime"), which flows through normally.

- **Cost:** none. Works with today's code.
- **Gets you:** the actual human-in-the-loop behaviour asked for.
- **Limitations:** no buttons; re-asks on every ambiguous question because
  nothing remembers the answer.

Worth also injecting the covered product names into the prompt at agent-build
time (derived from the linked KBs' document titles), so the agent can name the
options precisely instead of inferring them from whatever chunks came back.

### Phase 2 — Structured options (buttons)

**Superseded, and the design moved.** Agno ships the tool
(`UserFeedbackTools.ask_user`, verified working against our agents — see
§"Measured behaviour" below), and the transport it needs (`clarify` field on
`CustomerChatResponse`, `pending_run_id` on `ChatSession`, resume path, expiry,
transcript rendering) is not specific to product ambiguity — the same
mechanism serves any reason the model might ask the customer something. That
general design now lives in
`docs/structured-response-rendering-plan.md`, under "Scenario 2 — the model
asks the customer something". This section stays only as a pointer.

- **Cost:** moderate; one tool, one response field, small UI change — see the
  linked doc for the actual breakdown.
- **Gets you:** one tap instead of typing, and an explicit signal in logs that a
  clarification happened (useful for measuring how often it fires).

### Phase 3 — Remember the answer for the session

Without this, Phase 1/2 asks again on every ambiguous question, which gets
irritating fast.

- Store the chosen product on the session (a small JSON context field on
  `ChatSession`, or Agno session memory) once the customer names it.
- Inject it into the agent prompt: *"The customer has indicated they hold: SBI
  Card PRIME. Answer for that product unless they say otherwise."*
- Let it be overridden mid-conversation ("actually, for my Cashback card").

- **Cost:** moderate; needs a context field and prompt injection.
- **Gets you:** asks once, not every turn. This is what makes the feature
  pleasant rather than nagging.

## Recommendation

**Do Phase 1 now.** It requires no code, delivers the behaviour asked for, and
its cost is one paragraph in a system prompt. It also tells us how often
ambiguity actually arises before building UI for it.

**Then Phase 3 before Phase 2.** Repetition is the more annoying failure than
having to type a word — a bot that asks the same question every turn feels
broken, whereas typing "prime" once is fine. Buttons are polish; memory is
substance.

**Phase 2 last**, and only if the logs show clarification firing often enough for
the tap to matter.

## Interaction with the granularity decision

This is complementary to `docs/kb-agent-granularity.md`, not an alternative:

- With **one chatbot per card**, ambiguity mostly disappears — the customer
  already chose. Clarification becomes a rare fallback.
- With **one agent over several products**, clarification is what makes that
  option safe, and turns the earlier "silently answers about the wrong card"
  failure into an explicit question.

So if you go the single-generic-entry-point route, Phase 1 is not optional
polish — it is the mitigation that makes that design acceptable for a financial
product.

## Measured behaviour

Everything below was probed in-process against the two real agents in the space
(SBI Prime credit card, HDFC Life Click 2 Protect), read-only, reranking off.

### Agno HITL works; the question is whether the model uses it

`UserFeedbackTools.ask_user` registers, fires, pauses the run
(`is_paused=True`), and returns exactly the structured question and per-product
options the chip row needs:

> Q: *Which card's annual fee do you want to know about?*
> options: `['SBI Card PRIME', 'SBI Cashback Card']`

Resuming is `continue_run(run_id=…)`, which works across stateless HTTP, and the
pause surfaces as a stream event — neither streaming nor statelessness is a
blocker. When a team **member** asks, the requirement carries
`member_agent_id/name/run_id` and pauses the whole team run, so router-level and
specialist-level asking compose without extra plumbing.

### Model tier decides reliability — and no small model is reliable

Same agent, same ask-first directives, only the model varied. Ambiguous question
("What is the annual fee?"), counting runs where `ask_user` was called:

| Model | Asked | Notes |
|---|---|---|
| `gpt-4o` | 3/3 | reliable, ~15–25× the token cost |
| `gpt-4.1-mini` | 6/8 | best small model, still not reliable |
| `gpt-4o-mini` (current) | 3/8 | erratic |
| `gpt-4.1-nano` | 0/3 | answered Prime only, silently — the original bug |
| `gpt-5-mini` | n/a | **never ran**: our LLM factory sends `max_tokens`, which the gpt-5 family rejects in favour of `max_completion_tokens` |

Two results matter more than the rates:

**Ask-first directives cause false asks.** With ask-first wording,
`gpt-4.1-mini` called `ask_user` 3/3 on *"What is the annual fee on my SBI Card
PRIME?"* — a question that already names the card. Asking someone to repeat
what they just said is worse than not asking.

**Merely offering the tool destabilises today's behaviour.** With the *shipped*
directives (which say to prefer answering for every product), `gpt-4.1-mini`
still asked in 2 of 3 runs. The non-ask runs answered both cards correctly, so
the fallback is graceful — but the tool's presence is not neutral.

The generalisable lesson, now demonstrated three times in this codebase: **on
small models, behaviour you need reliably must live in code, not in prompt
directives.** Per-product retrieval works because it is code; the "search per
product" directive and `ask_user` are both discretionary, and both are flaky.

### Routing already sticks across turns, with no stickiness code

Three turns on one session:

| Turn | Question | Routed to |
|---|---|---|
| 1 | Tell me about my SBI credit card | `sbi_prime_credit_card_support` |
| 2 | What are the charges? | `sbi_prime_credit_card_support` |
| 3 | And the free look period? | `hdfc_life_click_2_protect` |

The bare "What are the charges?" inherited SBI from context, and the
insurance-only concept correctly switched. Conversation history on the leader is
doing the work. **No session-level "chosen product" field is needed for
cross-agent stickiness** — Phase 3 above is only needed for *within-agent*
product choice (Prime vs Cashback), which history does not capture because both
live behind the same agent. Single run; worth repeating before relying on it.

## Is triage the Team Leader, or does Team control take centre stage?

**Team control, entirely. There is no triage agent in the request path.**

`TeamFactory.build` looks up `triage_resolved = next(a for a in active_agents if
a.slug == "triage")`, but `app/api/customer.py:157` filters
`agent_type != "triage"` out of the active set, so it is **always `None`** — every
log line reads `triage_leader=none`. The consequences:

- The leader is a **plain Agno `Team` leader**: the platform's default model, the
  `TRIAGE_COORDINATOR_PROMPT` passed as `instructions`, no knowledge base, no
  tools, no persona.
- The branch at `team.py:190` that lets a triage agent's `system_prompt` override
  those instructions is **unreachable**, so nothing an owner configures on a
  triage agent can affect routing.
- Removing the `!= triage` filter alone would change nothing: `team.py:134`
  strips triage from the specialist list independently.
- With one specialist, `build` returns a bare `Agent` and there is no leader at
  all.

So "triage" today is a *prompt*, not an *agent*. Provisioning still seeds a
triage row (`auth.py:183-184`, `platform_enabled=True, locked=True`) and
`SuperAdmin.tsx:1352` tells owners "Triage cannot be disabled — it is required
for routing", which is untrue as written. Either wire the triage agent in as a
real leader or retire the row and correct that copy; the current half-state is
the confusing part.

For clarification specifically this is fine — an Agno Team leader can hold
`UserFeedbackTools` just as an agent can. It does mean the router's asking
behaviour is configured in `prompts.py`, not by the space owner.

## Where does the owner enable this — chatbot or agent?

**Recommendation: one owner-facing toggle at chatbot level; the agent level is
derived, not configured.**

- The customer experiences a *chatbot*, not an agent. A per-agent toggle means
  one product asks and another doesn't in the same conversation, which reads as
  a bug.
- There is already a precedent at exactly this level: `Chatbot.human_transfer_enabled`.
  A `clarify_enabled` column beside it matches the existing mental model
  ("how much may this bot involve a human?") and needs no new UI concept.
- Whether a *given* agent may ask is already determined by its product count —
  the same `resolved.products` list that drives per-product retrieval. Making
  that a second toggle produces a flag matrix with no useful states: enabling
  asking on a single-product agent does nothing.

Concretely: `Chatbot.clarify_enabled` (default off) gates whether
`UserFeedbackTools` is attached at all; the leader gets it when the chatbot has
2+ agents, and a specialist gets it when it has 2+ products.

## Future: let both the router and the specialist ask (option c)

Not for the first release. The two ambiguity classes are different and each is
best resolved by the component that can see it:

| Class | Example | Who can see it | Who asks |
|---|---|---|---|
| Cross-domain | "What are the charges?" with SBI cards *and* HDFC Life | Team leader (knows the specialist list) | leader |
| Within-domain | "What is the annual fee?" with Prime *and* Cashback | specialist (has seen the chunks, knows the answers differ) | specialist |

The leader cannot resolve the second — it never sees retrieved content. The
specialist cannot resolve the first — it only knows its own domain. Agno makes
them compose: a member's `RunRequirement` bubbles up and pauses the whole team
run, so one pause/resume path serves both.

The reason to defer: routing already sticks across turns (measured above), so
cross-domain ambiguity is largely a first-turn problem, and the leader currently
runs on the platform default model with no per-space configuration. Ship
specialist-level asking, measure how often the leader would have needed to ask,
then decide.

## Recommended sequencing

Given the measurements, asking should be an **enhancement layered on top of the
answer-for-all-products behaviour, never a correctness dependency**:

1. **Keep the shipped directives as the base.** They are correct on the current
   model and per-product retrieval already makes them accurate. This is the
   safety net for every run where `ask_user` is not called.
2. **Fix the `max_tokens` incompatibility** (`ai/core/config.py` → the LLM
   factory) so gpt-5-family models can even be evaluated. Cheap, and it is
   currently a silent "model returns an error string as its answer".
3. **Tiered model selection** rather than a blanket upgrade: keep the default
   model for ordinary traffic, use a stronger one only where asking matters
   (multi-product agents, or the leader). Most messages are unambiguous and gain
   nothing from the stronger model.
4. **Then wire the transport** — see
   `docs/structured-response-rendering-plan.md` for the full design
   (`clarify` field, `pending_run_id`, resume path, expiry, and the
   transcript-rendering decision that a question and its answer must read as a
   normal exchange).

## Open questions

1. ~~Should clarification be automatic for any multi-product agent, or an
   explicit per-agent toggle in the dashboard?~~ **Answered above**: a chatbot-level
   toggle, with the agent-level condition derived from product count.
2. When the customer never answers the clarifying question and asks something
   else, do we keep asking or fall back to answering for all products?
   (Also: how long may a paused run sit before it is abandoned?)
3. ~~Should the answer-for-all-products form ("Prime: ₹X, Cashback: ₹Y") be
   preferred over asking, when both answers are short?~~ **Yes** — it is now the
   shipped behaviour and the fallback for every run where the model declines to
   ask.
4. Is the false-ask rate acceptable? On `gpt-4.1-mini` with ask-first wording it
   asked even when the customer had named the card. Needs a prompt that
   conditions on "the customer has not named a product" more strongly, or a code
   gate that suppresses `ask_user` when a product name appears in the message.
