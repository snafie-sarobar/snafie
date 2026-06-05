import React, { useState, useEffect, useRef } from 'react';
import { View, Text, TouchableOpacity, SafeAreaView, FlatList, Alert, ActivityIndicator, StyleSheet, Platform } from 'react-native';
import { Camera } from 'expo-camera';
import { io } from 'socket.io-client';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Ionicons } from '@expo/vector-icons';

const API_URL = Platform.OS === 'web' ? 'http://localhost:3000' : 'http://10.0.2.2:3000';

export default function VideoCallScreen({ navigation }) {
  const [hasPermission, setHasPermission] = useState(null);
  const [contacts, setContacts] = useState([]);
  const [inCall, setInCall] = useState(false);
  const [incomingCall, setIncomingCall] = useState(null);
  const [roomId, setRoomId] = useState(null);
  const [isAudioMuted, setIsAudioMuted] = useState(false);
  const [isVideoMuted, setIsVideoMuted] = useState(false);
  const [loading, setLoading] = useState(true);
  const [token, setToken] = useState('');
  const [callDuration, setCallDuration] = useState(0);

  const socketRef = useRef(null);
  const cameraRef = useRef(null);
  const durationRef = useRef(null);
  const currentUser = { id: 0, username: 'User' };

  useEffect(() => {
    init();
    return () => {
      if (socketRef.current) socketRef.current.disconnect();
      if (durationRef.current) clearInterval(durationRef.current);
    };
  }, []);

  useEffect(() => {
    if (token) {
      fetchContacts();
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
      const { status } = await Camera.requestCameraPermissionsAsync();
      const audioStatus = await Camera.requestMicrophonePermissionsAsync();
      setHasPermission(status === 'granted');
    } catch (err) {
      console.error('Init error:', err);
    }
  };

  const connectSocket = () => {
    socketRef.current = io(API_URL, {
      auth: { token },
      transports: ['websocket']
    });
    socketRef.current.on('video:incoming-call', (data) => setIncomingCall(data));
    socketRef.current.on('video:call-accepted', (data) => {
      setInCall(true);
      setRoomId(data.roomId);
      setIncomingCall(null);
      startDuration();
    });
    socketRef.current.on('video:call-ended', (data) => {
      Alert.alert('Call Ended', `Duration: ${Math.floor((data.duration || 0) / 60)}:${(data.duration || 0) % 60}`);
      endCall();
    });
    socketRef.current.on('video:call-rejected', () => {
      Alert.alert('Call Rejected');
      setIncomingCall(null);
    });
  };

  const fetchContacts = async () => {
    try {
      const res = await fetch(`${API_URL}/api/video/contacts`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      const data = await res.json();
      setContacts(data);
    } catch (err) {
      console.error('Failed to fetch contacts:', err);
    } finally {
      setLoading(false);
    }
  };

  const startCall = async (calleeId) => {
    try {
      const res = await fetch(`${API_URL}/api/video/call/start`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ calleeId })
      });
      const data = await res.json();
      setRoomId(data.roomId);
      setInCall(true);
      socketRef.current?.emit('video:join', { roomId: data.roomId, username: currentUser.username });
      startDuration();
    } catch (err) {
      Alert.alert('Error', 'Failed to start call');
    }
  };

  const acceptCall = async () => {
    if (!incomingCall) return;
    try {
      await fetch(`${API_URL}/api/video/call/accept`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ roomId: incomingCall.roomId })
      });
      setRoomId(incomingCall.roomId);
      setInCall(true);
      setIncomingCall(null);
      socketRef.current?.emit('video:join', { roomId: incomingCall.roomId, username: currentUser.username });
      startDuration();
    } catch (err) {
      Alert.alert('Error', 'Failed to accept call');
    }
  };

  const rejectCall = async () => {
    if (!incomingCall) return;
    try {
      await fetch(`${API_URL}/api/video/call/reject`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ roomId: incomingCall.roomId })
      });
    } catch (err) {}
    setIncomingCall(null);
  };

  const endCall = async () => {
    if (roomId) {
      try {
        await fetch(`${API_URL}/api/video/call/end`, {
          method: 'POST',
          headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ roomId })
        });
      } catch (err) {}
    }
    setInCall(false);
    setRoomId(null);
    setCallDuration(0);
    if (durationRef.current) clearInterval(durationRef.current);
  };

  const startDuration = () => {
    durationRef.current = setInterval(() => setCallDuration(prev => prev + 1), 1000);
  };

  const formatDuration = (s) => {
    const m = Math.floor(s / 60);
    const sec = s % 60;
    return `${m.toString().padStart(2, '0')}:${sec.toString().padStart(2, '0')}`;
  };

  if (hasPermission === null) {
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
        <Text style={styles.headerTitle}>Video Calls</Text>
        <View style={{ width: 24 }} />
      </View>

      {incomingCall && (
        <View style={styles.incomingCall}>
          <Text style={{ color: '#fff', fontSize: 20, fontWeight: 'bold', marginBottom: 8 }}>
            {incomingCall.caller?.username}
          </Text>
          <Text style={{ color: '#888', fontSize: 14, marginBottom: 20 }}>Incoming call...</Text>
          <View style={{ flexDirection: 'row', gap: 20 }}>
            <TouchableOpacity onPress={acceptCall} style={styles.acceptBtn}>
              <Ionicons name="call" size={28} color="#fff" />
            </TouchableOpacity>
            <TouchableOpacity onPress={rejectCall} style={styles.rejectBtn}>
              <Ionicons name="call" size={28} color="#fff" />
            </TouchableOpacity>
          </View>
        </View>
      )}

      {inCall ? (
        <View style={{ flex: 1, backgroundColor: '#000' }}>
          <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
            <Text style={{ color: '#fff', fontSize: 24 }}>📹 Call Active</Text>
            <Text style={{ color: '#4f46e5', fontSize: 16, marginTop: 8 }}>{formatDuration(callDuration)}</Text>
          </View>
          <View style={styles.callControls}>
            <TouchableOpacity onPress={() => setIsAudioMuted(!isAudioMuted)} style={styles.ctrlBtn}>
              <Ionicons name={isAudioMuted ? 'mic-off' : 'mic'} size={24} color="#fff" />
            </TouchableOpacity>
            <TouchableOpacity onPress={() => setIsVideoMuted(!isVideoMuted)} style={styles.ctrlBtn}>
              <Ionicons name={isVideoMuted ? 'videocam-off' : 'videocam'} size={24} color="#fff" />
            </TouchableOpacity>
            <TouchableOpacity onPress={endCall} style={styles.endCallBtn}>
              <Ionicons name="call" size={24} color="#fff" />
            </TouchableOpacity>
          </View>
        </View>
      ) : (
        <FlatList data={contacts} keyExtractor={(item) => item.id.toString()}
          contentContainerStyle={{ padding: 16 }}
          ListEmptyComponent={
            <View style={{ alignItems: 'center', paddingTop: 60 }}>
              <Text style={{ fontSize: 48 }}>📹</Text>
              <Text style={{ color: '#888', fontSize: 16, marginTop: 12 }}>No contacts online</Text>
            </View>
          }
          renderItem={({ item }) => (
            <View style={styles.contactCard}>
              <View style={styles.avatar}>
                <Text style={{ color: '#fff', fontSize: 18, fontWeight: 'bold' }}>
                  {item.username[0]?.toUpperCase()}
                </Text>
              </View>
              <View style={{ flex: 1, marginLeft: 14 }}>
                <Text style={{ color: '#fff', fontSize: 16, fontWeight: '600' }}>{item.username}</Text>
                <Text style={{ color: '#22c55e', fontSize: 13 }}>● Online</Text>
              </View>
              <TouchableOpacity onPress={() => startCall(item.id)} style={styles.callBtn}>
                <Ionicons name="call" size={20} color="#fff" />
              </TouchableOpacity>
            </View>
          )}
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 14, backgroundColor: '#1a1a3e', borderBottomWidth: 1, borderBottomColor: '#2a2a5e' },
  headerTitle: { fontSize: 18, fontWeight: 'bold', color: '#fff' },
  contactCard: { flexDirection: 'row', alignItems: 'center', padding: 14, backgroundColor: '#1a1a3e', borderRadius: 12, marginBottom: 8, borderWidth: 1, borderColor: '#2a2a5e' },
  avatar: { width: 48, height: 48, borderRadius: 24, backgroundColor: '#4f46e5', alignItems: 'center', justifyContent: 'center' },
  callBtn: { backgroundColor: '#22c55e', borderRadius: 25, width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  incomingCall: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.85)', justifyContent: 'center', alignItems: 'center', zIndex: 100 },
  acceptBtn: { backgroundColor: '#22c55e', borderRadius: 30, width: 60, height: 60, alignItems: 'center', justifyContent: 'center' },
  rejectBtn: { backgroundColor: '#dc2626', borderRadius: 30, width: 60, height: 60, alignItems: 'center', justifyContent: 'center' },
  callControls: { flexDirection: 'row', justifyContent: 'center', gap: 20, padding: 20, backgroundColor: '#1a1a3e' },
  ctrlBtn: { backgroundColor: '#2a2a5e', borderRadius: 25, width: 50, height: 50, alignItems: 'center', justifyContent: 'center' },
  endCallBtn: { backgroundColor: '#dc2626', borderRadius: 25, width: 50, height: 50, alignItems: 'center', justifyContent: 'center' },
});
