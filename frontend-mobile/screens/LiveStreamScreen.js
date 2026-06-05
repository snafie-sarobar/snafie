import React, { useState, useEffect, useRef } from 'react';
import { View, Text, TouchableOpacity, FlatList, SafeAreaView, TextInput, Alert, ActivityIndicator, StyleSheet, Modal, Platform } from 'react-native';
import { io } from 'socket.io-client';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Ionicons } from '@expo/vector-icons';

const API_URL = Platform.OS === 'web' ? 'http://localhost:3000' : 'http://10.0.2.2:3000';

export default function LiveStreamScreen({ navigation }) {
  const [liveStreams, setLiveStreams] = useState([]);
  const [activeStream, setActiveStream] = useState(null);
  const [streamMode, setStreamMode] = useState('browse');
  const [streamTitle, setStreamTitle] = useState('');
  const [streamCategory, setStreamCategory] = useState('Just Chatting');
  const [streamKey, setStreamKey] = useState('');
  const [streamId, setStreamId] = useState(null);
  const [isLive, setIsLive] = useState(false);
  const [viewerCount, setViewerCount] = useState(0);
  const [chatMessage, setChatMessage] = useState('');
  const [streamChat, setStreamChat] = useState([]);
  const [loading, setLoading] = useState(true);
  const [token, setToken] = useState('');
  const [showCreate, setShowCreate] = useState(false);
  const [showTipModal, setShowTipModal] = useState(false);
  const [tipAmount, setTipAmount] = useState(5);

  const socketRef = useRef(null);
  const chatEndRef = useRef(null);
  const currentUser = { id: 0, username: 'User' };

  const categories = ['Just Chatting', 'Gaming', 'Music', 'Art', 'Sports', 'News', 'Education', 'Technology', 'Cooking', 'Travel', 'Fitness'];

  useEffect(() => {
    init();
    return () => {
      if (socketRef.current) socketRef.current.disconnect();
    };
  }, []);

  useEffect(() => {
    if (token) {
      fetchLiveStreams();
      connectSocket();
    }
  }, [token]);

  const init = async () => {
    try {
      const t = await AsyncStorage.getItem('token');
      const userStr = await AsyncStorage.getItem('user');
      if (t) setToken(t);
      if (userStr) {
        const u = JSON.parse(userStr);
        currentUser.id = u.id;
        currentUser.username = u.username;
      }
    } catch (err) {
      console.error('Init error:', err);
    }
  };

  const connectSocket = () => {
    socketRef.current = io(API_URL, {
      auth: { token },
      transports: ['websocket']
    });
    socketRef.current.on('stream:chat', (data) => setStreamChat(prev => [...prev, data]));
    socketRef.current.on('stream:tip', (data) => {
      Alert.alert('Tip!', `${data.username} sent $${data.amount}`);
    });
    socketRef.current.on('stream:viewer-joined', () => setViewerCount(prev => prev + 1));
    socketRef.current.on('stream:started', () => fetchLiveStreams());
    socketRef.current.on('stream:ended', (data) => {
      if (activeStream?.id === data.streamId) {
        setActiveStream(null);
        setStreamMode('browse');
      }
      fetchLiveStreams();
    });
  };

  const fetchLiveStreams = async () => {
    try {
      const res = await fetch(`${API_URL}/api/stream/live`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      const data = await res.json();
      setLiveStreams(data);
    } catch (err) {
      console.error('Failed to fetch streams:', err);
    } finally {
      setLoading(false);
    }
  };

  const fetchStreamDetails = async (sId) => {
    try {
      const res = await fetch(`${API_URL}/api/stream/${sId}`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      const data = await res.json();
      setActiveStream(data);
      setViewerCount(data.viewer_count);
      socketRef.current?.emit('stream:join', { streamId: sId, username: currentUser.username });
      const chatRes = await fetch(`${API_URL}/api/stream/${sId}/chat`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      const chatData = await chatRes.json();
      setStreamChat(chatData);
    } catch (err) {
      console.error('Failed to fetch stream details:', err);
    }
  };

  const createStream = async () => {
    if (!streamTitle) {
      Alert.alert('Error', 'Stream title required');
      return;
    }
    try {
      const res = await fetch(`${API_URL}/api/stream/create`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: streamTitle, category: streamCategory })
      });
      const data = await res.json();
      setStreamKey(data.streamKey);
      setStreamId(data.streamId);
      setStreamMode('setup');
      setShowCreate(false);
    } catch (err) {
      Alert.alert('Error', 'Failed to create stream');
    }
  };

  const goLive = async () => {
    if (!streamId) return;
    try {
      await fetch(`${API_URL}/api/stream/go-live/${streamId}`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` }
      });
      setIsLive(true);
      setStreamMode('streaming');
      fetchLiveStreams();
    } catch (err) {
      Alert.alert('Error', 'Failed to go live');
    }
  };

  const endStream = async () => {
    if (!streamId) return;
    try {
      await fetch(`${API_URL}/api/stream/end/${streamId}`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` }
      });
      setIsLive(false);
      setStreamMode('browse');
      setStreamId(null);
      fetchLiveStreams();
    } catch (err) {
      Alert.alert('Error', 'Failed to end stream');
    }
  };

  const sendChat = () => {
    if (!chatMessage.trim() || !activeStream) return;
    socketRef.current?.emit('stream:chat', {
      streamId: activeStream.id,
      message: chatMessage,
      username: currentUser.username
    });
    setChatMessage('');
  };

  const sendTip = () => {
    if (!activeStream) return;
    socketRef.current?.emit('stream:tip', {
      streamId: activeStream.id,
      amount: tipAmount,
      username: currentUser.username
    });
    setShowTipModal(false);
  };

  const leaveStream = () => {
    socketRef.current?.emit('stream:leave', { streamId: activeStream.id });
    setActiveStream(null);
    setStreamChat([]);
  };

  const renderStream = ({ item }) => (
    <TouchableOpacity style={styles.streamCard} onPress={() => fetchStreamDetails(item.id)}>
      <View style={styles.streamThumb}>
        <Text style={{ fontSize: 24, color: '#555' }}>📡</Text>
        <View style={styles.liveBadge}><Text style={{ color: '#fff', fontSize: 10, fontWeight: 'bold' }}>LIVE</Text></View>
        <View style={styles.viewerBadge}><Text style={{ color: '#fff', fontSize: 10 }}>👁 {item.viewer_count}</Text></View>
      </View>
      <View style={{ padding: 10 }}>
        <Text style={{ color: '#fff', fontSize: 14, fontWeight: '600' }}>{item.title}</Text>
        <Text style={{ color: '#888', fontSize: 12, marginTop: 2 }}>{item.username}</Text>
        <Text style={{ color: '#4f46e5', fontSize: 11, marginTop: 2 }}>{item.category}</Text>
      </View>
    </TouchableOpacity>
  );

  if (loading) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: '#0f0f23', justifyContent: 'center', alignItems: 'center' }}>
        <ActivityIndicator size="large" color="#4f46e5" />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: '#0f0f23' }}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation?.goBack()}>
          <Ionicons name="arrow-back" size={24} color="#888" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>
          {activeStream ? activeStream.title : isLive ? 'Streaming' : 'Live Streams'}
        </Text>
        <TouchableOpacity onPress={() => setShowCreate(true)}>
          <Text style={{ color: '#dc2626', fontWeight: 'bold' }}>Go Live</Text>
        </TouchableOpacity>
      </View>

      <Modal visible={showCreate} animationType="slide" transparent>
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={{ color: '#fff', fontSize: 18, fontWeight: 'bold', marginBottom: 16 }}>Create Stream</Text>
            <TextInput style={styles.input} placeholder="Stream Title" value={streamTitle}
              onChangeText={setStreamTitle} placeholderTextColor="#555" />
            <View style={styles.categoryRow}>
              {categories.slice(0, 5).map(cat => (
                <TouchableOpacity key={cat} onPress={() => setStreamCategory(cat)}
                  style={{ ...styles.catBtn, ...(streamCategory === cat ? styles.catBtnActive : {}) }}>
                  <Text style={{ color: streamCategory === cat ? '#fff' : '#888', fontSize: 12 }}>{cat}</Text>
                </TouchableOpacity>
              ))}
            </View>
            <TouchableOpacity onPress={createStream} style={styles.createBtn}>
              <Text style={{ color: '#fff', fontWeight: 'bold' }}>Create Stream</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={() => setShowCreate(false)} style={{ padding: 12, alignItems: 'center' }}>
              <Text style={{ color: '#888' }}>Cancel</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      <Modal visible={showTipModal} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={styles.tipModal}>
            <Text style={{ color: '#fff', fontSize: 18, fontWeight: 'bold', marginBottom: 12 }}>Send Tip</Text>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 12 }}>
              {[1, 5, 10, 20, 50].map(a => (
                <TouchableOpacity key={a} onPress={() => setTipAmount(a)}
                  style={{ ...styles.tipBtn, ...(tipAmount === a ? styles.tipBtnActive : {}) }}>
                  <Text style={{ color: tipAmount === a ? '#fff' : '#888' }}>${a}</Text>
                </TouchableOpacity>
              ))}
            </View>
            <TouchableOpacity onPress={sendTip} style={styles.sendTipBtn}>
              <Text style={{ color: '#fff', fontWeight: 'bold' }}>Send ${tipAmount}</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={() => setShowTipModal(false)} style={{ padding: 10, alignItems: 'center' }}>
              <Text style={{ color: '#888' }}>Cancel</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {activeStream ? (
        <View style={{ flex: 1 }}>
          <View style={{ flex: 1, backgroundColor: '#000', justifyContent: 'center', alignItems: 'center' }}>
            <Text style={{ fontSize: 48 }}>📡</Text>
            <Text style={{ color: '#fff', fontSize: 16, marginTop: 8 }}>{activeStream.title}</Text>
            <View style={{ flexDirection: 'row', gap: 16, marginTop: 8 }}>
              <Text style={{ color: '#22c55e' }}>👁 {viewerCount}</Text>
              <Text style={{ color: '#888' }}>🎮 {activeStream.category}</Text>
            </View>
          </View>
          <View style={{ flexDirection: 'row', gap: 10, padding: 12, backgroundColor: '#1a1a3e' }}>
            <TouchableOpacity onPress={() => setShowTipModal(true)} style={styles.tipStreamBtn}>
              <Text style={{ color: '#fff', fontWeight: 'bold' }}>💵 Tip</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={leaveStream} style={styles.leaveStreamBtn}>
              <Text style={{ color: '#dc2626' }}>Leave</Text>
            </TouchableOpacity>
          </View>
          <View style={{ flex: 1, backgroundColor: '#151532' }}>
            <FlatList data={streamChat} keyExtractor={(_, i) => i.toString()}
              renderItem={({ item }) => (
                <View style={{ padding: 6, paddingHorizontal: 12 }}>
                  <Text style={{ color: '#4f46e5', fontWeight: 'bold' }}>{item.username}:</Text>
                  <Text style={{ color: '#ccc' }}> {item.message}</Text>
                </View>
              )}
              contentContainerStyle={{ flexGrow: 1 }} />
            <View style={{ flexDirection: 'row', padding: 10, backgroundColor: '#151532', borderTopWidth: 1, borderTopColor: '#2a2a5e' }}>
              <TextInput style={{ flex: 1, backgroundColor: '#1e1e42', borderRadius: 20, paddingHorizontal: 14, paddingVertical: 8, color: '#fff' }}
                value={chatMessage} onChangeText={setChatMessage} placeholder="Chat..." placeholderTextColor="#555"
                onSubmitEditing={sendChat} />
              <TouchableOpacity onPress={sendChat} style={{ marginLeft: 8, backgroundColor: '#4f46e5', borderRadius: 20, paddingHorizontal: 16, justifyContent: 'center' }}>
                <Text style={{ color: '#fff' }}>Send</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      ) : streamMode === 'setup' ? (
        <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', padding: 20 }}>
          <Text style={{ color: '#fff', fontSize: 18, marginBottom: 20 }}>Stream Setup</Text>
          <Text style={{ color: '#22c55e', fontSize: 14, fontFamily: 'monospace', marginBottom: 8 }}>
            Key: {streamKey?.substring(0, 20)}...
          </Text>
          <TouchableOpacity onPress={goLive} style={styles.goLiveBtn}>
            <Text style={{ color: '#fff', fontWeight: 'bold', fontSize: 16 }}>▶ Go Live</Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={() => setStreamMode('browse')} style={{ padding: 12 }}>
            <Text style={{ color: '#888' }}>Cancel</Text>
          </TouchableOpacity>
        </View>
      ) : isLive ? (
        <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
          <Text style={{ color: '#22c55e', fontSize: 24, fontWeight: 'bold' }}>🔴 LIVE</Text>
          <Text style={{ color: '#888', marginTop: 8 }}>Streaming...</Text>
          <TouchableOpacity onPress={endStream} style={styles.endStreamBtn}>
            <Text style={{ color: '#fff', fontWeight: 'bold' }}>End Stream</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <FlatList data={liveStreams} keyExtractor={(item) => item.id.toString()}
          renderItem={renderStream} numColumns={2} columnWrapperStyle={{ gap: 10 }}
          contentContainerStyle={{ padding: 12 }}
          ListEmptyComponent={
            <View style={{ alignItems: 'center', paddingTop: 80 }}>
              <Text style={{ fontSize: 48 }}>📡</Text>
              <Text style={{ color: '#888', fontSize: 16, marginTop: 12 }}>No live streams</Text>
              <TouchableOpacity onPress={() => setShowCreate(true)} style={styles.firstStreamBtn}>
                <Text style={{ color: '#fff', fontWeight: 'bold' }}>Start Streaming</Text>
              </TouchableOpacity>
            </View>
          } />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 14, backgroundColor: '#1a1a3e', borderBottomWidth: 1, borderBottomColor: '#2a2a5e' },
  headerTitle: { fontSize: 16, fontWeight: 'bold', color: '#fff', flex: 1, textAlign: 'center' },
  streamCard: { flex: 1, backgroundColor: '#1a1a3e', borderRadius: 12, marginBottom: 10, overflow: 'hidden', borderWidth: 1, borderColor: '#2a2a5e' },
  streamThumb: { height: 100, backgroundColor: '#151532', justifyContent: 'center', alignItems: 'center' },
  liveBadge: { position: 'absolute', top: 6, left: 6, backgroundColor: '#dc2626', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4 },
  viewerBadge: { position: 'absolute', top: 6, right: 6, backgroundColor: 'rgba(0,0,0,0.6)', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4 },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.7)', justifyContent: 'flex-end' },
  modalContent: { backgroundColor: '#1e1e42', borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 20, maxHeight: '70%' },
  input: { backgroundColor: '#151532', borderWidth: 1, borderColor: '#2a2a5e', borderRadius: 8, padding: 14, color: '#fff', marginBottom: 12, fontSize: 15 },
  categoryRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 16 },
  catBtn: { paddingHorizontal: 12, paddingVertical: 6, backgroundColor: '#151532', borderRadius: 6, borderWidth: 1, borderColor: '#2a2a5e' },
  catBtnActive: { backgroundColor: '#4f46e5', borderColor: '#4f46e5' },
  createBtn: { backgroundColor: '#dc2626', borderRadius: 8, padding: 14, alignItems: 'center', marginBottom: 8 },
  goLiveBtn: { backgroundColor: '#dc2626', borderRadius: 10, paddingVertical: 14, paddingHorizontal: 40, marginVertical: 12 },
  endStreamBtn: { backgroundColor: '#dc2626', borderRadius: 8, paddingVertical: 12, paddingHorizontal: 30, marginTop: 20 },
  tipStreamBtn: { flex: 1, backgroundColor: '#f59e0b', borderRadius: 8, padding: 12, alignItems: 'center' },
  leaveStreamBtn: { flex: 1, backgroundColor: '#2a2a5e', borderRadius: 8, padding: 12, alignItems: 'center' },
  firstStreamBtn: { marginTop: 16, backgroundColor: '#dc2626', borderRadius: 8, paddingVertical: 12, paddingHorizontal: 24 },
  tipModal: { backgroundColor: '#1e1e42', borderRadius: 16, padding: 20, width: '80%', alignSelf: 'center' },
  tipBtn: { paddingHorizontal: 20, paddingVertical: 10, backgroundColor: '#151532', borderRadius: 8, borderWidth: 1, borderColor: '#2a2a5e' },
  tipBtnActive: { backgroundColor: '#4f46e5', borderColor: '#4f46e5' },
  sendTipBtn: { backgroundColor: '#f59e0b', borderRadius: 8, padding: 14, alignItems: 'center', marginBottom: 8 },
});
