import { Link } from 'react-router-dom'
import { Brand } from './Common'

const groups = [
  {
    title: 'Product',
    links: [
      ['How it works', '/#how-it-works'],
      ['Pricing', '/#pricing'],
      ['Create an account', '/app/login?tab=register'],
    ],
  },
  {
    title: 'Company',
    links: [
      ['About us', '/about'],
      ['Contact', '/contact'],
    ],
  },
  {
    title: 'Good to know',
    links: [
      ['Security', '/security'],
      ['Privacy', '/privacy'],
      ['Terms', '/terms'],
    ],
  },
]
export function Footer() {
  return (
    <footer className="w-full bg-[#FCFBF9] pt-20 pb-10 border-t border-[#E5E2DB]">
      <div className="w-full max-w-7xl mx-auto px-6">
        <div className="grid grid-cols-1 md:grid-cols-12 gap-12 lg:gap-24 mb-20">
          <div className="md:col-span-5 lg:col-span-4">
            <Brand />
            <p className="mt-6 text-sm text-[#4A4A4A] leading-relaxed">
              Helpful answers.
              <br />
              More human conversations.
            </p>
          </div>
          <div className="md:col-span-7 lg:col-span-8 grid grid-cols-2 md:grid-cols-3 gap-8">
            {groups.map((group) => (
              <div key={group.title} className="flex flex-col gap-4">
                <h3 className="text-[10px] font-bold tracking-widest uppercase text-[#1C1C1C] mb-2">{group.title}</h3>
                {group.links.map(([label, href]) => (
                  <Link key={href} to={href} className="text-sm text-[#737373] hover:text-[#526B54] transition-colors">
                    {label}
                  </Link>
                ))}
              </div>
            ))}
          </div>
        </div>
        <div className="pt-8 border-t border-[#E5E2DB] flex flex-col md:flex-row items-center justify-between gap-4 text-xs font-medium text-[#A3A3A3]">
          <span>© {new Date().getFullYear()} Support247</span>
          <span>Built for the people on both sides of the conversation.</span>
        </div>
      </div>
    </footer>
  )
}
