import React from 'react';
import { useParams } from 'react-router-dom';
import { CopilotKit, useCopilotReadable } from '@copilotkit/react-core';
import { CopilotChat } from '@copilotkit/react-ui';
import '@copilotkit/react-ui/styles.css';

// The actual Chat UI
const ChatContainer: React.FC = () => {
  const { slug } = useParams<{ slug: string }>();

  // Provide the slug and session_id to CopilotKit so the backend bridge knows who we are routing to
  useCopilotReadable({
    description: "The current chatbot configuration",
    value: { slug: slug || "default", session_id: "" }
  });

  return (
    <div className="w-full h-screen bg-gray-50 flex items-center justify-center p-4">
      <div className="w-full max-w-4xl h-[85vh] bg-white rounded-2xl shadow-2xl border border-gray-200 overflow-hidden flex flex-col">
        <header className="p-4 border-b border-gray-100 bg-gray-50/50">
          <h1 className="text-lg font-bold text-gray-800">Copilot Chat</h1>
          <p className="text-sm text-gray-500">slug: {slug}</p>
        </header>
        
        <div className="flex-1 w-full relative">
          <CopilotChat
            instructions={`You are a helpful customer support agent for the chatbot slug: ${slug}. Please assist the user politely.`}
            labels={{
              title: "Customer Support Copilot",
              initial: "Hello! How can I help you today?",
            }}
          />
        </div>
      </div>
    </div>
  );
};

// Wrap with CopilotKit provider
export const CopilotChatPage: React.FC = () => {
  return (
    <CopilotKit runtimeUrl="/api/v1/copilotkit">
      <ChatContainer />
    </CopilotKit>
  );
};
