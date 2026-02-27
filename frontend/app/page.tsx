"use client";

import React, { useState, useEffect, createContext, useContext, useCallback, useRef, FormEvent } from 'react';

// --- TYPE DEFINITIONS ---
interface User {
  id: number;
  username: string;
  email: string;
  thread_id: string;
  age?: number;
  risk_tolerance?: string;
  completed_modules?: string;
}

interface AuthContextType {
  token: string | null;
  setToken: (token: string | null) => void;
  logout: () => void;
  user: User | null;
  fetchUserProfile: () => Promise<void>;
  isLoading: boolean;
}

interface Message {
  id: number;
  content: string;
  isUser: boolean;
  isLoading?: boolean;
  toolStatus?: string | null;
}

interface InputBarProps {
  currentMessage: string;
  setCurrentMessage: (value: string) => void;
  onSubmit: (e: FormEvent) => void;
  isStreaming: boolean;
}

interface StreamedEvent {
  type: 'content' | 'tool_start' | 'tool_end' | 'error' | 'end';
  content?: string;
}

interface TrainingModule {
  id: number;
  title: string;
  summary: string;
}

interface QuizQuestion {
  question: string;
  options: string[];
  answer: string;
}

// Map language names to their gTTS 2-letter codes.
const LANGUAGES = [
  { name: 'English', code: 'en' },
  { name: 'Hindi', code: 'hi' },
  { name: 'Spanish', code: 'es' },
  { name: 'French', code: 'fr' },
  { name: 'Tamil', code: 'ta' },
  { name: 'Telugu', code: 'te' },
  {name: 'Kannada', code: 'kn'},
];

// --- CONSTANTS ---
const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://127.0.0.1:8000";

// --- Authentication Context ---
const AuthContext = createContext<AuthContextType | null>(null);

