import { BookOpen, Check, FileText, MessageCircle, Users } from 'lucide-react'
import { motion } from 'framer-motion'
import { outcomes } from '../content'
import { Reveal, SectionHeading } from './Common'
import { staggerContainer, staggerItem } from '../motion'

const icons = { message: MessageCircle, book: BookOpen, people: Users }

export function OutcomeSections() {
  return (
    <section className="w-full py-24 bg-white" id="product" tabIndex={-1} aria-labelledby="h5-outcomes-title">
      <div className="w-full max-w-7xl mx-auto px-6">
        <div id="h5-outcomes-title">
          <SectionHeading
            eyebrow="LESS BACK-AND-FORTH"
            title="For the questions you know. And the ones that need you."
            description="Give everyday questions a place to go, so your team can give the more personal ones their full attention."
          />
        </div>
        
        <motion.div
          className="grid grid-cols-1 md:grid-cols-3 gap-8 mt-16"
          variants={staggerContainer}
          initial="hidden"
          whileInView="show"
          viewport={{ once: true, margin: '-50px' }}
        >
          {outcomes.map((item, i) => {
            const Icon = icons[item.icon as keyof typeof icons] || MessageCircle
            return (
              <motion.article key={item.title} className="flex flex-col h-full bg-[#FCFBF9] border border-[#E5E2DB] rounded-3xl overflow-hidden shadow-sm" variants={staggerItem}>
                
                {/* Visual Header */}
                <Reveal className="w-full h-56 bg-[#F2EFEB] border-b border-[#E5E2DB] p-6 relative flex items-center justify-center">
                  {i === 0 && (
                    <div className="w-full max-w-[240px] flex flex-col gap-3">
                      <span className="self-end bg-[#526B54] text-white text-xs px-3 py-2 rounded-2xl rounded-tr-sm shadow-sm">
                        Do you ship on weekends?
                      </span>
                      <div className="flex gap-2 items-end">
                        <span className="w-6 h-6 rounded-full bg-white border border-[#E5E2DB] flex items-center justify-center shrink-0">
                          <MessageCircle size={12} className="text-[#526B54]" />
                        </span>
                        <div className="bg-white border border-[#E5E2DB] text-[#1C1C1C] text-xs px-3 py-2 rounded-2xl rounded-tl-sm shadow-sm">
                          Here’s what our shipping guide says…
                        </div>
                      </div>
                      <span className="inline-flex items-center gap-1.5 self-start ml-8 mt-1 text-[10px] font-medium text-[#526B54] bg-[#EFECE6] px-2 py-1 rounded-md">
                        <FileText size={10} /> Shipping guide
                      </span>
                    </div>
                  )}
                  {i === 1 && (
                    <div className="w-full max-w-[240px] bg-white border border-[#E5E2DB] rounded-2xl p-4 shadow-sm flex flex-col gap-2">
                      <div className="flex items-center gap-2 mb-2 text-[#1C1C1C]">
                        <BookOpen size={16} className="text-[#526B54]" />
                        <strong className="text-xs font-bold">Your knowledge base</strong>
                      </div>
                      {['Getting started.pdf', 'Returns & exchanges', 'Frequently asked questions'].map((title) => (
                        <div key={title} className="flex items-center justify-between bg-[#FCFBF9] border border-[#E5E2DB] p-2 rounded-xl">
                          <span className="flex items-center gap-2 text-[10px] font-medium text-[#4A4A4A]">
                            <FileText size={12} className="text-[#A3A3A3]" />
                            {title}
                          </span>
                          <Check size={12} className="text-[#526B54]" />
                        </div>
                      ))}
                    </div>
                  )}
                  {i === 2 && (
                    <div className="w-full max-w-[240px] bg-white border border-[#E5E2DB] rounded-2xl p-5 shadow-sm flex flex-col items-center text-center">
                      <div className="w-12 h-12 rounded-full bg-[#EFECE6] flex items-center justify-center text-[#526B54] mb-3">
                        <Users size={20} />
                      </div>
                      <strong className="text-sm font-bold text-[#1C1C1C] mb-1">Let’s bring in your team.</strong>
                      <p className="text-[10px] text-[#737373] mb-4">Conversation context included</p>
                      <span className="inline-flex items-center gap-1.5 text-[10px] font-medium text-[#526B54] bg-[#FCFBF9] border border-[#E5E2DB] px-3 py-1.5 rounded-full">
                        <Check size={12} /> Ready for a human touch
                      </span>
                    </div>
                  )}
                  <span className="absolute bottom-2 right-3 text-[9px] text-[#A3A3A3] uppercase tracking-wider font-semibold">
                    Illustrative
                  </span>
                </Reveal>

                {/* Text Content */}
                <div className="p-8 flex flex-col flex-1">
                  <div className="w-10 h-10 rounded-xl bg-[#EFECE6] text-[#526B54] flex items-center justify-center mb-6">
                    <Icon size={20} />
                  </div>
                  <h3 className="text-xl font-bold text-[#1C1C1C] mb-3">{item.title}</h3>
                  <p className="text-sm text-[#4A4A4A] leading-relaxed">{item.text}</p>
                </div>
              </motion.article>
            )
          })}
        </motion.div>
      </div>
    </section>
  )
}
