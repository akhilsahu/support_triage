import { Link } from 'react-router-dom'
import { yulloConfig } from '../../config/yullo'

export function YulloFooter() {
  return (
    <footer className="bg-[#F9FBFF] border-t border-slate-200/80 pt-16 pb-12 px-6 relative z-10 text-slate-600">
      <div className="max-w-7xl mx-auto grid grid-cols-2 md:grid-cols-5 gap-10 pb-12 border-b border-slate-200/60">
        {/* Brand Col */}
        <div className="col-span-2">
          <Link to="/yullo" className="flex items-center gap-3">
            <img
              src={yulloConfig.assets.logo}
              alt="Yullo Logo"
              className="h-8 w-auto object-contain"
            />
            <span className="font-extrabold tracking-tight text-[#101828] text-base">
              YULLO.CO
            </span>
          </Link>
          <p className="mt-3 text-xs text-slate-500 max-w-sm leading-relaxed">
            A more connected tomorrow. Claim your Link, build your Aura, and become part of an intelligent internet.
          </p>
        </div>

        {/* Product Col */}
        <div>
          <div className="text-xs font-bold text-[#101828] uppercase tracking-wider mb-4">Product</div>
          <ul className="space-y-2.5 text-xs">
            <li><a href="#aura" className="hover:text-[#101828] transition-colors">Aura</a></li>
            <li><a href="#network" className="hover:text-[#101828] transition-colors">Network</a></li>
            <li><a href="#businesses" className="hover:text-[#101828] transition-colors">Businesses</a></li>
            <li><a href="#how-it-works" className="hover:text-[#101828] transition-colors">Creators</a></li>
          </ul>
        </div>

        {/* Company Col */}
        <div>
          <div className="text-xs font-bold text-[#101828] uppercase tracking-wider mb-4">Company</div>
          <ul className="space-y-2.5 text-xs">
            <li><Link to="/about" className="hover:text-[#101828] transition-colors">About</Link></li>
            <li><Link to="/what-we-do" className="hover:text-[#101828] transition-colors">Manifesto</Link></li>
            <li><Link to="/contact" className="hover:text-[#101828] transition-colors">Contact</Link></li>
          </ul>
        </div>

        {/* Legal & Socials */}
        <div>
          <div className="text-xs font-bold text-[#101828] uppercase tracking-wider mb-4">Legal & Social</div>
          <ul className="space-y-2.5 text-xs">
            <li><Link to="/privacy" className="hover:text-[#101828] transition-colors">Privacy Policy</Link></li>
            <li><Link to="/terms" className="hover:text-[#101828] transition-colors">Terms of Service</Link></li>
            <li className="pt-2 flex items-center gap-3 font-semibold text-slate-700">
              <a href="https://x.com" target="_blank" rel="noreferrer" className="hover:text-[#101828]">X</a>
              <a href="https://instagram.com" target="_blank" rel="noreferrer" className="hover:text-[#101828]">Instagram</a>
              <a href="https://linkedin.com" target="_blank" rel="noreferrer" className="hover:text-[#101828]">LinkedIn</a>
            </li>
          </ul>
        </div>
      </div>

      {/* Bottom Copyright */}
      <div className="max-w-7xl mx-auto pt-8 flex flex-col sm:flex-row items-center justify-between text-xs text-slate-400 gap-4">
        <div>© 2026 Yullo. All rights reserved.</div>
        <div className="font-mono text-[11px]">yullo.co · intelligent space network</div>
      </div>
    </footer>
  )
}
