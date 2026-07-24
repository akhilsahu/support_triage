import { useEffect, useRef, useState } from 'react'
import {
  ShieldCheck, Users, Star, CalendarClock, Award, IndianRupee, TrendingUp,
  type LucideIcon,
} from 'lucide-react'
import type { SectionProps, StatBandItem } from './types'
import { SectionHeading } from './SectionHeading'

// Trust-metrics band (see app/renderengine/stat_band.py). The big headline
// numbers a prospect scans first, rendered as colorful infographic tiles: a
// metric-aware icon in an accent-tinted chip, a hue wash, and a count-up
// animation when the band scrolls into view. Numbers stay in primary ink --
// per the data-viz method, colour identity rides the icon/tint, never the data
// text, so contrast holds across the dark/darker/light widget themes.

// Validated categorical hues (data-viz reference palette), cycled per card.
const ACCENTS = ['#3987e5', '#17a37c', '#8b7cf0', '#eb6834']

function hexRgba(hex: string, a: number): string {
  const n = parseInt(hex.slice(1), 16)
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${a})`
}

function pickIcon(label: string): LucideIcon {
  const l = label.toLowerCase()
  if (/rat(e|ing)|star|review|satisf|nps|score/.test(l)) return Star
  if (/claim|settl|paid|approv/.test(l)) return ShieldCheck
  if (/live|cover|custom|member|people|served|client|famil|polic/.test(l)) return Users
  if (/year|yr|experien|since|estab|legacy|decad/.test(l)) return CalendarClock
  if (/award|win|recogn|best|rank/.test(l)) return Award
  if (/₹|cr\b|crore|lakh|premium|asset|fund|aum|sum|payout|amount|₹/.test(l)) return IndianRupee
  return TrendingUp
}

// Split "99.7%" / "68M" / "4.5/5" / "23 yrs" into a prefix, an animatable
// number, and a suffix. null when there's no leading number to animate.
function parseStat(value: string): { pre: string; num: number; suf: string; decimals: number; grouped: boolean } | null {
  const m = value.match(/^(\D*?)(\d[\d,]*(?:\.\d+)?)([\s\S]*)$/)
  if (!m) return null
  const [, pre, numRaw, suf] = m
  const grouped = numRaw.includes(',')
  const clean = numRaw.replace(/,/g, '')
  const decimals = clean.includes('.') ? clean.split('.')[1].length : 0
  return { pre, num: parseFloat(clean), suf, decimals, grouped }
}

function fmt(n: number, decimals: number, grouped: boolean): string {
  const s = n.toFixed(decimals)
  if (!grouped) return s
  const [i, d] = s.split('.')
  return i.replace(/\B(?=(\d{3})+(?!\d))/g, ',') + (d ? '.' + d : '')
}

function usePrefersReducedMotion(): boolean {
  const [reduce, setReduce] = useState(false)
  useEffect(() => {
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)')
    const on = () => setReduce(mq.matches)
    on()
    mq.addEventListener('change', on)
    return () => mq.removeEventListener('change', on)
  }, [])
  return reduce
}

// Count from 0 -> target with an ease-out once `active`. Returns the target
// immediately when not animating, so a card is never blank or stuck at 0.
function useCountUp(target: number, active: boolean, duration = 1100): number {
  const [val, setVal] = useState(active ? 0 : target)
  useEffect(() => {
    if (!active) { setVal(target); return }
    let raf = 0
    const start = performance.now()
    const tick = (now: number) => {
      const p = Math.min(1, (now - start) / duration)
      const eased = 1 - Math.pow(1 - p, 3)
      setVal(target * eased)
      if (p < 1) raf = requestAnimationFrame(tick)
      else setVal(target)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [target, active, duration])
  return val
}

function StatCard({
  stat, hue, theme: t, animate, wide,
}: { stat: StatBandItem; hue: string; theme: SectionProps['theme']; animate: boolean; wide: boolean }) {
  const parsed = parseStat(stat.value)
  const Icon = pickIcon(stat.label)
  const running = animate && parsed !== null
  const current = useCountUp(parsed?.num ?? 0, running)
  const display = parsed
    ? parsed.pre + fmt(current, parsed.decimals, parsed.grouped) + parsed.suf
    : stat.value

  return (
    <div
      className={`group relative rounded-2xl border px-3.5 py-2.5 text-left overflow-hidden
                  transition-all duration-200 hover:-translate-y-0.5 ${t.chipCls} ${wide ? 'col-span-2' : ''}`}
      style={{ borderColor: hexRgba(hue, 0.22) }}
    >
      <div
        className="absolute inset-0 pointer-events-none opacity-70 transition-opacity duration-200 group-hover:opacity-100"
        style={{ background: `radial-gradient(120% 120% at 0% 0%, ${hexRgba(hue, 0.15)}, transparent 62%)` }}
      />
      <span
        className="relative inline-flex items-center justify-center rounded-lg w-6 h-6 mb-1.5"
        style={{ background: hexRgba(hue, 0.16), color: hue }}
      >
        <Icon size={14} strokeWidth={2.2} />
      </span>
      <p className={`relative text-[21px] font-semibold leading-none tabular-nums ${t.textPrimary}`}>{display}</p>
      <p className={`relative text-[12px] mt-1 ${t.textSecondary}`}>{stat.label}</p>
    </div>
  )
}

export function StatBandSection({ theme: t, statBand }: SectionProps) {
  const ref = useRef<HTMLDivElement>(null)
  const reduce = usePrefersReducedMotion()
  const [inView, setInView] = useState(false)

  useEffect(() => {
    const el = ref.current
    if (!el) return
    const io = new IntersectionObserver(
      ([e]) => { if (e.isIntersecting) { setInView(true); io.disconnect() } },
      { threshold: 0.35 },
    )
    io.observe(el)
    return () => io.disconnect()
  }, [])

  if (!statBand?.stats?.length) return null
  const stats = statBand.stats
  const animate = inView && !reduce

  return (
    <div ref={ref} className="flex flex-col items-center w-full">
      <SectionHeading theme={t}>Trusted by millions</SectionHeading>
      <div className="grid grid-cols-2 gap-2.5 max-w-md w-full">
        {stats.map((s, i) => (
          <StatCard
            key={i}
            stat={s}
            hue={ACCENTS[i % ACCENTS.length]}
            theme={t}
            animate={animate}
            wide={stats.length % 2 === 1 && i === stats.length - 1}
          />
        ))}
      </div>
      {statBand.disclaimer && (
        <p className={`text-[11px] italic mt-2 max-w-md ${t.textMuted}`}>{statBand.disclaimer}</p>
      )}
    </div>
  )
}
