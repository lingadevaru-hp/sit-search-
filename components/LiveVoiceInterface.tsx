import React, { useState, useRef, useEffect, useCallback } from 'react';
import { GoogleGenAI, Modality } from '@google/genai';
import { X, Mic, MicOff, Volume2, AlertCircle, RefreshCw, Radio } from 'lucide-react';
import { StorageService } from '../services/storageService';

interface LiveVoiceInterfaceProps {
    onClose: () => void;
}

// Use the API_KEY that's injected via vite.config.ts
const apiKey = process.env.API_KEY || process.env.GEMINI_API_KEY;

// Audio Visualizer Component
const AudioVisualizer: React.FC<{ isActive: boolean; color: string }> = ({ isActive, color }) => {
    const bars = 5;
    return (
        <div className="flex items-center justify-center gap-1 h-8">
            {Array.from({ length: bars }).map((_, i) => (
                <div
                    key={i}
                    className={`w-1 rounded-full transition-all duration-150 ${color}`}
                    style={{
                        height: isActive ? `${Math.random() * 24 + 8}px` : '4px',
                        animationDelay: `${i * 0.1}s`,
                        transition: 'height 0.15s ease-in-out',
                    }}
                />
            ))}
        </div>
    );
};

// Pulsing Ring Animation
const PulsingRing: React.FC<{ isActive: boolean; color: string }> = ({ isActive, color }) => {
    if (!isActive) return null;
    return (
        <>
            <div className={`absolute inset-0 rounded-full ${color} animate-ping opacity-20`} />
            <div className={`absolute inset-[-8px] rounded-full border-2 ${color} animate-pulse opacity-40`} />
            <div className={`absolute inset-[-16px] rounded-full border ${color} animate-pulse opacity-20`} style={{ animationDelay: '0.5s' }} />
        </>
    );
};

