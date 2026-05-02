# FastAPI Multi-Agent Backend - UI Architecture Plan

## 🎨 Overview

Modern, responsive React-based UI for the FastAPI Multi-Agent Backend with support for:
- Agent management with switchable LLM models
- Document upload and RAG queries
- Workflow creation and execution
- Real-time task monitoring
- Interactive chat interface

## 🏗️ Technology Stack

### Frontend Framework
- **React 18** with TypeScript
- **Vite** for fast development and building
- **React Router v6** for navigation

### UI Components
- **shadcn/ui** - Modern, accessible components
- **Tailwind CSS** - Utility-first styling
- **Lucide React** - Beautiful icons
- **Radix UI** - Headless UI primitives

### State Management
- **TanStack Query (React Query)** - Server state management
- **Zustand** - Client state management
- **React Hook Form** - Form handling

### API Communication
- **Axios** - HTTP client
- **WebSocket** - Real-time updates

### Additional Libraries
- **Monaco Editor** - Code/JSON editing
- **React Markdown** - Markdown rendering
- **Recharts** - Data visualization
- **date-fns** - Date formatting

## 📁 Directory Structure

```
ui/
├── public/
│   ├── favicon.ico
│   └── logo.svg
├── src/
│   ├── components/
│   │   ├── ui/                    # shadcn/ui components
│   │   │   ├── button.tsx
│   │   │   ├── card.tsx
│   │   │   ├── dialog.tsx
│   │   │   ├── input.tsx
│   │   │   ├── select.tsx
│   │   │   ├── textarea.tsx
│   │   │   ├── tabs.tsx
│   │   │   ├── badge.tsx
│   │   │   ├── alert.tsx
│   │   │   └── ...
│   │   ├── layout/
│   │   │   ├── Header.tsx
│   │   │   ├── Sidebar.tsx
│   │   │   ├── Footer.tsx
│   │   │   └── Layout.tsx
│   │   ├── agents/
│   │   │   ├── AgentCard.tsx
│   │   │   ├── AgentForm.tsx
│   │   │   ├── AgentList.tsx
│   │   │   ├── AgentExecutor.tsx
│   │   │   └── ModelSelector.tsx
│   │   ├── documents/
│   │   │   ├── DocumentUpload.tsx
│   │   │   ├── DocumentList.tsx
│   │   │   ├── DocumentViewer.tsx
│   │   │   └── SearchResults.tsx
│   │   ├── rag/
│   │   │   ├── RAGChat.tsx
│   │   │   ├── RAGQueryForm.tsx
│   │   │   ├── SourceViewer.tsx
│   │   │   └── ModelSwitcher.tsx
│   │   ├── workflows/
│   │   │   ├── WorkflowBuilder.tsx
│   │   │   ├── WorkflowList.tsx
│   │   │   ├── WorkflowExecutor.tsx
│   │   │   └── StepEditor.tsx
│   │   ├── tasks/
│   │   │   ├── TaskList.tsx
│   │   │   ├── TaskMonitor.tsx
│   │   │   └── TaskLogs.tsx
│   │   └── common/
│   │       ├── LoadingSpinner.tsx
│   │       ├── ErrorBoundary.tsx
│   │       ├── CodeEditor.tsx
│   │       └── MarkdownRenderer.tsx
│   ├── pages/
│   │   ├── Dashboard.tsx
│   │   ├── Agents.tsx
│   │   ├── AgentDetail.tsx
│   │   ├── Documents.tsx
│   │   ├── RAGChat.tsx
│   │   ├── Workflows.tsx
│   │   ├── WorkflowDetail.tsx
│   │   ├── Tasks.tsx
│   │   └── Settings.tsx
│   ├── services/
│   │   ├── api.ts              # Axios instance
│   │   ├── agentService.ts     # Agent API calls
│   │   ├── documentService.ts  # Document API calls
│   │   ├── ragService.ts       # RAG API calls
│   │   ├── workflowService.ts  # Workflow API calls
│   │   ├── taskService.ts      # Task API calls
│   │   └── websocket.ts        # WebSocket connection
│   ├── hooks/
│   │   ├── useAgents.ts
│   │   ├── useDocuments.ts
│   │   ├── useRAG.ts
│   │   ├── useWorkflows.ts
│   │   ├── useTasks.ts
│   │   ├── useWebSocket.ts
│   │   └── useToast.ts
│   ├── store/
│   │   ├── agentStore.ts
│   │   ├── uiStore.ts
│   │   └── authStore.ts
│   ├── types/
│   │   ├── agent.ts
│   │   ├── document.ts
│   │   ├── workflow.ts
│   │   ├── task.ts
│   │   └── api.ts
│   ├── utils/
│   │   ├── formatters.ts
│   │   ├── validators.ts
│   │   ├── constants.ts
│   │   └── helpers.ts
│   ├── styles/
│   │   ├── globals.css
│   │   └── themes.css
│   ├── App.tsx
│   ├── main.tsx
│   └── vite-env.d.ts
├── .env.example
├── .eslintrc.json
├── .prettierrc
├── index.html
├── package.json
├── tsconfig.json
├── tailwind.config.js
├── vite.config.ts
└── README.md
```

