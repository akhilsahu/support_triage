import { useState } from 'react'
import {
  BookOpen,
  ChevronDown,
  Code2,
  FileText,
  Globe,
  MessageCircle,
} from 'lucide-react'
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion'
import { SectionHeading } from './Common'
import { transition } from '../motion'

export function IntegrationDetails() {
  const [open, setOpen] = useState(false)
  const reduced = useReducedMotion()
  return (
    <section id="integrations" tabIndex={-1} className="w-full py-24 bg-white border-y border-[#E5E2DB]">
      <div className="w-full max-w-7xl mx-auto px-6 grid grid-cols-1 lg:grid-cols-2 gap-16 lg:gap-8 items-center">
        <div>
          <SectionHeading
            eyebrow="YOUR CONTENT. YOUR CORNER OF THE WEB."
            title="Meet customers where they already are."
            description="Add your knowledge, embed the chat widget on your website, or share a support page with your own name."
          />
          <div className="flex flex-wrap gap-4 mt-8 mb-12">
            <span className="inline-flex items-center gap-2 px-4 py-2 bg-[#FCFBF9] border border-[#E5E2DB] rounded-xl text-sm font-semibold text-[#4A4A4A]">
              <FileText size={16} className="text-[#526B54]" /> Documents
            </span>
            <span className="inline-flex items-center gap-2 px-4 py-2 bg-[#FCFBF9] border border-[#E5E2DB] rounded-xl text-sm font-semibold text-[#4A4A4A]">
              <BookOpen size={16} className="text-[#526B54]" /> FAQs & text
            </span>
            <span className="inline-flex items-center gap-2 px-4 py-2 bg-[#FCFBF9] border border-[#E5E2DB] rounded-xl text-sm font-semibold text-[#4A4A4A]">
              <Code2 size={16} className="text-[#526B54]" /> Website widget
            </span>
            <span className="inline-flex items-center gap-2 px-4 py-2 bg-[#FCFBF9] border border-[#E5E2DB] rounded-xl text-sm font-semibold text-[#4A4A4A]">
              <Globe size={16} className="text-[#526B54]" /> Branded page
            </span>
          </div>
          
          <button
            className="flex items-center gap-2 text-sm font-bold text-[#1C1C1C] hover:text-[#526B54] transition-colors"
            aria-expanded={open}
            aria-controls="h5-technical"
            onClick={() => setOpen(!open)}
          >
            A look under the hood{' '}
            <ChevronDown size={16} className={`transition-transform duration-300 ${open ? 'rotate-180' : ''}`} />
          </button>
          
          <AnimatePresence initial={false}>
            {open && (
              <motion.div
                id="h5-technical"
                initial={{ height: reduced ? 'auto' : 0, opacity: 0 }}
                animate={{ height: 'auto', opacity: 1 }}
                exit={{ height: reduced ? 'auto' : 0, opacity: 0 }}
                transition={transition}
                className="overflow-hidden"
              >
                <p className="mt-4 text-sm text-[#4A4A4A] leading-relaxed max-w-md p-4 bg-[#FCFBF9] rounded-xl border border-[#E5E2DB]">
                  Support247 combines a knowledge base, AI agents, and a team
                  inbox. Configure the content and agent behaviour in your
                  workspace, test responses, then publish your chat experience.
                </p>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        <div className="w-full max-w-md mx-auto lg:ml-auto bg-[#F2EFEB] rounded-[2rem] p-4 shadow-inner relative overflow-hidden" aria-label="Illustrative branded support page">
          <div className="w-full h-full bg-white rounded-2xl shadow-sm overflow-hidden flex flex-col border border-[#E5E2DB]">
            <div className="flex items-center gap-2 p-3 bg-[#FCFBF9] border-b border-[#E5E2DB]">
              <div className="flex gap-1.5 ml-1">
                <span className="w-2.5 h-2.5 rounded-full bg-[#E5E2DB]" />
                <span className="w-2.5 h-2.5 rounded-full bg-[#E5E2DB]" />
                <span className="w-2.5 h-2.5 rounded-full bg-[#E5E2DB]" />
              </div>
              <div className="flex-1 text-center bg-white border border-[#E5E2DB] rounded-md mx-4 py-1 text-[10px] text-[#A3A3A3] font-medium">
                support247.chat/yourbrand
              </div>
            </div>
            
            <div className="flex-1 flex flex-col items-center justify-center p-8 text-center min-h-[300px]">
              <div className="w-16 h-16 rounded-3xl bg-[#EFECE6] text-[#526B54] flex items-center justify-center mb-6 shadow-sm">
                <MessageCircle size={28} />
              </div>
              <span className="text-[10px] tracking-widest uppercase font-bold text-[#A3A3A3] mb-4">Your brand, your support</span>
              <h3 className="text-2xl font-bold text-[#1C1C1C] mb-3 text-balance leading-tight">
                A familiar place.<br />A helpful answer.
              </h3>
              <p className="text-sm text-[#737373] mb-8 text-balance">
                Your support page brings your brand and conversations together.
              </p>
              
              <div className="w-full flex items-center justify-between px-4 py-3 bg-[#FCFBF9] border border-[#E5E2DB] rounded-xl text-sm text-[#A3A3A3] shadow-sm">
                How can we help?
                <MessageCircle size={16} className="text-[#526B54]" />
              </div>
            </div>
          </div>
          <span className="absolute bottom-6 right-8 text-[9px] text-[#A3A3A3] uppercase tracking-wider font-semibold">
            Illustrative page
          </span>
        </div>
      </div>
    </section>
  )
}
