# OrchestraSupport UI

Simple and functional React + TypeScript UI for the OrchestraSupport AI Multi-Agent System.

## Features

- 💬 **Real-time Chat Interface** - Interactive chat with AI agents
- 🤖 **Agent Status Dashboard** - Monitor all three agents (Triage, Logistics, Finance)
- 🎨 **Modern UI** - Built with React, TypeScript, and Tailwind CSS
- ⚡ **Fast Development** - Powered by Vite

## Tech Stack

- **React 18** - UI framework
- **TypeScript** - Type safety
- **Tailwind CSS** - Styling
- **Vite** - Build tool
- **Lucide React** - Icons

## Setup

### Prerequisites

- Node.js 18+ and npm

### Installation

```bash
# Install dependencies
npm install

# Start development server
npm run dev
```

The UI will be available at `http://localhost:5173`

## Available Scripts

- `npm run dev` - Start development server
- `npm run build` - Build for production
- `npm run preview` - Preview production build
- `npm run lint` - Run ESLint
- `npm run type-check` - Run TypeScript type checking

## Project Structure

```
ui/
├── src/
│   ├── App.tsx          # Main application component
│   ├── main.tsx         # Application entry point
│   └── index.css        # Global styles with Tailwind
├── index.html           # HTML template
├── package.json         # Dependencies
├── tsconfig.json        # TypeScript config
├── vite.config.ts       # Vite config
├── tailwind.config.js   # Tailwind config
└── postcss.config.js    # PostCSS config
```

## Features Overview

### Chat Interface
- Send messages to AI agents
- View agent responses with timestamps
- See which agent is handling your request
- Real-time sentiment analysis display

### Agent Dashboard
- Monitor status of all three agents:
  - **Triage Agent** (Blue) - Routes requests and analyzes sentiment
  - **Logistics Agent** (Green) - Handles shipping and delivery
  - **Finance Agent** (Purple) - Manages refunds and credits
- View task completion counts
- Real-time status indicators (idle/active/processing)

## Connecting to Backend

To connect to the FastAPI backend (when implemented):

1. Update the API base URL in a new `src/config.ts` file:
```typescript
export const API_BASE_URL = 'http://localhost:8000'
```

2. The backend should be running on `http://localhost:8000`

## Future Enhancements

- [ ] Real API integration with FastAPI backend
- [ ] WebSocket support for real-time updates
- [ ] Ticket management interface
- [ ] Human-in-the-loop approval workflow
- [ ] Analytics dashboard
- [ ] Agent configuration panel

## Development

The UI is designed to be simple and functional, focusing on:
- Clean, modern interface
- Easy to understand code structure
- Responsive design
- Accessibility

## License

Part of the OrchestraSupport project.