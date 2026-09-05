import { useState } from 'react'
import { Link } from 'react-router-dom'
import { Plus } from 'lucide-react'
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion'
import { faqs } from '../content'
import { transition } from '../motion'

export function FAQSection() {
  const [open, setOpen] = useState<number | null>(0)
  const reduced = useReducedMotion()
  return (
    <section id="faq" tabIndex={-1} className="w-full py-24 bg-white border-b border-[#E5E2DB]">
      <div className="w-full max-w-7xl mx-auto px-6 grid grid-cols-1 md:grid-cols-12 gap-12 lg:gap-24">
        <div className="md:col-span-5">
          <p className="text-[10px] tracking-widest uppercase font-semibold text-[#526B54] mb-3">A few good questions</p>
          <h2 className="text-3xl md:text-5xl font-bold text-[#1C1C1C] tracking-tight text-balance leading-tight mb-6">
            Before you<br />make yourself at home.
          </h2>
          <p className="text-lg text-[#4A4A4A]">
            Something else on your mind?<br />
            <Link to="/contact" className="font-semibold text-[#1C1C1C] hover:text-[#526B54] underline decoration-[#E5E2DB] underline-offset-4 transition-colors">Talk to us.</Link>
          </p>
        </div>
        
        <div className="md:col-span-7 flex flex-col border-t border-[#E5E2DB]">
          {faqs.map((item, i) => (
            <article key={item.question} className="border-b border-[#E5E2DB]">
              <h3 className="m-0">
                <button
                  id={`h5-faq-button-${i}`}
                  onClick={() => setOpen(open === i ? null : i)}
                  aria-expanded={open === i}
                  aria-controls={`h5-faq-answer-${i}`}
                  className="w-full flex items-center justify-between py-6 text-left text-lg font-bold text-[#1C1C1C] hover:text-[#526B54] transition-colors focus:outline-none"
                >
                  {item.question}
                  <Plus size={20} className={`shrink-0 text-[#A3A3A3] transition-transform duration-300 ${open === i ? 'rotate-45' : ''}`} />
                </button>
              </h3>
              <AnimatePresence initial={false}>
                {open === i && (
                  <motion.div
                    id={`h5-faq-answer-${i}`}
                    role="region"
                    aria-labelledby={`h5-faq-button-${i}`}
                    initial={{ height: reduced ? 'auto' : 0, opacity: 0 }}
                    animate={{ height: 'auto', opacity: 1 }}
                    exit={{ height: reduced ? 'auto' : 0, opacity: 0 }}
                    transition={transition}
                    className="overflow-hidden"
                  >
                    <p className="pb-6 text-sm text-[#4A4A4A] leading-relaxed max-w-2xl">
                      {item.answer}
                      {item.link && (
                        <>
                          {' '}
                          <Link to={item.link} className="font-medium text-[#1C1C1C] hover:text-[#526B54] underline decoration-[#E5E2DB] underline-offset-4 transition-colors">
                            {item.linkLabel}.
                          </Link>
                        </>
                      )}
                    </p>
                  </motion.div>
                )}
              </AnimatePresence>
            </article>
          ))}
        </div>
      </div>
    </section>
  )
}
