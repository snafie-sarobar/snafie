import React, { useState, useEffect, useRef } from 'react';
import { View, Text, TextInput, TouchableOpacity, FlatList, SafeAreaView, Alert, Modal, Image, ActivityIndicator, StyleSheet, Platform } from 'react-native';
import io from 'socket.io-client';
import * as ImagePicker from 'expo-image-picker';
import { Audio } from 'expo-av';
import * as DocumentPicker from 'expo-document-picker';
import AsyncStorage from '@react-native-async-storage/async-storage';

const API_URL = Platform.OS === 'web' ? 'http://localhost:3000' : 'http://10.0.2.2:3000';

export default function ChatScreen({ navigation }) {
  const [conversations, setConversations] = useState([]);
  const [messages, setMessages] = useState([]);
  const [activeRoom, setActiveRoom] = useState(null);
  const [newMessage, setNewMessage] = useState('');
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [showUsers, setShowUsers] = useState(false);
  const [users, setUsers] = useState([]);
  const [token, setToken] = useState('');

  const flatListRef = useRef(null);
  const socketRef = useRef(null);
  const currentUser = { id: 0, username: 'User' };

  useEffect(() => {
    loadUser();
    loadToken();
    return () => {
      if (socketRef.current) socketRef.current.disconnect();
    };
  }, []);

  useEffect(() => {
    if (token) {
      fetchConversations();
      fetchUsers();
      connectSocket();
    }
  }, [token]);

  useEffect(() => {
    if (activeRoom) {
      fetchMessages(activeRoom);
    }
  }, [activeRoom]);

  const loadUser = async () => {
    try {
      const userStr = await AsyncStorage.getItem('user');
      if (userStr) {
        const u = JSON.parse(userStr);
        currentUser.id = u.id;
        currentUser.username = u.username;
      }
    } catch (err) {
      console.error('Failed to load user:', err);
    }
  };

  const loadToken = async () => {
    try {
      const t = await AsyncStorage.getItem('token');
      if (t) setToken(t);
    } catch (err) {
      console.error('Failed to load token:', err);
    }
  };

  const connectSocket = () => {
    if (socketRef.current?.connected) return;
    socketRef.current = io(API_URL, {
      auth: { token },
      transports: ['websocket'],
      reconnection: true
    });
    socketRef.current.on('connect', () => console.log('Chat socket connected'));
    socketRef.current.on('chat:message', handleNewMessage);
    socketRef.current.on('chat:typing', ({ userId, username, isTyping }) => {
      // Handle typing indicator
    });
  };

  const handleNewMessage = (msg) => {
    if (activeRoom === msg.room_id) {
      setMessages(prev => [...prev, msg]);
    } else {
      fetchConversations();
    }
    setTimeout(() => flatListRef.current?.scrollToEnd(), 100);
  };

  const fetchConversations = async () => {
    try {
      const res = await fetch(`${API_URL}/api/chat/conversations`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      const data = await res.json();
      setConversations(data);
    } catch (err) {
      console.error('Failed to fetch conversations:', err);
    } finally {
      setLoading(false);
    }
  };

  const fetchMessages = async (roomId) => {
    try {
      const res = await fetch(`${API_URL}/api/chat/messages/${roomId}?limit=50`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      const data = await res.json();
      setMessages(data);
      if (socketRef.current) {
        socketRef.current.emit('chat:join', roomId);
        socketRef.current.emit('chat:read', { roomId });
      }
    } catch (err) {
      console.error('Failed to fetch messages:', err);
    }
  };

  const fetchUsers = async () => {
    try {
      const res = await fetch(`${API_URL}/api/auth/users?limit=50`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      const data = await res.json();
      setUsers(data.users || []);
    } catch (err) {
      console.error('Failed to fetch users:', err);
    }
  };

  const sendMessage = async () => {
    if (!newMessage.trim() || sending || !activeRoom) return;
    setSending(true);
    try {
      const formData = new FormData();
      formData.append('roomId', activeRoom);
      formData.append('message', newMessage.trim());
      const res = await fetch(`${API_URL}/api/chat/messages`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
        body: formData
      });
      if (res.ok) {
        setNewMessage('');
      }
    } catch (err) {
      console.error('Failed to send message:', err);
    } finally {
      setSending(false);
    }
  };

  const pickImage = async () => {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.All,
      quality: 0.8
    });
    if (!result.canceled && result.assets[0]) {
      uploadFile(result.assets[0].uri, result.assets[0].mimeType || 'image/jpeg');
    }
  };

  const pickDocument = async () => {
    try {
      const result = await DocumentPicker.getDocumentAsync({ type: '*/*' });
      if (!result.canceled && result.assets[0]) {
        uploadFile(result.assets[0].uri, result.assets[0].mimeType || 'application/octet-stream');
      }
    } catch (err) {
      console.error('Document pick error:', err);
    }
  };

  const uploadFile = async (uri, mimeType) => {
    const formData = new FormData();
    formData.append('file', { uri, type: mimeType, name: `file_${Date.now()}` });
    formData.append('roomId', activeRoom);
    try {
      await fetch(`${API_URL}/api/chat/messages`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
        body: formData
      });
    } catch (err) {
      console.error('Upload error:', err);
    }
  };

  const startChat = (userId, username) => {
    setShowUsers(false);
    const roomId = [currentUser.id, userId].sort().join('-');
    setActiveRoom(roomId);
  };

  const formatTime = (dateStr) => {
    const d = new Date(dateStr);
    return `${d.getHours().toString().padStart(2, '0')}:${d.getMinutes().toString().padStart(2, '0')}`;
  };

  const renderMessage = ({ item }) => {
    const isMine = item.sender_id === currentUser.id;
    return (
      <View style={{ ...styles.msgRow, ...(isMine ? styles.msgRowMine : {}) }}>
        <View style={{ ...styles.msgBubble, ...(isMine ? styles.msgBubbleMine : styles.msgBubbleOther) }}>
          {!isMine && <Text style={styles.msgSender}>{item.username}</Text>}
          {item.message && <Text style={{ color: isMine ? '#fff' : '#e0e0e0' }}>{item.message}</Text>}
          {item.file_url && item.file_type?.startsWith('image/') && (
            <Image source={{ uri: item.file_url }} style={{ width: 200, height: 150, borderRadius: 8, marginTop: 4 }} />
          )}
          {item.file_url && item.file_type?.startsWith('audio/') && (
            <Text style={{ color: '#4f46e5', marginTop: 4 }}>🎵 Audio file</Text>
          )}
          <Text style={styles.msgTime}>{formatTime(item.created_at)}</Text>
        </View>
      </View>
    );
  };

  const renderConversation = ({ item }) => (
    <TouchableOpacity style={styles.convItem} onPress={() => setActiveRoom(item.room_id)}>
      <View style={styles.convAvatar}>
        <Text style={{ color: '#fff', fontSize: 18, fontWeight: 'bold' }}>
          {item.chat_name?.[0]?.toUpperCase() || '?'}
        </Text>
      </View>
      <View style={styles.convInfo}>
        <Text style={styles.convName}>{item.chat_name}</Text>
        <Text style={styles.convPreview}>{item.last_message || 'Sent a file'}</Text>
      </View>
      <View>
        <Text style={styles.convTime}>{formatTime(item.last_message_at)}</Text>
        {item.unread_count > 0 && (
          <View style={styles.unreadBadge}>
            <Text style={{ color: '#fff', fontSize: 11, fontWeight: 'bold' }}>{item.unread_count}</Text>
          </View>
        )}
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
          <Text style={{ color: '#888', fontSize: 16, marginRight: 10 }}>{'< Back'}</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>{activeRoom ? 'Chat' : 'Messages'}</Text>
        <TouchableOpacity onPress={() => setShowUsers(true)}>
          <Text style={{ color: '#4f46e5', fontSize: 14 }}>New Chat</Text>
        </TouchableOpacity>
      </View>

      <Modal visible={showUsers} animationType="slide" transparent>
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={{ color: '#fff', fontSize: 18, fontWeight: 'bold', marginBottom: 16 }}>Select User</Text>
            <FlatList data={users} keyExtractor={(item) => item.id.toString()}
              renderItem={({ item }) => (
                <TouchableOpacity style={styles.userItem} onPress={() => startChat(item.id, item.username)}>
                  <View style={styles.userAvatar}>
                    <Text style={{ color: '#fff', fontWeight: 'bold' }}>{item.username[0]?.toUpperCase()}</Text>
                  </View>
                  <Text style={{ color: '#fff', fontSize: 16, marginLeft: 12 }}>{item.username}</Text>
                </TouchableOpacity>
              )}
              ListEmptyComponent={<Text style={{ color: '#888', textAlign: 'center', padding: 20 }}>No users found</Text>}
            />
            <TouchableOpacity onPress={() => setShowUsers(false)} style={{ padding: 14, alignItems: 'center' }}>
              <Text style={{ color: '#888' }}>Cancel</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {!activeRoom ? (
        <FlatList data={conversations} keyExtractor={(item, idx) => item.room_id || idx.toString()}
          renderItem={renderConversation}
          ListEmptyComponent={
            <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', paddingTop: 100 }}>
              <Text style={{ fontSize: 48, marginBottom: 12 }}>💬</Text>
              <Text style={{ color: '#888', fontSize: 16 }}>No conversations</Text>
              <TouchableOpacity onPress={() => setShowUsers(true)} style={styles.startBtn}>
                <Text style={{ color: '#fff' }}>Start a chat</Text>
              </TouchableOpacity>
            </View>
          }
          contentContainerStyle={{ flexGrow: 1, padding: 12 }}
        />
      ) : (
        <View style={{ flex: 1 }}>
          <FlatList ref={flatListRef} data={messages} keyExtractor={(item, idx) => (item.id || idx).toString()}
            renderItem={renderMessage}
            contentContainerStyle={{ padding: 12, flexGrow: 1, justifyContent: 'flex-end' }}
            onContentSizeChange={() => flatListRef.current?.scrollToEnd()} />
          <View style={styles.inputBar}>
            <TouchableOpacity onPress={pickImage} style={styles.attachBtn}>
              <Text style={{ fontSize: 20 }}>📷</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={pickDocument} style={styles.attachBtn}>
              <Text style={{ fontSize: 20 }}>📎</Text>
            </TouchableOpacity>
            <TextInput style={styles.input} value={newMessage} onChangeText={setNewMessage}
              placeholder="Type a message..." placeholderTextColor="#555"
              onSubmitEditing={sendMessage} returnKeyType="send" />
            <TouchableOpacity onPress={sendMessage} style={styles.sendBtn}>
              <Text style={{ color: '#fff', fontSize: 12 }}>Send</Text>
            </TouchableOpacity>
          </View>
        </View>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 14, backgroundColor: '#1a1a3e', borderBottomWidth: 1, borderBottomColor: '#2a2a5e' },
  headerTitle: { fontSize: 18, fontWeight: 'bold', color: '#fff' },
  convItem: { flexDirection: 'row', alignItems: 'center', padding: 14, borderRadius: 10, marginBottom: 2, backgroundColor: '#151532' },
  convAvatar: { width: 44, height: 44, borderRadius: 22, backgroundColor: '#4f46e5', alignItems: 'center', justifyContent: 'center' },
  convInfo: { flex: 1, marginLeft: 12 },
  convName: { fontSize: 15, fontWeight: '600', color: '#fff' },
  convPreview: { fontSize: 13, color: '#888', marginTop: 2 },
  convTime: { fontSize: 11, color: '#666' },
  unreadBadge: { backgroundColor: '#4f46e5', borderRadius: 10, minWidth: 20, height: 20, alignItems: 'center', justifyContent: 'center', marginTop: 4 },
  msgRow: { flexDirection: 'row', marginBottom: 8, maxWidth: '85%' },
  msgRowMine: { alignSelf: 'flex-end' },
  msgBubble: { padding: 10, borderRadius: 14, maxWidth: '100%' },
  msgBubbleMine: { backgroundColor: '#4f46e5', borderBottomRightRadius: 4 },
  msgBubbleOther: { backgroundColor: '#1e1e42', borderBottomLeftRadius: 4 },
  msgSender: { fontSize: 12, fontWeight: '600', color: '#4f46e5', marginBottom: 4 },
  msgTime: { fontSize: 10, color: '#888', textAlign: 'right', marginTop: 4 },
  inputBar: { flexDirection: 'row', alignItems: 'center', padding: 10, backgroundColor: '#151532', borderTopWidth: 1, borderTopColor: '#2a2a5e' },
  attachBtn: { padding: 8 },
  input: { flex: 1, backgroundColor: '#1e1e42', borderRadius: 20, paddingHorizontal: 16, paddingVertical: 10, color: '#fff', marginHorizontal: 8, fontSize: 14 },
  sendBtn: { backgroundColor: '#4f46e5', borderRadius: 20, paddingHorizontal: 16, paddingVertical: 10 },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.7)', justifyContent: 'flex-end' },
  modalContent: { backgroundColor: '#1e1e42', borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 20, maxHeight: '70%' },
  userItem: { flexDirection: 'row', alignItems: 'center', padding: 14, borderBottomWidth: 1, borderBottomColor: '#2a2a5e' },
  userAvatar: { width: 40, height: 40, borderRadius: 20, backgroundColor: '#4f46e5', alignItems: 'center', justifyContent: 'center' },
  startBtn: { marginTop: 16, padding: 12, paddingHorizontal: 24, backgroundColor: '#4f46e5', borderRadius: 8 },
});
