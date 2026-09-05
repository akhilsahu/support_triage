import { MessageCircle } from 'lucide-react'
import { SignupLink } from './Common'
import { AnimatedBackground } from './AnimatedBackground'

export function FinalCTABanner() {
  return (
    <section className="w-full py-24 bg-white">
      <div className="w-full max-w-5xl mx-auto px-6">
        <div className="isolate bg-[#FCFBF9] border border-[#E5E2DB] rounded-[3rem] p-12 md:p-20 flex flex-col items-center text-center shadow-sm relative overflow-hidden">
          <AnimatedBackground variant="cta" />
          <div className="w-20 h-20 rounded-full bg-[#EFECE6] flex items-center justify-center text-[#526B54] mb-8 shadow-sm">
            <MessageCircle size={32} />
          </div>
          
          <p className="text-[10px] tracking-widest uppercase font-bold text-[#526B54] mb-4">
            MAKE YOUR NEXT CONVERSATION A LITTLE EASIER
          </p>
          
          <h2 className="text-4xl md:text-5xl font-bold text-[#1C1C1C] tracking-tight leading-tight text-balance mb-6">
            Your knowledge has<br />more people to help.
          </h2>
          
          <p className="text-lg text-[#4A4A4A] mb-10 max-w-lg">
            Give it a home. Let your customers find their answers instantly.
          </p>
          
          <SignupLink placement="final" className="mb-6 px-8 py-4 text-base shadow-md" />
          
          <span className="text-xs text-[#737373] font-medium">
            Create your workspace, verify your email, then add your content.
          </span>
        </div>
      </div>
    </section>
  )
}
