import React, { useState, useEffect, useRef } from 'react';
import axios from 'axios';
import { FiPlay, FiPause, FiSkipForward, FiSkipBack, FiHeart, FiList, FiUpload, FiSearch, FiShuffle, FiRepeat, FiVolume2, FiPlus, FiTrash2, FiMusic, FiChevronDown, FiChevronUp } from 'react-icons/fi';

const API_URL = process.env.REACT_APP_API_URL || 'http://localhost:3000';

export default function MusicPlayerComponent({ fullScreen = false }) {
  const [songs, setSongs] = useState([]);
  const [currentSong, setCurrentSong] = useState(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [volume, setVolume] = useState(0.7);
  const [playlists, setPlaylists] = useState([]);
  const [activePlaylist, setActivePlaylist] = useState(null);
  const [playlistSongs, setPlaylistSongs] = useState([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [recentlyPlayed, setRecentlyPlayed] = useState([]);
  const [showUpload, setShowUpload] = useState(false);
  const [uploadTitle, setUploadTitle] = useState('');
  const [uploadArtist, setUploadArtist] = useState('');
  const [uploadAlbum, setUploadAlbum] = useState('');
  const [uploadGenre, setUploadGenre] = useState('Other');
  const [uploadFile, setUploadFile] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [showPlaylistModal, setShowPlaylistModal] = useState(false);
  const [newPlaylistName, setNewPlaylistName] = useState('');
  const [showMobilePlayer, setShowMobilePlayer] = useState(false);
  const [isShuffled, setIsShuffled] = useState(false);
  const [repeatMode, setRepeatMode] = useState('none');
  const [likedSongs, setLikedSongs] = useState(new Set());
  const [view, setView] = useState('library');
  const [genres, setGenres] = useState([]);

  const audioRef = useRef(null);
  const fileInputRef = useRef(null);

  const currentUser = JSON.parse(localStorage.getItem('user') || '{}');

  useEffect(() => {
    fetchSongs();
    fetchPlaylists();
    fetchRecentlyPlayed();
    fetchGenres();
  }, []);

  useEffect(() => {
    if (searchQuery) {
      const timer = setTimeout(() => searchSongs(searchQuery), 400);
      return () => clearTimeout(timer);
    } else {
      setSearchResults([]);
    }
  }, [searchQuery]);

  const fetchSongs = async () => {
    try {
      const res = await axios.get(`${API_URL}/api/music/library`);
      setSongs(res.data.songs || []);
    } catch (err) {
      console.error('Failed to fetch songs:', err);
    }
  };

  const fetchPlaylists = async () => {
    try {
      const res = await axios.get(`${API_URL}/api/music/playlists`);
      setPlaylists(res.data);
    } catch (err) {
      console.error('Failed to fetch playlists:', err);
    }
  };

  const fetchPlaylistSongs = async (playlistId) => {
    try {
      const res = await axios.get(`${API_URL}/api/music/playlists/${playlistId}`);
      setPlaylistSongs(res.data.songs || []);
      setActivePlaylist(res.data);
    } catch (err) {
      console.error('Failed to fetch playlist songs:', err);
    }
  };

  const fetchRecentlyPlayed = async () => {
    try {
      const res = await axios.get(`${API_URL}/api/music/recently-played`);
      setRecentlyPlayed(res.data);
    } catch (err) {
      console.error('Failed to fetch recently played:', err);
    }
  };

  const fetchGenres = async () => {
    try {
      const res = await axios.get(`${API_URL}/api/music/genres`);
      setGenres(res.data);
    } catch (err) {
      console.error('Failed to fetch genres:', err);
    }
  };

  const searchSongs = async (query) => {
    try {
      const res = await axios.get(`${API_URL}/api/music/search?q=${encodeURIComponent(query)}`);
      setSearchResults(res.data.songs || []);
    } catch (err) {
      console.error('Search failed:', err);
    }
  };

  const playSong = async (song) => {
    if (currentSong?.id === song.id) {
      togglePlay();
      return;
    }
    setCurrentSong(song);
    setIsPlaying(true);
    if (audioRef.current) {
      audioRef.current.src = song.file_url;
      audioRef.current.play().catch(console.error);
    }
    try {
      await axios.post(`${API_URL}/api/music/song/${song.id}`);
      await axios.post(`${API_URL}/api/music/play-count/${song.id}`);
    } catch (err) {
      console.error('Failed to update play:', err);
    }
  };

  const togglePlay = () => {
    if (!currentSong) return;
    if (isPlaying) {
      audioRef.current?.pause();
    } else {
      audioRef.current?.play().catch(console.error);
    }
    setIsPlaying(!isPlaying);
  };

  const playNext = () => {
    const currentList = activePlaylist ? playlistSongs : songs;
    if (currentList.length === 0) return;
    const currentIdx = currentList.findIndex(s => s.id === currentSong?.id);
    let nextIdx;
    if (isShuffled) {
      nextIdx = Math.floor(Math.random() * currentList.length);
    } else {
      nextIdx = (currentIdx + 1) % currentList.length;
    }
    playSong(currentList[nextIdx]);
  };

  const playPrevious = () => {
    const currentList = activePlaylist ? playlistSongs : songs;
    if (currentList.length === 0) return;
    const currentIdx = currentList.findIndex(s => s.id === currentSong?.id);
    const prevIdx = (currentIdx - 1 + currentList.length) % currentList.length;
    playSong(currentList[prevIdx]);
  };

  const handleTimeUpdate = () => {
    if (audioRef.current) {
      setCurrentTime(audioRef.current.currentTime);
    }
  };

  const handleLoadedMetadata = () => {
    if (audioRef.current) {
      setDuration(audioRef.current.duration);
    }
  };

  const handleEnded = () => {
    if (repeatMode === 'one') {
      audioRef.current?.play().catch(console.error);
    } else {
      playNext();
    }
  };

  const seekTo = (e) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const percent = x / rect.width;
    if (audioRef.current) {
      audioRef.current.currentTime = percent * duration;
    }
  };

  const handleVolumeChange = (e) => {
    const val = parseFloat(e.target.value);
    setVolume(val);
    if (audioRef.current) {
      audioRef.current.volume = val;
    }
  };

  const formatTime = (seconds) => {
    if (!seconds || isNaN(seconds)) return '0:00';
    const m = Math.floor(seconds / 60);
    const s = Math.floor(seconds % 60);
    return `${m}:${s.toString().padStart(2, '0')}`;
  };

  const uploadSong = async () => {
    if (!uploadFile) return;
    setUploading(true);
    try {
      const formData = new FormData();
      formData.append('audio', uploadFile);
      formData.append('title', uploadTitle || uploadFile.name);
      formData.append('artist', uploadArtist || 'Unknown Artist');
      formData.append('album', uploadAlbum || 'Unknown Album');
      formData.append('genre', uploadGenre);
      await axios.post(`${API_URL}/api/music/upload`, formData, {
        headers: { 'Content-Type': 'multipart/form-data' }
      });
      setShowUpload(false);
      setUploadFile(null);
      setUploadTitle('');
      setUploadArtist('');
      setUploadAlbum('');
      fetchSongs();
    } catch (err) {
      console.error('Upload failed:', err);
      alert('Failed to upload song');
    } finally {
      setUploading(false);
    }
  };

  const createPlaylist = async () => {
    if (!newPlaylistName) return;
    try {
      await axios.post(`${API_URL}/api/music/playlists`, { name: newPlaylistName });
      setNewPlaylistName('');
      setShowPlaylistModal(false);
      fetchPlaylists();
    } catch (err) {
      console.error('Failed to create playlist:', err);
    }
  };

  const addToPlaylist = async (playlistId, songId) => {
    try {
      await axios.post(`${API_URL}/api/music/playlists/${playlistId}/songs`, { songId });
      fetchPlaylists();
    } catch (err) {
      console.error('Failed to add to playlist:', err);
    }
  };

  const deleteSong = async (songId) => {
    try {
      await axios.delete(`${API_URL}/api/music/song/${songId}`);
      setSongs(prev => prev.filter(s => s.id !== songId));
      if (currentSong?.id === songId) {
        setCurrentSong(null);
        setIsPlaying(false);
      }
    } catch (err) {
      console.error('Failed to delete song:', err);
    }
  };

  const toggleLike = async (songId) => {
    try {
      const res = await axios.post(`${API_URL}/api/music/song/${songId}/like`);
      if (res.data.liked) {
        setLikedSongs(prev => new Set([...prev, songId]));
      } else {
        setLikedSongs(prev => { const n = new Set(prev); n.delete(songId); return n; });
      }
    } catch (err) {
      console.error('Failed to toggle like:', err);
    }
  };

  const deletePlaylist = async (playlistId) => {
    try {
      await axios.delete(`${API_URL}/api/music/playlists/${playlistId}`);
      setActivePlaylist(null);
      setPlaylistSongs([]);
      fetchPlaylists();
    } catch (err) {
      console.error('Failed to delete playlist:', err);
    }
  };

  const removeFromPlaylist = async (playlistId, songId) => {
    try {
      await axios.delete(`${API_URL}/api/music/playlists/${playlistId}/songs/${songId}`);
      setPlaylistSongs(prev => prev.filter(s => s.id !== songId));
    } catch (err) {
      console.error('Failed to remove from playlist:', err);
    }
  };

  const currentList = activePlaylist ? playlistSongs : (searchQuery ? searchResults : songs);

  return (
    <div style={{ ...styles.container, ...(fullScreen ? { height: 'calc(100vh - 60px)' } : {}) }}>
      <audio ref={audioRef} onTimeUpdate={handleTimeUpdate}
        onLoadedMetadata={handleLoadedMetadata} onEnded={handleEnded} />

      <div style={styles.mainContent}>
        <div style={styles.sidebar}>
          <div style={styles.sidebarHeader}>
            <h3 style={styles.sidebarTitle}>Your Library</h3>
            <button onClick={() => setShowUpload(true)} style={styles.iconBtn} title="Upload song"><FiUpload /></button>
          </div>

          <div style={styles.searchContainer}>
            <FiSearch style={styles.searchIcon} />
            <input type="text" placeholder="Search songs..." value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)} style={styles.searchInput} />
          </div>

          <div style={styles.viewTabs}>
            {[
              { id: 'library', label: 'Songs' },
              { id: 'playlists', label: 'Playlists' },
              { id: 'recent', label: 'Recent' },
              { id: 'genres', label: 'Genres' }
            ].map(tab => (
              <button key={tab.id} onClick={() => setView(tab.id)}
                style={{ ...styles.viewTab, ...(view === tab.id ? styles.viewTabActive : {}) }}>
                {tab.label}
              </button>
            ))}
          </div>

          <div style={styles.songList}>
            {view === 'library' && (
              currentList.length === 0 ? (
                <div style={styles.emptyState}>
                  <div style={{ fontSize: '36px', marginBottom: '8px' }}>🎵</div>
                  <div style={{ color: '#888', fontSize: '14px' }}>No songs yet</div>
                  <button onClick={() => setShowUpload(true)} style={styles.uploadPromptBtn}>Upload Music</button>
                </div>
              ) : (
                currentList.map((song, idx) => (
                  <div key={song.id} style={{
                    ...styles.songItem,
                    ...(currentSong?.id === song.id ? styles.songItemActive : {})
                  }}>
                    <div style={styles.songNumber}>{currentSong?.id === song.id && isPlaying ? '♪' : idx + 1}</div>
                    <div style={styles.songCover}>
                      {song.cover_url ? <img src={song.cover_url} alt="" style={styles.coverImg} /> : <FiMusic size={18} />}
                    </div>
                    <div style={styles.songInfo} onClick={() => playSong(song)}>
                      <div style={styles.songTitle}>{song.title}</div>
                      <div style={styles.songArtist}>{song.artist}</div>
                    </div>
                    <div style={styles.songDuration}>{formatTime(song.duration)}</div>
                    <button onClick={(e) => { e.stopPropagation(); toggleLike(song.id); }}
                      style={{ ...styles.actionBtn, color: likedSongs.has(song.id) ? '#ef4444' : '#666' }}>
                      <FiHeart />
                    </button>
                    <button onClick={(e) => { e.stopPropagation(); deleteSong(song.id); }}
                      style={styles.actionBtn}><FiTrash2 size={14} /></button>
                  </div>
                ))
              )
            )}

            {view === 'playlists' && (
              <div style={styles.playlistGrid}>
                <div onClick={() => setShowPlaylistModal(true)} style={styles.createPlaylistCard}>
                  <FiPlus size={32} />
                  <div style={{ marginTop: '8px', fontSize: '13px', color: '#888' }}>New Playlist</div>
                </div>
                {playlists.map(pl => (
                  <div key={pl.id} onClick={() => { setView('library'); fetchPlaylistSongs(pl.id); }}
                    style={styles.playlistCard}>
                    <div style={styles.playlistCover}>
                      {pl.cover_url ? <img src={pl.cover_url} alt="" /> : <FiMusic size={24} />}
                    </div>
                    <div style={styles.playlistName}>{pl.name}</div>
                    <div style={styles.playlistCount}>{pl.song_count || 0} songs</div>
                  </div>
                ))}
              </div>
            )}

            {view === 'recent' && (
              recentlyPlayed.length === 0 ? (
                <div style={styles.emptyState}>
                  <div style={{ fontSize: '36px', marginBottom: '8px' }}>🕐</div>
                  <div style={{ color: '#888', fontSize: '14px' }}>No recently played songs</div>
                </div>
              ) : (
                recentlyPlayed.map((song, idx) => (
                  <div key={song.id} style={styles.songItem} onClick={() => playSong(song)}>
                    <div style={styles.songNumber}>{idx + 1}</div>
                    <div style={styles.songCover}>
                      {song.cover_url ? <img src={song.cover_url} alt="" style={styles.coverImg} /> : <FiMusic size={18} />}
                    </div>
                    <div style={styles.songInfo}>
                      <div style={styles.songTitle}>{song.title}</div>
                      <div style={styles.songArtist}>{song.artist}</div>
                    </div>
                    <div style={styles.songDuration}>{formatTime(song.duration)}</div>
                  </div>
                ))
              )
            )}

            {view === 'genres' && (
              <div style={styles.genresGrid}>
                {genres.map(g => (
                  <div key={g.genre} style={styles.genreCard}>
                    <div style={styles.genreName}>{g.genre}</div>
                    <div style={styles.genreCount}>{g.count} songs</div>
                  </div>
                ))}
                {genres.length === 0 && (
                  <div style={styles.emptyState}>
                    <div style={{ color: '#888', fontSize: '14px' }}>No genres available</div>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

        {activePlaylist && (
          <div style={styles.playlistDetail}>
            <div style={styles.playlistDetailHeader}>
              <div>
                <h3 style={{ color: '#fff', margin: 0 }}>{activePlaylist.name}</h3>
                <div style={{ color: '#888', fontSize: '13px', marginTop: '4px' }}>
                  {activePlaylist.description}
                </div>
              </div>
              <button onClick={() => { setActivePlaylist(null); setPlaylistSongs([]); }}
                style={styles.closeBtn}>×</button>
            </div>
            <div style={styles.playlistSongsList}>
              {playlistSongs.map((song, idx) => (
                <div key={song.id} style={styles.songItem}>
                  <div style={styles.songNumber}>{idx + 1}</div>
                  <div style={styles.songCover}>
                    {song.cover_url ? <img src={song.cover_url} alt="" style={styles.coverImg} /> : <FiMusic size={18} />}
                  </div>
                  <div style={styles.songInfo} onClick={() => playSong(song)}>
                    <div style={styles.songTitle}>{song.title}</div>
                    <div style={styles.songArtist}>{song.artist}</div>
                  </div>
                  <div style={styles.songDuration}>{formatTime(song.duration)}</div>
                  <button onClick={() => removeFromPlaylist(activePlaylist.id, song.id)}
                    style={styles.actionBtn}><FiTrash2 size={14} /></button>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {currentSong && (
        <div style={styles.playerBar}>
          <div style={styles.nowPlaying}>
            <div style={styles.nowPlayingCover}>
              {currentSong.cover_url ? <img src={currentSong.cover_url} alt="" style={styles.coverImg} /> : <FiMusic size={20} />}
            </div>
            <div style={styles.nowPlayingInfo}>
              <div style={styles.nowPlayingTitle}>{currentSong.title}</div>
              <div style={styles.nowPlayingArtist}>{currentSong.artist}</div>
            </div>
            <button onClick={() => toggleLike(currentSong.id)}
              style={{ background: 'none', border: 'none', color: likedSongs.has(currentSong.id) ? '#ef4444' : '#666', cursor: 'pointer' }}>
              <FiHeart />
            </button>
          </div>

          <div style={styles.playerControls}>
            <div style={styles.controlsRow}>
              <button onClick={() => setIsShuffled(!isShuffled)}
                style={{ ...styles.controlBtn, color: isShuffled ? '#4f46e5' : '#888' }}>
                <FiShuffle size={16} />
              </button>
              <button onClick={playPrevious} style={styles.controlBtn}><FiSkipBack size={20} /></button>
              <button onClick={togglePlay} style={styles.playBtn}>
                {isPlaying ? <FiPause size={22} /> : <FiPlay size={22} />}
              </button>
              <button onClick={playNext} style={styles.controlBtn}><FiSkipForward size={20} /></button>
              <button onClick={() => setRepeatMode(repeatMode === 'none' ? 'all' : repeatMode === 'all' ? 'one' : 'none')}
                style={{ ...styles.controlBtn, color: repeatMode !== 'none' ? '#4f46e5' : '#888' }}>
                <FiRepeat size={16} />
                {repeatMode === 'one' && <span style={{ fontSize: '9px', position: 'absolute' }}>1</span>}
              </button>
            </div>
            <div style={styles.progressBar}>
              <span style={styles.time}>{formatTime(currentTime)}</span>
              <div style={styles.progressTrack} onClick={seekTo}>
                <div style={{ ...styles.progressFill, width: `${(currentTime / (duration || 1)) * 100}%` }} />
                <div style={{ ...styles.progressThumb, left: `${(currentTime / (duration || 1)) * 100}%` }} />
              </div>
              <span style={styles.time}>{formatTime(duration)}</span>
            </div>
          </div>

          <div style={styles.volumeControl}>
            <FiVolume2 size={16} />
            <input type="range" min={0} max={1} step={0.01} value={volume}
              onChange={handleVolumeChange} style={styles.volumeSlider} />
          </div>
        </div>
      )}

      {showUpload && (
        <div style={styles.modalOverlay}>
          <div style={styles.uploadModal}>
            <h3 style={{ color: '#fff', marginBottom: '16px' }}>Upload Song</h3>
            <div style={{ border: '2px dashed #2a2a5e', borderRadius: '10px', padding: '30px', textAlign: 'center', marginBottom: '16px', cursor: 'pointer' }}
              onClick={() => fileInputRef.current?.click()}>
              {uploadFile ? (
                <div style={{ color: '#22c55e' }}>{uploadFile.name}</div>
              ) : (
                <div>
                  <FiMusic size={36} style={{ color: '#555', marginBottom: '8px' }} />
                  <div style={{ color: '#888', fontSize: '13px' }}>Click to select audio file</div>
                </div>
              )}
              <input type="file" ref={fileInputRef} accept="audio/*" style={{ display: 'none' }}
                onChange={(e) => setUploadFile(e.target.files[0])} />
            </div>
            <input type="text" placeholder="Title" value={uploadTitle} onChange={(e) => setUploadTitle(e.target.value)} style={styles.formInput} />
            <input type="text" placeholder="Artist" value={uploadArtist} onChange={(e) => setUploadArtist(e.target.value)} style={styles.formInput} />
            <input type="text" placeholder="Album" value={uploadAlbum} onChange={(e) => setUploadAlbum(e.target.value)} style={styles.formInput} />
            <select value={uploadGenre} onChange={(e) => setUploadGenre(e.target.value)} style={styles.formSelect}>
              {['Pop', 'Rock', 'Hip Hop', 'Electronic', 'R&B', 'Jazz', 'Classical', 'Country', 'Metal', 'Folk', 'Indie', 'Other'].map(g => (
                <option key={g} value={g}>{g}</option>
              ))}
            </select>
            <div style={{ display: 'flex', gap: '10px', marginTop: '16px' }}>
              <button onClick={uploadSong} disabled={!uploadFile || uploading} style={styles.uploadBtn}>
                {uploading ? 'Uploading...' : 'Upload'}
              </button>
              <button onClick={() => setShowUpload(false)} style={styles.cancelBtn}>Cancel</button>
            </div>
          </div>
        </div>
      )}

      {showPlaylistModal && (
        <div style={styles.modalOverlay}>
          <div style={styles.playlistModal}>
            <h3 style={{ color: '#fff', marginBottom: '16px' }}>Create Playlist</h3>
            <input type="text" placeholder="Playlist name" value={newPlaylistName}
              onChange={(e) => setNewPlaylistName(e.target.value)} style={styles.formInput}
              onKeyDown={(e) => e.key === 'Enter' && createPlaylist()} />
            <div style={{ display: 'flex', gap: '10px', marginTop: '16px' }}>
              <button onClick={createPlaylist} style={styles.uploadBtn}>Create</button>
              <button onClick={() => setShowPlaylistModal(false)} style={styles.cancelBtn}>Cancel</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

const styles = {
  container: { height: '100%', background: '#0f0f23', borderRadius: '12px', overflow: 'hidden', border: '1px solid #2a2a5e', display: 'flex', flexDirection: 'column' },
  mainContent: { display: 'flex', flex: 1, overflow: 'hidden' },
  sidebar: { width: '100%', maxWidth: '400px', display: 'flex', flexDirection: 'column', borderRight: '1px solid #2a2a5e', background: '#151532' },
  sidebarHeader: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '16px', borderBottom: '1px solid #2a2a5e' },
  sidebarTitle: { margin: 0, fontSize: '16px', color: '#fff' },
  iconBtn: { background: 'none', border: 'none', color: '#888', cursor: 'pointer', padding: '8px', borderRadius: '6px', fontSize: '16px' },
  searchContainer: { position: 'relative', padding: '10px 16px' },
  searchIcon: { position: 'absolute', left: '28px', top: '22px', color: '#666', fontSize: '14px' },
  searchInput: { width: '100%', padding: '10px 10px 10px 35px', background: '#1e1e42', border: '1px solid #2a2a5e', borderRadius: '8px', color: '#fff', fontSize: '14px', outline: 'none', boxSizing: 'border-box' },
  viewTabs: { display: 'flex', gap: '2px', padding: '0 16px 10px' },
  viewTab: { padding: '6px 14px', background: 'transparent', border: 'none', color: '#888', cursor: 'pointer', borderRadius: '6px', fontSize: '13px', transition: 'all 0.2s' },
  viewTabActive: { background: '#4f46e5', color: '#fff' },
  songList: { flex: 1, overflow: 'auto', padding: '8px' },
  songItem: { display: 'flex', alignItems: 'center', gap: '10px', padding: '8px 10px', borderRadius: '8px', cursor: 'pointer', transition: 'background 0.2s' },
  songItemActive: { background: 'rgba(79,70,229,0.15)' },
  songNumber: { width: '24px', textAlign: 'center', color: '#666', fontSize: '13px' },
  songCover: { width: '36px', height: '36px', borderRadius: '6px', background: '#1e1e42', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#666', overflow: 'hidden', flexShrink: 0 },
  coverImg: { width: '100%', height: '100%', objectFit: 'cover' },
  songInfo: { flex: 1, overflow: 'hidden' },
  songTitle: { fontSize: '13px', fontWeight: 500, color: '#fff', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' },
  songArtist: { fontSize: '11px', color: '#888', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' },
  songDuration: { fontSize: '12px', color: '#666', width: '40px', textAlign: 'right' },
  actionBtn: { background: 'none', border: 'none', color: '#666', cursor: 'pointer', padding: '4px', borderRadius: '4px', fontSize: '14px', flexShrink: 0 },
  playlistGrid: { display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '10px', padding: '8px' },
  createPlaylistCard: { background: '#1a1a3e', border: '2px dashed #2a2a5e', borderRadius: '12px', padding: '24px', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', color: '#888', minHeight: '120px' },
  playlistCard: { background: '#1a1a3e', borderRadius: '12px', padding: '14px', cursor: 'pointer', border: '1px solid #2a2a5e', textAlign: 'center' },
  playlistCover: { width: '100%', aspectRatio: '1', borderRadius: '8px', background: '#151532', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#555', marginBottom: '8px', overflow: 'hidden' },
  playlistName: { fontSize: '13px', fontWeight: 600, color: '#fff', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' },
  playlistCount: { fontSize: '11px', color: '#888', marginTop: '2px' },
  genresGrid: { display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '10px', padding: '8px' },
  genreCard: { background: '#1a1a3e', borderRadius: '10px', padding: '16px', border: '1px solid #2a2a5e', textAlign: 'center' },
  genreName: { fontSize: '14px', fontWeight: 600, color: '#fff' },
  genreCount: { fontSize: '12px', color: '#888', marginTop: '4px' },
  playlistDetail: { flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' },
  playlistDetailHeader: { display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', padding: '20px', borderBottom: '1px solid #2a2a5e' },
  closeBtn: { background: 'none', border: 'none', color: '#888', cursor: 'pointer', fontSize: '24px' },
  playlistSongsList: { flex: 1, overflow: 'auto', padding: '8px' },
  playerBar: { display: 'flex', alignItems: 'center', padding: '12px 20px', background: '#1a1a3e', borderTop: '1px solid #2a2a5e', gap: '20px' },
  nowPlaying: { display: 'flex', alignItems: 'center', gap: '12px', minWidth: '200px', flexShrink: 0 },
  nowPlayingCover: { width: '44px', height: '44px', borderRadius: '8px', background: '#1e1e42', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#666', overflow: 'hidden', flexShrink: 0 },
  nowPlayingInfo: { flex: 1, overflow: 'hidden' },
  nowPlayingTitle: { fontSize: '14px', fontWeight: 600, color: '#fff', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' },
  nowPlayingArtist: { fontSize: '12px', color: '#888', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' },
  playerControls: { flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '6px', maxWidth: '500px', margin: '0 auto' },
  controlsRow: { display: 'flex', alignItems: 'center', gap: '16px' },
  controlBtn: { background: 'none', border: 'none', color: '#888', cursor: 'pointer', padding: '4px', borderRadius: '50%', position: 'relative' },
  playBtn: { width: '40px', height: '40px', borderRadius: '50%', background: '#4f46e5', color: '#fff', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' },
  progressBar: { display: 'flex', alignItems: 'center', gap: '10px', width: '100%' },
  time: { fontSize: '11px', color: '#666', minWidth: '35px', textAlign: 'center' },
  progressTrack: { flex: 1, height: '4px', background: '#2a2a5e', borderRadius: '2px', cursor: 'pointer', position: 'relative' },
  progressFill: { height: '100%', background: '#4f46e5', borderRadius: '2px', transition: 'width 0.1s' },
  progressThumb: { position: 'absolute', top: '-4px', width: '12px', height: '12px', borderRadius: '50%', background: '#fff', transform: 'translateX(-50%)', display: 'none' },
  volumeControl: { display: 'flex', alignItems: 'center', gap: '8px', color: '#888', minWidth: '140px', justifyContent: 'flex-end' },
  volumeSlider: { width: '100px', accentColor: '#4f46e5' },
  modalOverlay: { position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.7)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center' },
  uploadModal: { background: '#1e1e42', padding: '24px', borderRadius: '16px', width: '100%', maxWidth: '420px', border: '1px solid #2a2a5e', display: 'flex', flexDirection: 'column', gap: '10px' },
  playlistModal: { background: '#1e1e42', padding: '24px', borderRadius: '16px', width: '100%', maxWidth: '380px', border: '1px solid #2a2a5e' },
  formInput: { padding: '10px 14px', background: '#151532', border: '1px solid #2a2a5e', borderRadius: '8px', color: '#fff', fontSize: '14px', outline: 'none' },
  formSelect: { padding: '10px 14px', background: '#151532', border: '1px solid #2a2a5e', borderRadius: '8px', color: '#fff', fontSize: '14px', outline: 'none' },
  uploadBtn: { flex: 1, padding: '12px', background: '#4f46e5', color: '#fff', border: 'none', borderRadius: '8px', cursor: 'pointer', fontWeight: 600 },
  cancelBtn: { padding: '12px 24px', background: '#2a2a5e', color: '#888', border: 'none', borderRadius: '8px', cursor: 'pointer' },
  uploadPromptBtn: { marginTop: '12px', padding: '8px 20px', background: '#4f46e5', color: '#fff', border: 'none', borderRadius: '8px', cursor: 'pointer', fontSize: '13px' },
  emptyState: { textAlign: 'center', padding: '40px 20px' },
};
