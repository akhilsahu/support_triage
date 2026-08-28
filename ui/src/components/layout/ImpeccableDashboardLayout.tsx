import React, { useState, useRef, useEffect } from 'react';
import { LucideIcon, LayoutDashboard, Settings, User, Bell, Search, Activity, Zap, Shield, Sun, Moon, Droplets, Coffee, Type, Bot, MessageSquare, Database } from 'lucide-react';
import clsx from 'clsx';
import { CopilotKit, useCopilotReadable, useCopilotAction } from '@copilotkit/react-core';
import { CopilotPopup } from '@copilotkit/react-ui';
import '@copilotkit/react-ui/styles.css';
import { useLocation, useNavigate } from 'react-router-dom';

// --- Local Storage Hook ---
function useLocalStorage<T>(key: string, initialValue: T) {
  const [storedValue, setStoredValue] = useState<T>(() => {
    if (typeof window === "undefined") return initialValue;
    try {
      const item = window.localStorage.getItem(key);
      return item ? JSON.parse(item) : initialValue;
    } catch (error) {
      console.warn(error);
      return initialValue;
    }
  });
  
  const setValue = (value: T | ((val: T) => T)) => {
    try {
      const valueToStore = value instanceof Function ? value(storedValue) : value;
      setStoredValue(valueToStore);
      if (typeof window !== "undefined") {
        window.localStorage.setItem(key, JSON.stringify(valueToStore));
      }
    } catch (error) {
      console.warn(error);
    }
  };
  
  return [storedValue, setValue] as const;
}

// --- Impeccable Sidebar ---
interface ImpeccableSidebarProps {
  activeTab: string;
  setActiveTab: (tab: string) => void;
  trackingClass: string;
}

