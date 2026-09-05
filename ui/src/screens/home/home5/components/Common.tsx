import { ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { ArrowRight } from 'lucide-react'
import { motion, useReducedMotion } from 'framer-motion'
import { IMAGES } from '../../../../config/images.config'
import { SIGNUP_URL } from '../content'
import { trackLanding } from '../analytics'
import { revealTransition } from '../motion'

export function Brand() {
  return (
    <Link className="inline-flex items-center gap-2 text-xl font-bold tracking-tight text-[#1C1C1C] hover:opacity-80 transition-opacity" to="/" aria-label="Support247 home">
      <img src={IMAGES.logo} width="32" height="32" alt="" className="rounded-lg" />
      <span>
        support<span className="font-medium text-[#4A4A4A]">247</span>
        <span className="text-[#526B54]">.</span>
      </span>
    </Link>
  )
}

export function SignupLink({
  placement,
  children = 'Create your account',
  className = '',
  plan,
}: {
  placement: string
  children?: ReactNode
  className?: string
  plan?: 'starter' | 'team'
}) {
  return (
    <Link
      to={`${SIGNUP_URL}${plan ? `&plan=${plan}` : ''}`}
      onClick={() => trackLanding('signup_cta_clicked', { placement })}
      className={`inline-flex items-center justify-center gap-2 px-6 py-3 bg-[#526B54] text-white text-sm font-semibold rounded-xl hover:bg-[#4A544A] transition-all shadow-sm hover:shadow-md ${className}`}
    >
      {children}
      <ArrowRight size={17} aria-hidden="true" />
    </Link>
  )
}

export function Reveal({
  children,
  className = '',
}: {
  children: ReactNode
  className?: string
}) {
  const reduced = useReducedMotion()
  return (
    <motion.div
      className={className}
      initial={reduced ? false : { opacity: 0, y: 8 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, amount: 0.15 }}
      transition={revealTransition}
    >
      {children}
    </motion.div>
  )
}

export function SectionHeading({
  eyebrow,
  title,
  description,
}: {
  eyebrow: string
  title: string
  description?: string
}) {
  return (
    <div className="flex flex-col items-center text-center max-w-3xl mx-auto mb-16">
      <p className="text-[10px] tracking-widest uppercase font-semibold text-[#526B54] mb-3">{eyebrow}</p>
      <h2 className="text-3xl md:text-5xl font-bold text-[#1C1C1C] tracking-tight text-balance leading-tight mb-4">{title}</h2>
      {description && <p className="text-lg text-[#4A4A4A] text-balance">{description}</p>}
    </div>
  )
}