## 🎯 Key Features & Pages

### 1. Dashboard
**Route:** `/`

**Features:**
- System health status
- Active agents count
- Recent tasks
- Document count
- Quick actions
- Usage statistics charts

**Components:**
- StatCard (agents, documents, tasks)
- RecentActivity
- QuickActions
- SystemHealth
- UsageChart (Recharts)

### 2. Agents Page
**Route:** `/agents`

**Features:**
- List all agents with filtering
- Create new agent with model selection
- Edit agent configuration
- Delete agent
- Execute agent with custom input
- Switch between OpenAI and Claude models
- View agent execution history

**Components:**
- AgentList (grid/list view)
- AgentCard (name, type, status, model)
- AgentForm (create/edit)
- ModelSelector (GPT-3.5, GPT-4, Claude dropdown)
- AgentExecutor (input form, model override)
- ExecutionHistory

**Model Selection UI:**
```
┌─────────────────────────────────┐
│ Select LLM Model                │
├─────────────────────────────────┤
│ Provider: [OpenAI ▼]            │
│                                 │
│ Model:                          │
│ ○ GPT-3.5 Turbo (Fast)         │
│ ● GPT-4 (Recommended)          │
│ ○ GPT-4 Turbo                  │
│ ○ GPT-4o                       │
│                                 │
│ Temperature: [0.7] ━━━━○━━━━   │
│ Max Tokens: [2000]             │
└─────────────────────────────────┘
```

### 3. Agent Detail Page
**Route:** `/agents/:id`

**Features:**
- Agent information
- Configuration editor (JSON)
- Execution interface
- Model switcher
- Execution history
- Performance metrics

**Components:**
- AgentInfo
- ConfigEditor (Monaco)
- ExecutionPanel
- ModelSwitcher
- HistoryTimeline
- MetricsChart

### 4. Documents Page
**Route:** `/documents`

**Features:**
- Upload documents (drag & drop)
- List documents with search
- View document content
- Delete documents
- Vector search interface
- Embedding status

**Components:**
- DocumentUpload (drag & drop zone)
- DocumentList (table with pagination)
- DocumentViewer (modal)
- SearchBar
- FilterPanel
- EmbeddingStatus

**Upload UI:**
```
┌─────────────────────────────────┐
│  📄 Drop files here or click    │
│                                 │
│  Supported: PDF, TXT, DOCX, MD  │
│  Max size: 10MB                 │
└─────────────────────────────────┘
```

### 5. RAG Chat Page
**Route:** `/rag`

**Features:**
- Interactive chat interface
- Model selection (GPT/Claude)
- Document source display
- Query history
- Export conversation
- Streaming responses
- Source highlighting

**Components:**
- ChatInterface
- MessageList
- MessageInput
- ModelSelector
- SourcePanel
- QueryHistory
- ExportButton

