# KB ↔ Agent Granularity: two credit cards, one KB or two?

Question: SBI Cashback CC and SBI Prime CC are two PDFs. Should they be one KB
with one agent, or split into an agent per card?

## 1. What the system actually enforces

Three facts from the code decide this — the choice is more constrained than it looks.

**The retrieval boundary is the knowledge base, not the document.**
`app/orchestra/ai/knowledge/agno_chroma.py:_build_where` scopes a custom agent's
search with `kb_id $in agent.kb_ids`. There is no per-document filter. So two
PDFs in one KB are **inseparable at query time** — any agent on that KB always
searches both. Isolating a card therefore requires a *separate KB*, not just a
separate agent.

**Agent ↔ KB is many-to-many** (`AgentKnowledgeBase`). One agent can cover
several KBs, and one KB can feed several agents. So "split the KBs" does not
force "split the agents".

**Triage guesses and never asks.** `TRIAGE_COORDINATOR_PROMPT` rule 3: *"If the
message is ambiguous or off-topic, still pick the closest specialist."* It must
always delegate and must never speak to the customer. So it cannot ask *"which
card do you have?"* — it silently picks one.

That last point is the crux of the whole decision.

## 2. The options

| | Retrieval scope | Who picks the card | Ambiguous question ("what's my annual fee?") |
|---|---|---|---|
| **A. One KB, both PDFs, one agent** | both cards | nobody | agent sees both → can answer per card, or ask |
| **B. Two KBs, one agent per card** | one card each | **triage (guesses)** | silently answers about the wrong card |
| **C. Two KBs, one agent linked to both** | both cards | nobody | same as A, documents stay separately managed |
| **D. One chatbot per card** | one card each | **the customer, via the link/embed** | already scoped — no ambiguity to resolve |

A and C are functionally identical for retrieval; they differ only in how the
documents are organised and reused.

### D is materially different from B

B and D both isolate a card, but they resolve the ambiguity in completely
different places:

- **B asks triage to infer the card from the customer's words** — and triage is
  explicitly told never to ask and always to guess. It fails silently.
- **D resolves it before the conversation starts.** The chatbot is chosen by the
  URL (`/{slug}/{chatbotSlug}`) or the embed snippet on the page — a deployment
  decision, not an LLM inference. A customer reading the Prime product page, or
  following a link from a Prime statement, is already in the Prime chatbot.

The chain is `chatbot -> agents -> KBs`, and both junctions
(`ChatbotCustomAgent`, `AgentKnowledgeBase`) are many-to-many, so nothing has to
be duplicated to do this.

D also gets per-card presentation for free: each chatbot has its own welcome UI,
suggested questions, branding and login gate.

**The catch:** D only works where the entry point is card-specific. If everything
funnels through one generic "SBI Cards support" page, the customer never made a
choice and you are back to A/C.

## 3. Recommendation: it depends on the entry point

**If entry points are card-specific** (product page embed, statement link, app
deep link) → **option D, one chatbot per card.** Best isolation, zero triage
guessing, per-card welcome UI, and clean full-budget retrieval. This is the
strongest option when it applies, and the space already uses this pattern at
brand level (separate HDFC LIFE and SBI CREDIT CARD chatbots).

**If there is a single generic entry point** → **option C**, below: one agent
covering both KBs, because the customer never told anyone which card they hold.

**You can have both, with no duplication** — the M2M junctions allow:

```
KB "SBI Prime"     ─┬─ agent "Prime Support"    ── chatbot "SBI Prime"
KB "SBI Cashback"  ─┼─ agent "Cashback Support" ── chatbot "SBI Cashback"
       both KBs    ─┴─ agent "SBI Cards (all)"  ── chatbot "SBI Cards" (generic)
```

Same two KBs and the same documents throughout; only the wiring differs. Note
the generic chatbot deliberately gets ONE agent spanning both KBs rather than
both card agents — giving it both card agents would reintroduce the triage guess.

Chatbot count is capped per space (`Space.max_chatbots`, currently 2 of 19 used),
so there is headroom, but it is a real limit at larger card portfolios.

### If you go with a single entry point: one agent covering both cards (C over A)

**Do not split into one agent per card**, because the failure mode is bad and
silent. "What is the annual fee?" contains no card name. Under option B, triage
picks *"SBI Cashback Support"* or *"SBI Prime Support"* essentially on vibes, and
the customer gets a confidently wrong fee for a card they don't hold. For a
regulated financial product that is a compliance-grade error, and nothing in the
current design catches it — triage is explicitly forbidden from asking.

