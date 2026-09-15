import { motion } from 'framer-motion'
import { yulloConfig } from '../../../config/yullo'
import { AuthBrandNetwork } from './AuthBrandNetwork'

export function AuthBrandPanel() {
  return (
    <div className="relative flex-1 bg-[#F8FAFD] border-r border-slate-200/60 p-8 md:p-12 lg:p-16 flex flex-col justify-between overflow-hidden">
      {/* Network background layer */}
      <AuthBrandNetwork />

      {/* Top Header / Logo */}
      <div className="relative z-10">
        <motion.div
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
          className="inline-block"
        >
          <img
            src={yulloConfig.assets.logoTransparent}
            alt="Yullo Brand Logo"
            className="w-[140px] md:w-[160px] lg:w-[175px] h-auto object-contain"
            style={{
              filter: 'drop-shadow(0 8px 28px rgba(255, 218, 45, 0.14))',
            }}
          />
        </motion.div>
      </div>

      {/* Center Atmospheric Copy */}
      <div className="relative z-10 max-w-md my-auto py-12">
        <motion.h1
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.7, delay: 0.1, ease: [0.16, 1, 0.3, 1] }}
          className="text-3xl md:text-4xl lg:text-[42px] font-bold text-[#0B1220] tracking-tight leading-[1.08]"
          style={{ fontFamily: 'Satoshi, sans-serif' }}
        >
          Your place starts here.
        </motion.h1>

        <motion.p
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.7, delay: 0.2, ease: [0.16, 1, 0.3, 1] }}
          className="mt-4 text-base md:text-lg text-slate-600 font-normal leading-relaxed"
          style={{ fontFamily: 'Instrument Sans, sans-serif' }}
        >
          Step into Yullo and continue building the space people discover, understand and connect with.
        </motion.p>
      </div>

      {/* Bottom Subtle Brand Accent */}
      <div className="relative z-10 text-xs text-slate-400 font-mono tracking-wider">
        © Yullo. All rights reserved.
      </div>
    </div>
  )
}
