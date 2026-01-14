import React, { useState, useRef, useEffect, useCallback } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import remarkMath from 'remark-math';
import rehypeKatex from 'rehype-katex';
import { Message, Role, SourceType, Citation } from '../types';
import {
    ArrowUp, Globe, Search, Mic, Square, X,
    Volume2, Loader2, Pause, Play, AudioLines, ExternalLink,
    Database, StopCircle, BookOpen
} from 'lucide-react';
import { transcribeAudio, generateSpeech } from '../services/geminiService';
import { LiveVoiceInterface } from './LiveVoiceInterface';

interface ChatInterfaceProps {
    messages: Message[];
    isLoading: boolean;
    canStop?: boolean;
    onStopGeneration?: () => void;
    onSendMessage: (content: string, enableWebSearch?: boolean) => void;
    onNewChat: () => void;
    userRole: Role;
    searchStatus?: string;
}

const blobToBase64 = (blob: Blob): Promise<string> => {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onloadend = () => {
            const result = reader.result as string;
            resolve(result.split(',')[1]);
        };
        reader.onerror = reject;
        reader.readAsDataURL(blob);
    });
};

function decodeBase64Audio(base64: string): Uint8Array {
    const binary = atob(base64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
        bytes[i] = binary.charCodeAt(i);
    }
    return bytes;
}

