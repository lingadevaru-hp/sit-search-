import React, { useState, useRef, useEffect, useCallback } from 'react';
import { GoogleGenAI, LiveServerMessage, Modality } from '@google/genai';
import { X, Mic, MicOff, Volume2, AlertCircle, RefreshCw } from 'lucide-react';
import { StorageService } from '../services/storageService';

interface LiveVoiceInterfaceProps {
    onClose: () => void;
}

// Use the API_KEY that's injected via vite.config.ts
const apiKey = process.env.API_KEY || process.env.GEMINI_API_KEY;

// Helper to convert Float32Array to 16-bit PCM for Gemini
function createBlob(data: Float32Array): Blob {
    const l = data.length;
    const int16 = new Int16Array(l);
    for (let i = 0; i < l; i++) {
        int16[i] = Math.max(-1, Math.min(1, data[i])) * 32767;
    }
    return new Blob([int16], { type: 'audio/pcm' });
}

// Base64 decoding
function decode(base64: string) {
    const binaryString = atob(base64);
    const len = binaryString.length;
    const bytes = new Uint8Array(len);
    for (let i = 0; i < len; i++) {
        bytes[i] = binaryString.charCodeAt(i);
    }
    return bytes;
}

async function decodeAudioData(
    data: Uint8Array,
    ctx: AudioContext,
    sampleRate: number = 24000,
    numChannels: number = 1
): Promise<AudioBuffer> {
    const dataInt16 = new Int16Array(data.buffer);
    const frameCount = dataInt16.length / numChannels;
    const buffer = ctx.createBuffer(numChannels, frameCount, sampleRate);

    for (let channel = 0; channel < numChannels; channel++) {
        const channelData = buffer.getChannelData(channel);
        for (let i = 0; i < frameCount; i++) {
            channelData[i] = dataInt16[i * numChannels + channel] / 32768.0;
        }
    }
    return buffer;
}