const NAV_ITEMS = [
  { id: '/app/dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { id: '/app/chat', label: 'Chat', icon: MessageSquare },
  { id: '/app/agents', label: 'Agents', icon: Bot },
  { id: '/app/inbox', label: 'Inbox', icon: Bell },
  { id: '/app/knowledge-base', label: 'Knowledge Base', icon: Database },
  { id: '/app/analytics', label: 'Analytics', icon: Activity },
  { id: '/app/settings', label: 'Settings', icon: Settings },
];

export const ImpeccableSidebar: React.FC<ImpeccableSidebarProps> = ({ activeTab, setActiveTab, trackingClass }) => {
  return (
    <aside className="w-64 h-full flex flex-col pt-8 pb-6 px-4 border-r border-[var(--impeccable-border)] animate-stagger-1 glass-impeccable z-10 sticky top-0 shadow-[4px_0_24px_-10px_rgba(0,0,0,0.5)] relative overflow-hidden">
      {/* Decorative side flare */}
      <div className="absolute top-0 left-0 w-1 h-full bg-gradient-to-b from-transparent via-[var(--impeccable-accent)] to-transparent opacity-20" />
      
      <div className="flex items-center gap-3 px-2 mb-12 relative group cursor-pointer">
        <div className={clsx("w-8 h-8 rounded-lg bg-[var(--impeccable-accent)] flex items-center justify-center text-white font-bold shadow-[0_0_15px_var(--impeccable-accent)] transition-transform group-hover:scale-105 duration-300", trackingClass)}>
          OS
        </div>
        <h1 className={clsx("text-xl font-bold bg-gradient-to-r from-[var(--impeccable-text)] to-[var(--impeccable-text-muted)] bg-clip-text text-transparent", trackingClass)}>Orchestra</h1>
      </div>
      
      <nav className="flex-1 space-y-2 relative z-10">
        {NAV_ITEMS.map((item) => {
          const Icon = item.icon;
          const isActive = activeTab === item.id;
          return (
            <button
              key={item.id}
              onClick={() => setActiveTab(item.id)}
              className={clsx(
                "w-full flex items-center gap-3 px-4 py-3 rounded-xl transition-all duration-300 ease-out active-press text-sm font-medium group",
                trackingClass,
                isActive || activeTab.startsWith(item.id)
                  ? "bg-[var(--impeccable-border)] text-[var(--impeccable-accent)] shadow-[inset_0_1px_0_rgba(255,255,255,0.05)]" 
                  : "text-[var(--impeccable-text-muted)] hover:text-[var(--impeccable-text)] hover:bg-[var(--impeccable-border)]"
              )}
            >
              <Icon size={18} className={clsx("transition-all duration-300", isActive || activeTab.startsWith(item.id) ? "text-[var(--impeccable-accent)] drop-shadow-[0_0_8px_var(--impeccable-accent)] scale-110" : "opacity-70 group-hover:scale-110 group-hover:text-[var(--impeccable-accent)]")} />
              {item.label}
            </button>
          );
        })}
      </nav>
      
      <div className="mt-auto px-2 relative z-10">
        <button className={clsx("w-full flex items-center gap-3 px-4 py-3 rounded-xl text-[var(--impeccable-text-muted)] hover:text-[var(--impeccable-text)] transition-colors active-press text-sm font-medium group", trackingClass)}>
          <User size={18} className="group-hover:scale-110 transition-transform" />
          Profile
        </button>
      </div>
    </aside>
  );
};

// --- Impeccable Header ---
interface ImpeccableHeaderProps {
  trackingClass: string;
  currentTheme: string;
  setTheme: (theme: string) => void;
  currentTracking: string;
  setTracking: (tracking: string) => void;
  isCopilotEnabled: boolean;
  setIsCopilotEnabled: (enabled: boolean) => void;
}

export const ImpeccableHeader: React.FC<ImpeccableHeaderProps> = ({ trackingClass, currentTheme, setTheme, currentTracking, setTracking, isCopilotEnabled, setIsCopilotEnabled }) => {
  return (
    <header className="h-20 flex items-center justify-between px-8 animate-stagger-2 relative z-10">
      <div className="flex items-center gap-4 flex-1">
        <div className="relative w-96 group">
          <Search size={16} className="absolute left-4 top-1/2 -translate-y-1/2 text-[var(--impeccable-text-muted)] group-focus-within:text-[var(--impeccable-accent)] transition-colors" />
          <input 
            type="text" 
            placeholder="Search resources, commands, or agents..." 
            className={clsx(
              "w-full bg-[var(--impeccable-surface)] border border-[var(--impeccable-border)] text-[var(--impeccable-text)] rounded-full pl-11 pr-4 py-2.5 focus:outline-none focus:border-[var(--impeccable-accent)] focus:ring-1 focus:ring-[var(--impeccable-accent)] focus:shadow-[0_0_20px_var(--impeccable-accent)] transition-all placeholder:text-[var(--impeccable-text-muted)] text-sm glass-impeccable-card",
              trackingClass
            )}
          />
        </div>
      </div>
      
      <div className="flex items-center gap-2 mr-6">
        <button onClick={() => setTheme('theme-light')} className={clsx("w-8 h-8 flex justify-center items-center rounded-full hover:bg-[var(--impeccable-border)] hover:scale-110 transition-transform active-press", currentTheme === 'theme-light' ? 'bg-[var(--impeccable-border)] text-[var(--impeccable-accent)]' : 'text-[var(--impeccable-text-muted)]')} title="Light Mode"><Sun size={16} /></button>
        <button onClick={() => setTheme('theme-dark')} className={clsx("w-8 h-8 flex justify-center items-center rounded-full hover:bg-[var(--impeccable-border)] hover:scale-110 transition-transform active-press", currentTheme === 'theme-dark' ? 'bg-[var(--impeccable-border)] text-[var(--impeccable-accent)]' : 'text-[var(--impeccable-text-muted)]')} title="Dark Mode"><Moon size={16} /></button>
        
        <div className="w-px h-4 bg-[var(--impeccable-border)] mx-1"></div>
        
        <button onClick={() => setTheme('theme-beige')} className={clsx("w-8 h-8 flex justify-center items-center rounded-full hover:bg-[var(--impeccable-border)] hover:scale-110 transition-transform active-press", currentTheme === 'theme-beige' ? 'bg-[var(--impeccable-border)] text-[var(--impeccable-accent)]' : 'text-[var(--impeccable-text-muted)]')} title="Vibrant Beige"><Coffee size={16} /></button>
        <button onClick={() => setTheme('theme-dark-beige')} className={clsx("w-8 h-8 flex justify-center items-center rounded-full hover:bg-[var(--impeccable-border)] hover:scale-110 transition-transform active-press", currentTheme === 'theme-dark-beige' ? 'bg-[var(--impeccable-border)] text-[var(--impeccable-accent)]' : 'text-[var(--impeccable-text-muted)]')} title="Dark Beige"><Coffee size={16} className="fill-current opacity-50" /></button>
        
        <div className="w-px h-4 bg-[var(--impeccable-border)] mx-1"></div>
        
        <button onClick={() => setTheme('theme-teal')} className={clsx("w-8 h-8 flex justify-center items-center rounded-full hover:bg-[var(--impeccable-border)] hover:scale-110 transition-transform active-press", currentTheme === 'theme-teal' ? 'bg-[var(--impeccable-border)] text-[var(--impeccable-accent)]' : 'text-[var(--impeccable-text-muted)]')} title="Teal Theme"><Droplets size={16} /></button>
        <button onClick={() => setTheme('theme-purple')} className={clsx("w-8 h-8 flex justify-center items-center rounded-full hover:bg-[var(--impeccable-border)] hover:scale-110 transition-transform active-press", currentTheme === 'theme-purple' ? 'bg-[var(--impeccable-border)] text-[var(--impeccable-accent)]' : 'text-[var(--impeccable-text-muted)]')} title="Purple Theme"><Activity size={16} /></button>
        <button onClick={() => setTheme('theme-emerald')} className={clsx("w-8 h-8 flex justify-center items-center rounded-full hover:bg-[var(--impeccable-border)] hover:scale-110 transition-transform active-press", currentTheme === 'theme-emerald' ? 'bg-[var(--impeccable-border)] text-[var(--impeccable-accent)]' : 'text-[var(--impeccable-text-muted)]')} title="Emerald Theme"><Activity size={16} className="rotate-90" /></button>
        
        <div className="w-px h-6 bg-[var(--impeccable-border)] mx-2"></div>
        
        <button onClick={() => setTracking('tracking-normal')} className={clsx("w-8 h-8 flex justify-center items-center rounded-full hover:bg-[var(--impeccable-border)] hover:scale-110 transition-transform active-press", currentTracking === 'tracking-normal' ? 'bg-[var(--impeccable-border)] text-[var(--impeccable-accent)]' : 'text-[var(--impeccable-text-muted)]')} title="Standard Text"><Type size={16} /></button>
        <button onClick={() => setTracking('tracking-wide')} className={clsx("w-8 h-8 flex justify-center items-center rounded-full hover:bg-[var(--impeccable-border)] hover:scale-110 transition-transform active-press", currentTracking === 'tracking-wide' ? 'bg-[var(--impeccable-border)] text-[var(--impeccable-accent)]' : 'text-[var(--impeccable-text-muted)]')} title="Wide Text"><span className="text-xs font-bold tracking-wide">W</span></button>
        <button onClick={() => setTracking('tracking-ultra-wide')} className={clsx("w-8 h-8 flex justify-center items-center rounded-full hover:bg-[var(--impeccable-border)] hover:scale-110 transition-transform active-press", currentTracking === 'tracking-ultra-wide' ? 'bg-[var(--impeccable-border)] text-[var(--impeccable-accent)]' : 'text-[var(--impeccable-text-muted)]')} title="Ultra Wide Text"><span className="text-xs font-bold tracking-ultra-wide">UW</span></button>
        
        <div className="w-px h-6 bg-[var(--impeccable-border)] mx-2"></div>
        
        <button 
          onClick={() => setIsCopilotEnabled(!isCopilotEnabled)} 
          className={clsx(
            "w-8 h-8 flex justify-center items-center rounded-full hover:scale-110 transition-transform active-press shadow-lg", 
            isCopilotEnabled ? 'bg-[var(--impeccable-accent)] text-white' : 'bg-[var(--impeccable-border)] text-[var(--impeccable-text-muted)] hover:text-[var(--impeccable-accent)]'
          )} 
          title="Toggle Copilot"
        >
          <Bot size={16} />
        </button>
      </div>

      <div className="flex items-center gap-4">
        <button className="w-10 h-10 flex items-center justify-center rounded-full hover:bg-[var(--impeccable-border)] transition-colors active-press relative group">
          <Bell size={18} className="text-[var(--impeccable-text-muted)] group-hover:text-[var(--impeccable-text)] group-hover:animate-bounce" />
          <span className="absolute top-2.5 right-2.5 w-2 h-2 bg-[var(--impeccable-accent)] rounded-full border-2 border-[var(--impeccable-bg)] shadow-[0_0_10px_var(--impeccable-accent)]"></span>
        </button>
        <button className="w-9 h-9 rounded-full bg-gradient-to-br from-[var(--impeccable-accent)] to-[var(--impeccable-text-muted)] border border-white/10 active-press shadow-[0_0_15px_var(--impeccable-accent)] hover:scale-110 transition-transform"></button>
      </div>
    </header>
  );
};

// --- Impeccable Card (Spotlight & Tilt) ---
interface ImpeccableCardProps {
  title: string;
  value: string;
  trend?: string;
  trendUp?: boolean;
  delayClass?: string;
  trackingClass: string;
}

export const ImpeccableCard: React.FC<ImpeccableCardProps> = ({ title, value, trend, trendUp, delayClass = 'animate-stagger-3', trackingClass }) => {
  const cardRef = useRef<HTMLDivElement>(null);

  const handleMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!cardRef.current) return;
    const rect = cardRef.current.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    
    // Set variables for the spotlight pseudo-elements
    cardRef.current.style.setProperty('--mouse-x', `${x}px`);
    cardRef.current.style.setProperty('--mouse-y', `${y}px`);
    
    // 3D tilt effect calculations (max 5 degrees)
    const centerX = rect.width / 2;
    const centerY = rect.height / 2;
    const rotateX = ((y - centerY) / centerY) * -5;
    const rotateY = ((x - centerX) / centerX) * 5;
    cardRef.current.style.transform = `perspective(1000px) rotateX(${rotateX}deg) rotateY(${rotateY}deg) scale3d(1.02, 1.02, 1.02)`;
  };

  const handleMouseLeave = () => {
    if (!cardRef.current) return;
    cardRef.current.style.transform = `perspective(1000px) rotateX(0deg) rotateY(0deg) scale3d(1, 1, 1)`;
  };

  return (
    <div 
      ref={cardRef}
      onMouseMove={handleMouseMove}
      onMouseLeave={handleMouseLeave}
      className={clsx("p-6 glass-impeccable-card flex flex-col gap-4 spotlight-card transition-all duration-300 ease-out cursor-default z-10", delayClass)}
    >
      <h3 className={clsx("text-sm font-medium uppercase bg-gradient-to-r from-[var(--impeccable-text-muted)] to-[var(--impeccable-text)] bg-clip-text text-transparent", trackingClass)}>{title}</h3>
      <div className="flex items-end justify-between">
        <span className={clsx("text-4xl font-light text-[var(--impeccable-text)] tabular-nums", trackingClass)}>{value}</span>
        {trend && (
          <span className={clsx("text-sm font-medium flex items-center gap-1", trackingClass, trendUp ? "text-emerald-400 drop-shadow-[0_0_5px_rgba(52,211,153,0.5)]" : "text-rose-400 drop-shadow-[0_0_5px_rgba(251,113,133,0.5)]")}>
            {trendUp ? '+' : ''}{trend}
          </span>
        )}
      </div>
    </div>
  );
};

