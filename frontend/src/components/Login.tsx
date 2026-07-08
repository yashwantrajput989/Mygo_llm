import React, { useState } from 'react';
import { Shield, Eye, EyeOff, Lock, User, AlertCircle } from 'lucide-react';

interface LoginProps {
  onLoginSuccess: (token: string, username: string) => void;
  backendUrl: string;
}

export const Login: React.FC<LoginProps> = ({ onLoginSuccess, backendUrl }) => {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!username || !password) {
      setError('Please fill in all fields');
      return;
    }

    setError('');
    setLoading(true);

    try {
      const response = await fetch(`${backendUrl}/api/auth/login`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ username, password }),
      });

      const data = await response.json();

      if (response.ok) {
        onLoginSuccess(data.token, data.username);
      } else {
        setError(data.detail || 'Invalid username or password');
      }
    } catch (err) {
      console.error(err);
      setError('Cannot connect to Mygo LLM backend. Ensure it is running.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="login-container">
      <div className="login-card glass-panel-glow animate-fade-in">
        <div style={{ display: 'flex', justifyContent: 'center', marginBottom: '20px' }}>
          <div className="avatar-yoda" style={{ width: '56px', height: '56px', fontSize: '1.5rem' }}>
            <Shield size={28} />
          </div>
        </div>
        <h2>MYGO LLM Portal</h2>
        <p>Sign in to access secure operations and analytics</p>

        <form onSubmit={handleSubmit}>
          <div className="form-group">
            <label htmlFor="username">Username / Email</label>
            <div style={{ position: 'relative' }}>
              <User size={18} style={{ position: 'absolute', left: '14px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
              <input
                id="username"
                type="email"
                placeholder="admin@mygo.ai"
                className="form-input"
                style={{ paddingLeft: '44px' }}
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                disabled={loading}
              />
            </div>
          </div>

          <div className="form-group">
            <label htmlFor="password">Password</label>
            <div style={{ position: 'relative' }}>
              <Lock size={18} style={{ position: 'absolute', left: '14px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
              <input
                id="password"
                type={showPassword ? 'text' : 'password'}
                placeholder="••••••••"
                className="form-input"
                style={{ paddingLeft: '44px', paddingRight: '44px' }}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                disabled={loading}
              />
              <button
                type="button"
                style={{
                  position: 'absolute',
                  right: '14px',
                  top: '50%',
                  transform: 'translateY(-50%)',
                  background: 'none',
                  border: 'none',
                  cursor: 'pointer',
                  color: 'var(--text-muted)'
                }}
                onClick={() => setShowPassword(!showPassword)}
                disabled={loading}
              >
                {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
              </button>
            </div>
          </div>

          {error && (
            <div className="error-message" style={{ display: 'flex', alignItems: 'center', gap: '8px', justifyContent: 'center' }}>
              <AlertCircle size={16} />
              <span>{error}</span>
            </div>
          )}

          <button type="submit" className="login-btn" disabled={loading}>
            {loading ? 'Verifying...' : 'Sign In'}
          </button>
        </form>
      </div>
    </div>
  );
};
