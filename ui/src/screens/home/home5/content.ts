export const SIGNUP_URL = '/app/login?tab=register'

export const hero = {
  eyebrow: 'A little less repetition. A lot more support.',
  title: 'Turn your knowledge into helpful customer support.',
  description:
    'Give customers answers from your content, and bring your team into the conversation when they need more help.',
}

export const scenarios = [
  {
    id: 'question',
    label: 'Answer a common question',
    shortLabel: 'A quick answer',
    question: 'How do I look after my new linen shirt?',
    answer:
      'Wash it on a gentle cycle at 30°C with similar colours. Let it air dry, and use a warm iron while it’s still a little damp.',
    source: 'Linen care guide',
    excerpt:
      'Machine wash linen at 30°C on a gentle cycle. Air dry. Iron on a warm setting while slightly damp.',
    detail: 'An everyday question, answered from the shop’s own care guide.',
    result: 'Answered from sample content',
  },
  {
    id: 'source',
    label: 'Show an answer source',
    shortLabel: 'An answer with a source',
    question: 'Can I return something if it doesn’t fit?',
    answer:
      'Yes. In this sample shop, unworn items can be returned within 30 days of delivery, with their original tags attached.',
    source: 'Returns policy',
    excerpt:
      'Unworn items with original tags may be returned within 30 days of delivery.',
    detail: 'A visible source makes the answer easier to check.',
    result: 'Sample policy cited',
  },
  {
    id: 'handoff',
    label: 'Hand off to the team',
    shortLabel: 'A human when it matters',
    question: 'My order arrived damaged. Can someone help?',
    answer:
      'That needs a closer look. I’ll pass this conversation to the team so they can help with your damaged order.',
    source: 'Conversation shared with the team',
    excerpt:
      'Customer needs help with an order that arrived damaged. The conversation is ready for a teammate to review.',
    detail:
      'A simulated handoff. No real teammate is contacted in this example.',
    result: 'Sample handoff prepared',
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
    text: 'Connected to your store. Look up orders, check shipping, and answer product questions in real time without leaving the chat.',
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
      'Connect to your store & tools',
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
      'Support247 utilizes the Model Context Protocol (MCP) to seamlessly execute tool actions, like performing Shopify order lookups or processing Stripe billing events, rather than just regurgitating PDF text.',
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