// --- Graphical Chart Component ---
export const AnimatedChart: React.FC = () => {
  return (
    <div className="w-full h-full flex flex-col items-center justify-center relative">
      <svg className="absolute inset-0 w-full h-full" preserveAspectRatio="none" viewBox="0 0 1000 200">
        <defs>
          <linearGradient id="chartGradient" x1="0%" y1="0%" x2="0%" y2="100%">
            <stop offset="0%" stopColor="var(--impeccable-accent)" stopOpacity="0.4" />
            <stop offset="100%" stopColor="var(--impeccable-accent)" stopOpacity="0" />
          </linearGradient>
          <filter id="glow">
            <feGaussianBlur stdDeviation="3" result="coloredBlur"/>
            <feMerge>
              <feMergeNode in="coloredBlur"/>
              <feMergeNode in="SourceGraphic"/>
            </feMerge>
          </filter>
        </defs>
        
        {/* Animated Grid Lines */}
        <line x1="0" y1="50" x2="1000" y2="50" stroke="var(--impeccable-border)" strokeWidth="1" strokeDasharray="4 4" className="opacity-50" />
        <line x1="0" y1="100" x2="1000" y2="100" stroke="var(--impeccable-border)" strokeWidth="1" strokeDasharray="4 4" className="opacity-50" />
        <line x1="0" y1="150" x2="1000" y2="150" stroke="var(--impeccable-border)" strokeWidth="1" strokeDasharray="4 4" className="opacity-50" />

        {/* The Animated Line */}
        <path 
          d="M0,180 C150,180 200,80 350,100 C500,120 600,40 750,70 C900,100 950,20 1000,40" 
          fill="none" 
          stroke="var(--impeccable-accent)" 
          strokeWidth="4"
          filter="url(#glow)"
          strokeLinecap="round"
          className="chart-line-animate"
          strokeDasharray="2000"
          strokeDashoffset="2000"
        />
        {/* The Animated Fill */}
        <path 
          d="M0,180 C150,180 200,80 350,100 C500,120 600,40 750,70 C900,100 950,20 1000,40 L1000,200 L0,200 Z" 
          fill="url(#chartGradient)" 
          className="chart-fill-animate opacity-0"
        />
      </svg>
      <style>{`
        .chart-line-animate {
          animation: drawLine 2s cubic-bezier(0.16, 1, 0.3, 1) 0.5s forwards;
        }
        .chart-fill-animate {
          animation: fadeFill 1s cubic-bezier(0.16, 1, 0.3, 1) 1.5s forwards;
        }
        @keyframes drawLine {
          to { stroke-dashoffset: 0; }
        }
        @keyframes fadeFill {
          to { opacity: 1; }
        }
      `}</style>
    </div>
  );
};

