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

| | Retrieval scope | Ambiguous question ("what's my annual fee?") |
|---|---|---|
| **A. One KB, both PDFs, one agent** | both cards | agent sees both → can answer per card, or ask |
| **B. Two KBs, one agent per card** | one card each | **triage silently guesses a card** |
| **C. Two KBs, one agent linked to both** | both cards | same as A, but documents stay separately managed |

A and C are functionally identical for retrieval; they differ only in how the
documents are organised and reused.

## 3. Recommendation: one agent covering both cards (C preferred over A)

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

1. Keep **two KBs** — "SBI Cashback CC" and "SBI Prime CC" — one PDF each.
2. Create **one agent**, link it to both KBs.
3. Set `rag_top_k` to ~8–10 on that agent.
4. Add the disambiguation instruction to its system prompt (§3.2).
5. Test with deliberately ambiguous questions ("What is the annual fee?",
   "What are the reward points?") and confirm the answer names the card rather
   than silently picking one.
6. Only if step 5 shows conflation: implement document-level filtering (§5).

## 7. Open questions

1. Do customers usually name the card? If your chat logs show they do, option B
   becomes viable and gives cleaner retrieval.
2. How many cards will this eventually cover? Two is comfortable for one agent;
   beyond ~5, revisit §5.
3. Should triage be allowed to ask a clarifying question? That is a deliberate
   design constraint today, and relaxing it would change this recommendation.