export const AuthProvider = ({ children }: { children: React.ReactNode }) => {
  const [token, setToken] = useState<string | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const logout = useCallback(() => {
    setToken(null);
    setUser(null);
    localStorage.removeItem('nivara_token');
  }, []);

  const internalFetchUserProfile = useCallback(async (currentToken: string) => {
    try {
      const response = await fetch(`${API_URL}/users/me`, {
        headers: { 'Authorization': `Bearer ${currentToken}` }
      });
      if (!response.ok) throw new Error("Failed to fetch user profile.");
      const userData: User = await response.json();
      setUser(userData);
    } catch (error) {
      console.error(error);
      logout();
    }
  }, [logout]);

  useEffect(() => {
    const storedToken = localStorage.getItem('nivara_token');
    if (storedToken) {
      setToken(storedToken);
      internalFetchUserProfile(storedToken).finally(() => setIsLoading(false));
    } else {
      setIsLoading(false);
    }
  }, [internalFetchUserProfile]);

  const handleSetToken = (newToken: string | null) => {
    setIsLoading(true);
    if (newToken) {
      setToken(newToken);
      localStorage.setItem('nivara_token', newToken);
      internalFetchUserProfile(newToken).finally(() => setIsLoading(false));
    } else {
      logout();
      setIsLoading(false);
    }
  };

  const refreshProfile = async () => {
    if (token) {
      await internalFetchUserProfile(token);
    }
  };

  return (
    <AuthContext.Provider value={{ token, setToken: handleSetToken, logout, user, fetchUserProfile: refreshProfile, isLoading }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used within an AuthProvider');
  return context;
};

// --- UI Components ---
const Header = ({ onNewChat }: { onNewChat: () => void }) => {
  const { user, logout } = useAuth();
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) setIsMenuOpen(false);
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  if (!user) return null;

  return (
    <header className="absolute top-0 left-0 right-0 flex items-center justify-between p-4 z-10 w-full">
      <div className="flex items-center space-x-4">
        <span className="font-semibold text-lg text-gray-300">Vernacular Employee Training Bot</span>
        <button
          onClick={onNewChat}
          className="p-2 rounded-full hover:bg-gray-700 transition-colors"
          title="New Chat"
        >
          <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-5 h-5 text-gray-300">
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
          </svg>
        </button>
      </div>
      <div className="relative" ref={menuRef}>
        <button
          onClick={() => setIsMenuOpen(!isMenuOpen)}
          className="w-8 h-8 rounded-full bg-gradient-to-br from-purple-500 to-blue-500 flex items-center justify-center text-white font-bold focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-gray-900 focus:ring-white"
        >
          {user.username.charAt(0).toUpperCase()}
        </button>
        {isMenuOpen && (
          <div className="absolute right-0 mt-2 w-56 bg-gray-800 rounded-md shadow-lg py-1 text-white">
            <div className="px-4 py-2 text-sm text-gray-400 border-b border-gray-700">
              Signed in as <br />
              <span className="font-medium text-gray-200 truncate">{user.email}</span>
            </div>
            <button
              onClick={() => { logout(); setIsMenuOpen(false); }}
              className="block w-full text-left px-4 py-2 text-sm hover:bg-gray-700"
            >
              Logout
            </button>
          </div>
        )}
      </div>
    </header>
  );
};

const InputBar = ({ currentMessage, setCurrentMessage, onSubmit, isStreaming }: InputBarProps) => (
  <form onSubmit={onSubmit} className="w-full max-w-4xl p-4">
    <div className="relative">
      <input
        type="text"
        value={currentMessage}
        onChange={(e) => setCurrentMessage(e.target.value)}
        disabled={isStreaming}
        placeholder="Ask a Question..."
        className="w-full bg-[#1E1F20] border border-gray-600/50 rounded-full h-16 pl-6 pr-20 text-gray-200 text-lg focus:outline-none focus:ring-2 focus:ring-blue-500/50 transition-all"
      />
      <div className="absolute inset-y-0 right-0 flex items-center pr-4">
        <button type="submit" disabled={isStreaming || !currentMessage.trim()} className="p-2 rounded-full bg-blue-600 hover:bg-blue-500 disabled:bg-gray-700 disabled:opacity-50 transition-colors">
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-6 h-6 text-white">
            <path d="M3.478 2.404a.75.75 0 0 0-.926.941l2.432 7.905H13.5a.75.75 0 0 1 0 1.5H4.984l-2.432 7.905a.75.75 0 0 0 .926.94 60.519 60.519 0 0 0 18.445-8.986.75.75 0 0 0 0-1.218A60.517 60.517 0 0 0 3.478 2.404Z" />
          </svg>
        </button>
      </div>
    </div>
  </form>
);

const TypingAnimation = () => (
  <div className="flex items-center space-x-1.5 p-2">
    {[0, 1, 2].map(i => <div key={i} className="w-1.5 h-1.5 bg-gray-400/70 rounded-full animate-pulse" style={{ animationDuration: "1s", animationDelay: `${i * 300}ms` }}></div>)}
  </div>
);



// --- Page Components ---
const ChatPage = () => {
  const { token, user, fetchUserProfile } = useAuth();
  const [messages, setMessages] = useState<Message[]>([]);
  const [currentMessage, setCurrentMessage] = useState("");
  const [isStreaming, setIsStreaming] = useState(false);

  // New States
  const [selectedLanguage, setSelectedLanguage] = useState(LANGUAGES[0]);
  const [modules, setModules] = useState<TrainingModule[]>([]);
  const [isUploading, setIsUploading] = useState(false);
  const [playingAudioId, setPlayingAudioId] = useState<number | null>(null);
  const [sidebarOpen, setSidebarOpen] = useState(true);

  // Microlearning State
  const [activeModule, setActiveModule] = useState<TrainingModule | null>(null);
  const [translatedModule, setTranslatedModule] = useState<{ title: string, summary: string } | null>(null);
  const [isTranslating, setIsTranslating] = useState(false);

  // Quiz State
  const [quizQuestions, setQuizQuestions] = useState<QuizQuestion[] | null>(null);
  const [isQuizLoading, setIsQuizLoading] = useState(false);
  const [currentQuizIndex, setCurrentQuizIndex] = useState(0);
  const [userAnswers, setUserAnswers] = useState<Record<number, string>>({});
  const [showQuizResults, setShowQuizResults] = useState(false);
  const [isRecordingProgress, setIsRecordingProgress] = useState(false);

  // Parse completed modules safely
  const getCompletedModules = useCallback(() => {
    if (!user || !user.completed_modules) return {};
    try {
      return JSON.parse(user.completed_modules);
    } catch {
      return {};
    }
  }, [user]);

  const completedMap = getCompletedModules();
  const completedCount = Object.keys(completedMap).length;
  const progressPercent = modules.length > 0 ? Math.round((completedCount / modules.length) * 100) : 0;

  const messagesEndRef = useRef<HTMLDivElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (user && messages.length === 0) {
      setMessages([
        { id: Date.now(), content: `Hello, ${user.username}! I'm PolicySpeakAI, a Vernacular Employee Training Bot. How can I help you today?`, isUser: false }
      ]);
    }
  }, [user, messages.length]);

  // Handle automatic translation for modules
  useEffect(() => {
    const translateModule = async () => {
      if (!activeModule || !token) return;
      if (selectedLanguage.code === 'en') {
        setTranslatedModule(null);
        return;
      }

      setIsTranslating(true);
      try {
        // Translate Title
        const titleRes = await fetch(`${API_URL}/translate`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
          body: JSON.stringify({ text: activeModule.title, language: selectedLanguage.name })
        });
        const titleData = await titleRes.json();

        // Translate Summary
        const summaryRes = await fetch(`${API_URL}/translate`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
          body: JSON.stringify({ text: activeModule.summary, language: selectedLanguage.name })
        });
        const summaryData = await summaryRes.json();

        setTranslatedModule({
          title: titleData.translated_text,
          summary: summaryData.translated_text
        });
      } catch (e) {
        console.error("Translation error:", e);
      } finally {
        setIsTranslating(false);
      }
    };

    translateModule();
  }, [activeModule?.id, selectedLanguage.code, token]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!currentMessage.trim() || isStreaming || !token) return;

    const userMessage: Message = { id: Date.now(), content: currentMessage, isUser: true };
    const aiResponsePlaceholder: Message = { id: Date.now() + 1, content: "", isUser: false, isLoading: true };
    setMessages(prev => [...prev, userMessage, aiResponsePlaceholder]);
    const userMessageContent = currentMessage;
    setCurrentMessage("");
    setIsStreaming(true);

    try {
      const response = await fetch(`${API_URL}/chat-stream`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
        body: JSON.stringify({ message: userMessageContent, language: selectedLanguage.name }),
      });

      if (!response.body) return;
      const reader = response.body.getReader();
      const decoder = new TextDecoder();

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        const chunk = decoder.decode(value, { stream: true });
        const lines = chunk.split('\n\n').filter(line => line.trim().startsWith('data:'));

        for (const line of lines) {
          const jsonStr = line.substring(6);
          try {
            const data: StreamedEvent = JSON.parse(jsonStr);

            // --- REFACTORED STREAMING LOGIC ---
            if (data.type === 'content' && data.content) {
              // Append only the new chunk to the existing message content
              setMessages(prev => prev.map(msg =>
                msg.id === aiResponsePlaceholder.id
                  ? { ...msg, content: msg.content + data.content, isLoading: true, toolStatus: null }
                  : msg
              ));
            } else if (data.type === 'tool_start' && data.content) {
              setMessages(prev => prev.map(msg =>
                msg.id === aiResponsePlaceholder.id
                  ? { ...msg, isLoading: true, toolStatus: data.content }
                  : msg
              ));
            } else if (data.type === 'end') {
              // The 'end' event signals the stream is fully complete.
              setIsStreaming(false);
              setMessages(prev => prev.map(msg =>
                msg.id === aiResponsePlaceholder.id
                  ? { ...msg, isLoading: false, toolStatus: null }
                  : msg
              ));
              return; // Exit the loop
            }
          } catch (e) { console.error("Error parsing JSON:", e, jsonStr); }
        }
      }
    } catch (error) {
      console.error("Fetch error:", error);
      setMessages(prev => prev.map(msg =>
        msg.id === aiResponsePlaceholder.id
          ? { ...msg, content: "Sorry, I encountered an error. Please try again.", isLoading: false }
          : msg
      ));
    } finally {
      // Ensure streaming is always turned off, even if the stream breaks unexpectedly
      setIsStreaming(false);
      setMessages(prev => prev.map(msg =>
        msg.id === aiResponsePlaceholder.id
          ? { ...msg, isLoading: false }
          : msg
      ));
    }
  };

  const startNewChat = () => {
    if (user) {
      setMessages([
        { id: Date.now(), content: `Hello, ${user.username}! How can I help you today?`, isUser: false }
      ]);
    }
  };

  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file || !token) return;

    setIsUploading(true);
    const formData = new FormData();
    formData.append("file", file);

    try {
      const response = await fetch(`${API_URL}/upload-policy`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
        body: formData,
      });

      if (!response.ok) throw new Error("Upload failed");
      const data = await response.json();
      setModules(data.modules || []);

      // Notify in chat
      setMessages(prev => [...prev, {
        id: Date.now(),
        content: `Successfully uploaded ${file.name} and extracted ${data.modules?.length || 0} training modules!`,
        isUser: false
      }]);
    } catch (error) {
      console.error("Upload error:", error);
      alert("Failed to upload and process PDF.");
    } finally {
      setIsUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  const playAudio = async (text: string, messageId: number) => {
    if (!token || !text || playingAudioId !== null) return;

    setPlayingAudioId(messageId);
    try {
      // Split text into chunks to avoid NVIDIA Riva length limits
      const MAX_CHUNK_LENGTH = 400;
      const sentences = text.match(/[^.!?]+[.!?]+/g) || [text];
      const chunks: string[] = [];
      let currentChunk = "";

      for (const sentence of sentences) {
        if (currentChunk.length + sentence.length > MAX_CHUNK_LENGTH) {
          if (currentChunk.trim()) chunks.push(currentChunk.trim());
          currentChunk = sentence;
        } else {
          currentChunk += " " + sentence;
        }
      }
      if (currentChunk.trim()) chunks.push(currentChunk.trim());

      const audioBlobs: Blob[] = [];

      // Fetch all chunks
      for (const chunk of chunks) {
        const response = await fetch(`${API_URL}/tts`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
          body: JSON.stringify({ text: chunk, language_code: selectedLanguage.code }),
        });

        if (!response.ok) throw new Error('Audio generation failed for a segment');
        audioBlobs.push(await response.blob());
      }

      // Play segments sequentially
      let currentIndex = 0;
      const playNext = () => {
        if (currentIndex >= audioBlobs.length) {
          setPlayingAudioId(null);
          return;
        }

        const url = URL.createObjectURL(audioBlobs[currentIndex]);
        const audio = new Audio(url);

        audio.onended = () => {
          URL.revokeObjectURL(url);
          currentIndex++;
          playNext();
        };

        audio.onerror = () => {
          console.error("Audio playback error");
          setPlayingAudioId(null);
        };

        audio.play().catch(err => {
          console.error("Playback failed:", err);
          setPlayingAudioId(null);
        });
      };

      playNext();
    } catch (error) {
      console.error("TTS error:", error);
      setPlayingAudioId(null);
    }
  };

  const generateQuiz = async () => {
    if (!activeModule || !token) return;
    setIsQuizLoading(true);
    setQuizQuestions(null);
    setShowQuizResults(false);
    setUserAnswers({});
    setCurrentQuizIndex(0);

    try {
      const response = await fetch(`${API_URL}/generate-quiz`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({ module_content: activeModule.summary, language: selectedLanguage.name })
      });
      if (!response.ok) throw new Error("Failed to generate quiz");
      const data = await response.json();
      setQuizQuestions(data.questions);

      // Auto scroll to quiz
      setTimeout(() => {
        document.getElementById('quiz-section-anchor')?.scrollIntoView({ behavior: 'smooth' });
      }, 100);
    } catch (err) {
      console.error(err);
    } finally {
      setIsQuizLoading(false);
    }
  };

  const handleOptionSelect = (option: string) => {
    setUserAnswers(prev => ({ ...prev, [currentQuizIndex]: option }));
  };

  const handleNextQuestion = async () => {
    if (quizQuestions && currentQuizIndex < quizQuestions.length - 1) {
      setCurrentQuizIndex(prev => prev + 1);
    } else {
      setShowQuizResults(true);
      // Automatically record module progress when finished
      if (activeModule && token) {
        setIsRecordingProgress(true);
        try {
          const res = await fetch(`${API_URL}/record-progress`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
            body: JSON.stringify({ module_title: activeModule.title })
          });
          if (res.ok) {
            await fetchUserProfile(); // Refresh user profile to immediately show the checkmark 
          }
        } catch (e) {
          console.error(e);
        } finally {
          setIsRecordingProgress(false);
        }
      }
    }
  };

  return (
    <div className="w-full h-full flex bg-[#131314] text-white overflow-hidden relative">
      <Header onNewChat={startNewChat} />

      {/* Sidebar for Modules and Settings */}
      <div className={`transition-all duration-300 ${sidebarOpen ? 'w-80' : 'w-0'} bg-[#1E1F20] border-r border-gray-700 overflow-y-auto flex-shrink-0 flex flex-col pt-20 hidden md:flex`}>
        <div className="p-4 flex-grow">
          <h2 className="text-xl font-bold mb-6 text-gray-200">Training Setup</h2>

          <div className="mb-8">
            <h3 className="text-sm font-semibold text-gray-400 mb-2 uppercase tracking-wider">Interface Language</h3>
            <select
              value={selectedLanguage.code}
              onChange={(e) => setSelectedLanguage(LANGUAGES.find(l => l.code === e.target.value) || LANGUAGES[0])}
              className="w-full bg-[#2f3031] border border-gray-600 rounded-lg p-2.5 text-white focus:ring-2 focus:ring-blue-500 outline-none"
            >
              {LANGUAGES.map(lang => (
                <option key={lang.code} value={lang.code}>{lang.name}</option>
              ))}
            </select>
          </div>

          <div className="mb-8">
            <h3 className="text-sm font-semibold text-gray-400 mb-2 uppercase tracking-wider">Policy Documents</h3>
            <button
              onClick={() => fileInputRef.current?.click()}
              disabled={isUploading}
              className="w-full flex items-center justify-center space-x-2 bg-gray-700 hover:bg-gray-600 border border-gray-600 rounded-lg p-3 transition-colors disabled:opacity-50"
            >
              <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-5 h-5">
                <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5m-13.5-9L12 3m0 0l4.5 4.5M12 3v13.5" />
              </svg>
              <span>{isUploading ? 'Processing...' : 'Upload PDF Policy'}</span>
            </button>
            <input
              type="file"
              accept=".pdf"
              className="hidden"
              ref={fileInputRef}
              onChange={handleFileUpload}
            />
          </div>

          <div className="mb-8 p-4 bg-gray-800/50 rounded-xl border border-gray-700">
            <h3 className="text-sm font-bold text-gray-400 uppercase tracking-widest mb-3">Overall Progress</h3>
            <div className="flex items-center justify-between mb-2">
              <span className="text-2xl font-bold text-white">{progressPercent}%</span>
              <span className="text-xs text-gray-400">{completedCount} of {modules.length} Modules</span>
            </div>
            <div className="w-full h-2 bg-gray-700 rounded-full overflow-hidden">
              <div
                className="h-full bg-gradient-to-r from-blue-500 to-purple-500 transition-all duration-1000 ease-in-out"
                style={{ width: `${progressPercent}%` }}
              ></div>
            </div>
          </div>

          <div>
            <h3 className="text-sm font-semibold text-gray-400 mb-3 uppercase tracking-wider">Extracted Modules</h3>
            {modules.length === 0 ? (
              <div className="text-center p-4 border border-dashed border-gray-700 rounded-lg text-gray-500 text-sm">
                Upload a policy PDF to generate training modules automatically.
              </div>
            ) : (
              <div className="space-y-3">
                {modules.map(mod => (
                  <div
                    key={mod.id}
                    onClick={() => { setActiveModule(mod); setQuizQuestions(null); setIsQuizLoading(false); }}
                    className={`p-3 rounded-lg border transition-colors cursor-pointer group relative ${activeModule?.id === mod.id ? 'bg-blue-900/30 border-blue-500' : 'bg-gray-800 border-gray-700 hover:border-blue-500'}`}
                  >
                    <div className="flex justify-between items-start">
                      <h4 className={`font-semibold text-sm pr-6 leading-tight ${activeModule?.id === mod.id ? 'text-blue-400' : 'text-gray-200 group-hover:text-blue-400'}`}>
                        {mod.title}
                      </h4>
                      {completedMap[mod.title] && (
                        <div className="absolute top-3 right-3 w-5 h-5 bg-green-500/20 rounded-full flex items-center justify-center border border-green-500/50" title="Completed">
                          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-3 h-3 text-green-400">
                            <path fillRule="evenodd" d="M19.916 4.626a.75.75 0 0 1 .208 1.04l-9 13.5a.75.75 0 0 1-1.154.114l-6-6a.75.75 0 0 1 1.06-1.06l5.353 5.353 8.493-12.74a.75.75 0 0 1 1.04-.207Z" clipRule="evenodd" />
                          </svg>
                        </div>
                      )}
                    </div>
                    <p className="text-xs text-gray-400 mt-2 line-clamp-2">
                      {mod.summary}
                    </p>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col items-center relative h-full">
        {/* Toggle Sidebar Button */}
        <button
          onClick={() => setSidebarOpen(!sidebarOpen)}
          className="absolute left-0 top-1/2 transform -translate-y-1/2 p-1 bg-gray-800 rounded-r-lg border border-l-0 border-gray-700 text-gray-400 hover:text-white z-20 hidden md:block"
        >
          <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-4 h-4">
            <path strokeLinecap="round" strokeLinejoin="round" d={sidebarOpen ? "M15.75 19.5L8.25 12l7.5-7.5" : "M8.25 4.5l7.5 7.5-7.5 7.5"} />
          </svg>
        </button>

        {activeModule ? (
          // Microlearning Session View
          <div className="flex-grow w-full max-w-4xl overflow-y-auto px-6 pt-24 pb-10 flex flex-col items-center animate-in fade-in duration-500 h-full">
            <div className="w-full bg-[#1E1F20] rounded-2xl shadow-2xl overflow-hidden border border-gray-700/50 flex-shrink-0">
              {/* Header Section */}
              <div className="bg-gradient-to-r from-blue-900/50 to-purple-900/50 p-8 border-b border-gray-700 flex justify-between items-start">
                <div>
                  <div className="text-blue-400 text-sm font-bold uppercase tracking-widest mb-2">Microlearning Module</div>
                  <h2 className="text-3xl font-bold text-white leading-tight">
                    {isTranslating ? 'Translating...' : (translatedModule ? translatedModule.title : activeModule.title)}
                  </h2>
                </div>

                <div className="flex items-center space-x-3">
                  <button
                    onClick={generateQuiz}
                    disabled={isQuizLoading}
                    className="flex items-center space-x-2 px-6 py-2 rounded-full transition-all shadow-lg bg-indigo-600 hover:bg-indigo-500 text-white backdrop-blur-md font-bold uppercase disabled:opacity-50"
                  >
                    {isQuizLoading ? 'Generating...' : 'Quiz'}
                  </button>

                  <button
                    onClick={() => playAudio(translatedModule ? translatedModule.summary : activeModule.summary, activeModule.id + 10000)} // Offset ID to avoid collision
                    disabled={isTranslating || (playingAudioId !== null && playingAudioId !== (activeModule.id + 10000))}
                    className={`flex items-center space-x-2 px-4 py-2 rounded-full transition-all shadow-lg ${playingAudioId === (activeModule.id + 10000)
                      ? 'bg-blue-600 text-white animate-pulse'
                      : 'bg-white/10 hover:bg-white/20 text-white backdrop-blur-md'
                      }`}
                  >
                    {playingAudioId === (activeModule.id + 10000) ? (
                      <>
                        <div className="w-4 h-4 flex items-center justify-center">
                          <div className="w-1 h-2 bg-white animate-bounce"></div>
                          <div className="w-1 h-3 bg-white animate-bounce delay-75 mx-0.5"></div>
                          <div className="w-1 h-2 bg-white animate-bounce delay-150"></div>
                        </div>
                        <span className="text-sm font-semibold">Playing Audio...</span>
                      </>
                    ) : (
                      <>
                        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-5 h-5">
                          <path d="M13.5 4.06c0-1.336-1.616-2.005-2.56-1.06l-4.5 4.5H4.508c-1.141 0-2.318.664-2.66 1.905A9.76 9.76 0 0 0 1.5 12c0 .898.121 1.768.35 2.595.341 1.24 1.518 1.905 2.659 1.905h1.93l4.5 4.5c.945.945 2.561.276 2.561-1.06V4.06ZM18.584 5.106a.75.75 0 0 1 1.06 0c3.808 3.807 3.808 9.98 0 13.788a.75.75 0 0 1-1.06-1.06 8.25 8.25 0 0 0 0-11.668.75.75 0 0 1 0-1.06Z" />
                          <path d="M15.932 7.757a.75.75 0 0 1 1.061 0 6 6 0 0 1 0 8.486.75.75 0 0 1-1.06-1.061 4.5 4.5 0 0 0 0-6.364.75.75 0 0 1 0-1.06Z" />
                        </svg>
                        <span className="text-sm font-semibold">Listen</span>
                      </>
                    )}
                  </button>
                </div>
              </div>

              {/* Content Section */}
              <div className="p-8 pb-12">
                <div className="prose prose-invert prose-lg max-w-none text-gray-300 leading-relaxed whitespace-pre-wrap">
                  {isTranslating ? (
                    <div className="flex items-center space-x-2 text-gray-500 italic">
                      <div className="w-4 h-4 border-2 border-gray-500 border-t-transparent rounded-full animate-spin"></div>
                      <span>Translating content to {selectedLanguage.name}...</span>
                    </div>
                  ) : (
                    translatedModule ? translatedModule.summary : activeModule.summary
                  )}
                </div>
              </div>

              {/* Quiz Section */}
              <div id="quiz-section-anchor"></div>
              {(quizQuestions || isQuizLoading) && (
                <div className="p-8 border-t border-gray-700 bg-[#151618]">
                  {isQuizLoading ? (
                    <div className="text-center text-gray-400 py-8 flex flex-col items-center justify-center space-y-4">
                      <div className="w-8 h-8 border-4 border-indigo-500 border-t-transparent rounded-full animate-spin"></div>
                      <p>Generating your interactive quiz using AI...</p>
                    </div>
                  ) : quizQuestions ? (
                    showQuizResults ? (
                      <div className="text-center py-6 animate-in zoom-in duration-300">
                        <h3 className="text-3xl font-bold text-white mb-4">Quiz Results 🎯</h3>
                        <p className="text-xl text-gray-300 mb-6">
                          You scored <span className="text-blue-400 font-bold">{Object.entries(userAnswers).filter(([idx, ans]) => quizQuestions[parseInt(idx)].answer === ans).length}</span> out of {quizQuestions.length}!
                        </p>
                        <button onClick={() => { setQuizQuestions(null); setShowQuizResults(false); }} className="px-8 py-3 bg-indigo-600 text-white rounded-full font-bold hover:bg-indigo-500 transition-colors">
                          Close Quiz
                        </button>
                      </div>
                    ) : (
                      <div className="py-4 animate-in slide-in-from-bottom-4 duration-500">
                        <div className="flex justify-between items-center mb-6 border-b border-gray-700 pb-4">
                          <h3 className="text-xl font-bold text-white">Knowledge Check</h3>
                          <span className="text-sm font-semibold bg-indigo-900/50 text-indigo-300 px-3 py-1 rounded-full border border-indigo-700/50">
                            Question {currentQuizIndex + 1} of {quizQuestions.length}
                          </span>
                        </div>

                        <p className="text-xl font-medium text-gray-100 mb-8">{quizQuestions[currentQuizIndex].question}</p>

                        <div className="space-y-4">
                          {quizQuestions[currentQuizIndex].options.map((opt, i) => (
                            <button
                              key={i}
                              onClick={() => handleOptionSelect(opt)}
                              className={`w-full text-left p-5 rounded-xl border-2 transition-all ${userAnswers[currentQuizIndex] === opt
                                ? 'border-indigo-500 bg-indigo-900/30 text-white shadow-[0_0_15px_rgba(99,102,241,0.2)]'
                                : 'border-gray-700 bg-[#1E1F20] text-gray-300 hover:border-gray-500 hover:bg-gray-800'
                                }`}
                            >
                              <div className="flex items-center space-x-3">
                                <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center ${userAnswers[currentQuizIndex] === opt ? 'border-indigo-400' : 'border-gray-500'}`}>
                                  {userAnswers[currentQuizIndex] === opt && <div className="w-2.5 h-2.5 bg-indigo-400 rounded-full" />}
                                </div>
                                <span className="text-lg">{opt}</span>
                              </div>
                            </button>
                          ))}
                        </div>

                        <div className="mt-10 flex justify-end">
                          <button
                            disabled={!userAnswers[currentQuizIndex]}
                            onClick={handleNextQuestion}
                            className="px-8 py-3 bg-white text-black font-bold text-lg rounded-full hover:bg-gray-200 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
                          >
                            {currentQuizIndex < quizQuestions.length - 1 ? 'Next Question' : 'Finish Quiz'}
                          </button>
                        </div>
                      </div>
                    )
                  ) : null}
                </div>
              )}
            </div>

            {/* Return to Chat Button */}
            <button
              onClick={() => setActiveModule(null)}
              className="mt-8 text-gray-400 hover:text-white flex items-center space-x-2 transition-colors"
            >
              <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-4 h-4">
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 15L3 9m0 0l6-6M3 9h12a6 6 0 010 12h-3" />
              </svg>
              <span>Return to Q&A Chat</span>
            </button>
          </div>
        ) : (
          // Standard Q&A Chat View
          <>

            <div className="flex-grow w-full max-w-4xl overflow-y-auto px-4 pt-20 pb-10">
              {messages.map((message) => (
                <div key={message.id} className={`flex flex-col items-start ${message.isUser ? 'items-end' : ''} mb-6`}>
                  <div className={`text-sm font-bold mb-2 flex items-center space-x-2 ${message.isUser ? "text-blue-400 justify-end" : "text-gray-300"}`}>
                    <span>{message.isUser ? user?.username : "PolicySpeakAI"}</span>
                    {!message.isUser && message.content && !message.isLoading && (
                      <button
                        onClick={() => playAudio(message.content, message.id)}
                        disabled={playingAudioId !== null && playingAudioId !== message.id}
                        className="p-1 rounded-full hover:bg-gray-700 transition-colors text-gray-400 hover:text-white"
                        title="Read Aloud"
                      >
                        {playingAudioId === message.id ? (
                          <div className="w-4 h-4 flex items-center justify-center">
                            <div className="w-1 h-2 bg-blue-400 animate-bounce"></div>
                            <div className="w-1 h-3 bg-blue-400 animate-bounce delay-75 mx-0.5"></div>
                            <div className="w-1 h-2 bg-blue-400 animate-bounce delay-150"></div>
                          </div>
                        ) : (
                          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-4 h-4">
                            <path d="M13.5 4.06c0-1.336-1.616-2.005-2.56-1.06l-4.5 4.5H4.508c-1.141 0-2.318.664-2.66 1.905A9.76 9.76 0 0 0 1.5 12c0 .898.121 1.768.35 2.595.341 1.24 1.518 1.905 2.659 1.905h1.93l4.5 4.5c.945.945 2.561.276 2.561-1.06V4.06ZM18.584 5.106a.75.75 0 0 1 1.06 0c3.808 3.807 3.808 9.98 0 13.788a.75.75 0 0 1-1.06-1.06 8.25 8.25 0 0 0 0-11.668.75.75 0 0 1 0-1.06Z" />
                            <path d="M15.932 7.757a.75.75 0 0 1 1.061 0 6 6 0 0 1 0 8.486.75.75 0 0 1-1.06-1.061 4.5 4.5 0 0 0 0-6.364.75.75 0 0 1 0-1.06Z" />
                          </svg>
                        )}
                      </button>
                    )}
                  </div>
                  <div className={`py-3 px-5 max-w-xl break-words whitespace-pre-wrap rounded-2xl ${message.isUser ? 'bg-gradient-to-br from-blue-600 to-purple-600 text-white' : 'bg-[#1E1F20] text-gray-200 shadow-sm border border-gray-700/50'}`}>
                    {message.toolStatus && <div className="text-xs text-gray-400 italic pb-2 border-b border-gray-600 mb-2">{message.toolStatus}</div>}
                    {message.isLoading && !message.content && !message.toolStatus ? <TypingAnimation /> : message.content}
                  </div>
                </div>
              ))}
              <div ref={messagesEndRef} />
            </div>

            <div className="w-full flex-shrink-0 flex justify-center pb-4">
              <InputBar currentMessage={currentMessage} setCurrentMessage={setCurrentMessage} onSubmit={handleSubmit} isStreaming={isStreaming} />
            </div>
          </>
        )}
      </div>
    </div >
  );
};

const AuthPage = () => {
  const { setToken } = useAuth();
  const [username, setUsername] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isLogin, setIsLogin] = useState(true);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleAuth = async (e: FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    const url = `${API_URL}/${isLogin ? 'login' : 'signup'}`;
    const headers = isLogin ? { 'Content-Type': 'application/x-www-form-urlencoded' } : { 'Content-Type': 'application/json' };
    const body = isLogin ? new URLSearchParams({ username: email, password }) : JSON.stringify({ username, email, password });

    try {
      const response = await fetch(url, { method: 'POST', headers, body });
      const data = await response.json();
      if (!response.ok) throw new Error(data.detail || 'Authentication failed');
      setToken(data.access_token);
    } catch (err: unknown) {
      if (err instanceof Error) {
        setError(err.message);
      } else {
        setError('An unknown error occurred.');
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="w-full max-w-md mx-auto p-8 bg-[#1E1F20] rounded-2xl shadow-lg border border-gray-700 text-white">
      <h2 className="text-3xl font-bold text-center text-gray-200 mb-2">{isLogin ? 'Welcome Back' : 'Create Account'}</h2>
      <p className="text-center text-gray-400 mb-8">to PolicySpeakAI, your Vernacular Employee Training Bot</p>
      <form onSubmit={handleAuth}>
        {!isLogin && <input type="text" value={username} onChange={(e) => setUsername(e.target.value)} placeholder="Username" required className="w-full px-4 py-3 mb-4 bg-[#2f3031] border border-gray-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500" />}
        <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="Email Address" required className="w-full px-4 py-3 mb-4 bg-[#2f3031] border border-gray-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500" />
        <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Password" required minLength={6} className="w-full px-4 py-3 mb-6 bg-[#2f3031] border border-gray-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500" />
        {error && <p className="text-red-400 text-sm mb-4 text-center">{error}</p>}
        <button type="submit" disabled={loading} className="w-full bg-gradient-to-r from-blue-500 to-purple-500 text-white py-3 rounded-lg font-semibold hover:from-blue-600 hover:to-purple-600 disabled:opacity-50">
          {loading ? 'Processing...' : (isLogin ? 'Login' : 'Sign Up')}
        </button>
      </form>
      <p className="text-center text-sm text-gray-400 mt-6">
        {isLogin ? "Don't have an account?" : "Already have an account?"}
        <button onClick={() => { setIsLogin(!isLogin); setError(''); }} className="text-blue-400 hover:text-blue-300 font-semibold ml-1">
          {isLogin ? 'Sign Up' : 'Login'}
        </button>
      </p>
    </div>
  );
};

// --- Main App Component ---
export default function Home() {
  return (
    <AuthProvider>
      <main className="flex justify-center items-center bg-[#131314] min-h-screen h-screen">
        <AppContent />
      </main>
    </AuthProvider>
  );
}

const AppContent = () => {
  const { token, isLoading } = useAuth();

  if (isLoading) {
    return <div className="text-white">Loading Session...</div>;
  }

  return (
    <div className="w-full h-full flex justify-center items-center">
      {token ? <ChatPage /> : <AuthPage />}
    </div>
  );
};