With one agent over both cards, the same question retrieves chunks from both
documents, so the model can answer *"Cashback: ₹X, Prime: ₹Y — which do you
have?"* That is the correct behaviour for an inherently ambiguous question.

**Prefer C (two KBs, one agent linked to both) over A (one KB)** because it costs
nothing today and keeps options open: KBs are the retrieval unit, so separate
KBs let you later attach a Prime-only agent, retire one card, or reuse a card's
KB for another chatbot — none of which is possible once both PDFs are fused into
one KB.

### Required mitigations

1. **Raise `rag_top_k`.** Default is 5 (`default_rag_top_k`). Split across two
   products that is ~2–3 chunks per card, so a comparison answer can miss one
   side entirely. Suggest 8–10 for a multi-product agent.
2. **Make the agent's system prompt disambiguation-aware**, e.g.:
   *"These documents cover multiple SBI credit cards. Always state which card an
   answer applies to. If the customer has not said which card they hold and the
   answer differs between them, give the answer for each card or ask which one."*
3. **Watch chunk self-labelling.** Some chunks carry the product in their section
   header ("SBI CARD PRIME CONTACTLESS FAQs"), but generic ones don't
   ("TERMS & CONDITIONS", "EXCLUSIVE FEATURES"). Two cards' T&C chunks can look
   nearly identical in isolation — the real conflation risk. See §5.

## 4. When splitting into separate agents IS right

Split by **domain**, not by **SKU**:

- ✅ Credit cards vs. life insurance vs. loans — different vocabulary, triage
  routes reliably, no cross-product ambiguity.
- ❌ Prime vs. Cashback vs. SimplyCLICK — same vocabulary, same questions;
  triage cannot tell them apart without the customer naming the card.

The rule of thumb: split when a customer's *words* reliably identify the target.
If the question could sensibly apply to either agent, one agent should own both.

This also has a scale limit: one agent over 10 cards would dilute retrieval badly.
At that point the fix is not more agents but per-document filtering (§5) or a
card-selection step in the UI.

## 5. Optional follow-up: fix the real gap

The underlying limitation is that **`doc_id` is written into chunk metadata at
ingestion but is not usable as an agent-level filter** — only `kb_id` and
`doc_type` are. Adding an optional document-level scope to `_build_where` would
allow one KB to serve several narrowly-scoped agents, removing the "one KB per
card" workaround entirely.

Cheaper partial mitigation, worth doing regardless: **prepend the product name to
chunk text** for multi-product KBs (the section header already does this where
headings are product-specific; the generic sections are the gap). That makes
every chunk self-identifying and largely removes the conflation risk.

## 6. Concrete plan

Common to every path — **keep two KBs**, "SBI Cashback CC" and "SBI Prime CC",
one PDF each. KBs are the retrieval unit, so this is the decision that preserves
every later option; merging the PDFs is the only genuinely irreversible choice.

**If entry points are card-specific (recommended):**
1. One chatbot per card, each with its own agent on that card's KB.
2. Embed the matching chatbot on each card's page / statement link.
3. Leave `rag_top_k` at the default — retrieval is single-product.
4. Optionally add a generic "SBI Cards" chatbot with one agent spanning both KBs
   for any non-card-specific entry point.

**If there is only a generic entry point:**
1. One agent, linked to both KBs.
2. Raise `rag_top_k` to ~8-10 (5 split across two products is ~2-3 chunks each).
3. Add the disambiguation instruction to its system prompt (§3).
4. Test with deliberately ambiguous questions ("What is the annual fee?", "What
   are the reward points?") and confirm the answer names the card rather than
   silently picking one.
5. Only if step 4 shows conflation: implement document-level filtering (§5).

## 7. Open questions

1. Where do customers actually enter the chat? A card-specific page or link makes
   option D clearly best; a single generic support page rules it out.
2. Do customers usually name the card in their first message? If your chat logs
   show they do, option B becomes viable and gives cleaner retrieval.
2. How many cards will this eventually cover? Two is comfortable for one agent;
   beyond ~5, revisit §5.
3. Should triage be allowed to ask a clarifying question? That is a deliberate
   design constraint today, and relaxing it would change this recommendation.
