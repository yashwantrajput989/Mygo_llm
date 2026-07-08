import React, { useState, useEffect } from 'react';
import { 
  Key, FileText, Database, Cpu, BarChart2, Plus, 
  Trash2, RefreshCw, LogOut, Check, Copy, ToggleLeft, ToggleRight,
  Upload, Search, FileUp, AlertTriangle, ShieldCheck, Activity, Terminal
} from 'lucide-react';

interface AppItem {
  id: number;
  name: string;
  api_key: string;
  status: string;
  created_at: string;
}

interface DocItem {
  id: number;
  name: string;
  char_count: number;
  created_at: string;
}

interface LogItem {
  id: number;
  app_name: string;
  endpoint: string;
  prompt: string;
  response: string;
  latency_ms: number;
  status: number;
  timestamp: string;
}

interface MetricsSummary {
  total_requests: number;
  avg_latency_ms: number;
  success_rate_percent: number;
  active_apps_count: number;
}

interface AdminMetrics {
  summary: MetricsSummary;
  app_breakdown: Array<{ app_name: string; count: number; avg_latency: number }>;
  time_series: Array<{ time_bucket: string; count: number }>;
  recent_logs: LogItem[];
}

interface AdminProps {
  token: string;
  username: string;
  onLogout: () => void;
  backendUrl: string;
}

