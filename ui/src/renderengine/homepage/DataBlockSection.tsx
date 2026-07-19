import { useState } from 'react'
import { BarChart, Bar, LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts'
import type {
  SectionProps, DataBlock, DataBlockTable, DataBlockChart, DataBlockCard, DataBlockTabs,
} from './types'
import { SectionHeading } from './SectionHeading'

// AI-designed, KB-grounded data block (see app/renderengine/data_block.py).
// The backend agent decides block_type (table/chart/card/tabs) AND content
// together -- this component only dispatches to the matching fixed renderer,
// it never interprets arbitrary structure. Always shows the disclaimer --
// this content is illustrative, never presented as a verified fact/quote.
export function DataBlockSection({ theme: t, dataBlock }: SectionProps) {
  if (!dataBlock) return null
  return (
    <div className="flex flex-col items-center w-full">
      <SectionHeading theme={t}>At a glance</SectionHeading>
      <div className={`flex flex-col gap-2.5 max-w-lg w-full text-left rounded-2xl border px-4 py-3.5 ${t.chipCls}`}>
        <p className={`text-[14px] font-semibold ${t.textPrimary}`}>{dataBlock.title}</p>
        <DataBlockBody block={dataBlock} theme={t} />
        <p className={`text-[11px] italic ${t.textMuted}`}>{dataBlock.disclaimer}</p>
      </div>
    </div>
  )
}

function DataBlockBody({ block, theme: t }: { block: DataBlock; theme: SectionProps['theme'] }) {
  switch (block.block_type) {
    case 'table':
      return <TableBlock content={block.content as DataBlockTable} theme={t} />
    case 'chart':
      return <ChartBlock content={block.content as DataBlockChart} />
    case 'card':
      return <CardBlock content={block.content as DataBlockCard} theme={t} />
    case 'tabs':
      return <TabsBlock content={block.content as DataBlockTabs} theme={t} />
    default:
      return null
  }
}

function TableBlock({ content, theme: t }: { content: DataBlockTable; theme: SectionProps['theme'] }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-[12px] border-collapse">
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

function ChartBlock({ content }: { content: DataBlockChart }) {
  const Chart = content.chart_type === 'line' ? LineChart : BarChart
  return (
    <div className="h-[160px] w-full">
      <ResponsiveContainer width="100%" height="100%">
        <Chart data={content.data} margin={{ top: 4, right: 8, left: -20, bottom: 0 }}>
          <XAxis dataKey="label" tick={{ fontSize: 10 }} />
          <YAxis tick={{ fontSize: 10 }} />
          <Tooltip />
          {content.chart_type === 'line'
            ? <Line type="monotone" dataKey="value" stroke="#6366f1" strokeWidth={2} dot={{ r: 3 }} />
            : <Bar dataKey="value" fill="#6366f1" radius={[4, 4, 0, 0]} />}
        </Chart>
      </ResponsiveContainer>
    </div>
  )
}

function CardBlock({ content, theme: t }: { content: DataBlockCard; theme: SectionProps['theme'] }) {
  return (
    <div className="flex flex-col gap-0.5">
      {content.value && <p className="text-[20px] font-bold text-indigo-500">{content.value}</p>}
      <p className={`text-[13px] font-medium ${t.textPrimary}`}>{content.heading}</p>
      <p className={`text-[12px] ${t.textSecondary}`}>{content.body}</p>
    </div>
  )
}

function TabsBlock({ content, theme: t }: { content: DataBlockTabs; theme: SectionProps['theme'] }) {
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
      {tab && <p className={`text-[12px] ${t.textSecondary}`}>{tab.body}</p>}
    </div>
  )
}
