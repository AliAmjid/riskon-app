import { useCallback, useMemo, useState } from 'react';
import { AppShell, InputView, ResultsView } from './components';
import type { ChatMessage, DataPreview, RiskSenseResult, SessionSummary, WorkspaceView } from './types/risksense';
import { sampleRiskSenseResult } from './utils/riskResult';

const mockSessions: SessionSummary[] = [
  { id: 'session-1', title: 'Asset Portfolio - Diamonds', updatedAt: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString() },
  { id: 'session-2', title: 'VaR Portfolio Review', updatedAt: new Date(Date.now() - 26 * 60 * 60 * 1000).toISOString() },
  { id: 'session-3', title: 'Stress Test Scenarios', updatedAt: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString() },
  { id: 'session-4', title: 'Counterparty Exposure', updatedAt: new Date(Date.now() - 8 * 24 * 60 * 60 * 1000).toISOString() },
];

const initialPreview: DataPreview = {
  rowCount: 1247,
  columnCount: 12,
  headers: ['Carat', 'Cut', 'Color', 'Clarity', 'Depth', 'Price'],
  rows: [
    ['0.23', 'Ideal', 'E', 'SI2', '61.5', '326'],
    ['0.21', 'Premium', 'E', 'SI1', '59.6', '326'],
    ['0.23', 'Good', 'E', 'VS1', '56.9', '327'],
    ['0.29', 'Premium', 'I', 'VS2', '62.4', '337'],
    ['0.31', 'Good', 'J', 'VVS2', '62.8', '335'],
  ],
};

const initialMessages: ChatMessage[] = [
  {
    id: 'msg-1',
    role: 'user',
    content:
      'A high-end jeweler in Zurich needs to deploy a fixed line of credit. Find the best diversified diamond portfolio within the budget and display-space limits.',
    createdAt: new Date().toISOString(),
  },
  {
    id: 'msg-2',
    role: 'agent',
    content: 'Upload your data, then tell me the decision you need to make and the constraints I should respect.',
    createdAt: new Date().toISOString(),
  },
];

function createId(prefix: string): string {
  return `${prefix}-${crypto.randomUUID()}`;
}

export default function App() {
  const [activeView, setActiveView] = useState<WorkspaceView>('input');
  const [sessions, setSessions] = useState(mockSessions);
  const [activeSessionId, setActiveSessionId] = useState(mockSessions[0].id);
  const [preview, setPreview] = useState<DataPreview>(initialPreview);
  const [messages, setMessages] = useState<ChatMessage[]>(initialMessages);
  const [result, setResult] = useState<RiskSenseResult>(sampleRiskSenseResult);
  const [agentStatus, setAgentStatus] = useState<'ready' | 'busy' | 'offline'>('ready');

  const activeSession = useMemo(
    () => sessions.find((session) => session.id === activeSessionId) ?? sessions[0],
    [activeSessionId, sessions],
  );

  const handleViewChange = useCallback((view: WorkspaceView) => {
    setActiveView(view);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }, []);

  const handleNewSession = useCallback(() => {
    const session: SessionSummary = {
      id: createId('session'),
      title: 'New optimization session',
      updatedAt: new Date().toISOString(),
    };
    setSessions((current) => [session, ...current]);
    setActiveSessionId(session.id);
    setMessages([
      {
        id: createId('msg'),
        role: 'agent',
        content: 'Upload a dataset and describe the decision you need to optimize.',
        createdAt: new Date().toISOString(),
      },
    ]);
    setPreview({ rowCount: 0, columnCount: 0, headers: [], rows: [] });
    setActiveView('input');
  }, []);

  const handleSendMessage = useCallback((question: string) => {
    const userMessage: ChatMessage = {
      id: createId('msg'),
      role: 'user',
      content: question,
      createdAt: new Date().toISOString(),
    };
    const processingMessage: ChatMessage = {
      id: createId('msg'),
      role: 'agent',
      content: 'Processing scenario…',
      createdAt: new Date().toISOString(),
      processing: true,
    };

    setMessages((current) => [...current, userMessage, processingMessage]);
    setAgentStatus('busy');

    window.setTimeout(() => {
      setMessages((current) =>
        current.map((message) =>
          message.id === processingMessage.id
            ? {
                ...message,
                processing: false,
                content:
                  'The scenario is ready. Open Results to review the recommended action and model translation.',
              }
            : message,
        ),
      );
      setAgentStatus('ready');
    }, 900);
  }, []);

  const handleLoadResult = useCallback((nextResult: RiskSenseResult) => {
    setResult(nextResult);
    setActiveView('results');
  }, []);

  return (
    <AppShell
      activeView={activeView}
      onViewChange={handleViewChange}
      sessions={sessions}
      activeSessionId={activeSession.id}
      onSelectSession={setActiveSessionId}
      onNewSession={handleNewSession}
      agentStatus={agentStatus}
      inputView={
        <InputView
          title={activeSession.title}
          preview={preview}
          messages={messages}
          onPreviewChange={setPreview}
          onSendMessage={handleSendMessage}
          chatDisabled={agentStatus === 'busy'}
        />
      }
      resultsView={<ResultsView result={result} onLoadJson={handleLoadResult} />}
    />
  );
}
