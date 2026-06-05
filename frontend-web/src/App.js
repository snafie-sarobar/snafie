import React, { useState, useEffect, createContext, useContext } from 'react';
import { Routes, Route, Navigate, useNavigate } from 'react-router-dom';
import axios from 'axios';
import { io } from 'socket.io-client';
import { ToastContainer, toast } from 'react-toastify';
import 'react-toastify/dist/ReactToastify.css';
import ChatComponent from './components/ChatComponent';
import VideoCallComponent from './components/VideoCallComponent';
import LiveStreamComponent from './components/LiveStreamComponent';
import MusicPlayerComponent from './components/MusicPlayerComponent';
import MapsComponent from './components/MapsComponent';
import AIComponent from './components/AIComponent';

const API_URL = process.env.REACT_APP_API_URL || 'http://localhost:3000';
const SOCKET_URL = process.env.REACT_APP_SOCKET_URL || 'http://localhost:3000';

export const AppContext = createContext();
export const useApp = () => useContext(AppContext);

let socketInstance = null;

export const getSocket = () => socketInstance;

let tokenRefreshInterval = null;

function LoginPage() {
  const { login } = useApp();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      await login(email, password);
    } catch (err) {
      setError(err.response?.data?.error || 'Login failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={styles.authContainer}>
      <div style={styles.authCard}>
        <h1 style={styles.authTitle}>Welcome Back</h1>
        <p style={styles.authSubtitle}>Sign in to your account</p>
        {error && <div style={styles.errorMsg}>{error}</div>}
        <form onSubmit={handleSubmit} style={styles.authForm}>
          <div style={styles.formGroup}>
            <label style={styles.formLabel}>Email</label>
            <input type="email" value={email} onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com" required style={styles.formInput} />
          </div>
          <div style={styles.formGroup}>
            <label style={styles.formLabel}>Password</label>
            <input type="password" value={password} onChange={(e) => setPassword(e.target.value)}
              placeholder="Enter your password" required style={styles.formInput} />
          </div>
          <button type="submit" disabled={loading} style={styles.authButton}>
            {loading ? 'Signing in...' : 'Sign In'}
          </button>
        </form>
        <p style={styles.authFooter}>
          Don't have an account? <a href="/register" style={styles.authLink}>Register</a>
        </p>
      </div>
    </div>
  );
}

