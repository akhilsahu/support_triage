import { motion } from 'framer-motion'
import { yulloConfig } from '../../../config/yullo'
import { AuthBrandNetwork } from './AuthBrandNetwork'

export function AuthBrandPanel() {
  return (
    <div className="relative w-full min-h-[100dvh] bg-[#F8FAFD] border-r border-slate-200/60 flex flex-col justify-between items-center overflow-hidden">
      {/* Network background layer */}
      <AuthBrandNetwork />

      {/* Top flex spacer */}
      <div className="relative z-10 h-6 shrink-0 pointer-events-none" />

      {/* Compact Brand Block Container */}
      <div
        className="relative z-10 my-auto py-4"
        style={{
          width: 'min(500px, calc(100% - 64px))',
          marginInline: 'clamp(28px, 5vw, 72px)',
          marginTop: 'clamp(0px, 2vh, 28px)',
        }}
      >
        {/* Y Logo - 160–180px size, 24–36px above headline */}
        <motion.div
          initial={{ opacity: 0, y: -8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
          className="mb-7 inline-block"
        >
          <img
            src={yulloConfig.assets.logoTransparent}
            alt="Yullo Brand Logo"
            className="w-[150px] md:w-[165px] lg:w-[175px] h-auto object-contain"
          />
        </motion.div>

        {/* Headline */}
        <motion.h1
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.1, ease: [0.16, 1, 0.3, 1] }}
          className="text-2xl md:text-3xl lg:text-[32px] font-bold text-[#0B1220] tracking-tight leading-[1.14]"
          style={{ fontFamily: 'Satoshi, sans-serif' }}
        >
          Your place starts here.
        </motion.h1>

        {/* Supporting Copy - 10–14px under headline */}
        <motion.p
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.2, ease: [0.16, 1, 0.3, 1] }}
          className="mt-3 text-sm md:text-base text-slate-600 font-normal leading-relaxed"
          style={{ fontFamily: 'Instrument Sans, sans-serif' }}
        >
          Step into Yullo and continue building the space people discover, understand and connect with.
        </motion.p>
      </div>

      {/* Bottom Subtle Copyright Notice */}
      <div className="relative z-10 w-full text-center text-[11px] text-slate-400/80 font-mono tracking-wider pb-3 shrink-0">
        © Yullo. All rights reserved.
      </div>
    </div>
  )
}
