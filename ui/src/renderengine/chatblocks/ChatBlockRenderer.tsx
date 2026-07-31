import { useState } from 'react'
import type { ChatBlock, ChatBlockTable, ChatBlockCard, ChatBlockTabs, ChatBlockTheme } from './types'

// Renders an AI reply's structured blocks (table / card / tabs) below the
// markdown text, in array order. Visual style matches
// renderengine/homepage/DataBlockSection.tsx on purpose -- same rounded chip
// container, same table/card/tabs primitives -- so a card or table doesn't
// look like a different feature depending on whether it showed up on the
// welcome screen or in a chat reply.
//
// Pluggable: gate every call site behind CHAT_BLOCKS_ENABLED (see index.ts).
// This component only ever dispatches on block_type; it never interprets
// arbitrary structure, so an unrecognised type is skipped rather than
// crashing the message thread.
export function ChatBlockRenderer({ blocks, theme: t }: { blocks: ChatBlock[]; theme: ChatBlockTheme }) {
  if (!blocks?.length) return null
  return (
    <div className="mt-3 flex flex-col gap-2.5">
      {blocks.map((block, i) => (
        <div key={i} className={`flex flex-col gap-2 text-left rounded-xl border px-3.5 py-3 ${t.chipCls}`}>
          {block.title && <p className={`text-[13px] font-semibold ${t.textPrimary}`}>{block.title}</p>}
          <ChatBlockBody block={block} theme={t} />
        </div>
      ))}
    </div>
  )
}

function ChatBlockBody({ block, theme: t }: { block: ChatBlock; theme: ChatBlockTheme }) {
  switch (block.block_type) {
    case 'table':
      return <TableBlock content={block.content as ChatBlockTable} theme={t} />
    case 'card':
      return <CardBlock content={block.content as ChatBlockCard} theme={t} />
    case 'tabs':
      return <TabsBlock content={block.content as ChatBlockTabs} theme={t} />
    default:
      return null
  }
}

function TableBlock({ content, theme: t }: { content: ChatBlockTable; theme: ChatBlockTheme }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-[12.5px] border-collapse">
        <thead>
          <tr>
            {content.columns.map((col, i) => (
              <th key={i} className={`text-left font-medium pb-1.5 pr-3 ${t.textSecondary}`}>{col}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {content.rows.map((row, i) => (
            <tr key={i} className="border-t border-current/10">
              {row.map((cell, j) => (
                <td key={j} className={`py-1.5 pr-3 ${t.textPrimary}`}>{cell}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function CardBlock({ content, theme: t }: { content: ChatBlockCard; theme: ChatBlockTheme }) {
  return (
    <div className="flex flex-col gap-0.5">
      {content.value && <p className="text-[19px] font-bold text-indigo-500">{content.value}</p>}
      <p className={`text-[13px] font-medium ${t.textPrimary}`}>{content.heading}</p>
      <p className={`text-[12.5px] ${t.textSecondary}`}>{content.body}</p>
    </div>
  )
}

function TabsBlock({ content, theme: t }: { content: ChatBlockTabs; theme: ChatBlockTheme }) {
  const [active, setActive] = useState(0)
  const tab = content.tabs[active]
  return (
    <div className="flex flex-col gap-2">
      <div className="flex gap-1.5 flex-wrap">
        {content.tabs.map((tb, i) => (
          <button
            key={i}
            type="button"
            onClick={() => setActive(i)}
            className={`px-2.5 py-1 rounded-full text-[11.5px] font-medium border ${
              i === active ? `${t.chipHoverCls} ${t.textPrimary}` : `${t.chipCls} ${t.textSecondary}`
            }`}
          >
            {tb.label}
          </button>
        ))}
      </div>
      {tab && <p className={`text-[12.5px] ${t.textSecondary}`}>{tab.body}</p>}
    </div>
  )
}
