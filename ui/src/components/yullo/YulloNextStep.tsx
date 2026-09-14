import { motion } from 'framer-motion'
import { ArrowRight } from 'lucide-react'

import { yulloConfig } from '../../config/yullo'

const LINKS = ['Website', 'Store', 'Instagram', 'Portfolio', 'Book', 'Contact', 'Products', 'LinkedIn']

export function YulloNextStep() {
  return (
    <section className="py-16 px-6 relative z-20 max-w-4xl mx-auto text-center border-t border-slate-200/50 my-4">
      <motion.h2
        initial={{ opacity: 0, y: 24 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true }}
        transition={{ delay: 0.1 }}
        className={`text-4xl sm:text-6xl md:text-7xl font-extrabold text-[#101828] tracking-tight leading-[1.1] ${yulloConfig.typography.headingClass}`}
      >
        The internet is<br />
        changing quietly.
      </motion.h2>

      <motion.p
        initial={{ opacity: 0, y: 24 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true }}
        transition={{ delay: 0.2 }}
        className="mt-8 text-xl sm:text-2xl text-[#101828] max-w-2xl mx-auto leading-relaxed font-medium"
      >
        People are beginning to expect more than somewhere to land. They expect somewhere that understands why they came.
      </motion.p>
    </section>
  )
}
