import React, { useState, useEffect, useRef, useCallback } from 'react';
import axios from 'axios';
import { getSocket } from '../App';
import { FiMic, FiMicOff, FiVideo, FiVideoOff, FiPhone, FiPhoneOff, FiMonitor, FiCamera, FiThumbsUp, FiMessageSquare, FiUsers, FiSettings, FiStar, FiMaximize2, FiMinimize2 } from 'react-icons/fi';

const API_URL = process.env.REACT_APP_API_URL || 'http://localhost:3000';

const servers = {
  iceServers: [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
    { urls: 'stun:stun2.l.google.com:19302' },
    { urls: 'stun:stun3.l.google.com:19302' },
    { urls: 'stun:stun4.l.google.com:19302' },
    {
      urls: process.env.REACT_APP_TURN_URL || 'turn:openrelay.metered.ca:80',
      username: process.env.REACT_APP_TURN_USERNAME || 'openrelayproject',
      credential: process.env.REACT_APP_TURN_CREDENTIAL || 'openrelayproject'
    }
  ],
  iceCandidatePoolSize: 10
};

export default function VideoCallComponent({ fullScreen = false }) {
  const [localStream, setLocalStream] = useState(null);
  const [remoteStreams, setRemoteStreams] = useState({});
  const [peers, setPeers] = useState({});
  const [inCall, setInCall] = useState(false);
  const [roomId, setRoomId] = useState(null);
  const [isAudioMuted, setIsAudioMuted] = useState(false);
  const [isVideoMuted, setIsVideoMuted] = useState(false);
  const [isScreenSharing, setIsScreenSharing] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [participants, setParticipants] = useState([]);
  const [contacts, setContacts] = useState([]);
  const [incomingCall, setIncomingCall] = useState(null);
  const [showChat, setShowChat] = useState(false);
  const [callMessages, setCallMessages] = useState([]);
  const [chatMessage, setChatMessage] = useState('');
  const [isGroupCall, setIsGroupCall] = useState(false);
  const [selectedContacts, setSelectedContacts] = useState([]);
  const [raisedHands, setRaisedHands] = useState({});
  const [isFullScreen, setIsFullScreen] = useState(false);
  const [callDuration, setCallDuration] = useState(0);
  const [background, setBackground] = useState('none');
  const [showSettings, setShowSettings] = useState(false);

  const localVideoRef = useRef(null);
  const remoteVideoRefs = useRef({});
  const screenStreamRef = useRef(null);
  const mediaRecorderRef = useRef(null);
  const recordedChunksRef = useRef([]);
  const durationIntervalRef = useRef(null);
  const containerRef = useRef(null);

  const currentUser = JSON.parse(localStorage.getItem('user') || '{}');

  useEffect(() => {
    fetchContacts();
    const socket = getSocket();
    if (socket) {
      socket.on('video:incoming-call', handleIncomingCall);
      socket.on('video:call-accepted', handleCallAccepted);
      socket.on('video:call-rejected', handleCallRejected);
      socket.on('video:call-ended', handleCallEnded);
      socket.on('video:signal', handleSignal);
      socket.on('video:user-joined', handleUserJoined);
      socket.on('video:user-left', handleUserLeft);
      socket.on('video:raise-hand', handleRaiseHand);
      socket.on('video:recording-status', handleRecordingStatus);
    }
    return () => {
      const s = getSocket();
      if (s) {
        s.off('video:incoming-call', handleIncomingCall);
        s.off('video:call-accepted', handleCallAccepted);
        s.off('video:call-rejected', handleCallRejected);
        s.off('video:call-ended', handleCallEnded);
        s.off('video:signal', handleSignal);
        s.off('video:user-joined', handleUserJoined);
        s.off('video:user-left', handleUserLeft);
        s.off('video:raise-hand', handleRaiseHand);
        s.off('video:recording-status', handleRecordingStatus);
      }
      cleanupCall();
    };
  }, []);

  useEffect(() => {
    if (inCall && durationIntervalRef.current === null) {
      durationIntervalRef.current = setInterval(() => {
        setCallDuration(prev => prev + 1);
      }, 1000);
    }
    return () => {
      if (durationIntervalRef.current) {
        clearInterval(durationIntervalRef.current);
        durationIntervalRef.current = null;
      }
    };
  }, [inCall]);

  const fetchContacts = async () => {
    try {
      const res = await axios.get(`${API_URL}/api/video/contacts`);
      setContacts(res.data);
    } catch (err) {
      console.error('Failed to fetch contacts:', err);
    }
  };

  const handleIncomingCall = (data) => {
    setIncomingCall(data);
  };

  const handleCallAccepted = async (data) => {
    setInCall(true);
    await startLocalStream();
    const socket = getSocket();
    if (socket) {
      socket.emit('video:join', { roomId: data.roomId, username: currentUser.username });
    }
    setRoomId(data.roomId);
    setIncomingCall(null);
  };

  const handleCallRejected = (data) => {
    alert(`${data.username} rejected the call`);
    setIncomingCall(null);
    cleanupCall();
  };

  const handleCallEnded = ({ duration }) => {
    alert(`Call ended. Duration: ${Math.floor(duration / 60)}:${(duration % 60).toString().padStart(2, '0')}`);
    cleanupCall();
  };

  const handleSignal = async (data) => {
    if (data.type === 'offer') {
      const peer = createPeer(data.userId, false);
      await peer.setRemoteDescription(new RTCSessionDescription(data.signal));
      const answer = await peer.createAnswer();
      await peer.setLocalDescription(answer);
      const socket = getSocket();
      if (socket) {
        socket.emit('video:signal', { roomId, signal: answer, type: 'answer', targetUserId: data.userId });
      }
    } else if (data.type === 'answer') {
      const peer = peers[data.userId];
      if (peer) {
        await peer.setRemoteDescription(new RTCSessionDescription(data.signal));
      }
    } else if (data.type === 'ice-candidate') {
      const peer = peers[data.userId];
      if (peer) {
        await peer.addIceCandidate(new RTCIceCandidate(data.signal));
      }
    }
  };

  const handleUserJoined = (data) => {
    setParticipants(prev => [...prev, { id: data.userId, username: data.username }]);
    if (inCall && localStream) {
      createPeer(data.userId, true);
    }
  };

  const handleUserLeft = (data) => {
    if (peers[data.userId]) {
      peers[data.userId].close();
      setPeers(prev => {
        const next = { ...prev };
        delete next[data.userId];
        return next;
      });
    }
    setRemoteStreams(prev => {
      const next = { ...prev };
      delete next[data.userId];
      return next;
    });
    setParticipants(prev => prev.filter(p => p.id !== data.userId));
  };

  const handleRaiseHand = ({ userId, username }) => {
    setRaisedHands(prev => ({ ...prev, [userId]: username }));
    setTimeout(() => {
      setRaisedHands(prev => {
        const next = { ...prev };
        delete next[userId];
        return next;
      });
    }, 5000);
  };

  const handleRecordingStatus = ({ isRecording }) => {
    setIsRecording(isRecording);
  };

  const startLocalStream = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { width: { ideal: 1280 }, height: { ideal: 720 }, frameRate: { ideal: 30 } },
        audio: { echoCancellation: true, noiseSuppression: true }
      });
      setLocalStream(stream);
      if (localVideoRef.current) {
        localVideoRef.current.srcObject = stream;
      }
      return stream;
    } catch (err) {
      console.error('Failed to get local stream:', err);
      alert('Camera/microphone access denied. Please allow permissions.');
      return null;
    }
  };

  const createPeer = (userId, initiator) => {
    const peer = new RTCPeerConnection(servers);

    if (localStream) {
      localStream.getTracks().forEach(track => peer.addTrack(track, localStream));
    }

    peer.onicecandidate = (event) => {
      if (event.candidate) {
        const socket = getSocket();
        if (socket) {
          socket.emit('video:signal', {
            roomId,
            signal: event.candidate,
            type: 'ice-candidate',
            targetUserId: userId
          });
        }
      }
    };

    peer.ontrack = (event) => {
      setRemoteStreams(prev => ({
        ...prev,
        [userId]: event.streams[0]
      }));
    };

    peer.onconnectionstatechange = () => {
      if (peer.connectionState === 'disconnected' || peer.connectionState === 'failed') {
        handleUserLeft({ userId });
      }
    };

    setPeers(prev => ({ ...prev, [userId]: peer }));

    if (initiator) {
      peer.createOffer().then(offer => {
        peer.setLocalDescription(offer);
        const socket = getSocket();
        if (socket) {
          socket.emit('video:signal', {
            roomId,
            signal: offer,
            type: 'offer',
            targetUserId: userId
          });
        }
      });
    }

    return peer;
  };

  const startCall = async (calleeId) => {
    const stream = await startLocalStream();
    if (!stream) return;

    try {
      const res = await axios.post(`${API_URL}/api/video/call/start`, {
        calleeId,
        isGroup: isGroupCall,
        participantIds: isGroupCall ? selectedContacts : []
      });
      setRoomId(res.data.roomId);
      setInCall(true);
      const socket = getSocket();
      if (socket) {
        socket.emit('video:join', { roomId: res.data.roomId, username: currentUser.username });
      }
    } catch (err) {
      console.error('Failed to start call:', err);
    }
  };

  const acceptCall = async () => {
    if (!incomingCall) return;
    const stream = await startLocalStream();
    if (!stream) return;

    try {
      await axios.post(`${API_URL}/api/video/call/accept`, { roomId: incomingCall.roomId });
      setRoomId(incomingCall.roomId);
      setInCall(true);
      const socket = getSocket();
      if (socket) {
        socket.emit('video:join', { roomId: incomingCall.roomId, username: currentUser.username });
      }
      setIncomingCall(null);
    } catch (err) {
      console.error('Failed to accept call:', err);
    }
  };

  const rejectCall = async () => {
    if (!incomingCall) return;
    try {
      await axios.post(`${API_URL}/api/video/call/reject`, { roomId: incomingCall.roomId });
    } catch (err) {
      console.error('Failed to reject call:', err);
    }
    setIncomingCall(null);
  };

  const endCall = async () => {
    if (roomId) {
      try {
        await axios.post(`${API_URL}/api/video/call/end`, { roomId });
      } catch (err) {
        console.error('Failed to end call:', err);
      }
    }
    cleanupCall();
  };

  const cleanupCall = () => {
    Object.values(peers).forEach(peer => peer.close());
    setPeers({});
    setRemoteStreams({});
    if (localStream) {
      localStream.getTracks().forEach(track => track.stop());
    }
    if (screenStreamRef.current) {
      screenStreamRef.current.getTracks().forEach(track => track.stop());
    }
    setLocalStream(null);
    setInCall(false);
    setRoomId(null);
    setIsScreenSharing(false);
    setParticipants([]);
    setCallDuration(0);
    setRaisedHands({});
    setIsRecording(false);
    if (durationIntervalRef.current) {
      clearInterval(durationIntervalRef.current);
      durationIntervalRef.current = null;
    }
    const socket = getSocket();
    if (socket) {
      socket.emit('video:leave', { roomId });
    }
  };

  const toggleAudio = () => {
    if (localStream) {
      localStream.getAudioTracks().forEach(track => track.enabled = isAudioMuted);
      setIsAudioMuted(!isAudioMuted);
    }
  };

  const toggleVideo = () => {
    if (localStream) {
      localStream.getVideoTracks().forEach(track => track.enabled = isVideoMuted);
      setIsVideoMuted(!isVideoMuted);
    }
  };

  const toggleScreenShare = async () => {
    if (isScreenSharing) {
      screenStreamRef.current?.getTracks().forEach(track => track.stop());
      if (localVideoRef.current && localStream) {
        localVideoRef.current.srcObject = localStream;
      }
      setIsScreenSharing(false);
    } else {
      try {
        const screenStream = await navigator.mediaDevices.getDisplayMedia({ video: true });
        screenStreamRef.current = screenStream;
        const videoTrack = screenStream.getVideoTracks()[0];
        Object.values(peers).forEach(peer => {
          const sender = peer.getSenders().find(s => s.track?.kind === 'video');
          if (sender) sender.replaceTrack(videoTrack);
        });
        if (localVideoRef.current) {
          localVideoRef.current.srcObject = screenStream;
        }
        setIsScreenSharing(true);
        videoTrack.onended = () => toggleScreenShare();
      } catch (err) {
        console.error('Screen share failed:', err);
      }
    }
  };

  const toggleRecording = () => {
    if (isRecording) {
      mediaRecorderRef.current?.stop();
      setIsRecording(false);
    } else {
      if (!localStream) return;
      recordedChunksRef.current = [];
      const mediaRecorder = new MediaRecorder(localStream, { mimeType: 'video/webm' });
      mediaRecorder.ondataavailable = (e) => {
        if (e.data.size > 0) recordedChunksRef.current.push(e.data);
      };
      mediaRecorder.onstop = () => {
        const blob = new Blob(recordedChunksRef.current, { type: 'video/webm' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `call-recording-${Date.now()}.webm`;
        a.click();
      };
      mediaRecorder.start();
      mediaRecorderRef.current = mediaRecorder;
      setIsRecording(true);
    }
  };

  const raiseHand = () => {
    const socket = getSocket();
    if (socket && roomId) {
      socket.emit('video:raise-hand', { roomId, username: currentUser.username });
    }
  };

  const sendChatMessage = () => {
    if (!chatMessage.trim()) return;
    const msg = {
      id: Date.now(),
      userId: currentUser.id,
      username: currentUser.username,
      message: chatMessage,
      timestamp: new Date()
    };
    setCallMessages(prev => [...prev, msg]);
    setChatMessage('');
    const socket = getSocket();
    if (socket && roomId) {
      socket.emit('chat:message', { roomId: `call_${roomId}`, message: chatMessage, username: currentUser.username });
    }
  };

  const toggleFullScreen = () => {
    if (!isFullScreen) {
      containerRef.current?.requestFullscreen();
    } else {
      document.exitFullscreen();
    }
    setIsFullScreen(!isFullScreen);
  };

  const formatDuration = (seconds) => {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  };

  return (
    <div ref={containerRef} style={{ ...styles.container, ...(fullScreen ? { height: 'calc(100vh - 60px)' } : {}) }}>
      {incomingCall && (
        <div style={styles.incomingCallOverlay}>
          <div style={styles.incomingCallCard}>
            <div style={styles.incomingCallAvatar}>
              {incomingCall.caller?.username?.[0]?.toUpperCase() || '?'}
            </div>
            <div style={styles.incomingCallName}>{incomingCall.caller?.username}</div>
            <div style={styles.incomingCallType}>
              {incomingCall.isGroup ? 'Group Call' : 'Incoming Call'}
            </div>
            <div style={styles.incomingCallActions}>
              <button onClick={acceptCall} style={styles.acceptCallBtn}>
                <FiPhone size={24} />
              </button>
              <button onClick={rejectCall} style={styles.rejectCallBtn}>
                <FiPhoneOff size={24} />
              </button>
            </div>
          </div>
        </div>
      )}

      {!inCall ? (
        <div style={styles.lobby}>
          <div style={styles.lobbyHeader}>
            <h2 style={styles.lobbyTitle}>Video Calls</h2>
          </div>
          <div style={styles.contactsList}>
            {contacts.length === 0 ? (
              <div style={styles.emptyState}>
                <div style={{ fontSize: '48px', marginBottom: '16px' }}>📹</div>
                <div style={{ fontSize: '16px', color: '#888' }}>No contacts online</div>
              </div>
            ) : (
              contacts.map(contact => (
                <div key={contact.id} style={styles.contactCard}>
                  <div style={styles.contactAvatar}>
                    {contact.avatar ? <img src={contact.avatar} alt="" style={styles.avatarImg} /> : contact.username?.[0]?.toUpperCase()}
                  </div>
                  <div style={styles.contactInfo}>
                    <div style={styles.contactName}>{contact.username}</div>
                    <div style={styles.contactStatus}>
                      {contact.is_online ? <span style={{ color: '#22c55e' }}>● Online</span> : <span style={{ color: '#666' }}>Offline</span>}
                    </div>
                  </div>
                  <button onClick={() => startCall(contact.id)} style={styles.callBtn}>
                    <FiPhone size={18} />
                  </button>
                </div>
              ))
            )}
          </div>
          <div style={styles.groupCallSection}>
            <h3 style={styles.sectionTitle}>Group Call</h3>
            <div style={styles.groupContacts}>
              {contacts.map(contact => (
                <label key={contact.id} style={styles.checkboxLabel}>
                  <input type="checkbox" checked={selectedContacts.includes(contact.id)}
                    onChange={() => setSelectedContacts(prev =>
                      prev.includes(contact.id) ? prev.filter(id => id !== contact.id) : [...prev, contact.id]
                    )} style={{ marginRight: '8px' }} />
                  {contact.username}
                </label>
              ))}
            </div>
            {selectedContacts.length > 0 && (
              <button onClick={() => startCall(selectedContacts[0])} style={styles.groupCallBtn}>
                Start Group Call ({selectedContacts.length} participants)
              </button>
            )}
          </div>
        </div>
      ) : (
        <div style={styles.callContainer}>
          <div style={styles.callHeader}>
            <div style={styles.callInfo}>
              <span style={styles.callStatus}>Connected</span>
              <span style={styles.callDuration}>{formatDuration(callDuration)}</span>
            </div>
            <div style={styles.callControls}>
              <button onClick={toggleAudio} style={{ ...styles.controlBtn, ...(isAudioMuted ? styles.controlBtnActive : {}) }} title="Toggle Mic">
                {isAudioMuted ? <FiMicOff /> : <FiMic />}
              </button>
              <button onClick={toggleVideo} style={{ ...styles.controlBtn, ...(isVideoMuted ? styles.controlBtnActive : {}) }} title="Toggle Camera">
                {isVideoMuted ? <FiVideoOff /> : <FiVideo />}
              </button>
              <button onClick={toggleScreenShare} style={{ ...styles.controlBtn, ...(isScreenSharing ? styles.controlBtnActive : {}) }} title="Share Screen">
                <FiMonitor />
              </button>
              <button onClick={raiseHand} style={styles.controlBtn} title="Raise Hand">
                <FiThumbsUp />
              </button>
              <button onClick={toggleRecording} style={{ ...styles.controlBtn, ...(isRecording ? styles.controlBtnActive : {}) }} title="Record">
                <FiCamera />
              </button>
              <button onClick={() => setShowChat(!showChat)} style={{ ...styles.controlBtn, ...(showChat ? styles.controlBtnActive : {}) }} title="Chat">
                <FiMessageSquare />
              </button>
              <button onClick={toggleFullScreen} style={styles.controlBtn} title="Fullscreen">
                {isFullScreen ? <FiMinimize2 /> : <FiMaximize2 />}
              </button>
              <button onClick={endCall} style={styles.endCallBtn} title="End Call">
                <FiPhoneOff />
              </button>
            </div>
          </div>

          <div style={styles.videoGrid}>
            <div style={styles.videoWrapper}>
              <video ref={localVideoRef} autoPlay muted playsInline style={styles.video} />
              <div style={styles.videoLabel}>You ({currentUser.username})</div>
              {isAudioMuted && <div style={styles.mutedIndicator}><FiMicOff /></div>}
            </div>
            {Object.entries(remoteStreams).map(([userId, stream]) => (
              <div key={userId} style={styles.videoWrapper}>
                <video ref={el => remoteVideoRefs.current[userId] = el}
                  autoPlay playsInline style={styles.video}
                  onLoadedMetadata={() => { if (remoteVideoRefs.current[userId]) remoteVideoRefs.current[userId].srcObject = stream; }} />
                <div style={styles.videoLabel}>
                  {participants.find(p => p.id === parseInt(userId))?.username || `User ${userId}`}
                </div>
                {raisedHands[userId] && <div style={styles.raisedHand}>✋</div>}
              </div>
            ))}
          </div>

          {Object.keys(raisedHands).length > 0 && (
            <div style={styles.raisedHandsBar}>
              {Object.values(raisedHands).map((name, idx) => (
                <span key={idx} style={styles.raisedHandText}>✋ {name} raised hand</span>
              ))}
            </div>
          )}

          {showChat && (
            <div style={styles.callChatPanel}>
              <div style={styles.callChatHeader}>
                <span>Call Chat</span>
                <button onClick={() => setShowChat(false)} style={styles.closeBtn}>×</button>
              </div>
              <div style={styles.callChatMessages}>
                {callMessages.map(msg => (
                  <div key={msg.id} style={styles.callChatMessage}>
                    <strong style={{ color: '#4f46e5' }}>{msg.username}:</strong> {msg.message}
                  </div>
                ))}
              </div>
              <div style={styles.callChatInput}>
                <input type="text" value={chatMessage} onChange={(e) => setChatMessage(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && sendChatMessage()} placeholder="Type a message..."
                  style={styles.chatInput} />
                <button onClick={sendChatMessage} style={styles.chatSendBtn}>Send</button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

const styles = {
  container: { height: '100%', background: '#0f0f23', borderRadius: '12px', overflow: 'hidden', border: '1px solid #2a2a5e', position: 'relative' },
  lobby: { padding: '24px', maxWidth: '600px', margin: '0 auto' },
  lobbyHeader: { marginBottom: '24px', textAlign: 'center' },
  lobbyTitle: { margin: 0, fontSize: '24px', color: '#fff' },
  contactsList: { display: 'flex', flexDirection: 'column', gap: '10px' },
  contactCard: { display: 'flex', alignItems: 'center', gap: '14px', padding: '14px', background: '#1a1a3e', borderRadius: '12px', border: '1px solid #2a2a5e' },
  contactAvatar: { width: '48px', height: '48px', borderRadius: '50%', background: '#4f46e5', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '20px', fontWeight: 'bold', color: '#fff', overflow: 'hidden', flexShrink: 0 },
  avatarImg: { width: '100%', height: '100%', objectFit: 'cover' },
  contactInfo: { flex: 1 },
  contactName: { fontSize: '16px', fontWeight: 600, color: '#fff' },
  contactStatus: { fontSize: '13px', marginTop: '4px' },
  callBtn: { padding: '12px', background: '#22c55e', border: 'none', borderRadius: '50%', color: '#fff', cursor: 'pointer', fontSize: '18px', width: '44px', height: '44px', display: 'flex', alignItems: 'center', justifyContent: 'center' },
  groupCallSection: { marginTop: '30px', padding: '20px', background: '#1a1a3e', borderRadius: '12px', border: '1px solid #2a2a5e' },
  sectionTitle: { color: '#fff', fontSize: '16px', marginBottom: '12px' },
  groupContacts: { display: 'flex', flexDirection: 'column', gap: '8px', marginBottom: '16px', color: '#aaa' },
  checkboxLabel: { display: 'flex', alignItems: 'center', fontSize: '14px', cursor: 'pointer' },
  groupCallBtn: { width: '100%', padding: '12px', background: '#4f46e5', border: 'none', borderRadius: '8px', color: '#fff', fontSize: '15px', fontWeight: 600, cursor: 'pointer' },
  callContainer: { display: 'flex', flexDirection: 'column', height: '100%' },
  callHeader: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 20px', background: '#1a1a3e', borderBottom: '1px solid #2a2a5e' },
  callInfo: { display: 'flex', alignItems: 'center', gap: '12px' },
  callStatus: { color: '#22c55e', fontSize: '14px', fontWeight: 600 },
  callDuration: { color: '#888', fontSize: '14px', fontVariantNumeric: 'tabular-nums' },
  callControls: { display: 'flex', alignItems: 'center', gap: '8px' },
  controlBtn: { padding: '10px', background: '#2a2a5e', border: 'none', borderRadius: '50%', color: '#fff', cursor: 'pointer', fontSize: '16px', width: '40px', height: '40px', display: 'flex', alignItems: 'center', justifyContent: 'center', transition: 'all 0.2s' },
  controlBtnActive: { background: '#4f46e5' },
  endCallBtn: { padding: '10px', background: '#dc2626', border: 'none', borderRadius: '50%', color: '#fff', cursor: 'pointer', fontSize: '16px', width: '44px', height: '44px', display: 'flex', alignItems: 'center', justifyContent: 'center' },
  videoGrid: { flex: 1, display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: '10px', padding: '12px', overflow: 'auto' },
  videoWrapper: { position: 'relative', background: '#000', borderRadius: '10px', overflow: 'hidden', aspectRatio: '16/9' },
  video: { width: '100%', height: '100%', objectFit: 'cover' },
  videoLabel: { position: 'absolute', bottom: '8px', left: '8px', background: 'rgba(0,0,0,0.6)', color: '#fff', padding: '4px 10px', borderRadius: '6px', fontSize: '12px' },
  mutedIndicator: { position: 'absolute', top: '8px', right: '8px', background: 'rgba(220,38,38,0.8)', color: '#fff', padding: '6px', borderRadius: '50%', fontSize: '14px' },
  raisedHand: { position: 'absolute', top: '8px', left: '8px', fontSize: '28px', animation: 'bounce 0.5s infinite' },
  raisedHandsBar: { padding: '8px 20px', background: '#1a1a3e', display: 'flex', gap: '16px' },
  raisedHandText: { fontSize: '13px', color: '#f59e0b' },
  callChatPanel: { position: 'absolute', right: '0', top: '60px', bottom: '0', width: '320px', background: '#151532', borderLeft: '1px solid #2a2a5e', display: 'flex', flexDirection: 'column' },
  callChatHeader: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 16px', borderBottom: '1px solid #2a2a5e', color: '#fff' },
  callChatMessages: { flex: 1, overflow: 'auto', padding: '12px', display: 'flex', flexDirection: 'column', gap: '8px' },
  callChatMessage: { fontSize: '13px', color: '#ccc', lineHeight: 1.5 },
  callChatInput: { display: 'flex', gap: '8px', padding: '12px', borderTop: '1px solid #2a2a5e' },
  chatInput: { flex: 1, padding: '8px 12px', background: '#1e1e42', border: '1px solid #2a2a5e', borderRadius: '6px', color: '#fff', outline: 'none', fontSize: '13px' },
  chatSendBtn: { padding: '8px 16px', background: '#4f46e5', border: 'none', borderRadius: '6px', color: '#fff', cursor: 'pointer', fontSize: '13px' },
  closeBtn: { background: 'none', border: 'none', color: '#888', cursor: 'pointer', fontSize: '20px' },
  incomingCallOverlay: { position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.8)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center' },
  incomingCallCard: { background: '#1e1e42', padding: '40px', borderRadius: '20px', textAlign: 'center', border: '1px solid #2a2a5e', minWidth: '300px' },
  incomingCallAvatar: { width: '80px', height: '80px', borderRadius: '50%', background: '#4f46e5', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '36px', fontWeight: 'bold', color: '#fff', margin: '0 auto 16px' },
  incomingCallName: { fontSize: '24px', fontWeight: 600, color: '#fff', marginBottom: '8px' },
  incomingCallType: { fontSize: '14px', color: '#888', marginBottom: '24px' },
  incomingCallActions: { display: 'flex', justifyContent: 'center', gap: '20px' },
  acceptCallBtn: { padding: '16px', background: '#22c55e', border: 'none', borderRadius: '50%', color: '#fff', cursor: 'pointer', width: '64px', height: '64px', display: 'flex', alignItems: 'center', justifyContent: 'center' },
  rejectCallBtn: { padding: '16px', background: '#dc2626', border: 'none', borderRadius: '50%', color: '#fff', cursor: 'pointer', width: '64px', height: '64px', display: 'flex', alignItems: 'center', justifyContent: 'center' },
  emptyState: { textAlign: 'center', padding: '60px 20px' },
};
