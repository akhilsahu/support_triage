export const yulloPublicPages = {
  about: {
    title: 'A place for the whole of you.',
    label: 'About Yullo',
    description: 'Bring your work, ideas and story into one Space, with an Aura people can talk to.',
    sections: [
      { title: 'More than another link', body: 'You put a little of yourself into everything you make. Yullo brings those pieces together, so people can understand what matters to you and find a way to connect.' },
      { title: 'Your Space. Your voice.', body: 'Create a Space for yourself, your business, your work or your community. Add the information you want to share and choose what becomes public.' },
      { title: 'Meet your Aura', body: 'Aura gives visitors a way to ask questions about your Space. It uses the knowledge you make available there, helping a first visit become a conversation.' },
    ],
  },
  manifesto: {
    title: 'Behind every link, there’s a person.',
    label: 'The Yullo manifesto',
    description: 'The internet should help us find each other, understand each other and start something meaningful.',
    sections: [
      { title: 'Let people see what you care about', body: 'Your work has a story. Your ideas have a reason. You deserve a place where those things can be understood together.' },
      { title: 'Make room for a conversation', body: 'Finding someone should be the beginning. A question, an answer or a shared interest can be the first step toward something that matters.' },
      { title: 'Keep the choice yours', body: 'You decide what belongs in your Space and what you share. Connection starts with trust and the freedom to show up as yourself.' },
    ],
  },
  contact: {
    title: 'We’d love to hear from you.',
    label: 'Contact Yullo',
    description: 'Have a question, an idea or something that needs fixing? Get in touch with the Yullo team.',
    sections: [
      { title: 'Talk to our team', body: 'Email hello@yullo.co for help with Yullo, feedback, partnerships or questions about your account. Include the link to your Space if it helps explain the issue. Never send passwords or verification codes.' },
      { title: 'Questions about a Space?', body: 'Open the Space and ask its Aura, or use the contact details its owner has chosen to share. Each Space is managed by its owner.' },
    ],
  },
  privacy: {
    title: 'Your privacy on Yullo.',
    label: 'Privacy Policy',
    description: 'How information is used when you create a Space or talk to an Aura on Yullo.',
    sections: [
      { title: 'Your account and Space', body: 'Yullo processes the account details used to sign in, such as your email, phone number or connected Google identity. We also store the information and sources you add to manage your Space and provide its features.' },
      { title: 'What becomes public', body: 'Published Space names, handles, images and public information can be seen by visitors. Published Spaces may appear in Explore apps. Share only information you are comfortable making available to that audience.' },
      { title: 'Conversations and Aura', body: 'Messages sent to an Aura are processed to generate replies and may be stored as conversation history. Relevant messages and authorized Space information may be processed by the AI providers configured for the service. Avoid sharing sensitive personal information in chat.' },
      { title: 'Cookies and local storage', body: 'Yullo uses session cookies to keep you signed in and browser storage for preferences and chat continuity. Some browser settings may prevent these features from working.' },
      { title: 'Questions about your data', body: 'Contact hello@yullo.co about access, corrections, deletion or other privacy questions. Include enough detail to identify your account or Space without sharing passwords or verification codes.' },
    ],
  },
  terms: {
    title: 'Using Yullo, together.',
    label: 'Terms of Service',
    description: 'The responsibilities that come with creating a Space and using Aura.',
    sections: [
      { title: 'Use Yullo responsibly', body: 'Use Yullo lawfully and respect other people. Do not impersonate others, publish content you have no right to share, distribute harmful material or attempt to access another person’s private information.' },
      { title: 'Your account and content', body: 'Keep access to your account secure. You are responsible for the content you add and the information you choose to publish. Adding content allows Yullo to store and process it to provide your Space and its features.' },
      { title: 'Aura replies', body: 'Aura generates responses from the information available to it and can make mistakes. Check important information with the Space owner or an appropriate professional before acting on it.' },
      { title: 'Spaces and availability', body: 'A handle availability check does not reserve a name. Availability can change before you claim it. Space owners manage their own information, and access to a Space may change when it is updated, unpublished or removed.' },
      { title: 'Contact', body: 'For questions about these terms or to report misuse, contact hello@yullo.co. Include the relevant Space link and a brief explanation.' },
    ],
  },
} as const

export type YulloPublicPage = keyof typeof yulloPublicPages