**Chat UI:**
```
┌─────────────────────────────────────────┐
│ Model: [GPT-4 ▼]  Top-K: [5]          │
├─────────────────────────────────────────┤
│                                         │
│ 👤 What is the refund policy?          │
│                                         │
│ 🤖 Based on the documents, our refund  │
│    policy allows returns within 30...  │
│                                         │
│    📚 Sources:                          │
│    • policy.pdf (p.3)                  │
│    • faq.md                            │
│                                         │
├─────────────────────────────────────────┤
│ [Type your question...]          [Send]│
└─────────────────────────────────────────┘
```

### 6. Workflows Page
**Route:** `/workflows`

**Features:**
- Visual workflow builder
- List workflows
- Create/edit workflows
- Execute workflows
- Monitor execution
- View results

**Components:**
- WorkflowBuilder (drag & drop)
- WorkflowList
- WorkflowForm
- StepEditor
- ExecutionMonitor
- ResultsViewer

**Workflow Builder:**
```
┌─────────────────────────────────┐
│ Workflow: Customer Support      │
├─────────────────────────────────┤
│                                 │
│  [Start]                        │
│     ↓                           │
│  [Agent 1: Classify]            │
│     ↓                           │
│  [Agent 2: Respond]             │
│     ↓                           │
│  [Agent 3: Quality Check]       │
│     ↓                           │
│  [End]                          │
│                                 │
│ [+ Add Step]                    │
└─────────────────────────────────┘
```

### 7. Tasks Page
**Route:** `/tasks`

**Features:**
- List all tasks
- Filter by status
- View task details
- Monitor progress
- View logs
- Cancel tasks

**Components:**
- TaskList (table)
- TaskCard
- TaskMonitor (real-time)
- TaskLogs (streaming)
- StatusBadge
- ProgressBar

### 8. Settings Page
**Route:** `/settings`

**Features:**
- API configuration
- Default model settings
- Theme selection
- Notification preferences
- API key management

**Components:**
- SettingsForm
- APIKeyManager
- ThemeSelector
- NotificationSettings

## 🎨 Design System

### Color Palette
```css
/* Light Mode */
--primary: #2563eb      /* Blue */
--secondary: #7c3aed    /* Purple */
--success: #10b981      /* Green */
--warning: #f59e0b      /* Amber */
--error: #ef4444        /* Red */
--background: #ffffff
--foreground: #0f172a

/* Dark Mode */
--primary: #3b82f6
--secondary: #8b5cf6
--success: #34d399
--warning: #fbbf24
--error: #f87171
--background: #0f172a
--foreground: #f1f5f9
```

### Typography
- **Headings:** Inter (font-weight: 600-700)
- **Body:** Inter (font-weight: 400-500)
- **Code:** JetBrains Mono

### Component Patterns

#### Cards
```tsx
<Card>
  <CardHeader>
    <CardTitle>Agent Name</CardTitle>
    <CardDescription>Description</CardDescription>
  </CardHeader>
  <CardContent>
    {/* Content */}
  </CardContent>
  <CardFooter>
    {/* Actions */}
  </CardFooter>
</Card>
```

#### Forms
```tsx
<Form>
  <FormField
    name="name"
    label="Agent Name"
    placeholder="Enter name"
    required
  />
  <FormField
    name="model"
    label="LLM Model"
    type="select"
    options={models}
  />
  <Button type="submit">Create Agent</Button>
</Form>
```

## 🔌 API Integration

### Service Layer Pattern
```typescript
// agentService.ts
export const agentService = {
  list: () => api.get('/agents'),
  get: (id: string) => api.get(`/agents/${id}`),
  create: (data: AgentCreate) => api.post('/agents', data),
  update: (id: string, data: AgentUpdate) => 
    api.put(`/agents/${id}`, data),
  delete: (id: string) => api.delete(`/agents/${id}`),
  execute: (id: string, data: ExecuteRequest) => 
    api.post(`/agents/${id}/execute`, data),
  getModels: () => api.get('/agents/models/available')
};
```

### React Query Hooks
```typescript
// useAgents.ts
export const useAgents = () => {
  return useQuery({
    queryKey: ['agents'],
    queryFn: agentService.list
  });
};

export const useCreateAgent = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: agentService.create,
    onSuccess: () => {
      queryClient.invalidateQueries(['agents']);
    }
  });
};
```

