import React, { useState, useEffect, createContext, useContext } from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { initializeApp } from 'firebase/app';
import { getAuth, onAuthStateChanged, signInWithEmailAndPassword, createUserWithEmailAndPassword, signOut, updateProfile } from 'firebase/auth';
import { getFirestore, doc, setDoc, getDoc, serverTimestamp, collection, addDoc } from 'firebase/firestore';
import { getStorage } from 'firebase/storage';
import { ToastContainer, toast } from 'react-toastify';
import 'react-toastify/dist/ReactToastify.css';
import ChatComponent from './components/ChatComponent';
import VideoCallComponent from './components/VideoCallComponent';
import LiveStreamComponent from './components/LiveStreamComponent';
import MusicPlayerComponent from './components/MusicPlayerComponent';
import MapsComponent from './components/MapsComponent';
import AIComponent from './components/AIComponent';

const firebaseConfig = {
  apiKey: "AIzaSyA2wJMdFBdomcKYcsWFFWdsBIKAnhcdAHE",
  authDomain: "snafie-official.firebaseapp.com",
  projectId: "snafie-official",
  storageBucket: "snafie-official.firebasestorage.app",
  messagingSenderId: "1088596048077",
  appId: "1:1088596048077:web:bb3459a2a70f3ac864d184",
  measurementId: "G-CTX1QG92RC"
};

const firebaseApp = initializeApp(firebaseConfig);
export const auth = getAuth(firebaseApp);
export const db = getFirestore(firebaseApp);
export const storage = getStorage(firebaseApp);

export const AppContext = createContext();
export const useApp = () => useContext(AppContext);

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
      setError(err.message || 'Login failed');
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
      setError(err.message || 'Registration failed');
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
              placeholder="Min 6 characters" required minLength={6} style={styles.formInput} />
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

function AppContent() {
  const { user, logout, activeTab, setActiveTab } = useApp();

  const tabs = [
    { id: 'chat', label: 'Chat', icon: '💬' },
    { id: 'video', label: 'Video', icon: '📹' },
    { id: 'stream', label: 'Stream', icon: '📡' },
    { id: 'music', label: 'Music', icon: '🎵' },
    { id: 'maps', label: 'Maps', icon: '📍' },
    { id: 'ai', label: 'AI', icon: '🤖' },
  ];

  return (
    <div style={styles.appContainer}>
      <nav style={styles.topNav}>
        <div style={styles.topNavLeft}>
          <span style={styles.appTitle}>Snafic</span>
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
          <span style={styles.userBadge}>{user?.displayName || user?.email}</span>
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
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('chat');

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (firebaseUser) => {
      if (firebaseUser) {
        setUser({
          uid: firebaseUser.uid,
          email: firebaseUser.email,
          displayName: firebaseUser.displayName || firebaseUser.email.split('@')[0],
          photoURL: firebaseUser.photoURL,
        });
      } else {
        setUser(null);
      }
      setLoading(false);
    });
    return unsub;
  }, []);

  const login = async (email, password) => {
    const cred = await signInWithEmailAndPassword(auth, email, password);
    const fbUser = cred.user;
    try {
      await setDoc(doc(db, 'users', fbUser.uid), {
        email: fbUser.email,
        lastLogin: serverTimestamp(),
      }, { merge: true });
    } catch (e) { /* ok */ }
  };

  const register = async (email, password, username) => {
    const cred = await createUserWithEmailAndPassword(auth, email, password);
    const fbUser = cred.user;
    await updateProfile(fbUser, { displayName: username });
    await setDoc(doc(db, 'users', fbUser.uid), {
      email: fbUser.email,
      displayName: username,
      username,
      createdAt: serverTimestamp(),
      lastLogin: serverTimestamp(),
    });
  };

  const logout = async () => {
    await signOut(auth);
    setActiveTab('chat');
  };

  const value = { user, loading, login, register, logout, activeTab, setActiveTab };

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
  topNav: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 20px', background: '#1a1a3e', borderBottom: '1px solid #2a2a5e' },
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
  authContainer: { display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '100vh', background: 'linear-gradient(135deg, #0f0f23 0%, #1a1a3e 100%)' },
  authCard: { background: '#1e1e42', padding: '40px', borderRadius: '16px', width: '100%', maxWidth: '420px' },
  authTitle: { textAlign: 'center', color: '#fff', fontSize: '28px', margin: '0 0 8px 0' },
  authSubtitle: { textAlign: 'center', color: '#888', margin: '0 0 24px 0' },
  authForm: { display: 'flex', flexDirection: 'column', gap: '16px' },
  formGroup: { display: 'flex', flexDirection: 'column', gap: '6px' },
  formLabel: { color: '#aaa', fontSize: '14px', fontWeight: 500 },
  formInput: { padding: '12px 16px', background: '#151532', border: '1px solid #2a2a5e', borderRadius: '8px', color: '#fff', fontSize: '15px', outline: 'none' },
  authButton: { padding: '14px', background: '#4f46e5', color: '#fff', border: 'none', borderRadius: '8px', fontSize: '16px', fontWeight: 600, cursor: 'pointer', marginTop: '8px' },
  errorMsg: { padding: '12px', background: 'rgba(220,38,38,0.1)', border: '1px solid #dc2626', borderRadius: '8px', color: '#ef4444', fontSize: '14px', textAlign: 'center' },
  authFooter: { textAlign: 'center', color: '#888', marginTop: '20px', fontSize: '14px' },
  authLink: { color: '#4f46e5', textDecoration: 'none' },
};
