import { motion } from 'framer-motion'
import {
  Bot,
  Database,
  FileText,
  MessageSquare,
  ShieldCheck,
  ShoppingBag,
  Zap,
} from 'lucide-react'
import { SectionHeading } from './Common'

export function AnimatedBeamSection() {
  return (
    <section className="w-full py-24 bg-[#FAFAFA]" id="beam-section">
      <div className="w-full max-w-7xl mx-auto px-6">
        <SectionHeading
          eyebrow="REAL-TIME DATA FLOW"
          title="Connect your knowledge. AI answers with 100% source attribution."
          description="Data flows instantly from your help center, Shopify store, and documents into our grounded AI engine."
        />

        <div className="relative flex flex-col md:flex-row items-center justify-between w-full max-w-5xl mx-auto mt-20 p-8 md:p-12 bg-white border border-[#E5E2DB] rounded-3xl shadow-sm overflow-hidden">
          {/* SVG Flow Lines */}
          <svg className="absolute inset-0 w-full h-full pointer-events-none hidden md:block" viewBox="0 0 800 300" preserveAspectRatio="none" fill="none">
            {/* Paths connecting sources to central bot */}
            <path d="M 160 60 C 280 60, 320 150, 400 150" stroke="#E5E2DB" strokeWidth="2" />
            <path d="M 160 150 C 280 150, 320 150, 400 150" stroke="#E5E2DB" strokeWidth="2" />
            <path d="M 160 240 C 280 240, 320 150, 400 150" stroke="#E5E2DB" strokeWidth="2" />

            {/* Paths connecting bot to outputs */}
            <path d="M 400 150 C 480 150, 520 90, 640 90" stroke="#E5E2DB" strokeWidth="2" />
            <path d="M 400 150 C 480 150, 520 210, 640 210" stroke="#E5E2DB" strokeWidth="2" />

            {/* Animated Beams */}
            <motion.path
              d="M 160 60 C 280 60, 320 150, 400 150"
              stroke="url(#beam-gradient-1)"
              strokeWidth="3"
              strokeDasharray="40 160"
              initial={{ strokeDashoffset: 200 }}
              animate={{ strokeDashoffset: 0 }}
              transition={{ duration: 2.2, repeat: Infinity, ease: 'linear' }}
            />
            <motion.path
              d="M 160 150 C 280 150, 320 150, 400 150"
              stroke="url(#beam-gradient-1)"
              strokeWidth="3"
              strokeDasharray="40 160"
              initial={{ strokeDashoffset: 200 }}
              animate={{ strokeDashoffset: 0 }}
              transition={{ duration: 2.2, delay: 0.7, repeat: Infinity, ease: 'linear' }}
            />
            <motion.path
              d="M 160 240 C 280 240, 320 150, 400 150"
              stroke="url(#beam-gradient-1)"
              strokeWidth="3"
              strokeDasharray="40 160"
              initial={{ strokeDashoffset: 200 }}
              animate={{ strokeDashoffset: 0 }}
              transition={{ duration: 2.2, delay: 1.4, repeat: Infinity, ease: 'linear' }}
            />

            <motion.path
              d="M 400 150 C 480 150, 520 90, 640 90"
              stroke="url(#beam-gradient-2)"
              strokeWidth="3"
              strokeDasharray="40 160"
              initial={{ strokeDashoffset: 200 }}
              animate={{ strokeDashoffset: 0 }}
              transition={{ duration: 2.2, delay: 0.3, repeat: Infinity, ease: 'linear' }}
            />
            <motion.path
              d="M 400 150 C 480 150, 520 210, 640 210"
              stroke="url(#beam-gradient-2)"
              strokeWidth="3"
              strokeDasharray="40 160"
              initial={{ strokeDashoffset: 200 }}
              animate={{ strokeDashoffset: 0 }}
              transition={{ duration: 2.2, delay: 1.1, repeat: Infinity, ease: 'linear' }}
            />

            <defs>
              <linearGradient id="beam-gradient-1" x1="0%" y1="0%" x2="100%" y2="0%">
                <stop offset="0%" stopColor="#526B54" stopOpacity="0" />
                <stop offset="50%" stopColor="#526B54" stopOpacity="1" />
                <stop offset="100%" stopColor="#526B54" stopOpacity="0" />
              </linearGradient>
              <linearGradient id="beam-gradient-2" x1="0%" y1="0%" x2="100%" y2="0%">
                <stop offset="0%" stopColor="#D97706" stopOpacity="0" />
                <stop offset="50%" stopColor="#D97706" stopOpacity="1" />
                <stop offset="100%" stopColor="#D97706" stopOpacity="0" />
              </linearGradient>
            </defs>
          </svg>

          {/* Left Nodes: Data Sources */}
          <div className="flex flex-col gap-6 z-10 w-full md:w-auto">
            <div className="flex items-center gap-4 bg-white border border-[#E5E2DB] p-3 rounded-2xl shadow-sm max-w-[260px]">
              <div className="w-12 h-12 rounded-xl bg-[#EFECE6] text-[#526B54] flex items-center justify-center shrink-0">
                <ShoppingBag size={20} />
              </div>
              <div>
                <strong className="block text-sm font-semibold text-[#1C1C1C]">Shopify Store</strong>
                <span className="block text-xs text-[#737373]">Orders & Shipping status</span>
              </div>
            </div>

            <div className="flex items-center gap-4 bg-white border border-[#E5E2DB] p-3 rounded-2xl shadow-sm max-w-[260px]">
              <div className="w-12 h-12 rounded-xl bg-[#EFECE6] text-[#526B54] flex items-center justify-center shrink-0">
                <FileText size={20} />
              </div>
              <div>
                <strong className="block text-sm font-semibold text-[#1C1C1C]">Help Docs & PDFs</strong>
                <span className="block text-xs text-[#737373]">Return Policy & FAQs</span>
              </div>
            </div>

            <div className="flex items-center gap-4 bg-white border border-[#E5E2DB] p-3 rounded-2xl shadow-sm max-w-[260px]">
              <div className="w-12 h-12 rounded-xl bg-[#EFECE6] text-[#526B54] flex items-center justify-center shrink-0">
                <Database size={20} />
              </div>
              <div>
                <strong className="block text-sm font-semibold text-[#1C1C1C]">Zendesk / Intercom</strong>
                <span className="block text-xs text-[#737373]">Historical conversations</span>
              </div>
            </div>
          </div>

          {/* Center Node: AI Reasoning Engine */}
          <div className="flex flex-col items-center justify-center z-10 my-10 md:my-0 w-full md:w-auto">
            <motion.div
              className="flex flex-col items-center text-center p-6 bg-white border-2 border-[#526B54] rounded-3xl shadow-[0_12px_30px_-10px_rgba(82,107,84,0.2)]"
              whileHover={{ scale: 1.05 }}
              transition={{ type: 'spring', stiffness: 300 }}
            >
              <div className="w-16 h-16 rounded-2xl bg-[#526B54] text-white flex items-center justify-center mb-4">
                <Bot size={32} />
              </div>
              <strong className="text-lg font-bold text-[#1C1C1C] mb-1">AI Triage Core</strong>
              <span className="text-sm text-[#737373] mb-3">Grounded RAG Engine</span>
              <div className="inline-flex items-center gap-1.5 px-3 py-1 bg-[#EFECE6] text-[#526B54] text-xs font-semibold rounded-full">
                <ShieldCheck size={14} /> 0% Hallucination Guard
              </div>
            </motion.div>
          </div>

          {/* Right Nodes: Outputs & Handoff */}
          <div className="flex flex-col gap-6 z-10 w-full md:w-auto items-end">
            <div className="flex items-center gap-4 bg-white border border-[#E5E2DB] p-3 rounded-2xl shadow-sm max-w-[260px]">
              <div className="w-12 h-12 rounded-xl bg-[#FEF3C7] text-[#D97706] flex items-center justify-center shrink-0">
                <Zap size={20} />
              </div>
              <div>
                <strong className="block text-sm font-semibold text-[#1C1C1C]">Instant Deflection</strong>
                <span className="block text-xs text-[#737373]">Answered in &lt; 2s</span>
              </div>
            </div>

            <div className="flex items-center gap-4 bg-white border border-[#E5E2DB] p-3 rounded-2xl shadow-sm max-w-[260px]">
              <div className="w-12 h-12 rounded-xl bg-[#F3E8FF] text-[#7C3AED] flex items-center justify-center shrink-0">
                <MessageSquare size={20} />
              </div>
              <div>
                <strong className="block text-sm font-semibold text-[#1C1C1C]">Agent Handoff</strong>
                <span className="block text-xs text-[#737373]">Contextual briefing ready</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}