## 🔄 Real-time Features

### WebSocket Integration
```typescript
// useWebSocket.ts
export const useWebSocket = (url: string) => {
  const [messages, setMessages] = useState([]);
  
  useEffect(() => {
    const ws = new WebSocket(url);
    
    ws.onmessage = (event) => {
      const data = JSON.parse(event.data);
      setMessages(prev => [...prev, data]);
    };
    
    return () => ws.close();
  }, [url]);
  
  return messages;
};
```

### Task Monitoring
- Real-time status updates
- Progress indicators
- Log streaming
- Completion notifications

## 📱 Responsive Design

### Breakpoints
- **Mobile:** < 640px
- **Tablet:** 640px - 1024px
- **Desktop:** > 1024px

### Mobile Adaptations
- Collapsible sidebar
- Bottom navigation
- Simplified forms
- Touch-optimized controls

## 🚀 Performance Optimizations

### Code Splitting
```typescript
const Agents = lazy(() => import('./pages/Agents'));
const Documents = lazy(() => import('./pages/Documents'));
const RAGChat = lazy(() => import('./pages/RAGChat'));
```

### Caching Strategy
- React Query for server state
- LocalStorage for preferences
- IndexedDB for large data

### Optimizations
- Virtual scrolling for large lists
- Debounced search inputs
- Lazy loading images
- Memoized components

## 🧪 Testing Strategy

### Unit Tests
- Component rendering
- Hook behavior
- Utility functions

### Integration Tests
- API service calls
- Form submissions
- Navigation flows

### E2E Tests
- Critical user journeys
- Agent creation & execution
- Document upload & RAG query

## 📦 Build & Deployment

### Development
```bash
npm run dev
```

### Production Build
```bash
npm run build
npm run preview
```

### Docker
```dockerfile
FROM node:18-alpine
WORKDIR /app
COPY package*.json ./
RUN npm install
COPY . .
RUN npm run build
EXPOSE 3000
CMD ["npm", "run", "preview"]
```

## 🎯 User Flows

### Flow 1: Create and Execute Agent
1. Navigate to Agents page
2. Click "Create Agent"
3. Fill form (name, type, model)
4. Select LLM model (GPT-4 or Claude)
5. Save agent
6. Click "Execute"
7. Enter input
8. Optionally override model
9. View response

### Flow 2: Upload Document and Query
1. Navigate to Documents page
2. Drag & drop file
3. Wait for processing
4. Navigate to RAG Chat
5. Select model
6. Enter question
7. View answer with sources

### Flow 3: Build Workflow
1. Navigate to Workflows page
2. Click "Create Workflow"
3. Add agents as steps
4. Configure connections
5. Save workflow
6. Execute workflow
7. Monitor progress
8. View results

## 🔐 Security Considerations

- API key storage (environment variables)
- CORS configuration
- Input sanitization
- XSS prevention
- Rate limiting display

## 📊 Analytics & Monitoring

- Usage tracking
- Error logging
- Performance metrics
- User behavior analytics

## 🎨 Accessibility

- ARIA labels
- Keyboard navigation
- Screen reader support
- Color contrast compliance
- Focus indicators

## 🤝 Human-in-the-Loop (HITL) Features

### Overview
Human-in-the-Loop capabilities allow users to review, approve, modify, or reject agent actions before they are executed or finalized. This ensures quality control, compliance, and human oversight in critical workflows.

### HITL Components

#### 1. Approval Queue Component
**Location:** `src/components/hitl/ApprovalQueue.tsx`

**Features:**
- List of pending approvals
- Priority indicators
- Time remaining
- Quick actions (approve/reject)
- Batch operations

