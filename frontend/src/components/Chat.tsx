import React, { useState, useRef, useEffect } from 'react';
import { Send, Sparkles, MessageSquare, FileText } from 'lucide-react';

interface Message {
  role: 'user' | 'assistant';
  content: string;
  sources?: string[];
  latency_ms?: number;
}

interface ChatProps {
  onNavigateToAdmin: () => void;
  backendUrl: string;
}

export const Chat: React.FC<ChatProps> = ({ onNavigateToAdmin, backendUrl }) => {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages, loading]);

  const handleSend = async (textToSend?: string) => {
    const text = (textToSend || input).trim();
    if (!text) return;

    // Check if the user typed "/admin"
    if (text === '/admin') {
      setInput('');
      onNavigateToAdmin();
      return;
    }

    const newMsg: Message = { role: 'user', content: text };
    setMessages(prev => [...prev, newMsg]);
    if (!textToSend) setInput('');
    setLoading(true);

    try {
      const response = await fetch(`${backendUrl}/api/chat`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          messages: [...messages, newMsg].map(m => ({ role: m.role, content: m.content }))
        })
      });

      if (response.ok) {
        const data = await response.json();
        setMessages(prev => [...prev, {
          role: 'assistant',
          content: data.message,
          sources: data.sources,
          latency_ms: data.latency_ms
        }]);
      } else {
        setMessages(prev => [...prev, {
          role: 'assistant',
          content: "YODA is experiencing difficulties reaching the core LLM node. Please check backend log details."
        }]);
      }
    } catch (err) {
      console.error(err);
      setMessages(prev => [...prev, {
        role: 'assistant',
        content: "Network issue. Yoda could not reach the backend. Check if the server is running."
      }]);
    } finally {
      setLoading(false);
    }
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const quickPrompts = [
    { title: "What is MYGO?", desc: "Learn about the MYGO Organization Apps and Services" },
    { title: "Configure new API Key", desc: "Type /admin to manage applications and generate tokens" },
    { title: "Search knowledge base", desc: "Retrieve uploaded documentation on organizational apps" }
  ];

  return (
    <div className="app-container">
      {/* Chat Sidebar */}
      <aside className="sidebar">
        <div className="sidebar-header">
          <div className="avatar-yoda">Y</div>
          <div>
            <div className="sidebar-logo-text">YODA</div>
            <div className="chat-status">Mygo Assistant</div>
          </div>
        </div>

        <div className="sidebar-menu">
          <div style={{ padding: '0 8px', margin: '12px 0 8px 0', fontSize: '0.75rem', color: 'var(--text-muted)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.5px' }}>
            Operations & Admin
          </div>
          <button 
            className="menu-item active"
            onClick={() => {}}
          >
            <MessageSquare size={18} />
            <span>Chat Session</span>
          </button>

        </div>

        <div className="sidebar-footer" style={{ fontSize: '0.8rem', color: 'var(--text-muted)', textAlign: 'center', background: 'rgba(255,255,255,0.01)' }}>
          <Sparkles size={16} style={{ color: 'var(--primary)', marginBottom: '6px' }} />
          <div>Gemma 4 E4B Engine</div>
        </div>
      </aside>

      {/* Chat View */}
      <main className="chat-main">
        <header className="chat-header">
          <div className="chat-title-container">
            <div className="avatar-yoda">Y</div>
            <div>
              <h3 style={{ fontSize: '1rem', fontWeight: 600 }}>YODA</h3>
              <div className="chat-status">Online • Gemma 4</div>
            </div>
          </div>

        </header>

        <div className="chat-messages">
          {messages.length === 0 ? (
            <div className="welcome-screen animate-fade-in">
              <div style={{ display: 'flex', justifyContent: 'center', marginBottom: '24px' }}>
                <div className="avatar-yoda" style={{ width: '64px', height: '64px', fontSize: '1.85rem' }}>Y</div>
              </div>
              <h1>Greetings, MYGO Member</h1>
              <p>I am YODA, your dedicated Assistant. Ask me anything about organization workflows, tools, or type <code>/admin</code> to configure API keys.</p>
              
              <div className="quick-prompts">
                {quickPrompts.map((prompt, idx) => (
                  <div 
                    className="prompt-card glass-panel" 
                    key={idx}
                    onClick={() => handleSend(prompt.title)}
                  >
                    <h4>{prompt.title}</h4>
                    <p>{prompt.desc}</p>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            messages.map((msg, index) => (
              <div className={`message-row ${msg.role}`} key={index}>
                <div className="avatar-yoda" style={{ width: '32px', height: '32px', fontSize: '0.85rem', flexShrink: 0 }}>
                  {msg.role === 'user' ? 'U' : 'Y'}
                </div>
                <div style={{ display: 'flex', flexDirection: 'column' }}>
                  <div className="message-bubble">
                    <div style={{ whiteSpace: 'pre-wrap' }}>{msg.content}</div>
                  </div>
                  {msg.sources && msg.sources.length > 0 && (
                    <div className="sources-indicator">
                      <FileText size={12} />
                      <span>Retrieved source: </span>
                      {msg.sources.map((src, sidx) => (
                        <span className="source-badge" key={sidx}>{src}</span>
                      ))}
                      {msg.latency_ms !== undefined && (
                        <span style={{ marginLeft: '8px' }}>({msg.latency_ms}ms)</span>
                      )}
                    </div>
                  )}
                </div>
              </div>
            ))
          )}

          {loading && (
            <div className="message-row assistant">
              <div className="avatar-yoda" style={{ width: '32px', height: '32px', fontSize: '0.85rem', flexShrink: 0 }}>
                Y
              </div>
              <div className="message-bubble">
                <div className="typing-dots">
                  <span></span>
                  <span></span>
                  <span></span>
                </div>
              </div>
            </div>
          )}
          <div ref={messagesEndRef} />
        </div>

        <div className="chat-input-area">
          <div className="chat-input-wrapper">
            <input
              type="text"
              className="chat-input"
              placeholder="Ask Yoda about MYGO apps, or type /admin..."
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyPress}
              disabled={loading}
            />
            <button 
              className="chat-send-btn"
              onClick={() => handleSend()}
              disabled={loading || !input.trim()}
            >
              <Send size={18} />
            </button>
          </div>
          <div style={{ textAlign: 'center', fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '8px' }}>
            Organisational assistant YODA is backed by Gemma 4 E4B local instance. Powered by MYGO LLM Platform.
          </div>
        </div>
      </main>
    </div>
  );
};