// Citation Component
const CitationCard: React.FC<{ citation: Citation; index: number }> = ({ citation, index }) => {
    const isInternal = citation.sourceType === SourceType.INTERNAL;

    return (
        <a
            href={citation.url || '#'}
            target={citation.url ? "_blank" : undefined}
            rel="noopener noreferrer"
            className={`flex items-start gap-3 p-3 rounded-lg border transition-all hover:shadow-md ${isInternal
                    ? 'border-blue-200 dark:border-blue-800 bg-blue-50 dark:bg-blue-900/20'
                    : 'border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800/50'
                }`}
        >
            <div className="flex-shrink-0 p-1.5 rounded bg-gray-100 dark:bg-gray-700 text-gray-500 dark:text-gray-400">
                {isInternal ? <Database className="w-4 h-4" /> : <Globe className="w-4 h-4" />}
            </div>
            <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                    <span className="text-xs font-bold text-gray-400">[{index + 1}]</span>
                    <span className="text-sm font-medium text-gray-800 dark:text-gray-200 truncate">
                        {citation.title}
                    </span>
                </div>
                {citation.snippet && (
                    <p className="text-xs text-gray-500 mt-1 line-clamp-2">{citation.snippet}</p>
                )}
                {citation.url && (
                    <div className="flex items-center gap-1 mt-1.5 text-xs text-blue-500">
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
    canStop,
    onStopGeneration,
    onSendMessage,
    onNewChat,
    userRole,
    searchStatus
}) => {
    const [input, setInput] = useState('');
    const [isLiveMode, setIsLiveMode] = useState(false);
    const [recordingState, setRecordingState] = useState<'idle' | 'recording' | 'transcribing'>('idle');
    const [recordingDuration, setRecordingDuration] = useState(0);
    const [activeAudioId, setActiveAudioId] = useState<string | null>(null);
    const [audioStatus, setAudioStatus] = useState<'idle' | 'loading' | 'playing' | 'paused'>('idle');

    const audioContextRef = useRef<AudioContext | null>(null);
    const audioSourceRef = useRef<AudioBufferSourceNode | null>(null);
    const audioBufferRef = useRef<AudioBuffer | null>(null);
    const startedAtRef = useRef(0);
    const pausedAtRef = useRef(0);
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
            textareaRef.current.style.height = `${Math.min(textareaRef.current.scrollHeight, 150)}px`;
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

    const stopAudio = useCallback(() => {
        if (audioSourceRef.current) {
            try { audioSourceRef.current.stop(); } catch { }
        }
        setAudioStatus('idle');
        setActiveAudioId(null);
        pausedAtRef.current = 0;
    }, []);

    const handleSubmit = (e?: React.FormEvent) => {
        e?.preventDefault();
        if (!input.trim() || isLoading) return;
        stopAudio();
        onSendMessage(input.trim());
        setInput('');
    };

    const startRecording = async () => {
        stopAudio();
        try {
            const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
            const recorder = new MediaRecorder(stream, { mimeType: 'audio/webm' });
            mediaRecorderRef.current = recorder;
            audioChunksRef.current = [];

            recorder.ondataavailable = (e) => {
                if (e.data.size > 0) audioChunksRef.current.push(e.data);
            };

            recorder.start();
            setRecordingState('recording');
        } catch (err) {
            console.error("Mic error:", err);
            alert("Could not access microphone. Please check permissions.");
        }
    };

    const stopAndTranscribe = async () => {
        if (!mediaRecorderRef.current || mediaRecorderRef.current.state === 'inactive') return;

        setRecordingState('transcribing');

        mediaRecorderRef.current.onstop = async () => {
            const blob = new Blob(audioChunksRef.current, { type: 'audio/webm' });
            mediaRecorderRef.current?.stream.getTracks().forEach(t => t.stop());

            try {
                const base64 = await blobToBase64(blob);
                const text = await transcribeAudio(base64);
                if (text) {
                    setInput(text);
                } else {
                    alert("Could not transcribe audio. Please try again.");
                }
            } catch (e) {
                console.error("Transcription failed:", e);
            }
            setRecordingState('idle');
        };

        mediaRecorderRef.current.stop();
    };

    const cancelRecording = () => {
        if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
            mediaRecorderRef.current.onstop = () => {
                mediaRecorderRef.current?.stream.getTracks().forEach(t => t.stop());
            };
            mediaRecorderRef.current.stop();
        }
        setRecordingState('idle');
    };

    const handleReadAloud = async (text: string, messageId: string) => {
        if (activeAudioId === messageId) {
            if (audioStatus === 'playing') {
                if (audioContextRef.current && audioSourceRef.current) {
                    pausedAtRef.current = audioContextRef.current.currentTime - startedAtRef.current;
                    try { audioSourceRef.current.stop(); } catch { }
                    setAudioStatus('paused');
                }
                return;
            } else if (audioStatus === 'paused') {
                playFromOffset(pausedAtRef.current);
                return;
            }
        }

        stopAudio();
        setActiveAudioId(messageId);
        setAudioStatus('loading');

        try {
            const base64Audio = await generateSpeech(text);
            if (!base64Audio) throw new Error("TTS failed");

            if (!audioContextRef.current) {
                audioContextRef.current = new AudioContext({ sampleRate: 24000 });
            }
            const ctx = audioContextRef.current;
            if (ctx.state === 'suspended') await ctx.resume();

            const audioBytes = decodeBase64Audio(base64Audio);
            const int16 = new Int16Array(audioBytes.buffer);
            const buffer = ctx.createBuffer(1, int16.length, 24000);
            const channel = buffer.getChannelData(0);
            for (let i = 0; i < int16.length; i++) {
                channel[i] = int16[i] / 32768;
            }

            audioBufferRef.current = buffer;
            playFromOffset(0);
        } catch (e) {
            console.error("TTS error:", e);
            setAudioStatus('idle');
            setActiveAudioId(null);
        }
    };

    const playFromOffset = (offset: number) => {
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

    const formatTime = (s: number) => `${Math.floor(s / 60)}:${(s % 60).toString().padStart(2, '0')}`;

    if (isLiveMode) {
        return <LiveVoiceInterface onClose={() => setIsLiveMode(false)} />;
    }

    return (
        <div className="flex-1 flex flex-col h-full bg-gray-50 dark:bg-[#0a0a0b] transition-colors relative">

            {/* Top Actions */}
            <div className="absolute top-6 right-6 z-20 flex items-center gap-3">
                <button
                    onClick={() => setIsLiveMode(true)}
                    className="flex items-center gap-2 px-4 py-2.5 bg-blue-600 text-white hover:bg-blue-700 rounded-full shadow-lg transition-all"
                >
                    <AudioLines className="w-4 h-4" />
                    <span className="text-sm font-medium hidden sm:inline">Live Voice</span>
                </button>
            </div>

            {/* Messages */}
            <div className="flex-1 overflow-y-auto">
                <div className="max-w-4xl mx-auto p-4 md:p-8 pb-40">

                    {messages.length === 0 ? (
                        <div className="min-h-[60vh] flex flex-col items-center justify-center text-center px-4">
                            <div className="w-16 h-16 rounded-2xl bg-blue-600 flex items-center justify-center shadow-xl mb-6">
                                <Search className="w-8 h-8 text-white" />
                            </div>
                            <h1 className="text-2xl font-bold text-gray-800 dark:text-white mb-2">
                                SIT Scholar
                            </h1>
                            <p className="text-gray-500 mb-8 max-w-md">
                                Your intelligent academic assistant for Siddaganga Institute of Technology
                            </p>

                            <div className="w-full max-w-xl">
                                <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-lg border border-gray-200 dark:border-gray-700 p-2 flex items-center">
                                    <Search className="w-5 h-5 text-gray-400 ml-4" />
                                    <input
                                        type="text"
                                        value={input}
                                        onChange={(e) => setInput(e.target.value)}
                                        onKeyDown={(e) => e.key === 'Enter' && handleSubmit()}
                                        placeholder="Ask about faculty, fees, admissions..."
                                        className="flex-1 bg-transparent px-4 py-3 text-gray-800 dark:text-white placeholder-gray-400 outline-none"
                                    />
                                    <button
                                        onClick={startRecording}
                                        className="p-3 text-gray-400 hover:text-gray-600 dark:hover:text-white rounded-full hover:bg-gray-100 dark:hover:bg-gray-700"
                                    >
                                        <Mic className="w-5 h-5" />
                                    </button>
                                    <button
                                        onClick={() => handleSubmit()}
                                        disabled={!input.trim()}
                                        className="p-3 bg-blue-600 text-white rounded-full hover:bg-blue-700 disabled:opacity-50 ml-1"
                                    >
                                        <ArrowUp className="w-5 h-5" />
                                    </button>
                                </div>
                            </div>

                            <div className="flex flex-wrap justify-center gap-2 mt-6">
                                {["Who is the MCA HOD?", "Fee structure", "Admission process"].map((q) => (
                                    <button
                                        key={q}
                                        onClick={() => onSendMessage(q)}
                                        className="px-4 py-2 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-full text-sm text-gray-600 dark:text-gray-400 hover:border-blue-400 hover:text-blue-600 transition-all"
                                    >
                                        {q}
                                    </button>
                                ))}
                            </div>
                        </div>
                    ) : (
                        messages.map((msg) => (
                            <div key={msg.id} className="mb-8">
                                {msg.role === 'user' && (
                                    <div className="flex justify-end mb-4">
                                        <div className="bg-blue-600 text-white px-4 py-3 rounded-2xl rounded-tr-sm max-w-[80%]">
                                            <p>{msg.content}</p>
                                        </div>
                                    </div>
                                )}

                                {msg.role === 'model' && (
                                    <div>
                                        {/* Citations */}
                                        {msg.citations && msg.citations.length > 0 && (
                                            <div className="mb-4">
                                                <div className="flex items-center gap-2 mb-2">
                                                    <BookOpen className="w-4 h-4 text-gray-400" />
                                                    <span className="text-xs font-medium text-gray-500 uppercase">
                                                        Sources ({msg.citations.length})
                                                    </span>
                                                </div>
                                                <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                                                    {msg.citations.slice(0, 4).map((c, i) => (
                                                        <CitationCard key={i} citation={c} index={i} />
                                                    ))}
                                                </div>
                                            </div>
                                        )}

                                        {/* Response */}
                                        <div className="prose prose-gray dark:prose-invert max-w-none">
                                            <ReactMarkdown
                                                remarkPlugins={[remarkGfm, remarkMath]}
                                                rehypePlugins={[rehypeKatex]}
                                                components={{
                                                    table: ({ children }) => (
                                                        <div className="overflow-x-auto my-4 rounded-lg border border-gray-200 dark:border-gray-700">
                                                            <table className="w-full text-sm">{children}</table>
                                                        </div>
                                                    ),
                                                    th: ({ children }) => (
                                                        <th className="px-4 py-2 bg-gray-100 dark:bg-gray-800 text-left font-semibold">{children}</th>
                                                    ),
                                                    td: ({ children }) => (
                                                        <td className="px-4 py-2 border-t border-gray-200 dark:border-gray-700">{children}</td>
                                                    ),
                                                }}
                                            >
                                                {msg.content}
                                            </ReactMarkdown>
                                        </div>

                                        {/* Audio Controls */}
                                        <div className="mt-4 flex items-center gap-2">
                                            <button
                                                onClick={() => handleReadAloud(msg.content, msg.id)}
                                                className={`flex items-center gap-2 px-4 py-2 rounded-full text-sm font-medium transition-all ${activeAudioId === msg.id
                                                        ? 'bg-blue-600 text-white'
                                                        : 'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700'
                                                    }`}
                                            >
                                                {activeAudioId === msg.id && audioStatus === 'loading' ? (
                                                    <><Loader2 className="w-4 h-4 animate-spin" /> Loading...</>
                                                ) : activeAudioId === msg.id && audioStatus === 'playing' ? (
                                                    <><Pause className="w-4 h-4" /> Pause</>
                                                ) : activeAudioId === msg.id && audioStatus === 'paused' ? (
                                                    <><Play className="w-4 h-4" /> Resume</>
                                                ) : (
                                                    <><Volume2 className="w-4 h-4" /> Read Aloud</>
                                                )}
                                            </button>
                                            {activeAudioId === msg.id && audioStatus !== 'idle' && (
                                                <button
                                                    onClick={stopAudio}
                                                    className="p-2 rounded-full bg-red-100 dark:bg-red-900/30 text-red-500"
                                                >
                                                    <StopCircle className="w-4 h-4" />
                                                </button>
                                            )}
                                        </div>
                                    </div>
                                )}
                            </div>
                        ))
                    )}

                    {/* Loading */}
                    {isLoading && (
                        <div className="mb-8">
                            <div className="flex items-center gap-3 text-blue-600 mb-4">
                                <Loader2 className="w-5 h-5 animate-spin" />
                                <span className="text-sm">{searchStatus || 'Thinking...'}</span>
                                {canStop && onStopGeneration && (
                                    <button
                                        onClick={onStopGeneration}
                                        className="ml-auto flex items-center gap-1 px-3 py-1 bg-red-100 dark:bg-red-900/30 text-red-600 rounded-full text-sm hover:bg-red-200"
                                    >
                                        <StopCircle className="w-4 h-4" />
                                        Stop
                                    </button>
                                )}
                            </div>
                            <div className="space-y-2 animate-pulse">
                                <div className="h-4 bg-gray-200 dark:bg-gray-800 rounded w-3/4" />
                                <div className="h-4 bg-gray-200 dark:bg-gray-800 rounded w-1/2" />
                            </div>
                        </div>
                    )}

                    <div ref={messagesEndRef} />
                </div>
            </div>

            {/* Input Bar */}
            {messages.length > 0 && (
                <div className="bg-gradient-to-t from-gray-50 via-gray-50/95 dark:from-[#0a0a0b] dark:via-[#0a0a0b]/95 to-transparent pt-6 pb-6 px-4 sticky bottom-0">
                    <div className="max-w-3xl mx-auto">
                        <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-lg border border-gray-200 dark:border-gray-700">
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
                                        placeholder="Ask a question..."
                                        className="flex-1 bg-transparent px-4 py-3 text-gray-800 dark:text-white placeholder-gray-400 outline-none resize-none max-h-32"
                                        rows={1}
                                    />
                                    <button
                                        type="button"
                                        onClick={startRecording}
                                        className="p-3 text-gray-400 hover:text-gray-600 dark:hover:text-white rounded-full hover:bg-gray-100 dark:hover:bg-gray-700"
                                    >
                                        <Mic className="w-5 h-5" />
                                    </button>
                                    <button
                                        type="submit"
                                        disabled={!input.trim() || isLoading}
                                        className="p-3 bg-blue-600 text-white rounded-full hover:bg-blue-700 disabled:opacity-50 ml-1"
                                    >
                                        <ArrowUp className="w-5 h-5" />
                                    </button>
                                </form>
                            ) : (
                                <div className="flex items-center justify-between p-4 bg-red-50 dark:bg-red-900/20 rounded-2xl">
                                    <div className="flex items-center gap-3">
                                        {recordingState === 'recording' ? (
                                            <>
                                                <div className="w-3 h-3 bg-red-500 rounded-full animate-pulse" />
                                                <span className="font-mono text-red-600">{formatTime(recordingDuration)}</span>
                                            </>
                                        ) : (
                                            <>
                                                <Loader2 className="w-5 h-5 text-blue-600 animate-spin" />
                                                <span className="text-blue-600">Transcribing...</span>
                                            </>
                                        )}
                                    </div>
                                    <div className="flex gap-2">
                                        <button
                                            onClick={cancelRecording}
                                            disabled={recordingState !== 'recording'}
                                            className="p-2 text-gray-500 hover:text-gray-700 disabled:opacity-50"
                                        >
                                            <X className="w-5 h-5" />
                                        </button>
                                        <button
                                            onClick={stopAndTranscribe}
                                            disabled={recordingState !== 'recording'}
                                            className="p-3 bg-red-500 text-white rounded-full hover:bg-red-600 disabled:opacity-50"
                                        >
                                            <Square className="w-4 h-4" />
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