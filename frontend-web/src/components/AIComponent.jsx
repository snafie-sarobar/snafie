import React, { useState, useEffect, useRef } from 'react';
import { collection, query, orderBy, onSnapshot, addDoc, doc, serverTimestamp } from 'firebase/firestore';
import { auth, db } from '../App';
import { FiSend, FiMic, FiVolume2, FiImage, FiCode, FiGlobe, FiMessageSquare, FiPlus, FiTrash2, FiChevronLeft, FiChevronRight, FiUser, FiCopy, FiCheck, FiCpu, FiBook, FiSmile, FiHeart } from 'react-icons/fi';

const API_URL = process.env.REACT_APP_API_URL || 'http://localhost:3000';
const OPENAI_API_KEY = process.env.REACT_APP_OPENAI_API_KEY || '';

const PERSONALITIES = [
  { id: 'default', name: 'Assistant', icon: '🤖', description: 'General purpose assistant' },
  { id: 'creative', name: 'Creative Writer', icon: '✍️', description: 'Creative writing help' },
  { id: 'code', name: 'Code Expert', icon: '💻', description: 'Programming assistance' },
  { id: 'translator', name: 'Translator', icon: '🌍', description: 'Language translation' },
  { id: 'tutor', name: 'Tutor', icon: '📚', description: 'Educational help' },
  { id: 'therapist', name: 'Counselor', icon: '❤️', description: 'Emotional support' },
  { id: 'funny', name: 'Comedian', icon: '😂', description: 'Jokes & humor' },
];

const MODES = [
  { id: 'chat', label: 'Chat', icon: '💬' },
  { id: 'code', label: 'Code', icon: '💻' },
  { id: 'translate', label: 'Translate', icon: '🌍' },
  { id: 'image', label: 'Image', icon: '🎨' },
];

