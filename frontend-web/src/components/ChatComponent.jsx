import React, { useState, useEffect, useRef, useCallback } from 'react';
import { collection, query, where, orderBy, onSnapshot, addDoc, updateDoc, deleteDoc, doc, getDocs, getDoc, setDoc, serverTimestamp, limit } from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { auth, db, storage } from '../App';
import { FiSend, FiPaperclip, FiImage, FiMic, FiSmile, FiTrash2, FiSearch, FiUsers, FiArrowLeft, FiChevronDown, FiCheck, FiCheckCircle, FiCornerUpRight, FiX, FiMoreVertical } from 'react-icons/fi';

const EMOJI_LIST = ['😀','😂','🤣','😍','🥰','😎','🤔','🙄','😴','🥳','😢','😤','🔥','💯','❤️','💔','👍','👎','👏','🙏','🎉','🚀','💪','⭐','🌈','🍕','🎵','📷','💻','🎮'];

export default function ChatComponent({ fullScreen = false }) {
  const [conversations, setConversations] = useState([]);
  const [activeRoom, setActiveRoom] = useState(null);
  const [messages, setMessages] = useState([]);
  const [newMessage, setNewMessage] = useState('');
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [searching, setSearching] = useState(false);
  const [users, setUsers] = useState([]);
  const [showEmoji, setShowEmoji] = useState(false);
  const [replyTo, setReplyTo] = useState(null);
  const [forwarding, setForwarding] = useState(null);
  const [showUserList, setShowUserList] = useState(false);
  const [userSearch, setUserSearch] = useState('');
  const [file, setFile] = useState(null);
  const [previewUrl, setPreviewUrl] = useState(null);
  const [showSidebar, setShowSidebar] = useState(true);
  const [typingUsers, setTypingUsers] = useState({});
  const [contextMenu, setContextMenu] = useState(null);

  const messagesEndRef = useRef(null);
  const fileInputRef = useRef(null);
  const messageInputRef = useRef(null);
  const chatContainerRef = useRef(null);

  const currentUser = auth.currentUser;
  const userId = currentUser?.uid;

  const scrollToBottom = () => {
    setTimeout(() => messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' }), 100);
  };

  useEffect(() => {
    if (!userId) return;
    const q = query(collection(db, 'conversations'), where('participants', 'array-contains', userId), orderBy('lastMessageAt', 'desc'));
    const unsub = onSnapshot(q, (snapshot) => {
      const convs = snapshot.docs.map(d => ({ id: d.id, ...d.data() }));
      setConversations(convs);
      setLoading(false);
    });
    return unsub;
  }, [userId]);

  useEffect(() => {
    const fetchUsers = async () => {
      const snap = await getDocs(collection(db, 'users'));
      setUsers(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    };
    fetchUsers();
  }, []);

  useEffect(() => {
    if (!activeRoom) { setMessages([]); return; }
    const q = query(collection(db, 'messages'), where('roomId', '==', activeRoom), orderBy('createdAt', 'asc'));
    const unsub = onSnapshot(q, (snapshot) => {
      const msgs = snapshot.docs.map(d => ({ id: d.id, ...d.data() }));
      setMessages(msgs);
      scrollToBottom();
    });
    return unsub;
  }, [activeRoom]);

  useEffect(() => { scrollToBottom(); }, [messages]);

  useEffect(() => {
    if (!activeRoom || !searchQuery) return;
    const timer = setTimeout(async () => {
      setSearching(true);
      try {
        const q = query(collection(db, 'messages'), where('roomId', '==', activeRoom), where('text', '>=', searchQuery), where('text', '<=', searchQuery + '\uf8ff'));
        const snap = await getDocs(q);
        setSearchResults(snap.docs.map(d => ({ id: d.id, ...d.data() })));
      } catch (e) { setSearchResults([]); }
      setSearching(false);
    }, 500);
    return () => clearTimeout(timer);
  }, [searchQuery, activeRoom]);

  const createRoom = async (targetUserId) => {
    const combinedId = [userId, targetUserId].sort().join('_');
    const roomRef = doc(db, 'conversations', combinedId);
    const roomSnap = await getDoc(roomRef);
    if (!roomSnap.exists()) {
      await setDoc(roomRef, {
        id: combinedId,
        participants: [userId, targetUserId],
        createdAt: serverTimestamp(),
        lastMessageAt: serverTimestamp(),
        lastMessage: '',
        lastSender: '',
      });
    }
    setActiveRoom(combinedId);
    setShowUserList(false);
  };

  const sendMessage = async () => {
    if ((!newMessage.trim() && !file) || sending) return;
    setSending(true);
    try {
      let fileUrl = '';
      let fileType = '';
      if (file) {
        const storageRef = ref(storage, `chat/${userId}/${Date.now()}_${file.name}`);
        await uploadBytes(storageRef, file);
        fileUrl = await getDownloadURL(storageRef);
        fileType = file.type;
        setFile(null);
        setPreviewUrl(null);
      }
      const msg = {
        roomId: activeRoom,
        senderId: userId,
        senderName: currentUser.displayName || currentUser.email,
        text: newMessage.trim(),
        fileUrl,
        fileType,
        replyTo: replyTo ? { id: replyTo.id, text: replyTo.text, sender: replyTo.sender } : null,
        createdAt: serverTimestamp(),
        isRead: false,
      };
      await addDoc(collection(db, 'messages'), msg);
      await updateDoc(doc(db, 'conversations', activeRoom), {
        lastMessage: newMessage.trim() || '[File]',
        lastSender: userId,
        lastMessageAt: serverTimestamp(),
      });
      setNewMessage('');
      setReplyTo(null);
    } catch (e) { console.error(e); }
    setSending(false);
  };

  const deleteMessage = async (msgId) => {
    await deleteDoc(doc(db, 'messages', msgId));
  };

  const editMessage = async (msgId, newText) => {
    await updateDoc(doc(db, 'messages', msgId), { text: newText, edited: true });
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage(); }
  };

  const handleFileSelect = (e) => {
    const f = e.target.files[0];
    if (f) {
      setFile(f);
      if (f.type.startsWith('image/')) setPreviewUrl(URL.createObjectURL(f));
      else setPreviewUrl(null);
    }
  };

  const getOtherUser = (room) => {
    const otherId = room.participants?.find(p => p !== userId);
    return users.find(u => u.id === otherId) || { displayName: 'Unknown', email: '' };
  };

  const formatTime = (ts) => {
    if (!ts) return '';
    const d = ts.toDate ? ts.toDate() : new Date(ts);
    return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  };

  const formatDate = (ts) => {
    if (!ts) return '';
    const d = ts.toDate ? ts.toDate() : new Date(ts);
    const today = new Date();
    if (d.toDateString() === today.toDateString()) return formatTime(ts);
    return d.toLocaleDateString([], { month: 'short', day: 'numeric' });
  };

  const groupMessages = (msgs) => {
    const groups = [];
    let current = [];
    for (let i = 0; i < msgs.length; i++) {
      const m = msgs[i];
      const prev = msgs[i - 1];
      if (!prev || m.senderId !== prev.senderId || m.createdAt?.toDate() - prev.createdAt?.toDate() > 300000 || m.roomId !== prev.roomId) {
        if (current.length) { groups.push(current); }
        current = [m];
      } else current.push(m);
    }
    if (current.length) groups.push(current);
    return groups;
  };

  return (
    <div style={{ display: 'flex', height: fullScreen ? '100vh' : 'calc(100vh - 80px)', background: '#0f0f23', borderRadius: '12px', overflow: 'hidden', border: '1px solid #2a2a5e' }}>
      <div style={{ width: showSidebar ? '320px' : '0', overflow: 'hidden', borderRight: '1px solid #2a2a5e', display: 'flex', flexDirection: 'column', background: '#151532', transition: 'width 0.3s' }}>
        <div style={{ padding: '16px', borderBottom: '1px solid #2a2a5e' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '12px' }}>
            <h3 style={{ margin: 0, color: '#fff', fontSize: '18px' }}>Messages</h3>
            <button onClick={() => setShowUserList(true)} style={styles.iconBtn}><FiUsers size={18} /></button>
          </div>
          <div style={styles.searchBox}>
            <FiSearch size={14} style={{ color: '#666' }} />
            <input style={styles.searchInput} placeholder="Search messages..." value={searchQuery} onChange={e => setSearchQuery(e.target.value)} />
          </div>
        </div>
        <div style={{ flex: 1, overflow: 'auto' }}>
          {loading && <div style={{ color: '#666', textAlign: 'center', padding: '30px' }}>Loading...</div>}
          {!loading && conversations.length === 0 && <div style={{ color: '#666', textAlign: 'center', padding: '30px' }}>No conversations yet. Click + to start.</div>}
          {conversations.map(room => {
            const other = getOtherUser(room);
            const isActive = activeRoom === room.id;
            return (
              <div key={room.id} onClick={() => setActiveRoom(room.id)} style={{ ...styles.convItem, ...(isActive ? styles.convItemActive : {}) }}>
                <div style={styles.avatar}>{other.displayName?.[0]?.toUpperCase() || '?'}</div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span style={{ color: '#fff', fontWeight: 500 }}>{other.displayName || other.email}</span>
                    <span style={{ color: '#666', fontSize: '11px' }}>{formatDate(room.lastMessageAt)}</span>
                  </div>
                  <div style={{ color: '#888', fontSize: '13px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {room.lastSender === userId && 'You: '}{room.lastMessage || 'No messages'}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <div style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
        {!activeRoom ? (
          <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#666' }}>
            <div style={{ textAlign: 'center' }}><FiUsers size={48} style={{ marginBottom: '16px', opacity: 0.3 }} /><p>Select a conversation</p></div>
          </div>
        ) : (
          <>
            <div style={{ padding: '12px 16px', borderBottom: '1px solid #2a2a5e', display: 'flex', alignItems: 'center', background: '#1a1a3e' }}>
              <button onClick={() => setShowSidebar(!showSidebar)} style={{ ...styles.iconBtn, marginRight: '8px' }}><FiArrowLeft size={18} /></button>
              <div style={styles.avatar}>{getOtherUser(conversations.find(c => c.id === activeRoom))?.displayName?.[0]?.toUpperCase() || '?'}</div>
              <div style={{ marginLeft: '12px' }}>
                <div style={{ color: '#fff', fontWeight: 500 }}>{getOtherUser(conversations.find(c => c.id === activeRoom))?.displayName || 'User'}</div>
                <div style={{ color: '#4ade80', fontSize: '12px' }}>Online</div>
              </div>
            </div>

            <div ref={chatContainerRef} style={{ flex: 1, overflow: 'auto', padding: '16px', display: 'flex', flexDirection: 'column', gap: '4px' }}>
              {groupMessages(messages).map((group, gi) => (
                <div key={gi} style={{ display: 'flex', flexDirection: 'column', alignItems: group[0].senderId === userId ? 'flex-end' : 'flex-start' }}>
                  {group.map((msg, mi) => (
                    <div key={msg.id || mi} style={{ maxWidth: '70%', marginBottom: '2px' }}
                      onContextMenu={(e) => { e.preventDefault(); setContextMenu({ id: msg.id, x: e.clientX, y: e.clientY, msg }); }}
                    >
                      <div style={{ ...styles.messageBubble, ...(msg.senderId === userId ? styles.myMessage : styles.theirMessage) }}>
                        {msg.replyTo && <div style={{ padding: '6px 10px', marginBottom: '4px', borderRadius: '6px', background: 'rgba(255,255,255,0.05)', borderLeft: '2px solid #4f46e5', fontSize: '12px', color: '#888' }}><strong>Replying to</strong><br />{msg.replyTo.text}</div>}
                        {msg.fileUrl && (
                          <div style={{ margin: '4px 0' }}>
                            {msg.fileType?.startsWith('image/') ? <img src={msg.fileUrl} alt="" style={{ maxWidth: '200px', borderRadius: '8px', cursor: 'pointer' }} onClick={() => window.open(msg.fileUrl)} />
                              : <a href={msg.fileUrl} target="_blank" rel="noreferrer" style={{ color: '#60a5fa' }}>📎 View file</a>}
                          </div>
                        )}
                        {msg.text && <div style={{ wordBreak: 'break-word' }}>{msg.text}</div>}
                        {msg.edited && <span style={{ fontSize: '11px', color: '#666', marginLeft: '6px' }}>(edited)</span>}
                        <div style={{ fontSize: '10px', color: '#888', marginTop: '2px', textAlign: 'right' }}>
                          {msg.createdAt?.toDate?.()?.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                          {msg.senderId === userId && <FiCheckCircle size={12} style={{ marginLeft: '4px', color: msg.isRead ? '#60a5fa' : '#666' }} />}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              ))}
              <div ref={messagesEndRef} />
            </div>

            {replyTo && (
              <div style={{ padding: '8px 16px', background: '#1a1a3e', borderTop: '1px solid #2a2a5e', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <div style={{ fontSize: '13px', color: '#888' }}>Replying to <strong style={{ color: '#4f46e5' }}>{replyTo.sender}</strong>: {replyTo.text?.substring(0, 50)}</div>
                <button onClick={() => setReplyTo(null)} style={styles.iconBtn}><FiX size={16} /></button>
              </div>
            )}

            {previewUrl && file && (
              <div style={{ padding: '8px 16px', background: '#1a1a3e', borderTop: '1px solid #2a2a5e', display: 'flex', alignItems: 'center', gap: '10px' }}>
                {file.type.startsWith('image/') ? <img src={previewUrl} alt="" style={{ height: '40px', borderRadius: '4px' }} /> : <span style={{ color: '#888' }}>📎 {file.name}</span>}
                <button onClick={() => { setFile(null); setPreviewUrl(null); }} style={styles.iconBtn}><FiX size={16} /></button>
              </div>
            )}

            <div style={{ padding: '12px 16px', borderTop: '1px solid #2a2a5e', display: 'flex', alignItems: 'flex-end', gap: '8px', background: '#151532' }}>
              <input type="file" ref={fileInputRef} style={{ display: 'none' }} onChange={handleFileSelect} multiple />
              <button onClick={() => fileInputRef.current?.click()} style={styles.iconBtn}><FiPaperclip size={18} /></button>
              <button onClick={() => fileInputRef.current?.click()} style={styles.iconBtn}><FiImage size={18} /></button>
              <button onClick={() => setShowEmoji(!showEmoji)} style={styles.iconBtn}><FiSmile size={18} /></button>
              <div style={{ flex: 1, position: 'relative' }}>
                <textarea value={newMessage} onChange={e => setNewMessage(e.target.value)} onKeyDown={handleKeyDown} placeholder="Type a message..." style={styles.messageInput} rows={1} ref={messageInputRef} />
                {showEmoji && (
                  <div style={{ position: 'absolute', bottom: '100%', left: 0, background: '#1a1a3e', border: '1px solid #2a2a5e', borderRadius: '8px', padding: '8px', display: 'flex', flexWrap: 'wrap', width: '240px', gap: '4px', zIndex: 10 }}>
                    {EMOJI_LIST.map(emoji => <button key={emoji} onClick={() => { setNewMessage(p => p + emoji); setShowEmoji(false); }} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '20px', padding: '4px' }}>{emoji}</button>)}
                  </div>
                )}
              </div>
              <button onClick={sendMessage} disabled={sending || (!newMessage.trim() && !file)} style={{ ...styles.sendBtn, opacity: sending || (!newMessage.trim() && !file) ? 0.5 : 1 }}><FiSend size={18} /></button>
            </div>
          </>
        )}
      </div>

      {showUserList && (
        <div style={styles.overlay} onClick={() => setShowUserList(false)}>
          <div style={styles.modal} onClick={e => e.stopPropagation()}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
              <h3 style={{ margin: 0, color: '#fff' }}>New Conversation</h3>
              <button onClick={() => setShowUserList(false)} style={styles.iconBtn}><FiX size={18} /></button>
            </div>
            <input style={{ ...styles.searchInput, width: '100%', marginBottom: '12px' }} placeholder="Search users..." value={userSearch} onChange={e => setUserSearch(e.target.value)} />
            <div style={{ maxHeight: '300px', overflow: 'auto' }}>
              {users.filter(u => u.id !== userId && (userSearch === '' || (u.displayName || u.email)?.toLowerCase().includes(userSearch.toLowerCase()))).map(u => (
                <div key={u.id} onClick={() => createRoom(u.id)} style={{ ...styles.convItem, padding: '10px 12px' }}>
                  <div style={styles.avatar}>{u.displayName?.[0]?.toUpperCase() || '?'}</div>
                  <span style={{ color: '#fff' }}>{u.displayName || u.email}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

const styles = {
  iconBtn: { background: 'none', border: 'none', color: '#aaa', cursor: 'pointer', padding: '6px', borderRadius: '6px', display: 'flex' },
  searchBox: { display: 'flex', alignItems: 'center', gap: '8px', padding: '8px 12px', background: '#0f0f23', borderRadius: '8px', border: '1px solid #2a2a5e' },
  searchInput: { background: 'none', border: 'none', color: '#fff', fontSize: '13px', outline: 'none', width: '100%' },
  convItem: { display: 'flex', alignItems: 'center', gap: '12px', padding: '14px 16px', cursor: 'pointer', transition: 'background 0.2s', borderBottom: '1px solid rgba(42,42,94,0.3)' },
  convItemActive: { background: 'rgba(79,70,229,0.15)' },
  avatar: { width: '40px', height: '40px', borderRadius: '50%', background: 'linear-gradient(135deg, #4f46e5, #6366f1)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontWeight: 'bold', fontSize: '16px', flexShrink: 0 },
  messageBubble: { padding: '10px 14px', borderRadius: '16px', fontSize: '14px', lineHeight: '1.4', boxShadow: '0 1px 4px rgba(0,0,0,0.2)' },
  myMessage: { background: '#4f46e5', color: '#fff', borderBottomRightRadius: '4px' },
  theirMessage: { background: '#1e1e42', color: '#e0e0e0', borderBottomLeftRadius: '4px' },
  messageInput: { width: '100%', padding: '10px 16px', background: '#0f0f23', border: '1px solid #2a2a5e', borderRadius: '20px', color: '#fff', fontSize: '14px', outline: 'none', resize: 'none', maxHeight: '120px' },
  sendBtn: { padding: '10px 14px', background: '#4f46e5', color: '#fff', border: 'none', borderRadius: '50%', cursor: 'pointer', display: 'flex' },
  overlay: { position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 },
  modal: { background: '#1e1e42', padding: '20px', borderRadius: '16px', width: '90%', maxWidth: '400px', border: '1px solid #2a2a5e' },
};