**UI Design:**
```
┌─────────────────────────────────────────────────────┐
│ Approval Queue                    [Filter ▼] [Sort ▼]│
├─────────────────────────────────────────────────────┤
│ ⚠️  HIGH PRIORITY                                    │
│ Agent Response Review                                │
│ Agent: Customer Support | Model: GPT-4              │
│ "I will process the refund of $500..."             │
│ [👁️ Review] [✓ Approve] [✗ Reject]                 │
│ ⏱️ 15 minutes remaining                              │
├─────────────────────────────────────────────────────┤
│ 📋 MEDIUM PRIORITY                                   │
│ Workflow Step Approval                               │
│ Workflow: Data Processing | Step 3/5                │
│ "Ready to send email to 1,000 customers"           │
│ [👁️ Review] [✓ Approve] [✗ Reject]                 │
│ ⏱️ 1 hour remaining                                  │
├─────────────────────────────────────────────────────┤
│ [Select All] [Approve Selected] [Reject Selected]   │
└─────────────────────────────────────────────────────┘
```

#### 2. Review Modal Component
**Location:** `src/components/hitl/ReviewModal.tsx`

**Features:**
- Full context display
- Input/output comparison
- Edit capabilities
- Confidence scores
- Source references
- Comment/feedback field
- Approval options

**UI Design:**
```
┌─────────────────────────────────────────────────────┐
│ Review Agent Response                          [✕]  │
├─────────────────────────────────────────────────────┤
│ Agent: Customer Support Agent                       │
│ Model: GPT-4 | Confidence: 92%                     │
│ Execution Time: 2.3s | Tokens: 450                 │
├─────────────────────────────────────────────────────┤
│ 📥 INPUT:                                           │
│ "Customer wants refund for order #12345"           │
│                                                     │
│ 📤 PROPOSED OUTPUT:                                 │
│ ┌─────────────────────────────────────────────┐   │
│ │ Dear Customer,                               │   │
│ │                                              │   │
│ │ I've reviewed your refund request for       │   │
│ │ order #12345. I will process a refund of    │   │
│ │ $500 to your original payment method.       │   │
│ │                                              │   │
│ │ [Edit Response] 📝                           │   │
│ └─────────────────────────────────────────────┘   │
│                                                     │
│ 📚 SOURCES USED:                                    │
│ • Refund Policy (policy.pdf)                       │
│ • Order Database (order #12345)                    │
│                                                     │
│ 💬 FEEDBACK (Optional):                             │
│ [Add comments for improvement...]                  │
│                                                     │
│ ⚙️ ACTIONS:                                         │
│ [✓ Approve & Execute]                              │
│ [📝 Approve with Edits]                            │
│ [⏸️ Request Changes]                                │
│ [✗ Reject]                                         │
└─────────────────────────────────────────────────────┘
```

#### 3. Workflow Checkpoint Component
**Location:** `src/components/hitl/WorkflowCheckpoint.tsx`

**Features:**
- Pause workflow at checkpoints
- Review intermediate results
- Modify parameters
- Continue or abort
- Checkpoint history

**UI Design:**
```
┌─────────────────────────────────────────────────────┐
│ Workflow Checkpoint: Data Processing                │
├─────────────────────────────────────────────────────┤
│ Progress: ████████░░░░░░░░ 3/5 Steps Complete      │
│                                                     │
│ ✓ Step 1: Data Collection (Completed)              │
│ ✓ Step 2: Data Validation (Completed)              │
│ ⏸️ Step 3: Data Transformation (Awaiting Approval)  │
│ ⏹️ Step 4: Data Export (Pending)                    │
│ ⏹️ Step 5: Notification (Pending)                   │
│                                                     │
│ 📊 CURRENT RESULTS:                                 │
│ • Records processed: 1,000                          │
│ • Errors found: 5                                   │
│ • Estimated completion: 10 minutes                  │
│                                                     │
│ ⚠️ CHECKPOINT REASON:                               │
│ "High error rate detected (0.5%). Review required  │
│  before proceeding with transformation."           │
│                                                     │
│ 🔧 ACTIONS:                                         │
│ [👁️ Review Errors]                                  │
│ [⚙️ Adjust Parameters]                              │
│ [▶️ Continue Workflow]                              │
│ [⏸️ Pause Workflow]                                 │
│ [⏹️ Stop Workflow]                                  │
└─────────────────────────────────────────────────────┘
```

