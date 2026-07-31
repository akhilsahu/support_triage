"""
RenderTools — lets an agent hand back structured content (table/cards/tabs)
alongside its normal prose reply, instead of being limited to markdown text.

Mirrors agno.tools.user_feedback.UserFeedbackTools: each function does nothing
but validate its arguments and return a throwaway confirmation string. The
actual payload is read back from the tool-call trace by
orchestrators/agno.py's _extract_blocks() — the call's ARGUMENTS, not its
return value, same tool-calling mechanism the ask_user pause/resume flow
already uses. See docs/structured-response-rendering-plan.md, "Shared
mechanism: tool-calling, not fenced markdown".

RENDER_TOOLS_ENABLED is the kill switch: flip to False and this stops being
attached anywhere, no other code changes needed — mirrors
ui/src/renderengine/chatblocks/index.ts's CHAT_BLOCKS_ENABLED on the frontend.
"""

from __future__ import annotations
from textwrap import dedent
from typing import Any, List, Optional

from pydantic import BaseModel, Field

from agno.tools import Toolkit

RENDER_TOOLS_ENABLED = True


class CardItem(BaseModel):
    heading: str = Field(..., description="Short label for this card.")
    value: Optional[str] = Field(None, description="A short standout figure, e.g. '2X' or '₹500'. Omit if none.")
    body: str = Field(..., description="One or two sentences of detail.")


class TabItem(BaseModel):
    label: str = Field(..., description="Short tab label, e.g. a product name.")
    body: str = Field(..., description="Content shown when this tab is selected.")


class RenderTools(Toolkit):
    def __init__(self, **kwargs: Any):
        super().__init__(
            name="render_tools",
            instructions=self.DEFAULT_INSTRUCTIONS,
            add_instructions=True,
            tools=[self.render_table, self.render_cards, self.render_tabs],
            **kwargs,
        )

    def render_table(self, title: str, columns: List[str], rows: List[List[str]]) -> str:
        """Render a comparison table alongside your reply.

        Args:
            title: Short label shown above the table.
            columns: Column headers, in order.
            rows: Each row is a list of cell strings, same length as columns.
        """
        return "Table queued for display."

    def render_cards(self, title: str, items: List[CardItem]) -> str:
        """Render one or more highlight cards alongside your reply.

        Args:
            title: Short label shown above the cards.
            items: 1-4 cards to display.
        """
        return "Cards queued for display."

    def render_tabs(self, title: str, tabs: List[TabItem]) -> str:
        """Render switchable tabs alongside your reply — one per product/topic.

        Args:
            title: Short label shown above the tabs.
            tabs: 2-4 tabs to display.
        """
        return "Tabs queued for display."

    DEFAULT_INSTRUCTIONS = dedent(
        """\
        You have tools to render structured content alongside your normal reply:
        render_table, render_cards, render_tabs.

        ## When to use
        - render_table: comparing 2+ things across the same attributes (e.g. fees
          across products, feature comparisons).
        - render_cards: 1-4 standalone highlights (e.g. a single stat, a reward rate).
        - render_tabs: content that differs per product/topic and the customer may
          want to flip between (e.g. "PRIME" vs "Cashback" details).

        ## Guidelines
        - Still write your normal prose reply — these tools ADD a visual next to
          it, they do not replace it.
        - Call at most one of these per turn. Only use one when it would genuinely
          help — most replies need none of them.
        - Keep cell/body text short; this is a visual aid, not a place to repeat
          your whole answer.
        """
    )