function RegisterPage() {
  const { register } = useApp();
  const [username, setUsername] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    if (password !== confirmPassword) {
      setError('Passwords do not match');
      return;
    }
    setLoading(true);
    try {
      await register(email, password, username);
    } catch (err) {
      setError(err.response?.data?.error || 'Registration failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={styles.authContainer}>
      <div style={styles.authCard}>
        <h1 style={styles.authTitle}>Create Account</h1>
        <p style={styles.authSubtitle}>Join our community</p>
        {error && <div style={styles.errorMsg}>{error}</div>}
        <form onSubmit={handleSubmit} style={styles.authForm}>
          <div style={styles.formGroup}>
            <label style={styles.formLabel}>Username</label>
            <input type="text" value={username} onChange={(e) => setUsername(e.target.value)}
              placeholder="Choose a username" required minLength={3} style={styles.formInput} />
          </div>
          <div style={styles.formGroup}>
            <label style={styles.formLabel}>Email</label>
            <input type="email" value={email} onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com" required style={styles.formInput} />
          </div>
          <div style={styles.formGroup}>
            <label style={styles.formLabel}>Password</label>
            <input type="password" value={password} onChange={(e) => setPassword(e.target.value)}
              placeholder="Min 8 characters" required minLength={8} style={styles.formInput} />
          </div>
          <div style={styles.formGroup}>
            <label style={styles.formLabel}>Confirm Password</label>
            <input type="password" value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              placeholder="Repeat password" required style={styles.formInput} />
          </div>
          <button type="submit" disabled={loading} style={styles.authButton}>
            {loading ? 'Creating Account...' : 'Create Account'}
          </button>
        </form>
        <p style={styles.authFooter}>
          Already have an account? <a href="/login" style={styles.authLink}>Sign In</a>
        </p>
      </div>
    </div>
  );
}

function MainLayout() {
  const navigate = useNavigate();
  const { user, logout, activeTab, setActiveTab, unreadCount } = useApp();

  const tabs = [
    { id: 'chat', label: 'Chat', icon: '💬', badge: unreadCount },
    { id: 'video', label: 'Video', icon: '📹' },
    { id: 'stream', label: 'Stream', icon: '📡' },
    { id: 'music', label: 'Music', icon: '🎵' },
    { id: 'maps', label: 'Maps', icon: '📍' },
    { id: 'ai', label: 'AI', icon: '🤖' },
  ];

  return (
    <div style={styles.layout}>
      <nav style={styles.sidebar}>
        <div style={styles.sidebarHeader}>
          <h2 style={styles.appLogo}>FullStack App</h2>
          <div style={styles.userInfo}>
            <div style={styles.userAvatar}>
              {user?.avatar ? <img src={user.avatar} alt="" style={styles.avatarImg} /> : user?.username?.[0]?.toUpperCase()}
            </div>
            <span style={styles.username}>{user?.username}</span>
          </div>
        </div>

        <div style={styles.navItems}>
          {tabs.map((tab) => (
            <button key={tab.id} onClick={() => setActiveTab(tab.id)}
              style={{ ...styles.navItem, ...(activeTab === tab.id ? styles.navItemActive : {}) }}>
              <span>{tab.icon}</span>
              <span>{tab.label}</span>
              {tab.badge > 0 && <span style={styles.badge}>{tab.badge}</span>}
            </button>
          ))}
        </div>

        <button onClick={logout} style={styles.logoutBtn}>Sign Out</button>
      </nav>

      <main style={styles.mainContent}>
        {activeTab === 'chat' && (
          <div style={styles.tabHeader}>
            <h2>Chat</h2>
            <button onClick={() => navigate('/chat')} style={styles.fullScreenBtn}>Full Screen</button>
          </div>
        )}
        {activeTab === 'video' && (
          <div style={styles.tabHeader}>
            <h2>Video Calls</h2>
            <button onClick={() => navigate('/video')} style={styles.fullScreenBtn}>Full Screen</button>
          </div>
        )}
        {activeTab === 'stream' && (
          <div style={styles.tabHeader}>
            <h2>Live Streaming</h2>
            <button onClick={() => navigate('/stream')} style={styles.fullScreenBtn}>Full Screen</button>
          </div>
        )}
        {activeTab === 'music' && (
          <div style={styles.tabHeader}>
            <h2>Music Player</h2>
            <button onClick={() => navigate('/music')} style={styles.fullScreenBtn}>Full Screen</button>
          </div>
        )}
        {activeTab === 'maps' && (
          <div style={styles.tabHeader}>
            <h2>Maps</h2>
            <button onClick={() => navigate('/maps')} style={styles.fullScreenBtn}>Full Screen</button>
          </div>
        )}
        {activeTab === 'ai' && (
          <div style={styles.tabHeader}>
            <h2>AI Assistant</h2>
            <button onClick={() => navigate('/ai')} style={styles.fullScreenBtn}>Full Screen</button>
          </div>
        )}
      </main>
    </div>
  );
}

function AppContent() {
  const { user, loading, activeTab, setActiveTab, logout } = useApp();

  const tabs = [
    { id: 'chat', label: 'Chat', icon: '💬' },
    { id: 'video', label: 'Video', icon: '📹' },
    { id: 'stream', label: 'Stream', icon: '📡' },
    { id: 'music', label: 'Music', icon: '🎵' },
    { id: 'maps', label: 'Maps', icon: '📍' },
    { id: 'ai', label: 'AI', icon: '🤖' },
  ];

  if (loading) {
    return <div style={styles.loadingScreen}><div className="spinner">Loading...</div></div>;
  }

  return (
    <div style={styles.appContainer}>
      <nav style={styles.topNav}>
        <div style={styles.topNavLeft}>
          <span style={styles.appTitle}>FullStack App</span>
        </div>
        <div style={styles.topNavCenter}>
          {tabs.map((tab) => (
            <button key={tab.id} onClick={() => setActiveTab(tab.id)}
              style={{ ...styles.topNavTab, ...(activeTab === tab.id ? styles.topNavTabActive : {}) }}>
              <span>{tab.icon}</span>
              <span style={styles.tabLabel}>{tab.label}</span>
            </button>
          ))}
        </div>
        <div style={styles.topNavRight}>
          <span style={styles.userBadge}>{user?.username}</span>
          <button onClick={logout} style={styles.logoutBtn}>Logout</button>
        </div>
      </nav>
      <main style={styles.mainArea}>
        {activeTab === 'chat' && <ChatComponent />}
        {activeTab === 'video' && <VideoCallComponent />}
        {activeTab === 'stream' && <LiveStreamComponent />}
        {activeTab === 'music' && <MusicPlayerComponent />}
        {activeTab === 'maps' && <MapsComponent />}
        {activeTab === 'ai' && <AIComponent />}
      </main>
    </div>
  );
}

export default function App() {
  const [user, setUser] = useState(null);
  const [token, setToken] = useState(localStorage.getItem('token'));
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('chat');
  const [unreadCount, setUnreadCount] = useState(0);

  useEffect(() => {
    if (token) {
      axios.defaults.headers.common['Authorization'] = `Bearer ${token}`;
      fetchUser();
    } else {
      setLoading(false);
    }
    return () => {
      if (tokenRefreshInterval) clearInterval(tokenRefreshInterval);
    };
  }, [token]);

  const fetchUser = async () => {
    try {
      const res = await axios.get(`${API_URL}/api/auth/me`);
      setUser(res.data);
      connectSocket(res.data);
    } catch (err) {
      console.error('Failed to fetch user:', err);
      localStorage.removeItem('token');
      setToken(null);
      setUser(null);
    } finally {
      setLoading(false);
    }
  };

  const connectSocket = (userData) => {
    if (socketInstance?.connected) return;

    socketInstance = io(SOCKET_URL, {
      auth: { token: localStorage.getItem('token') },
      transports: ['websocket', 'polling'],
      reconnection: true,
      reconnectionAttempts: 10,
      reconnectionDelay: 1000
    });

    socketInstance.on('connect', () => {
      console.log('Socket connected');
      toast.success('Connected to server');
    });

    socketInstance.on('connect_error', (err) => {
      console.error('Socket connection error:', err.message);
    });

    socketInstance.on('chat:message', (message) => {
      if (message.receiver_id === userData?.id || message.sender_id === userData?.id) {
        setUnreadCount(prev => prev + 1);
        toast.info(`New message from ${message.username}`);
      }
    });

    socketInstance.on('video:incoming-call', (data) => {
      toast.info(`Incoming call from ${data.caller.username}`);
    });

    socketInstance.on('notification:new', (data) => {
      toast.info(data.title, { body: data.body });
    });

    socketInstance.on('disconnect', () => {
      console.log('Socket disconnected');
    });
  };

  const login = async (email, password) => {
    const res = await axios.post(`${API_URL}/api/auth/login`, { email, password });
    const { token: newToken, user: userData } = res.data;
    localStorage.setItem('token', newToken);
    axios.defaults.headers.common['Authorization'] = `Bearer ${newToken}`;
    setToken(newToken);
    setUser(userData);
    connectSocket(userData);
  };

  const register = async (email, password, username) => {
    const res = await axios.post(`${API_URL}/api/auth/register`, { email, password, username, confirmPassword: password });
    const { token: newToken, user: userData } = res.data;
    localStorage.setItem('token', newToken);
    axios.defaults.headers.common['Authorization'] = `Bearer ${newToken}`;
    setToken(newToken);
    setUser(userData);
    connectSocket(userData);
  };

  const logout = async () => {
    try {
      await axios.post(`${API_URL}/api/auth/logout`);
    } catch (err) {
      console.error('Logout error:', err);
    }
    localStorage.removeItem('token');
    delete axios.defaults.headers.common['Authorization'];
    if (socketInstance) {
      socketInstance.disconnect();
      socketInstance = null;
    }
    setUser(null);
    setToken(null);
    setActiveTab('chat');
  };

  const value = { user, token, loading, login, register, logout, activeTab, setActiveTab, unreadCount, setUnreadCount };

  return (
    <AppContext.Provider value={value}>
      <Routes>
        <Route path="/login" element={!user ? <LoginPage /> : <Navigate to="/" />} />
        <Route path="/register" element={!user ? <RegisterPage /> : <Navigate to="/" />} />
        <Route path="/*" element={user ? <AppContent /> : <Navigate to="/login" />} />
      </Routes>
      <ToastContainer position="bottom-right" autoClose={3000} theme="dark" />
    </AppContext.Provider>
  );
}

const styles = {
  appContainer: { display: 'flex', flexDirection: 'column', height: '100vh', background: '#0f0f23', color: '#e0e0e0' },
  topNav: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 20px', background: '#1a1a3e', borderBottom: '1px solid #2a2a5e', boxShadow: '0 2px 10px rgba(0,0,0,0.3)' },
  topNavLeft: { display: 'flex', alignItems: 'center', gap: '10px' },
  appTitle: { fontSize: '20px', fontWeight: 'bold', color: '#4f46e5' },
  topNavCenter: { display: 'flex', gap: '5px' },
  topNavTab: { display: 'flex', alignItems: 'center', gap: '5px', padding: '8px 15px', border: 'none', background: 'transparent', color: '#888', cursor: 'pointer', borderRadius: '8px', fontSize: '14px', transition: 'all 0.2s' },
  topNavTabActive: { background: '#4f46e5', color: '#fff' },
  tabLabel: { display: 'none' },
  topNavRight: { display: 'flex', alignItems: 'center', gap: '15px' },
  userBadge: { color: '#aaa' },
  logoutBtn: { padding: '8px 16px', background: '#dc2626', color: '#fff', border: 'none', borderRadius: '6px', cursor: 'pointer', fontSize: '13px' },
  mainArea: { flex: 1, overflow: 'auto', padding: '20px' },
  loadingScreen: { display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh', background: '#0f0f23', color: '#4f46e5', fontSize: '24px' },
  authContainer: { display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '100vh', background: 'linear-gradient(135deg, #0f0f23 0%, #1a1a3e 100%)' },
  authCard: { background: '#1e1e42', padding: '40px', borderRadius: '16px', width: '100%', maxWidth: '420px', boxShadow: '0 20px 60px rgba(0,0,0,0.5)', border: '1px solid #2a2a5e' },
  authTitle: { textAlign: 'center', color: '#fff', fontSize: '28px', margin: '0 0 8px 0' },
  authSubtitle: { textAlign: 'center', color: '#888', margin: '0 0 24px 0' },
  authForm: { display: 'flex', flexDirection: 'column', gap: '16px' },
  formGroup: { display: 'flex', flexDirection: 'column', gap: '6px' },
  formLabel: { color: '#aaa', fontSize: '14px', fontWeight: 500 },
  formInput: { padding: '12px 16px', background: '#151532', border: '1px solid #2a2a5e', borderRadius: '8px', color: '#fff', fontSize: '15px', outline: 'none', transition: 'border 0.2s' },
  authButton: { padding: '14px', background: '#4f46e5', color: '#fff', border: 'none', borderRadius: '8px', fontSize: '16px', fontWeight: 600, cursor: 'pointer', transition: 'background 0.2s', marginTop: '8px' },
  errorMsg: { padding: '12px', background: 'rgba(220,38,38,0.1)', border: '1px solid #dc2626', borderRadius: '8px', color: '#ef4444', fontSize: '14px', textAlign: 'center' },
  authFooter: { textAlign: 'center', color: '#888', marginTop: '20px', fontSize: '14px' },
  authLink: { color: '#4f46e5', textDecoration: 'none' },
  layout: { display: 'flex', height: '100vh' },
  sidebar: { width: '240px', background: '#1a1a3e', display: 'flex', flexDirection: 'column', borderRight: '1px solid #2a2a5e' },
  sidebarHeader: { padding: '20px', borderBottom: '1px solid #2a2a5e' },
  appLogo: { margin: 0, fontSize: '18px', color: '#4f46e5', marginBottom: '15px' },
  userInfo: { display: 'flex', alignItems: 'center', gap: '10px' },
  userAvatar: { width: '36px', height: '36px', borderRadius: '50%', background: '#4f46e5', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '16px', fontWeight: 'bold', color: '#fff', overflow: 'hidden' },
  avatarImg: { width: '100%', height: '100%', objectFit: 'cover' },
  username: { fontSize: '14px', color: '#ccc' },
  navItems: { flex: 1, padding: '10px', display: 'flex', flexDirection: 'column', gap: '2px' },
  navItem: { display: 'flex', alignItems: 'center', gap: '10px', padding: '12px 16px', border: 'none', background: 'transparent', color: '#888', cursor: 'pointer', borderRadius: '8px', fontSize: '14px', textAlign: 'left', transition: 'all 0.2s' },
  navItemActive: { background: '#4f46e5', color: '#fff' },
  badge: { marginLeft: 'auto', background: '#dc2626', color: '#fff', borderRadius: '50%', padding: '2px 8px', fontSize: '11px', fontWeight: 'bold' },
  mainContent: { flex: 1, padding: '20px', overflow: 'auto' },
  tabHeader: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '20px' },
  fullScreenBtn: { padding: '8px 16px', background: '#4f46e5', color: '#fff', border: 'none', borderRadius: '6px', cursor: 'pointer', fontSize: '13px' },
};

window.__appStyles = styles;
