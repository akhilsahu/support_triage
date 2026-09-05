import { motion } from 'framer-motion'
import { SectionHeading } from './Common'

// --- Integration data matching seed_integrations.py ---
const INTEGRATIONS = [
  {
    slug: 'shopify',
    name: 'Shopify',
    status: 'live' as const,
    description: 'Connect your Shopify store. AI answers order status questions, tracks deliveries, and pulls real customer data automatically.',
    capabilities: ['Order lookups (WISMO)', 'Customer profiles', 'Product info', 'Refund status'],
    icon: (
      <svg viewBox="0 0 109 124" className="w-full h-full" fill="none" xmlns="http://www.w3.org/2000/svg">
        <path d="M95.4 23.8s-.2-1.3-1.2-1.6c-1-.3-2.5-.1-2.5-.1s-1.7-1.7-2.3-2.3c-.6-.6-1.8-.4-2.2-.3l-.9 2.7c-.3 0-.7.1-1 .1-1.6.1-3.4.5-5.1 1.4L78 21.6c-.6-3.3-2.9-4.9-5.6-4.9-2.6 0-5.3 1.7-7.5 4.6-.1 0-.1.1-.2.1-1.5-.5-3-.8-4.4-.8-5.1 0-7.5 3.8-8.3 7.7-1.8.2-3.5.8-5 1.9l-1.4.9c-.4.2-.9.5-1.3.8L42.7 32c-.3.2-.7.4-1 .7-2.4 1.7-4 4.3-4 7.3 0 4.7 3.2 9.7 9.1 9.7 1.1 0 2.2-.2 3.2-.5l.1.3c.7 2.1 1.9 3.9 3.4 5.3l-10.8 32.1H30.1L14.4 124h79.3l-6.9-63c.1-.1.5-.4.6-.6.4-.6.6-1.2.6-1.8v-6.9c0-.5-.2-1-.4-1.4l3.9-11.6c.4-1.1.3-2.3-.2-3.2-.4-.8-1-1.5-1.9-1.9z" fill="#95BF47"/>
        <path d="M95.4 23.8s-.2-1.3-1.2-1.6c-1-.3-2.5-.1-2.5-.1s-1.7-1.7-2.3-2.3c-.6-.6-1.8-.4-2.2-.3l-.9 2.7c-.3 0-.7.1-1 .1V124h9.5L88.4 60.6c0-.5-.2-1-.4-1.4l3.9-11.6c.4-1.1.3-2.3-.2-3.2-.4-.8-1-1.5-1.9-1.9z" fill="#5E8E3E"/>
        <path d="M72 21.6c-.6-3.3-2.9-4.9-5.6-4.9-2.6 0-5.3 1.7-7.5 4.6 3.5 1.1 6.7 3.2 9.2 6.3L72 21.6z" fill="#FEFEFE"/>
      </svg>
    ),
    color: 'bg-[#95BF47]/10 border-[#95BF47]/20',
    badge: 'bg-[#95BF47]/10 text-[#4a7a1e]',
  },
  {
    slug: 'stripe',
    name: 'Stripe',
    status: 'coming_soon' as const,
    description: 'Let AI handle subscription questions, payment failure alerts, and invoice lookups without your team lifting a finger.',
    capabilities: ['Subscription status', 'Invoice history', 'Payment failures', 'Refund requests'],
    icon: (
      <svg viewBox="0 0 60 60" className="w-full h-full" fill="none" xmlns="http://www.w3.org/2000/svg">
        <circle cx="30" cy="30" r="30" fill="#635BFF"/>
        <path d="M28.2 22.4c0-1.3 1.1-1.8 2.8-1.8 2.5 0 5.7.8 8.1 2.1v-7.6c-2.7-1.1-5.4-1.5-8.1-1.5-6.6 0-11 3.5-11 9.3 0 9.1 12.5 7.6 12.5 11.5 0 1.5-1.3 2-3.1 2-2.7 0-6.2-1.1-8.9-2.6v7.7c3 1.3 6.1 1.8 8.9 1.8 6.8 0 11.5-3.4 11.5-9.2-.1-9.8-12.7-8-12.7-11.7z" fill="white"/>
      </svg>
    ),
    color: 'bg-[#635BFF]/10 border-[#635BFF]/20',
    badge: 'bg-[#635BFF]/10 text-[#635BFF]',
  },
  {
    slug: 'whatsapp',
    name: 'WhatsApp',
    status: 'coming_soon' as const,
    description: 'Bring your AI support bot to WhatsApp Business. Meet customers on the channel they already use every day.',
    capabilities: ['WhatsApp Business API', 'Automated replies', 'Handoff to agents', 'Rich media'],
    icon: (
      <svg viewBox="0 0 60 60" className="w-full h-full" fill="none" xmlns="http://www.w3.org/2000/svg">
        <circle cx="30" cy="30" r="30" fill="#25D366"/>
        <path d="M30 14.5C21.4 14.5 14.5 21.4 14.5 30c0 2.7.7 5.3 2 7.6L13.5 46.5l9.2-2.9c2.1 1.2 4.5 1.9 7.1 1.9C38.4 45.5 45.5 38.6 45.5 30S38.6 14.5 30 14.5zm0 28c-2.3 0-4.5-.6-6.4-1.8l-.5-.3-5.4 1.7 1.8-5.2-.3-.5c-1.3-2-2-4.3-2-6.7 0-7.1 5.7-12.8 12.8-12.8S42.8 22.9 42.8 30 37.1 42.5 30 42.5zm7-9.6c-.4-.2-2.3-1.1-2.6-1.2-.4-.1-.7-.2-.9.2-.3.4-1 1.2-1.3 1.5-.2.3-.5.3-.9.1-.4-.2-1.6-.6-3-1.9-1.1-1-1.9-2.2-2.1-2.6-.2-.4 0-.6.2-.8.2-.2.4-.5.6-.7.2-.2.3-.4.4-.6.1-.2 0-.5 0-.7 0-.2-.9-2.2-1.3-3-.3-.8-.7-.7-.9-.7h-.8c-.3 0-.7.1-1 .5-.4.4-1.4 1.4-1.4 3.4s1.5 3.9 1.7 4.2c.2.3 2.9 4.4 7 6.2 1 .4 1.8.6 2.4.8.9.3 1.8.3 2.5.2.8-.1 2.3-.9 2.7-1.8.3-.9.3-1.7.2-1.9-.1-.2-.5-.3-.9-.5z" fill="white"/>
      </svg>
    ),
    color: 'bg-[#25D366]/10 border-[#25D366]/20',
    badge: 'bg-[#25D366]/10 text-[#128C52]',
  },
  {
    slug: 'zendesk',
    name: 'Zendesk',
    status: 'coming_soon' as const,
    description: 'Sync tickets and conversations bidirectionally. AI handles the first touch; agents see full context when they step in.',
    capabilities: ['Ticket sync', 'Agent handoff', 'Customer history', 'CSAT data'],
    icon: (
      <svg viewBox="0 0 60 60" className="w-full h-full" fill="none" xmlns="http://www.w3.org/2000/svg">
        <circle cx="30" cy="30" r="30" fill="#03363D"/>
        <path d="M30 16C22.3 16 16 22.3 16 30s6.3 14 14 14 14-6.3 14-14-6.3-14-14-14zm-4 20l8-8v8H26zm8-12l-8 8v-8h8z" fill="#FEFEFE"/>
      </svg>
    ),
    color: 'bg-[#03363D]/10 border-[#03363D]/20',
    badge: 'bg-[#03363D]/10 text-[#03363D]',
  },
  {
    slug: 'slack',
    name: 'Slack',
    status: 'coming_soon' as const,
    description: 'Get real-time Slack alerts when a ticket escalates, CSAT drops, or a VIP customer needs attention.',
    capabilities: ['Escalation alerts', 'Team notifications', 'CSAT alerts', 'Daily digest'],
    icon: (
      <svg viewBox="0 0 60 60" className="w-full h-full" fill="none" xmlns="http://www.w3.org/2000/svg">
        <circle cx="30" cy="30" r="30" fill="#4A154B"/>
        <path d="M24 18a3 3 0 1 0 0 6h3v-3a3 3 0 0 0-3-3zM24 25h-6a3 3 0 1 0 0 6h6v-6zM36 25a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM36 25v6h6a3 3 0 1 0 0-6h-6zM33 37a3 3 0 1 0 6 0v-3h-3a3 3 0 0 0-3 3zM33 37H27a3 3 0 1 0 0 6h6v-6zM21 37a3 3 0 1 0 0 6 3 3 0 0 0 0-6zM21 37v-6h-6a3 3 0 1 0 0 6h6z" fill="#E9D1FB" opacity=".7"/>
        <path d="M24 18a3 3 0 0 1 3 3v3h-3a3 3 0 0 1 0-6zM18 28a3 3 0 0 1 6 0v6h-6a3 3 0 0 1 0-6zM36 18a3 3 0 0 0-3 3v3h3a3 3 0 0 0 0-6zM42 28a3 3 0 0 0-6 0v6h6a3 3 0 0 0 0-6zM33 37a3 3 0 0 1 3 3v3h-3a3 3 0 0 1 0-6zM27 43a3 3 0 0 1-6 0v-6h6v6zM21 37a3 3 0 0 0 3 3v3h-3a3 3 0 0 0 0-6zM27 31a3 3 0 0 0 6 0v-6h-6v6z" fill="white"/>
      </svg>
    ),
    color: 'bg-[#4A154B]/10 border-[#4A154B]/20',
    badge: 'bg-[#4A154B]/10 text-[#4A154B]',
  },
  {
    slug: 'woocommerce',
    name: 'WooCommerce',
    status: 'coming_soon' as const,
    description: 'Plug your WordPress store in and give customers the same intelligent self-service your Shopify merchants already enjoy.',
    capabilities: ['Order status', 'Returns', 'Product queries', 'Shipping info'],
    icon: (
      <svg viewBox="0 0 60 60" className="w-full h-full" fill="none" xmlns="http://www.w3.org/2000/svg">
        <circle cx="30" cy="30" r="30" fill="#7F54B3"/>
        <path d="M15 21h30v18H15z" fill="#9B6DBF" rx="4"/>
        <text x="30" y="34" textAnchor="middle" fill="white" fontSize="10" fontWeight="bold" fontFamily="monospace">Woo</text>
      </svg>
    ),
    color: 'bg-[#7F54B3]/10 border-[#7F54B3]/20',
    badge: 'bg-[#7F54B3]/10 text-[#7F54B3]',
  },
  {
    slug: 'webhooks',
    name: 'Custom Webhooks',
    status: 'coming_soon' as const,
    description: 'Send live events to any endpoint you control. Pipe escalations, ticket closures, and CSAT scores into your own systems.',
    capabilities: ['Event-driven', 'Custom payloads', 'Retry logic', 'HMAC signing'],
    icon: (
      <svg viewBox="0 0 60 60" className="w-full h-full" fill="none" xmlns="http://www.w3.org/2000/svg">
        <circle cx="30" cy="30" r="30" fill="#1C1C1C"/>
        <path d="M20 30c0-5.5 4.5-10 10-10s10 4.5 10 10M30 20v-4M30 44v-4M20 30h-4M44 30h-4" stroke="white" strokeWidth="2" strokeLinecap="round"/>
        <circle cx="30" cy="30" r="4" fill="white"/>
        <circle cx="30" cy="16" r="2.5" fill="#526B54"/>
        <circle cx="30" cy="44" r="2.5" fill="#526B54"/>
        <circle cx="16" cy="30" r="2.5" fill="#D97706"/>
        <circle cx="44" cy="30" r="2.5" fill="#D97706"/>
      </svg>
    ),
    color: 'bg-[#1C1C1C]/5 border-[#1C1C1C]/10',
    badge: 'bg-[#1C1C1C]/5 text-[#1C1C1C]',
  },
  {
    slug: 'discord',
    name: 'Discord',
    status: 'coming_soon' as const,
    description: 'Connect your community Discord server. Automate moderation replies and funnel support into your team inbox.',
    capabilities: ['Server integration', 'Channel routing', 'Auto-replies', 'Moderation'],
    icon: (
      <svg viewBox="0 0 60 60" className="w-full h-full" fill="none" xmlns="http://www.w3.org/2000/svg">
        <circle cx="30" cy="30" r="30" fill="#5865F2"/>
        <path d="M41.2 20.2a27.8 27.8 0 0 0-6.9-2.2.1.1 0 0 0-.1.1c-.3.6-.6 1.3-.9 1.9a25.6 25.6 0 0 0-7.7 0 19.6 19.6 0 0 0-.9-1.9.1.1 0 0 0-.1-.1 27.7 27.7 0 0 0-6.9 2.2.1.1 0 0 0-.1.1C14.4 27 13.3 33.6 13.8 40c0 0 0 .1.1.1a28 28 0 0 0 8.4 4.2.1.1 0 0 0 .1-.1 20 20 0 0 0 1.7-2.8.1.1 0 0 0-.1-.1 18.4 18.4 0 0 1-2.7-1.3.1.1 0 0 1 0-.2l.5-.4a.1.1 0 0 1 .1 0c5.7 2.6 11.8 2.6 17.5 0a.1.1 0 0 1 .1 0l.5.4a.1.1 0 0 1 0 .2 17.9 17.9 0 0 1-2.7 1.3.1.1 0 0 0-.1.1 20 20 0 0 0 1.7 2.8.1.1 0 0 0 .1.1 27.9 27.9 0 0 0 8.4-4.2.1.1 0 0 0 .1-.1c.7-7.2-1.2-13.8-5-19.7a.1.1 0 0 0 0-.1zM24.3 36.3c-1.7 0-3-1.5-3-3.3s1.3-3.3 3-3.3 3 1.5 3 3.3-1.3 3.3-3 3.3zm11.2 0c-1.7 0-3-1.5-3-3.3s1.3-3.3 3-3.3 3 1.5 3 3.3-1.3 3.3-3 3.3z" fill="white"/>
      </svg>
    ),
    color: 'bg-[#5865F2]/10 border-[#5865F2]/20',
    badge: 'bg-[#5865F2]/10 text-[#5865F2]',
  },
]

