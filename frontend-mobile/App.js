import React, { useState, useEffect, createContext, useContext } from 'react';
import { View, Text, TextInput, TouchableOpacity, ScrollView, StyleSheet, Alert, ActivityIndicator, SafeAreaView, StatusBar, Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { io } from 'socket.io-client';

const API_URL = Platform.OS === 'web' ? 'http://localhost:3000' : 'http://10.0.2.2:3000';
const SOCKET_URL = API_URL;

const AppContext = createContext();
const useApp = () => useContext(AppContext);

let socketInstance = null;

const LoginScreen = ({ navigation }) => {
  const { login } = useApp();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);

  const handleLogin = async () => {
    setLoading(true);
    try {
      await login(email, password);
    } catch (err) {
      Alert.alert('Error', err.message || 'Login failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <SafeAreaView style={styles.authContainer}>
      <StatusBar barStyle="light-content" backgroundColor="#0f0f23" />
      <ScrollView contentContainerStyle={styles.authScroll}>
        <Text style={styles.appTitle}>FullStack App</Text>
        <Text style={styles.appSubtitle}>Sign in to continue</Text>
        <View style={styles.authForm}>
          <Text style={styles.formLabel}>Email</Text>
          <TextInput style={styles.formInput} value={email} onChangeText={setEmail}
            placeholder="you@example.com" placeholderTextColor="#555"
            keyboardType="email-address" autoCapitalize="none" />
          <Text style={styles.formLabel}>Password</Text>
          <TextInput style={styles.formInput} value={password} onChangeText={setPassword}
            placeholder="Enter password" placeholderTextColor="#555"
            secureTextEntry />
          <TouchableOpacity style={styles.authButton} onPress={handleLogin} disabled={loading}>
            {loading ? <ActivityIndicator color="#fff" /> : <Text style={styles.authButtonText}>Sign In</Text>}
          </TouchableOpacity>
        </View>
        <TouchableOpacity onPress={() => navigation.navigate('Register')}>
          <Text style={styles.authFooter}>Don't have an account? Register</Text>
        </TouchableOpacity>
      </ScrollView>
    </SafeAreaView>
  );
};

const RegisterScreen = ({ navigation }) => {
  const { register } = useApp();
  const [username, setUsername] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);

  const handleRegister = async () => {
    if (password.length < 8) {
      Alert.alert('Error', 'Password must be at least 8 characters');
      return;
    }
    setLoading(true);
    try {
      await register(email, password, username);
    } catch (err) {
      Alert.alert('Error', err.message || 'Registration failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <SafeAreaView style={styles.authContainer}>
      <StatusBar barStyle="light-content" backgroundColor="#0f0f23" />
      <ScrollView contentContainerStyle={styles.authScroll}>
        <Text style={styles.appTitle}>Create Account</Text>
        <Text style={styles.appSubtitle}>Join the community</Text>
        <View style={styles.authForm}>
          <Text style={styles.formLabel}>Username</Text>
          <TextInput style={styles.formInput} value={username} onChangeText={setUsername}
            placeholder="Choose username" placeholderTextColor="#555" autoCapitalize="none" />
          <Text style={styles.formLabel}>Email</Text>
          <TextInput style={styles.formInput} value={email} onChangeText={setEmail}
            placeholder="you@example.com" placeholderTextColor="#555"
            keyboardType="email-address" autoCapitalize="none" />
          <Text style={styles.formLabel}>Password</Text>
          <TextInput style={styles.formInput} value={password} onChangeText={setPassword}
            placeholder="Min 8 characters" placeholderTextColor="#555" secureTextEntry />
          <TouchableOpacity style={styles.authButton} onPress={handleRegister} disabled={loading}>
            {loading ? <ActivityIndicator color="#fff" /> : <Text style={styles.authButtonText}>Create Account</Text>}
          </TouchableOpacity>
        </View>
        <TouchableOpacity onPress={() => navigation.navigate('Login')}>
          <Text style={styles.authFooter}>Already have an account? Sign In</Text>
        </TouchableOpacity>
      </ScrollView>
    </SafeAreaView>
  );
};

const HomeScreen = ({ navigation }) => {
  const { user, logout, unreadCount } = useApp();
  const tabs = [
    { id: 'Chat', icon: '💬', screen: 'Chat', badge: unreadCount },
    { id: 'Video', icon: '📹', screen: 'VideoCall' },
    { id: 'Stream', icon: '📡', screen: 'LiveStream' },
    { id: 'Music', icon: '🎵', screen: 'MusicPlayer' },
    { id: 'Maps', icon: '📍', screen: 'Maps' },
    { id: 'AI', icon: '🤖', screen: 'AI' },
  ];

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor="#1a1a3e" />
      <View style={styles.homeHeader}>
        <View>
          <Text style={styles.homeTitle}>FullStack App</Text>
          <Text style={styles.homeUser}>Welcome, {user?.username}</Text>
        </View>
        <TouchableOpacity onPress={logout} style={styles.logoutBtn}>
          <Text style={{ color: '#fff', fontSize: 14 }}>Logout</Text>
        </TouchableOpacity>
      </View>
      <ScrollView style={styles.homeContent}>
        <Text style={styles.sectionTitle}>Features</Text>
        <View style={styles.featuresGrid}>
          {tabs.map(tab => (
            <TouchableOpacity key={tab.id} style={styles.featureCard}
              onPress={() => navigation.navigate(tab.screen)}>
              <Text style={styles.featureIcon}>{tab.icon}</Text>
              <Text style={styles.featureLabel}>{tab.id}</Text>
              {tab.badge > 0 && (
                <View style={styles.featureBadge}>
                  <Text style={{ color: '#fff', fontSize: 11, fontWeight: 'bold' }}>{tab.badge}</Text>
                </View>
              )}
            </TouchableOpacity>
          ))}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
};

const AppContent = () => {
  return (
    <View style={{ flex: 1 }}>
      <Text style={{ color: '#fff', textAlign: 'center', marginTop: 50, fontSize: 18 }}>
        Mobile app loaded. Use React Navigation for routing.
      </Text>
    </View>
  );
};

export default function App() {
  const [user, setUser] = useState(null);
  const [token, setToken] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadToken();
  }, []);

  const loadToken = async () => {
    try {
      const saved = await AsyncStorage.getItem('token');
      if (saved) {
        setToken(saved);
        await fetchUser(saved);
      }
    } catch (err) {
      console.error('Failed to load token:', err);
    } finally {
      setLoading(false);
    }
  };

  const fetchUser = async (t) => {
    try {
      const res = await fetch(`${API_URL}/api/auth/me`, {
        headers: { Authorization: `Bearer ${t}` }
      });
      if (res.ok) {
        const data = await res.json();
        setUser(data);
        connectSocket(t);
      } else {
        await AsyncStorage.removeItem('token');
      }
    } catch (err) {
      console.error('Failed to fetch user:', err);
    }
  };

  const connectSocket = (t) => {
    if (socketInstance) return;
    socketInstance = io(SOCKET_URL, {
      auth: { token: t },
      transports: ['websocket'],
      reconnection: true
    });
    socketInstance.on('connect', () => console.log('Socket connected'));
    socketInstance.on('chat:message', (msg) => console.log('New message:', msg));
    socketInstance.on('disconnect', () => console.log('Socket disconnected'));
  };

  const login = async (email, password) => {
    const res = await fetch(`${API_URL}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password })
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error);
    await AsyncStorage.setItem('token', data.token);
    setToken(data.token);
    setUser(data.user);
    connectSocket(data.token);
  };

  const register = async (email, password, username) => {
    const res = await fetch(`${API_URL}/api/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password, username, confirmPassword: password })
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error);
    await AsyncStorage.setItem('token', data.token);
    setToken(data.token);
    setUser(data.user);
    connectSocket(data.token);
  };

  const logout = async () => {
    try {
      await fetch(`${API_URL}/api/auth/logout`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` }
      });
    } catch (err) {
      console.error('Logout error:', err);
    }
    await AsyncStorage.removeItem('token');
    if (socketInstance) {
      socketInstance.disconnect();
      socketInstance = null;
    }
    setUser(null);
    setToken(null);
  };

  const value = { user, token, login, register, logout, loading: false };

  if (loading) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#0f0f23' }}>
        <ActivityIndicator size="large" color="#4f46e5" />
      </View>
    );
  }

  if (!user) {
    return (
      <AppContext.Provider value={value}>
        <LoginScreen />
      </AppContext.Provider>
    );
  }

  return (
    <AppContext.Provider value={value}>
      <HomeScreen />
    </AppContext.Provider>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0f0f23' },
  authContainer: { flex: 1, backgroundColor: '#0f0f23' },
  authScroll: { flexGrow: 1, justifyContent: 'center', padding: 24 },
  appTitle: { fontSize: 32, fontWeight: 'bold', color: '#4f46e5', textAlign: 'center', marginBottom: 8 },
  appSubtitle: { fontSize: 16, color: '#888', textAlign: 'center', marginBottom: 32 },
  authForm: { gap: 16 },
  formLabel: { color: '#aaa', fontSize: 14, fontWeight: '500' },
  formInput: { backgroundColor: '#151532', borderWidth: 1, borderColor: '#2a2a5e', borderRadius: 8, padding: 14, color: '#fff', fontSize: 15 },
  authButton: { backgroundColor: '#4f46e5', borderRadius: 8, padding: 16, alignItems: 'center', marginTop: 8 },
  authButtonText: { color: '#fff', fontSize: 16, fontWeight: '600' },
  authFooter: { color: '#4f46e5', textAlign: 'center', marginTop: 20, fontSize: 14 },
  homeHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 16, backgroundColor: '#1a1a3e', borderBottomWidth: 1, borderBottomColor: '#2a2a5e' },
  homeTitle: { fontSize: 20, fontWeight: 'bold', color: '#4f46e5' },
  homeUser: { fontSize: 13, color: '#888', marginTop: 2 },
  logoutBtn: { padding: 8, paddingHorizontal: 16, backgroundColor: '#dc2626', borderRadius: 6 },
  homeContent: { flex: 1, padding: 16 },
  sectionTitle: { fontSize: 18, fontWeight: 'bold', color: '#fff', marginBottom: 16, marginTop: 8 },
  featuresGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
  featureCard: { width: '30%', aspectRatio: 1, backgroundColor: '#1a1a3e', borderRadius: 14, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: '#2a2a5e', position: 'relative' },
  featureIcon: { fontSize: 32, marginBottom: 6 },
  featureLabel: { fontSize: 12, color: '#ccc', fontWeight: '500' },
  featureBadge: { position: 'absolute', top: 6, right: 6, backgroundColor: '#dc2626', borderRadius: 10, width: 20, height: 20, alignItems: 'center', justifyContent: 'center' },
});