#### 4. Confidence Threshold Settings
**Location:** `src/components/hitl/ConfidenceSettings.tsx`

**Features:**
- Set confidence thresholds
- Auto-approve high confidence
- Auto-reject low confidence
- Manual review for medium confidence
- Per-agent configuration

**UI Design:**
```
┌─────────────────────────────────────────────────────┐
│ Confidence Threshold Settings                       │
├─────────────────────────────────────────────────────┤
│ Agent: Customer Support Agent                       │
│                                                     │
│ Auto-Approve Threshold:                             │
│ ━━━━━━━━━━━━━━━━━━━━○━━━━━━━━━━ 95%               │
│ Responses with ≥95% confidence will be              │
│ automatically approved                              │
│                                                     │
│ Manual Review Range:                                │
│ ━━━━━━━━━○━━━━━━━━━━━━━━━━━━━━━━ 70% - 95%        │
│ Responses in this range require human review       │
│                                                     │
│ Auto-Reject Threshold:                              │
│ ━━━━━━━━━○━━━━━━━━━━━━━━━━━━━━━━ <70%             │
│ Responses below 70% will be automatically rejected  │
│                                                     │
│ ☑️ Enable notifications for manual reviews          │
│ ☑️ Log all auto-approved actions                    │
│ ☐ Require dual approval for high-value actions     │
│                                                     │
│ [Save Settings]                                     │
└─────────────────────────────────────────────────────┘
```

#### 5. Audit Trail Component
**Location:** `src/components/hitl/AuditTrail.tsx`

**Features:**
- Complete history of approvals/rejections
- User actions log
- Timestamps
- Reasoning/comments
- Export capability

**UI Design:**
```
┌─────────────────────────────────────────────────────┐
│ Audit Trail                      [Export] [Filter]  │
├─────────────────────────────────────────────────────┤
│ 2024-05-02 15:30:45                                 │
│ ✓ APPROVED by John Doe                              │
│ Agent Response #12345                               │
│ Comment: "Verified refund amount is correct"       │
│ [View Details]                                      │
├─────────────────────────────────────────────────────┤
│ 2024-05-02 15:25:12                                 │
│ ✗ REJECTED by Jane Smith                            │
│ Workflow Step #67890                                │
│ Comment: "Email content needs revision"            │
│ [View Details]                                      │
├─────────────────────────────────────────────────────┤
│ 2024-05-02 15:20:33                                 │
│ 📝 EDITED & APPROVED by John Doe                    │
│ Agent Response #12344                               │
│ Changes: Modified refund amount from $500 to $450   │
│ [View Details] [View Diff]                         │
└─────────────────────────────────────────────────────┘
```

### HITL Pages

#### 1. Approvals Dashboard
**Route:** `/approvals`

**Features:**
- Overview of pending approvals
- Priority queue
- Statistics (approved/rejected/pending)
- Quick filters
- Bulk actions

**Components:**
- ApprovalStats
- ApprovalQueue
- QuickFilters
- BulkActions

#### 2. Review Detail Page
**Route:** `/approvals/:id`

**Features:**
- Full approval context
- Edit capabilities
- History
- Related approvals
- Decision tracking

### HITL Workflow Integration

#### Workflow Builder with Checkpoints
```
┌─────────────────────────────────────────────────────┐
│ Workflow Builder                                    │
├─────────────────────────────────────────────────────┤
│                                                     │
│  [Start]                                            │
│     ↓                                               │
│  [Agent 1: Classify]                                │
│     ↓                                               │
│  [🚦 Checkpoint: Review Classification]             │
│     ↓                                               │
│  [Agent 2: Generate Response]                       │
│     ↓                                               │
│  [🚦 Checkpoint: Approve Response]                  │
│     ↓                                               │
│  [Agent 3: Send Email]                              │
│     ↓                                               │
│  [End]                                              │
│                                                     │
│ [+ Add Step] [+ Add Checkpoint]                    │
└─────────────────────────────────────────────────────┘
```

### HITL Configuration Options

