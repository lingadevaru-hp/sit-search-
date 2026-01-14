import React, { useState, useRef, useEffect, useCallback } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import remarkMath from 'remark-math';
import rehypeKatex from 'rehype-katex';
import { Message, Role, SourceType, Citation } from '../types';
import { Button } from './ui/Button';
import {
    ArrowUp, Globe, Search, Lock, Sparkles, BookOpen, Plus, Mic, Square, X,
    Volume2, Loader2, Pause, Play, AudioLines, AlertCircle, ExternalLink,
    Database, RefreshCw, StopCircle
} from 'lucide-react';
import { transcribeAudio, generateSpeech } from '../services/geminiService';
import { LiveVoiceInterface } from './LiveVoiceInterface';

// Error Boundary for Live Mode
class LiveModeErrorBoundary extends React.Component<
    { children: React.ReactNode; onError: () => void },
    { hasError: boolean }
> {
    constructor(props: { children: React.ReactNode; onError: () => void }) {
        super(props);
        this.state = { hasError: false };
    }

    static getDerivedStateFromError() {
        return { hasError: true };
    }

    componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
        console.error('Live Mode Error:', error, errorInfo);
        this.props.onError();
    }

    render() {
        if (this.state.hasError) {
            return (
                <div className="absolute inset-0 z-50 bg-[#0f0f10] flex flex-col items-center justify-center">
                    <div className="text-center space-y-6 p-8">
                        <AlertCircle className="w-16 h-16 text-red-400 mx-auto" />
                        <h2 className="text-2xl font-semibold text-white">Live Mode Error</h2>
                        <p className="text-gray-400 max-w-md">
                            There was an issue with Live Mode. Please try again.
                        </p>
                        <button
                            onClick={() => {
                                this.setState({ hasError: false });
                                this.props.onError();
                            }}
                            className="px-6 py-3 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors"
                        >
                            Go Back
                        </button>
                    </div>
                </div>
            );
        }
        return this.props.children;
    }
}

