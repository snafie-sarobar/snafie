import React, { useState, useEffect, useRef } from 'react';
import { View, Text, TouchableOpacity, SafeAreaView, TextInput, Alert, ActivityIndicator, FlatList, StyleSheet, Modal, Platform } from 'react-native';
import MapView, { Marker, Circle } from 'react-native-maps';
import * as Location from 'expo-location';
import { io } from 'socket.io-client';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Ionicons } from '@expo/vector-icons';

const API_URL = Platform.OS === 'web' ? 'http://localhost:3000' : 'http://10.0.2.2:3000';

export default function MapsScreen({ navigation }) {
  const [myLocation, setMyLocation] = useState(null);
  const [nearbyUsers, setNearbyUsers] = useState([]);
  const [savedPlaces, setSavedPlaces] = useState([]);
  const [geofences, setGeofences] = useState([]);
  const [locationHistory, setLocationHistory] = useState([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [isSharing, setIsSharing] = useState(true);
  const [showSavePlace, setShowSavePlace] = useState(false);
  const [savePlaceName, setSavePlaceName] = useState('');
  const [loading, setLoading] = useState(true);
  const [token, setToken] = useState('');
  const [activeView, setActiveView] = useState('map');

  const mapRef = useRef(null);
  const socketRef = useRef(null);
  const currentUser = { id: 0, username: 'User' };

  useEffect(() => {
    init();
    return () => {
      if (socketRef.current) socketRef.current.disconnect();
    };
  }, []);

  useEffect(() => {
    if (token) {
      fetchSavedPlaces();
      fetchGeofences();
      fetchLocationHistory();
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
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert('Permission denied', 'Location permission is required');
        return;
      }
      const loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High });
      const { latitude, longitude } = loc.coords;
      setMyLocation({ latitude, longitude });
      updateServerLocation(latitude, longitude);
      fetchNearbyUsers(latitude, longitude);
      Location.watchPositionAsync({ accuracy: Location.Accuracy.High, timeInterval: 10000, distanceInterval: 10 }, (pos) => {
        const { latitude, longitude } = pos.coords;
        setMyLocation({ latitude, longitude });
        if (isSharing) updateServerLocation(latitude, longitude);
      });
    } catch (err) {
      console.error('Init error:', err);
    } finally {
      setLoading(false);
    }
  };

  const connectSocket = () => {
    socketRef.current = io(API_URL, {
      auth: { token },
      transports: ['websocket']
    });
    socketRef.current.on('location:update', (data) => {
      if (data.userId !== currentUser.id) {
        setNearbyUsers(prev => {
          const existing = prev.findIndex(u => u.user_id === data.userId);
          if (existing >= 0) {
            const updated = [...prev];
            updated[existing] = { ...updated[existing], latitude: data.latitude, longitude: data.longitude };
            return updated;
          }
          return prev;
        });
      }
    });
  };

  const updateServerLocation = async (lat, lng) => {
    try {
      await fetch(`${API_URL}/api/maps/location`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ latitude: lat, longitude: lng })
      });
      socketRef.current?.emit('location:update', {
        latitude: lat,
        longitude: lng,
        username: currentUser.username
      });
    } catch (err) {
      console.error('Failed to update location:', err);
    }
  };

  const fetchNearbyUsers = async (lat, lng) => {
    try {
      const res = await fetch(`${API_URL}/api/maps/nearby?lat=${lat}&lng=${lng}&radius=50`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      const data = await res.json();
      setNearbyUsers(data);
    } catch (err) {
      console.error('Failed to fetch nearby users:', err);
    }
  };

  const fetchSavedPlaces = async () => {
    try {
      const res = await fetch(`${API_URL}/api/maps/places`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      const data = await res.json();
      setSavedPlaces(data);
    } catch (err) {
      console.error('Failed to fetch places:', err);
    }
  };

  const fetchGeofences = async () => {
    try {
      const res = await fetch(`${API_URL}/api/maps/geofences`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      const data = await res.json();
      setGeofences(data);
    } catch (err) {
      console.error('Failed to fetch geofences:', err);
    }
  };

  const fetchLocationHistory = async () => {
    try {
      const res = await fetch(`${API_URL}/api/maps/history?limit=30`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      const data = await res.json();
      setLocationHistory(data);
    } catch (err) {
      console.error('Failed to fetch history:', err);
    }
  };

  const searchPlaces = async (query) => {
    if (!query.trim()) { setSearchResults([]); return; }
    try {
      const res = await fetch(`https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(query)}&limit=5`);
      const data = await res.json();
      setSearchResults(data);
    } catch (err) {
      console.error('Search failed:', err);
    }
  };

  const goToLocation = (lat, lng) => {
    mapRef.current?.animateToRegion({ latitude: parseFloat(lat), longitude: parseFloat(lng), latitudeDelta: 0.05, longitudeDelta: 0.05 }, 500);
    setSearchResults([]);
    setSearchQuery('');
  };

  const savePlace = async () => {
    if (!savePlaceName || !myLocation) return;
    try {
      await fetch(`${API_URL}/api/maps/places`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ placeName: savePlaceName, latitude: myLocation.latitude, longitude: myLocation.longitude })
      });
      setShowSavePlace(false);
      setSavePlaceName('');
      fetchSavedPlaces();
      Alert.alert('Saved', 'Place saved successfully');
    } catch (err) {
      Alert.alert('Error', 'Failed to save place');
    }
  };

  const toggleSharing = async () => {
    try {
      await fetch(`${API_URL}/api/maps/sharing`, {
        method: 'PUT',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ isSharing: !isSharing })
      });
      setIsSharing(!isSharing);
    } catch (err) {
      console.error('Failed to toggle sharing:', err);
    }
  };

  const deletePlace = async (placeId) => {
    try {
      await fetch(`${API_URL}/api/maps/places/${placeId}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` }
      });
      setSavedPlaces(prev => prev.filter(p => p.id !== placeId));
    } catch (err) {
      console.error('Failed to delete place:', err);
    }
  };

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
        <Text style={styles.headerTitle}>Maps</Text>
        <TouchableOpacity onPress={toggleSharing}>
          <View style={{ ...styles.sharingBadge, backgroundColor: isSharing ? '#22c55e' : '#666' }}>
            <Text style={{ color: '#fff', fontSize: 11, fontWeight: 'bold' }}>{isSharing ? 'ON' : 'OFF'}</Text>
          </View>
        </TouchableOpacity>
      </View>

      <View style={styles.tabRow}>
        {['map', 'places', 'history'].map(tab => (
          <TouchableOpacity key={tab} onPress={() => setActiveView(tab)}
            style={{ ...styles.tab, ...(activeView === tab ? styles.tabActive : {}) }}>
            <Text style={{ color: activeView === tab ? '#fff' : '#888', fontSize: 13 }}>{tab.charAt(0).toUpperCase() + tab.slice(1)}</Text>
          </TouchableOpacity>
        ))}
      </View>

      {activeView === 'map' && (
        <View style={{ flex: 1 }}>
          <View style={styles.searchBar}>
            <TextInput style={styles.searchInput} placeholder="Search places..." value={searchQuery}
              onChangeText={(text) => { setSearchQuery(text); searchPlaces(text); }} placeholderTextColor="#555" />
            {searchResults.length > 0 && (
              <View style={styles.searchResults}>
                {searchResults.slice(0, 5).map((r, i) => (
                  <TouchableOpacity key={i} onPress={() => goToLocation(r.lat, r.lon)} style={styles.searchResultItem}>
                    <Text style={{ color: '#ccc', fontSize: 13 }} numberOfLines={1}>{r.display_name}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            )}
          </View>

          {myLocation ? (
            <MapView ref={mapRef} style={{ flex: 1 }} initialRegion={{
              latitude: myLocation.latitude,
              longitude: myLocation.longitude,
              latitudeDelta: 0.05,
              longitudeDelta: 0.05
            }} showsUserLocation={true} showsMyLocationButton={true}>
              {nearbyUsers.filter(u => u.latitude && u.longitude).map((user, idx) => (
                <Marker key={idx} coordinate={{ latitude: parseFloat(user.latitude), longitude: parseFloat(user.longitude) }}
                  title={user.username} description={user.place_name || 'Nearby'} pinColor="#22c55e" />
              ))}
              {savedPlaces.map((place, idx) => (
                <Marker key={`place-${idx}`} coordinate={{ latitude: parseFloat(place.latitude), longitude: parseFloat(place.longitude) }}
                  title={place.place_name} description={place.category} pinColor="#f59e0b" />
              ))}
              {geofences.filter(f => f.enabled).map((fence, idx) => (
                <Circle key={`fence-${idx}`} center={{ latitude: parseFloat(fence.latitude), longitude: parseFloat(fence.longitude) }}
                  radius={fence.radius_meters} strokeColor="#4f46e5" fillColor="rgba(79,70,229,0.1)" />
              ))}
            </MapView>
          ) : (
            <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
              <ActivityIndicator size="large" color="#4f46e5" />
              <Text style={{ color: '#888', marginTop: 12 }}>Acquiring location...</Text>
            </View>
          )}

          <View style={styles.mapActions}>
            <TouchableOpacity onPress={() => setShowSavePlace(true)} style={styles.mapActionBtn}>
              <Ionicons name="bookmark" size={20} color="#fff" />
            </TouchableOpacity>
            <TouchableOpacity onPress={() => myLocation && mapRef.current?.animateToRegion({
              latitude: myLocation.latitude, longitude: myLocation.longitude,
              latitudeDelta: 0.05, longitudeDelta: 0.05
            }, 500)} style={styles.mapActionBtn}>
              <Ionicons name="locate" size={20} color="#fff" />
            </TouchableOpacity>
          </View>
        </View>
      )}

      {activeView === 'places' && (
        <FlatList data={savedPlaces} keyExtractor={(item) => item.id.toString()}
          contentContainerStyle={{ padding: 16 }}
          ListEmptyComponent={
            <View style={{ alignItems: 'center', paddingTop: 60 }}>
              <Text style={{ fontSize: 48 }}>📍</Text>
              <Text style={{ color: '#888', fontSize: 16, marginTop: 8 }}>No saved places</Text>
            </View>
          }
          renderItem={({ item }) => (
            <View style={styles.placeItem}>
              <View style={{ flex: 1 }}>
                <Text style={{ color: '#fff', fontSize: 15, fontWeight: '600' }}>{item.place_name}</Text>
                <Text style={{ color: '#888', fontSize: 12 }}>{item.category} · {item.latitude?.toFixed(4)}, {item.longitude?.toFixed(4)}</Text>
              </View>
              <TouchableOpacity onPress={() => deletePlace(item.id)}>
                <Ionicons name="trash-outline" size={18} color="#dc2626" />
              </TouchableOpacity>
            </View>
          )} />
      )}

      {activeView === 'history' && (
        <FlatList data={locationHistory} keyExtractor={(item, idx) => (item.id || idx).toString()}
          contentContainerStyle={{ padding: 16 }}
          ListEmptyComponent={
            <View style={{ alignItems: 'center', paddingTop: 60 }}>
              <Text style={{ fontSize: 48 }}>🕐</Text>
              <Text style={{ color: '#888', fontSize: 16, marginTop: 8 }}>No location history</Text>
            </View>
          }
          renderItem={({ item }) => (
            <View style={styles.historyItem}>
              <Text style={{ color: '#888', fontSize: 12 }}>
                {new Date(item.recorded_at).toLocaleString()}
              </Text>
              <Text style={{ color: '#aaa', fontSize: 13, marginTop: 2 }}>
                {parseFloat(item.latitude).toFixed(4)}, {parseFloat(item.longitude).toFixed(4)}
              </Text>
            </View>
          )} />
      )}

      <Modal visible={showSavePlace} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={styles.saveModal}>
            <Text style={{ color: '#fff', fontSize: 18, fontWeight: 'bold', marginBottom: 12 }}>Save Location</Text>
            <TextInput style={styles.input} placeholder="Place name" value={savePlaceName}
              onChangeText={setSavePlaceName} placeholderTextColor="#555" />
            <Text style={{ color: '#888', fontSize: 12, marginBottom: 12 }}>
              {myLocation?.latitude?.toFixed(4)}, {myLocation?.longitude?.toFixed(4)}
            </Text>
            <TouchableOpacity onPress={savePlace} style={styles.saveBtn}>
              <Text style={{ color: '#fff', fontWeight: 'bold' }}>Save</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={() => setShowSavePlace(false)} style={{ padding: 10, alignItems: 'center' }}>
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
  sharingBadge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6 },
  tabRow: { flexDirection: 'row', padding: 10, gap: 8 },
  tab: { paddingHorizontal: 16, paddingVertical: 8, borderRadius: 8, backgroundColor: '#151532' },
  tabActive: { backgroundColor: '#4f46e5' },
  searchBar: { paddingHorizontal: 12, paddingVertical: 8, zIndex: 10 },
  searchInput: { backgroundColor: '#151532', borderWidth: 1, borderColor: '#2a2a5e', borderRadius: 8, padding: 12, color: '#fff', fontSize: 14 },
  searchResults: { backgroundColor: '#1e1e42', borderWidth: 1, borderColor: '#2a2a5e', borderRadius: 8, marginTop: 4, position: 'absolute', top: 56, left: 12, right: 12, zIndex: 20 },
  searchResultItem: { padding: 12, borderBottomWidth: 1, borderBottomColor: '#2a2a5e' },
  mapActions: { position: 'absolute', bottom: 20, right: 16, gap: 8 },
  mapActionBtn: { backgroundColor: '#4f46e5', borderRadius: 25, width: 44, height: 44, alignItems: 'center', justifyContent: 'center', shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.3, shadowRadius: 4, elevation: 5 },
  placeItem: { flexDirection: 'row', alignItems: 'center', padding: 14, backgroundColor: '#1a1a3e', borderRadius: 10, marginBottom: 8, borderWidth: 1, borderColor: '#2a2a5e' },
  historyItem: { padding: 12, borderBottomWidth: 1, borderBottomColor: '#2a2a5e' },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.7)', justifyContent: 'center', alignItems: 'center' },
  saveModal: { backgroundColor: '#1e1e42', borderRadius: 16, padding: 24, width: '80%' },
  input: { backgroundColor: '#151532', borderWidth: 1, borderColor: '#2a2a5e', borderRadius: 8, padding: 14, color: '#fff', marginBottom: 12, fontSize: 15 },
  saveBtn: { backgroundColor: '#4f46e5', borderRadius: 8, padding: 14, alignItems: 'center', marginBottom: 8 },
});
