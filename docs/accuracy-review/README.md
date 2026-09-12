# Chatbot accuracy review

Status: prepared, not run. No measured accuracy is claimed.

Use `questions.csv` to review each owner-created chatbot against its own assigned
knowledge and authorized tools. A space or owner name identifies the business;
it is not evidence of its domain, policies, prices, capabilities, or entitlements.
It contains 30 common questions, 10 exceptions, and 10 missing-information probes.
These are domain-neutral templates, not ready-to-run questions. An entity can be
a product, service, course, plan, policy, or another subject actually present in
the owner's sources. Replace templates with source-specific questions and real,
anonymized customer questions. Automatic suite generation is not implemented.

## Before running

1. Record the space and chatbot IDs, model, source revisions, date, tool scope,
   and clarification setting. Use only knowledge assigned to this chatbot.
2. Have the space owner fill `expected_answer` and `source_reference` for each row
   before seeing the bot's answer. Include exact conditions, amounts and dates.
   The `review_focus` column is a review instruction, not a policy or answer key.
3. Replace bracketed placeholders with subjects from the assigned sources. Choose
   answerable questions for the first 40 rows; replace inapplicable topics with
   supported ones. If knowledge is too sparse, report an incomplete suite instead
   of inventing facts or duplicating cases to reach 50. For the last 10 rows,
   verify that the answer really is absent from this chatbot's approved sources
   and tools; replace a question if it is answerable. A documented prohibition
   belongs among answerable questions, not missing-information probes. An unresolved
   source conflict belongs among missing-information cases; replace its answerable
   template unless an approved resolution exists.
4. Start with five cases to confirm setup and inspect model usage before running
   the rest. Do not upload the answer key or this worksheet into the knowledge base.

## Run with the existing tools

The app's `/app/evaluations` screen supports suites and individual cases. Create
a suite for the chosen chatbot, then add the prepared questions and any useful
keyword/source expectations. There is currently no CSV import; this CSV is a
manual review worksheet. Copy each actual response into `actual_answer`.

The headless evaluation runner uses the published runtime but disables interactive
clarification and external business actions. It observes escalation intent without
performing a handoff. Therefore use the normal chatbot preview/customer chat to
check clarification, follow-up history, and an actual handoff separately. Keep
customer-specific lookups to authorized test records; knowledge-only tests must
not be treated as verification of those integrations.

For ambiguous-entity cases, also test the same question after naming the entity,
an explicit comparison, a shared policy, and an unanswered clarification. Confirm
that it asks only when needed and does not ask repeatedly. Record these extra turns
in `review_notes`; do not count them as independent questions in the 50-case score.
For case 39, grade the complete exchange after providing the requested entity:
a necessary clarification followed by a supported answer can be `correct`. If
the exchange remains unresolved, mark it `incomplete` for the answerable score.

## Grade manually against approved evidence

Fill `verdict` with one value:

- `correct`: all material claims are supported and the answer covers the question.
- `incomplete`: no material falsehood, but a required condition or answer is missing.
- `wrong`: any unsupported or contradictory material claim, including a fabricated
  denial, invented price, inappropriate disclosure, or claim of a completed action.
- `appropriate_decline`: the missing fact is explicitly unconfirmed, or required
  clarification/handoff is requested without inventing an answer or completed action.

An unnecessary refusal to an answerable question is `incomplete`, not a success.
Clarification is appropriate only if necessary information is missing. If a response
contains a material falsehood, mark it `wrong` even if other parts are correct.
For a source citation, read the cited passage: matching words or a source badge do
not establish that it supports the claim. Record serious failures in `review_notes`.

## Report without overstating the result

- Answerable accuracy: `correct / 40` for the first two groups. Include incomplete
  and wrong counts; do not exclude refusals from the denominator.
- Missing-information handling: `appropriate_decline / 10` for the final group.
- Material-error rate: `wrong / 50` across the full worksheet.
- Report unreviewed cases explicitly. Never report a complete score with blanks.
- Keep any automated pass rate separate from these human-reviewed results.
- Report results per chatbot and source revision. A passing result for one space
  does not establish accuracy for another chatbot. Reassess after changes to
  knowledge, instructions, model, or connected tools.

These are results on a small curated sample, not a production accuracy estimate.
After fixing failures, retest them and use fresh customer questions to check that
the improvement generalizes. Correct critical errors before a supervised pilot;
continue sampling actual conversations during the pilot.

The prompt changes in this revision prevent instructions from equating missing
information with unavailability, and align clarification across agents. They do
not guarantee model behavior or add a factual verifier. Existing cached runners
may retain old prompts until rebuilt; verify against a freshly built runtime after
the normal deployment/restart process.