export default function AIComponent({ fullScreen = false }) {
  const [conversations, setConversations] = useState([]);
  const [activeConversation, setActiveConversation] = useState(null);
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [personality, setPersonality] = useState('default');
  const [mode, setMode] = useState('chat');
  const [loading, setLoading] = useState(false);
  const [personalityName, setPersonalityName] = useState('');
  const [showSidebar, setShowSidebar] = useState(true);
  const [copiedId, setCopiedId] = useState(null);
  const [imagePrompt, setImagePrompt] = useState('');
  const [generatedImage, setGeneratedImage] = useState(null);
  const [generatingImage, setGeneratingImage] = useState(false);
  const [translateText, setTranslateText] = useState('');
  const [translateTarget, setTranslateTarget] = useState('Spanish');
  const [translatedResult, setTranslatedResult] = useState('');
  const [codePrompt, setCodePrompt] = useState('');
  const [codeLanguage, setCodeLanguage] = useState('javascript');
  const [codeResult, setCodeResult] = useState('');
  const [isListening, setIsListening] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);

  const messagesEndRef = useRef(null);
  const inputRef = useRef(null);

  const currentUser = JSON.parse(localStorage.getItem('user') || '{}');

  useEffect(() => {
    fetchConversations();
  }, []);

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const scrollToBottom = () => {
    setTimeout(() => messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' }), 100);
  };

  const fetchConversations = async () => {
    try {
      const res = await fetch(`${API_URL}/api/ai/conversations`).then(r => r.json());
      setConversations(res);
    } catch (err) {
      console.error('Failed to fetch conversations:', err);
    }
  };

  const fetchMessages = async (convId) => {
    try {
      const res = await fetch(`${API_URL}/api/ai/conversations/${convId}`).then(r => r.json());
      setMessages(res.messages || []);
      setActiveConversation(res);
      setPersonality(res.personality || 'default');
      setMode(res.mode || 'chat');
    } catch (err) {
      console.error('Failed to fetch messages:', err);
    }
  };

  const sendMessage = async () => {
    if (!input.trim() || loading) return;

    const userMessage = { role: 'user', content: input.trim() };
    setMessages(prev => [...prev, userMessage]);
    setInput('');
    setLoading(true);

    try {
      const openaiMessages = [...messages, userMessage];
      const openaiRes = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${OPENAI_API_KEY}` },
        body: JSON.stringify({
          model: 'gpt-3.5-turbo',
          messages: openaiMessages
        })
      }).then(r => r.json());
      const reply = openaiRes.choices?.[0]?.message?.content || 'No response';
      setMessages(prev => [...prev, { role: 'assistant', content: reply }]);
      if (!activeConversation) {
        setActiveConversation({ id: Date.now().toString(), title: userMessage.content.substring(0, 50), personality, mode });
        fetchConversations();
      }
    } catch (err) {
      setMessages(prev => [...prev, { role: 'assistant', content: `Error: ${err.message || 'Failed to get response'}` }]);
    } finally {
      setLoading(false);
    }
  };

  const sendCodeRequest = async () => {
    if (!codePrompt.trim() || loading) return;
    setLoading(true);
    setCodeResult('');
    try {
      const openaiRes = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${OPENAI_API_KEY}` },
        body: JSON.stringify({
          model: 'gpt-3.5-turbo',
          messages: [{ role: 'user', content: `Write ${codeLanguage} code:\n${codePrompt}` }]
        })
      }).then(r => r.json());
      setCodeResult(openaiRes.choices?.[0]?.message?.content || '');
    } catch (err) {
      setCodeResult('Error: Failed to generate code');
    } finally {
      setLoading(false);
    }
  };

  const sendTranslateRequest = async () => {
    if (!translateText.trim()) return;
    setLoading(true);
    try {
      const openaiRes = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${OPENAI_API_KEY}` },
        body: JSON.stringify({
          model: 'gpt-3.5-turbo',
          messages: [{ role: 'user', content: `Translate this to ${translateTarget}:\n${translateText}` }]
        })
      }).then(r => r.json());
      setTranslatedResult(openaiRes.choices?.[0]?.message?.content || '');
    } catch (err) {
      setTranslatedResult('Translation failed');
    } finally {
      setLoading(false);
    }
  };

  const generateImage = async () => {
    if (!imagePrompt.trim() || generatingImage) return;
    setGeneratingImage(true);
    try {
      const openaiRes = await fetch('https://api.openai.com/v1/images/generations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${OPENAI_API_KEY}` },
        body: JSON.stringify({ prompt: imagePrompt, n: 1, size: '1024x1024' })
      }).then(r => r.json());
      setGeneratedImage(openaiRes.data?.[0]?.url || null);
    } catch (err) {
      alert('Image generation failed');
    } finally {
      setGeneratingImage(false);
    }
  };

  const deleteConversation = async (convId) => {
    try {
      await fetch(`${API_URL}/api/ai/conversations/${convId}`, { method: 'DELETE' });
      if (activeConversation?.id === convId) {
        setActiveConversation(null);
        setMessages([]);
      }
      setConversations(prev => prev.filter(c => c.id !== convId));
    } catch (err) {
      console.error('Failed to delete conversation:', err);
    }
  };

  const startNewConversation = () => {
    setActiveConversation(null);
    setMessages([]);
    setPersonality('default');
    setMode('chat');
    setGeneratedImage(null);
    setTranslatedResult('');
    setCodeResult('');
  };

  const copyToClipboard = (text, id) => {
    navigator.clipboard.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const toggleVoiceInput = () => {
    if (!('webkitSpeechRecognition' in window || 'SpeechRecognition' in window)) {
      alert('Voice recognition not supported in this browser');
      return;
    }
    if (isListening) {
      setIsListening(false);
      return;
    }
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    const recognition = new SpeechRecognition();
    recognition.lang = 'en-US';
    recognition.interimResults = false;
    recognition.onresult = (event) => {
      setInput(prev => prev + ' ' + event.results[0][0].transcript);
      setIsListening(false);
    };
    recognition.onerror = () => setIsListening(false);
    recognition.start();
    setIsListening(true);
  };

  const speakText = (text) => {
    if (!('speechSynthesis' in window)) return;
    if (isSpeaking) {
      window.speechSynthesis.cancel();
      setIsSpeaking(false);
      return;
    }
    const utterance = new SpeechSynthesisUtterance(text.replace(/<[^>]*>/g, ''));
    utterance.rate = 1;
    utterance.pitch = 1;
    utterance.onend = () => setIsSpeaking(false);
    utterance.onerror = () => setIsSpeaking(false);
    window.speechSynthesis.speak(utterance);
    setIsSpeaking(true);
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  const formatMessage = (content) => {
    if (!content) return '';
    const codeBlockRegex = /```(\w*)\n([\s\S]*?)```/g;
    const parts = [];
    let lastIndex = 0;
    let match;
    while ((match = codeBlockRegex.exec(content)) !== null) {
      if (match.index > lastIndex) {
        parts.push({ type: 'text', content: content.substring(lastIndex, match.index) });
      }
      parts.push({ type: 'code', language: match[1], content: match[2] });
      lastIndex = match.index + match[0].length;
    }
    if (lastIndex < content.length) {
      parts.push({ type: 'text', content: content.substring(lastIndex) });
    }
    return parts;
  };

  const currentPersonality = PERSONALITIES.find(p => p.id === personality) || PERSONALITIES[0];

  return (
    <div style={{ ...styles.container, ...(fullScreen ? { height: 'calc(100vh - 60px)' } : {}) }}>
      <div style={styles.mainContent}>
        {showSidebar && (
          <div style={styles.sidebar}>
            <div style={styles.sidebarHeader}>
              <h3 style={{ margin: 0, fontSize: '16px', color: '#fff' }}>AI Chat</h3>
              <button onClick={startNewConversation} style={styles.newBtn}><FiPlus /></button>
            </div>

            <div style={styles.personalitySelector}>
              {PERSONALITIES.map(p => (
                <button key={p.id} onClick={() => setPersonality(p.id)}
                  style={{ ...styles.personalityBtn, ...(personality === p.id ? styles.personalityBtnActive : {}) }}
                  title={p.description}>
                  <span>{p.icon}</span>
                  <span style={{ fontSize: '11px' }}>{p.name}</span>
                </button>
              ))}
            </div>

            <div style={styles.modeTabs}>
              {MODES.map(m => (
                <button key={m.id} onClick={() => setMode(m.id)}
                  style={{ ...styles.modeTab, ...(mode === m.id ? styles.modeTabActive : {}) }}>
                  <span>{m.icon}</span>
                  <span>{m.label}</span>
                </button>
              ))}
            </div>

            <div style={styles.conversationList}>
              <div style={{ fontSize: '12px', color: '#666', padding: '8px 12px', fontWeight: 600 }}>Conversations</div>
              {conversations.length === 0 ? (
                <div style={{ padding: '20px', textAlign: 'center', color: '#666', fontSize: '13px' }}>
                  No conversations yet
                </div>
              ) : (
                conversations.map(conv => (
                  <div key={conv.id} onClick={() => fetchMessages(conv.id)}
                    style={{ ...styles.convItem, ...(activeConversation?.id === conv.id ? styles.convItemActive : {}) }}>
                    <div style={{ flex: 1, overflow: 'hidden' }}>
                      <div style={{ fontSize: '13px', color: '#fff', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {conv.title}
                      </div>
                      <div style={{ fontSize: '11px', color: '#888' }}>
                        {PERSONALITIES.find(p => p.id === conv.personality)?.name || 'Assistant'} · {conv.message_count} msgs
                      </div>
                    </div>
                    <button onClick={(e) => { e.stopPropagation(); deleteConversation(conv.id); }}
                      style={styles.deleteConvBtn}><FiTrash2 size={12} /></button>
                  </div>
                ))
              )}
            </div>
          </div>
        )}

        <div style={styles.chatArea}>
          {mode === 'chat' && (
            <>
              <div style={styles.chatHeader}>
                <button onClick={() => setShowSidebar(!showSidebar)} style={styles.toggleBtn}>
                  {showSidebar ? <FiChevronLeft /> : <FiChevronRight />}
                </button>
                <div style={styles.chatHeaderInfo}>
                  <span style={{ fontWeight: 600, color: '#fff' }}>
                    {currentPersonality.icon} {currentPersonality.name}
                  </span>
                  {activeConversation && (
                    <span style={{ fontSize: '12px', color: '#888', marginLeft: '8px' }}>
                      · {activeConversation.title}
                    </span>
                  )}
                </div>
                {activeConversation && (
                  <button onClick={startNewConversation} style={styles.newChatBtn}>
                    <FiPlus /> New Chat
                  </button>
                )}
              </div>

              <div style={styles.messagesContainer}>
                {messages.length === 0 ? (
                  <div style={styles.welcomeMessage}>
                    <div style={{ fontSize: '48px', marginBottom: '16px' }}>{currentPersonality.icon}</div>
                    <h2 style={{ color: '#fff', marginBottom: '8px' }}>Hello! I'm your {currentPersonality.name}</h2>
                    <p style={{ color: '#888', fontSize: '14px', marginBottom: '20px' }}>
                      {currentPersonality.description}. How can I help you today?
                    </p>
                    <div style={styles.suggestions}>
                      {currentPersonality.id === 'code' ? [
                        'Write a React component',
                        'Explain async/await',
                        'Debug this code',
                        'Build a REST API'
                      ] : currentPersonality.id === 'translator' ? [
                        'Translate hello to Spanish',
                        'How do you say thank you in French?',
                        'Translate this paragraph',
                        'What is the word for cat in German?'
                      ] : [
                        'Tell me a joke',
                        'Explain quantum computing',
                        'Write a poem',
                        'Help me plan a trip'
                      ].map(s => (
                        <button key={s} onClick={() => { setInput(s); inputRef.current?.focus(); }}
                          style={styles.suggestionBtn}>
                          {s}
                        </button>
                      ))}
                    </div>
                  </div>
                ) : (
                  messages.map((msg, idx) => {
                    const isUser = msg.role === 'user';
                    const parts = formatMessage(msg.content);
                    return (
                      <div key={idx} style={{ ...styles.messageRow, ...(isUser ? styles.messageRowUser : {}) }}>
                        <div style={styles.messageAvatar}>
                          {isUser ? <FiUser /> : currentPersonality.icon}
                        </div>
                        <div style={{ ...styles.messageBubble, ...(isUser ? styles.messageBubbleUser : styles.messageBubbleAI) }}>
                          {parts.map((part, pidx) => {
                            if (part.type === 'code') {
                              return (
                                <div key={pidx} style={styles.codeBlock}>
                                  <div style={styles.codeHeader}>
                                    <span>{part.language || 'code'}</span>
                                    <button onClick={() => copyToClipboard(part.content, `code-${idx}-${pidx}`)}
                                      style={styles.copyBtn}>
                                      {copiedId === `code-${idx}-${pidx}` ? <FiCheck /> : <FiCopy />}
                                    </button>
                                  </div>
                                  <pre style={styles.codeContent}><code>{part.content}</code></pre>
                                </div>
                              );
                            }
                            return <span key={pidx} style={styles.messageText}>{part.content}</span>;
                          })}
                          <div style={styles.messageActions}>
                            {!isUser && (
                              <button onClick={() => speakText(msg.content)} style={styles.speakBtn}>
                                <FiVolume2 size={12} />
                              </button>
                            )}
                            <button onClick={() => copyToClipboard(msg.content, `msg-${idx}`)} style={styles.copyMsgBtn}>
                              {copiedId === `msg-${idx}` ? <FiCheck size={12} /> : <FiCopy size={12} />}
                            </button>
                          </div>
                        </div>
                      </div>
                    );
                  })
                )}
                {loading && (
                  <div style={styles.typingIndicator}>
                    <div style={styles.typingDots}>
                      <div style={styles.typingDot} />
                      <div style={styles.typingDot} />
                      <div style={styles.typingDot} />
                    </div>
                  </div>
                )}
                <div ref={messagesEndRef} />
              </div>

              <div style={styles.inputArea}>
                <button onClick={toggleVoiceInput} style={{ ...styles.voiceBtn, ...(isListening ? styles.voiceBtnActive : {}) }}
                  title="Voice input">
                  <FiMic size={18} />
                </button>
                <textarea value={input} onChange={(e) => setInput(e.target.value)}
                  onKeyDown={handleKeyDown} placeholder="Type a message..." rows={1}
                  ref={inputRef} style={styles.messageInput} />
                <button onClick={sendMessage} disabled={loading || !input.trim()}
                  style={styles.sendBtn}>
                  <FiSend size={18} />
                </button>
              </div>
            </>
          )}

          {mode === 'code' && (
            <div style={styles.modePanel}>
              <h3 style={{ color: '#fff', marginBottom: '16px' }}>💻 Code Assistant</h3>
              <div style={styles.codeModeLayout}>
                <div style={styles.codeInputSection}>
                  <select value={codeLanguage} onChange={(e) => setCodeLanguage(e.target.value)} style={styles.langSelect}>
                    {['javascript', 'typescript', 'python', 'java', 'c++', 'go', 'rust', 'ruby', 'php', 'swift', 'kotlin'].map(l => (
                      <option key={l} value={l}>{l}</option>
                    ))}
                  </select>
                  <textarea value={codePrompt} onChange={(e) => setCodePrompt(e.target.value)}
                    placeholder="Describe what code you need..." style={styles.codeTextarea} rows={10} />
                  <button onClick={sendCodeRequest} disabled={loading || !codePrompt.trim()} style={styles.generateBtn}>
                    {loading ? 'Generating...' : 'Generate Code'}
                  </button>
                </div>
                <div style={styles.codeResultSection}>
                  <div style={styles.resultHeader}>
                    <span>Result</span>
                    {codeResult && (
                      <button onClick={() => copyToClipboard(codeResult, 'code-result')} style={styles.copyBtn}>
                        {copiedId === 'code-result' ? <FiCheck /> : <FiCopy />}
                      </button>
                    )}
                  </div>
                  <pre style={styles.codeOutput}>{codeResult || 'Your generated code will appear here...'}</pre>
                </div>
              </div>
            </div>
          )}

          {mode === 'translate' && (
            <div style={styles.modePanel}>
              <h3 style={{ color: '#fff', marginBottom: '16px' }}>🌍 Translation</h3>
              <div style={styles.translateLayout}>
                <div style={styles.translateInput}>
                  <label style={{ color: '#888', fontSize: '13px', marginBottom: '6px', display: 'block' }}>Source Text</label>
                  <textarea value={translateText} onChange={(e) => setTranslateText(e.target.value)}
                    placeholder="Enter text to translate..." style={styles.translateTextarea} rows={5} />
                </div>
                <div style={styles.translateControls}>
                  <select value={translateTarget} onChange={(e) => setTranslateTarget(e.target.value)} style={styles.langSelect}>
                    {['Spanish', 'French', 'German', 'Italian', 'Portuguese', 'Russian', 'Japanese', 'Korean', 'Chinese', 'Arabic', 'Hindi'].map(l => (
                      <option key={l} value={l}>{l}</option>
                    ))}
                  </select>
                  <button onClick={sendTranslateRequest} disabled={loading || !translateText.trim()} style={styles.translateBtn}>
                    Translate
                  </button>
                </div>
                <div style={styles.translateOutput}>
                  <label style={{ color: '#888', fontSize: '13px', marginBottom: '6px', display: 'block' }}>Translation</label>
                  <div style={styles.translateResult}>
                    {translatedResult || 'Translation will appear here...'}
                  </div>
                  {translatedResult && (
                    <button onClick={() => copyToClipboard(translatedResult, 'trans-result')} style={styles.copyBtn}>
                      <FiCopy /> Copy
                    </button>
                  )}
                </div>
              </div>
            </div>
          )}

          {mode === 'image' && (
            <div style={styles.modePanel}>
              <h3 style={{ color: '#fff', marginBottom: '16px' }}>🎨 Image Generation</h3>
              <div style={styles.imageLayout}>
                <div style={styles.imageInputSection}>
                  <textarea value={imagePrompt} onChange={(e) => setImagePrompt(e.target.value)}
                    placeholder="Describe the image you want to generate..." style={styles.imageTextarea} rows={4} />
                  <button onClick={generateImage} disabled={generatingImage || !imagePrompt.trim()} style={styles.generateBtn}>
                    {generatingImage ? 'Generating...' : 'Generate Image'}
                  </button>
                </div>
                <div style={styles.imageResult}>
                  {generatedImage ? (
                    <div style={{ textAlign: 'center' }}>
                      <img src={generatedImage} alt="Generated" style={styles.generatedImage} />
                      <button onClick={() => window.open(generatedImage, '_blank')} style={styles.downloadBtn}>
                        Open Full Size
                      </button>
                    </div>
                  ) : (
                    <div style={styles.imagePlaceholder}>
                      <FiImage size={48} style={{ color: '#333' }} />
                      <div style={{ color: '#666', marginTop: '12px' }}>Your generated image will appear here</div>
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

const styles = {
  container: { height: '100%', background: '#0f0f23', borderRadius: '12px', overflow: 'hidden', border: '1px solid #2a2a5e' },
  mainContent: { display: 'flex', height: '100%' },
  sidebar: { width: '280px', minWidth: '280px', display: 'flex', flexDirection: 'column', borderRight: '1px solid #2a2a5e', background: '#151532' },
  sidebarHeader: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px', borderBottom: '1px solid #2a2a5e' },
  newBtn: { background: '#4f46e5', border: 'none', color: '#fff', borderRadius: '8px', padding: '8px 12px', cursor: 'pointer', fontSize: '16px' },
  personalitySelector: { display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '4px', padding: '10px', borderBottom: '1px solid #2a2a5e' },
  personalityBtn: { display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '2px', padding: '8px 4px', background: 'transparent', border: '1px solid transparent', borderRadius: '8px', color: '#888', cursor: 'pointer', fontSize: '16px', transition: 'all 0.2s' },
  personalityBtnActive: { background: 'rgba(79,70,229,0.2)', borderColor: '#4f46e5', color: '#4f46e5' },
  modeTabs: { display: 'flex', gap: '2px', padding: '8px', borderBottom: '1px solid #2a2a5e' },
  modeTab: { display: 'flex', alignItems: 'center', gap: '4px', padding: '6px 12px', background: 'transparent', border: 'none', color: '#888', cursor: 'pointer', borderRadius: '6px', fontSize: '12px', transition: 'all 0.2s' },
  modeTabActive: { background: '#4f46e5', color: '#fff' },
  conversationList: { flex: 1, overflow: 'auto' },
  convItem: { display: 'flex', alignItems: 'center', gap: '6px', padding: '10px 12px', cursor: 'pointer', borderBottom: '1px solid #1a1a3e', transition: 'background 0.2s' },
  convItemActive: { background: 'rgba(79,70,229,0.15)' },
  deleteConvBtn: { background: 'none', border: 'none', color: '#555', cursor: 'pointer', padding: '4px', borderRadius: '4px', fontSize: '12px', opacity: 0, transition: 'opacity 0.2s' },
  chatArea: { flex: 1, display: 'flex', flexDirection: 'column', background: '#0f0f23' },
  chatHeader: { display: 'flex', alignItems: 'center', gap: '12px', padding: '14px 20px', borderBottom: '1px solid #2a2a5e', background: '#151532' },
  toggleBtn: { background: 'none', border: 'none', color: '#888', cursor: 'pointer', fontSize: '18px', padding: '4px' },
  chatHeaderInfo: { flex: 1, display: 'flex', alignItems: 'center' },
  newChatBtn: { display: 'flex', alignItems: 'center', gap: '4px', padding: '8px 14px', background: '#4f46e5', border: 'none', borderRadius: '8px', color: '#fff', cursor: 'pointer', fontSize: '12px', fontWeight: 600 },
  messagesContainer: { flex: 1, overflow: 'auto', padding: '20px', display: 'flex', flexDirection: 'column', gap: '16px' },
  welcomeMessage: { textAlign: 'center', padding: '60px 20px', maxWidth: '500px', margin: '0 auto' },
  suggestions: { display: 'flex', flexDirection: 'column', gap: '8px', alignItems: 'center' },
  suggestionBtn: { padding: '10px 20px', background: '#1a1a3e', border: '1px solid #2a2a5e', borderRadius: '10px', color: '#aaa', cursor: 'pointer', fontSize: '14px', width: '100%', maxWidth: '350px', textAlign: 'center', transition: 'all 0.2s' },
  messageRow: { display: 'flex', gap: '12px', maxWidth: '85%', alignItems: 'flex-start' },
  messageRowUser: { alignSelf: 'flex-end', flexDirection: 'row-reverse' },
  messageAvatar: { width: '34px', height: '34px', borderRadius: '50%', background: '#1a1a3e', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '18px', flexShrink: 0, border: '1px solid #2a2a5e' },
  messageBubble: { padding: '12px 16px', borderRadius: '14px', fontSize: '14px', lineHeight: 1.6, position: 'relative', maxWidth: '100%' },
  messageBubbleUser: { background: '#4f46e5', color: '#fff', borderBottomRightRadius: '4px' },
  messageBubbleAI: { background: '#1a1a3e', color: '#e0e0e0', borderBottomLeftRadius: '4px', border: '1px solid #2a2a5e' },
  messageText: { whiteSpace: 'pre-wrap', wordBreak: 'break-word' },
  messageActions: { display: 'flex', gap: '8px', marginTop: '8px', justifyContent: 'flex-end' },
  speakBtn: { background: 'none', border: 'none', color: '#888', cursor: 'pointer', fontSize: '14px', padding: '2px' },
  copyMsgBtn: { background: 'none', border: 'none', color: '#888', cursor: 'pointer', fontSize: '14px', padding: '2px' },
  codeBlock: { background: '#0d0d1a', borderRadius: '8px', overflow: 'hidden', margin: '8px 0', border: '1px solid #2a2a5e' },
  codeHeader: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '6px 12px', background: '#151532', borderBottom: '1px solid #2a2a5e', fontSize: '11px', color: '#888' },
  codeContent: { padding: '12px', overflow: 'auto', fontSize: '13px', lineHeight: 1.5, margin: 0, color: '#a5d6ff' },
  copyBtn: { background: 'none', border: 'none', color: '#888', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '4px', fontSize: '12px' },
  typingIndicator: { padding: '10px 20px' },
  typingDots: { display: 'flex', gap: '6px', alignItems: 'center' },
  typingDot: { width: '8px', height: '8px', borderRadius: '50%', background: '#4f46e5', animation: 'bounce 1.4s infinite both' },
  inputArea: { display: 'flex', alignItems: 'flex-end', gap: '8px', padding: '14px 20px', borderTop: '1px solid #2a2a5e', background: '#151532' },
  voiceBtn: { background: 'none', border: 'none', color: '#888', cursor: 'pointer', padding: '8px', borderRadius: '50%', fontSize: '18px' },
  voiceBtnActive: { background: '#dc2626', color: '#fff' },
  messageInput: { flex: 1, padding: '12px 16px', background: '#1e1e42', border: '1px solid #2a2a5e', borderRadius: '10px', color: '#fff', fontSize: '14px', resize: 'none', outline: 'none', maxHeight: '120px', fontFamily: 'inherit' },
  sendBtn: { padding: '12px 16px', background: '#4f46e5', border: 'none', borderRadius: '10px', color: '#fff', cursor: 'pointer', fontSize: '18px' },
  modePanel: { flex: 1, overflow: 'auto', padding: '24px' },
  codeModeLayout: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px', height: 'calc(100% - 50px)' },
  codeInputSection: { display: 'flex', flexDirection: 'column', gap: '12px' },
  langSelect: { padding: '10px 14px', background: '#1e1e42', border: '1px solid #2a2a5e', borderRadius: '8px', color: '#fff', fontSize: '14px', outline: 'none' },
  codeTextarea: { flex: 1, padding: '14px', background: '#151532', border: '1px solid #2a2a5e', borderRadius: '8px', color: '#fff', fontSize: '14px', fontFamily: 'monospace', resize: 'vertical', outline: 'none' },
  generateBtn: { padding: '14px', background: '#4f46e5', color: '#fff', border: 'none', borderRadius: '8px', cursor: 'pointer', fontWeight: 600, fontSize: '15px' },
  codeResultSection: { display: 'flex', flexDirection: 'column' },
  resultHeader: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px', color: '#aaa', fontSize: '13px' },
  codeOutput: { flex: 1, padding: '14px', background: '#151532', border: '1px solid #2a2a5e', borderRadius: '8px', color: '#a5d6ff', fontSize: '13px', fontFamily: 'monospace', overflow: 'auto', whiteSpace: 'pre-wrap', margin: 0 },
  translateLayout: { display: 'flex', flexDirection: 'column', gap: '16px', maxWidth: '600px' },
  translateTextarea: { width: '100%', padding: '14px', background: '#151532', border: '1px solid #2a2a5e', borderRadius: '8px', color: '#fff', fontSize: '14px', resize: 'vertical', outline: 'none', boxSizing: 'border-box', fontFamily: 'inherit' },
  translateControls: { display: 'flex', gap: '12px', alignItems: 'center' },
  translateBtn: { padding: '10px 24px', background: '#4f46e5', color: '#fff', border: 'none', borderRadius: '8px', cursor: 'pointer', fontWeight: 600 },
  translateResult: { padding: '14px', background: '#151532', border: '1px solid #2a2a5e', borderRadius: '8px', color: '#e0e0e0', fontSize: '14px', minHeight: '80px' },
  translateOutput: { display: 'flex', flexDirection: 'column', gap: '8px' },
  imageLayout: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px', height: 'calc(100% - 50px)' },
  imageInputSection: { display: 'flex', flexDirection: 'column', gap: '12px' },
  imageTextarea: { padding: '14px', background: '#151532', border: '1px solid #2a2a5e', borderRadius: '8px', color: '#fff', fontSize: '14px', resize: 'vertical', outline: 'none', fontFamily: 'inherit' },
  imageResult: { display: 'flex', alignItems: 'center', justifyContent: 'center' },
  generatedImage: { maxWidth: '100%', maxHeight: '400px', borderRadius: '10px', boxShadow: '0 4px 20px rgba(0,0,0,0.5)' },
  downloadBtn: { display: 'inline-block', marginTop: '12px', padding: '10px 20px', background: '#4f46e5', color: '#fff', border: 'none', borderRadius: '8px', cursor: 'pointer', fontSize: '13px' },
  imagePlaceholder: { textAlign: 'center', padding: '60px' },
};