export const LiveVoiceInterface: React.FC<LiveVoiceInterfaceProps> = ({ onClose }) => {
    const [status, setStatus] = useState<'initializing' | 'connecting' | 'listening' | 'processing' | 'speaking' | 'error'>('initializing');
    const [isMuted, setIsMuted] = useState(false);
    const [errorMessage, setErrorMessage] = useState<string>('');
    const [retryCount, setRetryCount] = useState(0);
    const [debugLog, setDebugLog] = useState<string[]>([]);
    const [audioLevel, setAudioLevel] = useState(0);

    // Audio Contexts
    const inputContextRef = useRef<AudioContext | null>(null);
    const outputContextRef = useRef<AudioContext | null>(null);
    const analyserRef = useRef<AnalyserNode | null>(null);

    // Stream References
    const mediaStreamRef = useRef<MediaStream | null>(null);
    const workletNodeRef = useRef<AudioWorkletNode | null>(null);

    // Session
    const sessionRef = useRef<any>(null);
    const isMountedRef = useRef<boolean>(true);
    const aiRef = useRef<GoogleGenAI | null>(null);

    // Audio Queue for playback
    const audioQueueRef = useRef<AudioBuffer[]>([]);
    const isPlayingRef = useRef(false);
    const currentSourceRef = useRef<AudioBufferSourceNode | null>(null);

    const addLog = (msg: string) => {
        console.log(`[LiveMode] ${msg}`);
        setDebugLog(prev => [...prev.slice(-10), `${new Date().toLocaleTimeString()}: ${msg}`]);
    };

    // Decode base64 PCM to AudioBuffer
    const decodeAudioData = useCallback((base64: string): AudioBuffer | null => {
        try {
            const binaryString = atob(base64);
            const bytes = new Uint8Array(binaryString.length);
            for (let i = 0; i < binaryString.length; i++) {
                bytes[i] = binaryString.charCodeAt(i);
            }

            const int16 = new Int16Array(bytes.buffer);
            const ctx = outputContextRef.current;
            if (!ctx) return null;

            const buffer = ctx.createBuffer(1, int16.length, 24000);
            const channelData = buffer.getChannelData(0);
            for (let i = 0; i < int16.length; i++) {
                channelData[i] = int16[i] / 32768.0;
            }
            return buffer;
        } catch (e) {
            addLog(`Audio decode error: ${e}`);
            return null;
        }
    }, []);

    // Play audio queue
    const playNextInQueue = useCallback(() => {
        if (!outputContextRef.current || audioQueueRef.current.length === 0) {
            isPlayingRef.current = false;
            if (status === 'speaking') {
                setStatus('listening');
            }
            return;
        }

        isPlayingRef.current = true;
        setStatus('speaking');

        const buffer = audioQueueRef.current.shift()!;
        const source = outputContextRef.current.createBufferSource();
        source.buffer = buffer;
        source.connect(outputContextRef.current.destination);

        source.onended = () => {
            currentSourceRef.current = null;
            playNextInQueue();
        };

        currentSourceRef.current = source;
        source.start(0);
    }, [status]);

    // Enqueue audio for playback
    const enqueueAudio = useCallback((base64: string) => {
        const buffer = decodeAudioData(base64);
        if (buffer) {
            audioQueueRef.current.push(buffer);
            addLog(`Audio queued (${buffer.duration.toFixed(2)}s)`);

            if (!isPlayingRef.current) {
                playNextInQueue();
            }
        }
    }, [decodeAudioData, playNextInQueue]);

    // Stop all audio
    const stopAudio = useCallback(() => {
        if (currentSourceRef.current) {
            try {
                currentSourceRef.current.stop();
            } catch (e) { }
            currentSourceRef.current = null;
        }
        audioQueueRef.current = [];
        isPlayingRef.current = false;
    }, []);

    // Cleanup
    const cleanup = useCallback(async () => {
        addLog('Cleaning up...');
        stopAudio();

        if (workletNodeRef.current) {
            try { workletNodeRef.current.disconnect(); } catch (e) { }
            workletNodeRef.current = null;
        }

        if (mediaStreamRef.current) {
            mediaStreamRef.current.getTracks().forEach(t => t.stop());
            mediaStreamRef.current = null;
        }

        if (inputContextRef.current?.state !== 'closed') {
            try { await inputContextRef.current?.close(); } catch (e) { }
        }
        if (outputContextRef.current?.state !== 'closed') {
            try { await outputContextRef.current?.close(); } catch (e) { }
        }

        inputContextRef.current = null;
        outputContextRef.current = null;

        if (sessionRef.current) {
            try {
                if (typeof sessionRef.current.close === 'function') {
                    await sessionRef.current.close();
                }
            } catch (e) { }
            sessionRef.current = null;
        }
    }, [stopAudio]);

    // Convert Float32 to Int16 PCM
    const floatTo16BitPCM = (float32Array: Float32Array): Int16Array => {
        const int16 = new Int16Array(float32Array.length);
        for (let i = 0; i < float32Array.length; i++) {
            const s = Math.max(-1, Math.min(1, float32Array[i]));
            int16[i] = s < 0 ? s * 0x8000 : s * 0x7FFF;
        }
        return int16;
    };

    // Start live session
    const startSession = useCallback(async () => {
        if (!isMountedRef.current) return;

        try {
            setStatus('connecting');
            setErrorMessage('');
            addLog('Starting session...');

            // Initialize AI
            if (!aiRef.current) {
                if (!apiKey) throw new Error('API key not configured');
                aiRef.current = new GoogleGenAI({ apiKey });
            }

            // Create audio contexts
            addLog('Creating audio contexts...');
            inputContextRef.current = new AudioContext({ sampleRate: 16000 });
            outputContextRef.current = new AudioContext({ sampleRate: 24000 });

            // Resume contexts (required by browsers)
            await inputContextRef.current.resume();
            await outputContextRef.current.resume();
            addLog('Audio contexts ready');

            // Get microphone
            addLog('Requesting microphone...');
            const stream = await navigator.mediaDevices.getUserMedia({
                audio: {
                    sampleRate: 16000,
                    channelCount: 1,
                    echoCancellation: true,
                    noiseSuppression: true,
                }
            });
            mediaStreamRef.current = stream;
            addLog('Microphone acquired');

            // Setup audio analyser for visual feedback
            analyserRef.current = inputContextRef.current.createAnalyser();
            analyserRef.current.fftSize = 256;
            const source = inputContextRef.current.createMediaStreamSource(stream);
            source.connect(analyserRef.current);

            // Audio level monitoring
            const dataArray = new Uint8Array(analyserRef.current.frequencyBinCount);
            const updateLevel = () => {
                if (!isMountedRef.current || !analyserRef.current) return;
                analyserRef.current.getByteFrequencyData(dataArray);
                const avg = dataArray.reduce((a, b) => a + b, 0) / dataArray.length;
                setAudioLevel(avg / 255);
                requestAnimationFrame(updateLevel);
            };
            updateLevel();

            // Prepare system instruction
            const docs = StorageService.getDocuments();
            const contextText = docs.slice(0, 2).map(d => `${d.title}: ${d.content.substring(0, 500)}`).join('\n');

            const systemInstruction = `You are SIT Scholar Voice Assistant for Siddaganga Institute of Technology.
Keep responses SHORT and conversational (1-2 sentences).
Use the knowledge base when relevant:
${contextText}

Speak naturally and concisely. Don't read out tables - summarize key points.`;

            addLog('Connecting to Gemini Live...');

            // Connect to Gemini Live API
            const session = await aiRef.current.live.connect({
                model: 'gemini-2.0-flash-live-001',
                callbacks: {
                    onopen: () => {
                        addLog('Session opened!');
                        if (!isMountedRef.current) return;
                        setStatus('listening');
                        setRetryCount(0);
                        startAudioCapture();
                    },
                    onmessage: (message: any) => {
                        if (!isMountedRef.current) return;

                        // Check for audio response
                        const parts = message.serverContent?.modelTurn?.parts || [];
                        for (const part of parts) {
                            if (part.inlineData?.data && part.inlineData?.mimeType?.includes('audio')) {
                                addLog('Received audio response');
                                enqueueAudio(part.inlineData.data);
                            }
                            if (part.text) {
                                addLog(`Text: ${part.text.substring(0, 50)}...`);
                            }
                        }

                        // Check for turn complete
                        if (message.serverContent?.turnComplete) {
                            addLog('Turn complete');
                        }

                        // Check for interruption
                        if (message.serverContent?.interrupted) {
                            addLog('Interrupted');
                            stopAudio();
                            setStatus('listening');
                        }
                    },
                    onclose: () => {
                        addLog('Session closed');
                        if (isMountedRef.current && status !== 'error') {
                            setStatus('error');
                            setErrorMessage('Connection closed');
                        }
                    },
                    onerror: (e: any) => {
                        addLog(`Error: ${e?.message || e}`);
                        if (isMountedRef.current) {
                            setStatus('error');
                            setErrorMessage(e?.message || 'Connection error');
                        }
                    }
                },
                config: {
                    responseModalities: [Modality.AUDIO],
                    speechConfig: {
                        voiceConfig: {
                            prebuiltVoiceConfig: { voiceName: 'Kore' }
                        }
                    },
                    systemInstruction: systemInstruction,
                }
            });

            sessionRef.current = session;
            addLog('Session connected');

        } catch (e: any) {
            addLog(`Start error: ${e.message}`);
            setStatus('error');
            setErrorMessage(e.message);
            cleanup();
        }
    }, [cleanup, enqueueAudio, stopAudio, status]);

    // Start capturing and sending audio
    const startAudioCapture = useCallback(() => {
        if (!inputContextRef.current || !mediaStreamRef.current || !sessionRef.current) {
            addLog('Cannot start capture - missing resources');
            return;
        }

        addLog('Starting audio capture...');
        const ctx = inputContextRef.current;
        const source = ctx.createMediaStreamSource(mediaStreamRef.current);

        // Use ScriptProcessor for compatibility
        const processor = ctx.createScriptProcessor(4096, 1, 1);

        processor.onaudioprocess = (e) => {
            if (isMuted || !sessionRef.current || status === 'speaking') return;

            const inputData = e.inputBuffer.getChannelData(0);
            const int16Data = floatTo16BitPCM(inputData);

            // Convert to base64
            const uint8 = new Uint8Array(int16Data.buffer);
            let binary = '';
            for (let i = 0; i < uint8.length; i++) {
                binary += String.fromCharCode(uint8[i]);
            }
            const base64 = btoa(binary);

            try {
                sessionRef.current.sendRealtimeInput({
                    media: {
                        mimeType: 'audio/pcm;rate=16000',
                        data: base64
                    }
                });
            } catch (e) {
                // Ignore send errors during cleanup
            }
        };

        source.connect(processor);
        processor.connect(ctx.destination);
        addLog('Audio capture started');
    }, [isMuted, status]);

    // Retry handler
    const handleRetry = useCallback(async () => {
        if (retryCount >= 3) {
            setErrorMessage('Maximum retries reached');
            return;
        }
        setRetryCount(prev => prev + 1);
        await cleanup();
        await new Promise(r => setTimeout(r, 1000));
        if (isMountedRef.current) {
            startSession();
        }
    }, [retryCount, cleanup, startSession]);

    // Lifecycle
    useEffect(() => {
        isMountedRef.current = true;

        const timer = setTimeout(() => {
            if (isMountedRef.current) {
                startSession();
            }
        }, 200);

        return () => {
            isMountedRef.current = false;
            clearTimeout(timer);
            cleanup();
        };
    }, []);

    const handleClose = async () => {
        await cleanup();
        onClose();
    };

    const getStatusConfig = () => {
        switch (status) {
            case 'initializing':
            case 'connecting':
                return {
                    text: status === 'initializing' ? 'Initializing...' : 'Connecting...',
                    color: 'text-yellow-400',
                    bgColor: 'bg-yellow-500/20',
                    ringColor: 'border-yellow-500/30',
                    icon: <RefreshCw className="w-12 h-12 text-yellow-400 animate-spin" />,
                };
            case 'listening':
                return {
                    text: isMuted ? 'Muted' : 'Listening...',
                    color: 'text-green-400',
                    bgColor: 'bg-green-500/20',
                    ringColor: 'border-green-500/30',
                    icon: <Mic className={`w-12 h-12 ${isMuted ? 'text-red-400' : 'text-green-400'}`} />,
                };
            case 'processing':
                return {
                    text: 'Processing...',
                    color: 'text-blue-400',
                    bgColor: 'bg-blue-500/20',
                    ringColor: 'border-blue-500/30',
                    icon: <Radio className="w-12 h-12 text-blue-400 animate-pulse" />,
                };
            case 'speaking':
                return {
                    text: 'Speaking...',
                    color: 'text-indigo-400',
                    bgColor: 'bg-indigo-500',
                    ringColor: 'border-indigo-500',
                    icon: <Volume2 className="w-12 h-12 text-white animate-pulse" />,
                };
            case 'error':
                return {
                    text: 'Error',
                    color: 'text-red-400',
                    bgColor: 'bg-red-500/20',
                    ringColor: 'border-red-500/30',
                    icon: <AlertCircle className="w-12 h-12 text-red-400" />,
                };
            default:
                return {
                    text: 'Unknown',
                    color: 'text-gray-400',
                    bgColor: 'bg-gray-800',
                    ringColor: 'border-gray-700',
                    icon: <Mic className="w-12 h-12 text-gray-400" />,
                };
        }
    };

    const config = getStatusConfig();

    return (
        <div className="absolute inset-0 z-50 bg-gradient-to-b from-[#0a0a0b] to-[#1a1a2e] flex flex-col items-center justify-center">
            {/* Close button */}
            <button
                onClick={handleClose}
                className="absolute top-6 right-6 p-3 text-gray-400 hover:text-white bg-white/5 hover:bg-white/10 rounded-full transition-all"
            >
                <X className="w-6 h-6" />
            </button>

            {/* Main content */}
            <div className="flex flex-col items-center space-y-8">
                {/* Title */}
                <div className="text-center space-y-2">
                    <h2 className="text-3xl font-bold bg-gradient-to-r from-indigo-400 to-purple-400 bg-clip-text text-transparent">
                        Live Voice
                    </h2>
                    <p className={`text-lg font-medium ${config.color}`}>
                        {config.text}
                    </p>
                    {errorMessage && (
                        <p className="text-sm text-red-400/80 max-w-xs">
                            {errorMessage}
                        </p>
                    )}
                </div>

                {/* Visualizer orb */}
                <div className="relative">
                    {/* Outer rings */}
                    <PulsingRing
                        isActive={status === 'listening' || status === 'speaking'}
                        color={status === 'speaking' ? 'border-indigo-500' : 'border-green-500'}
                    />

                    {/* Main orb */}
                    <div
                        className={`relative w-40 h-40 rounded-full flex items-center justify-center transition-all duration-300 ${config.bgColor}`}
                        style={{
                            transform: status === 'speaking' ? 'scale(1.1)' : 'scale(1)',
                            boxShadow: status === 'speaking'
                                ? '0 0 60px rgba(99, 102, 241, 0.5), 0 0 120px rgba(99, 102, 241, 0.3)'
                                : status === 'listening'
                                    ? `0 0 ${30 + audioLevel * 50}px rgba(74, 222, 128, ${0.2 + audioLevel * 0.3})`
                                    : 'none',
                        }}
                    >
                        {config.icon}
                    </div>

                    {/* Audio level indicator */}
                    {status === 'listening' && !isMuted && (
                        <div
                            className="absolute inset-0 rounded-full border-2 border-green-400/50 transition-transform"
                            style={{ transform: `scale(${1 + audioLevel * 0.3})` }}
                        />
                    )}
                </div>

                {/* Audio visualizer bars */}
                <div className="h-8 flex items-center">
                    {(status === 'listening' || status === 'speaking') && (
                        <div className="flex items-end gap-1">
                            {[1, 2, 3, 4, 5, 4, 3, 2, 1].map((h, i) => (
                                <div
                                    key={i}
                                    className={`w-1.5 rounded-full transition-all ${status === 'speaking' ? 'bg-indigo-400' : 'bg-green-400'
                                        }`}
                                    style={{
                                        height: `${(status === 'speaking' ? Math.random() * 20 + 10 : audioLevel * 30 * h / 5 + 4)}px`,
                                        transition: 'height 0.1s ease-out',
                                    }}
                                />
                            ))}
                        </div>
                    )}
                </div>

                {/* Controls */}
                <div className="flex gap-4">
                    {status === 'error' ? (
                        <button
                            onClick={handleRetry}
                            disabled={retryCount >= 3}
                            className="px-6 py-3 rounded-full bg-indigo-600 text-white hover:bg-indigo-700 transition-all disabled:opacity-50 flex items-center gap-2 font-medium"
                        >
                            <RefreshCw className="w-5 h-5" />
                            Retry {retryCount > 0 && `(${retryCount}/3)`}
                        </button>
                    ) : (
                        <button
                            onClick={() => setIsMuted(!isMuted)}
                            disabled={status !== 'listening' && status !== 'speaking'}
                            className={`p-4 rounded-full transition-all disabled:opacity-50 ${isMuted
                                ? 'bg-red-500 text-white'
                                : 'bg-white/10 text-white hover:bg-white/20'
                                }`}
                        >
                            {isMuted ? <MicOff className="w-6 h-6" /> : <Mic className="w-6 h-6" />}
                        </button>
                    )}
                    <button
                        onClick={handleClose}
                        className="p-4 rounded-full bg-white/10 text-red-400 hover:bg-red-500/20 hover:text-red-300 transition-all"
                    >
                        <X className="w-6 h-6" />
                    </button>
                </div>

                {/* Instructions */}
                <p className="text-gray-500 text-sm text-center max-w-xs">
                    {status === 'listening'
                        ? 'Speak naturally. I\'ll respond with voice.'
                        : status === 'speaking'
                            ? 'Listening... You can interrupt anytime.'
                            : status === 'error'
                                ? 'Something went wrong. Please try again.'
                                : 'Setting up voice connection...'}
                </p>

                {/* Debug log (hidden in production) */}
                {process.env.NODE_ENV === 'development' && (
                    <div className="absolute bottom-4 left-4 right-4 max-h-32 overflow-y-auto bg-black/50 rounded-lg p-2 text-xs text-gray-400 font-mono">
                        {debugLog.map((log, i) => (
                            <div key={i}>{log}</div>
                        ))}
                    </div>
                )}
            </div>
        </div>
    );
};
