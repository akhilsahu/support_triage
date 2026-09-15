import { motion } from 'framer-motion'
import { yulloConfig } from '../../../config/yullo'
import { AuthBrandNetwork } from './AuthBrandNetwork'

export function AuthBrandPanel() {
  return (
    <div className="relative flex-1 bg-[#F8FAFD] border-r border-slate-200/60 p-8 md:p-12 lg:p-16 flex flex-col justify-between overflow-hidden">
      {/* Network background layer */}
      <AuthBrandNetwork />

      {/* Empty top spacing helper */}
      <div className="relative z-10 h-4 pointer-events-none" />

      {/* Unified Center Brand Block (Logo + Copy grouped together) */}
      <div className="relative z-10 max-w-[420px] my-auto py-6">
        {/* Y Logo - 40–50px above headline */}
        <motion.div
          initial={{ opacity: 0, y: -8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
          className="mb-10 inline-block"
        >
          <img
            src={yulloConfig.assets.logoTransparent}
            alt="Yullo Brand Logo"
            className="w-[115px] md:w-[130px] h-auto object-contain opacity-95"
          />
        </motion.div>

        {/* Headline */}
        <motion.h1
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.1, ease: [0.16, 1, 0.3, 1] }}
          className="text-2xl md:text-3xl lg:text-[34px] font-bold text-[#0B1220] tracking-tight leading-[1.15]"
          style={{ fontFamily: 'Satoshi, sans-serif' }}
        >
          Your place starts here.
        </motion.h1>

        {/* Supporting Copy */}
        <motion.p
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.2, ease: [0.16, 1, 0.3, 1] }}
          className="mt-3.5 text-sm md:text-base text-slate-600 font-normal leading-relaxed"
          style={{ fontFamily: 'Instrument Sans, sans-serif' }}
        >
          Step into Yullo and continue building the space people discover, understand and connect with.
        </motion.p>
      </div>

      {/* Bottom Subtle Brand Accent */}
      <div className="relative z-10 text-[11px] text-slate-400 font-mono tracking-wider">
        © Yullo. All rights reserved.
      </div>
    </div>
  )
}
