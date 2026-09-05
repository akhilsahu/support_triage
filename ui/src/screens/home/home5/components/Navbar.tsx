import { useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { Menu, X } from 'lucide-react'
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion'
import {
  FocusScope,
  OverlayContainer,
  useDialog,
  useModalOverlay,
} from 'react-aria'
import { Brand, SignupLink } from './Common'
import { transition } from '../motion'

const links = [
  { label: 'Product', to: '/#product' },
  { label: 'How it works', to: '/#how-it-works' },
  { label: 'Integrations', to: '/#integrations' },
  { label: 'Pricing', to: '/#pricing' },
  { label: 'FAQ', to: '/#faq' },
]

function MobileMenu({ close }: { close: () => void }) {
  const ref = useRef<HTMLDivElement>(null)
  const reduced = useReducedMotion()
  const state = {
    isOpen: true,
    setOpen: (open: boolean) => {
      if (!open) close()
    },
    open: () => {},
    close,
    toggle: close,
    point: null,
    setPoint: () => {},
  }
  const { modalProps, underlayProps } = useModalOverlay(
    { isDismissable: true },
    state,
    ref
  )
  const { dialogProps, titleProps } = useDialog(
    { 'aria-label': 'Navigation' },
    ref
  )
  return (
    <OverlayContainer>
      <div className="fixed inset-0 z-50 flex justify-end bg-black/20 backdrop-blur-sm" {...underlayProps}>
        <FocusScope contain restoreFocus autoFocus>
          <motion.div
            initial={reduced ? false : { opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: 20 }}
            transition={transition}
            className="w-full max-w-sm"
          >
            <div
              {...modalProps}
              {...dialogProps}
              ref={ref}
              className="h-full bg-white shadow-2xl flex flex-col p-6"
            >
              <div className="flex items-center justify-between mb-8">
                <h2 {...titleProps} className="text-lg font-bold text-[#1C1C1C]">Explore</h2>
                <button
                  onClick={close}
                  className="w-10 h-10 flex items-center justify-center rounded-full bg-[#F2EFEB] text-[#1C1C1C] hover:bg-[#E5E2DB] transition-colors"
                  aria-label="Close navigation"
                >
                  <X size={20} />
                </button>
              </div>
              <nav aria-label="Mobile" className="flex flex-col gap-4">
                {links.map((link) => (
                  <Link key={link.to} to={link.to} onClick={close} className="text-xl font-medium text-[#4A4A4A] hover:text-[#526B54] transition-colors">
                    {link.label}
                  </Link>
                ))}
                <div className="h-px w-full bg-[#E5E2DB] my-2" />
                <Link to="/app/login" onClick={close} className="text-xl font-medium text-[#4A4A4A] hover:text-[#526B54] transition-colors">
                  Sign in
                </Link>
              </nav>
              <div onClick={close} className="mt-8">
                <SignupLink placement="mobile-navigation" className="w-full" />
              </div>
            </div>
          </motion.div>
        </FocusScope>
      </div>
    </OverlayContainer>
  )
}

export function Navbar() {
  const [open, setOpen] = useState(false)
  return (
    <header className="sticky top-0 z-40 w-full bg-[#FCFBF9]/90 backdrop-blur-lg border-b border-[#E5E2DB]">
      <div className="w-full max-w-7xl mx-auto px-6 h-20 flex items-center justify-between">
        <Brand />
        <nav className="hidden md:flex items-center gap-8" aria-label="Main">
          {links.map((link) => (
            <Link to={link.to} key={link.to} className="text-sm font-semibold text-[#737373] hover:text-[#1C1C1C] transition-colors">
              {link.label}
            </Link>
          ))}
        </nav>
        <div className="flex items-center gap-6">
          <Link className="hidden md:block text-sm font-semibold text-[#1C1C1C] hover:text-[#526B54] transition-colors" to="/app/login">
            Sign in
          </Link>
          <div className="hidden md:block">
            <SignupLink placement="navigation" />
          </div>
          <button
            onClick={() => setOpen(true)}
            className="md:hidden w-10 h-10 flex items-center justify-center rounded-xl border border-[#E5E2DB] text-[#1C1C1C] hover:bg-[#F2EFEB] transition-colors"
            aria-label="Open navigation"
            aria-expanded={open}
          >
            <Menu size={20} />
          </button>
        </div>
        <AnimatePresence>
          {open && <MobileMenu close={() => setOpen(false)} />}
        </AnimatePresence>
      </div>
    </header>
  )
}
