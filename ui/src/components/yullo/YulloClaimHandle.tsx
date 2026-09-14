import { useState } from 'react'
import { motion } from 'framer-motion'
import { Check, ArrowRight, Sparkles } from 'lucide-react'

export function YulloClaimHandle() {
  const [handle, setHandle] = useState('northstarstudio')
  const [checked, setChecked] = useState(true)

  const handleCheck = (e: React.FormEvent) => {
    e.preventDefault()
    if (handle.trim()) {
      setChecked(true)
    }
  }

  return (
    <section id="claim" className="py-24 px-6 relative z-20 max-w-5xl mx-auto text-center">
      <div className="inline-flex items-center gap-2 rounded-full border border-blue-200/60 bg-blue-50/60 px-4 py-1 text-xs font-semibold tracking-wider text-blue-800 uppercase mb-3">
        <Sparkles className="h-3.5 w-3.5 text-[#FFDA2D]" />
        <span>YOUR PLACE ON THE NETWORK</span>
      </div>

      <h2 className="text-3xl sm:text-5xl font-bold text-[#101828] tracking-tight">
        Claim your place.
      </h2>

      {/* 3 Pillars */}
      <div className="mt-6 flex flex-wrap items-center justify-center gap-6 text-sm sm:text-base font-medium text-slate-600">
        <div className="flex items-center gap-2">
          <span className="h-2 w-2 rounded-full bg-[#FFDA2D]" />
          <span>A name people can find.</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="h-2 w-2 rounded-full bg-[#4CD8FF]" />
          <span>A space people can explore.</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="h-2 w-2 rounded-full bg-[#6695FF]" />
          <span>An Aura that makes it yours.</span>
        </div>
      </div>

      {/* Interactive Search Box */}
      <motion.form
        onSubmit={handleCheck}
        initial={{ opacity: 0, y: 20 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true }}
        className="mt-10 max-w-2xl mx-auto rounded-3xl border border-slate-200 bg-white p-3 shadow-xl flex flex-col sm:flex-row items-center gap-3"
      >
        <div className="flex-1 flex items-center px-4 py-2 text-base sm:text-lg font-mono w-full">
          <span className="text-slate-400 font-normal shrink-0">yullo.co/</span>
          <input
            type="text"
            value={handle}
            onChange={e => {
              setHandle(e.target.value.toLowerCase().replace(/[^a-z0-9_-]/g, ''))
              setChecked(false)
            }}
            placeholder="yourname"
            className="w-full bg-transparent font-bold text-[#101828] focus:outline-none ml-1"
          />
        </div>
        <button
          type="submit"
          className="w-full sm:w-auto inline-flex items-center justify-center gap-2 rounded-2xl bg-[#101828] px-6 py-3.5 text-sm font-semibold text-white shadow-md transition-all hover:bg-[#1e293b] shrink-0"
        >
          <span>Claim your Yullo Link</span>
          <ArrowRight className="h-4 w-4 text-[#FFDA2D]" />
        </button>
      </motion.form>

      <div className="mt-4 text-xs font-medium text-slate-400">
        Your place on Yullo starts here.
      </div>

      {/* Result Indicator */}
      {checked && handle.trim() && (
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          className="mt-6 inline-flex flex-col sm:flex-row items-center gap-3 rounded-2xl bg-emerald-50 px-6 py-3 border border-emerald-200 text-emerald-900"
        >
          <div className="flex items-center gap-2 text-sm font-semibold">
            <Check className="h-4 w-4 text-emerald-600" />
            <span>✓ yullo.co/{handle} is available</span>
          </div>
          <a
            href="#claim"
            className="inline-flex items-center gap-1.5 text-xs font-bold text-[#101828] underline underline-offset-4 hover:text-blue-600"
          >
            <span>Claim your Yullo Link now</span>
            <ArrowRight className="h-3.5 w-3.5" />
          </a>
        </motion.div>
      )}
    </section>
  )
}
