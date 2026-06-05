import React, { useState, useEffect, useRef, useCallback } from 'react';
import axios from 'axios';
import { getSocket } from '../App';
import { format } from 'date-fns';
import { FiSend, FiPaperclip, FiImage, FiMic, FiSmile, FiTrash2, FiSearch, FiUsers, FiArrowLeft, FiChevronDown, FiCheck, FiCheckCircle, FiCornerUpRight, FiX, FiMoreVertical } from 'react-icons/fi';

const API_URL = process.env.REACT_APP_API_URL || 'http://localhost:3000';

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

  const currentUser = JSON.parse(localStorage.getItem('user') || '{}');

  useEffect(() => {
    fetchConversations();
    fetchUsers();
    const socket = getSocket();
    if (socket) {
      socket.on('chat:message', handleNewMessage);
      socket.on('chat:message-deleted', handleMessageDeleted);
      socket.on('chat:message-edited', handleMessageEdited);
      socket.on('chat:typing', handleTyping);
      socket.on('chat:read', handleReadReceipt);
      socket.on('chat:new-room', (room) => {
        setConversations(prev => [room, ...prev]);
      });
    }
    return () => {
      const s = getSocket();
      if (s) {
        s.off('chat:message', handleNewMessage);
        s.off('chat:message-deleted', handleMessageDeleted);
        s.off('chat:message-edited', handleMessageEdited);
        s.off('chat:typing', handleTyping);
        s.off('chat:read', handleReadReceipt);
        s.off('chat:new-room');
      }
    };
  }, []);

  useEffect(() => {
    if (activeRoom) {
      fetchMessages(activeRoom.room_id || activeRoom.id);
      setShowSidebar(false);
    }
  }, [activeRoom]);

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  useEffect(() => {
    if (searchQuery) {
      const timer = setTimeout(() => performSearch(searchQuery), 500);
      return () => clearTimeout(timer);
    } else {
      setSearchResults([]);
      setSearching(false);
    }
  }, [searchQuery]);

  const scrollToBottom = () => {
    setTimeout(() => {
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, 100);
  };

  const fetchConversations = async () => {
    try {
      const res = await axios.get(`${API_URL}/api/chat/conversations`);
      setConversations(res.data);
    } catch (err) {
      console.error('Failed to fetch conversations:', err);
    } finally {
      setLoading(false);
    }
  };

  const fetchMessages = async (roomId) => {
    try {
      const res = await axios.get(`${API_URL}/api/chat/messages/${roomId}?limit=100`);
      setMessages(res.data);
      const socket = getSocket();
      if (socket) {
        socket.emit('chat:join', roomId);
        socket.emit('chat:read', { roomId });
      }
    } catch (err) {
      console.error('Failed to fetch messages:', err);
    }
  };

  const fetchUsers = async () => {
    try {
      const res = await axios.get(`${API_URL}/api/auth/users?limit=100`);
      setUsers(res.data.users || []);
    } catch (err) {
      console.error('Failed to fetch users:', err);
    }
  };

  const performSearch = async (query) => {
    if (!query.trim()) return;
    setSearching(true);
    try {
      const res = await axios.get(`${API_URL}/api/chat/search?query=${encodeURIComponent(query)}`);
      setSearchResults(res.data);
    } catch (err) {
      console.error('Search failed:', err);
    } finally {
      setSearching(false);
    }
  };

  const handleNewMessage = (message) => {
    if (activeRoom && (message.room_id === (activeRoom.room_id || activeRoom.id?.toString()))) {
      setMessages(prev => [...prev, message]);
    } else {
      fetchConversations();
    }
    scrollToBottom();
  };

  const handleMessageDeleted = ({ messageId }) => {
    setMessages(prev => prev.filter(m => m.id !== messageId));
  };

  const handleMessageEdited = ({ messageId, message }) => {
    setMessages(prev => prev.map(m => m.id === messageId ? { ...m, message } : m));
  };

  const handleTyping = ({ userId, isTyping, username, roomId }) => {
    if (activeRoom && (roomId === (activeRoom.room_id || activeRoom.id?.toString()))) {
      setTypingUsers(prev => {
        if (isTyping && userId !== currentUser.id) {
          return { ...prev, [userId]: username };
        } else {
          const next = { ...prev };
          delete next[userId];
          return next;
        }
      });
    }
  };

  const handleReadReceipt = ({ roomId, userId }) => {
    if (activeRoom && (roomId === (activeRoom.room_id || activeRoom.id?.toString()))) {
      setMessages(prev => prev.map(m => m.sender_id !== userId ? { ...m, is_read: true } : m));
    }
  };

  const sendMessage = async () => {
    if ((!newMessage.trim() && !file) || sending) return;

    const formData = new FormData();
    formData.append('roomId', activeRoom.room_id || activeRoom.id);
    if (newMessage.trim()) formData.append('message', newMessage.trim());
    if (replyTo) formData.append('replyTo', replyTo.id);
    if (file) {
      formData.append('file', file);
      formData.append('receiverId', activeRoom.receiver_id || '');
    }

    setSending(true);
    try {
      await axios.post(`${API_URL}/api/chat/messages`, formData, {
        headers: { 'Content-Type': 'multipart/form-data' }
      });
      setNewMessage('');
      setFile(null);
      setPreviewUrl(null);
      setReplyTo(null);
      messageInputRef.current?.focus();
    } catch (err) {
      console.error('Failed to send message:', err);
    } finally {
      setSending(false);
    }
  };

  const handleKeyPress = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  const handleTypingIndicator = useCallback((isTyping) => {
    const socket = getSocket();
    if (socket && activeRoom) {
      socket.emit('chat:typing', {
        roomId: activeRoom.room_id || activeRoom.id,
        isTyping,
        username: currentUser.username
      });
    }
  }, [activeRoom, currentUser]);

  const selectFile = (e) => {
    const selected = e.target.files[0];
    if (selected) {
      setFile(selected);
      if (selected.type.startsWith('image/')) {
        setPreviewUrl(URL.createObjectURL(selected));
      } else {
        setPreviewUrl(null);
      }
    }
  };

  const removeFile = () => {
    setFile(null);
    setPreviewUrl(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const deleteMessage = async (messageId) => {
    try {
      await axios.delete(`${API_URL}/api/chat/messages/${messageId}`);
      setMessages(prev => prev.filter(m => m.id !== messageId));
    } catch (err) {
      console.error('Failed to delete message:', err);
    }
  };

  const startNewChat = async (userId, username) => {
    setShowUserList(false);
    const roomId = [currentUser.id, userId].sort().join('-');
    setActiveRoom({ room_id: roomId, chat_name: username, receiver_id: userId });
    setMessages([]);
  };

  const insertEmoji = (emoji) => {
    setNewMessage(prev => prev + emoji);
    setShowEmoji(false);
    messageInputRef.current?.focus();
  };

  const formatTime = (dateStr) => {
    const date = new Date(dateStr);
    const now = new Date();
    const diff = now - date;
    if (diff < 86400000) return format(date, 'HH:mm');
    if (diff < 172800000) return 'Yesterday ' + format(date, 'HH:mm');
    return format(date, 'MMM d, HH:mm');
  };

  const getInitials = (name) => name?.charAt(0).toUpperCase() || '?';

  const renderMessageContent = (msg) => {
    const isReply = msg.reply_to && messages.find(m => m.id === msg.reply_to);
    return (
      <div>
        {isReply && (
          <div style={styles.replyPreview}>
            <span style={styles.replyLabel}>Replying to {isReply.username}</span>
            <span style={styles.replyText}>{isReply.message?.substring(0, 50)}</span>
          </div>
        )}
        {msg.forwarded_from && (
          <div style={styles.forwardLabel}>Forwarded</div>
        )}
        {msg.message && <div style={styles.messageText}>{msg.message}</div>}
        {msg.file_url && (
          <div style={styles.fileAttachment}>
            {msg.file_type?.startsWith('image/') ? (
              <img src={msg.file_url} alt="Shared image" style={styles.sharedImage}
                onClick={() => window.open(msg.file_url, '_blank')} />
            ) : msg.file_type?.startsWith('video/') ? (
              <video controls style={styles.sharedVideo} src={msg.file_url} />
            ) : msg.file_type?.startsWith('audio/') ? (
              <audio controls style={styles.sharedAudio} src={msg.file_url} />
            ) : (
              <a href={msg.file_url} target="_blank" rel="noopener noreferrer" style={styles.fileLink}>
                {msg.file_url.split('/').pop()}
              </a>
            )}
          </div>
        )}
      </div>
    );
  };

  const getOtherParticipant = (conv) => {
    if (conv.is_group) return null;
    const otherId = conv.sender_id === currentUser.id ? conv.receiver_id : conv.sender_id;
    return { id: otherId, username: conv.chat_name, avatar: conv.chat_avatar };
  };

  if (loading) {
    return (
      <div style={styles.loadingContainer}>
        <div className="spinner" style={{ fontSize: '18px', color: '#4f46e5' }}>Loading conversations...</div>
      </div>
    );
  }

  return (
    <div style={{ ...styles.container, ...(fullScreen ? { height: 'calc(100vh - 60px)' } : {}) }}>
      {(showSidebar || !activeRoom) && (
        <div style={{ ...styles.sidebar, ...(!showSidebar && activeRoom ? styles.sidebarHidden : {}) }}>
          <div style={styles.sidebarHeader}>
            <h3 style={styles.sidebarTitle}>
              <FiUsers style={{ marginRight: '8px' }} /> Chats
            </h3>
            <button onClick={() => setShowUserList(!showUserList)} style={styles.iconBtn}>
              <FiUsers />
            </button>
          </div>

          <div style={styles.searchContainer}>
            <FiSearch style={styles.searchIcon} />
            <input type="text" placeholder="Search messages..." value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)} style={styles.searchInput} />
          </div>

          {showUserList && (
            <div style={styles.userListPanel}>
              <div style={styles.userListHeader}>
                <span>Start New Chat</span>
                <button onClick={() => setShowUserList(false)} style={styles.closeBtn}><FiX /></button>
              </div>
              <input type="text" placeholder="Search users..." value={userSearch}
                onChange={(e) => setUserSearch(e.target.value)} style={styles.userSearchInput} />
              <div style={styles.userList}>
                {users.filter(u => u.username.toLowerCase().includes(userSearch.toLowerCase())).map(u => (
                  <div key={u.id} onClick={() => startNewChat(u.id, u.username)} style={styles.userListItem}>
                    <div style={styles.userAvatar}>
                      {u.avatar ? <img src={u.avatar} alt="" style={styles.avatarImg} /> : getInitials(u.username)}
                    </div>
                    <div>
                      <div style={styles.userListItemName}>{u.username}</div>
                      <div style={styles.userListItemStatus}>{u.is_online ? 'Online' : 'Offline'}</div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {searchQuery && (
            <div style={styles.searchResults}>
              {searching ? (
                <div style={styles.searchingText}>Searching...</div>
              ) : searchResults.length > 0 ? (
                searchResults.map(msg => (
                  <div key={msg.id} style={styles.searchResultItem} onClick={() => {
                    setSearchQuery('');
                    setSearchResults([]);
                    setActiveRoom({ room_id: msg.room_id });
                    fetchMessages(msg.room_id);
                  }}>
                    <div style={styles.searchResultSender}>{msg.username}</div>
                    <div style={styles.searchResultText}>{msg.message}</div>
                    <div style={styles.searchResultTime}>{formatTime(msg.created_at)}</div>
                  </div>
                ))
              ) : (
                <div style={styles.noResults}>No messages found</div>
              )}
            </div>
          )}

          {!searchQuery && (
            <div style={styles.conversationList}>
              {conversations.length === 0 ? (
                <div style={styles.emptyState}>
                  <div style={styles.emptyIcon}>💬</div>
                  <div>No conversations yet</div>
                  <button onClick={() => setShowUserList(true)} style={styles.emptyButton}>
                    Start a chat
                  </button>
                </div>
              ) : (
                conversations.map((conv, idx) => (
                  <div key={conv.room_id || idx} onClick={() => {
                    const other = getOtherParticipant(conv);
                    setActiveRoom({
                      room_id: conv.room_id,
                      chat_name: other?.username || conv.chat_name,
                      receiver_id: other?.id,
                      avatar: other?.avatar || conv.chat_avatar
                    });
                  }}
                    style={{ ...styles.conversationItem, ...(activeRoom?.room_id === conv.room_id ? styles.conversationItemActive : {}) }}>
                    <div style={styles.convAvatar}>
                      {conv.chat_avatar ? <img src={conv.chat_avatar} alt="" style={styles.avatarImg} /> : getInitials(conv.chat_name)}
                    </div>
                    <div style={styles.convInfo}>
                      <div style={styles.convName}>{conv.chat_name}</div>
                      <div style={styles.convPreview}>{conv.last_message || 'Sent a file'}</div>
                    </div>
                    <div style={styles.convMeta}>
                      <div style={styles.convTime}>{formatTime(conv.last_message_at)}</div>
                      {conv.unread_count > 0 && (
                        <div style={styles.unreadBadge}>{conv.unread_count}</div>
                      )}
                    </div>
                  </div>
                ))
              )}
            </div>
          )}
        </div>
      )}

      <div style={{ ...styles.chatArea, ...(!showSidebar && !activeRoom ? styles.chatAreaEmpty : {}) }}>
        {activeRoom ? (
          <>
            <div style={styles.chatHeader}>
              <button onClick={() => { setActiveRoom(null); setShowSidebar(true); setMessages([]); }} style={styles.backBtn}>
                <FiArrowLeft />
              </button>
              <div style={styles.chatHeaderInfo}>
                <div style={styles.chatHeaderName}>{activeRoom.chat_name}</div>
                {Object.keys(typingUsers).length > 0 && (
                  <div style={styles.typingIndicator}>
                    {Object.values(typingUsers).join(', ')} typing...
                  </div>
                )}
              </div>
              <button onClick={() => setShowSidebar(true)} style={styles.iconBtn}>
                <FiUsers />
              </button>
            </div>

            <div style={styles.messagesContainer} ref={chatContainerRef}>
              {messages.length === 0 ? (
                <div style={styles.emptyChat}>
                  <div style={styles.emptyChatIcon}>👋</div>
                  <div style={styles.emptyChatText}>Say hello to start chatting!</div>
                </div>
              ) : (
                messages.map((msg, idx) => {
                  const isMine = msg.sender_id === currentUser.id;
                  const showDate = idx === 0 || new Date(msg.created_at).toDateString() !== new Date(messages[idx - 1]?.created_at).toDateString();
                  return (
                    <div key={msg.id}>
                      {showDate && (
                        <div style={styles.dateSeparator}>
                          {format(new Date(msg.created_at), 'MMMM d, yyyy')}
                        </div>
                      )}
                      <div style={{ ...styles.messageRow, ...(isMine ? styles.messageRowMine : {}) }}>
                        {!isMine && (
                          <div style={styles.messageAvatar}>
                            {getInitials(msg.username)}
                          </div>
                        )}
                        <div style={{ ...styles.messageBubble, ...(isMine ? styles.messageBubbleMine : styles.messageBubbleOther) }}>
                          {!isMine && <div style={styles.messageSender}>{msg.username}</div>}
                          {renderMessageContent(msg)}
                          <div style={styles.messageFooter}>
                            <span style={styles.messageTime}>{formatTime(msg.created_at)}</span>
                            {isMine && (
                              <span style={styles.readStatus}>
                                {msg.is_read ? <FiCheckCircle color="#4f46e5" /> : <FiCheck />}
                              </span>
                            )}
                          </div>
                        </div>
                        <div style={styles.messageActions}>
                          <button onClick={() => setReplyTo(msg)} style={styles.actionBtn} title="Reply">
                            <FiCornerUpRight size={12} />
                          </button>
                          {isMine && (
                            <button onClick={() => deleteMessage(msg.id)} style={styles.actionBtn} title="Delete">
                              <FiTrash2 size={12} />
                            </button>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })
              )}
              <div ref={messagesEndRef} />
            </div>

            {replyTo && (
              <div style={styles.replyBar}>
                <div style={styles.replyBarInfo}>
                  <FiCornerUpRight size={14} />
                  <span>Replying to <strong>{replyTo.username}</strong></span>
                  <span style={styles.replyBarText}>{replyTo.message?.substring(0, 40)}</span>
                </div>
                <button onClick={() => setReplyTo(null)} style={styles.closeBtn}><FiX /></button>
              </div>
            )}

            {file && (
              <div style={styles.filePreviewBar}>
                {previewUrl ? (
                  <img src={previewUrl} alt="Preview" style={styles.previewImage} />
                ) : (
                  <div style={styles.filePreviewInfo}>{file.name}</div>
                )}
                <button onClick={removeFile} style={styles.closeBtn}><FiX /></button>
              </div>
            )}

            <div style={styles.inputArea}>
              <input type="file" ref={fileInputRef} onChange={selectFile} accept="image/*,video/*,audio/*,.pdf,.zip"
                style={{ display: 'none' }} />
              <button onClick={() => fileInputRef.current?.click()} style={styles.attachBtn} title="Attach file">
                <FiPaperclip />
              </button>
              <button onClick={() => setShowEmoji(!showEmoji)} style={styles.emojiBtn} title="Emoji">
                <FiSmile />
              </button>
              {showEmoji && (
                <div style={styles.emojiPicker}>
                  {EMOJI_LIST.map(emoji => (
                    <span key={emoji} onClick={() => insertEmoji(emoji)} style={styles.emojiItem}>{emoji}</span>
                  ))}
                </div>
              )}
              <textarea value={newMessage} onChange={(e) => {
                setNewMessage(e.target.value);
                handleTypingIndicator(e.target.value.length > 0);
              }} onKeyDown={handleKeyPress} placeholder="Type a message..."
                rows={1} ref={messageInputRef} style={styles.messageInput}
                onBlur={() => handleTypingIndicator(false)} />
              <button onClick={sendMessage} disabled={sending || (!newMessage.trim() && !file)} style={styles.sendBtn}>
                <FiSend />
              </button>
            </div>
          </>
        ) : (
          <div style={styles.noChatSelected}>
            <div style={styles.noChatIcon}>💬</div>
            <div style={styles.noChatTitle}>Select a conversation</div>
            <div style={styles.noChatSubtitle}>Choose a chat from the sidebar or start a new one</div>
          </div>
        )}
      </div>
    </div>
  );
}

const styles = {
  container: { display: 'flex', height: '100%', background: '#0f0f23', borderRadius: '12px', overflow: 'hidden', border: '1px solid #2a2a5e' },
  sidebar: { width: '340px', minWidth: '340px', display: 'flex', flexDirection: 'column', borderRight: '1px solid #2a2a5e', background: '#151532' },
  sidebarHidden: { display: 'none' },
  sidebarHeader: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '16px', borderBottom: '1px solid #2a2a5e' },
  sidebarTitle: { margin: 0, fontSize: '16px', color: '#fff', display: 'flex', alignItems: 'center' },
  iconBtn: { background: 'none', border: 'none', color: '#888', cursor: 'pointer', padding: '6px', borderRadius: '6px', fontSize: '18px' },
  searchContainer: { position: 'relative', padding: '10px 16px' },
  searchIcon: { position: 'absolute', left: '28px', top: '22px', color: '#666', fontSize: '14px' },
  searchInput: { width: '100%', padding: '10px 10px 10px 35px', background: '#1e1e42', border: '1px solid #2a2a5e', borderRadius: '8px', color: '#fff', fontSize: '14px', outline: 'none', boxSizing: 'border-box' },
  conversationList: { flex: 1, overflow: 'auto', padding: '8px' },
  conversationItem: { display: 'flex', alignItems: 'center', gap: '12px', padding: '12px', borderRadius: '10px', cursor: 'pointer', transition: 'background 0.2s', marginBottom: '2px' },
  conversationItemActive: { background: '#4f46e5' },
  convAvatar: { width: '44px', height: '44px', borderRadius: '50%', background: '#333', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '18px', fontWeight: 'bold', color: '#fff', flexShrink: 0, overflow: 'hidden' },
  avatarImg: { width: '100%', height: '100%', objectFit: 'cover' },
  convInfo: { flex: 1, minWidth: 0 },
  convName: { fontSize: '14px', fontWeight: 600, color: '#fff', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' },
  convPreview: { fontSize: '12px', color: '#888', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', marginTop: '2px' },
  convMeta: { display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '4px', flexShrink: 0 },
  convTime: { fontSize: '11px', color: '#666' },
  unreadBadge: { background: '#4f46e5', color: '#fff', borderRadius: '50%', minWidth: '20px', height: '20px', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '11px', fontWeight: 'bold' },
  chatArea: { flex: 1, display: 'flex', flexDirection: 'column', background: '#0f0f23' },
  chatAreaEmpty: { alignItems: 'center', justifyContent: 'center' },
  chatHeader: { display: 'flex', alignItems: 'center', gap: '12px', padding: '14px 20px', borderBottom: '1px solid #2a2a5e', background: '#151532' },
  backBtn: { background: 'none', border: 'none', color: '#888', cursor: 'pointer', padding: '6px', borderRadius: '6px', fontSize: '18px', display: 'none' },
  chatHeaderInfo: { flex: 1 },
  chatHeaderName: { fontSize: '15px', fontWeight: 600, color: '#fff' },
  typingIndicator: { fontSize: '12px', color: '#4f46e5', fontStyle: 'italic' },
  messagesContainer: { flex: 1, overflow: 'auto', padding: '20px', display: 'flex', flexDirection: 'column', gap: '8px' },
  dateSeparator: { textAlign: 'center', color: '#666', fontSize: '12px', padding: '10px 0', fontWeight: 500 },
  messageRow: { display: 'flex', gap: '8px', alignItems: 'flex-start', maxWidth: '85%' },
  messageRowMine: { alignSelf: 'flex-end', flexDirection: 'row-reverse' },
  messageAvatar: { width: '30px', height: '30px', borderRadius: '50%', background: '#333', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '12px', fontWeight: 'bold', color: '#fff', flexShrink: 0 },
  messageBubble: { padding: '10px 14px', borderRadius: '14px', fontSize: '14px', lineHeight: 1.5, position: 'relative', maxWidth: '100%' },
  messageBubbleMine: { background: '#4f46e5', color: '#fff', borderBottomRightRadius: '4px' },
  messageBubbleOther: { background: '#1e1e42', color: '#e0e0e0', borderBottomLeftRadius: '4px' },
  messageSender: { fontSize: '11px', fontWeight: 600, color: '#4f46e5', marginBottom: '4px' },
  messageText: { whiteSpace: 'pre-wrap', wordBreak: 'break-word' },
  messageFooter: { display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: '4px', marginTop: '4px' },
  messageTime: { fontSize: '10px', color: 'rgba(255,255,255,0.5)' },
  readStatus: { fontSize: '12px', lineHeight: 1 },
  messageActions: { display: 'flex', flexDirection: 'column', gap: '2px', opacity: 0, transition: 'opacity 0.2s' },
  actionBtn: { background: 'none', border: 'none', color: '#666', cursor: 'pointer', padding: '3px', borderRadius: '4px', fontSize: '12px' },
  replyPreview: { padding: '4px 8px', marginBottom: '6px', background: 'rgba(0,0,0,0.2)', borderRadius: '6px', borderLeft: '2px solid #4f46e5' },
  replyLabel: { fontSize: '11px', color: '#4f46e5', display: 'block' },
  replyText: { fontSize: '11px', color: '#888', display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' },
  forwardLabel: { fontSize: '10px', color: '#888', fontStyle: 'italic', marginBottom: '2px' },
  fileAttachment: { marginTop: '6px' },
  sharedImage: { maxWidth: '280px', maxHeight: '200px', borderRadius: '8px', cursor: 'pointer', objectFit: 'cover' },
  sharedVideo: { maxWidth: '280px', maxHeight: '200px', borderRadius: '8px' },
  sharedAudio: { width: '100%', maxWidth: '280px' },
  fileLink: { color: '#4f46e5', textDecoration: 'underline', fontSize: '13px', wordBreak: 'break-all' },
  inputArea: { display: 'flex', alignItems: 'flex-end', gap: '8px', padding: '14px 20px', borderTop: '1px solid #2a2a5e', background: '#151532' },
  attachBtn: { background: 'none', border: 'none', color: '#888', cursor: 'pointer', padding: '8px', borderRadius: '8px', fontSize: '18px' },
  emojiBtn: { background: 'none', border: 'none', color: '#888', cursor: 'pointer', padding: '8px', borderRadius: '8px', fontSize: '18px', position: 'relative' },
  emojiPicker: { position: 'absolute', bottom: '60px', right: '20px', background: '#1e1e42', border: '1px solid #2a2a5e', borderRadius: '10px', padding: '12px', display: 'grid', gridTemplateColumns: 'repeat(8, 1fr)', gap: '4px', zIndex: 100, maxWidth: '280px' },
  emojiItem: { cursor: 'pointer', fontSize: '22px', textAlign: 'center', padding: '4px', borderRadius: '6px', transition: 'background 0.2s' },
  messageInput: { flex: 1, padding: '10px 14px', background: '#1e1e42', border: '1px solid #2a2a5e', borderRadius: '10px', color: '#fff', fontSize: '14px', resize: 'none', outline: 'none', maxHeight: '120px', fontFamily: 'inherit' },
  sendBtn: { background: '#4f46e5', border: 'none', color: '#fff', cursor: 'pointer', padding: '10px 16px', borderRadius: '10px', fontSize: '16px', transition: 'background 0.2s' },
  replyBar: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 20px', background: '#1e1e42', borderTop: '1px solid #2a2a5e' },
  replyBarInfo: { display: 'flex', alignItems: 'center', gap: '8px', fontSize: '12px', color: '#aaa', flex: 1 },
  replyBarText: { overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: '#666' },
  closeBtn: { background: 'none', border: 'none', color: '#888', cursor: 'pointer', fontSize: '16px', padding: '4px' },
  filePreviewBar: { display: 'flex', alignItems: 'center', gap: '10px', padding: '8px 20px', background: '#1e1e42', borderTop: '1px solid #2a2a5e' },
  previewImage: { width: '60px', height: '60px', objectFit: 'cover', borderRadius: '6px' },
  filePreviewInfo: { fontSize: '13px', color: '#aaa' },
  noChatSelected: { textAlign: 'center', color: '#666' },
  noChatIcon: { fontSize: '64px', marginBottom: '16px' },
  noChatTitle: { fontSize: '20px', fontWeight: 600, color: '#888', marginBottom: '8px' },
  noChatSubtitle: { fontSize: '14px', color: '#555' },
  emptyChat: { textAlign: 'center', padding: '60px 0', color: '#666' },
  emptyChatIcon: { fontSize: '48px', marginBottom: '12px' },
  emptyChatText: { fontSize: '16px', color: '#888' },
  emptyState: { textAlign: 'center', padding: '40px 20px', color: '#666' },
  emptyIcon: { fontSize: '36px', marginBottom: '12px' },
  emptyButton: { marginTop: '12px', padding: '8px 20px', background: '#4f46e5', color: '#fff', border: 'none', borderRadius: '8px', cursor: 'pointer', fontSize: '13px' },
  userListPanel: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, background: '#151532', zIndex: 10, display: 'flex', flexDirection: 'column', padding: '16px' },
  userListHeader: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' },
  userSearchInput: { width: '100%', padding: '10px', background: '#1e1e42', border: '1px solid #2a2a5e', borderRadius: '8px', color: '#fff', fontSize: '14px', marginBottom: '12px', outline: 'none', boxSizing: 'border-box' },
  userList: { flex: 1, overflow: 'auto', display: 'flex', flexDirection: 'column', gap: '4px' },
  userListItem: { display: 'flex', alignItems: 'center', gap: '12px', padding: '10px', borderRadius: '8px', cursor: 'pointer', transition: 'background 0.2s' },
  userListItemName: { fontSize: '14px', fontWeight: 500, color: '#fff' },
  userListItemStatus: { fontSize: '12px', color: '#888' },
  searchResults: { flex: 1, overflow: 'auto', padding: '8px' },
  searchingText: { textAlign: 'center', color: '#666', padding: '20px' },
  searchResultItem: { padding: '10px', borderBottom: '1px solid #2a2a5e', cursor: 'pointer' },
  searchResultSender: { fontSize: '13px', fontWeight: 600, color: '#4f46e5' },
  searchResultText: { fontSize: '13px', color: '#aaa', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' },
  searchResultTime: { fontSize: '11px', color: '#666', marginTop: '4px' },
  noResults: { textAlign: 'center', color: '#666', padding: '20px' },
  loadingContainer: { display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%' },
};
