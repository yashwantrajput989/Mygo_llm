import { useState, useEffect } from 'react';
import { Chat } from './components/Chat';
import { Login } from './components/Login';
import { Admin } from './components/Admin';

const BACKEND_URL = import.meta.env.VITE_BACKEND_URL || 'http://localhost:8000';

function App() {
  const [view, setView] = useState<'chat' | 'login' | 'admin'>('chat');
  const [token, setToken] = useState<string>(() => localStorage.getItem('mygo_token') || '');
  const [username, setUsername] = useState<string>(() => localStorage.getItem('mygo_username') || '');

  // Persist session tokens
  useEffect(() => {
    if (token) {
      localStorage.setItem('mygo_token', token);
      localStorage.setItem('mygo_username', username);
    } else {
      localStorage.removeItem('mygo_token');
      localStorage.removeItem('mygo_username');
    }
  }, [token, username]);

  const handleLoginSuccess = (userToken: string, user: string) => {
    setToken(userToken);
    setUsername(user);
    setView('admin');
  };

  const handleLogout = () => {
    setToken('');
    setUsername('');
    setView('chat');
  };

  return (
    <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column' }}>
      {view === 'chat' && (
        <Chat 
          onNavigateToAdmin={() => setView(token ? 'admin' : 'login')} 
          backendUrl={BACKEND_URL}
        />
      )}

      {view === 'login' && (
        <div style={{ position: 'relative' }}>
          <button 
            onClick={() => setView('chat')}
            className="btn-secondary"
            style={{
              position: 'absolute',
              top: '20px',
              left: '20px',
              zIndex: 10,
              fontSize: '0.85rem'
            }}
          >
            ← Back to Yoda Chat
          </button>
          <Login 
            onLoginSuccess={handleLoginSuccess}
            backendUrl={BACKEND_URL}
          />
        </div>
      )}

      {view === 'admin' && (
        <Admin 
          token={token} 
          username={username}
          onLogout={handleLogout}
          backendUrl={BACKEND_URL}
        />
      )}
    </div>
  );
}

export default App;