export const LiveVoiceInterface: React.FC<LiveVoiceInterfaceProps> = ({ onClose }) => {
    const [status, setStatus] = useState<'initializing' | 'connecting' | 'connected' | 'error' | 'reconnecting'>('initializing');
    const [isMuted, setIsMuted] = useState(false);
    const [isSpeaking, setIsSpeaking] = useState(false);
    const [errorMessage, setErrorMessage] = useState<string>('');
    const [retryCount, setRetryCount] = useState(0);

    // Audio Contexts
    const inputContextRef = useRef<AudioContext | null>(null);
    const outputContextRef = useRef<AudioContext | null>(null);
    const outputNodeRef = useRef<GainNode | null>(null);

    // Stream References
    const mediaStreamRef = useRef<MediaStream | null>(null);
    const processorRef = useRef<ScriptProcessorNode | null>(null);
    const sourceRef = useRef<MediaStreamAudioSourceNode | null>(null);

    // Playback Queue
    const nextStartTimeRef = useRef<number>(0);
    const audioSourcesRef = useRef<Set<AudioBufferSourceNode>>(new Set());
    const sessionRef = useRef<any>(null);
    const isMountedRef = useRef<boolean>(true);
    const aiRef = useRef<GoogleGenAI | null>(null);

    // Cleanup function for audio resources
    const cleanupAudioResources = useCallback(() => {
        // Stop all audio playback
        audioSourcesRef.current.forEach(src => {
            try { src.stop(); } catch (e) { }
        });
        audioSourcesRef.current.clear();
        nextStartTimeRef.current = 0;

        // Disconnect audio nodes
        if (processorRef.current) {
            try { processorRef.current.disconnect(); } catch (e) { }
            processorRef.current = null;
        }
        if (sourceRef.current) {
            try { sourceRef.current.disconnect(); } catch (e) { }
            sourceRef.current = null;
        }

        // Stop media stream tracks
        if (mediaStreamRef.current) {
            mediaStreamRef.current.getTracks().forEach(t => {
                try { t.stop(); } catch (e) { }
            });
            mediaStreamRef.current = null;
        }

        // Close audio contexts
        if (inputContextRef.current && inputContextRef.current.state !== 'closed') {
            try { inputContextRef.current.close(); } catch (e) { }
            inputContextRef.current = null;
        }
        if (outputContextRef.current && outputContextRef.current.state !== 'closed') {
            try { outputContextRef.current.close(); } catch (e) { }
            outputContextRef.current = null;
        }
        outputNodeRef.current = null;
    }, []);

    // Cleanup session
    const cleanupSession = useCallback(async () => {
        if (sessionRef.current) {
            try {
                if (typeof sessionRef.current.close === 'function') {
                    await sessionRef.current.close();
                }
            } catch (e) {
                console.log("Session cleanup error (expected):", e);
            }
            sessionRef.current = null;
        }
    }, []);

    // Full cleanup
    const fullCleanup = useCallback(async () => {
        cleanupAudioResources();
        await cleanupSession();
    }, [cleanupAudioResources, cleanupSession]);

    const startSession = useCallback(async () => {
        if (!isMountedRef.current) return;

        try {
            setStatus('connecting');
            setErrorMessage('');

            // Initialize AI client if not already done
            if (!aiRef.current) {
                if (!apiKey) {
                    throw new Error('API key not configured');
                }
                aiRef.current = new GoogleGenAI({ apiKey });
            }

            // Initialize Audio Contexts with error handling
            try {
                inputContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 16000 });
                outputContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 24000 });
                outputNodeRef.current = outputContextRef.current.createGain();
                outputNodeRef.current.connect(outputContextRef.current.destination);
            } catch (audioError: any) {
                throw new Error(`Audio initialization failed: ${audioError.message}`);
            }

            // Resume audio contexts if suspended (required by some browsers)
            if (inputContextRef.current.state === 'suspended') {
                await inputContextRef.current.resume();
            }
            if (outputContextRef.current.state === 'suspended') {
                await outputContextRef.current.resume();
            }

            // Get Microphone with better error handling
            let stream: MediaStream;
            try {
                stream = await navigator.mediaDevices.getUserMedia({ audio: true });
                mediaStreamRef.current = stream;
            } catch (micError: any) {
                throw new Error(`Microphone access denied: ${micError.message}`);
            }

            // Prepare RAG Context based on internal docs
            const docs = StorageService.getDocuments();
            const contextText = docs.map(d => `[Internal Document: ${d.title}]\n${d.content}`).join('\n\n');
            const voiceSystemInstruction = `You are SIT Scholar, a helpful voice assistant.
            CRITICAL: Use the following knowledge base to answer questions about students (USN, DOB), faculty, and fees.
            If asked about a specific person, look them up.
            Keep responses concise for voice output.
            KNOWLEDGE BASE:
            ${contextText}`;

            // Connect to Gemini Live using the correct live model
            const session = await aiRef.current.live.connect({
                model: 'gemini-2.0-flash-live-001',
                callbacks: {
                    onopen: () => {
                        if (!isMountedRef.current) return;
                        console.log("Live session opened");
                        setStatus('connected');
                        setRetryCount(0); // Reset retry count on successful connection

                        // Setup Audio Input Stream
                        if (!inputContextRef.current || !mediaStreamRef.current) return;
                        const ctx = inputContextRef.current;

                        try {
                            sourceRef.current = ctx.createMediaStreamSource(mediaStreamRef.current);
                            processorRef.current = ctx.createScriptProcessor(4096, 1, 1);

                            processorRef.current.onaudioprocess = (e) => {
                                if (isMuted || !sessionRef.current) return;

                                const inputData = e.inputBuffer.getChannelData(0);
                                const pcmBlob = createBlob(inputData);

                                const reader = new FileReader();
                                reader.onloadend = () => {
                                    if (!sessionRef.current || !isMountedRef.current) return;
                                    const base64data = (reader.result as string).split(',')[1];
                                    try {
                                        sessionRef.current.sendRealtimeInput({
                                            media: {
                                                mimeType: 'audio/pcm;rate=16000',
                                                data: base64data
                                            }
                                        });
                                    } catch (sendError) {
                                        console.warn("Failed to send audio:", sendError);
                                    }
                                };
                                reader.readAsDataURL(pcmBlob);
                            };

                            sourceRef.current.connect(processorRef.current);
                            processorRef.current.connect(ctx.destination);
                        } catch (processorError) {
                            console.error("Audio processor setup failed:", processorError);
                        }
                    },
                    onmessage: async (message: LiveServerMessage) => {
                        if (!isMountedRef.current) return;

                        // Handle Audio Output
                        const base64Audio = message.serverContent?.modelTurn?.parts?.[0]?.inlineData?.data;
                        if (base64Audio && outputContextRef.current) {
                            setIsSpeaking(true);
                            const ctx = outputContextRef.current;

                            try {
                                const audioBuffer = await decodeAudioData(
                                    decode(base64Audio),
                                    ctx,
                                    24000
                                );

                                nextStartTimeRef.current = Math.max(nextStartTimeRef.current, ctx.currentTime);

                                const source = ctx.createBufferSource();
                                source.buffer = audioBuffer;
                                source.connect(outputNodeRef.current!);

                                source.onended = () => {
                                    audioSourcesRef.current.delete(source);
                                    if (audioSourcesRef.current.size === 0) setIsSpeaking(false);
                                };

                                source.start(nextStartTimeRef.current);
                                nextStartTimeRef.current += audioBuffer.duration;
                                audioSourcesRef.current.add(source);
                            } catch (audioError) {
                                console.error("Audio playback error:", audioError);
                            }
                        }

                        // Handle Interruptions
                        if (message.serverContent?.interrupted) {
                            audioSourcesRef.current.forEach(src => {
                                try { src.stop(); } catch (e) { }
                            });
                            audioSourcesRef.current.clear();
                            nextStartTimeRef.current = 0;
                            setIsSpeaking(false);
                        }
                    },
                    onclose: () => {
                        console.log("Live session closed");
                        if (isMountedRef.current && status === 'connected') {
                            // Unexpected close, might need to reconnect
                            setStatus('error');
                            setErrorMessage('Connection closed unexpectedly');
                        }
                    },
                    onerror: (e: any) => {
                        console.error("Live session error", e);
                        if (isMountedRef.current) {
                            const errorMsg = e?.message || e?.error?.message || 'Connection error';
                            setStatus('error');
                            setErrorMessage(errorMsg);
                        }
                    }
                },
                config: {
                    responseModalities: [Modality.AUDIO],
                    speechConfig: {
                        voiceConfig: { prebuiltVoiceConfig: { voiceName: 'Kore' } },
                    },
                    systemInstruction: voiceSystemInstruction,
                }
            });

            sessionRef.current = session;

        } catch (e: any) {
            console.error("Session start error:", e);
            if (isMountedRef.current) {
                setStatus('error');
                const errorMsg = e?.message || 'Failed to start live session';
                setErrorMessage(errorMsg);

                // Cleanup on error
                cleanupAudioResources();
            }
        }
    }, [isMuted, status, cleanupAudioResources]);

    // Handle retry
    const handleRetry = useCallback(async () => {
        if (retryCount >= 3) {
            setErrorMessage('Maximum retry attempts reached. Please try again later.');
            return;
        }

        setRetryCount(prev => prev + 1);
        setStatus('reconnecting');

        // Full cleanup before retry
        await fullCleanup();

        // Wait a bit before retrying (exponential backoff)
        const backoffMs = Math.min(1000 * Math.pow(2, retryCount), 5000);
        await new Promise(resolve => setTimeout(resolve, backoffMs));

        if (isMountedRef.current) {
            startSession();
        }
    }, [retryCount, fullCleanup, startSession]);

    useEffect(() => {
        isMountedRef.current = true;

        // Small delay to ensure component is fully mounted
        const initTimer = setTimeout(() => {
            if (isMountedRef.current) {
                startSession();
            }
        }, 100);

        return () => {
            isMountedRef.current = false;
            clearTimeout(initTimer);
            fullCleanup();
        };
    }, []);

    const toggleMute = () => {
        setIsMuted(!isMuted);
    };

    const handleClose = async () => {
        await fullCleanup();
        onClose();
    };

    const getStatusText = () => {
        switch (status) {
            case 'initializing': return 'Initializing...';
            case 'connecting': return 'Connecting...';
            case 'connected': return isMuted ? 'Muted' : 'Listening';
            case 'reconnecting': return 'Reconnecting...';
            case 'error': return 'Connection Error';
            default: return 'Unknown';
        }
    };

    const getStatusColor = () => {
        switch (status) {
            case 'connected': return 'text-green-400';
            case 'error': return 'text-red-400';
            case 'reconnecting': return 'text-yellow-400';
            default: return 'text-gray-400';
        }
    };

    return (
        <div className="absolute inset-0 z-50 bg-[#0f0f10] flex flex-col items-center justify-center animate-fade-in">
            <button
                onClick={handleClose}
                className="absolute top-6 right-6 p-3 text-gray-400 hover:text-white bg-white/10 rounded-full transition-colors"
            >
                <X className="w-6 h-6" />
            </button>

            <div className="flex flex-col items-center space-y-12">
                <div className="text-center space-y-2">
                    <h2 className="text-2xl font-semibold text-white">Live Conversation</h2>
                    <p className={`text-sm ${getStatusColor()}`}>
                        {getStatusText()}
                    </p>
                    {errorMessage && (
                        <p className="text-xs text-red-400/80 max-w-xs">
                            {errorMessage}
                        </p>
                    )}
                </div>

                {/* Visualizer Circle */}
                <div className="relative">
                    <div className={`w-32 h-32 rounded-full flex items-center justify-center transition-all duration-300 
                        ${status === 'error' ? 'bg-red-500/20' :
                            isSpeaking ? 'bg-indigo-500 scale-110 shadow-[0_0_50px_rgba(99,102,241,0.5)]' :
                                'bg-gray-800'}`}
                    >
                        {status === 'error' ? (
                            <AlertCircle className="w-12 h-12 text-red-400" />
                        ) : isSpeaking ? (
                            <Volume2 className="w-12 h-12 text-white animate-pulse" />
                        ) : (status === 'connecting' || status === 'reconnecting' || status === 'initializing') ? (
                            <RefreshCw className="w-12 h-12 text-gray-400 animate-spin" />
                        ) : (
                            <Mic className={`w-12 h-12 ${isMuted ? 'text-red-400' : 'text-white'}`} />
                        )}
                    </div>
                    {/* Ripple effect */}
                    {isSpeaking && (
                        <div className="absolute inset-0 rounded-full border-2 border-indigo-500/30 animate-ping"></div>
                    )}
                </div>

                <div className="flex gap-6">
                    {status === 'error' ? (
                        <button
                            onClick={handleRetry}
                            disabled={retryCount >= 3}
                            className="px-6 py-3 rounded-full bg-indigo-600 text-white hover:bg-indigo-700 transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                        >
                            <RefreshCw className="w-5 h-5" />
                            Retry {retryCount > 0 && `(${retryCount}/3)`}
                        </button>
                    ) : (
                        <button
                            onClick={toggleMute}
                            disabled={status !== 'connected'}
                            className={`p-4 rounded-full transition-all disabled:opacity-50 ${isMuted ? 'bg-red-500 text-white' : 'bg-gray-800 text-white hover:bg-gray-700'}`}
                        >
                            {isMuted ? <MicOff className="w-6 h-6" /> : <Mic className="w-6 h-6" />}
                        </button>
                    )}
                    <button
                        onClick={handleClose}
                        className="p-4 rounded-full bg-gray-800 text-red-400 hover:bg-gray-700 hover:text-red-300 transition-all"
                    >
                        <X className="w-6 h-6" />
                    </button>
                </div>

                <div className="max-w-md text-center">
                    <p className="text-gray-500 text-sm">
                        {status === 'connected'
                            ? 'Speak naturally. You can interrupt at any time.'
                            : status === 'error'
                                ? 'There was an issue connecting. Please try again.'
                                : 'Please wait while we establish the connection...'}
                    </p>
                </div>
            </div>
        </div>
    );
};
