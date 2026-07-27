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

1. Give the agent a `request_clarification(question, options)` tool. Calling it
   is how the agent says "I need to ask", rather than us pattern-matching a
   question mark in free text.
2. Add `clarify: {question, options[]} | null` to `CustomerChatResponse`.
3. Render `clarify.options` as chips in the existing chip row; a click sends that
   option as the next message — no new interaction model needed.

- **Cost:** moderate; one tool, one response field, small UI change.
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

## Open questions

1. Should clarification be automatic for any multi-product agent, or an explicit
   per-agent toggle in the dashboard?
2. When the customer never answers the clarifying question and asks something
   else, do we keep asking or fall back to answering for all products?
3. Should the answer-for-all-products form ("Prime: ₹X, Cashback: ₹Y") be
   preferred over asking, when both answers are short? It is one turn instead of
   two, and arguably more useful.