#### Agent-Level HITL Settings
```typescript
interface HITLConfig {
  enabled: boolean;
  confidenceThreshold: number;
  autoApproveAbove: number;
  autoRejectBelow: number;
  requireApprovalFor: string[];  // e.g., ["refunds", "deletions"]
  approvers: string[];           // User IDs
  timeout: number;               // Minutes before auto-action
  escalationRules: EscalationRule[];
}
```

#### Workflow-Level HITL Settings
```typescript
interface WorkflowHITL {
  checkpoints: Checkpoint[];
  pauseOnError: boolean;
  requireDualApproval: boolean;
  notifyOnPause: boolean;
  maxWaitTime: number;
}
```

### HITL API Endpoints

```typescript
// Backend endpoints needed
POST   /api/v1/approvals              // Create approval request
GET    /api/v1/approvals              // List pending approvals
GET    /api/v1/approvals/:id          // Get approval details
POST   /api/v1/approvals/:id/approve  // Approve with optional edits
POST   /api/v1/approvals/:id/reject   // Reject with reason
POST   /api/v1/approvals/:id/edit     // Edit and approve
GET    /api/v1/approvals/audit        // Get audit trail
POST   /api/v1/workflows/:id/pause    // Pause at checkpoint
POST   /api/v1/workflows/:id/resume   // Resume workflow
```

### HITL Notification System

#### Real-time Notifications
```
┌─────────────────────────────────────┐
│ 🔔 Notifications              [3]   │
├─────────────────────────────────────┤
│ ⚠️ High Priority Approval Needed    │
│ Customer refund request             │
│ 5 minutes ago                       │
│ [Review Now]                        │
├─────────────────────────────────────┤
│ ⏰ Approval Timeout Warning          │
│ Workflow checkpoint expires in 10m  │
│ 12 minutes ago                      │
│ [Review Now]                        │
├─────────────────────────────────────┤
│ ✓ Approval Processed                │
│ Your approval was executed          │
│ 1 hour ago                          │
│ [View Details]                      │
└─────────────────────────────────────┘
```

### HITL User Roles & Permissions

#### Role-Based Approvals
```typescript
enum ApprovalRole {
  REVIEWER = "reviewer",        // Can review and approve
  SENIOR_REVIEWER = "senior",   // Can approve high-value
  ADMIN = "admin",              // Can configure HITL
  AUDITOR = "auditor"           // Read-only audit access
}

interface ApprovalPermissions {
  canApprove: boolean;
  canReject: boolean;
  canEdit: boolean;
  maxApprovalValue: number;
  requiresDualApproval: boolean;
}
```

### HITL Analytics Dashboard

**Features:**
- Approval rate metrics
- Average review time
- User performance
- Bottleneck identification
- Trend analysis

**UI Design:**
```
┌─────────────────────────────────────────────────────┐
│ HITL Analytics                                      │
├─────────────────────────────────────────────────────┤
│ Today's Metrics:                                    │
│ • Pending: 12                                       │
│ • Approved: 45 (85%)                                │
│ • Rejected: 8 (15%)                                 │
│ • Avg Review Time: 3.5 minutes                      │
│                                                     │
│ [Approval Rate Chart]                               │
│ [Review Time Trend]                                 │
│ [Top Reviewers]                                     │
│ [Common Rejection Reasons]                          │
└─────────────────────────────────────────────────────┘
```

### HITL Best Practices

1. **Clear Context**: Always provide full context for decisions
2. **Time Limits**: Set reasonable timeouts with escalation
3. **Batch Operations**: Allow bulk approvals for efficiency
4. **Audit Trail**: Log all decisions with reasoning
5. **Notifications**: Real-time alerts for urgent approvals
6. **Confidence Scores**: Use AI confidence to prioritize
7. **Edit Capability**: Allow modifications before approval
8. **Dual Approval**: Require for high-risk actions
9. **Analytics**: Track metrics to improve process
10. **Training**: Use rejections to improve agent performance

---

This UI will provide a modern, intuitive interface for all FastAPI Multi-Agent Backend features with seamless model switching between OpenAI and Claude models, plus comprehensive Human-in-the-Loop capabilities for quality control and oversight!