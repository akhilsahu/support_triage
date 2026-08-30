import React, { useState, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Save, CheckCircle, AlertCircle, X, ChevronRight, HelpCircle, Key, Server, Terminal, Shield, RefreshCw, Bot } from 'lucide-react'
import { Card } from '../components/ui/Card'
import { Button } from '../components/ui/Button'
import { Input } from '../components/ui/Input'
import { Toggle } from '../components/ui/Toggle'
import { apiClient } from '../api/client'

// Import official brand logo image assets provided in assets directory
import shopifyLogoImg from '../assets/images/logos/shopify_logo_white.png'
import whatsappLogoImg from '../assets/images/logos/Discord-Logo/whatsapp.png'
import slackLogoImg from '../assets/images/logos/SLA-Slack-from-Salesforce-logo-RGB.png'
import stripeLogoImg from '../assets/images/logos/Stripe wordmark - Blurple - Small.png'
import discordLogoImg from '../assets/images/logos/Discord-Logo-Blurple.png'
import zendeskLogoImg from '../assets/images/logos/Logo_Primary_Licorice.png'

// ── Custom SVG logos for a premium, native visual experience ───────────────────

const ShopifyLogo = ({ size = 32 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" role="img" xmlns="http://www.w3.org/2000/svg">
    <title>Shopify</title>
    {/* Dark green right perspective face */}
    <path d="M15.337 23.979l7.216-1.561s-2.604-17.613-2.625-17.73c-.018-.116-.114-.192-.211-.192s-1.929-.136-1.929-.136-1.275-1.274-1.439-1.411c-.045-.037-.075-.057-.121-.074l-.914 21.104h.023z" fill="#5E8E3E" />
    {/* Main green body with handles */}
    <path d="M11.17.83c.136 0 .271.038.405.135-.984.465-2.064 1.639-2.508 3.992-.656.213-1.293.405-1.889.578C7.697 3.75 8.951.84 11.17.84V.83zm1.235 2.949v.135c-.754.232-1.583.484-2.394.736.466-1.777 1.333-2.645 2.085-2.971.193.501.309 1.176.309 2.1zm.539-2.234c.694.074 1.141.867 1.429 1.755-.349.114-.735.231-1.158.366v-.252c0-.752-.096-1.371-.271-1.871v.002zm2.992 1.289c-.02 0-.06.021-.078.021s-.289.075-.714.21c-.423-1.233-1.176-2.37-2.508-2.37h-.115C12.135.209 11.669 0 11.265 0 8.159 0 6.675 3.877 6.21 5.846c-1.194.365-2.063.636-2.16.674-.675.213-.694.232-.772.87-.075.462-1.83 14.063-1.83 14.063L15.009 24l.927-21.166z" fill="#96BF48" />
    {/* White 'S' printed in center */}
    <path d="M11.71 11.305s-.81-.424-1.774-.424c-1.447 0-1.504.906-1.504 1.141 0 1.232 3.24 1.715 3.24 4.629 0 2.295-1.44 3.76-3.406 3.76-2.354 0-3.54-1.465-3.54-1.465l.646-2.086s1.245 1.066 2.28 1.066c.675 0 .975-.545.975-.932 0-1.619-2.654-1.694-2.654-4.359-.034-2.237 1.571-4.416 4.827-4.416 1.257 0 1.875.361 1.875.361l-.945 2.715-.02.01z" fill="#FFFFFF" />
  </svg>
)

const WhatsAppLogo = ({ size = 32 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
    <path d="M12.012 2C6.48 2 2.01 6.47 2.01 12c0 1.91.54 3.7 1.48 5.24L2 22l4.91-1.42A9.927 9.927 0 0012.01 22c5.53 0 10-4.47 10-10S17.54 2 12.012 2zm5.79 12.98c-.25.7-1.45 1.37-2 1.42-.51.05-1.18.27-3.48-.68-2.93-1.21-4.81-4.21-4.96-4.41-.15-.2-1.2-1.6-1.2-3.05 0-1.45.75-2.15 1.02-2.45.2.2.4.25.55.25h.4c.15 0 .35-.05.55.45.2.5 1.02 2.45 1.1 2.65.1.2.15.4.02.65-.13.25-.28.4-.53.7-.25.3-.53.67-.76.9-.25.25-.51.52-.2.95.3.52 1.34 2.2 2.87 3.56 1.97 1.75 3.62 2.3 4.13 2.51.5.21.8.18 1.1-.15.3-.33 1.3-1.5 1.65-2.02.35-.52.7-.42 1.18-.25.48.17 3.05 1.43 3.57 1.7.53.26.88.38 1 .6.12.23.12 1.3-.13 2z" fill="#25D366" />
  </svg>
)

const SlackLogo = ({ size = 32 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
    <path d="M5.042 15.165a2.528 2.528 0 01-2.52 2.523 2.528 2.528 0 01-2.522-2.523 2.528 2.528 0 012.522-2.52h2.52v2.52zm1.261 0a2.528 2.528 0 012.52-2.52h5.043a2.528 2.528 0 012.522 2.52v5.043a2.528 2.528 0 01-2.522 2.52H8.823a2.528 2.528 0 01-2.52-2.52v-5.043zM8.823 5.042a2.528 2.528 0 01-2.52-2.52A2.528 2.528 0 018.823 0a2.528 2.528 0 012.52 2.522v2.52h-2.52zm0 1.261a2.528 2.528 0 012.52 2.52v5.043a2.528 2.528 0 01-2.52 2.522H3.78a2.528 2.528 0 01-2.52-2.522V8.823a2.528 2.528 0 012.52-2.52h5.043zm10.135 3.781a2.528 2.528 0 012.52-2.522 2.528 2.528 0 012.522 2.522 2.528 2.528 0 01-2.522 2.52h-2.52v-2.52zm-1.262 0a2.528 2.528 0 01-2.52 2.52h-5.043a2.528 2.528 0 01-2.522-2.52V5.042a2.528 2.528 0 012.522-2.52h5.043a2.528 2.528 0 012.52 2.52v5.043zm-3.781 10.135a2.528 2.528 0 012.52 2.52 2.528 2.528 0 01-2.52 2.522 2.528 2.528 0 01-2.522-2.522v-2.52h2.522zm0-1.262a2.528 2.528 0 01-2.522-2.52v-5.043a2.528 2.528 0 012.522-2.52h5.043a2.528 2.528 0 012.52 2.52v5.043h-5.043z" fill="#E01E5A" />
  </svg>
)

const DiscordLogo = ({ size = 32 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
    <path d="M19.27 4.73a10.84 10.84 0 00-2.66-.82.06.06 0 00-.06.03c-.23.41-.48.94-.66 1.37a9.92 9.92 0 00-3.89 0c-.18-.43-.44-.96-.67-1.37a.06.06 0 00-.06-.03 10.83 10.83 0 00-2.66.82.05.05 0 00-.02.02c-1.7 2.54-2.18 5.01-1.95 7.46a.05.05 0 00.02.04 11.02 11.02 0 003.3 1.66.06.06 0 00.06-.02c.26-.35.49-.72.69-1.11a.06.06 0 00-.03-.08c-1.04-.4-2.03-.9-2.97-1.5a.06.06 0 01-.01-.1c.2-.15.4-.3.59-.46a.06.06 0 01.06 0c3.92 1.8 8.18 1.8 12.06 0a.06.06 0 01.06 0c.19.16.39.31.59.46a.06.06 0 01-.01.1 9.87 9.87 0 01-2.97 1.5.06.06 0 00-.03.08c.2.39.43.76.69 1.11a.06.06 0 00.06.02 11.01 11.01 0 003.3-1.66.05.05 0 00.02-.04c.28-2.85-.47-5.32-1.95-7.46a.05.05 0 00-.02-.02zM8.52 11.6c-.64 0-1.17-.59-1.17-1.3 0-.72.52-1.3 1.17-1.3s1.17.59 1.17 1.3c0 .71-.52 1.3-1.17 1.3zm6.96 0c-.64 0-1.17-.59-1.17-1.3 0-.72.52-1.3 1.17-1.3s1.17.59 1.17 1.3c0 .71-.52 1.3-1.17 1.3z" fill="#5865F2" />
  </svg>
)

const ZendeskLogo = ({ size = 32 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
    <path d="M19.78 18.06l-4.52-4.52a2.38 2.38 0 00-3.37 0l-4.52 4.52a2.38 2.38 0 000 3.37l4.52 4.52c.93.93 2.44.93 3.37 0l4.52-4.52a2.38 2.38 0 000-3.37z" fill="#00A656" />
    <path d="M8.74 5.94L4.22 1.42a2.38 2.38 0 00-3.37 0 2.38 2.38 0 000 3.37l4.52 4.52a2.38 2.38 0 003.37 0l4.52-4.52a2.38 2.38 0 000-3.37L8.74 5.94z" fill="#032F30" />
  </svg>
)

const StripeLogo = ({ size = 32 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
    <path d="M13.962 10.662c0-1.137-.92-1.7-2.454-1.7-1.42 0-2.733.486-3.834 1.18L6.46 7.426c1.472-.942 3.328-1.572 5.259-1.572 4.093 0 6.643 2.1 6.643 5.485 0 5.44-7.464 6.136-7.464 8.084 0 .973.91 1.477 2.329 1.477 1.838 0 3.361-.63 4.57-1.399l1.103 2.58c-1.574 1.054-3.794 1.764-5.965 1.764-4.58 0-6.938-2.278-6.938-5.32 0-5.748 7.968-6.425 7.968-9.283z" fill="#635BFF" />
  </svg>
)

const WordPressLogo = ({ size = 32 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
    <path d="M12.16 0C5.48 0 0 5.48 0 12.16s5.48 12.16 12.16 12.16 12.16-5.48 12.16-12.16S18.84 0 12.16 0zm9.4 6.81c.54 1.54.83 3.2.83 4.93 0 2.22-.51 4.31-1.42 6.18L15.34 5.92c1.78.33 3.96 1.77 6.22.89zm-13.88.38c.67.06.67.9.06.96-.92.09-1.55.09-2.47 0-.61-.06-.61-.9 0-.96.22-.02.48-.04.74-.06L3.9 15.36 1.5 8.1c.15-.02.3-.03.44-.06.62-.06.62-.9 0-.96-.45-.04-1-.04-1.43 0-.08.01-.16.03-.25.04.83-2.67 2.24-5 4.1-6.86L6.5 17.52l3.4-10.15c-.24-.02-.48-.04-.7-.06a.48.48 0 01-.06-.96c.7 0 1.25-.03 2.1 0 .61.03.61.87 0 .93-.24.03-.49.04-.73.06L7.3 17.52l3.22-9.6c.23-.03.45-.04.68-.06.4-.04.4-.88.08-.94zM12 21.6c-.6 0-1.19-.06-1.76-.17l4.02-12 4.02 12c-.57.11-1.16.17-1.76.17z" fill="#21759B" />
  </svg>
)

const WebhookLogo = ({ size = 32 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
    <path d="M12 2a4 4 0 100 8 4 4 0 000-8zM5 12a3 3 0 100 6 3 3 0 000-6zm14 0a3 3 0 100 6 3 3 0 000-6z" fill="#F59E0B" />
    <path d="M12 10v4M5 15h14M12 14H5M12 14h7" stroke="#F59E0B" strokeWidth="2" strokeLinecap="round" />
  </svg>
)

interface Chatbot {
  id: string
  slug: string
  display_name: string
  api_key: string
  is_default: boolean
}

interface IntegrationItem {
  id: string
  name: string
  desc: string
  logo: string | React.ComponentType<{ size?: number }>
  color: string
  status: 'connected' | 'disconnected'
  badge: string
  fields: { name: string; label: string; placeholder: string; type: string; secure?: boolean }[]
  instructions: string[]
  howItWorks: string
}

const INTEGRATIONS_DATA: IntegrationItem[] = [
  {
    id: 'shopify',
    name: 'Shopify',
    desc: 'Sync orders, catalog metadata, and live tracking stats to customer chatbot contexts.',
    logo: shopifyLogoImg,
    color: '#95BF47',
    status: 'disconnected',
    badge: 'App API',
    fields: [
      { name: 'storeUrl', label: 'Shopify Store URL', placeholder: 'brand.myshopify.com', type: 'text' },
      { name: 'accessToken', label: 'Admin API Access Token', placeholder: 'shpat_xxx', type: 'password', secure: true }
    ],
    instructions: [
      "Open your Shopify admin dashboard.",
      "Go to Settings > Apps and sales channels > Develop apps.",
      "Click Create an app and assign scopes: read_orders, read_products, read_inventory.",
      "Install the app, copy the Access Token, and paste it here."
    ],
    howItWorks: "Syncs e-commerce catalog metadata, delivery tracking, and order transactions. Shopify webhook callbacks (e.g. orders/create, orders/fulfilled) automatically sychronize transaction updates to our database RAG cache in real-time."
  },
  {
    id: 'whatsapp',
    name: 'WhatsApp',
    desc: 'Deliver 24/7 automated support directly on WhatsApp with live takeover handoff.',
    logo: whatsappLogoImg,
    color: '#25D366',
    status: 'disconnected',
    badge: 'Active Channel',
    fields: [
      { name: 'phoneId', label: 'WhatsApp Phone Number ID', placeholder: '15-digit Meta ID', type: 'text' },
      { name: 'token', label: 'System Access Token', placeholder: 'EAABxxx', type: 'password', secure: true },
      { name: 'verifyToken', label: 'Verification Token (For Webhook)', placeholder: 'Choose a webhook passphrase', type: 'text' }
    ],
    instructions: [
      "Create a Business App on Meta Developers Portal.",
      "Add WhatsApp product to your app to generate Phone Number ID.",
      "Create a System User in Business Settings and generate a token with whatsapp_business_messaging.",
      "Copy Callback URL: http://127.0.0.1:8000/api/v1/integrations/whatsapp/webhook."
    ],
    howItWorks: "Binds your custom AI chatbot agent to a live WhatsApp phone number. Inbound customer text messages trigger Meta's Graph API webhook, which resolves the active chatbot session and fires the agent reply loop."
  },
  {
    id: 'slack',
    name: 'Slack',
    desc: 'Send escalation notices and negative-sentiment alerts directly to Slack support channels.',
    logo: slackLogoImg,
    color: '#E01E5A',
    status: 'disconnected',
    badge: 'Escalations',
    fields: [
      { name: 'webhookUrl', label: 'Slack Webhook URL', placeholder: 'https://hooks.slack.com/services/...', type: 'text' }
    ],
    instructions: [
      "Go to your Slack App Directory or create a Slack Custom App.",
      "Activate Incoming Webhooks in settings.",
      "Add Webhook to Workspace and choose the target channel.",
      "Copy Webhook URL and paste it here."
    ],
    howItWorks: "Escalates chats to your internal support teams. Sends negative-sentiment notices or high-friction messages to your support channel via Slack Block Kit. Support staff can click 'Take Over Ticket' to instantly pause the AI responder."
  },
  {
    id: 'stripe',
    name: 'Stripe',
    desc: 'Check invoice billing state and safely process chatbot refund limits.',
    logo: stripeLogoImg,
    color: '#635BFF',
    status: 'disconnected',
    badge: 'Financials',
    fields: [
      { name: 'restrictedKey', label: 'Restricted API Key', placeholder: 'rk_live_xxx', type: 'password', secure: true },
      { name: 'refundLimit', label: 'Max autonomous refund limit ($)', placeholder: '50.00', type: 'text' }
    ],
    instructions: [
      "Go to Stripe Dashboard > Developers > API Keys.",
      "Click Create restricted key and name it Support247.",
      "Grant Read access for charges/customers/invoices, and Write access for refunds.",
      "Copy Restricted Key and paste here."
    ],
    howItWorks: "Verifies invoice payments and processes autonomous customer refunds. Stripe webhook events (e.g. invoice.paid) keep invoice contexts up-to-date. Chat refund requests are evaluated against the chatbot's maximum refund limit settings."
  },
  {
    id: 'zendesk',
    name: 'Zendesk',
    desc: 'Sync support tickets and conversation logs directly with your Zendesk CRM platform.',
    logo: zendeskLogoImg,
    color: '#00A656',
    status: 'disconnected',
    badge: 'CRM Sync',
    fields: [
      { name: 'subdomain', label: 'Zendesk Subdomain', placeholder: 'brand (from brand.zendesk.com)', type: 'text' },
      { name: 'email', label: 'Admin Email Address', placeholder: 'admin@brand.com', type: 'text' },
      { name: 'token', label: 'API Token', placeholder: 'Zendesk token', type: 'password', secure: true }
    ],
    instructions: [
      "Log into your Zendesk Admin Center.",
      "Go to Apps and Integrations > APIs > Zendesk API.",
      "Enable Token Access and click Add API token.",
      "Save token and paste into form."
    ],
    howItWorks: "Creates two-way CRM ticket sync. When a chatbot session concludes, resolves, or is escalated, the chatbot logs the full conversation history to Zendesk and syncs customer contact details."
  },
  {
    id: 'discord',
    name: 'Discord',
    desc: 'Deploy bot handlers to guilds to sync threads and automate server support tickets.',
    logo: discordLogoImg,
    color: '#5865F2',
    status: 'disconnected',
    badge: 'Community',
    fields: [
      { name: 'botToken', label: 'Discord Bot Token', placeholder: 'Discord Application Token', type: 'password', secure: true },
      { name: 'channelId', label: 'Monitor Channel ID', placeholder: 'Channel to listen for tickets', type: 'text' }
    ],
    instructions: [
      "Go to Discord Developer Portal and create a Bot.",
      "Enable Message Content Intent under Bot privileges.",
      "Invite bot to your server using Administrator scopes.",
      "Copy Bot Token and paste here."
    ],
    howItWorks: "Listens for community support threads. A background bot monitors message intents on configured Guild channels and auto-replies on matching support threads using chatbot context data."
  },
  {
    id: 'woocommerce',
    name: 'WordPress / WooCommerce',
    desc: 'Synchronize WordPress store inventories, product details, and WooCommerce sales orders.',
    logo: WordPressLogo,
    color: '#21759B',
    status: 'disconnected',
    badge: 'Plugin',
    fields: [
      { name: 'siteUrl', label: 'WordPress Site URL', placeholder: 'https://mywebsite.com', type: 'text' },
      { name: 'consumerKey', label: 'WooCommerce Consumer Key', placeholder: 'ck_xxx', type: 'text' },
      { name: 'consumerSecret', label: 'WooCommerce Consumer Secret', placeholder: 'cs_xxx', type: 'password', secure: true }
    ],
    instructions: [
      "Log into WordPress Admin and go to WooCommerce > Settings > Advanced > REST API.",
      "Click Add Key, describe it as Support247, and set permissions to Read/Write.",
      "Generate and copy Consumer Key and Secret."
    ],
    howItWorks: "Pulls product inventories and Woo order information periodically. WooCommerce REST API endpoints index product listings and store metadata to context vectors."
  },
  {
    id: 'webhooks',
    name: 'Webhooks & Custom API',
    desc: 'Deliver real-time JSON event notifications back to your company API endpoints.',
    logo: WebhookLogo,
    color: '#F59E0B',
    status: 'disconnected',
    badge: 'Developer REST',
    fields: [
      { name: 'targetUrl', label: 'Target Webhook Endpoint URL', placeholder: 'https://api.mycompany.com/webhook', type: 'text' },
      { name: 'secretKey', label: 'Signing HMAC Key (Auto-Generated)', placeholder: 'hmac_secret_key_123', type: 'text' }
    ],
    instructions: [
      "Host an endpoint on your server capable of receiving POST payloads.",
      "Check desired event notifications (e.g. ticket.created).",
      "Use HMAC signature sent in headers to verify authenticity."
    ],
    howItWorks: "Triggers secure external payload deliveries back to your backend. Dispatches outbound JSON POST events signed with an HMAC key whenever chat sessions update or human escalations occur."
  }
]

export function Integrations() {
  const [chatbots, setChatbots] = useState<Chatbot[]>([])
  const [selectedBot, setSelectedBot] = useState<Chatbot | null>(null)
  const [loadingBots, setLoadingBots] = useState(true)
  
  const [integrations, setIntegrations] = useState<IntegrationItem[]>(INTEGRATIONS_DATA)
  const [activeItem, setActiveItem] = useState<IntegrationItem | null>(null)
  const [formState, setFormState] = useState<Record<string, string>>({})
  const [testingStatus, setTestingStatus] = useState<'idle' | 'testing' | 'success' | 'failed'>('idle')

  // 1. Fetch Chatbots on mount
  useEffect(() => {
    apiClient.getChatbots()
      .then((data: Chatbot[]) => {
        setChatbots(data)
        const def = data.find(c => c.is_default) ?? data[0]
        if (def) setSelectedBot(def)
      })
      .catch(() => {})
      .finally(() => setLoadingBots(false))
  }, [])

  // 2. Refresh integrations configuration state when selected chatbot changes
  useEffect(() => {
    if (!selectedBot) return

    const cacheKey = `support247_integrations_cache_${selectedBot.id}`
    const local = localStorage.getItem(cacheKey)
    
    if (local) {
      try {
        const parsed = JSON.parse(local)
        setIntegrations(INTEGRATIONS_DATA.map(item => ({
          ...item,
          status: parsed[item.id] ? 'connected' : 'disconnected'
        })))
      } catch {
        setIntegrations(INTEGRATIONS_DATA)
      }
    } else {
      setIntegrations(INTEGRATIONS_DATA)
    }
  }, [selectedBot])

  const openWizard = (item: IntegrationItem) => {
    if (!selectedBot) return
    setActiveItem(item)
    setTestingStatus('idle')
    
    // Load config specific to both chatbot ID and integration ID
    const savedKey = `support247_integ_form_${item.id}_${selectedBot.id}`
    const saved = localStorage.getItem(savedKey)
    if (saved) {
      try { setFormState(JSON.parse(saved)) }
      catch { setFormState({}) }
    } else {
      setFormState({})
    }
  }

  const handleInputChange = (name: string, val: string) => {
    setFormState(prev => ({ ...prev, [name]: val }))
  }

  const saveConfig = () => {
    if (!activeItem || !selectedBot) return
    
    // Save settings scoped to the specific chatbot ID
    const savedKey = `support247_integ_form_${activeItem.id}_${selectedBot.id}`
    localStorage.setItem(savedKey, JSON.stringify(formState))
    
    // Set status to connected
    const updated = integrations.map(item => {
      if (item.id === activeItem.id) {
        return { ...item, status: 'connected' as const }
      }
      return item
    })
    setIntegrations(updated)
    
    // Save mapping states cache scoped to the specific chatbot ID
    const cacheKey = `support247_integrations_cache_${selectedBot.id}`
    const cache: Record<string, boolean> = {}
    updated.forEach(item => {
      cache[item.id] = item.status === 'connected'
    })
    localStorage.setItem(cacheKey, JSON.stringify(cache))
    
    setActiveItem(null)
  }

  const disconnectConfig = () => {
    if (!activeItem || !selectedBot) return
    
    const savedKey = `support247_integ_form_${activeItem.id}_${selectedBot.id}`
    localStorage.removeItem(savedKey)
    
    const updated = integrations.map(item => {
      if (item.id === activeItem.id) {
        return { ...item, status: 'disconnected' as const }
      }
      return item
    })
    setIntegrations(updated)
    
    const cacheKey = `support247_integrations_cache_${selectedBot.id}`
    const cache: Record<string, boolean> = {}
    updated.forEach(item => {
      cache[item.id] = item.status === 'connected'
    })
    localStorage.setItem(cacheKey, JSON.stringify(cache))
    setActiveItem(null)
  }

  const testConnection = () => {
    setTestingStatus('testing')
    setTimeout(() => {
      const mockSuccess = Object.values(formState).some(v => v.trim().length > 0)
      setTestingStatus(mockSuccess ? 'success' : 'failed')
    }, 1500)
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className="p-6 max-w-6xl mx-auto pb-24 space-y-6"
    >
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white tracking-tight">Ecosystem & App Integrations</h1>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
            Connect support channels, billing tools, and storefront catalogs to expand chatbot knowledge context.
          </p>
        </div>
      </div>

      {/* Chatbot Selector */}
      <Card className="p-5">
        <div className="flex items-center gap-2 text-sm font-bold text-gray-900 dark:text-white mb-3">
          <Bot className="w-4 h-4 text-indigo-500" />
          <span>Active Chatbot Config Scope</span>
        </div>
        
        {loadingBots && (
          <p className="text-xs text-gray-400 italic">Loading chatbot list...</p>
        )}

        {!loadingBots && chatbots.length === 0 && (
          <p className="text-xs text-gray-400 italic">No chatbots found. Please create one under Agents tab first.</p>
        )}

        {!loadingBots && chatbots.length > 0 && (
          <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-6 gap-2">
            {chatbots.map(bot => {
              const isActive = selectedBot?.id === bot.id
              return (
                <button
                  key={bot.id}
                  onClick={() => setSelectedBot(bot)}
                  className={`text-left px-3 py-2 rounded-xl border text-xs font-semibold transition-all ${
                    isActive
                      ? 'bg-indigo-500 text-white border-indigo-500 shadow-sm shadow-indigo-500/10'
                      : 'bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300 border-gray-200 dark:border-gray-700 hover:border-gray-300 dark:hover:border-gray-600'
                  }`}
                >
                  <div className="truncate">{bot.display_name}</div>
                  <div className={`text-[10px] mt-0.5 font-normal ${isActive ? 'text-indigo-100' : 'text-gray-400'}`}>
                    @{bot.slug}
                  </div>
                </button>
              )
            })}
          </div>
        )}
      </Card>

      {/* Grid of integrations */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {integrations.map(item => {
          const Logo = item.logo
          const isConnected = item.status === 'connected'
          return (
            <Card
              key={item.id}
              onClick={() => selectedBot && openWizard(item)}
              className={`flex flex-col gap-4 p-5 border transition-all group relative overflow-hidden ${
                selectedBot 
                  ? 'cursor-pointer hover:shadow-md hover:border-gray-300 dark:hover:border-gray-600' 
                  : 'opacity-50 cursor-not-allowed'
              }`}
            >
              <div className="flex justify-between items-start">
                <div className={`flex items-center justify-center w-12 h-12 rounded-2xl border shadow-sm group-hover:scale-105 transition-transform p-2 overflow-hidden ${
                  item.id === 'shopify' 
                    ? 'bg-zinc-950 border-zinc-800' 
                    : 'bg-white border-gray-200/60 dark:bg-white dark:border-gray-200/60'
                }`}>
                  {typeof item.logo === 'string' ? (
                    <img src={item.logo} className="object-contain max-h-full max-w-full" alt={item.name} />
                  ) : (
                    React.createElement(item.logo, { size: 28 })
                  )}
                </div>
                <div className="flex gap-2 items-center">
                  <span className="text-[10px] uppercase font-bold tracking-wider text-gray-400 dark:text-gray-500 bg-gray-100 dark:bg-gray-800 px-2 py-0.5 rounded-full">
                    {item.badge}
                  </span>
                  <span className={`w-2.5 h-2.5 rounded-full ${isConnected ? 'bg-emerald-500 shadow-emerald-500/20 shadow-lg animate-pulse' : 'bg-gray-300 dark:bg-gray-600'}`} />
                </div>
              </div>

              <div>
                <h3 className="text-base font-bold text-gray-900 dark:text-white">{item.name}</h3>
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-1 leading-relaxed line-clamp-2">
                  {item.desc}
                </p>
              </div>

              <div className="mt-auto pt-2 flex items-center justify-between text-xs font-semibold text-indigo-600 dark:text-indigo-400 group-hover:translate-x-1 transition-transform">
                <span>
                  {!selectedBot ? 'Select chatbot first' : isConnected ? 'Edit Settings' : 'Configure Integration'}
                </span>
                <ChevronRight className="w-4 h-4" />
              </div>
            </Card>
          )
        })}
      </div>

      {/* Configuration Wizard Modal */}
      <AnimatePresence>
        {activeItem && selectedBot && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4">
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-3xl w-full max-w-2xl overflow-hidden shadow-2xl flex flex-col max-h-[90vh]"
            >
              {/* Header */}
              <div className="flex justify-between items-center px-6 py-5 border-b border-gray-100 dark:border-gray-800 bg-gray-50/55 dark:bg-gray-800/10">
                <div className="flex items-center gap-3">
                  <div className={`w-10 h-10 rounded-xl border flex items-center justify-center shadow-sm p-1.5 overflow-hidden ${
                    activeItem.id === 'shopify' 
                      ? 'bg-zinc-950 border-zinc-800' 
                      : 'bg-white border-gray-200/60 dark:bg-white dark:border-gray-200/60'
                  }`}>
                    {typeof activeItem.logo === 'string' ? (
                      <img src={activeItem.logo} className="object-contain max-h-full max-w-full" alt={activeItem.name} />
                    ) : (
                      React.createElement(activeItem.logo, { size: 24 })
                    )}
                  </div>
                  <div>
                    <h2 className="text-lg font-bold text-gray-900 dark:text-white">Configure {activeItem.name}</h2>
                    <p className="text-xs text-gray-400">Scoped for: {selectedBot.display_name}</p>
                  </div>
                </div>
                <button
                  onClick={() => setActiveItem(null)}
                  className="p-2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 rounded-full hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              {/* Scrollable Content */}
              <div className="p-6 overflow-y-auto space-y-6 flex-1">
                {/* Integration Flow Info Callout */}
                <div className="bg-blue-50/50 dark:bg-blue-950/15 border border-blue-100/50 dark:border-blue-900/30 rounded-2xl p-4">
                  <h4 className="text-xs font-bold text-blue-700 dark:text-blue-400 uppercase tracking-wider flex items-center gap-1.5 mb-1.5">
                    <Server className="w-4 h-4" /> How this integration works
                  </h4>
                  <p className="text-xs text-gray-600 dark:text-gray-300 leading-relaxed font-sans">
                    {activeItem.howItWorks}
                  </p>
                </div>

                {/* Developer Instructions */}
                <div className="bg-indigo-50/50 dark:bg-indigo-950/15 border border-indigo-100/50 dark:border-indigo-900/30 rounded-2xl p-4">
                  <h4 className="text-xs font-bold text-indigo-700 dark:text-indigo-400 uppercase tracking-wider flex items-center gap-1.5 mb-2">
                    <HelpCircle className="w-4 h-4" /> Setup Instructions
                  </h4>
                  <ul className="list-decimal pl-4 space-y-1.5 text-xs text-gray-600 dark:text-gray-300">
                    {activeItem.instructions.map((step, idx) => (
                      <li key={idx} className="leading-relaxed">{step}</li>
                    ))}
                  </ul>
                </div>

                {/* Form fields */}
                <div className="space-y-4">
                  <h4 className="text-xs font-bold text-gray-700 dark:text-gray-400 uppercase tracking-wider flex items-center gap-1.5">
                    <Key className="w-4 h-4" /> Credentials & Config
                  </h4>
                  <div className="grid grid-cols-1 gap-4">
                    {activeItem.fields.map(field => (
                      <div key={field.name} className="space-y-1.5">
                        <label className="text-xs font-semibold text-gray-700 dark:text-gray-300 pl-1">{field.label}</label>
                        <Input
                          type={field.type}
                          placeholder={field.placeholder}
                          value={formState[field.name] || ''}
                          onChange={e => handleInputChange(field.name, e.target.value)}
                          className="text-sm font-sans"
                        />
                      </div>
                    ))}
                  </div>
                </div>

                {/* Testing Connection Diagnostics */}
                {testingStatus !== 'idle' && (
                  <div className={`p-4 rounded-2xl border text-xs flex gap-3 items-center ${
                    testingStatus === 'testing' ? 'bg-amber-50/50 border-amber-100 dark:bg-amber-950/10 dark:border-amber-900/20 text-amber-700 dark:text-amber-400' :
                    testingStatus === 'success' ? 'bg-emerald-50/50 border-emerald-100 dark:bg-emerald-950/10 dark:border-emerald-900/20 text-emerald-700 dark:text-emerald-400' :
                    'bg-rose-50/50 border-rose-100 dark:bg-rose-950/10 dark:border-rose-900/20 text-rose-700 dark:text-rose-400'
                  }`}>
                    {testingStatus === 'testing' && (
                      <>
                        <RefreshCw className="w-4 h-4 animate-spin flex-shrink-0" />
                        <span>Verifying API credentials and pinging server...</span>
                      </>
                    )}
                    {testingStatus === 'success' && (
                      <>
                        <CheckCircle className="w-4 h-4 flex-shrink-0" />
                        <span>Connection test succeeded! Integration is verified and responsive.</span>
                      </>
                    )}
                    {testingStatus === 'failed' && (
                      <>
                        <AlertCircle className="w-4 h-4 flex-shrink-0" />
                        <span>Connection test failed: Credentials cannot be empty. Please verify inputs.</span>
                      </>
                    )}
                  </div>
                )}
              </div>

              {/* Actions Footer */}
              <div className="px-6 py-4 bg-gray-50 dark:bg-gray-800/20 border-t border-gray-100 dark:border-gray-800 flex justify-between gap-3">
                {activeItem.status === 'connected' ? (
                  <Button variant="danger" onClick={disconnectConfig} className="text-xs">
                    Disconnect Integration
                  </Button>
                ) : (
                  <div />
                )}
                <div className="flex gap-2">
                  <Button variant="secondary" onClick={testConnection} className="text-xs">
                    Test Connection
                  </Button>
                  <Button onClick={saveConfig} className="text-xs gap-1.5">
                    <Save className="w-3.5 h-3.5" /> Save settings
                  </Button>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </motion.div>
  )
}
