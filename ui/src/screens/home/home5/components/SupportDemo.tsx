import { useRef } from 'react'
import {
  AnimatePresence,
  motion,
  useInView,
  useReducedMotion,
} from 'framer-motion'
import {
  ArrowUpRight,
  BookOpen,
  Check,
  ChevronRight,
  Headphones,
  Leaf,
  MessageCircle,
  Pause,
  Play,
  RotateCcw,
  Users,
} from 'lucide-react'
import { scenarios } from '../content'
import { useDemoSequence } from '../useDemoSequence'
import { transition } from '../motion'
import { SignupLink } from './Common'

export function SupportDemo() {
  const ref = useRef<HTMLDivElement>(null)
  const visible = useInView(ref, { amount: 0.1 })
  const reduced = !!useReducedMotion()
  const { scenario, scenarioIndex, step, status, start, pause, resume } =
    useDemoSequence(reduced, visible)
  const enter = reduced ? false : { opacity: 0, y: 8 }

  return (
    <div className="w-full flex flex-col items-center" ref={ref} id="demo">
      {/* Demo Shell */}
      <div className="w-full bg-[#1C1C1C] rounded-3xl p-4 md:p-6 shadow-2xl relative border border-[#2A2A2A]">
        
        {/* Scenario Tabs */}
        <div className="flex gap-2 mb-6 overflow-x-auto pb-2 scrollbar-hide" role="group" aria-label="Sample conversations">
          {scenarios.map((item, i) => (
            <button
              id={`h5-scenario-${i}`}
              key={item.id}
              onClick={() => start(i)}
              aria-label={item.label}
              aria-pressed={scenarioIndex === i}
              className={`flex-1 min-w-[120px] flex items-center gap-3 p-3 rounded-xl border text-left text-sm transition-all
                ${scenarioIndex === i 
                  ? 'bg-[#FCFBF9] text-[#1C1C1C] border-transparent shadow-sm' 
                  : 'bg-transparent border-[#3A3A3A] text-[#A3A3A3] hover:bg-[#2A2A2A] hover:text-[#FCFBF9]'
                }`}
            >
              <span className={`text-xs ${scenarioIndex === i ? 'text-[#526B54]' : 'opacity-60'}`}>0{i + 1}</span>
              <span className="font-medium whitespace-nowrap">{item.shortLabel}</span>
            </button>
          ))}
        </div>

        {/* Chat Window */}
        <div className="bg-[#FCFBF9] rounded-2xl overflow-hidden shadow-inner flex flex-col">
          {/* Chat Header */}
          <div className="px-5 py-4 border-b border-[#E5E2DB] flex items-center gap-4 bg-white/50 backdrop-blur-md">
            <div className="w-10 h-10 rounded-full bg-[#EFECE6] text-[#526B54] flex items-center justify-center shrink-0">
              <Leaf size={20} />
            </div>
            <div className="flex flex-col">
              <strong className="font-serif text-lg text-[#1C1C1C] font-medium leading-tight">fern & field</strong>
              <span className="text-xs text-[#737373]">Customer care · sample shop</span>
            </div>
            <MessageCircle size={20} className="ml-auto text-[#A3A3A3]" />
          </div>

          {/* Chat Content */}
          <div className="px-5 py-6 min-h-[380px] flex flex-col bg-[#FCFBF9]">
            <div className="text-[10px] tracking-widest uppercase text-center text-[#A3A3A3] mb-6 font-medium">
              A little help, right when you need it
            </div>
            
            <AnimatePresence mode="wait" initial={false}>
              <motion.div
                key={scenario.id}
                initial={enter}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }}
                transition={transition}
                className="flex flex-col flex-1"
              >
                {/* Customer Message */}
                <div className="self-end bg-[#526B54] text-white text-sm px-4 py-3 rounded-2xl rounded-tr-sm max-w-[85%] shadow-sm mb-6">
                  {scenario.question}
                </div>

                <div className="flex items-center gap-2 text-xs text-[#737373] mb-2 ml-1">
                  <div className="w-6 h-6 rounded-full bg-[#E5E2DB] flex items-center justify-center">
                    <Headphones size={12} className="text-[#4A4A4A]" />
                  </div>
                  Fern & Field assistant
                </div>

                {/* Agent Response */}
                {step >= 1 ? (
                  <motion.div
                    initial={enter}
                    animate={{ opacity: 1, y: 0 }}
                    transition={transition}
                    className="self-start bg-white border border-[#E5E2DB] text-[#1C1C1C] text-sm px-4 py-3 rounded-2xl rounded-tl-sm max-w-[90%] shadow-sm leading-relaxed"
                  >
                    {scenario.answer}
                  </motion.div>
                ) : (
                  <div className="self-start bg-white border border-[#E5E2DB] text-[#737373] text-sm px-4 py-3 rounded-2xl rounded-tl-sm shadow-sm flex items-center gap-2" role="status">
                    Preparing response <span className="animate-pulse">•••</span>
                  </div>
                )}

                {/* Source Citation */}
                {step >= 2 && (
                  <motion.div
                    initial={enter}
                    animate={{ opacity: 1, y: 0 }}
                    transition={transition}
                    className="self-start mt-3 bg-[#EFECE6] border border-[#E5E2DB] rounded-xl p-3 max-w-[85%] text-[#4A4A4A]"
                  >
                    <div className="flex items-center gap-2 text-xs font-semibold mb-1 text-[#526B54]">
                      {scenario.id === 'handoff' ? <Users size={14} /> : <BookOpen size={14} />}
                      {scenario.source}
                    </div>
                    <p className="text-xs italic leading-relaxed">"{scenario.excerpt}"</p>
                  </motion.div>
                )}

                {/* Resolution Result */}
                {step >= 3 && (
                  <div className="mt-auto pt-6 flex items-center gap-2 text-xs font-medium text-[#526B54]">
                    <Check size={16} />
                    {scenario.result}
                  </div>
                )}
              </motion.div>
            </AnimatePresence>
          </div>

          {/* Demo Controls */}
          <div className="px-5 py-3 border-t border-[#E5E2DB] bg-white flex items-center justify-between">
            <span className="text-xs font-medium text-[#737373]">Sample conversation</span>
            <div className="flex items-center gap-2">
              {status === 'playing' ? (
                <button onClick={pause} className="flex items-center gap-1.5 text-xs font-semibold text-[#1C1C1C] hover:text-[#526B54] transition-colors">
                  <Pause size={14} /> Pause
                </button>
              ) : status === 'paused' ? (
                <button onClick={resume} className="flex items-center gap-1.5 text-xs font-semibold text-[#1C1C1C] hover:text-[#526B54] transition-colors">
                  <Play size={14} /> Resume
                </button>
              ) : (
                <button onClick={() => start(scenarioIndex)} className="flex items-center gap-1.5 text-xs font-semibold text-[#1C1C1C] hover:text-[#526B54] transition-colors">
                  <RotateCcw size={14} /> Replay
                </button>
              )}
            </div>
          </div>
        </div>

        {/* Demo Caption / Bottom Actions */}
        <div className="mt-4 flex flex-col md:flex-row items-center justify-between gap-4 px-2">
          <div className="flex items-center gap-2 text-sm text-[#E5E2DB]">
            <Check size={16} className="text-[#526B54]" />
            {scenario.detail}
          </div>
          {status === 'complete' ? (
            <SignupLink placement="demo" className="text-xs py-2 px-4 bg-white text-[#1C1C1C] rounded-lg font-semibold hover:bg-[#F2EFEB] transition-colors" />
          ) : (
            <span className="text-xs text-[#A3A3A3] flex items-center gap-1">
              Choose an example above <ChevronRight size={14} />
            </span>
          )}
        </div>
      </div>
      
      <p className="mt-6 text-xs text-[#737373]">
        Fictional shop, sample content. See how a support conversation can work.
      </p>
      <span className="sr-only" role="status">
        {status === 'complete'
          ? `${scenario.result}. ${scenario.answer}`
          : status === 'paused'
            ? 'Example paused. Select Resume to continue.'
            : ''}
      </span>
    </div>
  )
}
