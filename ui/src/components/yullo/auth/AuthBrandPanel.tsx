import { motion } from 'framer-motion'
import { yulloConfig } from '../../../config/yullo'
import { AuthBrandNetwork } from './AuthBrandNetwork'

export function AuthBrandPanel() {
  return (
    <div className="relative flex-1 bg-[#F8FAFD] border-r border-slate-200/60 p-8 md:p-12 lg:p-16 flex flex-col justify-between overflow-hidden">
      {/* Network background layer */}
      <AuthBrandNetwork />

      {/* Top spacing helper */}
      <div className="relative z-10 h-2 pointer-events-none" />

      {/* Unified Center Brand Block (Elevated 20–30px, Logo shifted right/up, Headline 10-15% smaller) */}
      <div className="relative z-10 max-w-[380px] my-auto -mt-6 py-4">
        {/* Y Logo - Shifted slightly right/up inside network cluster, 24px above headline */}
        <motion.div
          initial={{ opacity: 0, y: -8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
          className="mb-9 ml-1.5 inline-block"
        >
          <img
            src={yulloConfig.assets.logoTransparent}
            alt="Yullo Brand Logo"
            className="w-[108px] md:w-[122px] h-auto object-contain opacity-95"
          />
        </motion.div>

        {/* Headline - 10–15% smaller & slightly lighter weight to support Auth title */}
        <motion.h1
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.1, ease: [0.16, 1, 0.3, 1] }}
          className="text-xl md:text-2xl lg:text-[28px] font-semibold text-[#0B1220] tracking-tight leading-[1.18]"
          style={{ fontFamily: 'Satoshi, sans-serif' }}
        >
          Your place starts here.
        </motion.h1>

        {/* Supporting Copy - Tightly wrapped line length */}
        <motion.p
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.2, ease: [0.16, 1, 0.3, 1] }}
          className="mt-2.5 text-sm md:text-[15px] text-slate-600 font-normal leading-relaxed"
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
