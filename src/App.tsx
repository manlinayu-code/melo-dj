import { useState } from 'react';
import { AnimatePresence } from 'framer-motion';
import { AppProvider, useApp } from '@/context/AppContext';
import DockNav from '@/components/DockNav';
import Toast from '@/components/Toast';
import Home from '@/pages/Home';
import Queue from '@/pages/Queue';
import Chat from '@/pages/Chat';
import Profile from '@/pages/Profile';
import type { ViewType } from '@/types';

function AppContent() {
  const [currentView, setCurrentView] = useState<ViewType>('home');
  const { toast } = useApp();

  return (
    <div className="max-w-[480px] mx-auto min-h-screen relative">
      <AnimatePresence mode="wait">
        {currentView === 'home' && <Home key="home" />}
        {currentView === 'queue' && <Queue key="queue" />}
        {currentView === 'chat' && <Chat key="chat" />}
        {currentView === 'profile' && <Profile key="profile" onNavigate={setCurrentView} />}
      </AnimatePresence>

      <DockNav current={currentView} onChange={setCurrentView} />

      {toast && <Toast message={toast.message} visible={toast.visible} />}
    </div>
  );
}

export default function App() {
  return (
    <AppProvider>
      <AppContent />
    </AppProvider>
  );
}
