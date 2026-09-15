import { motion } from 'framer-motion'
import { yulloConfig } from '../../../config/yullo'
import { AuthBrandNetwork } from './AuthBrandNetwork'

export function AuthBrandPanel() {
  return (
    <div className="relative flex-1 bg-[#F8FAFD] border-r border-slate-200/60 p-8 md:p-12 lg:p-16 flex flex-col justify-between overflow-hidden">
      {/* Network background layer with primary brand cluster & lower-right secondary cluster */}
      <AuthBrandNetwork />

      {/* Tight Upper-Middle/Center-Left Brand Cluster */}
      <div className="relative z-10 max-w-[440px] my-auto -mt-4 pt-2 pb-6">
        {/* Y Logo - 160–180px size, 28–32px above headline */}
        <motion.div
          initial={{ opacity: 0, y: -8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
          className="mb-7 inline-block"
        >
          <img
            src={yulloConfig.assets.logoTransparent}
            alt="Yullo Brand Logo"
            className="w-[155px] md:w-[170px] lg:w-[180px] h-auto object-contain"
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

        {/* Supporting Copy - 420–440px max width */}
        <motion.p
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.2, ease: [0.16, 1, 0.3, 1] }}
          className="mt-3.5 text-sm md:text-base text-slate-600 font-normal leading-relaxed"
          style={{ fontFamily: 'Instrument Sans, sans-serif' }}
        >
          Step into Yullo and continue building the space people discover, understand and connect with.
        </motion.p>
      </div>

      {/* Bottom Subtle Copyright Notice */}
      <div className="relative z-10 text-[11px] text-slate-400/80 font-mono tracking-wider pb-1">
        © Yullo. All rights reserved.
      </div>
    </div>
  )
}