interface ChatInterfaceProps {
    messages: Message[];
    isLoading: boolean;
    onSendMessage: (content: string, enableWebSearch?: boolean) => void;
    onNewChat: () => void;
    userRole: Role;
    searchStatus?: string;
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

// Enhanced Citation Card Component
const CitationCard: React.FC<{ citation: Citation; index: number }> = ({ citation, index }) => {
    const getIcon = () => {
        switch (citation.sourceType) {
            case SourceType.INTERNAL:
                return <Database className="w-4 h-4" />;
            case SourceType.COLLEGE_WEB:
                return <BookOpen className="w-4 h-4" />;
            default:
                return <Globe className="w-4 h-4" />;
        }
    };

    const getColors = () => {
        switch (citation.sourceType) {
            case SourceType.INTERNAL:
                return 'border-purple-500/30 hover:border-purple-400 bg-purple-500/5';
            case SourceType.COLLEGE_WEB:
                return 'border-blue-500/30 hover:border-blue-400 bg-blue-500/5';
            default:
                return 'border-green-500/30 hover:border-green-400 bg-green-500/5';
        }
    };

    return (
        <a
            href={citation.url || '#'}
            target={citation.url ? "_blank" : undefined}
            rel="noopener noreferrer"
            className={`group flex items-start gap-3 p-3 rounded-xl border ${getColors()} transition-all hover:shadow-lg cursor-pointer no-underline`}
        >
            <div className="flex-shrink-0 mt-0.5 p-1.5 rounded-lg bg-white/10 text-gray-400 group-hover:text-white transition-colors">
                {getIcon()}
            </div>
            <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                    <span className="text-xs font-bold text-gray-500 bg-white/10 px-2 py-0.5 rounded">
                        [{index + 1}]
                    </span>
                    <span className="text-sm font-semibold text-gray-200 group-hover:text-white truncate">
                        {citation.title}
                    </span>
                </div>
                {citation.snippet && (
                    <p className="text-xs text-gray-500 mt-1 line-clamp-2">
                        {citation.snippet}
                    </p>
                )}
                {citation.url && (
                    <div className="flex items-center gap-1 mt-2 text-xs text-blue-400 group-hover:text-blue-300">
                        <ExternalLink className="w-3 h-3" />
                        <span className="truncate">{new URL(citation.url).hostname}</span>
                    </div>
                )}
            </div>
        </a>
    );
};

export const ChatInterface: React.FC<ChatInterfaceProps> = ({
    messages,
    isLoading,
    onSendMessage,
    onNewChat,
    userRole,
    searchStatus
}) => {
    const [input, setInput] = useState('');
    const [isLiveMode, setIsLiveMode] = useState(false);

    // Audio Recording States
    const [recordingState, setRecordingState] = useState<'idle' | 'recording' | 'transcribing'>('idle');
    const [recordingDuration, setRecordingDuration] = useState(0);

    // TTS States
    const [activeAudioId, setActiveAudioId] = useState<string | null>(null);
    const [audioStatus, setAudioStatus] = useState<'idle' | 'loading' | 'playing' | 'paused'>('idle');
    const [ttsProgress, setTtsProgress] = useState(0);

    // Refs
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
    }, [messages, isLoading]);

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

    const stopAudio = useCallback(() => {
        if (audioSourceRef.current) {
            try { audioSourceRef.current.stop(); } catch (e) { }
            audioSourceRef.current = null;
        }
        setAudioStatus('idle');
        setActiveAudioId(null);
        setTtsProgress(0);
        pausedAtRef.current = 0;
        startedAtRef.current = 0;
    }, []);

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

    // Optimized TTS with faster startup
    const handleReadAloud = async (text: string, messageId: string) => {
        if (activeAudioId === messageId) {
            if (audioStatus === 'playing') {
                pauseAudio();
            } else if (audioStatus === 'paused') {
                resumeAudio();
            }
            return;
        }

        stopAudio();
        setActiveAudioId(messageId);
        setAudioStatus('loading');

        try {
            // Clean text for better TTS
            const cleanText = text
                .replace(/\*\*/g, '')
                .replace(/\[Source:.*?\]/g, '')
                .replace(/#{1,6}\s/g, '')
                .replace(/\|/g, ', ')
                .substring(0, 1000);

            const base64Audio = await generateSpeech(cleanText);
            if (!base64Audio) throw new Error("TTS failed");

            if (!audioContextRef.current) {
                audioContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 24000 });
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
            console.error("TTS error:", e);
            setAudioStatus('idle');
            setActiveAudioId(null);
        }
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
                setTtsProgress(0);
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
        try { audioSourceRef.current.stop(); } catch (e) { }
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

    // Render citations
    const renderCitations = (citations: Citation[]) => {
        if (!citations || citations.length === 0) return null;

        return (
            <div className="mb-6 animate-fade-in">
                <div className="flex items-center gap-2 mb-3">
                    <BookOpen className="w-4 h-4 text-gray-500" />
                    <span className="text-xs font-bold text-gray-500 uppercase tracking-wider">
                        Sources ({citations.length})
                    </span>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                    {citations.slice(0, 6).map((cite, idx) => (
                        <CitationCard key={idx} citation={cite} index={idx} />
                    ))}
                </div>
            </div>
        );
    };

    if (isLiveMode) {
        return (
            <LiveModeErrorBoundary onError={() => setIsLiveMode(false)}>
                <LiveVoiceInterface onClose={() => setIsLiveMode(false)} />
            </LiveModeErrorBoundary>
        );
    }

    return (
        <div className="flex-1 flex flex-col h-full bg-[#f9fafb] dark:bg-[#000000] transition-colors relative">

            {/* Top Right Actions */}
            <div className="absolute top-6 right-20 z-20 hidden lg:flex items-center space-x-3">
                <button
                    onClick={() => setIsLiveMode(true)}
                    className="flex items-center space-x-2 px-4 py-2.5 bg-gradient-to-r from-indigo-500 to-purple-500 text-white hover:from-indigo-600 hover:to-purple-600 rounded-full shadow-lg transition-all hover:scale-105 hover:shadow-indigo-500/25"
                >
                    <AudioLines className="w-4 h-4" />
                    <span className="text-sm font-medium">Live Voice</span>
                </button>

                <button
                    onClick={handleNewChat}
                    className="flex items-center space-x-2 px-4 py-2.5 bg-white/80 dark:bg-white/10 backdrop-blur-md border border-gray-200 dark:border-gray-700/50 text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-white/20 rounded-full shadow-sm transition-all hover:scale-105"
                >
                    <Plus className="w-4 h-4" />
                    <span className="text-sm font-medium">New Search</span>
                </button>
            </div>

            {/* Scrollable Messages Area */}
            <div className="flex-1 overflow-y-auto custom-scrollbar">
                <div className="max-w-4xl mx-auto p-4 md:p-8 pb-40">

                    {messages.length === 0 ? (
                        <div className="min-h-[70vh] flex flex-col items-center justify-center text-center px-4">
                            {/* Logo/Branding */}
                            <div className="mb-8 animate-fade-in">
                                <div className="w-20 h-20 rounded-2xl bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center shadow-2xl shadow-indigo-500/30 mb-4 mx-auto">
                                    <Search className="w-10 h-10 text-white" />
                                </div>
                                <h1 className="text-3xl font-bold bg-gradient-to-r from-indigo-400 to-purple-400 bg-clip-text text-transparent">
                                    SIT Scholar
                                </h1>
                                <p className="text-gray-500 mt-2">Academic Search Engine</p>
                            </div>

                            <p className="text-gray-500 dark:text-gray-400 text-lg mb-8 max-w-lg leading-relaxed animate-slide-up">
                                Search SIT's official records, faculty details, and academic data with real-time web scraping.
                            </p>

                            {/* Search Box */}
                            <div className="w-full max-w-2xl animate-slide-up" style={{ animationDelay: '100ms' }}>
                                <div className="bg-white dark:bg-[#111] p-2 rounded-2xl shadow-xl border border-gray-100 dark:border-gray-800 flex items-center">
                                    <Search className="w-5 h-5 text-gray-400 ml-4" />
                                    <input
                                        type="text"
                                        value={input}
                                        onChange={(e) => setInput(e.target.value)}
                                        onKeyDown={(e) => {
                                            if (e.key === 'Enter') handleSubmit();
                                        }}
                                        placeholder="Search faculty, students, fees, syllabus..."
                                        className="w-full bg-transparent border-none focus:ring-0 px-4 py-4 text-lg text-gray-900 dark:text-white placeholder-gray-400 outline-none"
                                    />
                                    <div className="flex items-center gap-2 mr-2">
                                        <button
                                            onClick={startRecording}
                                            className="p-3 text-gray-400 hover:text-gray-600 dark:hover:text-white rounded-full hover:bg-gray-100 dark:hover:bg-white/10 transition-colors"
                                        >
                                            <Mic className="w-5 h-5" />
                                        </button>
                                        <button
                                            onClick={() => handleSubmit()}
                                            disabled={!input.trim()}
                                            className="p-3 bg-indigo-600 text-white rounded-full hover:bg-indigo-700 disabled:opacity-50 transition-all shadow-lg"
                                        >
                                            <ArrowUp className="w-5 h-5" />
                                        </button>
                                    </div>
                                </div>
                            </div>

                            {/* Quick Searches */}
                            <div className="flex flex-wrap justify-center gap-2 mt-6 animate-slide-up" style={{ animationDelay: '200ms' }}>
                                {[
                                    "MCA HOD details",
                                    "Fee structure",
                                    "Principal of SIT",
                                    "MCA faculty list"
                                ].map((tag, i) => (
                                    <button
                                        key={i}
                                        onClick={() => onSendMessage(tag)}
                                        className="px-4 py-2 bg-white dark:bg-white/5 border border-gray-200 dark:border-gray-800 rounded-full text-sm text-gray-600 dark:text-gray-400 hover:border-indigo-400 hover:text-indigo-600 dark:hover:text-indigo-400 transition-all"
                                    >
                                        {tag}
                                    </button>
                                ))}
                            </div>
                        </div>
                    ) : (
                        messages.map((msg) => (
                            <div key={msg.id} className="mb-10 animate-slide-up">
                                {/* User Query */}
                                {msg.role === 'user' && (
                                    <div className="flex justify-end mb-4">
                                        <div className="bg-indigo-600 text-white px-5 py-3 rounded-2xl rounded-tr-sm max-w-[80%] shadow-lg">
                                            <p className="text-base font-medium">{msg.content}</p>
                                        </div>
                                    </div>
                                )}

                                {/* Model Response */}
                                {msg.role === 'model' && (
                                    <div className="relative">
                                        {/* Citations */}
                                        {renderCitations(msg.citations || [])}

                                        {/* Response Content */}
                                        <div className="flex gap-4">
                                            <div className="flex-shrink-0 hidden md:block">
                                                <div className="w-8 h-8 rounded-full bg-gradient-to-br from-indigo-500 to-purple-500 flex items-center justify-center shadow-lg">
                                                    <Sparkles className="w-4 h-4 text-white" />
                                                </div>
                                            </div>

                                            <div className="flex-1 min-w-0">
                                                <div className="prose prose-lg dark:prose-invert max-w-none text-gray-800 dark:text-gray-200">
                                                    <ReactMarkdown
                                                        remarkPlugins={[remarkGfm, remarkMath]}
                                                        rehypePlugins={[rehypeKatex]}
                                                        components={{
                                                            table: ({ node, ...props }) => (
                                                                <div className="overflow-hidden my-4 shadow-md rounded-xl border border-gray-200 dark:border-gray-800">
                                                                    <div className="overflow-x-auto">
                                                                        <table {...props} className="w-full text-sm" />
                                                                    </div>
                                                                </div>
                                                            ),
                                                            thead: ({ node, ...props }) => (
                                                                <thead {...props} className="bg-gray-50 dark:bg-gray-800/50 text-xs uppercase" />
                                                            ),
                                                            th: ({ node, ...props }) => (
                                                                <th {...props} className="px-4 py-3 font-semibold text-gray-600 dark:text-gray-300" />
                                                            ),
                                                            td: ({ node, ...props }) => (
                                                                <td {...props} className="px-4 py-3 border-b border-gray-100 dark:border-gray-800" />
                                                            ),
                                                            a: ({ node, ...props }) => (
                                                                <a {...props} target="_blank" rel="noopener noreferrer" className="text-indigo-500 hover:text-indigo-600 underline decoration-indigo-500/30" />
                                                            ),
                                                        }}
                                                    >
                                                        {msg.content}
                                                    </ReactMarkdown>
                                                </div>

                                                {/* Action Buttons */}
                                                <div className="mt-6 flex items-center gap-3">
                                                    <button
                                                        onClick={() => handleReadAloud(msg.content, msg.id)}
                                                        className={`flex items-center gap-2 px-4 py-2 rounded-full text-sm font-medium transition-all ${activeAudioId === msg.id
                                                            ? 'bg-indigo-500 text-white'
                                                            : 'bg-gray-100 dark:bg-white/10 text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-white/20'
                                                            }`}
                                                    >
                                                        {activeAudioId === msg.id && audioStatus === 'loading' ? (
                                                            <>
                                                                <Loader2 className="w-4 h-4 animate-spin" />
                                                                Loading...
                                                            </>
                                                        ) : activeAudioId === msg.id && audioStatus === 'playing' ? (
                                                            <>
                                                                <Pause className="w-4 h-4" />
                                                                Pause
                                                            </>
                                                        ) : activeAudioId === msg.id && audioStatus === 'paused' ? (
                                                            <>
                                                                <Play className="w-4 h-4" />
                                                                Resume
                                                            </>
                                                        ) : (
                                                            <>
                                                                <Volume2 className="w-4 h-4" />
                                                                Read Aloud
                                                            </>
                                                        )}
                                                    </button>

                                                    {activeAudioId === msg.id && audioStatus !== 'idle' && (
                                                        <button
                                                            onClick={stopAudio}
                                                            className="p-2 rounded-full bg-red-100 dark:bg-red-500/20 text-red-500 hover:bg-red-200 dark:hover:bg-red-500/30 transition-colors"
                                                        >
                                                            <StopCircle className="w-4 h-4" />
                                                        </button>
                                                    )}
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                )}
                            </div>
                        ))
                    )}

                    {/* Loading State */}
                    {isLoading && (
                        <div className="mb-10 animate-pulse">
                            <div className="flex items-center gap-3 mb-4 text-indigo-500">
                                <RefreshCw className="w-5 h-5 animate-spin" />
                                <span className="text-sm font-medium">
                                    {searchStatus || 'Searching...'}
                                </span>
                            </div>
                            <div className="flex gap-4">
                                <div className="flex-shrink-0 hidden md:block">
                                    <div className="w-8 h-8 rounded-full bg-gray-200 dark:bg-gray-800 animate-pulse" />
                                </div>
                                <div className="flex-1 space-y-3">
                                    <div className="h-4 bg-gray-200 dark:bg-gray-800 rounded-full w-3/4" />
                                    <div className="h-4 bg-gray-200 dark:bg-gray-800 rounded-full w-1/2" />
                                    <div className="h-4 bg-gray-200 dark:bg-gray-800 rounded-full w-2/3" />
                                </div>
                            </div>
                        </div>
                    )}

                    <div ref={messagesEndRef} />
                </div>
            </div>

            {/* Bottom Input Bar */}
            {messages.length > 0 && (
                <div className="bg-gradient-to-t from-white via-white/95 to-transparent dark:from-black dark:via-black/95 pt-8 pb-6 px-4 sticky bottom-0">
                    <div className="max-w-3xl mx-auto">
                        <div className="bg-white dark:bg-[#111] rounded-2xl shadow-xl border border-gray-100 dark:border-gray-800">
                            {recordingState === 'idle' ? (
                                <form onSubmit={handleSubmit} className="flex items-end p-2">
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
                                        className="w-full bg-transparent text-gray-900 dark:text-white px-4 py-3 focus:outline-none resize-none max-h-[150px] min-h-[50px] placeholder-gray-400"
                                        rows={1}
                                    />
                                    <div className="flex items-center gap-2 pb-1 pr-1">
                                        <button
                                            onClick={startRecording}
                                            type="button"
                                            className="p-3 text-gray-400 hover:text-gray-600 dark:hover:text-white rounded-full hover:bg-gray-100 dark:hover:bg-white/10 transition-colors"
                                        >
                                            <Mic className="w-5 h-5" />
                                        </button>
                                        <button
                                            type="submit"
                                            disabled={!input.trim() || isLoading}
                                            className="p-3 bg-indigo-600 text-white rounded-full hover:bg-indigo-700 disabled:opacity-50 transition-all shadow-md"
                                        >
                                            <ArrowUp className="w-5 h-5" />
                                        </button>
                                    </div>
                                </form>
                            ) : (
                                <div className="flex items-center justify-between p-4 bg-red-50 dark:bg-red-500/10 rounded-2xl">
                                    <div className="flex items-center gap-3">
                                        {recordingState === 'recording' ? (
                                            <>
                                                <div className="w-3 h-3 bg-red-500 rounded-full animate-pulse" />
                                                <span className="text-red-600 dark:text-red-400 font-mono font-medium">
                                                    {formatTime(recordingDuration)}
                                                </span>
                                            </>
                                        ) : (
                                            <>
                                                <Loader2 className="w-5 h-5 text-indigo-500 animate-spin" />
                                                <span className="text-indigo-600 dark:text-indigo-400 font-medium">
                                                    Transcribing...
                                                </span>
                                            </>
                                        )}
                                    </div>
                                    <div className="flex items-center gap-2">
                                        <button
                                            onClick={cancelRecording}
                                            disabled={recordingState !== 'recording'}
                                            className="p-2 text-gray-500 hover:text-gray-700 dark:hover:text-white disabled:opacity-50"
                                        >
                                            <X className="w-5 h-5" />
                                        </button>
                                        <button
                                            onClick={stopAndTranscribe}
                                            disabled={recordingState !== 'recording'}
                                            className="p-3 bg-red-500 text-white rounded-full hover:bg-red-600 disabled:opacity-50 transition-colors"
                                        >
                                            <Square className="w-4 h-4 fill-current" />
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