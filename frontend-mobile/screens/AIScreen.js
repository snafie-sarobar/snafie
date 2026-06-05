import React, { useState, useEffect, useRef } from 'react';
import { View, Text, TextInput, TouchableOpacity, FlatList, SafeAreaView, Alert, ActivityIndicator, StyleSheet, Modal, Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Ionicons } from '@expo/vector-icons';

const API_URL = Platform.OS === 'web' ? 'http://localhost:3000' : 'http://10.0.2.2:3000';

const PERSONALITIES = [
  { id: 'default', name: 'Assistant', icon: '🤖' },
  { id: 'creative', name: 'Creative', icon: '✍️' },
  { id: 'code', name: 'Code Expert', icon: '💻' },
  { id: 'translator', name: 'Translator', icon: '🌍' },
  { id: 'tutor', name: 'Tutor', icon: '📚' },
  { id: 'therapist', name: 'Counselor', icon: '❤️' },
  { id: 'funny', name: 'Comedian', icon: '😂' },
];

export default function AIScreen({ navigation }) {
  const [messages, setMessages] = useState([]);
  const [conversations, setConversations] = useState([]);
  const [input, setInput] = useState('');
  const [personality, setPersonality] = useState('default');
  const [activeConversation, setActiveConversation] = useState(null);
  const [loading, setLoading] = useState(false);
  const [token, setToken] = useState('');
  const [showPersonalities, setShowPersonalities] = useState(false);
  const [showConversations, setShowConversations] = useState(false);
  const [mode, setMode] = useState('chat');

  const flatListRef = useRef(null);
  const currentUser = { id: 0, username: 'User' };

  useEffect(() => {
    init();
  }, []);

  useEffect(() => {
    if (token) fetchConversations();
  }, [token]);

  const init = async () => {
    try {
      const t = await AsyncStorage.getItem('token');
      if (t) setToken(t);
    } catch (err) {
      console.error('Init error:', err);
    }
  };

  const fetchConversations = async () => {
    try {
      const res = await fetch(`${API_URL}/api/ai/conversations`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      const data = await res.json();
      setConversations(data);
    } catch (err) {
      console.error('Failed to fetch conversations:', err);
    }
  };

  const sendMessage = async () => {
    if (!input.trim() || loading) return;
    const userMsg = { role: 'user', content: input.trim(), id: Date.now() };
    setMessages(prev => [...prev, userMsg]);
    setInput('');
    setLoading(true);

    try {
      const res = await fetch(`${API_URL}/api/ai/chat`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: userMsg.content,
          conversationId: activeConversation?.id,
          personality,
          mode
        })
      });
      const data = await res.json();
      setMessages(prev => [...prev, { role: 'assistant', content: data.response, id: Date.now() + 1 }]);
      if (!activeConversation) {
        setActiveConversation({ id: data.conversationId });
        fetchConversations();
      }
    } catch (err) {
      setMessages(prev => [...prev, { role: 'assistant', content: 'Error: Failed to get response', id: Date.now() + 1 }]);
    } finally {
      setLoading(false);
      flatListRef.current?.scrollToEnd();
    }
  };

  const deleteConversation = async (convId) => {
    try {
      await fetch(`${API_URL}/api/ai/conversations/${convId}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` }
      });
      if (activeConversation?.id === convId) {
        setActiveConversation(null);
        setMessages([]);
      }
      setConversations(prev => prev.filter(c => c.id !== convId));
    } catch (err) {
      console.error('Failed to delete conversation:', err);
    }
  };

  const startNew = () => {
    setActiveConversation(null);
    setMessages([]);
  };

  const currentPersonality = PERSONALITIES.find(p => p.id === personality) || PERSONALITIES[0];

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: '#0f0f23' }}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation?.goBack()}>
          <Ionicons name="arrow-back" size={24} color="#888" />
        </TouchableOpacity>
        <TouchableOpacity onPress={() => setShowConversations(true)} style={{ flex: 1, alignItems: 'center' }}>
          <Text style={styles.headerTitle}>
            {currentPersonality.icon} {currentPersonality.name}
          </Text>
          {activeConversation && <Text style={{ color: '#888', fontSize: 11 }}>Tap to switch</Text>}
        </TouchableOpacity>
        <TouchableOpacity onPress={startNew}>
          <Ionicons name="add-circle" size={26} color="#4f46e5" />
        </TouchableOpacity>
      </View>

      <View style={styles.personalityRow}>
        {PERSONALITIES.slice(0, 5).map(p => (
          <TouchableOpacity key={p.id} onPress={() => setPersonality(p.id)}
            style={{ ...styles.personalityBtn, ...(personality === p.id ? styles.personalityBtnActive : {}) }}>
            <Text style={{ fontSize: 18 }}>{p.icon}</Text>
          </TouchableOpacity>
        ))}
        <TouchableOpacity onPress={() => setShowPersonalities(true)} style={styles.personalityBtn}>
          <Text style={{ color: '#888' }}>...</Text>
        </TouchableOpacity>
      </View>

      <FlatList ref={flatListRef} data={messages} keyExtractor={(item, idx) => (item.id || idx).toString()}
        contentContainerStyle={{ padding: 16, flexGrow: 1 }}
        ListEmptyComponent={
          <View style={{ alignItems: 'center', justifyContent: 'center', flex: 1, paddingTop: 80 }}>
            <Text style={{ fontSize: 48, marginBottom: 12 }}>{currentPersonality.icon}</Text>
            <Text style={{ color: '#fff', fontSize: 18, fontWeight: 'bold', marginBottom: 6 }}>
              {currentPersonality.name}
            </Text>
            <Text style={{ color: '#888', fontSize: 14, textAlign: 'center' }}>
              How can I help you?
            </Text>
          </View>
        }
        renderItem={({ item }) => (
          <View style={{ ...styles.msgRow, ...(item.role === 'user' ? styles.msgRowUser : {}) }}>
            <View style={{ ...styles.msgBubble, ...(item.role === 'user' ? styles.userBubble : styles.aiBubble) }}>
              <Text style={{ color: item.role === 'user' ? '#fff' : '#e0e0e0' }}>{item.content}</Text>
            </View>
          </View>
        )} />

      {loading && (
        <View style={{ padding: 10, alignItems: 'center' }}>
          <ActivityIndicator size="small" color="#4f46e5" />
        </View>
      )}

      <View style={styles.inputBar}>
        <TextInput style={styles.input} value={input} onChangeText={setInput}
          placeholder={`Ask ${currentPersonality.name}...`} placeholderTextColor="#555"
          onSubmitEditing={sendMessage} returnKeyType="send" multiline />
        <TouchableOpacity onPress={sendMessage} disabled={loading || !input.trim()} style={styles.sendBtn}>
          <Ionicons name="send" size={20} color="#fff" />
        </TouchableOpacity>
      </View>

      <Modal visible={showConversations} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={{ color: '#fff', fontSize: 18, fontWeight: 'bold', marginBottom: 16 }}>Conversations</Text>
            <FlatList data={conversations} keyExtractor={(item) => item.id.toString()}
              renderItem={({ item }) => (
                <TouchableOpacity style={styles.convItem} onPress={() => {
                  setActiveConversation(item);
                  setShowConversations(false);
                }}>
                  <View style={{ flex: 1 }}>
                    <Text style={{ color: '#fff', fontSize: 14, fontWeight: '500' }}>{item.title}</Text>
                    <Text style={{ color: '#888', fontSize: 12 }}>
                      {item.personality} · {item.message_count} msgs
                    </Text>
                  </View>
                  <TouchableOpacity onPress={() => deleteConversation(item.id)}>
                    <Ionicons name="trash-outline" size={18} color="#dc2626" />
                  </TouchableOpacity>
                </TouchableOpacity>
              )}
              ListEmptyComponent={<Text style={{ color: '#888', textAlign: 'center', padding: 20 }}>No conversations</Text>} />
            <TouchableOpacity onPress={() => setShowConversations(false)} style={{ padding: 14, alignItems: 'center' }}>
              <Text style={{ color: '#888' }}>Close</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      <Modal visible={showPersonalities} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={{ backgroundColor: '#1e1e42', borderRadius: 16, padding: 20, width: '80%' }}>
            <Text style={{ color: '#fff', fontSize: 18, fontWeight: 'bold', marginBottom: 16 }}>Personalities</Text>
            {PERSONALITIES.map(p => (
              <TouchableOpacity key={p.id} onPress={() => { setPersonality(p.id); setShowPersonalities(false); }}
                style={{ ...styles.personalityOption, ...(personality === p.id ? { backgroundColor: 'rgba(79,70,229,0.2)' } : {}) }}>
                <Text style={{ fontSize: 24 }}>{p.icon}</Text>
                <View style={{ marginLeft: 12, flex: 1 }}>
                  <Text style={{ color: '#fff', fontWeight: '600', fontSize: 15 }}>{p.name}</Text>
                </View>
                {personality === p.id && <Ionicons name="checkmark" size={20} color="#4f46e5" />}
              </TouchableOpacity>
            ))}
            <TouchableOpacity onPress={() => setShowPersonalities(false)} style={{ padding: 12, alignItems: 'center' }}>
              <Text style={{ color: '#888' }}>Close</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: 'row', alignItems: 'center', padding: 14, backgroundColor: '#1a1a3e', borderBottomWidth: 1, borderBottomColor: '#2a2a5e' },
  headerTitle: { fontSize: 16, fontWeight: 'bold', color: '#fff' },
  personalityRow: { flexDirection: 'row', padding: 8, gap: 6, justifyContent: 'center', borderBottomWidth: 1, borderBottomColor: '#2a2a5e' },
  personalityBtn: { width: 38, height: 38, borderRadius: 19, backgroundColor: '#151532', alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: '#2a2a5e' },
  personalityBtnActive: { borderColor: '#4f46e5', backgroundColor: 'rgba(79,70,229,0.2)' },
  msgRow: { marginBottom: 10, maxWidth: '85%' },
  msgRowUser: { alignSelf: 'flex-end' },
  msgBubble: { padding: 12, borderRadius: 14 },
  userBubble: { backgroundColor: '#4f46e5', borderBottomRightRadius: 4 },
  aiBubble: { backgroundColor: '#1a1a3e', borderBottomLeftRadius: 4, borderWidth: 1, borderColor: '#2a2a5e' },
  inputBar: { flexDirection: 'row', alignItems: 'center', padding: 10, backgroundColor: '#151532', borderTopWidth: 1, borderTopColor: '#2a2a5e' },
  input: { flex: 1, backgroundColor: '#1e1e42', borderRadius: 20, paddingHorizontal: 16, paddingVertical: 10, color: '#fff', marginRight: 8, fontSize: 14, maxHeight: 100 },
  sendBtn: { backgroundColor: '#4f46e5', borderRadius: 20, width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.7)', justifyContent: 'flex-end', alignItems: 'center' },
  modalContent: { backgroundColor: '#1e1e42', borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 20, maxHeight: '70%', width: '100%' },
  convItem: { flexDirection: 'row', alignItems: 'center', padding: 14, borderBottomWidth: 1, borderBottomColor: '#2a2a5e' },
  personalityOption: { flexDirection: 'row', alignItems: 'center', padding: 12, borderRadius: 10, marginBottom: 4 },
});
