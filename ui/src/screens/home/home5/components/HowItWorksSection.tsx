import { ArrowRight, BookOpen, Globe, MousePointer2 } from 'lucide-react'
import { setupSteps } from '../content'
import { Reveal, SectionHeading, SignupLink } from './Common'

export function HowItWorksSection() {
  const icons = [MousePointer2, BookOpen, Globe]
  
  return (
    <section className="w-full py-24 bg-[#FCFBF9]" id="how-it-works" tabIndex={-1}>
      <div className="w-full max-w-7xl mx-auto px-6">
        <SectionHeading
          eyebrow="FROM YOUR KNOWLEDGE TO THEIR NEXT ANSWER"
          title="A small setup. A useful new teammate."
        />
        
        <div className="grid grid-cols-1 md:grid-cols-3 gap-12 mt-20 relative">
          {/* Connecting Line (desktop only) */}
          <div className="hidden md:block absolute top-12 left-[15%] right-[15%] h-px bg-[#E5E2DB]" />

          {setupSteps.map((step, i) => {
            const Icon = icons[i] || MousePointer2
            return (
              <article key={step.title} className="relative flex flex-col items-center text-center">
                <div className="flex items-center gap-4 mb-8">
                  <span className="text-[10px] font-bold text-[#A3A3A3] tracking-widest uppercase">Step 0{i + 1}</span>
                  {i < 2 && <ArrowRight size={14} className="text-[#E5E2DB] md:hidden" />}
                </div>
                
                <Reveal className="bg-white border border-[#E5E2DB] w-24 h-24 rounded-3xl flex items-center justify-center text-[#526B54] mb-8 shadow-sm relative z-10">
                  <Icon size={32} strokeWidth={1.5} />
                </Reveal>
                
                <h3 className="text-xl font-bold text-[#1C1C1C] mb-4">{step.title}</h3>
                <p className="text-sm text-[#4A4A4A] leading-relaxed max-w-xs mx-auto">{step.text}</p>
              </article>
            )
          })}
        </div>
        
        <div className="mt-20 flex justify-center">
          <SignupLink placement="how-it-works" />
        </div>
      </div>
    </section>
  )
}