const liveIntegrations = INTEGRATIONS.filter(i => i.status === 'live')
const comingIntegrations = INTEGRATIONS.filter(i => i.status === 'coming_soon')

export function IntegrationDetails() {
  return (
    <section id="integrations" tabIndex={-1} className="w-full py-24 bg-[#FCFBF9] border-y border-[#E5E2DB]">
      <div className="w-full max-w-7xl mx-auto px-6">
        
        {/* Heading */}
        <div className="max-w-2xl mb-16">
          <p className="text-[10px] tracking-widest uppercase font-semibold text-[#526B54] mb-3">Integrations</p>
          <h2 className="text-4xl md:text-5xl font-bold text-[#1C1C1C] tracking-tight leading-tight mb-4">
            Connect your stack.<br/>We handle the rest.
          </h2>
          <p className="text-lg text-[#4A4A4A]">
            Support247 plugs into your existing tools in minutes. No developers needed.
          </p>
        </div>

        {/* Live integrations — featured */}
        <div className="mb-12">
          <p className="text-xs font-bold uppercase tracking-widest text-[#526B54] mb-6 flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-[#526B54] animate-pulse inline-block" />
            Live Now
          </p>
          <div className="grid grid-cols-1 md:grid-cols-1 gap-6">
            {liveIntegrations.map((integration) => (
              <motion.div
                key={integration.slug}
                initial={{ opacity: 0, y: 16 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ duration: 0.5 }}
                className={`relative rounded-2xl border p-8 flex flex-col md:flex-row gap-8 items-start ${integration.color}`}
              >
                {/* Icon */}
                <div className="w-16 h-16 flex-shrink-0 rounded-2xl overflow-hidden border border-white/60 shadow-sm bg-white p-2">
                  {integration.icon}
                </div>

                <div className="flex-1">
                  <div className="flex flex-wrap items-center gap-3 mb-3">
                    <h3 className="text-2xl font-bold text-[#1C1C1C]">{integration.name}</h3>
                    <span className={`px-2.5 py-1 text-[10px] font-bold tracking-widest uppercase rounded-full ${integration.badge}`}>
                      Live
                    </span>
                  </div>
                  <p className="text-base text-[#4A4A4A] mb-5 max-w-xl">{integration.description}</p>
                  <div className="flex flex-wrap gap-2">
                    {integration.capabilities.map((cap) => (
                      <span key={cap} className="px-3 py-1.5 bg-white border border-[#E5E2DB] rounded-lg text-xs font-semibold text-[#4A4A4A] shadow-sm">
                        {cap}
                      </span>
                    ))}
                  </div>
                </div>
              </motion.div>
            ))}
          </div>
        </div>

        {/* Coming soon integrations — grid */}
        <div>
          <p className="text-xs font-bold uppercase tracking-widest text-[#A3A3A3] mb-6">
            Coming Soon
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            {comingIntegrations.map((integration, i) => (
              <motion.div
                key={integration.slug}
                initial={{ opacity: 0, y: 16 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ duration: 0.4, delay: i * 0.05 }}
                className="group relative rounded-2xl border border-[#E5E2DB] bg-white p-5 flex flex-col gap-4 hover:shadow-md transition-shadow"
              >
                {/* Status badge */}
                <span className="absolute top-4 right-4 px-2 py-0.5 bg-[#F2EFEB] text-[#A3A3A3] text-[9px] font-bold uppercase tracking-widest rounded-full">
                  Soon
                </span>

                {/* Icon */}
                <div className="w-12 h-12 rounded-xl overflow-hidden border border-[#E5E2DB] shadow-sm bg-white p-1.5 flex-shrink-0">
                  {integration.icon}
                </div>

                <div>
                  <h3 className="font-bold text-[#1C1C1C] text-base mb-1">{integration.name}</h3>
                  <p className="text-xs text-[#737373] leading-relaxed line-clamp-3">{integration.description}</p>
                </div>

                {/* Mini capability pills */}
                <div className="flex flex-wrap gap-1.5 mt-auto">
                  {integration.capabilities.slice(0, 2).map((cap) => (
                    <span key={cap} className="px-2 py-1 bg-[#F2EFEB] rounded-md text-[10px] font-semibold text-[#737373]">
                      {cap}
                    </span>
                  ))}
                  {integration.capabilities.length > 2 && (
                    <span className="px-2 py-1 bg-[#F2EFEB] rounded-md text-[10px] font-semibold text-[#A3A3A3]">
                      +{integration.capabilities.length - 2} more
                    </span>
                  )}
                </div>
              </motion.div>
            ))}
          </div>
        </div>

        {/* CTA row */}
        <div className="mt-12 pt-8 border-t border-[#E5E2DB] flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div>
            <p className="font-bold text-[#1C1C1C] mb-1">Don't see your tool?</p>
            <p className="text-sm text-[#737373]">We're adding new integrations every sprint. Vote for yours or connect any REST API using our Custom Webhooks.</p>
          </div>
          <a
            href="mailto:hello@support247.chat?subject=Integration+Request"
            className="flex-shrink-0 px-5 py-2.5 bg-[#1C1C1C] text-white text-sm font-bold rounded-xl hover:bg-[#333] transition-colors"
          >
            Request an integration →
          </a>
        </div>

      </div>
    </section>
  )
}
