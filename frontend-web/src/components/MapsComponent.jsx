import React, { useState, useEffect, useRef, useCallback } from 'react';
import { collection, query, where, orderBy, onSnapshot, addDoc, updateDoc, deleteDoc, doc, getDocs, setDoc, getDoc, serverTimestamp } from 'firebase/firestore';
import { auth, db } from '../App';
import { FiNavigation, FiSearch, FiMapPin, FiStar, FiClock, FiBell, FiUsers, FiShare2, FiPlus, FiTrash2, FiChevronLeft, FiChevronRight, FiRefreshCw, FiAlertCircle } from 'react-icons/fi';

const API_URL = process.env.REACT_APP_API_URL || 'http://localhost:3000';

const MAPBOX_TOKEN = process.env.REACT_APP_MAPBOX_TOKEN || '';
const OSM_TILE_URL = 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png';

let L = null;

function loadLeaflet() {
  if (typeof window !== 'undefined' && !L) {
    try {
      L = require('leaflet');
      require('leaflet/dist/leaflet.css');
    } catch (e) {
      console.warn('Leaflet not available, using fallback map display');
    }
  }
  return L;
}

export default function MapsComponent({ fullScreen = false }) {
  const [myLocation, setMyLocation] = useState(null);
  const [nearbyUsers, setNearbyUsers] = useState([]);
  const [savedPlaces, setSavedPlaces] = useState([]);
  const [geofences, setGeofences] = useState([]);
  const [locationHistory, setLocationHistory] = useState([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [selectedPlace, setSelectedPlace] = useState(null);
  const [showSavePlace, setShowSavePlace] = useState(false);
  const [savePlaceName, setSavePlaceName] = useState('');
  const [savePlaceCategory, setSavePlaceCategory] = useState('Other');
  const [savePlaceNotes, setSavePlaceNotes] = useState('');
  const [showGeofenceModal, setShowGeofenceModal] = useState(false);
  const [geofenceName, setGeofenceName] = useState('');
  const [geofenceRadius, setGeofenceRadius] = useState(100);
  const [isTracking, setIsTracking] = useState(false);
  const [isSharing, setIsSharing] = useState(true);
  const [showSidebar, setShowSidebar] = useState(true);
  const [activeView, setActiveView] = useState('map');
  const [error, setError] = useState('');
  const [mapReady, setMapReady] = useState(false);

  const mapRef = useRef(null);
  const mapInstanceRef = useRef(null);
  const markersRef = useRef([]);
  const userMarkerRef = useRef(null);
  const watchIdRef = useRef(null);

  const currentUser = JSON.parse(localStorage.getItem('user') || '{}');

  useEffect(() => {
    const leaflet = loadLeaflet();
    if (leaflet) {
      setMapReady(true);
    }
    fetchSavedPlaces();
    fetchGeofences();
    fetchLocationHistory();
    startTracking();

    return () => {
      if (watchIdRef.current) {
        navigator.geolocation.clearWatch(watchIdRef.current);
      }
    };
  }, []);

  useEffect(() => {
    if (mapReady && myLocation && mapRef.current && !mapInstanceRef.current) {
      initMap();
    }
  }, [mapReady, myLocation]);

  useEffect(() => {
    if (mapInstanceRef.current) {
      updateMarkers();
    }
  }, [nearbyUsers, savedPlaces, myLocation]);

  const initMap = () => {
    const leaflet = loadLeaflet();
    if (!leaflet || !mapRef.current || !myLocation) return;

    delete leaflet.Icon.Default.prototype._getIconUrl;
    leaflet.Icon.Default.mergeOptions({
      iconRetinaUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon-2x.png',
      iconUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon.png',
      shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-shadow.png',
    });

    const map = leaflet.map(mapRef.current, {
      center: [myLocation.latitude, myLocation.longitude],
      zoom: 14,
      zoomControl: true,
      attributionControl: true
    });

    leaflet.tileLayer(OSM_TILE_URL, {
      maxZoom: 19,
      attribution: '© OpenStreetMap contributors'
    }).addTo(map);

    const userIcon = leaflet.divIcon({
      html: `<div style="width:20px;height:20px;background:#4f46e5;border:3px solid #fff;border-radius:50%;box-shadow:0 2px 8px rgba(0,0,0,0.3)"></div>`,
      iconSize: [20, 20],
      iconAnchor: [10, 10]
    });

    userMarkerRef.current = leaflet.marker([myLocation.latitude, myLocation.longitude], { icon: userIcon })
      .addTo(map)
      .bindPopup(`<b>You</b><br/>${myLocation.placeName || 'Current location'}`);

    map.on('click', (e) => {
      setSelectedPlace({ lat: e.latlng.lat, lng: e.latlng.lng });
      setShowSavePlace(true);
    });

    mapInstanceRef.current = map;
    setTimeout(() => map.invalidateSize(), 200);
  };

  const updateMarkers = () => {
    const leaflet = loadLeaflet();
    if (!leaflet || !mapInstanceRef.current) return;

    markersRef.current.forEach(m => mapInstanceRef.current.removeLayer(m));
    markersRef.current = [];

    if (myLocation && userMarkerRef.current) {
      userMarkerRef.current.setLatLng([myLocation.latitude, myLocation.longitude]);
    }

    const userIcon = leaflet.divIcon({
      html: `<div style="width:16px;height:16px;background:#22c55e;border:2px solid #fff;border-radius:50%"></div>`,
      iconSize: [16, 16],
      iconAnchor: [8, 8]
    });

    nearbyUsers.forEach(user => {
      if (!user.latitude || !user.longitude) return;
      const marker = leaflet.marker([user.latitude, user.longitude], { icon: userIcon })
        .addTo(mapInstanceRef.current)
        .bindPopup(`
          <div style="font-family:Arial;min-width:150px">
            <b>${user.username}</b><br/>
            <span style="color:#888">${user.place_name || 'Unknown location'}</span><br/>
            <span style="color:#666;font-size:12px">${user.distance ? (user.distance).toFixed(1) + ' km away' : ''}</span>
          </div>
        `);
      markersRef.current.push(marker);
    });

    const placeIcon = leaflet.divIcon({
      html: `<div style="width:14px;height:14px;background:#f59e0b;border:2px solid #fff;border-radius:3px"></div>`,
      iconSize: [14, 14],
      iconAnchor: [7, 7]
    });

    savedPlaces.forEach(place => {
      const marker = leaflet.marker([place.latitude, place.longitude], { icon: placeIcon })
        .addTo(mapInstanceRef.current)
        .bindPopup(`
          <div style="font-family:Arial;min-width:150px">
            <b>${place.place_name}</b><br/>
            <span style="color:#888">${place.address || ''}</span><br/>
            <span style="color:#f59e0b;font-size:12px">${place.category}</span>
          </div>
        `);
      markersRef.current.push(marker);
    });

    geofences.forEach(fence => {
      if (fence.enabled) {
        leaflet.circle([fence.latitude, fence.longitude], {
          radius: fence.radius_meters,
          color: '#4f46e5',
          fillColor: '#4f46e5',
          fillOpacity: 0.1,
          weight: 1
        }).addTo(mapInstanceRef.current);
      }
    });
  };

  const startTracking = () => {
    if (!navigator.geolocation) {
      setError('Geolocation is not supported');
      return;
    }

    setIsTracking(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const { latitude, longitude } = pos.coords;
        setMyLocation({ latitude, longitude, accuracy: pos.coords.accuracy });
        updateServerLocation(latitude, longitude);
        fetchNearbyUsers(latitude, longitude);
      },
      (err) => {
        setError('Failed to get location: ' + err.message);
        setIsTracking(false);
      },
      { enableHighAccuracy: true, timeout: 10000 }
    );

    watchIdRef.current = navigator.geolocation.watchPosition(
      (pos) => {
        const { latitude, longitude } = pos.coords;
        setMyLocation(prev => ({
          ...prev,
          latitude,
          longitude,
          accuracy: pos.coords.accuracy,
          altitude: pos.coords.altitude,
          speed: pos.coords.speed
        }));
        if (isSharing) {
          updateServerLocation(latitude, longitude);
        }
      },
      (err) => console.error('Watch position error:', err),
      { enableHighAccuracy: true, maximumAge: 5000, timeout: 15000 }
    );
  };

  const updateServerLocation = async (lat, lng) => {
    try {
      let placeName = '';
      try {
        const res = await fetch(`https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}`).then(r => r.json());
        placeName = res.display_name?.substring(0, 200) || '';
      } catch {}

      await fetch(`${API_URL}/api/maps/location`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ latitude: lat, longitude: lng, placeName, accuracy: 0, altitude: 0, speed: 0 })
      });
    } catch (err) {
      console.error('Failed to update location:', err);
    }
  };

  const handleLocationUpdate = (data) => {
    if (data.userId !== currentUser.id) {
      setNearbyUsers(prev => {
        const existing = prev.findIndex(u => u.id === data.userId);
        if (existing >= 0) {
          const updated = [...prev];
          updated[existing] = { ...updated[existing], latitude: data.latitude, longitude: data.longitude };
          return updated;
        }
        return prev;
      });
    }
  };

  const fetchNearbyUsers = async (lat, lng) => {
    try {
      const res = await fetch(`${API_URL}/api/maps/nearby?lat=${lat}&lng=${lng}&radius=50`).then(r => r.json());
      setNearbyUsers(res);
    } catch (err) {
      console.error('Failed to fetch nearby users:', err);
    }
  };

  const fetchSavedPlaces = async () => {
    try {
      const res = await fetch(`${API_URL}/api/maps/places`).then(r => r.json());
      setSavedPlaces(res);
    } catch (err) {
      console.error('Failed to fetch saved places:', err);
    }
  };

  const fetchGeofences = async () => {
    try {
      const res = await fetch(`${API_URL}/api/maps/geofences`).then(r => r.json());
      setGeofences(res);
    } catch (err) {
      console.error('Failed to fetch geofences:', err);
    }
  };

  const fetchLocationHistory = async () => {
    try {
      const res = await fetch(`${API_URL}/api/maps/history?limit=50`).then(r => r.json());
      setLocationHistory(res);
    } catch (err) {
      console.error('Failed to fetch location history:', err);
    }
  };

  const savePlace = async () => {
    if (!savePlaceName || !selectedPlace) return;
    try {
      const res = await fetch(`${API_URL}/api/maps/places`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ placeName: savePlaceName, address: '', latitude: selectedPlace.lat, longitude: selectedPlace.lng, category: savePlaceCategory, notes: savePlaceNotes })
      }).then(r => r.json());
      setSavedPlaces(prev => [...prev, res]);
      setShowSavePlace(false);
      setSavePlaceName('');
      setSavePlaceNotes('');
    } catch (err) {
      console.error('Failed to save place:', err);
    }
  };

  const deletePlace = async (placeId) => {
    try {
      await fetch(`${API_URL}/api/maps/places/${placeId}`, { method: 'DELETE' });
      setSavedPlaces(prev => prev.filter(p => p.id !== placeId));
    } catch (err) {
      console.error('Failed to delete place:', err);
    }
  };

  const createGeofence = async () => {
    if (!geofenceName || !myLocation) return;
    try {
      const res = await fetch(`${API_URL}/api/maps/geofences`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: geofenceName, latitude: myLocation.latitude, longitude: myLocation.longitude, radiusMeters: geofenceRadius, triggerOnEnter: true, triggerOnExit: true })
      }).then(r => r.json());
      setGeofences(prev => [...prev, res]);
      setShowGeofenceModal(false);
      setGeofenceName('');
    } catch (err) {
      console.error('Failed to create geofence:', err);
    }
  };

  const deleteGeofence = async (fenceId) => {
    try {
      await fetch(`${API_URL}/api/maps/geofences/${fenceId}`, { method: 'DELETE' });
      setGeofences(prev => prev.filter(f => f.id !== fenceId));
    } catch (err) {
      console.error('Failed to delete geofence:', err);
    }
  };

  const toggleSharing = async () => {
    try {
      await fetch(`${API_URL}/api/maps/sharing`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ isSharing: !isSharing })
      });
      setIsSharing(!isSharing);
    } catch (err) {
      console.error('Failed to toggle sharing:', err);
    }
  };

  const searchPlaces = async (query) => {
    if (!query.trim()) { setSearchResults([]); return; }
    try {
      const res = await fetch(`https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(query)}&limit=5`).then(r => r.json());
      setSearchResults(res);
    } catch (err) {
      console.error('Search failed:', err);
    }
  };

  const goToLocation = (lat, lng) => {
    if (mapInstanceRef.current) {
      mapInstanceRef.current.setView([lat, lng], 16);
    }
    setSearchResults([]);
    setSearchQuery('');
  };

  const refreshLocation = () => {
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          const { latitude, longitude } = pos.coords;
          setMyLocation({ latitude, longitude });
          if (mapInstanceRef.current) {
            mapInstanceRef.current.setView([latitude, longitude], 14);
          }
          updateServerLocation(latitude, longitude);
          fetchNearbyUsers(latitude, longitude);
        },
        (err) => setError('Location refresh failed'),
        { enableHighAccuracy: true }
      );
    }
  };

  const recenterMap = () => {
    if (myLocation && mapInstanceRef.current) {
      mapInstanceRef.current.setView([myLocation.latitude, myLocation.longitude], 14);
    }
  };

  const shareLocationUrl = () => {
    if (myLocation) {
      const url = `${window.location.origin}/maps?lat=${myLocation.latitude}&lng=${myLocation.longitude}`;
      navigator.clipboard.writeText(url).then(() => alert('Location URL copied!'));
    }
  };

  return (
    <div style={{ ...styles.container, ...(fullScreen ? { height: 'calc(100vh - 60px)' } : {}) }}>
      {error && (
        <div style={styles.errorBanner}>
          <FiAlertCircle /> {error}
          <button onClick={() => setError('')} style={{ marginLeft: 'auto', background: 'none', border: 'none', color: '#fff', cursor: 'pointer' }}>×</button>
        </div>
      )}

      <div style={styles.mainContent}>
        <div style={{ ...styles.mapContainer, ...(showSidebar ? { flex: 1 } : { flex: 1 }) }}>
          <div ref={mapRef} style={styles.map} />

          <div style={styles.mapControls}>
            <button onClick={recenterMap} style={styles.mapControlBtn} title="Recenter">
              <FiNavigation />
            </button>
            <button onClick={refreshLocation} style={styles.mapControlBtn} title="Refresh location">
              <FiRefreshCw />
            </button>
            <button onClick={shareLocationUrl} style={styles.mapControlBtn} title="Share location">
              <FiShare2 />
            </button>
            <button onClick={() => setShowGeofenceModal(true)} style={styles.mapControlBtn} title="Add geofence">
              <FiBell />
            </button>
          </div>

          <div style={styles.searchBox}>
            <FiSearch style={{ position: 'absolute', left: '14px', top: '14px', color: '#666' }} />
            <input type="text" placeholder="Search places..." value={searchQuery}
              onChange={(e) => { setSearchQuery(e.target.value); searchPlaces(e.target.value); }}
              style={styles.searchInput} />
            {searchResults.length > 0 && (
              <div style={styles.searchResultsPanel}>
                {searchResults.map((r, i) => (
                  <div key={i} onClick={() => goToLocation(parseFloat(r.lat), parseFloat(r.lon))}
                    style={styles.searchResultItem}>
                    <FiMapPin style={{ flexShrink: 0 }} />
                    <div>
                      <div style={{ color: '#fff', fontSize: '13px' }}>{r.display_name?.substring(0, 80)}</div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div style={styles.locationStatus}>
            {myLocation ? (
              <span style={{ color: '#22c55e', fontSize: '12px' }}>
                ● {myLocation.latitude.toFixed(4)}, {myLocation.longitude.toFixed(4)}
                {myLocation.accuracy ? ` (±${Math.round(myLocation.accuracy)}m)` : ''}
              </span>
            ) : (
              <span style={{ color: '#888', fontSize: '12px' }}>Acquiring location...</span>
            )}
            <button onClick={toggleSharing} style={{ ...styles.sharingBtn, background: isSharing ? '#22c55e' : '#666' }}>
              {isSharing ? 'Sharing' : 'Hidden'}
            </button>
          </div>
        </div>

        <div style={{ ...styles.sidebar, ...(!showSidebar ? { width: '0', minWidth: '0', padding: '0', overflow: 'hidden' } : {}) }}>
          <div style={styles.sidebarHeader}>
            <h3 style={{ margin: 0, fontSize: '16px', color: '#fff' }}>Maps</h3>
            <button onClick={() => setShowSidebar(!showSidebar)} style={styles.toggleBtn}>
              {showSidebar ? <FiChevronRight /> : <FiChevronLeft />}
            </button>
          </div>

          <div style={styles.viewTabs}>
            {[
              { id: 'map', label: 'Map' },
              { id: 'places', label: 'Places' },
              { id: 'geofences', label: 'Geofences' },
              { id: 'history', label: 'History' }
            ].map(tab => (
              <button key={tab.id} onClick={() => setActiveView(tab.id)}
                style={{ ...styles.viewTab, ...(activeView === tab.id ? styles.viewTabActive : {}) }}>
                {tab.label}
              </button>
            ))}
          </div>

          {activeView === 'map' && (
            <div style={styles.sidebarContent}>
              <div style={styles.sidebarSection}>
                <h4 style={styles.sidebarSectionTitle}>
                  <FiUsers /> Nearby Users ({nearbyUsers.length})
                </h4>
                {nearbyUsers.length === 0 ? (
                  <div style={{ color: '#666', fontSize: '13px', padding: '10px' }}>No users nearby</div>
                ) : (
                  nearbyUsers.slice(0, 10).map(user => (
                    <div key={user.id} style={styles.nearbyUserItem}>
                      <div style={styles.nearbyUserAvatar}>
                        {user.avatar ? <img src={user.avatar} alt="" /> : user.username?.[0]?.toUpperCase()}
                      </div>
                      <div style={{ flex: 1 }}>
                        <div style={{ fontSize: '13px', fontWeight: 500, color: '#fff' }}>{user.username}</div>
                        <div style={{ fontSize: '11px', color: '#888' }}>
                          {user.distance ? `${user.distance.toFixed(1)} km` : 'Nearby'}
                        </div>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          )}

          {activeView === 'places' && (
            <div style={styles.sidebarContent}>
              <button onClick={() => { setSelectedPlace(myLocation); setShowSavePlace(true); }}
                style={styles.addBtn}><FiPlus /> Add Place</button>
              {savedPlaces.length === 0 ? (
                <div style={{ color: '#666', fontSize: '14px', textAlign: 'center', padding: '30px' }}>
                  <FiStar size={36} style={{ marginBottom: '8px', color: '#333' }} />
                  <div>No saved places</div>
                </div>
              ) : (
                savedPlaces.map(place => (
                  <div key={place.id} style={styles.placeItem}>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: '13px', fontWeight: 600, color: '#fff' }}>{place.place_name}</div>
                      <div style={{ fontSize: '11px', color: '#888' }}>{place.category}{place.address ? ' · ' + place.address : ''}</div>
                    </div>
                    <button onClick={() => goToLocation(place.latitude, place.longitude)} style={styles.smallBtn}><FiNavigation /></button>
                    <button onClick={() => deletePlace(place.id)} style={styles.smallBtn}><FiTrash2 /></button>
                  </div>
                ))
              )}
            </div>
          )}

          {activeView === 'geofences' && (
            <div style={styles.sidebarContent}>
              <button onClick={() => setShowGeofenceModal(true)} style={styles.addBtn}><FiPlus /> Add Geofence</button>
              {geofences.length === 0 ? (
                <div style={{ color: '#666', fontSize: '14px', textAlign: 'center', padding: '30px' }}>
                  <FiBell size={36} style={{ marginBottom: '8px', color: '#333' }} />
                  <div>No geofences</div>
                </div>
              ) : (
                geofences.map(fence => (
                  <div key={fence.id} style={styles.geofenceItem}>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: '13px', fontWeight: 600, color: '#fff' }}>{fence.name}</div>
                      <div style={{ fontSize: '11px', color: '#888' }}>
                        {fence.radius_meters}m radius · {fence.enabled ? 'Active' : 'Disabled'}
                      </div>
                    </div>
                    <button onClick={() => deleteGeofence(fence.id)} style={styles.smallBtn}><FiTrash2 /></button>
                  </div>
                ))
              )}
            </div>
          )}

          {activeView === 'history' && (
            <div style={styles.sidebarContent}>
              <h4 style={styles.sidebarSectionTitle}><FiClock /> Location History</h4>
              {locationHistory.length === 0 ? (
                <div style={{ color: '#666', fontSize: '14px', textAlign: 'center', padding: '30px' }}>
                  <FiClock size={36} style={{ marginBottom: '8px', color: '#333' }} />
                  <div>No history yet</div>
                </div>
              ) : (
                locationHistory.slice(0, 30).map((h, i) => (
                  <div key={h.id || i} style={styles.historyItem}>
                    <div style={{ fontSize: '12px', color: '#555' }}>
                      {new Date(h.recorded_at).toLocaleString()}
                    </div>
                    <div style={{ fontSize: '12px', color: '#888' }}>
                      {parseFloat(h.latitude).toFixed(4)}, {parseFloat(h.longitude).toFixed(4)}
                    </div>
                  </div>
                ))
              )}
            </div>
          )}
        </div>
      </div>

      {showSavePlace && (
        <div style={styles.modalOverlay}>
          <div style={styles.modalContent}>
            <h3 style={{ color: '#fff', marginBottom: '16px' }}>Save Place</h3>
            <p style={{ color: '#888', fontSize: '13px', marginBottom: '12px' }}>
              Location: {selectedPlace?.lat?.toFixed(4)}, {selectedPlace?.lng?.toFixed(4)}
            </p>
            <input type="text" placeholder="Place name" value={savePlaceName}
              onChange={(e) => setSavePlaceName(e.target.value)} style={styles.modalInput} />
            <select value={savePlaceCategory} onChange={(e) => setSavePlaceCategory(e.target.value)} style={styles.modalSelect}>
              {['Home', 'Work', 'Favorites', 'Restaurant', 'Park', 'Store', 'Friend', 'Other'].map(c => (
                <option key={c} value={c}>{c}</option>
              ))}
            </select>
            <textarea placeholder="Notes" value={savePlaceNotes} onChange={(e) => setSavePlaceNotes(e.target.value)}
              style={styles.modalTextarea} rows={2} />
            <div style={{ display: 'flex', gap: '10px' }}>
              <button onClick={savePlace} style={styles.saveBtn}>Save</button>
              <button onClick={() => setShowSavePlace(false)} style={styles.cancelBtn}>Cancel</button>
            </div>
          </div>
        </div>
      )}

      {showGeofenceModal && (
        <div style={styles.modalOverlay}>
          <div style={styles.modalContent}>
            <h3 style={{ color: '#fff', marginBottom: '16px' }}>Create Geofence</h3>
            <p style={{ color: '#888', fontSize: '13px', marginBottom: '12px' }}>
              Creates a fence around your current location
            </p>
            <input type="text" placeholder="Fence name" value={geofenceName}
              onChange={(e) => setGeofenceName(e.target.value)} style={styles.modalInput} />
            <label style={{ color: '#aaa', fontSize: '13px', marginBottom: '4px' }}>Radius (meters): {geofenceRadius}</label>
            <input type="range" min={10} max={1000} value={geofenceRadius}
              onChange={(e) => setGeofenceRadius(parseInt(e.target.value))} style={{ width: '100%', accentColor: '#4f46e5' }} />
            <div style={{ display: 'flex', gap: '10px', marginTop: '16px' }}>
              <button onClick={createGeofence} style={styles.saveBtn}>Create</button>
              <button onClick={() => setShowGeofenceModal(false)} style={styles.cancelBtn}>Cancel</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

const styles = {
  container: { height: '100%', background: '#0f0f23', borderRadius: '12px', overflow: 'hidden', border: '1px solid #2a2a5e', position: 'relative' },
  mainContent: { display: 'flex', height: '100%' },
  mapContainer: { position: 'relative', minHeight: '400px' },
  map: { width: '100%', height: '100%', zIndex: 1 },
  mapControls: { position: 'absolute', top: '80px', right: '16px', zIndex: 1000, display: 'flex', flexDirection: 'column', gap: '6px' },
  mapControlBtn: { padding: '10px', background: '#1e1e42', border: '1px solid #2a2a5e', borderRadius: '8px', color: '#ccc', cursor: 'pointer', fontSize: '16px', display: 'flex', alignItems: 'center', justifyContent: 'center', width: '40px', height: '40px', boxShadow: '0 2px 8px rgba(0,0,0,0.3)' },
  searchBox: { position: 'absolute', top: '16px', left: '16px', right: '80px', zIndex: 1000, maxWidth: '400px' },
  searchInput: { width: '100%', padding: '12px 12px 12px 40px', background: '#1e1e42', border: '1px solid #2a2a5e', borderRadius: '10px', color: '#fff', fontSize: '14px', outline: 'none', boxShadow: '0 2px 8px rgba(0,0,0,0.3)', boxSizing: 'border-box' },
  searchResultsPanel: { position: 'absolute', top: '100%', left: 0, right: 0, background: '#1e1e42', border: '1px solid #2a2a5e', borderRadius: '0 0 10px 10px', maxHeight: '240px', overflow: 'auto', zIndex: 1001 },
  searchResultItem: { display: 'flex', alignItems: 'center', gap: '10px', padding: '10px 14px', cursor: 'pointer', borderBottom: '1px solid #2a2a5e', color: '#aaa', fontSize: '12px' },
  locationStatus: { position: 'absolute', bottom: '20px', left: '16px', right: '16px', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: 'rgba(21,21,50,0.9)', padding: '8px 14px', borderRadius: '8px', backdropFilter: 'blur(8px)' },
  sharingBtn: { padding: '4px 12px', border: 'none', borderRadius: '6px', color: '#fff', fontSize: '11px', cursor: 'pointer', fontWeight: 600 },
  sidebar: { width: '300px', minWidth: '300px', background: '#151532', borderLeft: '1px solid #2a2a5e', display: 'flex', flexDirection: 'column', transition: 'all 0.3s', overflow: 'hidden' },
  sidebarHeader: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '16px', borderBottom: '1px solid #2a2a5e' },
  toggleBtn: { background: 'none', border: 'none', color: '#888', cursor: 'pointer', fontSize: '18px' },
  viewTabs: { display: 'flex', gap: '2px', padding: '10px 12px', borderBottom: '1px solid #2a2a5e' },
  viewTab: { padding: '6px 12px', background: 'transparent', border: 'none', color: '#888', cursor: 'pointer', borderRadius: '6px', fontSize: '12px', transition: 'all 0.2s' },
  viewTabActive: { background: '#4f46e5', color: '#fff' },
  sidebarContent: { flex: 1, overflow: 'auto', padding: '12px' },
  sidebarSection: { marginBottom: '16px' },
  sidebarSectionTitle: { fontSize: '13px', color: '#aaa', marginBottom: '8px', display: 'flex', alignItems: 'center', gap: '6px' },
  nearbyUserItem: { display: 'flex', alignItems: 'center', gap: '10px', padding: '8px', borderRadius: '8px', cursor: 'pointer' },
  nearbyUserAvatar: { width: '32px', height: '32px', borderRadius: '50%', background: '#4f46e5', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '14px', fontWeight: 'bold', color: '#fff', overflow: 'hidden', flexShrink: 0 },
  addBtn: { width: '100%', padding: '10px', background: '#4f46e5', color: '#fff', border: 'none', borderRadius: '8px', cursor: 'pointer', marginBottom: '10px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px', fontSize: '13px', fontWeight: 500 },
  placeItem: { display: 'flex', alignItems: 'center', gap: '8px', padding: '8px', borderRadius: '8px', marginBottom: '4px' },
  geofenceItem: { display: 'flex', alignItems: 'center', gap: '8px', padding: '10px', background: '#1a1a3e', borderRadius: '8px', marginBottom: '6px', border: '1px solid #2a2a5e' },
  historyItem: { padding: '8px 0', borderBottom: '1px solid #2a2a5e' },
  smallBtn: { background: 'none', border: 'none', color: '#666', cursor: 'pointer', padding: '4px', borderRadius: '4px', fontSize: '14px', flexShrink: 0 },
  modalOverlay: { position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.7)', zIndex: 2000, display: 'flex', alignItems: 'center', justifyContent: 'center' },
  modalContent: { background: '#1e1e42', padding: '24px', borderRadius: '16px', width: '100%', maxWidth: '400px', border: '1px solid #2a2a5e' },
  modalInput: { width: '100%', padding: '10px 14px', background: '#151532', border: '1px solid #2a2a5e', borderRadius: '8px', color: '#fff', fontSize: '14px', outline: 'none', marginBottom: '10px', boxSizing: 'border-box' },
  modalSelect: { width: '100%', padding: '10px 14px', background: '#151532', border: '1px solid #2a2a5e', borderRadius: '8px', color: '#fff', fontSize: '14px', outline: 'none', marginBottom: '10px', boxSizing: 'border-box' },
  modalTextarea: { width: '100%', padding: '10px 14px', background: '#151532', border: '1px solid #2a2a5e', borderRadius: '8px', color: '#fff', fontSize: '14px', outline: 'none', marginBottom: '10px', resize: 'vertical', boxSizing: 'border-box', fontFamily: 'inherit' },
  saveBtn: { flex: 1, padding: '12px', background: '#4f46e5', color: '#fff', border: 'none', borderRadius: '8px', cursor: 'pointer', fontWeight: 600 },
  cancelBtn: { padding: '12px 24px', background: '#2a2a5e', color: '#888', border: 'none', borderRadius: '8px', cursor: 'pointer' },
  errorBanner: { display: 'flex', alignItems: 'center', gap: '8px', padding: '10px 16px', background: '#dc2626', color: '#fff', fontSize: '13px', position: 'absolute', top: 0, left: 0, right: 0, zIndex: 3000 },
};
