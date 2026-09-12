export const SIGNUP_URL = '/app/login?tab=register'

export const hero = {
  eyebrow: 'A little less repetition. A lot more support.',
  title: 'Grounded AI support agents for your business knowledge and workflows.',
  description:
    'Connect your documentation, knowledge bases, and internal APIs in seconds. Give customers answers grounded in your business knowledge, with human handoff when needed.',
}

export const scenarios = [
  {
    id: 'saas',
    label: 'SaaS',
    brand: 'Atlas Cloud',
    agent: 'Technical Assistant',
    question: 'What happens when I hit the API rate limit?',
    answer:
      'In this example, your workspace allows 1,000 requests per minute. If you reach the limit, the API returns HTTP 429. Wait for the Retry-After interval before sending another request.',
    source: 'API rate-limit documentation',
    excerpt:
      'Sample plan: 1,000 requests per minute per workspace. HTTP 429 responses include a Retry-After header indicating when to retry.',
    detail: 'Technical answers grounded in your API documentation.',
    result: 'Sample API documentation cited',
  },
  {
    id: 'fintech',
    label: 'FinTech',
    brand: 'ClearPay Finance',
    agent: 'Billing Agent',
    question: 'When will my payment settle?',
    answer:
      'This sample account uses a two-business-day settlement schedule. A payment captured on Monday settles on Wednesday, unless a bank holiday changes the schedule.',
    source: 'Payment settlement policy',
    excerpt:
      'Sample account: captured payments settle after two business days. Weekends and bank holidays are excluded.',
    detail: 'Billing answers grounded in your account policies.',
    result: 'Sample settlement policy cited',
  },
  {
    id: 'education',
    label: 'Education',
    brand: 'Northstar Learning',
    agent: 'Student Support Agent',
    question: 'What is the deadline to drop a course?',
    answer:
      'For this sample term, you can drop a course through the student portal until September 18 at 5 p.m. campus time. After that deadline, contact the registrar to discuss your options.',
    source: 'Academic calendar · course changes',
    excerpt:
      'Sample term: the course drop deadline is September 18 at 5 p.m. campus time. Later requests must be reviewed by the registrar.',
    detail: 'Student support grounded in your academic policies.',
    result: 'Sample academic calendar cited',
  },
  {
    id: 'ecommerce',
    label: 'E-Commerce',
    brand: 'Fern & Field',
    agent: 'Customer Care Agent',
    question: 'Can I return something if it does not fit?',
    answer:
      'Yes. In this sample store, unworn items can be returned within 30 days of delivery, with their original tags attached.',
    source: 'Returns policy',
    excerpt:
      'Unworn items with original tags may be returned within 30 days of delivery.',
    detail: 'Customer care grounded in your store policies.',
    result: 'Sample returns policy cited',
  },
] as const

export const outcomes = [
  {
    title: 'Give repeat questions a good answer.',
    text: 'Bring your guides, policies, and FAQs into one knowledge base. Give your support assistant the context your customers are asking for.',
    icon: 'message',
  },
  {
    title: 'Keep your knowledge in the conversation.',
    text: 'Clear answers grounded directly in your guides, manuals, and FAQs. Source references help make answers easier to understand and check.',
    icon: 'book',
  },
  {
    title: 'More than just text.',
    text: 'Connect your business tools and APIs. Look up billing details, account information, and workflow status without leaving the conversation.',
    icon: 'people',
  },
] as const

export const setupSteps = [
  {
    title: 'Make it yours',
    text: 'Create your workspace and verify your email. Give your support space a name customers recognise.',
  },
  {
    title: 'Give it your knowledge',
    text: 'Add documents, text, or questions and answers. Test the responses before sharing them with customers.',
  },
  {
    title: 'Meet your customers',
    text: 'Add the chat widget to your website or share your branded support page. Manage conversations from your inbox.',
  },
]

// USD monthly prices confirmed by the user on 2026-09-05.
// Do not invent quotas, seat limits, annual discounts, or checkout support.
export const pricing = {
  title: 'A small start. Room to grow.',
  description:
    'Choose a starting point for your support. Talk to us to confirm included usage and activate the right plan.',
}

export const plans = [
  {
    id: 'starter',
    name: 'Starter',
    price: 29,
    description: 'A place to start helping your customers.',
    features: [
      'Your own support workspace',
      'Answers grounded in your guides',
      'Website chat and a branded page',
    ],
  },
  {
    id: 'growth',
    name: 'Growth',
    price: 99,
    description: 'For people sharing the work of support.',
    features: [
      'A shared space for conversations',
      'Connect your business tools & APIs',
      'Human handoff when it matters',
    ],
  },
] as const

export const faqs = [
  {
    question: 'What content can I start with?',
    answer:
      'You can add documents, written content, and questions and answers to your knowledge base. Start with a small set of useful guides or FAQs, then test how your assistant responds.',
  },
  {
    question: 'Can a person take over the conversation?',
    answer:
      'Support247 includes a team inbox and human handoff. Enable and configure handoff for your chatbot so your team can pick up conversations that need their attention.',
  },
  {
    question: 'Do I need to build my own chat interface?',
    answer:
      'You can use the embeddable website widget or share your branded support page. Adding the widget requires access to your website’s code or a place to insert its embed snippet.',
  },
  {
    question: 'How do agents take actions?',
    answer:
      'Agents use connected tools and APIs to retrieve account details, check subscription status, and support your business workflows. Connect Custom Webhooks for your own systems, alongside Stripe, Shopify, and your other integrations.',
  },
  {
    question: 'What are the prices and usage limits?',
    answer:
      'Starter is $29 per month, Growth is $99 per month, and Scale is $249 per month, in USD. Contact sales for a larger setup. Our team will confirm included usage and billing arrangements before you activate a paid plan. Creating an account does not start a paid subscription.',
    link: '/contact',
    linkLabel: 'Ask about plan details',
  },
  {
    question: 'How should I handle customer data?',
    answer:
      'Review our security and privacy information before adding business content. Your team controls what it puts into the knowledge base. Avoid including information that should not appear in customer-facing answers.',
    link: '/security',
    linkLabel: 'Read about security',
  },
]
