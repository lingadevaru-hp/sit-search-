import React, { useState, useRef, useEffect } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import remarkMath from 'remark-math';
import rehypeKatex from 'rehype-katex';
import { Message, Role, SourceType, Citation } from '../types';
import { Button } from './ui/Button';
import { ArrowUp, Globe, Search, Lock, Sparkles, BookOpen, Plus, Mic, Square, X, Volume2, Loader2, Pause, Play, AudioLines } from 'lucide-react';
import { transcribeAudio, generateSpeech } from '../services/geminiService';
import { LiveVoiceInterface } from './LiveVoiceInterface';

interface ChatInterfaceProps {
  messages: Message[];
  isLoading: boolean;
  onSendMessage: (content: string, enableWebSearch?: boolean) => void;
  onNewChat: () => void;
  userRole: Role;
}

const blobToBase64 = (blob: Blob): Promise<string> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => {
        const base64data = reader.result as string;
        resolve(base64data.split(',')[1]);
    };
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
};

function decode(base64: string) {
    const binaryString = atob(base64);
    const len = binaryString.length;
    const bytes = new Uint8Array(len);
    for (let i = 0; i < len; i++) {
      bytes[i] = binaryString.charCodeAt(i);
    }
    return bytes;
}

export const ChatInterface: React.FC<ChatInterfaceProps> = ({ 
  messages, 
  isLoading, 
  onSendMessage,
  onNewChat,
  userRole 
}) => {
  const [input, setInput] = useState('');
  const [isLiveMode, setIsLiveMode] = useState(false);
  
  // Audio Recording States
  const [recordingState, setRecordingState] = useState<'idle' | 'recording' | 'transcribing'>('idle');
  const [recordingDuration, setRecordingDuration] = useState(0);
  
  // Audio Playback States
  const [activeAudioId, setActiveAudioId] = useState<string | null>(null);
  const [audioStatus, setAudioStatus] = useState<'loading' | 'playing' | 'paused' | 'idle'>('idle');

  const audioContextRef = useRef<AudioContext | null>(null);
  const audioSourceRef = useRef<AudioBufferSourceNode | null>(null);
  const audioBufferRef = useRef<AudioBuffer | null>(null);
  const startedAtRef = useRef<number>(0);
  const pausedAtRef = useRef<number>(0);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<number | null>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages, isLoading, recordingState]);

  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
      textareaRef.current.style.height = `${Math.min(textareaRef.current.scrollHeight, 200)}px`;
    }
  }, [input]);

  useEffect(() => {
    if (recordingState === 'recording') {
        timerRef.current = window.setInterval(() => {
            setRecordingDuration(prev => prev + 1);
        }, 1000);
    } else {
        if (timerRef.current) clearInterval(timerRef.current);
        setRecordingDuration(0);
    }
    return () => {
        if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [recordingState]);

  useEffect(() => {
      return () => {
          stopAudio();
          if (audioContextRef.current) {
              audioContextRef.current.close();
          }
      };
  }, []);

  const stopAudio = () => {
      if (audioSourceRef.current) {
          try {
              audioSourceRef.current.stop();
          } catch (e) {}
          audioSourceRef.current = null;
      }
      setAudioStatus('idle');
      setActiveAudioId(null);
      pausedAtRef.current = 0;
      startedAtRef.current = 0;
  };

  const handleNewChat = () => {
      stopAudio(); 
      onNewChat();
  };

  const handleSubmit = (e?: React.FormEvent) => {
    e?.preventDefault();
    if (!input.trim() || isLoading) return;
    stopAudio();
    onSendMessage(input);
    setInput('');
    if (textareaRef.current) textareaRef.current.style.height = 'auto';
  };

  const handleWebSearchApproval = () => {
     stopAudio();
     onSendMessage("Yes, please search the web.", true);
  };

  const startRecording = async () => {
      stopAudio(); 
      try {
          const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
          const mediaRecorder = new MediaRecorder(stream, { mimeType: 'audio/webm' });
          mediaRecorderRef.current = mediaRecorder;
          audioChunksRef.current = [];

          mediaRecorder.ondataavailable = (event) => {
              if (event.data.size > 0) {
                  audioChunksRef.current.push(event.data);
              }
          };

          mediaRecorder.start();
          setRecordingState('recording');
      } catch (err) {
          console.error("Error accessing microphone:", err);
          alert("Could not access microphone. Please check permissions.");
      }
  };

  const stopAndTranscribe = () => {
      if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
          setRecordingState('transcribing');
          
          mediaRecorderRef.current.onstop = async () => {
              const audioBlob = new Blob(audioChunksRef.current, { type: 'audio/webm' });
              mediaRecorderRef.current?.stream.getTracks().forEach(track => track.stop());
              
              const base64Audio = await blobToBase64(audioBlob);
              if (base64Audio) {
                  const text = await transcribeAudio(base64Audio);
                  if (text) setInput(text);
              }
              setRecordingState('idle');
          };
          mediaRecorderRef.current.stop();
      }
  };

  const cancelRecording = () => {
      if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
          mediaRecorderRef.current.onstop = () => {
              mediaRecorderRef.current?.stream.getTracks().forEach(track => track.stop());
          };
          mediaRecorderRef.current.stop();
      }
      setRecordingState('idle');
  };

  const handleAudioControl = async (text: string, messageId: string) => {
      if (activeAudioId !== messageId) {
          stopAudio();
          setActiveAudioId(messageId);
          setAudioStatus('loading');
          
          try {
             const base64Audio = await generateSpeech(text);
             if (!base64Audio) throw new Error("Audio generation failed");

             if (!audioContextRef.current) {
                audioContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)({sampleRate: 24000});
             }
             const ctx = audioContextRef.current;
             if (ctx.state === 'suspended') await ctx.resume();

             const audioBytes = decode(base64Audio);
             const dataInt16 = new Int16Array(audioBytes.buffer);
             const buffer = ctx.createBuffer(1, dataInt16.length, 24000);
             const channelData = buffer.getChannelData(0);
             for (let i = 0; i < dataInt16.length; i++) {
                 channelData[i] = dataInt16[i] / 32768.0;
             }
             
             audioBufferRef.current = buffer;
             playBufferFrom(0);

          } catch (e) {
              setAudioStatus('idle');
              setActiveAudioId(null);
          }
          return;
      }

      if (audioStatus === 'playing') pauseAudio();
      else if (audioStatus === 'paused') resumeAudio();
  };

  const playBufferFrom = (offset: number) => {
      if (!audioContextRef.current || !audioBufferRef.current) return;
      const ctx = audioContextRef.current;
      const source = ctx.createBufferSource();
      source.buffer = audioBufferRef.current;
      source.connect(ctx.destination);
      source.onended = () => {
         if (pausedAtRef.current === 0) { 
             setAudioStatus('idle');
             setActiveAudioId(null);
         }
      };
      audioSourceRef.current = source;
      startedAtRef.current = ctx.currentTime - offset;
      pausedAtRef.current = 0;
      source.start(0, offset);
      setAudioStatus('playing');
  };

  const pauseAudio = () => {
      if (!audioContextRef.current || !audioSourceRef.current) return;
      const elapsed = audioContextRef.current.currentTime - startedAtRef.current;
      pausedAtRef.current = elapsed;
      try { audioSourceRef.current.stop(); } catch(e) {}
      setAudioStatus('paused');
  };

  const resumeAudio = () => {
      if (!audioBufferRef.current) return;
      playBufferFrom(pausedAtRef.current);
  };

  const formatTime = (seconds: number) => {
      const mins = Math.floor(seconds / 60);
      const secs = seconds % 60;
      return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const renderSources = (citations: Citation[]) => {
    if (!citations || citations.length === 0) return null;
    return (
      <div className="mb-6 animate-fade-in">
        <div className="text-xs font-bold text-gray-400 dark:text-gray-500 uppercase tracking-widest mb-3 flex items-center gap-2">
            <BookOpen className="w-3 h-3" /> Sources
        </div>
        <div className="flex flex-wrap gap-2">
            {citations.slice(0, 4).map((cite, idx) => (
            <a 
                key={idx}
                href={cite.url || '#'}
                target={cite.url ? "_blank" : undefined}
                className="flex items-center space-x-2 px-4 py-2 bg-white dark:bg-[#1a1f2c] rounded-full border border-gray-100 dark:border-gray-800 hover:border-blue-400 dark:hover:border-blue-500/50 transition-all cursor-pointer no-underline group shadow-sm hover:shadow-md transform hover:-translate-y-0.5 duration-200"
            >
                <div className="flex-shrink-0 text-gray-400 group-hover:text-blue-500 transition-colors">
                    {cite.sourceType === SourceType.INTERNAL ? <Lock className="w-3.5 h-3.5" /> : <Globe className="w-3.5 h-3.5" />}
                </div>
                <div className="flex flex-col max-w-[150px]">
                    <span className="text-[11px] font-semibold text-gray-800 dark:text-gray-200 truncate leading-tight group-hover:text-blue-500">
                        {cite.title}
                    </span>
                </div>
            </a>
            ))}
        </div>
      </div>
    );
  };

  if (isLiveMode) {
      return <LiveVoiceInterface onClose={() => setIsLiveMode(false)} />;
  }

  return (
    <div className="flex-1 flex flex-col h-full bg-[#f9fafb] dark:bg-[#000000] transition-colors relative">
      
      {/* Top Right Actions */}
      <div className="absolute top-6 right-20 z-20 hidden lg:flex items-center space-x-3">
        <button
            onClick={() => setIsLiveMode(true)}
            className="flex items-center space-x-2 px-4 py-2.5 bg-indigo-500 text-white hover:bg-indigo-600 rounded-full shadow-md transition-all hover:scale-105"
        >
            <AudioLines className="w-4 h-4" />
            <span className="text-sm font-medium">Live Mode</span>
        </button>

        <button
            onClick={handleNewChat}
            className="flex items-center space-x-2 px-4 py-2.5 bg-white/80 dark:bg-sit-800/50 backdrop-blur-md border border-gray-200 dark:border-gray-700/50 text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-sit-700/50 rounded-full shadow-sm transition-all hover:scale-105"
        >
            <Plus className="w-4 h-4" />
            <span className="text-sm font-medium">New Chat</span>
        </button>
      </div>

      {/* Scrollable Messages Area */}
      <div className="flex-1 overflow-y-auto custom-scrollbar">
        <div className="max-w-4xl mx-auto p-4 md:p-8 pb-40">
        
        {messages.length === 0 ? (
          <div className="min-h-[70vh] flex flex-col items-center justify-center text-center animate-fade-in delay-100 px-4">
             
            <p className="text-gray-500 dark:text-gray-400 text-lg mb-10 max-w-lg leading-relaxed animate-slide-up" style={{animationDelay: '100ms'}}>
              Access official academic records, faculty details, and campus data instantly.
            </p>

            <div className="w-full max-w-2xl animate-slide-up" style={{animationDelay: '200ms'}}>
                <div className="bg-white dark:bg-[#0f0f10] p-2 rounded-[2rem] shadow-xl hover:shadow-2xl dark:shadow-black/50 border-none flex items-center mb-8 transition-all duration-300 relative overflow-hidden ring-0">
                     
                     {recordingState === 'idle' ? (
                        <>
                            <Search className="w-6 h-6 text-gray-400 ml-4 flex-shrink-0" />
                            <input 
                                type="text"
                                value={input}
                                onChange={(e) => setInput(e.target.value)}
                                onKeyDown={(e) => {
                                    if (e.key === 'Enter') handleSubmit();
                                }}
                                placeholder="Search students, faculty, or curriculum..."
                                className="w-full bg-transparent border-none focus:ring-0 px-4 py-4 text-lg text-gray-900 dark:text-white placeholder-gray-400 outline-none"
                            />
                            <div className="flex items-center gap-2 mr-1 flex-shrink-0">
                                <button
                                    onClick={startRecording}
                                    className="p-3 bg-gray-100 dark:bg-gray-800 text-gray-500 dark:text-gray-400 rounded-full hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors"
                                    title="Start Recording"
                                >
                                    <Mic className="w-5 h-5" />
                                </button>
                                <button 
                                    onClick={() => handleSubmit()}
                                    className="p-3 bg-blue-600 text-white rounded-full hover:bg-blue-700 transition-colors shadow-lg hover:shadow-blue-500/30"
                                >
                                    <ArrowUp className="w-5 h-5" />
                                </button>
                            </div>
                        </>
                     ) : (
                        <div className="w-full h-full flex items-center justify-between px-6 py-2 bg-red-50 dark:bg-red-900/10">
                            {recordingState === 'recording' ? (
                                <div className="flex items-center gap-3">
                                    <div className="relative">
                                        <div className="w-3 h-3 bg-red-500 rounded-full animate-pulse"></div>
                                        <div className="absolute inset-0 bg-red-500 rounded-full animate-ping opacity-20"></div>
                                    </div>
                                    <span className="text-red-600 dark:text-red-400 font-mono font-medium text-lg">
                                        Recording {formatTime(recordingDuration)}
                                    </span>
                                </div>
                            ) : (
                                <div className="flex items-center gap-3">
                                    <Loader2 className="w-5 h-5 text-blue-600 dark:text-blue-400 animate-spin" />
                                    <span className="text-blue-600 dark:text-blue-400 font-medium text-lg">
                                        Transcribing...
                                    </span>
                                </div>
                            )}

                            <div className="flex items-center gap-3">
                                <button
                                    onClick={cancelRecording}
                                    disabled={recordingState !== 'recording'}
                                    className="p-3 bg-gray-200 dark:bg-gray-800 text-gray-600 dark:text-gray-300 rounded-full hover:bg-gray-300 dark:hover:bg-gray-700 transition-colors disabled:opacity-50"
                                    title="Cancel"
                                >
                                    <X className="w-5 h-5" />
                                </button>
                                <button
                                    onClick={stopAndTranscribe}
                                    disabled={recordingState !== 'recording'}
                                    className="p-3 bg-red-500 text-white rounded-full hover:bg-red-600 transition-colors shadow-lg hover:shadow-red-500/30 disabled:opacity-50"
                                    title="Stop & Transcribe"
                                >
                                    {recordingState === 'recording' ? <Square className="w-5 h-5 fill-current" /> : <Loader2 className="w-5 h-5 animate-spin" />}
                                </button>
                            </div>
                        </div>
                     )}
                </div>

                <div className="flex flex-wrap justify-center gap-3">
                    {[
                        "HOD of MCA", 
                        "Anand R Batch 2003", 
                        "3rd Semester Students (2026)", 
                        "Faculty Contact"
                    ].map((tag, i) => (
                        <button 
                            key={i}
                            onClick={() => onSendMessage(tag)}
                            className="px-5 py-2 bg-white dark:bg-[#151516] border border-gray-200 dark:border-gray-800 rounded-full text-sm font-medium text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800 hover:text-blue-600 dark:hover:text-blue-400 transition-all duration-200 shadow-sm"
                        >
                            {tag}
                        </button>
                    ))}
                </div>
            </div>
          </div>
        ) : (
          messages.map((msg, idx) => (
            <div key={msg.id} className="mb-12 animate-slide-up">
              
              {/* User Query */}
              {msg.role === 'user' && (
                <div className="flex justify-end mb-6">
                    <div className="bg-gray-100 dark:bg-gray-800/50 px-6 py-3 rounded-3xl rounded-tr-sm max-w-[80%]">
                        <h2 className="text-xl font-medium text-gray-900 dark:text-white tracking-tight">
                            {msg.content}
                        </h2>
                    </div>
                </div>
              )}

              {/* Model Response */}
              {msg.role === 'model' && (
                <div className="relative pl-4 md:pl-0">
                  {/* Sources Bar */}
                  {renderSources(msg.citations || [])}

                  <div className="flex gap-6">
                     <div className="flex-shrink-0 mt-1 hidden md:block">
                        <div className="w-8 h-8 rounded-full bg-gradient-to-tr from-blue-500 to-teal-400 flex items-center justify-center shadow-lg">
                             <Sparkles className="w-4 h-4 text-white" />
                        </div>
                     </div>
                     
                     <div className="flex-1 min-w-0">
                        {/* Main Content */}
                        <div className="markdown-content prose prose-lg dark:prose-invert max-w-none text-gray-800 dark:text-gray-200 leading-relaxed">
                            <ReactMarkdown 
                                remarkPlugins={[remarkGfm, remarkMath]}
                                rehypePlugins={[rehypeKatex]}
                                components={{
                                    table: ({node, ...props}) => (
                                        <div className="overflow-hidden my-6 shadow-md rounded-2xl border border-gray-200 dark:border-gray-800">
                                            <div className="overflow-x-auto">
                                                <table {...props} className="w-full text-sm text-left" />
                                            </div>
                                        </div>
                                    ),
                                    thead: ({node, ...props}) => <thead {...props} className="text-xs text-gray-700 uppercase bg-gray-50 dark:bg-gray-800 dark:text-gray-400" />,
                                    th: ({node, ...props}) => <th {...props} className="px-6 py-3" />,
                                    td: ({node, ...props}) => <td {...props} className="px-6 py-4 border-b dark:border-gray-800" />,
                                    a: ({node, ...props}) => <a {...props} target="_blank" rel="noopener noreferrer" className="text-blue-500 hover:text-blue-600 hover:underline font-medium decoration-2 decoration-blue-500/30" />,
                                    ul: ({node, ...props}) => <ul {...props} className="list-disc pl-5 my-4 space-y-2 marker:text-blue-500" />,
                                    ol: ({node, ...props}) => <ol {...props} className="list-decimal pl-5 my-4 space-y-2 marker:text-blue-500" />,
                                    blockquote: ({node, ...props}) => <blockquote {...props} className="border-l-4 border-blue-500 pl-6 italic bg-gray-50 dark:bg-gray-900/30 py-4 rounded-r-2xl my-6" />
                                }}
                            >
                                {msg.content}
                            </ReactMarkdown>
                        </div>

                        {/* Web Search Permission Card */}
                        {msg.needsWebSearchApproval && (
                            <div className="mt-8 p-0.5 bg-gradient-to-r from-blue-500 to-teal-400 rounded-2xl animate-fade-in shadow-lg">
                                <div className="bg-white dark:bg-[#111111] rounded-[15px] p-5 flex items-center justify-between">
                                    <div className="flex items-center gap-4">
                                        <div className="p-2.5 bg-blue-50 dark:bg-blue-900/20 rounded-full text-blue-600">
                                            <Globe className="w-6 h-6" />
                                        </div>
                                        <div>
                                            <p className="font-bold text-gray-900 dark:text-white text-base">Expand search?</p>
                                            <p className="text-sm text-gray-500">Internal records may be incomplete.</p>
                                        </div>
                                    </div>
                                    <Button size="sm" onClick={handleWebSearchApproval} className="rounded-full px-6">
                                        Search Web
                                    </Button>
                                </div>
                            </div>
                        )}
                        
                        {/* Footer Actions */}
                        <div className="mt-8 flex items-center space-x-4 text-gray-400">
                            <button 
                                onClick={() => handleAudioControl(msg.content, msg.id)}
                                className={`p-2 rounded-full transition-colors group flex items-center gap-2 ${activeAudioId === msg.id ? 'bg-blue-100 text-blue-600 dark:bg-blue-900/30 dark:text-blue-400' : 'hover:bg-gray-100 dark:hover:bg-gray-800'}`} 
                                title={activeAudioId === msg.id && audioStatus === 'playing' ? "Pause" : "Read Aloud"}
                            >
                                {activeAudioId === msg.id && audioStatus === 'loading' ? (
                                    <Loader2 className="w-4 h-4 animate-spin" />
                                ) : activeAudioId === msg.id && audioStatus === 'playing' ? (
                                    <Pause className="w-4 h-4 fill-current" />
                                ) : activeAudioId === msg.id && audioStatus === 'paused' ? (
                                    <Play className="w-4 h-4 fill-current" />
                                ) : (
                                    <Volume2 className="w-4 h-4" />
                                )}
                                
                                {(activeAudioId === msg.id) && (
                                    <span className="text-xs font-medium">
                                        {audioStatus === 'loading' ? 'Loading...' : audioStatus === 'playing' ? 'Pause' : 'Resume'}
                                    </span>
                                )}
                            </button>
                            <div className="w-px h-4 bg-gray-200 dark:bg-gray-700"></div>
                            <button className="p-2 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-full transition-colors group" title="Copy">
                                <svg className="w-4 h-4 group-hover:text-blue-500" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" /></svg>
                            </button>
                        </div>
                     </div>
                  </div>
                </div>
              )}
            </div>
          ))
        )}
        
        {isLoading && (
          <div className="mb-12 animate-pulse pl-14">
             <div className="h-4 w-24 bg-gray-200 dark:bg-gray-800 rounded-full mb-6"></div>
             <div className="space-y-3 max-w-2xl">
                <div className="h-3 w-full bg-gray-100 dark:bg-[#111111] rounded-full"></div>
                <div className="h-3 w-5/6 bg-gray-100 dark:bg-[#111111] rounded-full"></div>
                <div className="h-3 w-4/6 bg-gray-100 dark:bg-[#111111] rounded-full"></div>
             </div>
          </div>
        )}
        </div>
      </div>

      {/* Persistent Bottom Search Bar */}
      {messages.length > 0 && !isLiveMode && (
        <div className="bg-gradient-to-t from-white via-white to-transparent dark:from-black dark:via-black dark:to-transparent pt-10 pb-6 px-4 z-10 sticky bottom-0">
            <div className="max-w-3xl mx-auto">
                <div className="bg-white dark:bg-[#151516] rounded-[2rem] shadow-xl dark:shadow-black border-none relative focus-within:ring-0 transition-all overflow-hidden">
                    {recordingState === 'idle' ? (
                        <form onSubmit={handleSubmit} className="flex items-end p-2.5">
                            <textarea
                                ref={textareaRef}
                                value={input}
                                onChange={(e) => setInput(e.target.value)}
                                onKeyDown={(e) => {
                                    if (e.key === 'Enter' && !e.shiftKey) {
                                    e.preventDefault();
                                    handleSubmit();
                                    }
                                }}
                                placeholder="Ask a follow-up question..."
                                className="w-full bg-transparent text-gray-900 dark:text-white px-5 py-3 focus:outline-none resize-none max-h-[150px] min-h-[50px] placeholder-gray-400 outline-none border-none ring-0"
                                rows={1}
                            />
                            <div className="flex items-center pb-1 pr-1 gap-2">
                                <button
                                    onClick={startRecording}
                                    type="button"
                                    className="p-3 bg-gray-100 dark:bg-gray-800 text-gray-500 dark:text-gray-400 rounded-full hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors"
                                    title="Record Audio"
                                >
                                    <Mic className="w-5 h-5" />
                                </button>
                                <button
                                    type="submit"
                                    disabled={!input.trim() || isLoading}
                                    className="p-3 bg-blue-600 text-white rounded-full hover:bg-blue-700 disabled:opacity-50 disabled:hover:bg-blue-600 transition-all shadow-md"
                                >
                                    <ArrowUp className="w-5 h-5" />
                                </button>
                            </div>
                        </form>
                    ) : (
                        <div className="w-full h-[76px] flex items-center justify-between px-6 bg-red-50 dark:bg-red-900/10">
                            {recordingState === 'recording' ? (
                                <div className="flex items-center gap-3">
                                    <div className="relative flex-shrink-0">
                                        <div className="w-3 h-3 bg-red-500 rounded-full animate-pulse"></div>
                                        <div className="absolute inset-0 bg-red-500 rounded-full animate-ping opacity-20"></div>
                                    </div>
                                    <span className="text-red-600 dark:text-red-400 font-mono font-medium text-lg">
                                        {formatTime(recordingDuration)}
                                    </span>
                                </div>
                            ) : (
                                <div className="flex items-center gap-3">
                                    <Loader2 className="w-5 h-5 text-blue-600 dark:text-blue-400 animate-spin" />
                                    <span className="text-blue-600 dark:text-blue-400 font-medium text-lg">
                                        Processing...
                                    </span>
                                </div>
                            )}

                            <div className="flex items-center gap-3">
                                <button
                                    onClick={cancelRecording}
                                    disabled={recordingState !== 'recording'}
                                    className="p-3 bg-gray-200 dark:bg-gray-800 text-gray-600 dark:text-gray-300 rounded-full hover:bg-gray-300 dark:hover:bg-gray-700 transition-colors disabled:opacity-50"
                                    title="Cancel"
                                >
                                    <X className="w-5 h-5" />
                                </button>
                                <button
                                    onClick={stopAndTranscribe}
                                    disabled={recordingState !== 'recording'}
                                    className="p-3 bg-red-500 text-white rounded-full hover:bg-red-600 transition-colors shadow-lg hover:shadow-red-500/30 disabled:opacity-50"
                                    title="Stop & Transcribe"
                                >
                                    {recordingState === 'recording' ? <Square className="w-5 h-5 fill-current" /> : <Loader2 className="w-5 h-5 animate-spin" />}
                                </button>
                            </div>
                        </div>
                    )}
                </div>
            </div>
        </div>
      )}
    </div>
  );
};