// --- Copilot Wrapped Content ---
const DashboardContent: React.FC<{ children?: React.ReactNode }> = ({ children }) => {
  const location = useLocation();
  const navigate = useNavigate();
  const activeTab = location.pathname;
  const setActiveTab = (path: string) => navigate(path);

  const [theme, setTheme] = useLocalStorage('impeccable-theme', 'theme-dark');
  const [tracking, setTracking] = useLocalStorage('impeccable-tracking', 'tracking-normal');
  const [isCopilotEnabled, setIsCopilotEnabled] = useLocalStorage('impeccable-copilot', false);

  // Expose state to CopilotKit
  useCopilotReadable({
    description: "The current state of the dashboard, including metrics.",
    value: {
      activeTab,
      totalRequests: "12,483",
      avgLatency: "142ms",
      activeAgents: 24,
      platformActivity: "4,291 req/s"
    }
  });

  // Generative UI Action
  useCopilotAction({
    name: "showSystemReport",
    description: "Displays a beautiful generative UI system report card in the chat.",
    parameters: [
      {
        name: "analysis",
        type: "string",
        description: "A brief one sentence analysis of the system performance."
      }
    ],
    handler: async ({ analysis }) => {
      // The handler must be present even if we only use render
      return "Report generated successfully";
    },
    render: ({ args }) => {
      return (
        <div className="p-4 rounded-xl bg-[var(--impeccable-surface)] border border-[var(--impeccable-border)] text-[var(--impeccable-text)] mb-4">
          <div className="flex items-center gap-2 mb-2">
            <Zap size={16} className="text-[var(--impeccable-accent)]" />
            <h4 className="font-bold">System Report</h4>
          </div>
          <p className="text-sm opacity-80 mb-3">{args.analysis || "Analyzing..."}</p>
          <div className="grid grid-cols-2 gap-2 text-xs">
            <div className="bg-[var(--impeccable-bg)] p-2 rounded">
              <span className="opacity-60 block">Latency</span>
              <span className="text-emerald-400 font-bold">142ms (Optimal)</span>
            </div>
            <div className="bg-[var(--impeccable-bg)] p-2 rounded">
              <span className="opacity-60 block">Agents</span>
              <span className="text-[var(--impeccable-accent)] font-bold">24 Active</span>
            </div>
          </div>
        </div>
      );
    }
  });

  return (
    <div className={clsx("theme-impeccable min-h-screen font-geist flex overflow-hidden relative", theme)}>
      <ImpeccableSidebar activeTab={activeTab} setActiveTab={setActiveTab} trackingClass={tracking} />
      
      <main className="flex-1 flex flex-col h-screen overflow-y-auto relative bg-[var(--impeccable-bg)]">
        <ImpeccableHeader 
          trackingClass={tracking} 
          currentTheme={theme} 
          setTheme={setTheme} 
          currentTracking={tracking}
          setTracking={setTracking}
          isCopilotEnabled={isCopilotEnabled}
          setIsCopilotEnabled={setIsCopilotEnabled}
        />
        
        <div className="p-8 max-w-7xl mx-auto w-full relative z-10 flex-1 flex flex-col">
          {children ? children : (
            <>
              <header className="mb-10 animate-stagger-3">
                <h2 className={clsx("text-4xl font-light text-[var(--impeccable-text)] mb-2 glow-text", tracking)}>Welcome back, Admin</h2>
                <p className={clsx("text-[var(--impeccable-text-muted)] text-sm animate-float", tracking)}>System is operating at optimal performance levels.</p>
              </header>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8 [perspective:1000px]">
                <ImpeccableCard title="Total Requests" value="12,483" trend="14.5%" trendUp={true} delayClass="animate-stagger-3 animate-float" trackingClass={tracking} />
                <ImpeccableCard title="Avg Latency" value="142ms" trend="-2.1%" trendUp={true} delayClass="animate-stagger-4" trackingClass={tracking} />
                <ImpeccableCard title="Active Agents" value="24" trend="0%" trendUp={true} delayClass="animate-stagger-4 animate-float" trackingClass={tracking} />
              </div>

              <div className="h-[400px] glass-impeccable-card p-0 animate-stagger-4 flex items-center justify-center spotlight-card">
                <div className="absolute top-6 left-6 z-20">
                  <h3 className={clsx("text-sm font-medium text-[var(--impeccable-text-muted)] uppercase", tracking)}>Platform Activity</h3>
                  <p className={clsx("text-2xl font-light text-[var(--impeccable-text)]", tracking)}>4,291 <span className="text-sm text-[var(--impeccable-text-muted)]">req/s</span></p>
                </div>
                <AnimatedChart />
              </div>
            </>
          )}
        </div>
      </main>
      
      {isCopilotEnabled && (
        <div className="theme-impeccable">
          <CopilotPopup
            instructions="You are the AI assistant for the Orchestra dashboard. You can read the dashboard state and show system reports using generative UI."
            labels={{
              title: "Orchestra Copilot",
              initial: "How can I help you manage your agents today? (Try: 'Show me a system report')",
            }}
          />
        </div>
      )}
    </div>
  );
};

// --- Main Layout Component ---
export const ImpeccableLayout: React.FC<{ children?: React.ReactNode }> = ({ children }) => {
  return (
    <CopilotKit runtimeUrl="/api/v1/copilotkit">
      <DashboardContent>
        {children}
      </DashboardContent>
    </CopilotKit>
  );
};

export default ImpeccableLayout;
