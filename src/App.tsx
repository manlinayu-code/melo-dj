import React, { useState } from 'react';
import { AnimatePresence } from 'framer-motion';
import { AppProvider, useApp } from '@/context/AppContext';
import DockNav from '@/components/DockNav';
import Toast from '@/components/Toast';
import LoginModal from '@/components/LoginModal';
import Home from '@/pages/Home';
import Queue from '@/pages/Queue';
import Chat from '@/pages/Chat';
import Profile from '@/pages/Profile';
import type { ViewType } from '@/types';

function ErrorFallback({ error }: { error: Error }) {
  return (
    <div className="min-h-screen bg-[#06060a] text-white p-6">
      <h1 className="text-xl font-bold text-red-400 mb-4">Claudio 遇到了问题</h1>
      <pre className="text-xs bg-white/5 p-4 rounded-lg overflow-auto whitespace-pre-wrap">{error.message}

{error.stack}</pre>
    </div>
  );
}

class ErrorBoundary extends React.Component<{ children: React.ReactNode }, { hasError: boolean; error: Error | null }> {
  constructor(props: { children: React.ReactNode }) {
    super(props);
    this.state = { hasError: false, error: null };
  }
  static getDerivedStateFromError(error: Error) {
    return { hasError: true, error };
  }
  render() {
    if (this.state.hasError) {
      return <ErrorFallback error={this.state.error!} />;
    }
    return this.props.children;
  }
}

function AppContent() {
  const [currentView, setCurrentView] = useState<ViewType>('home');
  const { toast, user, showLoginModal, authError, login, register, logout, closeLoginModal } = useApp();

  return (
    <div className="max-w-[480px] mx-auto min-h-screen relative">
      {/* User badge */}
      {user && (
        <div className="fixed top-4 right-4 z-50 flex items-center gap-2 px-3 py-1.5 rounded-full glass text-xs">
          <span className="text-[#f0f0f5]">{user.name}</span>
          <button onClick={logout} className="text-[#4a4a5a] hover:text-[#ff6b6b] transition-colors">退出</button>
        </div>
      )}

      <AnimatePresence mode="wait">
        {currentView === 'home' && <Home key="home" onNavigate={setCurrentView} />}
        {currentView === 'queue' && <Queue key="queue" />}
        {currentView === 'chat' && <Chat key="chat" />}
        {currentView === 'profile' && <Profile key="profile" onNavigate={setCurrentView} />}
      </AnimatePresence>

      <DockNav current={currentView} onChange={setCurrentView} />

      {toast && <Toast message={toast.message} visible={toast.visible} />}

      <LoginModal
        isOpen={showLoginModal}
        onClose={closeLoginModal}
        onLogin={login}
        onRegister={register}
        error={authError}
      />
    </div>
  );
}

export default function App() {
  return (
    <ErrorBoundary>
      <AppProvider>
        <AppContent />
      </AppProvider>
    </ErrorBoundary>
  );
}
