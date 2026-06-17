import { useState } from 'react';
import { SettingsLayout } from './components/SettingsLayout';
import { ChatLayout } from './components/ChatLayout';
import { LoginLayout } from './components/LoginLayout';

export const App = () => {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [currentView, setCurrentView] = useState<'chat' | 'settings'>('chat');

  if (!isAuthenticated) {
    return <LoginLayout onLoginSuccess={() => setIsAuthenticated(true)} />;
  }

  if (currentView === 'settings') {
    return <SettingsLayout onBack={() => setCurrentView('chat')} />;
  }

  return <ChatLayout onOpenSettings={() => setCurrentView('settings')} />;
};

export default App;
