import React, { useState, useEffect, useRef } from 'react';
import { collection, query, where, orderBy, onSnapshot, addDoc, updateDoc, deleteDoc, doc, getDocs, setDoc, getDoc, serverTimestamp } from 'firebase/firestore';
import { auth, db } from '../App';
import { FiPlay, FiSquare, FiEye, FiDollarSign, FiMessageCircle, FiUsers, FiCalendar, FiClock, FiTag, FiEdit2, FiTrash2 } from 'react-icons/fi';

const API_URL = process.env.REACT_APP_API_URL || 'http://localhost:3000';

export default function LiveStreamComponent({ fullScreen = false }) {
  const [liveStreams, setLiveStreams] = useState([]);
  const [featuredStreams, setFeaturedStreams] = useState([]);
  const [myStreams, setMyStreams] = useState([]);
  const [activeStream, setActiveStream] = useState(null);
  const [streamMode, setStreamMode] = useState('browse');
  const [streamTitle, setStreamTitle] = useState('');
  const [streamDescription, setStreamDescription] = useState('');
  const [streamCategory, setStreamCategory] = useState('Just Chatting');
  const [categories, setCategories] = useState([]);
  const [viewerCount, setViewerCount] = useState(0);
  const [isLive, setIsLive] = useState(false);
  const [streamKey, setStreamKey] = useState('');
  const [streamId, setStreamId] = useState(null);
  const [streamChat, setStreamChat] = useState([]);
  const [chatMessage, setChatMessage] = useState('');
  const [tips, setTips] = useState([]);
  const [tipAmount, setTipAmount] = useState(5);
  const [tipMessage, setTipMessage] = useState('');
  const [showTipModal, setShowTipModal] = useState(false);
  const [scheduleDate, setScheduleDate] = useState('');
  const [scheduleTime, setScheduleTime] = useState('');
  const [loading, setLoading] = useState(true);
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [thumbnail, setThumbnail] = useState(null);

  const videoRef = useRef(null);
  const chatEndRef = useRef(null);
  const streamIntervalRef = useRef(null);

  const currentUser = JSON.parse(localStorage.getItem('user') || '{}');

  useEffect(() => {
    fetchLiveStreams();
    fetchFeaturedStreams();
    fetchMyStreams();
    fetchCategories();
    return () => {
      if (streamIntervalRef.current) clearInterval(streamIntervalRef.current);
    };
  }, []);

  const fetchLiveStreams = async () => {
    try {
      const res = await fetch(`${API_URL}/api/stream/live`).then(r => r.json());
      setLiveStreams(res);
    } catch (err) {
      console.error('Failed to fetch live streams:', err);
    } finally {
      setLoading(false);
    }
  };

  const fetchFeaturedStreams = async () => {
    try {
      const res = await fetch(`${API_URL}/api/stream/featured`).then(r => r.json());
      setFeaturedStreams(res);
    } catch (err) {
      console.error('Failed to fetch featured streams:', err);
    }
  };

  const fetchMyStreams = async () => {
    try {
      const res = await fetch(`${API_URL}/api/stream/my-streams`).then(r => r.json());
      setMyStreams(res);
    } catch (err) {
      console.error('Failed to fetch my streams:', err);
    }
  };

  const fetchCategories = async () => {
    try {
      const res = await fetch(`${API_URL}/api/stream/categories`).then(r => r.json());
      setCategories(res);
    } catch (err) {
      console.error('Failed to fetch categories:', err);
    }
  };

  const fetchStreamDetails = async (streamId) => {
    try {
      const res = await fetch(`${API_URL}/api/stream/${streamId}`).then(r => r.json());
      setActiveStream(res);
      setViewerCount(res.viewer_count);
      const chatRes = await fetch(`${API_URL}/api/stream/${streamId}/chat`).then(r => r.json());
      setStreamChat(chatRes);
      const tipsRes = await fetch(`${API_URL}/api/stream/${streamId}/tips`).then(r => r.json());
      setTips(tipsRes.tips || []);
      if (streamIntervalRef.current) clearInterval(streamIntervalRef.current);
      streamIntervalRef.current = setInterval(() => {
        setViewerCount(prev => prev + Math.floor(Math.random() * 3));
      }, 10000);
    } catch (err) {
      console.error('Failed to fetch stream details:', err);
    }
  };

  const handleStreamChat = (data) => {
    setStreamChat(prev => [...prev, data]);
    setTimeout(() => chatEndRef.current?.scrollIntoView({ behavior: 'smooth' }), 100);
  };

  const handleStreamTip = (data) => {
    setTips(prev => [{ ...data, created_at: new Date() }, ...prev]);
  };

  const handleViewerJoined = (data) => {
    setViewerCount(prev => prev + 1);
  };

  const createStream = async () => {
    try {
      const formData = { title: streamTitle, description: streamDescription, category: streamCategory };
      if (scheduleDate && scheduleTime) {
        formData.scheduledFor = new Date(`${scheduleDate}T${scheduleTime}`).toISOString();
      }
      const res = await fetch(`${API_URL}/api/stream/create`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData)
      }).then(r => r.json());
      setStreamKey(res.streamKey);
      setStreamId(res.streamId);
      setStreamMode('setup');
      setShowCreateForm(false);
      if (thumbnail) {
        const thumbForm = new FormData();
        thumbForm.append('thumbnail', thumbnail);
        await fetch(`${API_URL}/api/stream/${res.streamId}/thumbnail`, {
          method: 'POST',
          body: thumbForm
        });
      }
      fetchMyStreams();
    } catch (err) {
      console.error('Failed to create stream:', err);
      alert('Failed to create stream');
    }
  };

  const goLive = async () => {
    if (!streamId) return;
    try {
      await fetch(`${API_URL}/api/stream/go-live/${streamId}`, { method: 'POST' });
      setIsLive(true);
      setStreamMode('streaming');
      fetchLiveStreams();
    } catch (err) {
      console.error('Failed to go live:', err);
      alert('Failed to start stream');
    }
  };

  const endStream = async () => {
    if (!streamId) return;
    try {
      await fetch(`${API_URL}/api/stream/end/${streamId}`, { method: 'POST' });
      setIsLive(false);
      setStreamMode('browse');
      setStreamId(null);
      setStreamKey('');
      setViewerCount(0);
      fetchLiveStreams();
      fetchMyStreams();
    } catch (err) {
      console.error('Failed to end stream:', err);
    }
  };

  const sendChatMessage = () => {
    if (!chatMessage.trim() || !activeStream) return;
    setChatMessage('');
  };

  const sendTip = async () => {
    if (!activeStream) return;
    setShowTipModal(false);
    setTipMessage('');
  };

  const leaveStream = () => {
    setActiveStream(null);
    setStreamChat([]);
    if (streamIntervalRef.current) clearInterval(streamIntervalRef.current);
  };

  const copyStreamKey = () => {
    navigator.clipboard.writeText(streamKey);
    alert('Stream key copied to clipboard');
  };

  if (loading) {
    return (
      <div style={styles.loadingContainer}>
        <div style={{ fontSize: '18px', color: '#4f46e5' }}>Loading streams...</div>
      </div>
    );
  }

  return (
    <div style={{ ...styles.container, ...(fullScreen ? { height: 'calc(100vh - 60px)' } : {}) }}>
      {streamMode === 'browse' && !activeStream && (
        <div style={styles.browseContainer}>
          <div style={styles.browseHeader}>
            <h2 style={styles.sectionTitle}>Live Streams</h2>
            <button onClick={() => setShowCreateForm(true)} style={styles.createBtn}>
              Go Live
            </button>
          </div>

          {showCreateForm && (
            <div style={styles.createForm}>
              <h3 style={{ color: '#fff', marginBottom: '16px' }}>Create Stream</h3>
              <input type="text" placeholder="Stream Title" value={streamTitle}
                onChange={(e) => setStreamTitle(e.target.value)} style={styles.formInput} />
              <textarea placeholder="Description" value={streamDescription}
                onChange={(e) => setStreamDescription(e.target.value)} style={styles.formTextarea} rows={3} />
              <select value={streamCategory} onChange={(e) => setStreamCategory(e.target.value)} style={styles.formSelect}>
                {categories.map(cat => <option key={cat} value={cat}>{cat}</option>)}
              </select>
              <div style={styles.scheduleRow}>
                <input type="date" value={scheduleDate} onChange={(e) => setScheduleDate(e.target.value)} style={styles.formInput} />
                <input type="time" value={scheduleTime} onChange={(e) => setScheduleTime(e.target.value)} style={styles.formInput} />
              </div>
              <input type="file" accept="image/*" onChange={(e) => setThumbnail(e.target.files[0])} style={{ color: '#aaa' }} />
              <div style={styles.formActions}>
                <button onClick={createStream} style={styles.createStreamBtn}>Create Stream</button>
                <button onClick={() => setShowCreateForm(false)} style={styles.cancelBtn}>Cancel</button>
              </div>
            </div>
          )}

          {featuredStreams.length > 0 && (
            <div style={styles.featuredSection}>
              <h3 style={styles.subSectionTitle}>Featured Streams</h3>
              <div style={styles.featuredGrid}>
                {featuredStreams.map(stream => (
                  <div key={stream.id} style={styles.featuredCard} onClick={() => fetchStreamDetails(stream.id)}>
                    <div style={styles.featuredThumb}>
                      {stream.thumbnail_url ? (
                        <img src={stream.thumbnail_url} alt="" style={styles.thumbImg} />
                      ) : (
                        <div style={styles.thumbPlaceholder}>
                          <FiPlay size={32} />
                        </div>
                      )}
                      <div style={styles.liveBadge}>LIVE</div>
                      <div style={styles.viewerBadge}>
                        <FiEye size={12} /> {stream.viewer_count}
                      </div>
                    </div>
                    <div style={styles.featuredInfo}>
                      <div style={styles.streamerAvatar}>
                        {stream.avatar ? <img src={stream.avatar} alt="" style={styles.avatarImg} /> : stream.username?.[0]?.toUpperCase()}
                      </div>
                      <div style={styles.featuredText}>
                        <div style={styles.streamTitle}>{stream.title}</div>
                        <div style={styles.streamUsername}>{stream.username}</div>
                        <div style={styles.streamCategory}>{stream.category}</div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          <h3 style={styles.subSectionTitle}>All Live Streams</h3>
          <div style={styles.streamsGrid}>
            {liveStreams.length === 0 ? (
              <div style={styles.emptyState}>
                <div style={{ fontSize: '48px', marginBottom: '12px' }}>📡</div>
                <div style={{ fontSize: '18px', color: '#888', marginBottom: '8px' }}>No live streams right now</div>
                <div style={{ fontSize: '14px', color: '#666' }}>Be the first to go live!</div>
              </div>
            ) : (
              liveStreams.map(stream => (
                <div key={stream.id} style={styles.streamCard} onClick={() => fetchStreamDetails(stream.id)}>
                  <div style={styles.streamThumb}>
                    {stream.thumbnail_url ? (
                      <img src={stream.thumbnail_url} alt="" style={styles.thumbImg} />
                    ) : (
                      <div style={styles.thumbPlaceholder}>
                        <FiPlay size={24} />
                      </div>
                    )}
                    <div style={styles.liveBadgeSmall}>LIVE</div>
                    <div style={styles.viewerBadgeSmall}>
                      <FiEye size={10} /> {stream.viewer_count}
                    </div>
                  </div>
                  <div style={styles.streamInfo}>
                    <div style={styles.streamerSmallAvatar}>
                      {stream.avatar ? <img src={stream.avatar} alt="" /> : stream.username?.[0]?.toUpperCase()}
                    </div>
                    <div style={styles.streamDetails}>
                      <div style={styles.streamTitleSmall}>{stream.title}</div>
                      <div style={styles.streamUsernameSmall}>{stream.username}</div>
                      <div style={styles.streamCategorySmall}>{stream.category}</div>
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>

          {myStreams.length > 0 && (
            <div style={styles.myStreamsSection}>
              <h3 style={styles.subSectionTitle}>My Streams</h3>
              {myStreams.map(stream => (
                <div key={stream.id} style={styles.myStreamCard}>
                  <div style={styles.myStreamInfo}>
                    <div style={{ fontWeight: 600, color: '#fff' }}>{stream.title || 'Untitled'}</div>
                    <div style={{ fontSize: '12px', color: stream.is_live ? '#22c55e' : '#888' }}>
                      {stream.is_live ? '● Live' : 'Ended'} · {stream.total_views} views
                    </div>
                  </div>
                  <button onClick={() => {
                    setStreamId(stream.id);
                    setStreamKey(stream.stream_key);
                    setStreamTitle(stream.title);
                    setStreamMode('setup');
                    if (stream.is_live) { setIsLive(true); setStreamMode('streaming'); }
                  }} style={styles.editBtn}>Manage</button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {streamMode === 'setup' && (
        <div style={styles.setupContainer}>
          <h2 style={styles.setupTitle}>Stream Setup</h2>
          <div style={styles.setupCard}>
            <div style={styles.setupSection}>
              <label style={styles.setupLabel}>Stream Key</label>
              <div style={styles.streamKeyRow}>
                <input type="text" value={streamKey} readOnly style={styles.streamKeyInput} />
                <button onClick={copyStreamKey} style={styles.copyBtn}>Copy</button>
              </div>
            </div>
            <div style={styles.setupSection}>
              <label style={styles.setupLabel}>RTMP URL</label>
              <input type="text" value={`rtmp://${window.location.hostname}/live/${streamKey}`} readOnly style={styles.streamKeyInput} />
            </div>
            <div style={styles.setupSection}>
              <label style={styles.setupLabel}>Stream Title</label>
              <input type="text" value={streamTitle} onChange={(e) => setStreamTitle(e.target.value)}
                style={styles.formInput} />
            </div>
            <div style={styles.setupActions}>
              <button onClick={goLive} style={styles.goLiveBtn}>
                <FiPlay /> Start Streaming
              </button>
              <button onClick={() => setStreamMode('browse')} style={styles.cancelBtn}>Cancel</button>
            </div>
          </div>
        </div>
      )}

      {activeStream && (
        <div style={styles.streamPlayerContainer}>
          <div style={styles.streamMain}>
            <div style={styles.videoContainer}>
              {activeStream.thumbnail_url ? (
                <img src={activeStream.thumbnail_url} alt="" style={styles.streamImage} />
              ) : (
                <div style={styles.streamVideoPlaceholder}>
                  <div style={{ fontSize: '48px', marginBottom: '12px' }}>📡</div>
                  <div style={{ fontSize: '18px', color: '#888' }}>Live Stream</div>
                  <div style={{ fontSize: '14px', color: '#4f46e5', marginTop: '8px' }}>
                    {activeStream.title}
                  </div>
                </div>
              )}
              <div style={styles.streamOverlay}>
                <div style={styles.streamerInfo}>
                  <div style={styles.streamerAvatarLarge}>
                    {activeStream.avatar ? <img src={activeStream.avatar} alt="" /> : activeStream.username?.[0]?.toUpperCase()}
                  </div>
                  <div style={styles.streamerTextInfo}>
                    <div style={styles.streamerName}>{activeStream.username}</div>
                    <div style={styles.streamTitleOverlay}>{activeStream.title}</div>
                  </div>
                </div>
                <div style={styles.streamStats}>
                  <div style={styles.streamStat}>
                    <FiEye /> {viewerCount}
                  </div>
                  <div style={styles.streamStat}>
                    <FiClock /> {activeStream.started_at ? new Date(activeStream.started_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : ''}
                  </div>
                  <div style={styles.streamStat}>
                    <FiTag /> {activeStream.category}
                  </div>
                </div>
              </div>
            </div>

            <div style={styles.streamActions}>
              <button onClick={() => setShowTipModal(true)} style={styles.tipBtn}>
                <FiDollarSign /> Send Tip
              </button>
              <button onClick={leaveStream} style={styles.leaveBtn}>
                Leave Stream
              </button>
            </div>

            <div style={styles.streamChatSection}>
              <div style={styles.streamChatHeader}>
                <FiMessageCircle /> Live Chat
              </div>
              <div style={styles.streamChatMessages}>
                {streamChat.map((msg, idx) => (
                  <div key={idx} style={styles.streamChatMsg}>
                    <span style={{ color: '#4f46e5', fontWeight: 600 }}>{msg.username}:</span> {msg.message}
                  </div>
                ))}
                <div ref={chatEndRef} />
              </div>
              <div style={styles.streamChatInput}>
                <input type="text" value={chatMessage} onChange={(e) => setChatMessage(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && sendChatMessage()}
                  placeholder="Send a message..." style={styles.streamChatInputField} />
                <button onClick={sendChatMessage} style={styles.streamChatSendBtn}>Send</button>
              </div>
            </div>
          </div>

          <div style={styles.streamSidebar}>
            <div style={styles.sidebarSection}>
              <h4 style={styles.sidebarTitle}>Recent Tips</h4>
              {tips.length === 0 ? (
                <div style={{ color: '#666', fontSize: '13px', padding: '10px' }}>No tips yet</div>
              ) : (
                tips.slice(0, 10).map((tip, idx) => (
                  <div key={idx} style={styles.tipItem}>
                    <span style={{ color: '#f59e0b', fontWeight: 600 }}>{tip.username}</span>
                    <span style={{ color: '#22c55e' }}>+${tip.amount}</span>
                    {tip.message && <div style={{ fontSize: '12px', color: '#888' }}>{tip.message}</div>}
                  </div>
                ))
              )}
            </div>
            {activeStream.description && (
              <div style={styles.sidebarSection}>
                <h4 style={styles.sidebarTitle}>About</h4>
                <p style={{ color: '#aaa', fontSize: '13px', lineHeight: 1.5 }}>{activeStream.description}</p>
              </div>
            )}
          </div>
        </div>
      )}

      {streamMode === 'streaming' && (
        <div style={styles.streamingDashboard}>
          <div style={styles.streamingHeader}>
            <div style={styles.streamingStatus}>
              <div style={styles.liveDot} />
              <span style={{ color: '#22c55e', fontWeight: 600 }}>LIVE</span>
              <span style={{ color: '#888' }}> · {streamTitle}</span>
            </div>
            <div style={styles.streamingStats}>
              <div style={styles.streamingStat}><FiEye /> {viewerCount}</div>
              <div style={styles.streamingStat}><FiClock /> Streaming</div>
            </div>
            <button onClick={endStream} style={styles.endStreamBtn}>
              <FiSquare /> End Stream
            </button>
          </div>
          <div style={styles.streamingContent}>
            <div style={styles.streamingPreview}>
              <video ref={videoRef} autoPlay muted style={styles.streamingVideo} />
            </div>
            <div style={styles.streamingChat}>
              <div style={styles.streamingChatMessages}>
                {streamChat.map((msg, idx) => (
                  <div key={idx} style={styles.streamChatMsg}>
                    <span style={{ color: '#4f46e5', fontWeight: 600 }}>{msg.username}:</span> {msg.message}
                  </div>
                ))}
                <div ref={chatEndRef} />
              </div>
              <div style={styles.streamingChatInput}>
                <input type="text" value={chatMessage} onChange={(e) => setChatMessage(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && sendChatMessage()}
                  placeholder="Chat..." style={styles.streamChatInputField} />
                <button onClick={sendChatMessage} style={styles.streamChatSendBtn}>Send</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {showTipModal && (
        <div style={styles.modalOverlay}>
          <div style={styles.modalContent}>
            <h3 style={{ color: '#fff', marginBottom: '16px' }}>Send a Tip</h3>
            <div style={styles.tipAmounts}>
              {[1, 5, 10, 20, 50, 100].map(amount => (
                <button key={amount} onClick={() => setTipAmount(amount)}
                  style={{ ...styles.tipAmountBtn, ...(tipAmount === amount ? styles.tipAmountBtnActive : {}) }}>
                  ${amount}
                </button>
              ))}
            </div>
            <input type="number" value={tipAmount} onChange={(e) => setTipAmount(parseInt(e.target.value) || 5)}
              style={styles.formInput} min={1} />
            <input type="text" placeholder="Message (optional)" value={tipMessage}
              onChange={(e) => setTipMessage(e.target.value)} style={styles.formInput} />
            <div style={{ display: 'flex', gap: '10px', marginTop: '16px' }}>
              <button onClick={sendTip} style={styles.sendTipBtn}>Send ${tipAmount}</button>
              <button onClick={() => setShowTipModal(false)} style={styles.cancelBtn}>Cancel</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

const styles = {
  container: { height: '100%', background: '#0f0f23', borderRadius: '12px', overflow: 'auto', border: '1px solid #2a2a5e' },
  loadingContainer: { display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%' },
  browseContainer: { padding: '24px', maxWidth: '1200px', margin: '0 auto' },
  browseHeader: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' },
  sectionTitle: { margin: 0, fontSize: '24px', color: '#fff' },
  subSectionTitle: { fontSize: '18px', color: '#ddd', marginBottom: '16px', marginTop: '24px' },
  createBtn: { padding: '12px 24px', background: '#dc2626', color: '#fff', border: 'none', borderRadius: '10px', fontSize: '15px', fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '8px' },
  createForm: { background: '#1a1a3e', padding: '24px', borderRadius: '14px', marginBottom: '24px', border: '1px solid #2a2a5e', display: 'flex', flexDirection: 'column', gap: '12px' },
  formInput: { padding: '12px 16px', background: '#151532', border: '1px solid #2a2a5e', borderRadius: '8px', color: '#fff', fontSize: '14px', outline: 'none' },
  formTextarea: { padding: '12px 16px', background: '#151532', border: '1px solid #2a2a5e', borderRadius: '8px', color: '#fff', fontSize: '14px', outline: 'none', resize: 'vertical', fontFamily: 'inherit' },
  formSelect: { padding: '12px 16px', background: '#151532', border: '1px solid #2a2a5e', borderRadius: '8px', color: '#fff', fontSize: '14px', outline: 'none' },
  scheduleRow: { display: 'flex', gap: '12px' },
  formActions: { display: 'flex', gap: '10px', marginTop: '8px' },
  createStreamBtn: { padding: '12px 24px', background: '#dc2626', color: '#fff', border: 'none', borderRadius: '8px', cursor: 'pointer', fontWeight: 600 },
  cancelBtn: { padding: '12px 24px', background: '#2a2a5e', color: '#888', border: 'none', borderRadius: '8px', cursor: 'pointer' },
  featuredSection: { marginBottom: '24px' },
  featuredGrid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: '16px' },
  featuredCard: { background: '#1a1a3e', borderRadius: '14px', overflow: 'hidden', cursor: 'pointer', border: '1px solid #2a2a5e', transition: 'transform 0.2s' },
  featuredThumb: { position: 'relative', height: '180px', background: '#151532', overflow: 'hidden' },
  thumbImg: { width: '100%', height: '100%', objectFit: 'cover' },
  thumbPlaceholder: { display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', color: '#555' },
  liveBadge: { position: 'absolute', top: '10px', left: '10px', background: '#dc2626', color: '#fff', padding: '4px 10px', borderRadius: '6px', fontSize: '11px', fontWeight: 'bold', letterSpacing: '1px' },
  viewerBadge: { position: 'absolute', top: '10px', right: '10px', background: 'rgba(0,0,0,0.7)', color: '#fff', padding: '4px 10px', borderRadius: '6px', fontSize: '11px', display: 'flex', alignItems: 'center', gap: '4px' },
  liveBadgeSmall: { position: 'absolute', top: '8px', left: '8px', background: '#dc2626', color: '#fff', padding: '2px 8px', borderRadius: '4px', fontSize: '10px', fontWeight: 'bold' },
  viewerBadgeSmall: { position: 'absolute', top: '8px', right: '8px', background: 'rgba(0,0,0,0.7)', color: '#fff', padding: '2px 8px', borderRadius: '4px', fontSize: '10px', display: 'flex', alignItems: 'center', gap: '3px' },
  featuredInfo: { display: 'flex', alignItems: 'center', gap: '12px', padding: '12px' },
  streamerAvatar: { width: '40px', height: '40px', borderRadius: '50%', background: '#4f46e5', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '16px', fontWeight: 'bold', color: '#fff', overflow: 'hidden', flexShrink: 0 },
  avatarImg: { width: '100%', height: '100%', objectFit: 'cover' },
  featuredText: { flex: 1 },
  streamTitle: { fontSize: '14px', fontWeight: 600, color: '#fff', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' },
  streamUsername: { fontSize: '13px', color: '#888' },
  streamCategory: { fontSize: '11px', color: '#4f46e5' },
  streamsGrid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(250px, 1fr))', gap: '14px' },
  streamCard: { background: '#1a1a3e', borderRadius: '12px', overflow: 'hidden', cursor: 'pointer', border: '1px solid #2a2a5e', transition: 'transform 0.2s' },
  streamThumb: { position: 'relative', height: '140px', background: '#151532', overflow: 'hidden' },
  streamInfo: { display: 'flex', gap: '10px', padding: '10px' },
  streamerSmallAvatar: { width: '32px', height: '32px', borderRadius: '50%', background: '#4f46e5', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '14px', fontWeight: 'bold', color: '#fff', overflow: 'hidden', flexShrink: 0 },
  streamDetails: { flex: 1, overflow: 'hidden' },
  streamTitleSmall: { fontSize: '13px', fontWeight: 600, color: '#fff', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' },
  streamUsernameSmall: { fontSize: '12px', color: '#888' },
  streamCategorySmall: { fontSize: '11px', color: '#4f46e5' },
  emptyState: { textAlign: 'center', padding: '60px 20px', gridColumn: '1 / -1' },
  myStreamsSection: { marginTop: '24px' },
  myStreamCard: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '14px', background: '#1a1a3e', borderRadius: '10px', marginBottom: '8px', border: '1px solid #2a2a5e' },
  myStreamInfo: { flex: 1 },
  editBtn: { padding: '8px 16px', background: '#4f46e5', color: '#fff', border: 'none', borderRadius: '6px', cursor: 'pointer', fontSize: '13px' },
  setupContainer: { padding: '40px', maxWidth: '600px', margin: '0 auto' },
  setupTitle: { color: '#fff', fontSize: '24px', marginBottom: '24px', textAlign: 'center' },
  setupCard: { background: '#1a1a3e', borderRadius: '14px', padding: '24px', border: '1px solid #2a2a5e', display: 'flex', flexDirection: 'column', gap: '20px' },
  setupSection: { display: 'flex', flexDirection: 'column', gap: '6px' },
  setupLabel: { color: '#aaa', fontSize: '14px', fontWeight: 500 },
  streamKeyRow: { display: 'flex', gap: '8px' },
  streamKeyInput: { flex: 1, padding: '10px 14px', background: '#151532', border: '1px solid #2a2a5e', borderRadius: '8px', color: '#22c55e', fontSize: '13px', fontFamily: 'monospace', outline: 'none' },
  copyBtn: { padding: '10px 20px', background: '#4f46e5', color: '#fff', border: 'none', borderRadius: '8px', cursor: 'pointer' },
  setupActions: { display: 'flex', gap: '10px' },
  goLiveBtn: { flex: 1, padding: '14px', background: '#dc2626', color: '#fff', border: 'none', borderRadius: '8px', fontSize: '16px', fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px' },
  streamPlayerContainer: { display: 'flex', height: '100%', overflow: 'hidden' },
  streamMain: { flex: 1, display: 'flex', flexDirection: 'column', overflow: 'auto' },
  videoContainer: { position: 'relative', background: '#000', minHeight: '400px', display: 'flex', alignItems: 'center', justifyContent: 'center' },
  streamImage: { width: '100%', height: '400px', objectFit: 'cover' },
  streamVideoPlaceholder: { textAlign: 'center', padding: '60px' },
  streamOverlay: { position: 'absolute', bottom: 0, left: 0, right: 0, background: 'linear-gradient(transparent, rgba(0,0,0,0.8))', padding: '20px', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end' },
  streamerInfo: { display: 'flex', alignItems: 'center', gap: '12px' },
  streamerAvatarLarge: { width: '48px', height: '48px', borderRadius: '50%', background: '#4f46e5', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '20px', fontWeight: 'bold', color: '#fff', overflow: 'hidden' },
  streamerTextInfo: { color: '#fff' },
  streamerName: { fontSize: '16px', fontWeight: 600 },
  streamTitleOverlay: { fontSize: '13px', opacity: 0.8 },
  streamStats: { display: 'flex', gap: '16px', color: '#fff', fontSize: '13px' },
  streamStat: { display: 'flex', alignItems: 'center', gap: '4px', background: 'rgba(0,0,0,0.5)', padding: '4px 10px', borderRadius: '6px' },
  streamActions: { display: 'flex', gap: '10px', padding: '12px 20px', background: '#1a1a3e', borderBottom: '1px solid #2a2a5e' },
  tipBtn: { padding: '10px 20px', background: '#f59e0b', color: '#fff', border: 'none', borderRadius: '8px', cursor: 'pointer', fontSize: '14px', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '6px' },
  leaveBtn: { padding: '10px 20px', background: '#2a2a5e', color: '#888', border: 'none', borderRadius: '8px', cursor: 'pointer', fontSize: '14px' },
  streamChatSection: { flex: 1, display: 'flex', flexDirection: 'column', padding: '12px 20px', background: '#151532' },
  streamChatHeader: { color: '#fff', fontSize: '15px', fontWeight: 600, marginBottom: '10px', display: 'flex', alignItems: 'center', gap: '8px' },
  streamChatMessages: { flex: 1, overflow: 'auto', display: 'flex', flexDirection: 'column', gap: '6px', padding: '10px 0', maxHeight: '300px' },
  streamChatMsg: { fontSize: '13px', color: '#ccc', lineHeight: 1.5 },
  streamChatInput: { display: 'flex', gap: '8px', paddingTop: '10px', borderTop: '1px solid #2a2a5e' },
  streamChatInputField: { flex: 1, padding: '10px 14px', background: '#1e1e42', border: '1px solid #2a2a5e', borderRadius: '8px', color: '#fff', outline: 'none', fontSize: '13px' },
  streamChatSendBtn: { padding: '10px 20px', background: '#4f46e5', color: '#fff', border: 'none', borderRadius: '8px', cursor: 'pointer' },
  streamSidebar: { width: '300px', background: '#151532', borderLeft: '1px solid #2a2a5e', padding: '16px', display: 'flex', flexDirection: 'column', gap: '16px', overflow: 'auto' },
  sidebarSection: { background: '#1a1a3e', borderRadius: '10px', padding: '14px', border: '1px solid #2a2a5e' },
  sidebarTitle: { color: '#fff', fontSize: '14px', marginBottom: '10px' },
  tipItem: { padding: '8px 0', borderBottom: '1px solid #2a2a5e', fontSize: '13px', display: 'flex', gap: '10px', flexWrap: 'wrap' },
  streamingDashboard: { display: 'flex', flexDirection: 'column', height: '100%' },
  streamingHeader: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 20px', background: '#1a1a3e', borderBottom: '1px solid #2a2a5e' },
  streamingStatus: { display: 'flex', alignItems: 'center', gap: '8px' },
  liveDot: { width: '10px', height: '10px', borderRadius: '50%', background: '#22c55e', animation: 'pulse 1.5s infinite' },
  streamingStats: { display: 'flex', gap: '16px', color: '#888', fontSize: '13px' },
  streamingStat: { display: 'flex', alignItems: 'center', gap: '4px' },
  endStreamBtn: { padding: '10px 20px', background: '#dc2626', color: '#fff', border: 'none', borderRadius: '8px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px', fontWeight: 600 },
  streamingContent: { flex: 1, display: 'flex', overflow: 'hidden' },
  streamingPreview: { flex: 1, background: '#000', display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '400px' },
  streamingVideo: { width: '100%', height: '100%', objectFit: 'contain', background: '#111' },
  streamingChat: { width: '320px', display: 'flex', flexDirection: 'column', background: '#151532', borderLeft: '1px solid #2a2a5e' },
  streamingChatMessages: { flex: 1, overflow: 'auto', padding: '12px', display: 'flex', flexDirection: 'column', gap: '6px' },
  streamingChatInput: { display: 'flex', gap: '8px', padding: '10px', borderTop: '1px solid #2a2a5e' },
  modalOverlay: { position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.7)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center' },
  modalContent: { background: '#1e1e42', padding: '30px', borderRadius: '16px', width: '100%', maxWidth: '420px', border: '1px solid #2a2a5e' },
  tipAmounts: { display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '8px', marginBottom: '12px' },
  tipAmountBtn: { padding: '12px', background: '#151532', border: '1px solid #2a2a5e', borderRadius: '8px', color: '#fff', cursor: 'pointer', fontSize: '16px', fontWeight: 600, textAlign: 'center' },
  tipAmountBtnActive: { background: '#4f46e5', borderColor: '#4f46e5' },
  sendTipBtn: { flex: 1, padding: '14px', background: '#f59e0b', color: '#fff', border: 'none', borderRadius: '8px', cursor: 'pointer', fontWeight: 600, fontSize: '15px' },
};