export const Admin: React.FC<AdminProps> = ({ token, username, onLogout, backendUrl }) => {
  const [apps, setApps] = useState<AppItem[]>([]);
  const [docs, setDocs] = useState<DocItem[]>([]);
  const [metrics, setMetrics] = useState<AdminMetrics | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [activeTab, setActiveTab] = useState<'dashboard' | 'keys' | 'docs' | 'logs'>('dashboard');

  // Modal / Create App State
  const [isAppModalOpen, setIsAppModalOpen] = useState(false);
  const [newAppName, setNewAppName] = useState('');
  const [generatedKey, setGeneratedKey] = useState('');
  const [appError, setAppError] = useState('');
  const [copiedKey, setCopiedKey] = useState(false);

  // File Upload State
  const [docName, setDocName] = useState('');
  const [docContent, setDocContent] = useState('');
  const [uploadFile, setUploadFile] = useState<File | null>(null);
  const [uploadLoading, setUploadLoading] = useState(false);
  const [uploadMessage, setUploadMessage] = useState('');

  // Fetch all admin data
  const fetchData = async () => {
    setRefreshing(true);
    try {
      const headers = { 'Authorization': `Bearer ${token}` };
      
      const [appsRes, docsRes, metricsRes] = await Promise.all([
        fetch(`${backendUrl}/api/admin/apps`, { headers }),
        fetch(`${backendUrl}/api/admin/documents`, { headers }),
        fetch(`${backendUrl}/api/admin/metrics`, { headers })
      ]);

      if (appsRes.ok && docsRes.ok && metricsRes.ok) {
        const appsData = await appsRes.json();
        const docsData = await docsRes.json();
        const metricsData = await metricsRes.json();
        setApps(appsData);
        setDocs(docsData);
        setMetrics(metricsData);
      } else {
        if (appsRes.status === 401 || docsRes.status === 401) {
          onLogout();
        }
      }
    } catch (err) {
      console.error("Error fetching admin dashboard data:", err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    fetchData();
    // Auto-refresh metrics every 30 seconds
    const interval = setInterval(fetchData, 30000);
    return () => clearInterval(interval);
  }, []);

  // Handle App Creation
  const handleCreateApp = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newAppName.trim()) return;
    setAppError('');
    try {
      const response = await fetch(`${backendUrl}/api/admin/apps`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ name: newAppName })
      });
      const data = await response.json();
      if (response.ok) {
        setGeneratedKey(data.api_key);
        setNewAppName('');
        fetchData();
      } else {
        setAppError(data.detail || 'Failed to create application key');
      }
    } catch (err) {
      setAppError('Connection error, try again.');
    }
  };

  const handleCopyKey = () => {
    navigator.clipboard.writeText(generatedKey);
    setCopiedKey(true);
    setTimeout(() => setCopiedKey(false), 2000);
  };

  // Toggle App Status
  const handleToggleApp = async (appId: number) => {
    try {
      const response = await fetch(`${backendUrl}/api/admin/apps/${appId}/toggle`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (response.ok) {
        fetchData();
      }
    } catch (err) {
      console.error(err);
    }
  };

  // Delete App
  const handleDeleteApp = async (appId: number) => {
    if (!confirm('Are you sure you want to revoke and delete this application key? This cannot be undone.')) return;
    try {
      const response = await fetch(`${backendUrl}/api/admin/apps/${appId}`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (response.ok) {
        fetchData();
      }
    } catch (err) {
      console.error(err);
    }
  };

  // Upload Document
  const handleUploadDoc = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!docName.trim()) {
      setUploadMessage('Please enter a document title.');
      return;
    }
    if (!docContent.trim() && !uploadFile) {
      setUploadMessage('Please enter document content or attach a file.');
      return;
    }

    setUploadLoading(true);
    setUploadMessage('');

    try {
      const formData = new FormData();
      formData.append('name', docName);
      if (uploadFile) {
        formData.append('file', uploadFile);
      } else {
        formData.append('content', docContent);
      }

      const response = await fetch(`${backendUrl}/api/admin/documents`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`
        },
        body: formData
      });

      const data = await response.json();
      if (response.ok) {
        setUploadMessage(data.message);
        setDocName('');
        setDocContent('');
        setUploadFile(null);
        // Reset file input
        const fileInput = document.getElementById('file-upload-input') as HTMLInputElement;
        if (fileInput) fileInput.value = '';
        fetchData();
      } else {
        setUploadMessage(data.detail || 'Upload failed');
      }
    } catch (err) {
      setUploadMessage('Network error occurred during document upload.');
    } finally {
      setUploadLoading(false);
    }
  };

  // Delete Document
  const handleDeleteDoc = async (docId: number) => {
    if (!confirm('Are you sure you want to delete this document from the knowledge base? Yoda will no longer answer using this context.')) return;
    try {
      const response = await fetch(`${backendUrl}/api/admin/documents/${docId}`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (response.ok) {
        fetchData();
      }
    } catch (err) {
      console.error(err);
    }
  };

  // Filter logs based on search
  const filteredLogs = metrics?.recent_logs.filter(log => 
    log.app_name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    log.endpoint.toLowerCase().includes(searchQuery.toLowerCase()) ||
    (log.prompt && log.prompt.toLowerCase().includes(searchQuery.toLowerCase()))
  ) || [];

  if (loading) {
    return (
      <div className="login-container">
        <div style={{ textAlign: 'center' }}>
          <div className="avatar-yoda animate-fade-in" style={{ margin: '0 auto 20px auto', width: '50px', height: '50px' }}>
            <Cpu size={24} className="animate-spin" />
          </div>
          <h3>Loading dashboard analytics...</h3>
        </div>
      </div>
    );
  }

  // Calculate max values for chart rendering
  const maxCount = metrics?.app_breakdown.reduce((max, item) => item.count > max ? item.count : max, 1) || 1;
  const timeSeriesMax = metrics?.time_series.reduce((max, item) => item.count > max ? item.count : max, 1) || 1;

  return (
    <div className="app-container" style={{ display: 'grid', gridTemplateColumns: '260px 1fr' }}>
      {/* Sidebar */}
      <aside className="sidebar">
        <div className="sidebar-header">
          <div className="avatar-yoda">
            <Database size={20} />
          </div>
          <div>
            <div className="sidebar-logo-text">MYGO LLM</div>
            <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>Operations Portal</div>
          </div>
        </div>

        <nav className="sidebar-menu">
          <button 
            className={`menu-item ${activeTab === 'dashboard' ? 'active' : ''}`}
            onClick={() => setActiveTab('dashboard')}
          >
            <Activity size={18} />
            <span>Dashboard</span>
          </button>
          <button 
            className={`menu-item ${activeTab === 'keys' ? 'active' : ''}`}
            onClick={() => setActiveTab('keys')}
          >
            <Key size={18} />
            <span>API Management</span>
          </button>
          <button 
            className={`menu-item ${activeTab === 'docs' ? 'active' : ''}`}
            onClick={() => setActiveTab('docs')}
          >
            <FileText size={18} />
            <span>Knowledge Base</span>
          </button>
          <button 
            className={`menu-item ${activeTab === 'logs' ? 'active' : ''}`}
            onClick={() => setActiveTab('logs')}
          >
            <Terminal size={18} />
            <span>Developer Logs</span>
          </button>
        </nav>

        <div className="sidebar-footer">
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: '0.8rem', color: 'var(--text-muted)', marginBottom: '12px' }}>
            <span>User: {username}</span>
            <span style={{ display: 'inline-block', width: '8px', height: '8px', background: 'var(--success)', borderRadius: '50%', boxShadow: '0 0 6px var(--success)' }}></span>
          </div>
          <button onClick={onLogout} className="logout-btn" style={{ width: '100%', justifyContent: 'center' }}>
            <LogOut size={16} />
            <span>Exit Admin</span>
          </button>
        </div>
      </aside>

      {/* Main Panel */}
      <main className="admin-container">
        <header className="admin-header animate-fade-in">
          <div>
            <h2>
              {activeTab === 'dashboard' && 'Operations Dashboard'}
              {activeTab === 'keys' && 'API Keys & Access control'}
              {activeTab === 'docs' && 'Knowledge Base & RAG Index'}
              {activeTab === 'logs' && 'Real-time Request Logger'}
            </h2>
            <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem', marginTop: '4px' }}>
              Management node: Gemma 4 E4B Engine (AWS local backend)
            </p>
          </div>
          <div style={{ display: 'flex', gap: '12px' }}>
            <button 
              onClick={fetchData} 
              disabled={refreshing}
              className="btn-secondary"
              style={{ display: 'flex', alignItems: 'center', gap: '8px' }}
            >
              <RefreshCw size={16} className={refreshing ? 'animate-spin' : ''} />
              <span>{refreshing ? 'Refreshing...' : 'Sync Data'}</span>
            </button>
          </div>
        </header>

        {/* Dashboard Tab */}
        {activeTab === 'dashboard' && (
          <div className="animate-fade-in">
            {/* Stats Cards */}
            <div className="stats-grid">
              <div className="stat-card glass-panel">
                <div className="stat-info">
                  <h4>Total API Requests</h4>
                  <div className="stat-value">{metrics?.summary.total_requests || 0}</div>
                </div>
                <div className="stat-icon">
                  <Activity size={24} />
                </div>
              </div>

              <div className="stat-card glass-panel">
                <div className="stat-info">
                  <h4>Avg Engine Latency</h4>
                  <div className="stat-value">
                    {metrics?.summary.avg_latency_ms ? `${metrics.summary.avg_latency_ms} ms` : '0 ms'}
                  </div>
                </div>
                <div className="stat-icon">
                  <Cpu size={24} />
                </div>
              </div>

              <div className="stat-card glass-panel">
                <div className="stat-info">
                  <h4>Success Rate</h4>
                  <div className="stat-value" style={{ color: (metrics?.summary.success_rate_percent || 0) > 95 ? 'var(--success)' : 'var(--warning)' }}>
                    {metrics?.summary.success_rate_percent || 100}%
                  </div>
                </div>
                <div className="stat-icon">
                  <ShieldCheck size={24} style={{ color: (metrics?.summary.success_rate_percent || 0) > 95 ? 'var(--success)' : 'var(--warning)' }} />
                </div>
              </div>

              <div className="stat-card glass-panel">
                <div className="stat-info">
                  <h4>Authorized Apps</h4>
                  <div className="stat-value">{metrics?.summary.active_apps_count || 0}</div>
                </div>
                <div className="stat-icon">
                  <Key size={24} />
                </div>
              </div>
            </div>

            {/* Charts Section */}
            <div className="admin-section-grid">
              {/* Traffic Chart */}
              <div className="admin-card glass-panel">
                <div className="admin-card-header">
                  <h3>
                    <BarChart2 size={18} style={{ color: 'var(--primary)' }} />
                    <span>Hourly Traffic Volume</span>
                  </h3>
                </div>
                {metrics && metrics.time_series.length > 0 ? (
                  <div className="chart-container">
                    {metrics.time_series.map((bucket, index) => {
                      const heightPercent = `${(bucket.count / timeSeriesMax) * 80}%`;
                      // Extract only the hour string
                      const label = bucket.time_bucket.split(' ')[1]?.substring(0, 5) || '';
                      return (
                        <div key={index} className="chart-bar-wrapper">
                          <div className="chart-bar" style={{ height: heightPercent || '4px' }}>
                            <div className="chart-bar-tooltip">{bucket.count} requests</div>
                          </div>
                          <div className="chart-label">{label}</div>
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <div style={{ height: '220px', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-muted)' }}>
                    No request telemetry captured in the last 24h.
                  </div>
                )}
              </div>

              {/* App Breakdown Chart */}
              <div className="admin-card glass-panel">
                <div className="admin-card-header">
                  <h3>
                    <Cpu size={18} style={{ color: 'var(--accent)' }} />
                    <span>API Consumer Load</span>
                  </h3>
                </div>
                {metrics && metrics.app_breakdown.length > 0 ? (
                  <div className="chart-container" style={{ paddingLeft: '20px', paddingRight: '20px' }}>
                    {metrics.app_breakdown.map((app, index) => {
                      const heightPercent = `${(app.count / maxCount) * 80}%`;
                      return (
                        <div key={index} className="chart-bar-wrapper">
                          <div className="chart-bar" style={{ height: heightPercent || '4px', background: 'linear-gradient(180deg, var(--accent) 0%, var(--primary) 100%)' }}>
                            <div className="chart-bar-tooltip">{app.count} reqs ({Math.round(app.avg_latency)}ms avg)</div>
                          </div>
                          <div className="chart-label" title={app.app_name}>{app.app_name}</div>
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <div style={{ height: '220px', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-muted)' }}>
                    No registered apps making requests.
                  </div>
                )}
              </div>

              {/* Recent Logs Table */}
              <div className="admin-card glass-panel logs-section">
                <div className="admin-card-header">
                  <h3>
                    <Terminal size={18} style={{ color: 'var(--primary)' }} />
                    <span>Recent Activity Stream</span>
                  </h3>
                  <button onClick={() => setActiveTab('logs')} className="btn-secondary" style={{ padding: '6px 12px', fontSize: '0.8rem' }}>
                    View full logger
                  </button>
                </div>
                <div className="table-container">
                  <table>
                    <thead>
                      <tr>
                        <th>Consumer</th>
                        <th>Endpoint</th>
                        <th>Payload Summary</th>
                        <th>Latency</th>
                        <th>Code</th>
                        <th>Timestamp</th>
                      </tr>
                    </thead>
                    <tbody>
                      {metrics?.recent_logs && metrics.recent_logs.slice(0, 5).map((log) => {
                        const isSuccess = log.status < 400;
                        const isSlow = log.latency_ms > 2000;
                        const isMedium = log.latency_ms > 500 && log.latency_ms <= 2000;
                        
                        return (
                          <tr key={log.id}>
                            <td style={{ fontWeight: 600 }}>{log.app_name}</td>
                            <td><code className="key-code">{log.endpoint}</code></td>
                            <td title={log.prompt}>{log.prompt}</td>
                            <td>
                              <div className={`latency-indicator ${isSlow ? 'slow' : isMedium ? 'medium' : 'fast'}`}>
                                <span className="dot"></span>
                                <span>{log.latency_ms} ms</span>
                              </div>
                            </td>
                            <td>
                              <span className={`badge ${isSuccess ? 'status-200' : 'status-error'}`}>
                                {log.status}
                              </span>
                            </td>
                            <td style={{ color: 'var(--text-muted)' }}>
                              {new Date(log.timestamp).toLocaleTimeString()}
                            </td>
                          </tr>
                        );
                      })}
                      {(!metrics?.recent_logs || metrics.recent_logs.length === 0) && (
                        <tr>
                          <td colSpan={6} style={{ textAlign: 'center', padding: '30px', color: 'var(--text-muted)' }}>
                            No requests have been executed yet.
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* API Key Management Tab */}
        {activeTab === 'keys' && (
          <div className="admin-card glass-panel animate-fade-in">
            <div className="admin-card-header">
              <h3>
                <Key size={18} style={{ color: 'var(--primary)' }} />
                <span>Active Credentials ({apps.length})</span>
              </h3>
              <button onClick={() => setIsAppModalOpen(true)} className="card-action-btn">
                <Plus size={16} />
                <span>Create API Token</span>
              </button>
            </div>

            <div className="table-container">
              <table>
                <thead>
                  <tr>
                    <th>Application Consumer</th>
                    <th>Authorization Header Key</th>
                    <th>Status</th>
                    <th>Issued At</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {apps.map((app) => (
                    <tr key={app.id}>
                      <td style={{ fontWeight: 600, fontSize: '0.95rem' }}>{app.name}</td>
                      <td>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                          <code className="key-code">
                            {app.api_key}
                          </code>
                          <button 
                            onClick={() => {
                              navigator.clipboard.writeText(app.api_key);
                              alert('Copied to clipboard');
                            }}
                            className="doc-delete-btn"
                          >
                            <Copy size={14} />
                          </button>
                        </div>
                      </td>
                      <td>
                        <span className={`badge ${app.status === 'active' ? 'active' : 'revoked'}`}>
                          {app.status}
                        </span>
                      </td>
                      <td style={{ color: 'var(--text-secondary)' }}>
                        {new Date(app.created_at).toLocaleDateString()}
                      </td>
                      <td>
                        <div style={{ display: 'flex', gap: '12px' }}>
                          <button 
                            className="key-toggle-btn"
                            onClick={() => handleToggleApp(app.id)}
                            style={{ display: 'flex', alignItems: 'center', gap: '4px' }}
                          >
                            {app.status === 'active' ? (
                              <>
                                <ToggleRight size={16} style={{ color: 'var(--success)' }} />
                                <span>Revoke</span>
                              </>
                            ) : (
                              <>
                                <ToggleLeft size={16} style={{ color: 'var(--text-muted)' }} />
                                <span>Activate</span>
                              </>
                            )}
                          </button>
                          <button 
                            className="doc-delete-btn"
                            onClick={() => handleDeleteApp(app.id)}
                            style={{ padding: '4px' }}
                          >
                            <Trash2 size={16} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                  {apps.length === 0 && (
                    <tr>
                      <td colSpan={5} style={{ textAlign: 'center', padding: '30px', color: 'var(--text-muted)' }}>
                        No application client keys generated. Click "Create API Token" to generate one.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Knowledge Base Tab */}
        {activeTab === 'docs' && (
          <div className="admin-section-grid animate-fade-in" style={{ gridTemplateColumns: '1fr 1fr' }}>
            {/* Upload Document Panel */}
            <div className="admin-card glass-panel">
              <div className="admin-card-header">
                <h3>
                  <FileUp size={18} style={{ color: 'var(--primary)' }} />
                  <span>Feed Documents (RAG ingestion)</span>
                </h3>
              </div>
              
              <form onSubmit={handleUploadDoc}>
                <div className="form-group">
                  <label htmlFor="doc-title">Document Title / File Name</label>
                  <input
                    id="doc-title"
                    type="text"
                    placeholder="e.g. Mygo_HR_Portal_User_Manual.txt"
                    className="form-input"
                    value={docName}
                    onChange={(e) => setDocName(e.target.value)}
                    required
                  />
                </div>

                <div className="form-group">
                  <label htmlFor="doc-content">Option A: Direct Text Input</label>
                  <textarea
                    id="doc-content"
                    rows={6}
                    placeholder="Paste the documentation contents here..."
                    className="form-input"
                    style={{ resize: 'vertical', fontFamily: 'inherit' }}
                    value={docContent}
                    onChange={(e) => setDocContent(e.target.value)}
                    disabled={!!uploadFile}
                  />
                </div>

                <div className="form-group">
                  <label htmlFor="file-upload-input">Option B: File Upload (.txt or .md)</label>
                  <input
                    id="file-upload-input"
                    type="file"
                    accept=".txt,.md"
                    className="form-input"
                    style={{ paddingTop: '8px' }}
                    onChange={(e) => {
                      if (e.target.files && e.target.files.length > 0) {
                        const file = e.target.files[0];
                        setUploadFile(file);
                        if (!docName) setDocName(file.name);
                      } else {
                        setUploadFile(null);
                      }
                    }}
                    disabled={!!docContent}
                  />
                </div>

                {uploadMessage && (
                  <div style={{ 
                    fontSize: '0.85rem', 
                    color: uploadMessage.includes('successfully') ? 'var(--success)' : 'var(--danger)',
                    padding: '8px 12px',
                    borderRadius: '4px',
                    background: uploadMessage.includes('successfully') ? 'rgba(16,185,129,0.06)' : 'rgba(239,68,68,0.06)',
                    marginBottom: '16px',
                    border: uploadMessage.includes('successfully') ? '1px solid rgba(16,185,129,0.12)' : '1px solid rgba(239,68,68,0.12)'
                  }}>
                    {uploadMessage}
                  </div>
                )}

                <button type="submit" className="card-action-btn" style={{ width: '100%', justifyContent: 'center' }} disabled={uploadLoading}>
                  <Upload size={16} />
                  <span>{uploadLoading ? 'Chunking & Indexing Embeddings...' : 'Incorporate Document'}</span>
                </button>
              </form>
            </div>

            {/* List Documents Panel */}
            <div className="admin-card glass-panel">
              <div className="admin-card-header">
                <h3>
                  <FileText size={18} style={{ color: 'var(--accent)' }} />
                  <span>Uploaded Documents ({docs.length})</span>
                </h3>
              </div>

              <div className="doc-list">
                {docs.map((doc) => (
                  <div className="doc-item" key={doc.id}>
                    <div className="doc-info">
                      <h4>{doc.name}</h4>
                      <div className="doc-meta">
                        <span>{Math.round(doc.char_count / 1000 * 10) / 10} KB </span>
                        <span style={{ margin: '0 6px' }}>•</span>
                        <span>Uploaded {new Date(doc.created_at).toLocaleDateString()}</span>
                      </div>
                    </div>
                    <button 
                      className="doc-delete-btn"
                      onClick={() => handleDeleteDoc(doc.id)}
                    >
                      <Trash2 size={16} />
                    </button>
                  </div>
                ))}

                {docs.length === 0 && (
                  <div style={{ textAlign: 'center', padding: '40px 0', color: 'var(--text-muted)' }}>
                    <Database size={36} style={{ color: 'var(--border-glass)', marginBottom: '12px' }} />
                    <p>No documents exist in Yoda's knowledge base.</p>
                    <p style={{ fontSize: '0.8rem', marginTop: '4px' }}>Upload system documents on the left to start RAG retrieval.</p>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Real-time Logs Tab */}
        {activeTab === 'logs' && (
          <div className="admin-card glass-panel animate-fade-in">
            <div className="admin-card-header">
              <h3>
                <Terminal size={18} style={{ color: 'var(--primary)' }} />
                <span>Full Telemetry Logs ({filteredLogs.length})</span>
              </h3>
              <div style={{ position: 'relative', width: '250px' }}>
                <Search size={16} style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
                <input
                  type="text"
                  placeholder="Search consumer/payload..."
                  className="form-input"
                  style={{ paddingLeft: '36px', height: '36px', fontSize: '0.85rem' }}
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                />
              </div>
            </div>

            <div className="table-container">
              <table>
                <thead>
                  <tr>
                    <th>Consumer App</th>
                    <th>Route</th>
                    <th>Payload (Prompt)</th>
                    <th>Response Output</th>
                    <th>Latency</th>
                    <th>Code</th>
                    <th>Time</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredLogs.map((log) => {
                    const isSuccess = log.status < 400;
                    const isSlow = log.latency_ms > 2000;
                    const isMedium = log.latency_ms > 500 && log.latency_ms <= 2000;
                    
                    return (
                      <tr key={log.id}>
                        <td style={{ fontWeight: 600 }}>{log.app_name}</td>
                        <td><code className="key-code">{log.endpoint}</code></td>
                        <td title={log.prompt} style={{ maxWidth: '200px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                          {log.prompt}
                        </td>
                        <td title={log.response} style={{ maxWidth: '250px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                          {log.response}
                        </td>
                        <td>
                          <div className={`latency-indicator ${isSlow ? 'slow' : isMedium ? 'medium' : 'fast'}`}>
                            <span className="dot"></span>
                            <span>{log.latency_ms} ms</span>
                          </div>
                        </td>
                        <td>
                          <span className={`badge ${isSuccess ? 'status-200' : 'status-error'}`}>
                            {log.status}
                          </span>
                        </td>
                        <td style={{ color: 'var(--text-muted)' }}>
                          {new Date(log.timestamp).toLocaleString()}
                        </td>
                      </tr>
                    );
                  })}
                  {filteredLogs.length === 0 && (
                    <tr>
                      <td colSpan={7} style={{ textAlign: 'center', padding: '30px', color: 'var(--text-muted)' }}>
                        No logs match your search criteria.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </main>

      {/* App Key Generated Modal */}
      {isAppModalOpen && (
        <div className="modal-overlay animate-fade-in">
          <div className="modal-content glass-panel-glow">
            <h3 className="modal-title">Generate API Consumer Token</h3>
            {generatedKey ? (
              <div>
                <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem', marginBottom: '16px' }}>
                  Provide this key to the application team. It is only shown once!
                </p>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '24px' }}>
                  <code className="key-code" style={{ fontSize: '1rem', flex: 1, padding: '12px', wordBreak: 'break-all' }}>
                    {generatedKey}
                  </code>
                  <button 
                    onClick={handleCopyKey}
                    className="card-action-btn"
                    style={{ padding: '12px' }}
                  >
                    {copiedKey ? <Check size={18} /> : <Copy size={18} />}
                  </button>
                </div>
                <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                  <button 
                    className="card-action-btn"
                    onClick={() => {
                      setIsAppModalOpen(false);
                      setGeneratedKey('');
                    }}
                  >
                    Close
                  </button>
                </div>
              </div>
            ) : (
              <form onSubmit={handleCreateApp}>
                <div className="form-group">
                  <label htmlFor="modal-app-name">Organization App Name</label>
                  <input
                    id="modal-app-name"
                    type="text"
                    placeholder="e.g. Mygo JIRA Sync"
                    className="form-input"
                    value={newAppName}
                    onChange={(e) => setNewAppName(e.target.value)}
                    required
                    autoFocus
                  />
                </div>
                {appError && (
                  <div className="error-message" style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '16px' }}>
                    <AlertTriangle size={16} />
                    <span>{appError}</span>
                  </div>
                )}
                <div className="modal-actions">
                  <button 
                    type="button" 
                    className="btn-secondary"
                    onClick={() => {
                      setIsAppModalOpen(false);
                      setNewAppName('');
                      setAppError('');
                    }}
                  >
                    Cancel
                  </button>
                  <button type="submit" className="card-action-btn">
                    Generate Key
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
