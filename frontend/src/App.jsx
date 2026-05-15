import { useState, useCallback } from 'react';
import { BrowserRouter, Routes, Route, Navigate, useNavigate } from 'react-router-dom';
import AuthScreen from './components/AuthScreen.jsx';
import Sidebar from './components/Sidebar.jsx';
import HistoryDrawer from './components/HistoryDrawer.jsx';
import UploadPage from './pages/UploadPage.jsx';
import ResultsPage from './pages/ResultsPage.jsx';
import ChatPage from './pages/ChatPage.jsx';
import { getToken, clearToken } from './services/api.js';

function AppLayout({ onLogout }) {
  const navigate = useNavigate();
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [phase, setPhase] = useState('idle');

  return (
    <div className="flex min-h-screen" style={{ background: '#F8FAFC' }}>
      <Sidebar
        onReset={() => navigate('/')}
        onLogout={onLogout}
        onOpenHistory={() => setHistoryOpen(true)}
        phase={phase}
        isOpen={sidebarOpen}
        onToggle={() => setSidebarOpen((v) => !v)}
      />

      <HistoryDrawer
        open={historyOpen}
        onClose={() => setHistoryOpen(false)}
      />

      <Routes>
        <Route
          path="/"
          element={
            <UploadPage
              onPhaseChange={setPhase}
              sidebarOpen={sidebarOpen}
            />
          }
        />
        <Route
          path="/results/:jobId"
          element={<ResultsPage sidebarOpen={sidebarOpen} />}
        />
        <Route
          path="/chat"
          element={<ChatPage sidebarOpen={sidebarOpen} />}
        />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </div>
  );
}

export default function App() {
  const [isAuthenticated, setIsAuthenticated] = useState(!!getToken());

  const handleLogin = useCallback((token) => setIsAuthenticated(!!token), []);

  const handleLogout = useCallback(() => {
    clearToken();
    setIsAuthenticated(false);
  }, []);

  if (!isAuthenticated) {
    return <AuthScreen onLogin={handleLogin} />;
  }

  return (
    <BrowserRouter basename={import.meta.env.BASE_URL}>
      <AppLayout onLogout={handleLogout} />
    </BrowserRouter>
  );
}
