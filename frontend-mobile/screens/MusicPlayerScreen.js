import React, { useState, useEffect, useRef } from 'react';
import { View, Text, TouchableOpacity, FlatList, SafeAreaView, TextInput, Alert, ActivityIndicator, StyleSheet, Modal, Platform } from 'react-native';
import { Audio } from 'expo-av';
import * as DocumentPicker from 'expo-document-picker';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Ionicons } from '@expo/vector-icons';

const API_URL = Platform.OS === 'web' ? 'http://localhost:3000' : 'http://10.0.2.2:3000';

export default function MusicPlayerScreen({ navigation }) {
  const [songs, setSongs] = useState([]);
  const [currentSong, setCurrentSong] = useState(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [playlists, setPlaylists] = useState([]);
  const [activePlaylist, setActivePlaylist] = useState(null);
  const [playlistSongs, setPlaylistSongs] = useState([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [loading, setLoading] = useState(true);
  const [token, setToken] = useState('');
  const [showUpload, setShowUpload] = useState(false);
  const [showPlaylistModal, setShowPlaylistModal] = useState(false);
  const [newPlaylistName, setNewPlaylistName] = useState('');
  const [view, setView] = useState('library');
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);

  const soundRef = useRef(null);
  const currentUser = { id: 0, username: 'User' };

  useEffect(() => {
    init();
    return () => {
      if (soundRef.current) soundRef.current.unloadAsync();
    };
  }, []);

  useEffect(() => {
    if (token) {
      fetchSongs();
      fetchPlaylists();
    }
  }, [token]);

  useEffect(() => {
    if (searchQuery) {
      searchSongs(searchQuery);
    }
  }, [searchQuery]);

  const init = async () => {
    try {
      const t = await AsyncStorage.getItem('token');
      if (t) setToken(t);
      await Audio.setAudioModeAsync({ playsInSilentModeIOS: true, staysActiveInBackground: true });
    } catch (err) {
      console.error('Init error:', err);
    }
  };

  const fetchSongs = async () => {
    try {
      const res = await fetch(`${API_URL}/api/music/library`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      const data = await res.json();
      setSongs(data.songs || []);
    } catch (err) {
      console.error('Failed to fetch songs:', err);
    } finally {
      setLoading(false);
    }
  };

  const fetchPlaylists = async () => {
    try {
      const res = await fetch(`${API_URL}/api/music/playlists`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      const data = await res.json();
      setPlaylists(data);
    } catch (err) {
      console.error('Failed to fetch playlists:', err);
    }
  };

  const fetchPlaylistSongs = async (playlistId) => {
    try {
      const res = await fetch(`${API_URL}/api/music/playlists/${playlistId}`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      const data = await res.json();
      setPlaylistSongs(data.songs || []);
      setActivePlaylist(data);
      setView('playlistDetail');
    } catch (err) {
      console.error('Failed to fetch playlist songs:', err);
    }
  };

  const searchSongs = async (query) => {
    if (!query.trim()) { setSearchResults([]); return; }
    try {
      const res = await fetch(`${API_URL}/api/music/search?q=${encodeURIComponent(query)}`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      const data = await res.json();
      setSearchResults(data.songs || []);
    } catch (err) {
      console.error('Search failed:', err);
    }
  };

  const playSong = async (song) => {
    try {
      if (soundRef.current) {
        await soundRef.current.unloadAsync();
      }
      const { sound, status } = await Audio.Sound.createAsync(
        { uri: song.file_url },
        { shouldPlay: true, isLooping: false }
      );
      soundRef.current = sound;
      setCurrentSong(song);
      setIsPlaying(true);
      sound.setOnPlaybackStatusUpdate((status) => {
        if (status.isLoaded) {
          setCurrentTime(status.positionMillis / 1000);
          setDuration(status.durationMillis / 1000);
          if (status.didJustFinish) {
            setIsPlaying(false);
            playNext();
          }
        }
      });
    } catch (err) {
      console.error('Failed to play song:', err);
    }
  };

  const togglePlay = async () => {
    if (!soundRef.current) return;
    if (isPlaying) {
      await soundRef.current.pauseAsync();
    } else {
      await soundRef.current.playAsync();
    }
    setIsPlaying(!isPlaying);
  };

  const playNext = () => {
    const list = activePlaylist ? playlistSongs : (searchQuery ? searchResults : songs);
    if (list.length === 0) return;
    const idx = list.findIndex(s => s.id === currentSong?.id);
    const next = list[(idx + 1) % list.length];
    playSong(next);
  };

  const playPrevious = () => {
    const list = activePlaylist ? playlistSongs : (searchQuery ? searchResults : songs);
    if (list.length === 0) return;
    const idx = list.findIndex(s => s.id === currentSong?.id);
    const prev = list[(idx - 1 + list.length) % list.length];
    playSong(prev);
  };

  const uploadSong = async () => {
    try {
      const result = await DocumentPicker.getDocumentAsync({ type: 'audio/*' });
      if (!result.canceled && result.assets[0]) {
        const formData = new FormData();
        formData.append('audio', { uri: result.assets[0].uri, type: result.assets[0].mimeType || 'audio/mpeg', name: result.assets[0].name });
        formData.append('title', result.assets[0].name);
        const res = await fetch(`${API_URL}/api/music/upload`, {
          method: 'POST',
          headers: { Authorization: `Bearer ${token}` },
          body: formData
        });
        if (res.ok) {
          Alert.alert('Success', 'Song uploaded');
          setShowUpload(false);
          fetchSongs();
        } else {
          Alert.alert('Error', 'Upload failed');
        }
      }
    } catch (err) {
      Alert.alert('Error', 'Failed to upload');
    }
  };

  const createPlaylist = async () => {
    if (!newPlaylistName) return;
    try {
      await fetch(`${API_URL}/api/music/playlists`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: newPlaylistName })
      });
      setNewPlaylistName('');
      setShowPlaylistModal(false);
      fetchPlaylists();
    } catch (err) {
      Alert.alert('Error', 'Failed to create playlist');
    }
  };

  const deleteSong = async (songId) => {
    try {
      await fetch(`${API_URL}/api/music/song/${songId}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` }
      });
      setSongs(prev => prev.filter(s => s.id !== songId));
    } catch (err) {
      console.error('Failed to delete song:', err);
    }
  };

  const formatTime = (s) => {
    if (!s || isNaN(s)) return '0:00';
    const m = Math.floor(s / 60);
    const sec = Math.floor(s % 60);
    return `${m}:${sec.toString().padStart(2, '0')}`;
  };

  const renderSong = ({ item }) => (
    <TouchableOpacity style={styles.songItem} onPress={() => playSong(item)}>
      <View style={styles.songCover}>
        <Ionicons name="musical-note" size={18} color="#666" />
      </View>
      <View style={{ flex: 1, marginLeft: 10 }}>
        <Text style={{ color: currentSong?.id === item.id ? '#4f46e5' : '#fff', fontSize: 14, fontWeight: '500' }}>
          {item.title}
        </Text>
        <Text style={{ color: '#888', fontSize: 12 }}>{item.artist}</Text>
      </View>
      <Text style={{ color: '#666', fontSize: 12 }}>{item.duration ? formatTime(item.duration) : '--:--'}</Text>
      <TouchableOpacity onPress={() => deleteSong(item.id)} style={{ marginLeft: 8 }}>
        <Ionicons name="trash-outline" size={16} color="#555" />
      </TouchableOpacity>
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
        <Text style={styles.headerTitle}>Music</Text>
        <TouchableOpacity onPress={() => setShowUpload(true)}>
          <Ionicons name="cloud-upload-outline" size={24} color="#888" />
        </TouchableOpacity>
      </View>

      <View style={styles.viewTabs}>
        {['library', 'playlists'].map(t => (
          <TouchableOpacity key={t} onPress={() => { setView(t); setActivePlaylist(null); }}
            style={{ ...styles.viewTab, ...(view === t || (view === 'playlistDetail' && t === 'library') ? styles.viewTabActive : {}) }}>
            <Text style={{ color: view === t ? '#fff' : '#888' }}>{t === 'library' ? 'Songs' : 'Playlists'}</Text>
          </TouchableOpacity>
        ))}
      </View>

      <View style={{ paddingHorizontal: 12, paddingVertical: 8 }}>
        <TextInput style={styles.searchInput} placeholder="Search songs..." value={searchQuery}
          onChangeText={setSearchQuery} placeholderTextColor="#555" />
      </View>

      {view === 'library' || view === 'playlistDetail' ? (
        <FlatList data={searchQuery ? searchResults : (activePlaylist ? playlistSongs : songs)}
          keyExtractor={(item, idx) => (item.id || idx).toString()}
          renderItem={renderSong}
          contentContainerStyle={{ paddingHorizontal: 12 }}
          ListEmptyComponent={
            <View style={{ alignItems: 'center', paddingTop: 60 }}>
              <Text style={{ fontSize: 48 }}>🎵</Text>
              <Text style={{ color: '#888', fontSize: 16, marginTop: 8 }}>No songs found</Text>
            </View>
          } />
      ) : (
        <FlatList data={playlists} keyExtractor={(item) => item.id.toString()}
          numColumns={2} columnWrapperStyle={{ gap: 10 }}
          contentContainerStyle={{ padding: 12 }}
          ListHeaderComponent={
            <TouchableOpacity onPress={() => setShowPlaylistModal(true)} style={styles.createPlaylistCard}>
              <Ionicons name="add" size={32} color="#888" />
              <Text style={{ color: '#888', marginTop: 6 }}>New Playlist</Text>
            </TouchableOpacity>
          }
          renderItem={({ item }) => (
            <TouchableOpacity style={styles.playlistCard} onPress={() => fetchPlaylistSongs(item.id)}>
              <View style={styles.playlistCover}>
                <Ionicons name="musical-notes" size={24} color="#555" />
              </View>
              <Text style={{ color: '#fff', fontSize: 13, fontWeight: '600', marginTop: 6 }}>{item.name}</Text>
              <Text style={{ color: '#888', fontSize: 11 }}>{item.song_count || 0} songs</Text>
            </TouchableOpacity>
          )} />
      )}

      {currentSong && (
        <View style={styles.playerBar}>
          <View style={{ flexDirection: 'row', alignItems: 'center', flex: 1 }}>
            <View style={styles.playerCover}>
              <Ionicons name="musical-note" size={20} color="#666" />
            </View>
            <View style={{ marginLeft: 10, flex: 1 }}>
              <Text style={{ color: '#fff', fontSize: 13, fontWeight: '500' }}>{currentSong.title}</Text>
              <Text style={{ color: '#888', fontSize: 11 }}>{currentSong.artist}</Text>
            </View>
          </View>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
            <TouchableOpacity onPress={playPrevious}>
              <Ionicons name="play-skip-back" size={20} color="#888" />
            </TouchableOpacity>
            <TouchableOpacity onPress={togglePlay} style={styles.playPauseBtn}>
              <Ionicons name={isPlaying ? 'pause' : 'play'} size={20} color="#fff" />
            </TouchableOpacity>
            <TouchableOpacity onPress={playNext}>
              <Ionicons name="play-skip-forward" size={20} color="#888" />
            </TouchableOpacity>
          </View>
        </View>
      )}

      <Modal visible={showUpload} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={styles.uploadModal}>
            <Text style={{ color: '#fff', fontSize: 18, fontWeight: 'bold', marginBottom: 16 }}>Upload Music</Text>
            <TouchableOpacity onPress={uploadSong} style={styles.uploadBtn}>
              <Ionicons name="cloud-upload" size={40} color="#888" />
              <Text style={{ color: '#888', marginTop: 8 }}>Select audio file</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={() => setShowUpload(false)} style={{ padding: 12, alignItems: 'center' }}>
              <Text style={{ color: '#888' }}>Cancel</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      <Modal visible={showPlaylistModal} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={{ backgroundColor: '#1e1e42', borderRadius: 16, padding: 20, width: '80%' }}>
            <Text style={{ color: '#fff', fontSize: 18, fontWeight: 'bold', marginBottom: 16 }}>New Playlist</Text>
            <TextInput style={styles.input} placeholder="Playlist name" value={newPlaylistName}
              onChangeText={setNewPlaylistName} placeholderTextColor="#555" />
            <TouchableOpacity onPress={createPlaylist} style={styles.uploadBtn}>
              <Text style={{ color: '#fff', fontWeight: 'bold' }}>Create</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={() => setShowPlaylistModal(false)} style={{ padding: 12, alignItems: 'center' }}>
              <Text style={{ color: '#888' }}>Cancel</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 14, backgroundColor: '#1a1a3e', borderBottomWidth: 1, borderBottomColor: '#2a2a5e' },
  headerTitle: { fontSize: 18, fontWeight: 'bold', color: '#fff' },
  viewTabs: { flexDirection: 'row', padding: 10, gap: 8 },
  viewTab: { paddingHorizontal: 16, paddingVertical: 8, borderRadius: 8, backgroundColor: '#151532' },
  viewTabActive: { backgroundColor: '#4f46e5' },
  searchInput: { backgroundColor: '#151532', borderWidth: 1, borderColor: '#2a2a5e', borderRadius: 8, padding: 12, color: '#fff', fontSize: 14 },
  songItem: { flexDirection: 'row', alignItems: 'center', padding: 10, borderRadius: 8, marginBottom: 4 },
  songCover: { width: 36, height: 36, borderRadius: 6, backgroundColor: '#1e1e42', alignItems: 'center', justifyContent: 'center' },
  createPlaylistCard: { backgroundColor: '#1a1a3e', borderWidth: 2, borderColor: '#2a2a5e', borderStyle: 'dashed', borderRadius: 12, padding: 24, alignItems: 'center', justifyContent: 'center', marginBottom: 10, minHeight: 120 },
  playlistCard: { flex: 1, backgroundColor: '#1a1a3e', borderRadius: 12, padding: 14, marginBottom: 10, borderWidth: 1, borderColor: '#2a2a5e', alignItems: 'center' },
  playlistCover: { width: '100%', aspectRatio: 1, borderRadius: 8, backgroundColor: '#151532', alignItems: 'center', justifyContent: 'center' },
  playerBar: { flexDirection: 'row', alignItems: 'center', padding: 12, backgroundColor: '#1a1a3e', borderTopWidth: 1, borderTopColor: '#2a2a5e' },
  playerCover: { width: 40, height: 40, borderRadius: 6, backgroundColor: '#1e1e42', alignItems: 'center', justifyContent: 'center' },
  playPauseBtn: { width: 36, height: 36, borderRadius: 18, backgroundColor: '#4f46e5', alignItems: 'center', justifyContent: 'center' },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.7)', justifyContent: 'flex-end', alignItems: 'center' },
  uploadModal: { backgroundColor: '#1e1e42', borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 30, width: '100%', alignItems: 'center' },
  uploadBtn: { backgroundColor: '#151532', borderWidth: 2, borderColor: '#2a2a5e', borderStyle: 'dashed', borderRadius: 12, padding: 30, alignItems: 'center', width: '100%', marginBottom: 8 },
  input: { backgroundColor: '#151532', borderWidth: 1, borderColor: '#2a2a5e', borderRadius: 8, padding: 14, color: '#fff', marginBottom: 12, fontSize: 15 },
});
