import { motion } from 'framer-motion'
import { MessageSquare, ArrowRight } from 'lucide-react'

const SCENARIOS = [
  {
    role: 'Studio & Business',
    address: 'yullo.co/northstarstudio',
    query: '“Do you design websites for early-stage startups?”',
    response: 'Aura presents Northstar Studio’s Startup Sprint Package ($4,500), 4 recent SaaS portfolio projects, and direct calendar booking.',
    color: '#FFDA2D',
  },
  {
    role: 'Enterprise Team',
    address: 'yullo.co/enterprisesolutions',
    query: '“Which service should I choose for a team of 25?”',
    response: 'Aura recommends Team Growth Plan, calculates bulk seating discount, and triggers an instant custom quote.',
    color: '#4CD8FF',
  },
  {
    role: 'Consultant & Advisor',
    address: 'yullo.co/advisor',
    query: '“Can I work with you next month?”',
    response: 'Aura checks live calendar availability, shares engagement requirements, and accepts preliminary scope notes.',
    color: '#6695FF',
  },
  {
    role: 'Creator & Founder',
    address: 'yullo.co/creator',
    query: '“Which of your projects would be relevant for an AI startup?”',
    response: 'Aura filters creator portfolio to highlight 3 AI-native UI case studies and tech stack breakdowns.',
    color: '#A98CFF',
  },
  {
    role: 'Community Hub',
    address: 'yullo.co/visionlab',
    query: '“Who here is working on computer vision?”',
    response: 'Aura surfaces 5 active lab members, recent OpenCV repos, and upcoming community sprint dates.',
    color: '#4CD8FF',
  },
]

export function YulloUseCases() {
  return (
    <section id="businesses" className="py-24 px-6 relative z-20 max-w-6xl mx-auto border-t border-slate-200/80">
      <div className="text-center mb-16">
        <h2 className="text-3xl sm:text-5xl font-bold text-[#101828] tracking-tight">
          Real scenarios. Instant clarity.
        </h2>
        <p className="mt-4 text-base sm:text-lg text-slate-600 max-w-2xl mx-auto">
          Whatever visitors ask your Yullo Link, your Aura understands their intent and delivers the exact right next step.
        </p>
      </div>

      {/* Horizontally Scrolling / Grid Cards */}
      <div className="grid md:grid-cols-3 gap-6 max-w-6xl mx-auto">
        {SCENARIOS.map((item, idx) => (
          <motion.div
            key={idx}
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ delay: idx * 0.1 }}
            className="rounded-3xl border border-slate-200/80 bg-white p-7 shadow-sm flex flex-col justify-between hover:shadow-md transition-shadow duration-200"
          >
            <div>
              <div className="flex items-center justify-between pb-4 border-b border-slate-100">
                <span className="text-xs font-semibold uppercase tracking-wider text-slate-400">
                  {item.role}
                </span>
                <span className="text-xs font-mono text-slate-500 font-semibold">{item.address}</span>
              </div>

              <div className="mt-6">
                <div className="flex items-start gap-2.5 text-sm font-semibold text-[#101828] leading-snug">
                  <MessageSquare className="h-4 w-4 text-blue-500 shrink-0 mt-0.5" />
                  <span>{item.query}</span>
                </div>
              </div>

              <div className="mt-4 rounded-2xl bg-slate-50 p-4 text-xs text-slate-600 border border-slate-200/60 leading-relaxed">
                {item.response}
              </div>
            </div>

            <div className="mt-6 pt-4 border-t border-slate-100 flex items-center justify-between text-xs font-semibold text-blue-600">
              <span>Your Aura knows where to guide them</span>
              <ArrowRight className="h-3.5 w-3.5" />
            </div>
          </motion.div>
        ))}
      </div>
    </section>
  )
}
